import PDFDocument from "pdfkit";
import type { Incident } from "../drizzle/schema";

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

/**
 * インシデント詳細PDFを生成してBufferで返す
 */
export async function generateIncidentPdf(incident: Incident): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
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
    // pdfkitはデフォルトでHelveticaを使用。日本語はUnicode対応フォントが必要。
    // システムフォントを使用する
    const FONT_PATH = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc";
    const FONT_BOLD_PATH = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc";

    try {
      doc.registerFont("Regular", FONT_PATH);
      doc.registerFont("Bold", FONT_BOLD_PATH);
    } catch {
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
    doc.font("Bold").fontSize(18).fillColor("white")
      .text("インシデント報告書", 65, 52);
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
      doc.font("Bold").fontSize(10).fillColor(RED)
        .text("⚠ 緊急対応が必要なインシデントです", 60, doc.y - 20);
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
