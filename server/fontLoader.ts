/**
 * フォントローダー
 * 本番環境ではシステムフォントが存在しないため、
 * ストレージからフォントをダウンロードしてメモリにキャッシュする。
 * サンドボックス環境ではシステムフォントを優先使用する。
 */
import { existsSync, readFileSync } from "fs";
import { storageGetSignedUrl } from "./storage";

// ストレージにアップロード済みのフォントキー
const FONT_STORAGE_KEY_REGULAR = "NotoSansCJKsc-Regular_46c3e432.otf";
const FONT_STORAGE_KEY_BOLD = "NotoSansCJKsc-Bold_e6d70b86.otf";

// システムフォントパス（サンドボックス環境）
const SYSTEM_FONT_REGULAR = "/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf";
const SYSTEM_FONT_BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJKsc-Bold.otf";

// キャッシュ
let cachedRegular: Buffer | null = null;
let cachedBold: Buffer | null = null;
let loadPromise: Promise<void> | null = null;

async function downloadFont(key: string): Promise<Buffer> {
  const signedUrl = await storageGetSignedUrl(key);
  const resp = await fetch(signedUrl);
  if (!resp.ok) throw new Error(`Font download failed (${resp.status}): ${key}`);
  const arrayBuffer = await resp.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function loadFontsInternal(): Promise<void> {
  // サンドボックス環境: システムフォントを使用
  if (existsSync(SYSTEM_FONT_REGULAR) && existsSync(SYSTEM_FONT_BOLD)) {
    cachedRegular = readFileSync(SYSTEM_FONT_REGULAR);
    cachedBold = readFileSync(SYSTEM_FONT_BOLD);
    console.log("[FontLoader] Using system fonts");
    return;
  }

  // 本番環境: ストレージからダウンロード
  console.log("[FontLoader] Downloading fonts from storage...");
  try {
    [cachedRegular, cachedBold] = await Promise.all([
      downloadFont(FONT_STORAGE_KEY_REGULAR),
      downloadFont(FONT_STORAGE_KEY_BOLD),
    ]);
    console.log("[FontLoader] Fonts loaded from storage successfully");
  } catch (e) {
    console.warn("[FontLoader] Failed to load fonts from storage:", e);
    // フォールバック: nullのまま（pdfExportでHelveticaを使用）
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
