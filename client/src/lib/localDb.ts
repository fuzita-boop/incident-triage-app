import Dexie, { type Table } from "dexie";
import JSZip from "jszip";

export type ReportType = "incident" | "accident";
export type ReportStatus = "draft" | "confirmed";
export type Urgency = "High" | "Medium" | "Low";
export type ImpactLevel = "0" | "1" | "2" | "3a" | "3b" | "4" | "5";

export interface LocalReport {
  id: string;
  reportType: ReportType;
  status: ReportStatus;
  occurredAt: string;
  location: string;
  subjectInitials: string;
  summaryWhat: string;
  summaryCause: string;
  summaryResult: string;
  impactLevel: ImpactLevel;
  urgency: Urgency;
  importance: Urgency;
  reportedActions: string[];
  aiSuggestedActions: string[];
  fishbone: Record<string, string[]>;
  ocrText?: string;
  ocrWarnings?: string[];
  createdAt: number;
  updatedAt: number;
  confirmedAt?: number;
}

export interface LocalAttachment {
  id: string;
  reportId: string;
  name: string;
  type: string;
  size: number;
  blob: Blob;
  createdAt: number;
}

export interface ReportInput extends Partial<Omit<LocalReport, "id" | "createdAt" | "updatedAt">> {
  reportType: ReportType;
}

const defaultFishbone = (): Record<string, string[]> => ({
  "人": [],
  "手順": [],
  "機械・設備": [],
  "環境": [],
  "管理": [],
});

export function createEmptyReport(type: ReportType = "incident"): LocalReport {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    reportType: type,
    status: "draft",
    occurredAt: new Date().toISOString().slice(0, 16),
    location: "",
    subjectInitials: "",
    summaryWhat: "",
    summaryCause: "",
    summaryResult: "",
    impactLevel: "0",
    urgency: "Low",
    importance: "Low",
    reportedActions: [],
    aiSuggestedActions: [],
    fishbone: defaultFishbone(),
    createdAt: now,
    updatedAt: now,
  };
}

class IncidentLocalDatabase extends Dexie {
  reports!: Table<LocalReport, string>;
  attachments!: Table<LocalAttachment, string>;

  constructor() {
    super("incident-triage-local");
    this.version(1).stores({
      reports: "id, reportType, status, occurredAt, createdAt, updatedAt",
      attachments: "id, reportId, createdAt",
    });
  }
}

export const localDb = new IncidentLocalDatabase();

export async function listLocalReports(filters?: {
  keyword?: string;
  reportType?: ReportType | "all";
  status?: ReportStatus | "all";
  dateFrom?: string;
  dateTo?: string;
}): Promise<LocalReport[]> {
  const reports = await localDb.reports.orderBy("updatedAt").reverse().toArray();
  const keyword = filters?.keyword?.trim().toLocaleLowerCase("ja-JP");
  return reports.filter((report) => {
    if (filters?.reportType && filters.reportType !== "all" && report.reportType !== filters.reportType) return false;
    if (filters?.status && filters.status !== "all" && report.status !== filters.status) return false;
    if (filters?.dateFrom && report.occurredAt.slice(0, 10) < filters.dateFrom) return false;
    if (filters?.dateTo && report.occurredAt.slice(0, 10) > filters.dateTo) return false;
    if (!keyword) return true;
    const subject = [report.location, report.subjectInitials, report.summaryWhat, report.summaryCause, report.summaryResult]
      .join(" ")
      .toLocaleLowerCase("ja-JP");
    return subject.includes(keyword);
  });
}

export async function getLocalReport(id: string): Promise<LocalReport | undefined> {
  return localDb.reports.get(id);
}

export async function saveLocalReport(input: ReportInput & { id?: string }): Promise<LocalReport> {
  const current = input.id ? await localDb.reports.get(input.id) : undefined;
  const now = Date.now();
  const report: LocalReport = {
    ...(current ?? createEmptyReport(input.reportType)),
    ...input,
    id: current?.id ?? input.id ?? crypto.randomUUID(),
    reportType: input.reportType ?? current?.reportType ?? "incident",
    status: input.status ?? current?.status ?? "draft",
    occurredAt: input.occurredAt ?? current?.occurredAt ?? "",
    location: input.location ?? current?.location ?? "",
    subjectInitials: input.subjectInitials ?? current?.subjectInitials ?? "",
    summaryWhat: input.summaryWhat ?? current?.summaryWhat ?? "",
    summaryCause: input.summaryCause ?? current?.summaryCause ?? "",
    summaryResult: input.summaryResult ?? current?.summaryResult ?? "",
    impactLevel: input.impactLevel ?? current?.impactLevel ?? "0",
    urgency: input.urgency ?? current?.urgency ?? "Low",
    importance: input.importance ?? current?.importance ?? "Low",
    reportedActions: input.reportedActions ?? current?.reportedActions ?? [],
    aiSuggestedActions: input.aiSuggestedActions ?? current?.aiSuggestedActions ?? [],
    fishbone: input.fishbone ?? current?.fishbone ?? defaultFishbone(),
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
    confirmedAt: input.status === "confirmed" ? (current?.confirmedAt ?? now) : current?.confirmedAt,
  };
  await localDb.reports.put(report);
  return report;
}

export async function deleteLocalReport(id: string): Promise<void> {
  await localDb.transaction("rw", localDb.reports, localDb.attachments, async () => {
    await localDb.attachments.where("reportId").equals(id).delete();
    await localDb.reports.delete(id);
  });
}

export async function addLocalAttachments(reportId: string, files: File[]): Promise<void> {
  const now = Date.now();
  const entries: LocalAttachment[] = files.map((file) => ({
    id: crypto.randomUUID(),
    reportId,
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    blob: file,
    createdAt: now,
  }));
  if (entries.length) await localDb.attachments.bulkAdd(entries);
}

export async function listLocalAttachments(reportId: string): Promise<LocalAttachment[]> {
  return localDb.attachments.where("reportId").equals(reportId).sortBy("createdAt");
}

export async function deleteLocalAttachment(id: string): Promise<void> {
  await localDb.attachments.delete(id);
}

export async function getLocalStats() {
  const reports = await localDb.reports.toArray();
  const confirmed = reports.filter((r) => r.status === "confirmed");
  return {
    total: reports.length,
    confirmed: confirmed.length,
    drafts: reports.length - confirmed.length,
    incident: confirmed.filter((r) => r.reportType === "incident").length,
    accident: confirmed.filter((r) => r.reportType === "accident").length,
    urgent: confirmed.filter((r) => r.urgency === "High" || ["3b", "4", "5"].includes(r.impactLevel)).length,
  };
}

export interface MonthlyGroupStats {
  total: number;
  byImpactLevel: Record<string, number>;
  topLocations: { name: string; count: number }[];
  timeBlocks: Record<string, number>;
  topKeywords: { keyword: string; count: number }[];
  byUrgency: Record<string, number>;
  recentSummaries: Pick<LocalReport, "occurredAt" | "location" | "summaryWhat" | "impactLevel" | "urgency">[];
}

export interface MonthlyLocalReport {
  year: number;
  month: number;
  totalAll: number;
  incident: MonthlyGroupStats;
  accident: MonthlyGroupStats;
}

const KEYWORDS = [
  "転倒", "転落", "誤薬", "誤嚥", "皮膚損傷", "骨折", "出血", "感染",
  "確認不足", "手順違反", "コミュニケーション不足", "環境要因", "疲労", "注意不足", "設備不具合", "チェック漏れ",
];

function analyzeMonthlyGroup(rows: LocalReport[]): MonthlyGroupStats {
  const byImpactLevel: Record<string, number> = {};
  const locations: Record<string, number> = {};
  const keywords: Record<string, number> = {};
  const byUrgency: Record<string, number> = { High: 0, Medium: 0, Low: 0 };
  const timeBlocks: Record<string, number> = { "深夜(0-5時)": 0, "早朝(6-11時)": 0, "日中(12-17時)": 0, "夕方夜間(18-23時)": 0 };
  rows.forEach((report) => {
    byImpactLevel[report.impactLevel] = (byImpactLevel[report.impactLevel] ?? 0) + 1;
    byUrgency[report.urgency] = (byUrgency[report.urgency] ?? 0) + 1;
    const location = report.location.trim() || "不明";
    locations[location] = (locations[location] ?? 0) + 1;
    const hour = Number.parseInt(report.occurredAt.slice(11, 13), 10);
    if (!Number.isNaN(hour)) {
      const timeKey = hour < 6 ? "深夜(0-5時)" : hour < 12 ? "早朝(6-11時)" : hour < 18 ? "日中(12-17時)" : "夕方夜間(18-23時)";
      timeBlocks[timeKey] += 1;
    }
    const text = `${report.summaryWhat} ${report.summaryCause} ${report.summaryResult}`;
    KEYWORDS.forEach((keyword) => {
      if (text.includes(keyword)) keywords[keyword] = (keywords[keyword] ?? 0) + 1;
    });
  });
  return {
    total: rows.length,
    byImpactLevel,
    topLocations: Object.entries(locations).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count })),
    timeBlocks,
    topKeywords: Object.entries(keywords).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([keyword, count]) => ({ keyword, count })),
    byUrgency,
    recentSummaries: [...rows].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4).map(({ occurredAt, location, summaryWhat, impactLevel, urgency }) => ({ occurredAt, location, summaryWhat, impactLevel, urgency })),
  };
}

export async function getMonthlyLocalReport(year: number, month: number): Promise<MonthlyLocalReport> {
  const reports = (await localDb.reports.toArray()).filter((report) => {
    if (report.status !== "confirmed") return false;
    const date = new Date(report.occurredAt || report.createdAt);
    return date.getFullYear() === year && date.getMonth() + 1 === month;
  });
  return {
    year,
    month,
    totalAll: reports.length,
    incident: analyzeMonthlyGroup(reports.filter((report) => report.reportType === "incident")),
    accident: analyzeMonthlyGroup(reports.filter((report) => report.reportType === "accident")),
  };
}

interface BackupManifest {
  format: "incident-triage-local-backup";
  version: 1;
  createdAt: string;
  reports: LocalReport[];
  attachments: Omit<LocalAttachment, "blob">[];
}

export async function createLocalBackup(): Promise<Blob> {
  const [reports, attachments] = await Promise.all([localDb.reports.toArray(), localDb.attachments.toArray()]);
  const zip = new JSZip();
  const manifest: BackupManifest = {
    format: "incident-triage-local-backup",
    version: 1,
    createdAt: new Date().toISOString(),
    reports,
    attachments: attachments.map(({ blob: _blob, ...attachment }) => attachment),
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  await Promise.all(attachments.map(async (attachment) => {
    zip.file(`attachments/${attachment.id}`, await attachment.blob.arrayBuffer());
  }));
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

export async function restoreLocalBackup(file: File, mode: "replace" | "merge" = "merge"): Promise<{ reports: number; attachments: number }> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) throw new Error("バックアップ形式が正しくありません（manifest.jsonがありません）。");
  const manifest = JSON.parse(await manifestFile.async("text")) as BackupManifest;
  if (manifest.format !== "incident-triage-local-backup" || manifest.version !== 1) {
    throw new Error("対応していないバックアップ形式です。");
  }
  const attachments = await Promise.all(manifest.attachments.map(async (attachment) => {
    const data = zip.file(`attachments/${attachment.id}`);
    if (!data) throw new Error(`添付ファイル ${attachment.name} が見つかりません。`);
    const bytes = await data.async("uint8array");
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return { ...attachment, blob: new Blob([copy.buffer as ArrayBuffer], { type: attachment.type }) } satisfies LocalAttachment;
  }));
  await localDb.transaction("rw", localDb.reports, localDb.attachments, async () => {
    if (mode === "replace") await Promise.all([localDb.reports.clear(), localDb.attachments.clear()]);
    await localDb.reports.bulkPut(manifest.reports);
    if (attachments.length) await localDb.attachments.bulkPut(attachments);
  });
  return { reports: manifest.reports.length, attachments: manifest.attachments.length };
}
