import nextEnv from '@next/env'

const { loadEnvConfig } = nextEnv

loadEnvConfig(process.cwd())

let loaded = true

export function ensureEnvLoaded() {
  // Already loaded on import
}
