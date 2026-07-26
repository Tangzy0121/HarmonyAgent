import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEBUGGER_URL = 'http://127.0.0.1:9223/json';
const PROTOTYPE_URL = 'http://127.0.0.1:5173';

const outputDir = resolve(process.cwd(), 'public', 'captures');
mkdirSync(outputDir, { recursive: true });

async function checkPrerequisites() {
  try {
    const response = await fetch(DEBUGGER_URL);
    if (!response.ok) throw new Error(`Debugger returned ${response.status}`);
  } catch (error) {
    throw new Error(
      `Cannot connect to Chrome debugger at ${DEBUGGER_URL}. ` +
        `Start Chrome with --remote-debugging-port=9223 and open ${PROTOTYPE_URL} first.`
    );
  }
}

await checkPrerequisites();

const pages = await fetch(DEBUGGER_URL).then((response) => response.json());
let page = pages.find(
  (item) => item.type === 'page' && item.url.includes(PROTOTYPE_URL.replace('http://', ''))
);

if (!page) {
  page = pages.find((item) => item.type === 'page');
  if (!page) {
    throw new Error(`No page tab was found on ${DEBUGGER_URL}.`);
  }
  console.log(`Navigating existing tab to ${PROTOTYPE_URL}`);
}

const socket = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
let nextId = 1;

await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});

function send(method, params = {}) {
  const id = nextId++;
  const promise = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  socket.send(JSON.stringify({ id, method, params }));
  return promise;
}

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function evaluate(expression, options = {}) {
  return send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: false,
    ...options,
  });
}

const expressions = {
  openDocument: `document.querySelector('.library-feature')?.click()`,
  startLearning: `document.querySelector('.document-primary-action__button')?.click()`,
  startVerification: `document.querySelector('.learning-reader__primary-action .document-primary-action__button')?.click()`,
  selectVerificationAnswer: `
    Array.from(document.querySelectorAll('.learning-validation__answer'))
      .find((item) => item.textContent.includes('不属于'))?.click()
  `,
  submitVerification: `
    document.querySelector('.learning-validation__primary-action .document-primary-action__button')?.click()
  `,
  continueToCompletion: `
    document.querySelector('.learning-validation__primary-action .document-primary-action__button')?.click()
  `,
  viewMapChange: `
    document.querySelector('.learning-completion__primary-action .document-primary-action__button')?.click()
  `,
  scheduleNext: `document.querySelector('.map-change-panel__primary')?.click()`,
  focusSupervisedNode: `
    document.querySelector('button[aria-label^="监督学习"]')?.click()
  `,
  openAgent: `document.querySelector('.agent-launcher')?.click()`,
  expandAgent: `document.querySelector('.drawer-size-control')?.click()`,
  askAgent: `
    (() => {
      const prompt = document.querySelector('.prompt-list button');
      if (prompt) prompt.click();
      setTimeout(() => {
        const sendButton = document.querySelector('.agent-input button[type="submit"]');
        if (sendButton && !sendButton.disabled) sendButton.click();
      }, 150);
    })()
  `,
};

const states = [
  { name: 'today-default', hash: '#today' },
  { name: 'library-default', hash: '#library' },
  { name: 'file-understanding', hash: '#library/ml-chapter-03' },
  { name: 'learning-explanation', hash: '#learn/supervised-learning/explanation' },
  { name: 'verification-default', hash: '#learn/supervised-learning/verification' },
  {
    name: 'verification-selected',
    hash: '#learn/supervised-learning/verification',
    steps: ['selectVerificationAnswer'],
  },
  {
    name: 'verification-feedback',
    hash: '#learn/supervised-learning/verification',
    steps: ['selectVerificationAnswer', 'submitVerification'],
  },
  { name: 'learning-completion', hash: '#learn/supervised-learning/completion' },
  { name: 'map-change-focus', hash: '#learning/supervised-learning/change' },
  { name: 'today-outcome', hash: '#today/learning-result' },
  { name: 'learning-map-default', hash: '#learning' },
  {
    name: 'learning-map-node-focus',
    hash: '#learning',
    steps: ['focusSupervisedNode'],
  },
  {
    name: 'agent-default',
    hash: '#today',
    steps: ['openAgent'],
  },
  {
    name: 'agent-full',
    hash: '#today',
    steps: ['openAgent', 'expandAgent'],
  },
  {
    name: 'agent-qa',
    hash: '#today',
    steps: ['openAgent', 'expandAgent', 'askAgent'],
  },
];

async function setDeviceMetrics() {
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
    screenWidth: 390,
    screenHeight: 844,
  });
}

async function navigateToHash(hash) {
  await send('Page.navigate', { url: `${PROTOTYPE_URL}/${hash}` });
  await wait(900);
}

async function captureState(state) {
  console.log(`Capturing: ${state.name}`);
  await navigateToHash(state.hash);
  await setDeviceMetrics();
  await wait(600);

  for (const step of state.steps ?? []) {
    const expression = expressions[step];
    if (!expression) throw new Error(`Unknown capture step: ${step}`);
    await evaluate(expression);
    await wait(700);
  }

  await wait(800);

  const screenshot = await send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });

  const filePath = resolve(outputDir, `${state.name}.png`);
  writeFileSync(filePath, Buffer.from(screenshot.data, 'base64'));
  console.log(`  → ${filePath}`);

  return {
    name: state.name,
    file: `${state.name}.png`,
    expectedWidth: 780,
    expectedHeight: 1688,
  };
}

await send('Page.enable');
await send('Runtime.enable');

const manifest = [];
for (const state of states) {
  manifest.push(await captureState(state));
}

const manifestPath = resolve(outputDir, 'manifest.json');
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`\nManifest written to ${manifestPath}`);

socket.close();
process.exit(0);
