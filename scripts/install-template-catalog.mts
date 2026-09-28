import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { randomUUID } from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import assert from 'node:assert/strict'
import { Pool } from 'pg'
import { getPayload } from 'payload'

import config from '../src/payload.config'
import { migrations } from '../src/migrations'
import { newTemplates } from '../src/platform/new-templates/registry'
import { applyTemplateChange, TemplateChangeError } from '../src/platform/new-templates/change-service'

if (process.env.NODE_ENV !== 'production') {
  throw new Error('Run with NODE_ENV=production so Payload cannot push the schema automatically.')
}

const migrationNames = [
  '20260927_010000_template_catalog_and_history',
  '20260927_010001_template_history_locked_document_relations',
]
const selectedMigrations = migrationNames.map((name) => {
  const migration = migrations.find((item) => item.name === name)
  if (!migration) throw new Error(`Migration ${name} is not registered.`)
  return migration
})

const backupPath = `/private/tmp/novasite-template-catalog-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${randomUUID().slice(0, 8)}.dump`
const databaseURL = process.env.DATABASE_URL
if (!databaseURL) throw new Error('DATABASE_URL is required.')

const makeBackup = async () => {
  const file = createWriteStream(backupPath, { flags: 'wx', mode: 0o600 })
  const dump = spawn('docker', [
    'compose', 'exec', '-T', 'postgres', 'pg_dump', '-U', 'novasite', '-d', 'novasite', '--format=custom',
  ], { stdio: ['ignore', 'pipe', 'pipe'] })
  const errors: Buffer[] = []
  dump.stderr.on('data', (chunk: Buffer) => errors.push(chunk))
  const exit = new Promise<number>((resolve, reject) => {
    dump.once('error', reject)
    dump.once('close', (code) => resolve(code ?? 1))
  })
  try {
    await pipeline(dump.stdout, file)
    const code = await exit
    if (code !== 0) throw new Error(`Database backup failed: ${Buffer.concat(errors).toString('utf8').slice(0, 500)}`)
  } catch (error) {
    dump.kill()
    await rm(backupPath, { force: true })
    throw error
  }
}

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const tableNames = [
  'tenants', 'templates', 'products', 'product_categories', 'news', 'news_categories',
  'cases', 'faqs', 'posts', 'media', 'leads', 'site_navigation', 'pages',
] as const

const readBaseline = async (pool: Pool) => {
  const tenantSelections = await pool.query(
    'SELECT id, selected_template_id, template_version, template_applied_at FROM tenants ORDER BY id',
  )
  const templateRows = await pool.query(
    'SELECT id, key, name, version, industry, status FROM templates ORDER BY id',
  )
  const counts: Record<string, number> = {}
  for (const table of tableNames) {
    const result = await pool.query(`SELECT count(*)::int AS count FROM "${table}"`)
    counts[table] = result.rows[0].count
  }
  return {
    selections: tenantSelections.rows,
    selectionsHash: digest(tenantSelections.rows),
    templateRows: templateRows.rows,
    templatesHash: digest(templateRows.rows),
    counts,
  }
}

const verifyTemplateHistory = async (payload: Awaited<ReturnType<typeof getPayload>>) => {
  const users = await payload.find({ collection: 'users', depth: 0, limit: 100, overrideAccess: true })
  const actor = users.docs.find((user) => user.roles?.includes('super-admin'))
  if (!actor) throw new Error('Template history verification requires a super-admin account.')
  const templates = await payload.find({
    collection: 'templates', depth: 0, limit: 2, overrideAccess: true,
    where: { key: { in: newTemplates.slice(0, 2).map((template) => template.key) } },
  })
  if (templates.docs.length !== 2) throw new Error('Two published templates are required for history verification.')

  const token = randomUUID().replaceAll('-', '')
  const createdTenantIDs: number[] = []
  try {
    const firstTenant = await payload.create({
      collection: 'tenants',
      locale: 'zh',
      overrideAccess: true,
      data: {
        name: `临时模板历史验证 ${token.slice(0, 8)}`,
        slug: `template-history-check-${token.slice(0, 12)}`,
        defaultLocale: 'zh',
        enabledLocales: ['zh'],
        status: 'building',
        branding: { companyName: `临时模板历史验证 ${token.slice(0, 8)}` },
        templateRevision: 0,
        templateSettings: {},
      },
    })
    createdTenantIDs.push(firstTenant.id)
    const otherTenant = await payload.create({
      collection: 'tenants',
      locale: 'zh',
      overrideAccess: true,
      data: {
        name: `临时隔离验证 ${token.slice(0, 8)}`,
        slug: `template-history-isolation-${token.slice(0, 12)}`,
        defaultLocale: 'zh',
        enabledLocales: ['zh'],
        status: 'building',
        branding: { companyName: `临时隔离验证 ${token.slice(0, 8)}` },
        templateRevision: 0,
        templateSettings: {},
      },
    })
    createdTenantIDs.push(otherTenant.id)

    const applyInput = {
      operation: 'apply' as const,
      templateId: templates.docs[0].id,
      expectedRevision: 0,
      idempotencyKey: randomUUID(),
    }
    const revisionCheck = await payload.find({
      collection: 'tenants',
      depth: 0,
      limit: 1,
      overrideAccess: false,
      showHiddenFields: true,
      user: actor,
      where: { and: [
        { id: { equals: firstTenant.id } },
        { templateRevision: { equals: 0 } },
      ] },
    })
    assert.equal(firstTenant.templateRevision ?? 0, 0)
    assert.equal(revisionCheck.docs.length, 1)
    const applied = await applyTemplateChange({ payload, tenantID: firstTenant.id, user: actor, input: applyInput })
    assert.equal(applied.tenantRevision, 1)
    assert.equal(applied.selectedTemplateId, templates.docs[0].id)

    const replayed = await applyTemplateChange({ payload, tenantID: firstTenant.id, user: actor, input: applyInput })
    assert.equal(replayed.idempotent, true)
    assert.equal(replayed.tenantRevision, 1)

    await assert.rejects(
      () => applyTemplateChange({
        payload,
        tenantID: firstTenant.id,
        user: actor,
        input: { ...applyInput, templateId: templates.docs[1].id },
      }),
      (error: unknown) => error instanceof TemplateChangeError && error.status === 409,
    )
    await assert.rejects(
      () => applyTemplateChange({
        payload,
        tenantID: firstTenant.id,
        user: actor,
        input: { ...applyInput, idempotencyKey: randomUUID() },
      }),
      (error: unknown) => error instanceof TemplateChangeError && error.status === 409,
    )
    await assert.rejects(
      () => applyTemplateChange({
        payload,
        tenantID: otherTenant.id,
        user: actor,
        input: {
          operation: 'rollback',
          changeId: applied.change.id,
          expectedRevision: 0,
          idempotencyKey: randomUUID(),
        },
      }),
      (error: unknown) => error instanceof TemplateChangeError && error.status === 409,
    )

    const rolledBack = await applyTemplateChange({
      payload,
      tenantID: firstTenant.id,
      user: actor,
      input: {
        operation: 'rollback',
        changeId: applied.change.id,
        expectedRevision: 1,
        idempotencyKey: randomUUID(),
      },
    })
    assert.equal(rolledBack.tenantRevision, 2)
    assert.equal(rolledBack.selectedTemplateId, null)
    const replayAfterLaterChange = await applyTemplateChange({
      payload,
      tenantID: firstTenant.id,
      user: actor,
      input: applyInput,
    })
    assert.equal(replayAfterLaterChange.tenantRevision, 2)
    assert.equal(replayAfterLaterChange.selectedTemplateId, null)
    const concurrentResults = await Promise.allSettled(templates.docs.map((template) => applyTemplateChange({
      payload, tenantID: firstTenant.id, user: actor,
      input: { operation: 'apply', templateId: template.id, expectedRevision: 2, idempotencyKey: randomUUID() },
    })))
    const concurrentSuccesses = concurrentResults.filter((result) => result.status === 'fulfilled')
    const concurrentFailures = concurrentResults.filter((result) => result.status === 'rejected')
    assert.equal(concurrentSuccesses.length, 1)
    assert.equal(concurrentFailures.length, 1)
    assert.ok(concurrentFailures[0].reason instanceof TemplateChangeError)
    assert.equal(concurrentFailures[0].reason.status, 409)
    const winner = concurrentSuccesses[0].value
    const reset = await applyTemplateChange({
      payload, tenantID: firstTenant.id, user: actor,
      input: { operation: 'rollback', changeId: winner.change.id, expectedRevision: 3, idempotencyKey: randomUUID() },
    })
    assert.equal(reset.selectedTemplateId, null)
    const sameRequest = { operation: 'apply' as const, templateId: templates.docs[0].id, expectedRevision: 4, idempotencyKey: randomUUID() }
    const duplicateResults = await Promise.all([
      applyTemplateChange({ payload, tenantID: firstTenant.id, user: actor, input: sameRequest }),
      applyTemplateChange({ payload, tenantID: firstTenant.id, user: actor, input: sameRequest }),
    ])
    assert.equal(duplicateResults[0].change.id, duplicateResults[1].change.id)
    assert.equal(duplicateResults[0].tenantRevision, 5)
    assert.equal(duplicateResults[1].tenantRevision, 5)
    return { apply: 'ok', defaultLanguageValidation: 'zh', idempotency: 'ok', staleRevision: '409', crossTenantRollback: '409', rollback: 'ok', concurrentChanges: 'one_success_one_409', concurrentIdempotency: 'same_change' }
  } finally {
    if (createdTenantIDs.length) {
      await payload.delete({
        collection: 'site-template-changes',
        where: { tenant: { in: createdTenantIDs } },
        overrideAccess: true,
      })
      await payload.delete({
        collection: 'audit-logs',
        where: { documentId: { in: createdTenantIDs.map(String) } },
        overrideAccess: true,
      })
      await payload.delete({
        collection: 'tenants',
        where: { id: { in: createdTenantIDs } },
        overrideAccess: true,
      })
    }
  }
}

if (process.env.PAYLOAD_MIGRATING !== 'true') process.env.PAYLOAD_MIGRATING = 'true'
await makeBackup()

const pool = new Pool({ connectionString: databaseURL })
let payload: Awaited<ReturnType<typeof getPayload>> | undefined
try {
  const before = await readBaseline(pool)
  payload = await getPayload({ config })
  const appliedMigrations = await pool.query<{ name: string }>(
    'SELECT name FROM payload_migrations WHERE name = ANY($1::text[])',
    [migrationNames],
  )
  const appliedNames = new Set(appliedMigrations.rows.map((row) => row.name))
  const pendingMigrations = selectedMigrations.filter((migration) => !appliedNames.has(migration.name))
  if (pendingMigrations.length) await payload.db.migrate({ migrations: pendingMigrations })

  for (const definition of newTemplates) {
    const found = await payload.find({
      collection: 'templates',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: { key: { equals: definition.key } },
    })
    const existing = found.docs[0]
    if (!existing) {
      await payload.create({
        collection: 'templates',
        overrideAccess: true,
        data: {
          key: definition.key,
          name: definition.name,
          version: definition.version,
          schemaVersion: definition.schemaVersion,
          referenceCode: definition.reference,
          referenceURL: definition.referenceURL,
          status: 'published',
          industry: definition.industry,
          description: definition.description,
          capabilities: ['products', 'blog', 'news', 'cases', 'rfq', 'seo', 'multilingual'],
          visual: { heroStyle: 'technical', cardStyle: 'flat', navigationStyle: 'light' },
        },
      })
      continue
    }
    await payload.update({
      collection: 'templates',
      id: existing.id,
      overrideAccess: true,
      data: {
        schemaVersion: definition.schemaVersion,
        referenceCode: definition.reference,
        referenceURL: definition.referenceURL,
        industry: definition.industry,
        status: 'published',
      },
    })
  }

  const catalog = await payload.find({
    collection: 'templates',
    depth: 0,
    limit: 100,
    overrideAccess: true,
    where: { key: { in: newTemplates.map((template) => template.key) } },
  })
  if (catalog.docs.length !== newTemplates.length) {
    throw new Error(`Expected ${newTemplates.length} reference templates; found ${catalog.docs.length}.`)
  }
  for (const definition of newTemplates) {
    const record = catalog.docs.find((item) => item.key === definition.key)
    if (!record || record.status !== 'published' || record.referenceCode !== definition.reference
      || record.referenceURL !== definition.referenceURL || record.schemaVersion !== definition.schemaVersion
      || record.version !== definition.version) {
      throw new Error(`Reference template verification failed: ${definition.key}`)
    }
  }
  const historyChecks = await verifyTemplateHistory(payload)

  const after = await readBaseline(pool)
  if (before.selectionsHash !== after.selectionsHash) {
    throw new Error('Tenant template selections changed during installation; compare the database backup before proceeding.')
  }
  for (const table of tableNames) {
    if (table !== 'templates' && before.counts[table] !== after.counts[table]) {
      throw new Error(`Existing ${table} record count changed during installation.`)
    }
  }
  const originalTemplates = before.templateRows.filter(
    (row) => !newTemplates.some((template) => template.key === row.key),
  )
  const afterOriginalTemplates = after.templateRows.filter(
    (row) => !newTemplates.some((template) => template.key === row.key),
  )
  if (digest(originalTemplates) !== digest(afterOriginalTemplates)) {
    throw new Error('A pre-existing template record changed during installation.')
  }

  const evidence = {
    verifiedAt: new Date().toISOString(),
    backupPath,
    migrations: migrationNames,
    referenceTemplateCount: catalog.docs.length,
    tenantSelectionCount: before.selections.length,
    tenantSelectionsUnchanged: true,
    originalTemplateCount: originalTemplates.length,
    originalTemplatesUnchanged: true,
    businessRecordCountsUnchanged: true,
    tenantSelectionsHash: after.selectionsHash,
    businessRecordCounts: after.counts,
    referenceTemplates: catalog.docs.map(({ key, name, version, referenceCode, schemaVersion, industry }) => ({ key, name, version, referenceCode, schemaVersion, industry })),
    historyChecks,
  }
  await mkdir(new URL('../docs/evidence/template-upgrade/implementation-02/', import.meta.url), { recursive: true })
  await writeFile(new URL('../docs/evidence/template-upgrade/implementation-02/database-and-history-verification.json', import.meta.url), `${JSON.stringify(evidence, null, 2)}\n`)
  console.log(JSON.stringify(evidence, null, 2))
} finally {
  await payload?.destroy()
  if (payload) {
    await Promise.race([payload.db.pool.end(), new Promise<void>((resolve) => setTimeout(resolve, 2000))])
  }
  await pool.end()
}

// Payload plugins may keep worker timers alive after their database pools close.
// This is a one-off CLI; all writes, assertions and cleanup have been awaited.
process.exit(0)
