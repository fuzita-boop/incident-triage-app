/**
 * フォントローダー
 * 本番環境ではシステムフォントが存在しないため、
 * Manusストレージからフォントをダウンロードしてメモリにキャッシュする。
 * サンドボックス環境ではシステムフォントを優先使用する。
 */
import { existsSync, readFileSync } from "fs";
import { storageGetSignedUrl } from "./storage";

// Manusストレージにアップロード済みのサブセットフォントキー
// (manus-upload-file --webdev で生成されたキー)
const FONT_STORAGE_KEY_REGULAR = "NotoSansCJKsc-Regular-subset_7bf22764.otf";
const FONT_STORAGE_KEY_BOLD = "NotoSansCJKsc-Bold-subset_2046c248.otf";

// システムフォントパス（サンドボックス環境）
const SYSTEM_FONT_REGULAR = "/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf";
const SYSTEM_FONT_BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJKsc-Bold.otf";

// キャッシュ
let cachedRegular: Buffer | null = null;
let cachedBold: Buffer | null = null;
let loadPromise: Promise<void> | null = null;

async function downloadFont(key: string): Promise<Buffer> {
  console.log(`[FontLoader] Getting signed URL for: ${key}`);
  const signedUrl = await storageGetSignedUrl(key);
  console.log(`[FontLoader] Downloading font from signed URL...`);
  const resp = await fetch(signedUrl);
  if (!resp.ok) throw new Error(`Font download failed (${resp.status}): ${key}`);
  const arrayBuffer = await resp.arrayBuffer();
  const buf = Buffer.from(arrayBuffer);
  console.log(`[FontLoader] Font downloaded: ${key} (${buf.length} bytes)`);
  return buf;
}

async function loadFontsInternal(): Promise<void> {
  // サンドボックス環境: システムフォントを使用
  if (existsSync(SYSTEM_FONT_REGULAR) && existsSync(SYSTEM_FONT_BOLD)) {
    cachedRegular = readFileSync(SYSTEM_FONT_REGULAR);
    cachedBold = readFileSync(SYSTEM_FONT_BOLD);
    console.log("[FontLoader] Using system fonts (sandbox)");
    return;
  }

  // 本番環境: Manusストレージからダウンロード
  console.log("[FontLoader] System fonts not found, downloading from Manus storage...");
  try {
    [cachedRegular, cachedBold] = await Promise.all([
      downloadFont(FONT_STORAGE_KEY_REGULAR),
      downloadFont(FONT_STORAGE_KEY_BOLD),
    ]);
    console.log("[FontLoader] Fonts loaded from Manus storage successfully");
  } catch (e) {
    console.error("[FontLoader] Failed to load fonts from storage:", e);
    // フォールバック: nullのまま（pdfExportでHelveticaを使用）
    // この場合は日本語が文字化けするが、PDFは生成される
  }
}

/**
 * フォントをロードする（初回のみ実行、以降はキャッシュを返す）
 */
export async function loadFonts(): Promise<{ regular: Buffer | null; bold: Buffer | null }> {
  if (cachedRegular && cachedBold) {
    return { regular: cachedRegular, bold: cachedBold };
  }
  if (!loadPromise) {
    loadPromise = loadFontsInternal();
  }
  await loadPromise;
  return { regular: cachedRegular, bold: cachedBold };
}

/**
 * キャッシュをクリアする（テスト用）
 */
export function clearFontCache(): void {
  cachedRegular = null;
  cachedBold = null;
  loadPromise = null;
}
