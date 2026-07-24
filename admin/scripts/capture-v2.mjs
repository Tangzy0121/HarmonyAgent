import { writeFileSync } from 'node:fs'

const [, , targetLabel, outputPath] = process.argv

if (!targetLabel || !outputPath) {
  throw new Error('Usage: node scripts/capture-v2.mjs <today|learning|library|file|explanation|verification|completion|change|outcome|agent|agent-full> <output>')
}

const pages = await fetch('http://127.0.0.1:9223/json').then((response) => response.json())
const page = pages.find((item) => item.type === 'page' && item.url.includes('127.0.0.1:5173'))

if (!page) {
  throw new Error('Prototype page was not found on the local Chrome debugging port.')
}

const socket = new WebSocket(page.webSocketDebuggerUrl)
const pending = new Map()
let nextId = 1

await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (!message.id || !pending.has(message.id)) return
  const { resolve, reject } = pending.get(message.id)
  pending.delete(message.id)
  if (message.error) reject(new Error(message.error.message))
  else resolve(message.result)
})

function send(method, params = {}) {
  const id = nextId++
  const promise = new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
  socket.send(JSON.stringify({ id, method, params }))
  return promise
}

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true,
  screenWidth: 390,
  screenHeight: 844,
})
await send('Page.reload', { ignoreCache: true })
await new Promise((resolve) => setTimeout(resolve, 900))

const expressions = {
  today: `Array.from(document.querySelectorAll('.navigation-item')).find((item) => item.textContent.includes('今日'))?.click()`,
  learning: `Array.from(document.querySelectorAll('.navigation-item')).find((item) => item.textContent.includes('学习'))?.click()`,
  library: `Array.from(document.querySelectorAll('.navigation-item')).find((item) => item.textContent.includes('知识库'))?.click()`,
  agent: `document.querySelector('.agent-launcher')?.click()`,
}

if (targetLabel === 'file' || targetLabel === 'explanation' || targetLabel === 'verification' || targetLabel === 'completion' || targetLabel === 'change' || targetLabel === 'outcome') {
  await send('Runtime.evaluate', { expression: expressions.library, awaitPromise: true })
  await new Promise((resolve) => setTimeout(resolve, 500))
  await send('Runtime.evaluate', { expression: `document.querySelector('.library-feature')?.click()`, awaitPromise: true })
  if (targetLabel === 'explanation' || targetLabel === 'verification' || targetLabel === 'completion' || targetLabel === 'change' || targetLabel === 'outcome') {
    await new Promise((resolve) => setTimeout(resolve, 500))
    await send('Runtime.evaluate', { expression: `document.querySelector('.document-primary-action__button')?.click()`, awaitPromise: true })
  }
  if (targetLabel === 'verification' || targetLabel === 'completion' || targetLabel === 'change' || targetLabel === 'outcome') {
    await new Promise((resolve) => setTimeout(resolve, 500))
    await send('Runtime.evaluate', { expression: `document.querySelector('.learning-reader__primary-action .document-primary-action__button')?.click()`, awaitPromise: true })
  }
  if (targetLabel === 'completion' || targetLabel === 'change' || targetLabel === 'outcome') {
    await new Promise((resolve) => setTimeout(resolve, 500))
    await send('Runtime.evaluate', { expression: `Array.from(document.querySelectorAll('.learning-validation__answer')).find((item) => item.textContent.includes('不属于'))?.click()`, awaitPromise: true })
    await new Promise((resolve) => setTimeout(resolve, 250))
    await send('Runtime.evaluate', { expression: `document.querySelector('.learning-validation__primary-action .document-primary-action__button')?.click()`, awaitPromise: true })
    await new Promise((resolve) => setTimeout(resolve, 500))
    await send('Runtime.evaluate', { expression: `document.querySelector('.learning-validation__primary-action .document-primary-action__button')?.click()`, awaitPromise: true })
  }
  if (targetLabel === 'change' || targetLabel === 'outcome') {
    await new Promise((resolve) => setTimeout(resolve, 650))
    await send('Runtime.evaluate', { expression: `document.querySelector('.learning-completion__primary-action .document-primary-action__button')?.click()`, awaitPromise: true })
  }
  if (targetLabel === 'outcome') {
    await new Promise((resolve) => setTimeout(resolve, 800))
    await send('Runtime.evaluate', { expression: `document.querySelector('.map-change-panel__primary')?.click()`, awaitPromise: true })
  }
} else if (targetLabel === 'agent-full') {
  await send('Runtime.evaluate', { expression: expressions.agent, awaitPromise: true })
  await new Promise((resolve) => setTimeout(resolve, 600))
  await send('Runtime.evaluate', { expression: `document.querySelector('.drawer-size-control')?.click()`, awaitPromise: true })
} else {
  const expression = expressions[targetLabel]
  if (!expression) throw new Error(`Unknown capture target: ${targetLabel}`)
  await send('Runtime.evaluate', { expression, awaitPromise: true })
}
await new Promise((resolve) => setTimeout(resolve, 900))

const screenshot = await send('Page.captureScreenshot', {
  format: 'png',
  fromSurface: true,
  captureBeyondViewport: false,
})

writeFileSync(outputPath, Buffer.from(screenshot.data, 'base64'))
socket.close()
process.exit(0)
