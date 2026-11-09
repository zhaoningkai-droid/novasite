import { postgresAdapter } from '@payloadcms/db-postgres'
import { createDatabasePoolOptions } from './database-pool'

export function createDatabaseAdapter() {
  return postgresAdapter({
    pool: createDatabasePoolOptions(),
    beforeSchemaInit: [({ adapter, schema }) => {
      // A language can be filled one module at a time. Payload's field validators
      // still enforce required values when the module is edited.
      const localizedFields = {
        tenants_locales: ['branding_company_name'],
        tenants_fixed_pages_homepage_strength_items_locales: ['label'],
        tenants_fixed_pages_about_modules_locales: ['title', 'description'],
      }
      for (const [tableName, columnNames] of Object.entries(localizedFields)) {
        const table = adapter.rawTables[tableName]
        for (const columnName of columnNames) {
          const column = Object.values(table?.columns || {}).find(({ name }) => name === columnName)
          if (!column) throw new Error(`Missing tenant locale column: ${tableName}.${columnName}`)
          column.notNull = false
        }
      }
      return schema
    }],
    // Formal runtime schema changes belong to the separately approved migrator.
    ...(process.env.NODE_ENV === 'production' ? { push: false } : {}),
  })
}
