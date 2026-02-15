import nextEnv from '@next/env'

const { loadEnvConfig } = nextEnv

let loaded = false

export function ensureEnvLoaded() {
  if (!loaded) {
    loadEnvConfig(process.cwd())
    loaded = true
  }
}
