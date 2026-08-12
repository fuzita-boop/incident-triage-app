import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import mysql from "mysql2/promise";
import JSZip from "jszip";

const outputPath = path.resolve(process.cwd(), process.argv[2] ?? `incident-triage-legacy-backup-${new Date().toISOString().slice(0, 10)}.zip`);

function parseArray(value) {
  if (!value) return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : []; } catch { return []; }
}

function epoch(value) {
  const timestamp = new Date(value ?? Date.now()).getTime();
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

async function signedDownloadUrl(key) {
  const forgeUrl = process.env.BUILT_IN_FORGE_API_URL?.replace(/\/+$/, "");
  const forgeKey = process.env.BUILT_IN_FORGE_API_KEY;
  if (!forgeUrl || !forgeKey) throw new Error("ストレージ用の実行環境が見つかりません。旧Manusプロジェクトの環境で実行してください。");
  const endpoint = new URL("v1/storage/presign/get", `${forgeUrl}/`);
  endpoint.searchParams.set("path", key.replace(/^\/+/, ""));
  const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${forgeKey}` } });
  if (!response.ok) throw new Error(`添付ファイルの取得URL生成に失敗しました (${response.status})`);
  const body = await response.json();
  return body.url;
}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URLがありません。旧Manusプロジェクトの環境で実行してください。");

const db = await mysql.createConnection(process.env.DATABASE_URL);
try {
  const [rows] = await db.execute("SELECT * FROM incidents ORDER BY createdAt ASC");
  const zip = new JSZip();
  const reports = [];
  const attachments = [];

  for (const row of rows) {
    const reportId = crypto.randomUUID();
    reports.push({
      id: reportId,
      reportType: row.reportType === "accident" ? "accident" : "incident",
      status: row.status === "confirmed" ? "confirmed" : "draft",
      occurredAt: row.occurredAt ?? "",
      location: row.location ?? "",
      subjectInitials: row.subjectInitials ?? "",
      summaryWhat: row.summaryWhat ?? "",
      summaryCause: row.summaryCause ?? "",
      summaryResult: row.summaryResult ?? "",
      impactLevel: row.impactLevel ?? "0",
      urgency: row.urgency ?? "Low",
      importance: row.importance ?? "Low",
      reportedActions: parseArray(row.reportedActions),
      aiSuggestedActions: parseArray(row.aiSuggestedActions ?? row.preventionActions),
      fishbone: { "人": [], "手順": [], "機械・設備": [], "環境": [], "管理": [] },
      createdAt: epoch(row.createdAt),
      updatedAt: epoch(row.updatedAt),
      confirmedAt: row.confirmedAt ? epoch(row.confirmedAt) : undefined,
    });

    if (row.fileKey) {
      const attachmentId = crypto.randomUUID();
      const sourceUrl = await signedDownloadUrl(row.fileKey);
      const source = await fetch(sourceUrl);
      if (!source.ok) throw new Error(`添付ファイルのダウンロードに失敗しました (${source.status})`);
      const data = await source.arrayBuffer();
      const name = String(row.fileKey).split("/").pop() || `attachment-${attachmentId}`;
      attachments.push({ id: attachmentId, reportId, name, type: row.fileMimeType || "application/octet-stream", size: data.byteLength, createdAt: epoch(row.createdAt) });
      zip.file(`attachments/${attachmentId}`, data);
    }
  }

  zip.file("manifest.json", JSON.stringify({ format: "incident-triage-local-backup", version: 1, createdAt: new Date().toISOString(), reports, attachments }, null, 2));
  await fs.writeFile(outputPath, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } }));
  console.log(`バックアップを作成しました: ${outputPath}`);
  console.log(`報告書: ${reports.length}件 / 添付: ${attachments.length}件`);
  console.log("このZIPは個人情報を含む可能性があります。Gitへ追加せず、暗号化済みの端末内保管先へ移動してください。");
} finally {
  await db.end();
}
