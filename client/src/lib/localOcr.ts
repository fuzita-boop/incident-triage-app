import Tesseract from "tesseract.js";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { createEmptyReport, type ImpactLevel, type LocalReport, type ReportType } from "@/lib/localDb";

const MAX_PDF_PAGES = 20;
const OCR_ASSET_ROOT = `${import.meta.env.BASE_URL}ocr`;

export interface OcrProgress {
  current: number;
  total: number;
  percent: number;
  message: string;
}

export interface LocalOcrResult {
  text: string;
  pages: number;
  warnings: string[];
}

type ProgressCallback = (progress: OcrProgress) => void;
type PdfPage = {
  getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
  getViewport: (options: { scale: number; rotation?: number }) => { width: number; height: number };
  render: (options: any) => { promise: Promise<void> };
  rotate: number;
};

function emitProgress(callback: ProgressCallback | undefined, current: number, total: number, message: string) {
  callback?.({ current, total, percent: total ? Math.round((current / total) * 100) : 0, message });
}

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

async function normalizeImageOrientation(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const maxEdge = 2400;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("画像処理用のCanvasを作成できませんでした。");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

async function createJapaneseWorker(onProgress?: ProgressCallback) {
  return Tesseract.createWorker("jpn", Tesseract.OEM.LSTM_ONLY, {
    workerPath: `${OCR_ASSET_ROOT}/worker.min.js`,
    corePath: `${OCR_ASSET_ROOT}/tesseract-core-lstm.wasm.js`,
    langPath: `${OCR_ASSET_ROOT}/lang`,
    workerBlobURL: false,
    gzip: true,
    logger: (event) => {
      if (event.status) emitProgress(onProgress, Math.round(event.progress * 100), 100, `OCR準備中: ${event.status}`);
    },
  });
}

function rotateCanvas(source: HTMLCanvasElement, degrees: 0 | 90 | 180 | 270): HTMLCanvasElement {
  if (degrees === 0) return source;
  const canvas = document.createElement("canvas");
  const quarterTurn = degrees === 90 || degrees === 270;
  canvas.width = quarterTurn ? source.height : source.width;
  canvas.height = quarterTurn ? source.width : source.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("画像の向きを補正できませんでした。");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((degrees * Math.PI) / 180);
  context.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
}

async function recognizeCanvas(worker: Awaited<ReturnType<typeof createJapaneseWorker>>, canvas: HTMLCanvasElement): Promise<string> {
  const rotations: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270];
  let best = { text: "", confidence: -1 };
  for (const rotation of rotations) {
    const orientedCanvas = rotateCanvas(canvas, rotation);
    const result = await worker.recognize(orientedCanvas, { rotateAuto: false });
    const text = result.data.text.trim();
    const japaneseCharacters = (text.match(/[ぁ-んァ-ン一-龯]/g) ?? []).length;
    const score = result.data.confidence + Math.min(japaneseCharacters, 20) * 0.25;
    if (score > best.confidence) best = { text, confidence: score };
  }
  return best.text;
}

async function renderPdfPage(page: PdfPage): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale: 1.75, rotation: page.rotate });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("PDFページを描画できませんでした。");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, canvas, viewport }).promise;
  return canvas;
}

async function extractPdfText(
  file: File,
  worker: Awaited<ReturnType<typeof createJapaneseWorker>>,
  offset: number,
  progressTotal: number,
  onProgress?: ProgressCallback,
): Promise<{ text: string; pages: number; warnings: string[] }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const document = await pdfjs.getDocument({ data: bytes }).promise;
  const pageCount = Math.min(document.numPages, MAX_PDF_PAGES);
  const warnings: string[] = document.numPages > MAX_PDF_PAGES ? [`${file.name} は先頭${MAX_PDF_PAGES}ページまでOCRしました。`] : [];
  const sections: string[] = [];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    emitProgress(onProgress, offset + pageNumber - 1, progressTotal, `${file.name}（${pageNumber}/${pageCount}ページ）を読み取り中`);
    const page = (await document.getPage(pageNumber)) as PdfPage;
    const content = await page.getTextContent();
    const embeddedText = content.items.map((item) => item.str ?? "").join(" ").replace(/\s+/g, " ").trim();
    if (embeddedText.length >= 20) {
      sections.push(`【${file.name} ${pageNumber}ページ】\n${embeddedText}`);
      continue;
    }
    const canvas = await renderPdfPage(page);
    const text = await recognizeCanvas(worker, canvas);
    sections.push(`【${file.name} ${pageNumber}ページ】\n${text}`);
  }
  return { text: sections.join("\n\n").trim(), pages: pageCount, warnings };
}

export async function extractLocalOcr(files: File[], onProgress?: ProgressCallback): Promise<LocalOcrResult> {
  if (!files.length) throw new Error("画像またはPDFを選択してください。");
  const accepted = files.filter((file) => isPdf(file) || file.type.startsWith("image/"));
  if (!accepted.length) throw new Error("画像またはPDFを選択してください。");

  emitProgress(onProgress, 0, 100, "端末内OCRを準備しています");
  const worker = await createJapaneseWorker(onProgress);
  try {
    const sections: string[] = [];
    const warnings: string[] = [];
    let processedPages = 0;
    const totalPages = accepted.reduce((total, file) => total + (isPdf(file) ? 2 : 1), 0);

    for (const file of accepted) {
      if (isPdf(file)) {
        const result = await extractPdfText(file, worker, processedPages, totalPages, onProgress);
        processedPages += Math.max(1, result.pages);
        warnings.push(...result.warnings);
        if (result.text) sections.push(result.text);
      } else {
        emitProgress(onProgress, processedPages, totalPages, `${file.name} の向きを補正して読み取り中`);
        const canvas = await normalizeImageOrientation(file);
        const text = await recognizeCanvas(worker, canvas);
        processedPages += 1;
        if (text) sections.push(`【${file.name}】\n${text}`);
      }
    }
    emitProgress(onProgress, totalPages, totalPages, "文字の抽出が完了しました");
    return { text: sections.join("\n\n").trim(), pages: processedPages, warnings };
  } finally {
    await worker.terminate();
  }
}

function labeledText(text: string, labels: string[]): string {
  const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const match = text.match(new RegExp(`(?:${escaped})\\s*[：:]\\s*([^\\n]{1,120})`, "i"));
  return match?.[1]?.trim() ?? "";
}

function normalizeOcrText(text: string): string {
  const circledDigits: Record<string, string> = {
    "①": "1", "②": "2", "③": "3", "④": "4", "⑤": "5", "⑥": "6", "⑦": "7", "⑧": "8", "⑨": "9",
    "⑩": "10", "⑪": "11", "⑫": "12", "⑬": "13", "⑭": "14", "⑮": "15", "⑯": "16", "⑰": "17", "⑱": "18", "⑲": "19", "⑳": "20",
  };
  let normalized = text.replace(/[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]/g, (character) => circledDigits[character] ?? character);
  const characterGap = /([ぁ-んァ-ン一-龯々ー])[ \t]+(?=[ぁ-んァ-ン一-龯々ー])/g;
  for (let i = 0; i < 8; i += 1) {
    const compacted = normalized.replace(characterGap, "$1");
    if (compacted === normalized) break;
    normalized = compacted;
  }
  return normalized
    .replace(/([ぁ-んァ-ン一-龯々ー])\s*[:：]\s*/g, "$1:")
    .replace(/(\d)\s+(?=(?:年|月|日|時|分))/g, "$1")
    .replace(/(年|月|日|時|分)\s+(?=\d)/g, "$1")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ");
}

function guessReportType(text: string): ReportType {
  return /アクシデント|事故報告|転倒|転落|誤薬|骨折|出血|誤嚥/.test(text) ? "accident" : "incident";
}

function guessImpactLevel(text: string): ImpactLevel {
  const match = text.match(/(?:影響度|レベル|Lv)\s*[：:]?\s*(3a|3b|[0-5])/i);
  return (match?.[1]?.toLowerCase() as ImpactLevel | undefined) ?? "0";
}

function guessOccurredAt(text: string): string {
  const match = text.match(/(20\d{2})\s*[年/.\-]\s*(\d{1,2})\s*[月/.\-]\s*(\d{1,2})(?:日)?(?:\s*(\d{1,2})\s*[時:]\s*(\d{1,2})?)?/);
  if (!match) return createEmptyReport().occurredAt;
  const [, year, month, day, hour = "0", minute = "0"] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

function summaryFallback(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/^【[^】]+】\s*/, "").trim())
    .filter((line) => line.length >= 3)
    .slice(0, 12)
    .join("\n")
    .slice(0, 1800);
}

export function createDraftFromOcr(text: string, warnings: string[] = []): LocalReport {
  const normalizedText = normalizeOcrText(text);
  const reportType = guessReportType(normalizedText);
  const report = createEmptyReport(reportType);
  return {
    ...report,
    occurredAt: guessOccurredAt(normalizedText),
    location: labeledText(normalizedText, ["発生場所", "場所", "発生した場所"]),
    subjectInitials: labeledText(normalizedText, ["対象者", "利用者", "患者", "氏名", "イニシャル"]),
    summaryWhat: labeledText(normalizedText, ["事象概要", "内容", "経緯", "発生状況", "何が起きたか"]) || summaryFallback(normalizedText),
    summaryCause: labeledText(normalizedText, ["原因", "要因", "想定される要因"]),
    summaryResult: labeledText(normalizedText, ["対応", "結果", "対応状況", "処置"]),
    impactLevel: guessImpactLevel(normalizedText),
    urgency: /緊急|救急|至急|重篤/.test(normalizedText) ? "High" : "Low",
    importance: /緊急|救急|重篤|骨折|出血/.test(normalizedText) ? "High" : "Low",
    ocrText: normalizedText,
    ocrWarnings: warnings,
  };
}
