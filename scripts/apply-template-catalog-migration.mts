import { getPayload } from 'payload'

import config from '../src/payload.config'
import { migrations } from '../src/migrations'

if (process.env.NODE_ENV !== 'production') {
  throw new Error('Run with NODE_ENV=production so Payload cannot push the schema automatically.')
}

const migrationName = '20260927_010000_template_catalog_and_history'
const migration = migrations.find((item) => item.name === migrationName)
if (!migration) throw new Error(`Migration ${migrationName} is not registered.`)

const payload = await getPayload({ config })
try {
  // Apply this additive migration only. The local database has older migrations
  // recorded as pending despite being supplied by the existing development schema push.
  await payload.db.migrate({ migrations: [migration] })
  console.log(`Applied ${migrationName}; no earlier pending migrations were run.`)
} finally {
  await payload.destroy()
}
