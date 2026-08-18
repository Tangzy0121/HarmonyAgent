import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('server environment example', () => {
  it('uses current DeepSeek defaults without containing a real key', () => {
    const env = readFileSync(new URL('../.env.example', import.meta.url), 'utf8')
    expect(env).toMatch(/^LLM_PROVIDER=deepseek$/m)
    expect(env).toMatch(/^LLM_BASE_URL=https:\/\/api\.deepseek\.com$/m)
    expect(env).toMatch(/^LLM_MODEL=deepseek-v4-flash$/m)
    expect(env).toMatch(/^LLM_API_KEY=your-api-key-here$/m)
    expect(env).not.toMatch(/LLM_API_KEY=sk-[A-Za-z0-9_-]{20,}/)
  })
})
