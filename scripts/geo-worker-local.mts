/** Local-only process manager; does not restart Next or existing translation/notification workers. */
import { spawn, execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile, open, unlink, stat } from 'node:fs/promises'
import path from 'node:path'
const url = new URL(process.env.DATABASE_URL || '')
if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw new Error('Local worker manager only.')
const root = process.cwd(), dir = path.join(root, '.codex-runtime'), pidFile = path.join(dir, 'geo-article-worker.pid')
const script = path.join(root, 'scripts/run-geo-articles.mts'), heartbeat = path.join(dir, 'geo-article-worker.heartbeat')
let pid = 0, alive = false
try { pid = Number(await readFile(pidFile, 'utf8')); if (Number.isInteger(pid) && pid > 1) {
  process.kill(pid, 0); alive = execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' }).includes(script)
} } catch { /* An expired PID is not treated as the current worker. */ }
const command = process.argv[2]
if (command === 'status') {
  let fresh = false; try { fresh = Date.now() - (await stat(heartbeat)).mtimeMs < 35000 } catch { /* no heartbeat */ }
  console.log(JSON.stringify({ running: alive, ready: alive && fresh, pid: alive ? pid : null }))
} else if (command === 'start') {
  if (alive) { console.log('GEO worker is already running.'); process.exit(0) }
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const log = await open(path.join(dir, 'geo-article-worker.log'), 'a', 0o600)
  const child = spawn(process.execPath, ['--env-file=.env', '--import', path.join(root, 'scripts/verify-v1-node-style-hook.mjs'), '--import', 'tsx', script],
    { cwd: root, detached: true, env: { ...process.env, NODE_ENV: 'production', GEO_ARTICLE_WORKER_ENABLED: 'true' }, stdio: ['ignore', log.fd, log.fd] })
  await writeFile(pidFile, String(child.pid), { mode: 0o600 }); child.unref(); await log.close()
  console.log('GEO worker starting; inspect status for readiness.')
} else if (command === 'stop') {
  if (alive) process.kill(pid, 'SIGTERM')
  if (!alive) await unlink(pidFile).catch(() => {}); console.log('GEO worker stop requested.')
} else throw new Error('Use start, status or stop.')
