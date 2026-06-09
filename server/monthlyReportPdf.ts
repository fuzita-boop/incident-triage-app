import PDFDocument from "pdfkit";
import { loadFonts } from "./fontLoader";

// ─── 定数 ────────────────────────────────────────────────────────────────────

const PAGE_W = 595.28;   // A4 width (pt)
const PAGE_H = 841.89;   // A4 height (pt)
const MARGIN = 36;
const CONTENT_W = PAGE_W - MARGIN * 2;

const TEAL = "#0f766e";
const TEAL_LIGHT = "#ccfbf1";
const ORANGE = "#c2410c";
const ORANGE_LIGHT = "#ffedd5";
const GRAY = "#6b7280";
const GRAY_LIGHT = "#f3f4f6";
const BLACK = "#111827";
const BORDER = "#e5e7eb";

const IMPACT_SHORT: Record<string, string> = {
  "0": "Lv0", "1": "Lv1", "2": "Lv2",
  "3a": "Lv3a", "3b": "Lv3b", "4": "Lv4", "5": "Lv5",
};

const IMPACT_LABEL: Record<string, string> = {
  "0": "Lv0 未実施",
  "1": "Lv1 実害なし",
  "2": "Lv2 追加観察",
  "3a": "Lv3a 軽微処置",
  "3b": "Lv3b 濃厚処置",
  "4": "Lv4 永続障害",
  "5": "Lv5 死亡",
};

export interface MonthlyReportData {
  year: number;
  month: number;
  totalAll: number;
  incident: GroupStats;
  accident: GroupStats;
}

export interface GroupStats {
  total: number;
  byImpactLevel: Record<string, number>;
  topLocations: { name: string; count: number }[];
  timeBlocks: Record<string, number>;
  topKeywords: { keyword: string; count: number }[];
  byUrgency: Record<string, number>;
  recentSummaries: {
    occurredAt: string;
    location: string;
    summaryWhat: string;
    impactLevel: string;
    urgency: string;
  }[];
}

/**
 * 月次レポートPDFをA4 1枚で生成してBufferで返す
 */
export async function generateMonthlyReportPdf(data: MonthlyReportData): Promise<Buffer> {
  const fonts = await loadFonts();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 0,
      bufferPages: true,
      info: {
        Title: `月次レポート ${data.year}年${data.month}月`,
        Author: "AIインシデント管理システム",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    if (fonts.regular && fonts.bold) {
      doc.registerFont("Regular", fonts.regular);
      doc.registerFont("Bold", fonts.bold);
    } else {
      doc.registerFont("Regular", "Helvetica");
      doc.registerFont("Bold", "Helvetica-Bold");
    }

    // ─── ヘッダー帯 ────────────────────────────────────────────────────────
    doc.rect(0, 0, PAGE_W, 52).fill(TEAL);
    doc.font("Bold").fontSize(16).fillColor("#ffffff")
      .text(`${data.year}年${data.month}月 インシデント・アクシデント月次レポート`, MARGIN, 16, { width: CONTENT_W - 120 });
    doc.font("Regular").fontSize(9).fillColor("#a7f3d0")
      .text(`出力日: ${new Date().toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}`, PAGE_W - MARGIN - 110, 20, { width: 110, align: "right" });
    doc.font("Regular").fontSize(9).fillColor("#a7f3d0")
      .text("AIインシデント管理システム", PAGE_W - MARGIN - 110, 32, { width: 110, align: "right" });

    let y = 60;

    // ─── サマリー行（3ボックス） ────────────────────────────────────────────
    const boxW = (CONTENT_W - 8) / 3;
    const boxes = [
      { label: "合計件数", value: `${data.totalAll}件`, color: TEAL, bg: TEAL_LIGHT },
      { label: "インシデント（ヒヤリハット）", value: `${data.incident.total}件`, color: TEAL, bg: TEAL_LIGHT },
      { label: "アクシデント（事故報告書）", value: `${data.accident.total}件`, color: ORANGE, bg: ORANGE_LIGHT },
    ];
    boxes.forEach((b, i) => {
      const bx = MARGIN + i * (boxW + 4);
      doc.roundedRect(bx, y, boxW, 38, 4).fill(b.bg);
      doc.font("Regular").fontSize(8).fillColor(b.color).text(b.label, bx + 8, y + 6, { width: boxW - 16 });
      doc.font("Bold").fontSize(18).fillColor(b.color).text(b.value, bx + 8, y + 16, { width: boxW - 16 });
    });
    y += 46;

    // ─── 2カラムレイアウト ────────────────────────────────────────────────
    const colW = (CONTENT_W - 8) / 2;
    const colRight = MARGIN + colW + 8;

    // ── 左カラム: インシデント ────────────────────────────────────────────
    let ly = y;
    ly = drawGroupSection(doc, "インシデント（ヒヤリハット）", data.incident, MARGIN, ly, colW, TEAL, TEAL_LIGHT, fonts);

    // ── 右カラム: アクシデント ────────────────────────────────────────────
    let ry = y;
    ry = drawGroupSection(doc, "アクシデント（事故報告書）", data.accident, colRight, ry, colW, ORANGE, ORANGE_LIGHT, fonts);

    // ─── フッター ────────────────────────────────────────────────────────
    doc.rect(0, PAGE_H - 20, PAGE_W, 20).fill("#f9fafb");
    doc.font("Regular").fontSize(7).fillColor(GRAY)
      .text("本レポートはAIインシデント管理システムにより自動生成されました。内容の確認・修正は各担当者にご依頼ください。",
        MARGIN, PAGE_H - 14, { width: CONTENT_W });

    doc.end();
  });
}

// ─── グループセクション描画 ───────────────────────────────────────────────────

function drawGroupSection(
  doc: InstanceType<typeof PDFDocument>,
  title: string,
  stats: GroupStats,
  x: number,
  y: number,
  w: number,
  color: string,
  bgColor: string,
  fonts: { regular: Buffer | null; bold: Buffer | null }): number {
  // セクションタイトル
  doc.roundedRect(x, y, w, 18, 3).fill(color);
  doc.font("Bold").fontSize(9).fillColor("#ffffff")
    .text(title, x + 6, y + 5, { width: w - 12 });
  y += 22;

  if (stats.total === 0) {
    doc.roundedRect(x, y, w, 24, 3).fill(GRAY_LIGHT);
    doc.font("Regular").fontSize(9).fillColor(GRAY)
      .text("該当月の報告書はありません", x + 6, y + 8, { width: w - 12, align: "center" });
    return y + 30;
  }

  // ── 影響度レベル分布（横棒グラフ） ─────────────────────────────────────
  y = drawSubTitle(doc, "影響度レベル分布", x, y, w, color);
  const levels = ["0", "1", "2", "3a", "3b", "4", "5"];
  const maxLvlCount = Math.max(...levels.map((l) => stats.byImpactLevel[l] ?? 0), 1);
  const barAreaW = w - 70;
  for (const lvl of levels) {
    const cnt = stats.byImpactLevel[lvl] ?? 0;
    if (cnt === 0) continue;
    const barW = Math.max(2, Math.round((cnt / maxLvlCount) * barAreaW));
    const isHigh = lvl === "3b" || lvl === "4" || lvl === "5";
    const barColor = isHigh ? ORANGE : color;
    doc.font("Regular").fontSize(7).fillColor(BLACK)
      .text(IMPACT_LABEL[lvl] ?? lvl, x + 2, y + 1, { width: 58, lineBreak: false });
    doc.roundedRect(x + 62, y, barW, 8, 2).fill(barColor);
    doc.font("Bold").fontSize(7).fillColor(BLACK)
      .text(`${cnt}件`, x + 64 + barW, y + 1, { width: 20, lineBreak: false });
    y += 11;
  }
  y += 4;

  // ── 発生場所 TOP5 ──────────────────────────────────────────────────────
  if (stats.topLocations.length > 0) {
    y = drawSubTitle(doc, "発生場所 TOP5", x, y, w, color);
    const maxLocCount = stats.topLocations[0]?.count ?? 1;
    const locBarW = w - 70;
    for (const loc of stats.topLocations.slice(0, 5)) {
      const bw = Math.max(2, Math.round((loc.count / maxLocCount) * locBarW));
      doc.font("Regular").fontSize(7).fillColor(BLACK)
        .text(loc.name.slice(0, 10), x + 2, y + 1, { width: 58, lineBreak: false });
      doc.roundedRect(x + 62, y, bw, 8, 2).fill(color);
      doc.font("Bold").fontSize(7).fillColor(BLACK)
        .text(`${loc.count}件`, x + 64 + bw, y + 1, { width: 20, lineBreak: false });
      y += 11;
    }
    y += 4;
  }

  // ── 時間帯別 ──────────────────────────────────────────────────────────
  y = drawSubTitle(doc, "時間帯別発生状況", x, y, w, color);
  const timeOrder = ["深夜(0-5時)", "早朝(6-11時)", "日中(12-17時)", "夕方夜間(18-23時)"];
  const maxTimeCount = Math.max(...timeOrder.map((t) => stats.timeBlocks[t] ?? 0), 1);
  const timeBarW = w - 80;
  for (const slot of timeOrder) {
    const cnt = stats.timeBlocks[slot] ?? 0;
    const bw = Math.max(cnt > 0 ? 2 : 0, Math.round((cnt / maxTimeCount) * timeBarW));
    doc.font("Regular").fontSize(7).fillColor(BLACK)
      .text(slot, x + 2, y + 1, { width: 68, lineBreak: false });
    if (bw > 0) doc.roundedRect(x + 72, y, bw, 8, 2).fill(color);
    doc.font("Bold").fontSize(7).fillColor(BLACK)
      .text(`${cnt}件`, x + 74 + bw, y + 1, { width: 20, lineBreak: false });
    y += 11;
  }
  y += 4;

  // ── 頻出キーワード ────────────────────────────────────────────────────
  if (stats.topKeywords.length > 0) {
    y = drawSubTitle(doc, "頻出キーワード", x, y, w, color);
    const kwRow: string[] = [];
    for (const kw of stats.topKeywords.slice(0, 5)) {
      kwRow.push(`${kw.keyword}(${kw.count}件)`);
    }
    // タグ形式で横並び
    let kx = x + 2;
    for (const tag of kwRow) {
      const tw = doc.fontSize(7).widthOfString(tag) + 8;
      if (kx + tw > x + w - 2) { kx = x + 2; y += 14; }
      doc.roundedRect(kx, y, tw, 11, 3).fill(bgColor);
      doc.font("Regular").fontSize(7).fillColor(color).text(tag, kx + 4, y + 2, { lineBreak: false });
      kx += tw + 4;
    }
    y += 16;
  }

  // ── 直近事例一覧 ─────────────────────────────────────────────────────
  if (stats.recentSummaries.length > 0) {
    y = drawSubTitle(doc, "直近の報告事例", x, y, w, color);
    for (const s of stats.recentSummaries.slice(0, 4)) {
      const isHigh = s.urgency === "High" || s.impactLevel === "3b" || s.impactLevel === "4" || s.impactLevel === "5";
      const rowBg = isHigh ? ORANGE_LIGHT : GRAY_LIGHT;
      doc.roundedRect(x, y, w, 18, 2).fill(rowBg);
      const lvlTag = IMPACT_SHORT[s.impactLevel] ?? s.impactLevel;
      doc.font("Bold").fontSize(6.5).fillColor(isHigh ? ORANGE : color)
        .text(`[${lvlTag}]`, x + 2, y + 2, { width: 28, lineBreak: false });
      doc.font("Regular").fontSize(6.5).fillColor(GRAY)
        .text(s.occurredAt.slice(0, 10), x + 32, y + 2, { width: 50, lineBreak: false });
      doc.font("Regular").fontSize(6.5).fillColor(GRAY)
        .text(s.location.slice(0, 8), x + 84, y + 2, { width: 40, lineBreak: false });
      const what = s.summaryWhat.length > 38 ? s.summaryWhat.slice(0, 38) + "…" : s.summaryWhat;
      doc.font("Regular").fontSize(6.5).fillColor(BLACK)
        .text(what, x + 2, y + 10, { width: w - 4, lineBreak: false });
      y += 21;
    }
  }

  return y + 4;
}

// ─── サブタイトル描画ヘルパー ─────────────────────────────────────────────────

function drawSubTitle(
  doc: InstanceType<typeof PDFDocument>,
  title: string,
  x: number,
  y: number,
  w: number,
  color: string
): number {
  doc.moveTo(x, y + 8).lineTo(x + w, y + 8).stroke(BORDER);
  doc.font("Bold").fontSize(7.5).fillColor(color)
    .text(`▸ ${title}`, x + 2, y + 1, { width: w - 4 });
  return y + 13;
}
