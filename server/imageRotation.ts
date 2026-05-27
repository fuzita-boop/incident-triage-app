/**
 * imageRotation.ts
 * スキャン画像・PDFページの向き自動検出と回転補正ユーティリティ
 */
import sharp from "sharp";
import { invokeLLM } from "./_core/llm";

export type RotationDegrees = 0 | 90 | 180 | 270;

/**
 * AIを使って画像の向きを判定する
 * @returns 補正に必要な回転角度（0/90/180/270）
 */
export async function detectOrientationDegrees(
  imageBase64: string,
  mimeType: string
): Promise<RotationDegrees> {
  try {
    const dataUrl = `data:${mimeType};base64,${imageBase64}`;
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "あなたは画像の向きを判定するAIです。画像が正しく読める向きになるために必要な回転角度を返してください。",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `この画像を正しく読める向きにするために、何度時計回りに回転させる必要がありますか？
文字や図表が正立（上が上）になる角度を選んでください。
選択肢: 0, 90, 180, 270
数字のみを返してください。例: 90`,
            },
            {
              type: "image_url",
              image_url: { url: dataUrl, detail: "low" as const },
            },
          ],
        },
      ],
    });

    const content = response?.choices?.[0]?.message?.content;
    if (!content) return 0;
    const raw = typeof content === "string" ? content : JSON.stringify(content);
    const match = raw.match(/\b(0|90|180|270)\b/);
    if (!match) return 0;
    const deg = parseInt(match[1], 10);
    if (deg === 0 || deg === 90 || deg === 180 || deg === 270) {
      return deg as RotationDegrees;
    }
    return 0;
  } catch (e) {
    console.warn("[imageRotation] Orientation detection failed, assuming 0°:", e);
    return 0;
  }
}

/**
 * Base64エンコードされた画像をsharpで指定角度だけ回転させる
 * @returns 回転後のBase64文字列（JPEG形式）
 */
export async function rotateImageBase64(
  imageBase64: string,
  degrees: RotationDegrees
): Promise<string> {
  if (degrees === 0) return imageBase64;
  const inputBuffer = Buffer.from(imageBase64, "base64");
  const rotated = await sharp(inputBuffer)
    .rotate(degrees)
    .jpeg({ quality: 90 })
    .toBuffer();
  return rotated.toString("base64");
}

/**
 * 画像のBase64を受け取り、向き判定→回転補正→補正後Base64を返す
 * mimeTypeがPDFの場合はスキップ（PDFはページ単位で別途処理）
 */
export async function autoCorrectOrientation(
  imageBase64: string,
  mimeType: string
): Promise<{ correctedBase64: string; rotationApplied: RotationDegrees }> {
  // PDFはこの関数では処理しない（呼び出し元で各ページ画像として渡す）
  if (mimeType === "application/pdf") {
    return { correctedBase64: imageBase64, rotationApplied: 0 };
  }

  const degrees = await detectOrientationDegrees(imageBase64, mimeType);
  if (degrees === 0) {
    return { correctedBase64: imageBase64, rotationApplied: 0 };
  }

  console.log(`[imageRotation] Rotating image by ${degrees}°`);
  const correctedBase64 = await rotateImageBase64(imageBase64, degrees);
  return { correctedBase64, rotationApplied: degrees };
}

/**
 * PDFのBase64を受け取り、各ページを画像に変換して向き補正した後、
 * 補正済みページ画像のBase64配列を返す。
 * pdftoppm（poppler-utils）を使用してページ分割する。
 */
export async function extractAndCorrectPdfPages(
  pdfBase64: string
): Promise<{ pageBase64s: string[]; rotationsApplied: RotationDegrees[] }> {
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const { mkdtemp, readdir, readFile, rm } = await import("fs/promises");
  const { join } = await import("path");
  const { tmpdir } = await import("os");
  const execFileAsync = promisify(execFile);

  // 一時ディレクトリにPDFを書き出す
  const tmpDir = await mkdtemp(join(tmpdir(), "pdf-pages-"));
  const pdfPath = join(tmpDir, "input.pdf");
  const { writeFile } = await import("fs/promises");
  await writeFile(pdfPath, Buffer.from(pdfBase64, "base64"));

  try {
    // pdftoppmでJPEGに変換（解像度150dpi）
    const outputPrefix = join(tmpDir, "page");
    await execFileAsync("pdftoppm", ["-jpeg", "-r", "150", pdfPath, outputPrefix]);

    // 生成されたページファイルをソートして読み込む
    const files = (await readdir(tmpDir))
      .filter((f) => f.startsWith("page") && f.endsWith(".jpg"))
      .sort();

    if (files.length === 0) {
      // pdftoppmが失敗した場合はPDF全体をそのまま返す
      return { pageBase64s: [pdfBase64], rotationsApplied: [0] };
    }

    const pageBase64s: string[] = [];
    const rotationsApplied: RotationDegrees[] = [];

    for (const file of files) {
      const pageBuffer = await readFile(join(tmpDir, file));
      const pageBase64 = pageBuffer.toString("base64");

      // 各ページの向き判定と補正
      const degrees = await detectOrientationDegrees(pageBase64, "image/jpeg");
      if (degrees !== 0) {
        console.log(`[imageRotation] PDF page ${file}: rotating ${degrees}°`);
        const corrected = await rotateImageBase64(pageBase64, degrees);
        pageBase64s.push(corrected);
      } else {
        pageBase64s.push(pageBase64);
      }
      rotationsApplied.push(degrees);
    }

    return { pageBase64s, rotationsApplied };
  } finally {
    // 一時ファイルを削除
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
