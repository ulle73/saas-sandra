import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Client } from 'pg'
import { ensureEnvLoaded } from './load-env.js'

async function main() {
  ensureEnvLoaded()

  const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL (or SUPABASE_DB_URL) is required to initialize the database')
  }

  const sqlPath = resolve(process.cwd(), 'supabase', 'schema.sql')
  const sql = await readFile(sqlPath, 'utf8')

  const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } })
  await client.connect()

  try {
    await client.query(sql)
    console.log('Database schema initialized successfully.')
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  if (error?.code === 'ENOTFOUND' || error?.code === 'ENOENT') {
    console.error(
      'Failed to initialize database: database host could not be resolved. Use Supabase Session Pooler IPv4 connection string in DATABASE_URL.'
    )
    process.exit(1)
  }

  console.error('Failed to initialize database:', error.message)
  process.exit(1)
})
