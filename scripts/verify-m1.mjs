import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const root = resolve(scriptDirectory, '..')

const requiredFiles = [
  'entry/src/main/ets/pages/Index.ets',
  'entry/src/main/ets/pages/AppRoot.ets',
  'entry/src/main/ets/components/shell/AppIdentityBar.ets',
  'entry/src/main/ets/components/navigation/BottomNavigation.ets',
  'entry/src/main/ets/components/navigation/AgentLauncher.ets',
  'entry/src/main/ets/components/today/TodayPage.ets',
  'entry/src/main/ets/components/brand/BlossomMark.ets',
  'entry/src/main/ets/data/TodayFixtures.ets',
  'entry/src/main/ets/models/AppModels.ets',
  'entry/src/main/ets/theme/LociTheme.ets'
]

const failures = []

for (const relativePath of requiredFiles) {
  if (!existsSync(resolve(root, relativePath))) {
    failures.push(`missing required file: ${relativePath}`)
  }
}

const read = (relativePath) => readFileSync(resolve(root, relativePath), 'utf8')
const appRoot = read('entry/src/main/ets/pages/AppRoot.ets')
const index = read('entry/src/main/ets/pages/Index.ets')
const navigation = read('entry/src/main/ets/components/navigation/BottomNavigation.ets')
const agent = read('entry/src/main/ets/components/navigation/AgentLauncher.ets')
const today = read('entry/src/main/ets/components/today/TodayPage.ets')
const fixtures = read('entry/src/main/ets/data/TodayFixtures.ets')
const theme = read('entry/src/main/ets/theme/LociTheme.ets')
const allM1Source = requiredFiles.map(read).join('\n')

const checks = [
  ['Index uses state management V2', index.includes('@ComponentV2')],
  ['AppRoot is implemented', appRoot.includes('export struct AppRoot')],
  ['immersive system safe area is declared', appRoot.includes('.expandSafeArea([SafeAreaType.SYSTEM]')],
  ['continuous environment uses semantic canvas tokens', appRoot.includes('LociTheme.CANVAS_TOP') && appRoot.includes('LociTheme.CANVAS_BOTTOM')],
  ['all three destinations exist', navigation.includes('AppDestination.TODAY') && navigation.includes('AppDestination.LEARNING') && navigation.includes('AppDestination.LIBRARY')],
  ['navigation events update root state', appRoot.includes('this.activeDestination = destination')],
  ['Agent entry is 66vp', theme.includes('AGENT_SIZE: number = 66') && agent.includes('LociTheme.AGENT_SIZE')],
  ['smoke controls use the explicit fallback token', navigation.includes('SMOKE_HIGH_FALLBACK') && theme.includes('SMOKE_HIGH_FALLBACK')],
  ['Today focus panel is present', today.includes('TODAY_FOCUS') && today.includes('CONTENT_SURFACE')],
  ['Today action list is present', today.includes('TODAY_ACTIONS')],
  ['current Today content is migrated', fixtures.includes('分清监督学习与无监督学习') && fixtures.includes('检查两条知识关系')],
  ['M1 contains no WebView or browser runtime', !/\bWebView\b|\bWeb\s*\(|document\.|window\./.test(allM1Source)]
]

for (const [label, passed] of checks) {
  if (!passed) {
    failures.push(label)
  }
}

if (failures.length > 0) {
  console.error('M1 static verification failed:')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log(`M1 static verification passed (${requiredFiles.length} files, ${checks.length} checks).`)
