// Downloads the detector models into public/models (gitignored). `pnpm dev` and `pnpm build` run it first, so the
// GitHub Pages build includes them. onnxruntime-web's wasm is bundled by Vite, so nothing else needs copying.
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

// COCO-pretrained YOLOX, Apache-2.0, for the spike and eval pages. Keep in sync with src/shared/detector/models.ts.
const YOLOX = 'https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0';
// This repo's trained models for the Camera tab (training/README.md), published as a release because they're too
// big for git. A new model goes in a new release (models-v2, …) so old builds keep working.
const OURS = 'https://github.com/BrandonSchultz0731/basketball-scorekeeper/releases/download/models-v1';
const MODELS = [
  { file: 'yolox_nano.onnx', bytes: 3659407, from: YOLOX }, // 416x416
  { file: 'yolox_tiny.onnx', bytes: 20219662, from: YOLOX }, // 416x416
  { file: 'yolox_s.onnx', bytes: 35858002, from: YOLOX }, // 640x640
  {
    file: 'yolox_tiny_ball_tiny_v1_416.onnx', bytes: 20166958, from: OURS,
    sha256: '017dcd7378a46c84d2b6ba89eab1d0c94c0453f5e24f5165e3177987f750c9f5',
  },
  {
    file: 'make_v1.onnx', bytes: 776983, from: OURS,
    sha256: 'a5f3eee3aeb5e315acb8467712daa72995c46e5468bd5f3aa1ac0ef5a4b58f50',
  },
];

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const ok = (m, path) => existsSync(path) && statSync(path).size === m.bytes && (!m.sha256 || sha256(path) === m.sha256);

const modelDir = join(root, 'public/models');
mkdirSync(modelDir, { recursive: true });
for (const m of MODELS) {
  const dest = join(modelDir, m.file);
  if (ok(m, dest)) continue;
  console.log(`downloading ${m.file}…`);
  const res = await fetch(`${m.from}/${m.file}`);
  if (!res.ok) throw new Error(`${m.from}/${m.file}: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  if (!ok(m, dest)) throw new Error(`${m.file}: wrong size or checksum after download`);
}
