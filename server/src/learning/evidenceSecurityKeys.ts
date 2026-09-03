import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { chmod, link, lstat, mkdir, open, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

export interface EvidenceReceiptKey {
  id: string
  secret: string
}

export interface EvidenceReceiptKeyring {
  active: EvidenceReceiptKey
  verification: EvidenceReceiptKey[]
}

export interface EvidenceSecurityKeys {
  receiptKeyring: EvidenceReceiptKeyring
  feynmanDigestKey: string
}

interface StoredEvidenceSecurityKeys {
  version: '1'
  activeReceiptKeyId: string
  receiptKeys: EvidenceReceiptKey[]
  feynmanDigestKey: string
}

interface EvidenceSecurityEnvironment {
  EVIDENCE_RECEIPT_SECRET?: string
  EVIDENCE_RECEIPT_PREVIOUS_SECRETS?: string
}

export interface EvidenceKeyFileProtection {
  harden(filePath: string): Promise<void>
  verify(filePath: string): Promise<void>
}

interface EvidenceSecurityKeyOptions {
  protection?: EvidenceKeyFileProtection
  platform?: NodeJS.Platform
}

interface WindowsProtectionDependencies {
  runPowerShell?: (script: string, filePath: string) => Promise<void>
}

interface PosixProtectionDependencies {
  getUid?: () => number | undefined
  chmodFile?: (filePath: string, mode: number) => Promise<void>
  inspectFile?: (filePath: string) => Promise<{
    isFile: boolean
    isSymbolicLink: boolean
    mode: number
    uid: number
  }>
}

const KEY_FILE = 'learning-evidence-keys.json'
const execFileAsync = promisify(execFile)
const keyFileQueues = new Map<string, Promise<void>>()

const WINDOWS_HARDEN_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$keyPath = $env:HARMONY_EVIDENCE_KEY_PATH
$item = Get-Item -LiteralPath $keyPath -Force
if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { exit 40 }
$current = [Security.Principal.WindowsIdentity]::GetCurrent().User
$system = New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
# 非系统盘目录上 SetOwner 与 DACL 合并为一次 SetAccessControl 必抛
# UnauthorizedAccessException，拆成两次：先只写 DACL，再单独 SetOwner。
$acl = New-Object Security.AccessControl.FileSecurity
$acl.SetAccessRuleProtection($true, $false)
foreach ($sid in @($current, $system)) {
  $rule = New-Object Security.AccessControl.FileSystemAccessRule(
    $sid, [Security.AccessControl.FileSystemRights]::FullControl,
    [Security.AccessControl.AccessControlType]::Allow)
  $acl.AddAccessRule($rule)
}
[IO.File]::SetAccessControl($keyPath, $acl)
$ownerOnly = New-Object Security.AccessControl.FileSecurity
$ownerOnly.SetOwner($current)
[IO.File]::SetAccessControl($keyPath, $ownerOnly)
`

const WINDOWS_VERIFY_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$keyPath = $env:HARMONY_EVIDENCE_KEY_PATH
$item = Get-Item -LiteralPath $keyPath -Force
if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { exit 40 }
$sections = [Security.AccessControl.AccessControlSections]::Access -bor
  [Security.AccessControl.AccessControlSections]::Owner
$acl = [IO.File]::GetAccessControl($keyPath, $sections)
if (-not $acl.AreAccessRulesProtected) { exit 41 }
$expected = @(
  [Security.Principal.WindowsIdentity]::GetCurrent().User.Value,
  'S-1-5-18'
) | Select-Object -Unique
$owner = $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
if ($expected -notcontains $owner) { exit 46 }
$rules = @($acl.Access)
if ($rules.Count -ne $expected.Count) { exit 42 }
foreach ($rule in $rules) {
  $sid = $rule.IdentityReference.Translate(
    [Security.Principal.SecurityIdentifier]).Value
  if ($expected -notcontains $sid) { exit 43 }
  if ($rule.IsInherited) { exit 47 }
  if ($rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow) { exit 44 }
  if (($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -ne
      [Security.AccessControl.FileSystemRights]::FullControl) { exit 45 }
}
`

export function createWindowsEvidenceKeyFileProtection(
  dependencies: WindowsProtectionDependencies = {},
): EvidenceKeyFileProtection {
  const runPowerShell = dependencies.runPowerShell ?? (async (script, filePath) => {
    await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      {
        windowsHide: true,
        env: { ...process.env, HARMONY_EVIDENCE_KEY_PATH: filePath },
      },
    )
  })
  return {
    harden: (filePath) => runPowerShell(WINDOWS_HARDEN_SCRIPT, filePath),
    verify: (filePath) => runPowerShell(WINDOWS_VERIFY_SCRIPT, filePath),
  }
}

export function createPosixEvidenceKeyFileProtection(
  dependencies: PosixProtectionDependencies = {},
): EvidenceKeyFileProtection {
  const expectedOwner = (dependencies.getUid ?? (() => process.getuid?.()))()
  const chmodFile = dependencies.chmodFile ?? chmod
  const inspectFile = dependencies.inspectFile ?? (async (filePath) => {
    const info = await lstat(filePath)
    return {
      isFile: info.isFile(),
      isSymbolicLink: info.isSymbolicLink(),
      mode: info.mode,
      uid: info.uid,
    }
  })
  return {
    async harden(filePath) {
      const before = await inspectFile(filePath)
      if (!before.isFile || before.isSymbolicLink) throw new Error()
      await chmodFile(filePath, 0o600)
    },
    async verify(filePath) {
      const info = await inspectFile(filePath)
      if (
        !info.isFile || info.isSymbolicLink ||
        (info.mode & 0o777) !== 0o600 || expectedOwner === undefined || info.uid !== expectedOwner
      ) throw new Error()
    },
  }
}

function defaultProtection(platform: NodeJS.Platform): EvidenceKeyFileProtection {
  return platform === 'win32'
    ? createWindowsEvidenceKeyFileProtection()
    : createPosixEvidenceKeyFileProtection()
}

async function protectKeyFile(
  filePath: string,
  protection: EvidenceKeyFileProtection,
): Promise<void> {
  try {
    await protection.harden(filePath)
    await protection.verify(filePath)
  } catch {
    throw new Error('evidence_security_key_protection_failed')
  }
}

function derive(secret: string, purpose: string): string {
  return createHmac('sha256', secret).update(purpose).digest('base64url')
}

function keyId(secret: string): string {
  return createHash('sha256').update(secret).digest('hex').slice(0, 16)
}

function fromEnvironment(secret: string, previous: string[]): EvidenceSecurityKeys {
  const receiptSecret = derive(secret, 'harmony-agent:evidence-receipt:v1')
  return {
    receiptKeyring: {
      active: { id: keyId(receiptSecret), secret: receiptSecret },
      verification: previous.map((value) => {
        const derived = derive(value, 'harmony-agent:evidence-receipt:v1')
        return { id: keyId(derived), secret: derived }
      }),
    },
    feynmanDigestKey: derive(secret, 'harmony-agent:feynman-digest:v1'),
  }
}

function normalizeStored(value: StoredEvidenceSecurityKeys): EvidenceSecurityKeys {
  if (
    value.version !== '1' || typeof value.activeReceiptKeyId !== 'string' ||
    !Array.isArray(value.receiptKeys) || typeof value.feynmanDigestKey !== 'string'
  ) throw new Error('evidence_security_keys_invalid')
  const active = value.receiptKeys.find((item) => item.id === value.activeReceiptKeyId)
  if (!active || !active.secret) throw new Error('evidence_security_keys_invalid')
  const verification = value.receiptKeys.filter((item) =>
    item.id !== active.id && typeof item.id === 'string' && typeof item.secret === 'string' && item.secret)
  return {
    receiptKeyring: { active: structuredClone(active), verification: structuredClone(verification) },
    feynmanDigestKey: value.feynmanDigestKey,
  }
}

function safeKeyError(error: unknown): Error {
  if (
    error instanceof Error &&
    (error.message === 'evidence_security_key_protection_failed' ||
      error.message === 'evidence_security_keys_invalid')
  ) return error
  return new Error('evidence_security_keys_unavailable')
}

async function readStoredKeyFile(filePath: string): Promise<EvidenceSecurityKeys> {
  let serialized: string
  try {
    serialized = await readFile(filePath, 'utf8')
  } catch {
    throw new Error('evidence_security_keys_unavailable')
  }
  try {
    return normalizeStored(JSON.parse(serialized) as StoredEvidenceSecurityKeys)
  } catch (error) {
    throw safeKeyError(error instanceof SyntaxError
      ? new Error('evidence_security_keys_invalid')
      : error)
  }
}

async function serializeKeyFile<T>(filePath: string, action: () => Promise<T>): Promise<T> {
  const previous = keyFileQueues.get(filePath) ?? Promise.resolve()
  const running = previous.catch(() => undefined).then(action)
  const tail = running.then(() => undefined, () => undefined)
  keyFileQueues.set(filePath, tail)
  try {
    return await running
  } finally {
    if (keyFileQueues.get(filePath) === tail) keyFileQueues.delete(filePath)
  }
}

async function loadOrCreateLocalKeys(
  filePath: string,
  protection: EvidenceKeyFileProtection,
): Promise<EvidenceSecurityKeys> {
  try {
    await lstat(filePath)
    await protectKeyFile(filePath, protection)
    return readStoredKeyFile(filePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw safeKeyError(error)
  }

  const candidatePath = `${filePath}.${randomUUID()}.tmp`
  let fileHandle
  try {
    fileHandle = await open(candidatePath, 'wx', 0o600)
  } catch (error) {
    throw safeKeyError(error)
  }
  try {
    await protectKeyFile(candidatePath, protection)
    const secret = randomBytes(32).toString('base64url')
    const active: EvidenceReceiptKey = { id: keyId(secret), secret }
    const candidate: StoredEvidenceSecurityKeys = {
      version: '1', activeReceiptKeyId: active.id, receiptKeys: [active],
      feynmanDigestKey: randomBytes(32).toString('base64url'),
    }
    await fileHandle.writeFile(JSON.stringify(candidate, null, 2), { encoding: 'utf8' })
    await fileHandle.sync()
    await fileHandle.close()
    fileHandle = undefined
    try {
      await link(candidatePath, filePath)
      return normalizeStored(candidate)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw safeKeyError(error)
      await protectKeyFile(filePath, protection)
      return readStoredKeyFile(filePath)
    }
  } catch (error) {
    throw safeKeyError(error)
  } finally {
    await fileHandle?.close().catch(() => undefined)
    try {
      await rm(candidatePath, { force: true })
    } catch (error) {
      throw safeKeyError(error)
    }
  }
}

export async function loadOrCreateEvidenceSecurityKeys(
  dataRoot: string,
  env: EvidenceSecurityEnvironment = process.env,
  options: EvidenceSecurityKeyOptions = {},
): Promise<EvidenceSecurityKeys> {
  const configured = env.EVIDENCE_RECEIPT_SECRET?.trim()
  if (configured) {
    const previous = (env.EVIDENCE_RECEIPT_PREVIOUS_SECRETS ?? '')
      .split(',').map((item) => item.trim()).filter(Boolean)
    return fromEnvironment(configured, previous)
  }

  try {
    await mkdir(dataRoot, { recursive: true })
  } catch (error) {
    throw safeKeyError(error)
  }
  const filePath = path.join(dataRoot, KEY_FILE)
  const protection = options.protection ?? defaultProtection(options.platform ?? process.platform)
  return serializeKeyFile(filePath, () => loadOrCreateLocalKeys(filePath, protection))
}
