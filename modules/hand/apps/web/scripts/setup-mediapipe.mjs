// setup-mediapipe.mjs — Copies MediaPipe WASM files and downloads the .task model locally
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ROOT = path.resolve(__dirname, '..');

// 1. Copy WASM files from node_modules to public/wasm/
// The @mediapipe/tasks-vision package lives in packages/engine/node_modules
const ENGINE_PKG = path.resolve(ROOT, '..', '..', 'packages', 'engine', 'node_modules', '@mediapipe', 'tasks-vision');
const WASM_SRC = path.join(ENGINE_PKG, 'wasm');

if (!fs.existsSync(WASM_SRC)) {
  console.error(`ERROR: MediaPipe WASM directory not found at ${WASM_SRC}`);
  console.error('Ensure dependencies are installed (pnpm install / npm install).');
  process.exit(1);
}

const WASM_DEST = path.join(ROOT, 'public', 'wasm');

console.log(`Copying MediaPipe WASM files...`);
console.log(`  From: ${WASM_SRC}`);
console.log(`  To:   ${WASM_DEST}`);

fs.mkdirSync(WASM_DEST, { recursive: true });
const wasmFiles = fs.readdirSync(WASM_SRC);
for (const file of wasmFiles) {
  fs.copyFileSync(path.join(WASM_SRC, file), path.join(WASM_DEST, file));
}
console.log(`  Copied ${wasmFiles.length} files`);

// 2. Download hand_landmarker.task to public/models/
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const MODEL_DEST = path.join(ROOT, 'public', 'models', 'hand_landmarker.task');

if (!fs.existsSync(MODEL_DEST)) {
  console.log(`Downloading MediaPipe hand model...`);
  console.log(`  From: ${MODEL_URL}`);
  console.log(`  To:   ${MODEL_DEST}`);

  // Use fetch (Node 18+)
  const response = await fetch(MODEL_URL);
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
  const buffer = await response.arrayBuffer();
  fs.mkdirSync(path.dirname(MODEL_DEST), { recursive: true });
  fs.writeFileSync(MODEL_DEST, Buffer.from(buffer));

  const mb = (buffer.byteLength / 1024 / 1024).toFixed(1);
  console.log(`  Downloaded ${mb} MB`);
} else {
  console.log(`  Model already exists, skipping download`);
}

console.log('MediaPipe setup complete.');
