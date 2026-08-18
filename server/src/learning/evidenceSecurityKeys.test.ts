import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  createPosixEvidenceKeyFileProtection,
  createWindowsEvidenceKeyFileProtection,
  loadOrCreateEvidenceSecurityKeys,
  type EvidenceKeyFileProtection,
} from './evidenceSecurityKeys.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('loadOrCreateEvidenceSecurityKeys', () => {
  it('protects and verifies an exclusively created empty file before writing key material', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'evidence-create-order-'))
    roots.push(root)
    const calls: string[] = []
    const protection: EvidenceKeyFileProtection = {
      async harden(filePath) {
        calls.push(`harden:${path.basename(filePath).endsWith('.tmp')}:${(await stat(filePath)).size}`)
      },
      async verify(filePath) {
        calls.push(`verify:${path.basename(filePath).endsWith('.tmp')}:${(await stat(filePath)).size}`)
      },
    }

    const loaded = await loadOrCreateEvidenceSecurityKeys(root, {}, { protection })

    expect(calls).toEqual(['harden:true:0', 'verify:true:0'])
    const stored = await readFile(path.join(root, 'learning-evidence-keys.json'), 'utf8')
    expect(stored).toContain(loaded.receiptKeyring.active.secret)
  })

  it('atomically reuses the same persisted local receipt and digest keys across restarts', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'evidence-keys-'))
    roots.push(root)
    const protectedPaths: string[] = []
    const protection: EvidenceKeyFileProtection = {
      async harden(filePath) { protectedPaths.push(`harden:${path.basename(filePath)}`) },
      async verify(filePath) { protectedPaths.push(`verify:${path.basename(filePath)}`) },
    }

    const [first, concurrent] = await Promise.all([
      loadOrCreateEvidenceSecurityKeys(root, {}, { protection }),
      loadOrCreateEvidenceSecurityKeys(root, {}, { protection }),
    ])
    const restarted = await loadOrCreateEvidenceSecurityKeys(root, {}, { protection })

    expect(concurrent).toEqual(first)
    expect(restarted).toEqual(first)
    expect(first.receiptKeyring.active.secret).not.toBe(first.feynmanDigestKey)
    const stored = JSON.parse(await readFile(path.join(root, 'learning-evidence-keys.json'), 'utf8'))
    expect(stored).toMatchObject({ version: '1', activeReceiptKeyId: first.receiptKeyring.active.id })
    expect(protectedPaths.filter((item) => item.startsWith('harden:'))).toHaveLength(3)
    expect(protectedPaths.filter((item) => item.startsWith('verify:'))).toHaveLength(3)
  })

  it('derives stable domain-separated receipt and Feynman keys from environment secrets', async () => {
    const firstRoot = await mkdtemp(path.join(os.tmpdir(), 'evidence-env-a-'))
    const secondRoot = await mkdtemp(path.join(os.tmpdir(), 'evidence-env-b-'))
    roots.push(firstRoot, secondRoot)
    const env = { EVIDENCE_RECEIPT_SECRET: 'stable-production-secret' }

    const first = await loadOrCreateEvidenceSecurityKeys(firstRoot, env)
    const restartedElsewhere = await loadOrCreateEvidenceSecurityKeys(secondRoot, env)

    expect(restartedElsewhere).toEqual(first)
    expect(first.receiptKeyring.active.secret).not.toBe(first.feynmanDigestKey)
  })

  it('hardens and verifies an existing broadly accessible local key file before loading it', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'evidence-existing-'))
    roots.push(root)
    const bootstrap: EvidenceKeyFileProtection = {
      async harden() {},
      async verify() {},
    }
    await loadOrCreateEvidenceSecurityKeys(root, {}, { protection: bootstrap })
    const calls: string[] = []
    const broadFileProtection: EvidenceKeyFileProtection = {
      async harden() { calls.push('harden-existing') },
      async verify() { calls.push('verify-existing') },
    }

    await loadOrCreateEvidenceSecurityKeys(root, {}, { protection: broadFileProtection })

    expect(calls).toEqual(['harden-existing', 'verify-existing'])
  })

  it('fails closed with a fixed code when local key protection cannot be applied', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'evidence-protection-failure-'))
    roots.push(root)
    const filePath = path.join(root, 'learning-evidence-keys.json')
    const protection: EvidenceKeyFileProtection = {
      async harden(createdPath) {
        expect(createdPath).not.toBe(filePath)
        expect(path.basename(createdPath)).toMatch(/^learning-evidence-keys\.json\..+\.tmp$/u)
        expect((await stat(createdPath)).size).toBe(0)
        throw new Error('private key path and ACL details')
      },
      async verify() {},
    }

    await expect(loadOrCreateEvidenceSecurityKeys(root, {}, { protection }))
      .rejects.toMatchObject({ message: 'evidence_security_key_protection_failed' })
    await expect(readFile(filePath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readdir(root)).toEqual([])
  })

  it('keeps and loads an existing file that wins the create race', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'evidence-create-race-'))
    roots.push(root)
    const filePath = path.join(root, 'learning-evidence-keys.json')
    const existing = {
      version: '1', activeReceiptKeyId: 'existing-key',
      receiptKeys: [{ id: 'existing-key', secret: 'existing-receipt-secret' }],
      feynmanDigestKey: 'existing-digest-secret',
    }
    const protectedPaths: string[] = []
    const protection: EvidenceKeyFileProtection = {
      async harden(candidatePath) {
        protectedPaths.push(candidatePath)
        if (protectedPaths.length === 1) {
          await writeFile(filePath, JSON.stringify(existing))
        }
      },
      async verify() {},
    }

    const loaded = await loadOrCreateEvidenceSecurityKeys(root, {}, { protection })

    expect(loaded).toEqual({
      receiptKeyring: { active: existing.receiptKeys[0], verification: [] },
      feynmanDigestKey: existing.feynmanDigestKey,
    })
    expect(await readFile(filePath, 'utf8')).toBe(JSON.stringify(existing))
    expect(protectedPaths).toHaveLength(2)
    expect(protectedPaths[0]).not.toBe(filePath)
    expect(protectedPaths[1]).toBe(filePath)
    expect(await readdir(root)).toEqual(['learning-evidence-keys.json'])
  })

  it('never removes a pre-existing key file when protection fails', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'evidence-existing-protection-failure-'))
    roots.push(root)
    const bootstrap: EvidenceKeyFileProtection = {
      async harden() {},
      async verify() {},
    }
    await loadOrCreateEvidenceSecurityKeys(root, {}, { protection: bootstrap })
    const filePath = path.join(root, 'learning-evidence-keys.json')
    const before = await readFile(filePath, 'utf8')
    const protection: EvidenceKeyFileProtection = {
      async harden() { throw new Error('foreign owner cannot be repaired') },
      async verify() {},
    }

    await expect(loadOrCreateEvidenceSecurityKeys(root, {}, { protection }))
      .rejects.toMatchObject({ message: 'evidence_security_key_protection_failed' })
    expect(await readFile(filePath, 'utf8')).toBe(before)
  })

  it('repairs a foreign-owned existing file before verifying and reading it', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'evidence-foreign-owner-'))
    roots.push(root)
    const bootstrap: EvidenceKeyFileProtection = {
      async harden() {},
      async verify() {},
    }
    const expected = await loadOrCreateEvidenceSecurityKeys(root, {}, { protection: bootstrap })
    let owner: 'foreign' | 'current' = 'foreign'
    const calls: string[] = []
    const protection: EvidenceKeyFileProtection = {
      async harden() {
        calls.push(`harden:${owner}`)
        owner = 'current'
      },
      async verify() {
        calls.push(`verify:${owner}`)
        if (owner !== 'current') throw new Error('owner_not_repaired')
      },
    }

    const loaded = await loadOrCreateEvidenceSecurityKeys(root, {}, { protection })

    expect(loaded).toEqual(expected)
    expect(calls).toEqual(['harden:foreign', 'verify:current'])
  })

  it('repairs POSIX broad mode and verifies both 0600 mode and current ownership', async () => {
    let mode = 0o666
    let uid = 1000
    const protection = createPosixEvidenceKeyFileProtection({
      getUid: () => 1000,
      chmodFile: async (_filePath, nextMode) => { mode = nextMode },
      inspectFile: async () => ({
        isFile: true,
        isSymbolicLink: false,
        mode,
        uid,
      }),
    })

    await protection.harden('/data/learning-evidence-keys.json')
    await expect(protection.verify('/data/learning-evidence-keys.json')).resolves.toBeUndefined()
    expect(mode).toBe(0o600)

    uid = 1001
    await expect(protection.verify('/data/learning-evidence-keys.json')).rejects.toThrow()
  })

  it('uses the Windows ACL policy adapter to harden and verify without exposing key material', async () => {
    const calls: Array<{ script: string; filePath: string }> = []
    const protection = createWindowsEvidenceKeyFileProtection({
      runPowerShell: async (script, filePath) => { calls.push({ script, filePath }) },
    })

    await protection.harden('C:\\data\\learning-evidence-keys.json')
    await protection.verify('C:\\data\\learning-evidence-keys.json')

    expect(calls.map((call) => call.filePath)).toEqual([
      'C:\\data\\learning-evidence-keys.json',
      'C:\\data\\learning-evidence-keys.json',
    ])
    expect(calls[0].script).toContain('SetAccessRuleProtection')
    expect(calls[0].script).toContain('SetOwner')
    expect(calls[0].script).toContain('S-1-5-18')
    expect(calls[1].script).toContain('AccessControlSections]::Owner')
    expect(calls[1].script).toContain('GetOwner')
    expect(calls[1].script).toContain('AccessControlType')
    expect(JSON.stringify(calls)).not.toContain('receiptSecret')
  })

  it.runIf(process.platform === 'win32')(
    'applies and verifies the real Windows ACL policy',
    async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), 'evidence-windows-acl-'))
      roots.push(root)
      const filePath = path.join(root, 'learning-evidence-keys.json')
      await writeFile(filePath, '{}')
      const protection = createWindowsEvidenceKeyFileProtection()

      await expect(protection.harden(filePath)).resolves.toBeUndefined()
      await expect(protection.verify(filePath)).resolves.toBeUndefined()
    },
  )

  it.runIf(process.platform === 'win32')(
    'creates and reloads keys through the real Windows owner and ACL policy',
    async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), 'evidence-windows-loader-'))
      roots.push(root)

      const created = await loadOrCreateEvidenceSecurityKeys(root, {}, { platform: 'win32' })
      const restarted = await loadOrCreateEvidenceSecurityKeys(root, {}, { platform: 'win32' })

      expect(restarted).toEqual(created)
    },
  )
})
