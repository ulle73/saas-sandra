import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Client } from 'pg'
import { ensureEnvLoaded } from './load-env.js'

function buildSessionPoolerHint(databaseUrl) {
  try {
    const url = new URL(databaseUrl)
    const match = url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i)
    if (!match) return null

    const projectRef = match[1]
    const username = `postgres.${projectRef}`
    return [
      'Detected direct Supabase DB host (db.<project-ref>.supabase.co), which is often IPv6-only.',
      'Use Supabase Session Pooler (IPv4) instead.',
      '',
      'Expected DATABASE_URL format:',
      `postgresql://${username}:<DB_PASSWORD>@aws-0-<REGION>.pooler.supabase.com:5432/postgres?sslmode=require`,
      '',
      'Get the exact string from: Supabase Dashboard -> Project Settings -> Database -> Connection string -> Session pooler.',
    ].join('\n')
  } catch {
    return null
  }
}

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
    const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL
    const poolerHint = buildSessionPoolerHint(databaseUrl)
    console.error(
      'Failed to initialize database: database host could not be resolved. Use Supabase Session Pooler IPv4 connection string in DATABASE_URL.'
    )
    if (poolerHint) {
      console.error('')
      console.error(poolerHint)
    }
    process.exit(1)
  }

  console.error('Failed to initialize database:', error.message)
  process.exit(1)
})
