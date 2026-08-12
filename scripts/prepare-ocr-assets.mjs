import { copyFile, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destination = resolve(projectRoot, "client/public/ocr");

const files = [
  ["node_modules/tesseract.js/dist/worker.min.js", "worker.min.js"],
  ["node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js", "tesseract-core-lstm.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-lstm.wasm", "tesseract-core-lstm.wasm"],
  ["node_modules/@tesseract.js-data/jpn/4.0.0/jpn.traineddata.gz", "lang/jpn.traineddata.gz"],
];

await rm(destination, { recursive: true, force: true });
for (const [source, target] of files) {
  const output = resolve(destination, target);
  await mkdir(dirname(output), { recursive: true });
  await copyFile(resolve(projectRoot, source), output);
}

console.log("ローカルOCRアセットを準備しました。");
