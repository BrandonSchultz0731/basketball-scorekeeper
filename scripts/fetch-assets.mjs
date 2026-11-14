// Downloads the detector model into public/models (gitignored).
// onnxruntime-web's wasm is bundled by Vite, so nothing else needs copying.
import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

// COCO-pretrained YOLOX, Apache-2.0. Keep in sync with src/shared/detector/models.ts.
const RELEASE = 'https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0';
const MODELS = [
  { file: 'yolox_nano.onnx', bytes: 3659407 }, // 416x416
  { file: 'yolox_tiny.onnx', bytes: 20219662 }, // 416x416
  { file: 'yolox_s.onnx', bytes: 35858002 }, // 640x640
].map((m) => ({ ...m, url: `${RELEASE}/${m.file}` }));

const modelDir = join(root, 'public/models');
mkdirSync(modelDir, { recursive: true });
for (const m of MODELS) {
  const dest = join(modelDir, m.file);
  if (existsSync(dest) && statSync(dest).size === m.bytes) continue;
  console.log(`downloading ${m.file}…`);
  const res = await fetch(m.url);
  if (!res.ok) throw new Error(`${m.url}: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  const size = statSync(dest).size;
  if (size !== m.bytes) throw new Error(`${m.file}: expected ${m.bytes} bytes, got ${size}`);
}
