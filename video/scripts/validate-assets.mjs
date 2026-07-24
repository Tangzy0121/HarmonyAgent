import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const capturesDir = resolve(process.cwd(), 'public', 'captures');
const manifestPath = resolve(capturesDir, 'manifest.json');

if (!existsSync(manifestPath)) {
  throw new Error('manifest.json not found. Run npm run capture first.');
}

function getPngDimensions(filePath) {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(filePath, { start: 16, end: 23 });
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => {
      const buffer = Buffer.concat(chunks);
      if (buffer.length < 8) {
        reject(new Error('Unexpected end of PNG file'));
        return;
      }
      const width = buffer.readUInt32BE(0);
      const height = buffer.readUInt32BE(4);
      resolve({ width, height });
    });
    stream.on('error', reject);
  });
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
let errors = 0;

for (const item of manifest) {
  const filePath = resolve(capturesDir, item.file);
  if (!existsSync(filePath)) {
    console.error(`MISSING: ${item.file}`);
    errors++;
    continue;
  }

  try {
    const { width, height } = await getPngDimensions(filePath);
    if (width !== item.expectedWidth || height !== item.expectedHeight) {
      console.error(
        `DIMENSIONS: ${item.file} expected ${item.expectedWidth}x${item.expectedHeight}, got ${width}x${height}`
      );
      errors++;
    } else {
      console.log(`OK: ${item.file} ${width}x${height}`);
    }
  } catch (error) {
    console.error(`ERROR reading ${item.file}: ${error.message}`);
    errors++;
  }
}

if (errors > 0) {
  console.error(`\n${errors} asset validation error(s).`);
  process.exit(1);
}

console.log('\nAll captures validated.');
