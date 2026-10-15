#!/usr/bin/env node
// Build an immutable candidate from a copied source tree, without runtime env or customer media.
import { createHash } from 'node:crypto'
import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync } from 'node:fs'
import { chmod, mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const writeJSON = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })

function options() {
  if (args[0] !== 'build') return null
  const result = { version: '', platform: 'linux/amd64', url: 'https://platform.example.invalid' }
  for (let index = 1; index < args.length; index += 2) {
    const name = args[index], value = args[index + 1]
    if (!['--version', '--platform', '--url'].includes(name) || !value)
      throw new Error('Use build --version v1-rc-YYYYMMDD-N [--platform linux/amd64|linux/arm64] [--url https://your-domain].')
    result[name.slice(2)] = value
  }
  if (!/^v1-rc-\d{8}-[a-z0-9][a-z0-9-]{0,30}$/.test(result.version))
    throw new Error('A unique candidate version is required: v1-rc-YYYYMMDD-N.')
  if (!['linux/amd64', 'linux/arm64'].includes(result.platform)) throw new Error('Unsupported image platform.')
  const url = new URL(result.url)
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash)
    throw new Error('The build URL must be an HTTPS origin without credentials, port or path.')
  result.url = url.origin
  return result
}

// Only these build inputs are copied; no .env, user .npmrc, private backup, live cache or uploads.
const rootFiles = ['Dockerfile', '.dockerignore', 'package.json', 'package-lock.json', 'pnpm-lock.yaml',
  'pnpm-workspace.yaml', 'next.config.ts', 'next-env.d.ts', 'tsconfig.json', 'redirects.ts',
  'postcss.config.js', 'tailwind.config.mjs', 'components.json', 'eslint.config.mjs',
  'next-sitemap.config.cjs', 'vitest.config.mts', 'vitest.setup.ts', 'playwright.config.ts']
const sourceDirs = ['src', 'scripts', 'public', 'tests']
const excluded = (relative) => relative === 'public/media' || relative.startsWith('public/media/') ||
  relative.split('/').some(part => part === '.DS_Store' || part === '.private' || part === 'node_modules' ||
    part === '.git' || part === '.codex-runtime' || part.startsWith('.next') || part.startsWith('.env')) ||
  /\.(?:log|tsbuildinfo|dump|backup|pem|key)$/.test(relative) ||
  /^public\/(?:robots\.txt|sitemap[^/]*\.xml)$/.test(relative)

async function snapshot(destination) {
  const files = []
  async function copy(relative) {
    if (excluded(relative)) return
    const source = path.join(root, relative), before = lstatSync(source)
    if (before.isSymbolicLink()) throw new Error(`Build input cannot be a symlink: ${relative}`)
    if (before.isDirectory()) {
      for (const name of (await readdir(source)).sort()) await copy(`${relative}/${name}`)
      return
    }
    if (!before.isFile()) throw new Error(`Unsupported build input: ${relative}`)
    const descriptor = openSync(source, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      const opened = fstatSync(descriptor), bytes = readFileSync(descriptor), after = fstatSync(descriptor)
      const current = lstatSync(source)
      if (opened.ino !== before.ino || opened.dev !== before.dev || current.ino !== before.ino ||
          current.isSymbolicLink() || bytes.length !== before.size || after.mtimeMs !== before.mtimeMs ||
          after.ctimeMs !== before.ctimeMs || current.mtimeMs !== before.mtimeMs || current.ctimeMs !== before.ctimeMs)
        throw new Error(`Build input changed while copying: ${relative}`)
      const target = path.join(destination, relative)
      await mkdir(path.dirname(target), { recursive: true, mode: 0o700 })
      await writeFile(target, bytes, { mode: before.mode & 0o111 ? 0o755 : 0o644 })
      files.push({ path: relative, bytes: bytes.length, sha256: sha(bytes) })
    } finally { closeSync(descriptor) }
  }
  for (const file of rootFiles) {
    try { lstatSync(path.join(root, file)) } catch (error) { if (error.code === 'ENOENT') continue; throw error }
    await copy(file)
  }
  for (const dir of sourceDirs) await copy(dir)
  files.sort((a, b) => a.path.localeCompare(b.path))
  return { files, sha256: sha(JSON.stringify(files)), exclusions: 'Runtime secrets, customer media, caches and backup files are not build inputs.' }
}

const dockerEnv = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG',
  'DOCKER_CERT_PATH', 'DOCKER_TLS_VERIFY', 'XDG_RUNTIME_DIR'].filter(key => process.env[key] !== undefined)
  .map(key => [key, process.env[key]]))

async function runDocker(command, logFile) {
  const output = openSync(logFile, 'wx', 0o600)
  try {
    await new Promise((resolve, reject) => {
      const child = spawn('docker', command, { cwd: root, env: dockerEnv, stdio: ['ignore', output, output] })
      child.once('error', reject)
      child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`Docker command failed (${code ?? signal}); see ${logFile}`)))
    })
  } finally { closeSync(output) }
}

let operation, report
try {
  const settings = options()
  if (!settings) {
    console.log('Usage: node scripts/platform-release.mjs build --version v1-rc-YYYYMMDD-N [--platform linux/amd64|linux/arm64] [--url https://platform-domain]')
    console.log('Builds and exports web, worker and migration images; does not start containers, connect the database, migrate or publish. Default URL is a candidate-only placeholder.')
    process.exit(0)
  }
  const privateDir = path.join(root, '.private')
  await mkdir(privateDir, { recursive: true, mode: 0o700 })
  if (lstatSync(privateDir).isSymbolicLink()) throw new Error('The private release parent must not be a symlink.')
  const releases = path.join(privateDir, 'releases')
  await mkdir(releases, { recursive: true, mode: 0o700 })
  if (lstatSync(releases).isSymbolicLink()) throw new Error('The release parent must not be a symlink.')
  operation = path.join(releases, settings.version)
  await mkdir(operation, { mode: 0o700 }) // Existing versions are never overwritten.
  const source = path.join(operation, 'source')
  await mkdir(source, { mode: 0o700 })
  report = { version: settings.version, platform: settings.platform, buildURL: settings.url,
    startedAt: new Date().toISOString(), state: 'copying-source', images: [],
    candidateOnly: true, productionDomainPending: settings.url.endsWith('.invalid'),
    applicationContainersStarted: false, databaseMigrationRun: false, customerDataCopied: false,
    browserAcceptance: 'delegated-to-user', releaseApproved: false }
  await writeJSON(path.join(operation, 'release.json'), report)
  const manifest = await snapshot(source)
  await writeJSON(path.join(operation, 'source-manifest.json'), manifest)
  report.sourceSHA256 = manifest.sha256
  report.sourceFiles = manifest.files.length
  const lock = JSON.parse(readFileSync(path.join(source, 'package-lock.json'), 'utf8'))
  const pkg = JSON.parse(readFileSync(path.join(source, 'package.json'), 'utf8'))
  for (const group of ['dependencies', 'devDependencies']) {
    const declared = pkg[group] || {}, locked = lock.packages[''][group] || {}
    if (JSON.stringify(Object.entries(declared).sort()) !== JSON.stringify(Object.entries(locked).sort()))
      throw new Error(`package-lock.json differs from package.json (${group}); fix the lock before building.`)
  }
  console.log(JSON.stringify({ phase: 'source-copied', version: settings.version, files: manifest.files.length, sourceSHA256: manifest.sha256 }))
  for (const [role, target] of [['web', 'runner'], ['worker', 'translation-worker'], ['migrator', 'migrator']]) {
    const tag = `novasite-${role}:${settings.version}`
    const existing = spawnSync('docker', ['image', 'inspect', tag], { env: dockerEnv, stdio: 'ignore' })
    if (existing.status === 0) throw new Error(`Image tag already exists; use a new version: ${tag}`)
    if (existing.error) throw existing.error
    report.state = `building-${role}`
    await writeJSON(path.join(operation, 'release.json'), report)
    console.log(JSON.stringify({ phase: report.state, tag, at: new Date().toISOString() }))
    await runDocker(['build', '--platform', settings.platform, '--target', target, '--progress=plain',
      '--build-arg', `NEXT_PUBLIC_SERVER_URL=${settings.url}`, '--label', `org.opencontainers.image.version=${settings.version}`,
      '--label', `com.novasite.source-sha256=${manifest.sha256}`, '-t', tag, source], path.join(operation, `build-${role}.log`))
    const inspection = spawnSync('docker', ['image', 'inspect', '--format', '{{json .}}', tag], { env: dockerEnv, encoding: 'utf8' })
    if (inspection.status !== 0) throw new Error('Built image metadata could not be read.')
    const image = JSON.parse(inspection.stdout)
    if (`${image.Os}/${image.Architecture}` !== settings.platform) throw new Error('Built image architecture differs from requested platform.')
    report.images.push({ role, tag, id: image.Id, platform: `${image.Os}/${image.Architecture}`, bytes: image.Size })
    console.log(JSON.stringify({ phase: 'image-built', role, id: image.Id }))
  }
  report.state = 'exporting-images'
  await writeJSON(path.join(operation, 'release.json'), report)
  const bundle = path.join(operation, 'images.tar')
  await runDocker(['image', 'save', '--output', bundle, ...report.images.map(image => image.tag)], path.join(operation, 'export.log'))
  await chmod(bundle, 0o600)
  const { createReadStream } = await import('node:fs')
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(bundle)) hash.update(chunk)
  report.bundle = { path: bundle, bytes: (await stat(bundle)).size, sha256: hash.digest('hex') }
  report.state = 'candidate-images-built-awaiting-user-acceptance'
  report.finishedAt = new Date().toISOString()
  await writeJSON(path.join(operation, 'release.json'), report)
  console.log(JSON.stringify(report))
} catch (error) {
  if (report && operation) {
    report.state = 'failed'; report.failure = error.message; report.finishedAt = new Date().toISOString()
    await writeJSON(path.join(operation, 'release.json'), report)
  }
  console.error(error.message)
  process.exitCode = 1
}
