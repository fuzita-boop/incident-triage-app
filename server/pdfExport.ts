import PDFDocument from "pdfkit";
import type { Incident } from "../drizzle/schema";
import { renderFishboneToPng } from "./fishboneSvgRenderer";
import { loadFonts } from "./fontLoader";

const IMPACT_LABEL: Record<string, string> = {
  "0": "レベル0 - 利用者に未実施",
  "1": "レベル1 - 実害なし・処置不要",
  "2": "レベル2 - 追加観察・検査を要した",
  "3a": "レベル3a - 軽微な処置を要した",
  "3b": "レベル3b - 濃厚な処置・入院を要した",
  "4": "レベル4 - 永続的障害・後遺症",
  "5": "レベル5 - 死亡",
};

const REPORT_TYPE_LABEL: Record<string, string> = {
  incident: "インシデント（ヒヤリハット）",
  accident: "アクシデント（事故報告書）",
};

const URGENCY_LABEL: Record<string, string> = {
  High: "高（要緊急対応）",
  Medium: "中",
  Low: "低",
};

function parseJsonArray(val: string | null | undefined): string[] {
  if (!val) return [];
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

export interface FishboneData {
  effect: string;
  categories: { name: string; causes: string[] }[];
}

export interface AnalysisData {
  totalSimilarCases: number;
  topLocations: { name: string; count: number }[];
  hourlyPattern: { hour: string; count: number }[];
  byImpactLevel: Record<string, number>;
  topCauses: { keyword: string; count: number }[];
}

export interface PdfShellAnalysis {
  fishbone?: FishboneData | null;
  analysis?: AnalysisData | null;
}

/**
 * インシデント詳細PDFを生成してBufferで返す
 */
export async function generateIncidentPdf(incident: Incident, shellAnalysis?: PdfShellAnalysis): Promise<Buffer> {
  // フォントとフィッシュボーン画像を事前に生成（Promiseコールバック外でawaitを使うため）
  const fonts = await loadFonts();
  let fishbonePng: Buffer | null = null;
  const fishbone = shellAnalysis?.fishbone;
  if (fishbone && fishbone.categories.length > 0) {
    try {
      fishbonePng = await renderFishboneToPng(fishbone);
    } catch (e) {
      console.warn("[PDF] Fishbone pre-render failed:", e);
    }
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
      bufferPages: true,
      info: {
        Title: `インシデント報告書 #${incident.id}`,
        Author: "AIインシデント管理システム",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // ── フォント設定（日本語対応）──────────────────────────────────
    // fontLoaderで事前にロード済みのフォントバッファを使用
    // 本番環境ではストレージから取得、サンドボックスではシステムフォントを使用
    if (fonts.regular && fonts.bold) {
      doc.registerFont("Regular", fonts.regular);
      doc.registerFont("Bold", fonts.bold);
    } else {
      // フォールバック: Helvetica（日本語は文字化けするが構造は維持）
      doc.registerFont("Regular", "Helvetica");
      doc.registerFont("Bold", "Helvetica-Bold");
    }

    const PAGE_WIDTH = doc.page.width - 100; // margin 50 * 2
    const TEAL = "#2d7d72";
    const GRAY = "#6b7280";
    const LIGHT_GRAY = "#f3f4f6";
    const RED = "#dc2626";
    const ORANGE = "#d97706";

    // ── ヘッダー ────────────────────────────────────────────────────
    doc.rect(50, 40, PAGE_WIDTH, 60).fill(TEAL);
    const headerTitle = incident.reportType === "accident" ? "アクシデント報告書" : "インシデント報告書";
    doc.font("Bold").fontSize(18).fillColor("white")
      .text(headerTitle, 65, 52);
    doc.font("Regular").fontSize(10).fillColor("white")
      .text(`AIインシデント管理システム　確定済み報告書　#${incident.id}`, 65, 78);
    doc.moveDown(3);

    // ── 報告種別バッジ ───────────────────────────────────────────────
    const reportLabel = REPORT_TYPE_LABEL[incident.reportType ?? "incident"] ?? incident.reportType ?? "—";
    const isAccident = incident.reportType === "accident";
    const badgeColor = isAccident ? RED : "#2563eb";
    doc.roundedRect(50, doc.y, 160, 22, 4).fill(badgeColor);
    doc.font("Bold").fontSize(10).fillColor("white")
      .text(reportLabel, 58, doc.y - 18, { width: 145, align: "center" });
    doc.moveDown(1.5);

    // 緊急アラート
    const isUrgent = incident.urgency === "High" || ["3b", "4", "5"].includes(incident.impactLevel ?? "");
    if (isUrgent) {
      doc.rect(50, doc.y, PAGE_WIDTH, 24).fill("#fef2f2");
      doc.rect(50, doc.y - 24, 4, 24).fill(RED);
      const alertLabel = isAccident ? "アクシデント（事故）" : "インシデント（ヒヤリハット）";
      doc.font("Bold").fontSize(10).fillColor(RED)
        .text(`⚠ 緊急対応が必要な${alertLabel}です`, 60, doc.y - 20);
      doc.moveDown(1.5);
    }

    // ── セクション描画ヘルパー ───────────────────────────────────────
    function sectionTitle(title: string) {
      doc.moveDown(0.5);
      doc.rect(50, doc.y, PAGE_WIDTH, 20).fill(TEAL);
      doc.font("Bold").fontSize(11).fillColor("white")
        .text(title, 58, doc.y - 16);
      doc.moveDown(1.2);
    }

    function field(label: string, value: string | null | undefined, color?: string) {
      const y = doc.y;
      doc.font("Bold").fontSize(9).fillColor(GRAY).text(label, 50, y, { width: 120, continued: false });
      doc.font("Regular").fontSize(10).fillColor(color ?? "#111827")
        .text(value || "—", 175, y, { width: PAGE_WIDTH - 125 });
      doc.moveDown(0.3);
    }

    function badgeField(label: string, value: string, badgeColor: string) {
      const y = doc.y;
      doc.font("Bold").fontSize(9).fillColor(GRAY).text(label, 50, y, { width: 120 });
      doc.roundedRect(175, y - 2, 100, 16, 3).fill(badgeColor);
      doc.font("Bold").fontSize(9).fillColor("white")
        .text(value, 177, y, { width: 96, align: "center" });
      doc.moveDown(0.8);
    }

    // ── 基本情報 ────────────────────────────────────────────────────
    sectionTitle("基本情報");
    field("発生日時", incident.occurredAt);
    field("発生場所", incident.location);
    field("対象者イニシャル", incident.subjectInitials);
    field("登録日時", formatDate(incident.createdAt));
    field("確定日時", formatDate(incident.confirmedAt));

    // ── 分類・評価 ──────────────────────────────────────────────────
    sectionTitle("分類・評価");
    const impactLabel = IMPACT_LABEL[incident.impactLevel ?? "0"] ?? incident.impactLevel ?? "—";
    const impactColor = ["3b", "4", "5"].includes(incident.impactLevel ?? "") ? RED :
      ["3a", "2"].includes(incident.impactLevel ?? "") ? ORANGE : "#16a34a";
    field("影響度レベル", impactLabel, impactColor);

    const urgencyColor = incident.urgency === "High" ? RED : incident.urgency === "Medium" ? ORANGE : "#16a34a";
    const importanceColor = incident.importance === "High" ? RED : incident.importance === "Medium" ? ORANGE : "#16a34a";
    field("緊急対応性", URGENCY_LABEL[incident.urgency ?? "Low"] ?? incident.urgency ?? "—", urgencyColor);
    field("重要度", incident.importance ?? "—", importanceColor);

    // ── 事象概要 ────────────────────────────────────────────────────
    sectionTitle("事象概要");
    field("何が起きたか", incident.summaryWhat);
    field("原因", incident.summaryCause);
    field("結果・影響", incident.summaryResult);

    // ── 報告書記載の対策 ─────────────────────────────────────────────
    const reportedActions = parseJsonArray(incident.reportedActions);
    if (reportedActions.length > 0) {
      sectionTitle("報告書記載の対策");
      for (const action of reportedActions) {
        const y = doc.y;
        doc.circle(58, y + 4, 3).fill(TEAL);
        doc.font("Regular").fontSize(10).fillColor("#111827")
          .text(action, 68, y, { width: PAGE_WIDTH - 18 });
        doc.moveDown(0.3);
      }
    }

    // ── AI提案の再発防止策 ───────────────────────────────────────────
    const aiActions = parseJsonArray(incident.aiSuggestedActions);
    if (aiActions.length > 0) {
      sectionTitle("AI提案の再発防止策");
      doc.font("Regular").fontSize(9).fillColor(GRAY)
        .text("医療・介護安全管理の専門的観点から提案された再発防止策です。", 50, doc.y, { width: PAGE_WIDTH });
      doc.moveDown(0.5);
      for (let i = 0; i < aiActions.length; i++) {
        const y = doc.y;
        doc.rect(50, y, 20, 16).fill(TEAL);
        doc.font("Bold").fontSize(9).fillColor("white")
          .text(String(i + 1), 50, y + 2, { width: 20, align: "center" });
        doc.font("Regular").fontSize(10).fillColor("#111827")
          .text(aiActions[i]!, 76, y, { width: PAGE_WIDTH - 26 });
        doc.moveDown(0.5);
      }
    }

    // ── シェル分析: フィッシュボーン分析（SVG→PNG画像として埋め込み） ────────────────────────────
    const fishbone = shellAnalysis?.fishbone;
    if (fishbone && fishbone.categories.length > 0) {
      if (doc.y > doc.page.height - 240) doc.addPage();
      sectionTitle("シェル分析: フィッシュボーン図（5M特性要因図）");
      doc.font("Regular").fontSize(9).fillColor(GRAY)
        .text("人・手順・機械設備・環境・管理の5M視点で構造化した原因分析です。", 50, doc.y, { width: PAGE_WIDTH });
      doc.moveDown(0.5);

      if (fishbonePng) {
        // 事前生成済みPNG画像をPDFに埋め込む
        const imgW = PAGE_WIDTH;
        const imgH = Math.round(imgW * (420 / 760));
        if (doc.y + imgH > doc.page.height - 60) doc.addPage();
        doc.image(fishbonePng, 50, doc.y, { width: imgW, height: imgH });
        doc.y = doc.y + imgH + 4;
      } else {
        // フォールバック: テキスト形式
        for (const cat of fishbone.categories) {
          if (doc.y > doc.page.height - 80) doc.addPage();
          doc.font("Bold").fontSize(9).fillColor("#111827").text(`▶ ${cat.name}`, 50, doc.y, { width: PAGE_WIDTH });
          doc.moveDown(0.2);
          for (const cause of cat.causes) {
            doc.font("Regular").fontSize(9).fillColor("#374151").text(`  • ${cause}`, 60, doc.y, { width: PAGE_WIDTH - 10 });
            doc.moveDown(0.15);
          }
          doc.moveDown(0.3);
        }
      }
    }

    // ── シェル分析: 統計的要因分析 ────────────────────────────
    const analysis = shellAnalysis?.analysis;
    if (analysis && analysis.totalSimilarCases > 0) {
      if (doc.y > doc.page.height - 160) doc.addPage();
      sectionTitle("シェル分析: 統計的要因分析");
      doc.font("Regular").fontSize(9).fillColor(GRAY)
        .text(`同種別の確定済み事例 ${analysis.totalSimilarCases}件に基づく頃出原因キーワード分析です。`, 50, doc.y, { width: PAGE_WIDTH });
      doc.moveDown(0.5);

      if (analysis.topCauses.length > 0) {
        const maxCount = analysis.topCauses[0]?.count ?? 1;
        for (let i = 0; i < Math.min(analysis.topCauses.length, 8); i++) {
          const item = analysis.topCauses[i]!;
          const barW = Math.round((item.count / maxCount) * (PAGE_WIDTH - 120));
          const rowY = doc.y;
          if (rowY > doc.page.height - 60) doc.addPage();
          // ランク番号
          doc.font("Bold").fontSize(9).fillColor(TEAL)
            .text(String(i + 1), 50, rowY, { width: 16, align: "right" });
          // キーワード
          doc.font("Regular").fontSize(9).fillColor("#111827")
            .text(item.keyword, 72, rowY, { width: 80 });
          // バー
          doc.rect(158, rowY + 1, barW, 10).fill(TEAL);
          // 件数
          doc.font("Bold").fontSize(8).fillColor(TEAL)
            .text(`${item.count}件`, 162 + barW, rowY + 1, { width: 30 });
          doc.moveDown(0.6);
        }
      }
    }

    // ── フッター ────────────────────────────────────────────────────
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      doc.font("Regular").fontSize(8).fillColor(GRAY)
        .text(
          `AIインシデント管理システム　出力日時: ${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}　${i + 1} / ${pageCount}`,
          50,
          doc.page.height - 40,
          { width: PAGE_WIDTH, align: "center" }
        );
    }

    doc.end();
  });
}
