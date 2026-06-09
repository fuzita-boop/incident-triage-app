import { and, asc, desc, eq, like, or, gte, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { incidents, InsertIncident, InsertUser, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ───────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];
  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };
  textFields.forEach(assignNullable);
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Incidents ───────────────────────────────────────────────────────────────

export async function createDraftIncident(data: InsertIncident) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(incidents).values({ ...data, status: "draft" });
  const id = (result as { insertId: number }).insertId;
  return getIncidentById(id);
}

export async function createDraftIncidents(dataList: InsertIncident[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const results = [];
  for (const data of dataList) {
    const [result] = await db.insert(incidents).values({ ...data, status: "draft" });
    const id = (result as { insertId: number }).insertId;
    const incident = await getIncidentById(id);
    if (incident) results.push(incident);
  }
  return results;
}

export async function getIncidentsByUploadGroup(uploadGroupId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(incidents).where(eq(incidents.uploadGroupId, uploadGroupId)).orderBy(asc(incidents.pageIndex));
}

export async function updateIncident(id: number, data: Partial<InsertIncident>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(incidents).set({ ...data, updatedAt: new Date() }).where(eq(incidents.id, id));
  return getIncidentById(id);
}

export async function confirmIncident(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(incidents)
    .set({ status: "confirmed", confirmedByUserId: userId, confirmedAt: new Date(), updatedAt: new Date() })
    .where(eq(incidents.id, id));
  return getIncidentById(id);
}

export async function getIncidentById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(incidents).where(eq(incidents.id, id)).limit(1);
  return result[0] ?? null;
}

export type IncidentFilter = {
  status?: "draft" | "confirmed";
  reportType?: "incident" | "accident";
  impactLevel?: string;
  urgency?: "High" | "Medium" | "Low";
  importance?: "High" | "Medium" | "Low";
  sortBy?: "createdAt" | "occurredAt" | "impactLevel";
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
  /** キーワード検索: summaryWhat / summaryCause / location / subjectInitials をLIKE検索 */
  keyword?: string;
  /** 発生日時の開始日（YYYY-MM-DD） */
  dateFrom?: string;
  /** 発生日時の終了日（YYYY-MM-DD） */
  dateTo?: string;
};

export async function listIncidents(filter: IncidentFilter = {}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conditions = [];
  if (filter.status) conditions.push(eq(incidents.status, filter.status));
  if (filter.reportType) conditions.push(eq(incidents.reportType, filter.reportType));
  if (filter.impactLevel) conditions.push(eq(incidents.impactLevel, filter.impactLevel as any));
  if (filter.urgency) conditions.push(eq(incidents.urgency, filter.urgency));
  if (filter.importance) conditions.push(eq(incidents.importance, filter.importance));
  if (filter.keyword) {
    const kw = `%${filter.keyword}%`;
    conditions.push(
      or(
        like(incidents.summaryWhat, kw),
        like(incidents.summaryCause, kw),
        like(incidents.location, kw),
        like(incidents.subjectInitials, kw),
        like(incidents.summaryResult, kw),
      )!
    );
  }
  if (filter.dateFrom) {
    conditions.push(gte(incidents.occurredAt, filter.dateFrom));
  }
  if (filter.dateTo) {
    conditions.push(lte(incidents.occurredAt, filter.dateTo + "\uffff"));
  }

  const sortCol = filter.sortBy === "occurredAt" ? incidents.occurredAt : incidents.createdAt;
  const orderFn = filter.sortOrder === "asc" ? asc : desc;

  const query = db
    .select()
    .from(incidents)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(orderFn(sortCol))
    .limit(filter.limit ?? 100)
    .offset(filter.offset ?? 0);

  return query;
}

export async function getMonthlyTrends(months: number = 12) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 過去N月分の確定済みインシデントを取得
  const all = await db.select().from(incidents).where(eq(incidents.status, "confirmed"));

  // 月ごとに集計（日本時間ベース）
  const trendMap: Record<string, { month: string; incident: number; accident: number; total: number }> = {};

  // 過去N月のキーを初期化
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = `${d.getFullYear()}年${d.getMonth() + 1}月`;
    trendMap[key] = { month: label, incident: 0, accident: 0, total: 0 };
  }

  for (const inc of all) {
    const jst = new Date(new Date(inc.createdAt).toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
    const key = `${jst.getFullYear()}-${String(jst.getMonth() + 1).padStart(2, "0")}`;
    if (!trendMap[key]) continue; // 範囲外はスキップ
    trendMap[key].total++;
    if (inc.reportType === "accident") {
      trendMap[key].accident++;
    } else {
      trendMap[key].incident++;
    }
  }

  return Object.values(trendMap);
}

export async function deleteIncident(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(incidents).where(eq(incidents.id, id));
}

/** 同じ fileKey を持つ残存レコード数を返す（削除前の参照カウント確認用） */
export async function countIncidentsByFileKey(fileKey: string): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(incidents).where(eq(incidents.fileKey, fileKey));
  return rows.length;
}

export async function deleteIncidentsByUploadGroup(uploadGroupId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(incidents).where(eq(incidents.uploadGroupId, uploadGroupId));
}

export async function getDashboardStats() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const all = await db.select().from(incidents).where(eq(incidents.status, "confirmed"));

  const byImpactLevel: Record<string, number> = {};
  const byReportType: Record<string, number> = { incident: 0, accident: 0 };
  const byUrgency: Record<string, number> = { High: 0, Medium: 0, Low: 0 };
  let totalDraft = 0;
  let totalConfirmed = 0;

  for (const inc of all) {
    const lvl = inc.impactLevel ?? "0";
    byImpactLevel[lvl] = (byImpactLevel[lvl] ?? 0) + 1;
    if (inc.reportType) byReportType[inc.reportType] = (byReportType[inc.reportType] ?? 0) + 1;
    if (inc.urgency) byUrgency[inc.urgency] = (byUrgency[inc.urgency] ?? 0) + 1;
    if (inc.status === "confirmed") totalConfirmed++;
  }

  const drafts = await db.select().from(incidents).where(eq(incidents.status, "draft"));
  totalDraft = drafts.length;

  return { byImpactLevel, byReportType, byUrgency, totalDraft, totalConfirmed, total: all.length };
}

/**
 * 特定の報告書と同じ reportType の確定済み事例を集計して分析データを返す。
 * 発生パターン分析・統計的要因分析に使用する。
 */
export async function getIncidentAnalysisData(reportType: "incident" | "accident") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const all = await db
    .select()
    .from(incidents)
    .where(and(eq(incidents.status, "confirmed"), eq(incidents.reportType, reportType)));

  // ── 場所別集計 ────────────────────────────────────────────────────────────
  const byLocation: Record<string, number> = {};
  for (const inc of all) {
    const loc = (inc.location ?? "不明").trim().slice(0, 20);
    byLocation[loc] = (byLocation[loc] ?? 0) + 1;
  }
  const topLocations = Object.entries(byLocation)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));

  // ── 時間帯別集計（occurredAt から時間部分を抽出）────────────────────────
  const byHour: Record<string, number> = {};
  for (const inc of all) {
    const raw = inc.occurredAt ?? "";
    // "HH:MM" or "YYYY-MM-DD HH:MM" or "午前HH時" などを考慮してhour抽出を試みる
    const hourMatch = raw.match(/(\d{1,2})[:時]/);
    const hour = hourMatch ? parseInt(hourMatch[1], 10) : null;
    if (hour !== null && hour >= 0 && hour <= 23) {
      const slot = `${String(hour).padStart(2, "0")}:00`;
      byHour[slot] = (byHour[slot] ?? 0) + 1;
    }
  }
  const hourlyPattern = Object.entries(byHour)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([hour, count]) => ({ hour, count }));

  // ── 影響度レベル別集計 ────────────────────────────────────────────────────
  const byImpactLevel: Record<string, number> = {};
  for (const inc of all) {
    const lvl = inc.impactLevel ?? "0";
    byImpactLevel[lvl] = (byImpactLevel[lvl] ?? 0) + 1;
  }

  // ── 原因キーワード頻度（summaryCause から頻出語を抽出）────────────────────
  const causeWordFreq: Record<string, number> = {};
  const causeKeywords = [
    "確認不足", "手順", "コミュニケーション", "環境", "疲労", "注意不足",
    "転倒", "転落", "誤薬", "誤嚥", "皮膚", "骨折", "出血", "感染",
    "設備", "人員", "教育", "研修", "マニュアル", "チェック",
  ];
  for (const inc of all) {
    const cause = (inc.summaryCause ?? "") + " " + (inc.summaryWhat ?? "");
    for (const kw of causeKeywords) {
      if (cause.includes(kw)) {
        causeWordFreq[kw] = (causeWordFreq[kw] ?? 0) + 1;
      }
    }
  }
  const topCauses = Object.entries(causeWordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([keyword, count]) => ({ keyword, count }));

  return {
    totalSimilarCases: all.length,
    topLocations,
    hourlyPattern,
    byImpactLevel,
    topCauses,
  };
}

/**
 * ホットスポット検出: 特定の場所・時間帯で事例が集中しているか判定する。
 * 同種別の確定済み事例から集中度スコアを計算し、閾値を超えた場合にアラートを返す。
 */
export async function getHotspots(
  reportType: "incident" | "accident",
  location?: string | null,
  occurredAt?: string | null
): Promise<{
  locationAlert: { location: string; count: number; totalCases: number } | null;
  timeAlert: { hour: string; count: number; totalCases: number } | null;
}> {
  const db = await getDb();
  if (!db) return { locationAlert: null, timeAlert: null };

  const all = await db
    .select()
    .from(incidents)
    .where(and(eq(incidents.status, "confirmed"), eq(incidents.reportType, reportType)));

  const totalCases = all.length;
  if (totalCases < 3) return { locationAlert: null, timeAlert: null };

  // ── 場所ホットスポット ────────────────────────────────────────────────────
  let locationAlert: { location: string; count: number; totalCases: number } | null = null;
  if (location && location.trim()) {
    const locNorm = location.trim().slice(0, 20);
    const locCount = all.filter(
      (inc) => (inc.location ?? "").trim().slice(0, 20) === locNorm
    ).length;
    // 全体の25%以上かつ2件以上の場合にアラート
    if (locCount >= 2 && locCount / totalCases >= 0.25) {
      locationAlert = { location: locNorm, count: locCount, totalCases };
    }
  }

  // ── 時間帯ホットスポット ──────────────────────────────────────────────────
  let timeAlert: { hour: string; count: number; totalCases: number } | null = null;
  if (occurredAt) {
    const hourMatch = occurredAt.match(/(\d{1,2})[:時]/);
    const hour = hourMatch ? parseInt(hourMatch[1], 10) : null;
    if (hour !== null && hour >= 0 && hour <= 23) {
      const slot = `${String(hour).padStart(2, "0")}:00`;
      // ±1時間の範囲で集計
      const slotCount = all.filter((inc) => {
        const raw = inc.occurredAt ?? "";
        const m = raw.match(/(\d{1,2})[:時]/);
        if (!m) return false;
        const h = parseInt(m[1], 10);
        return Math.abs(h - hour) <= 1;
      }).length;
      // 全体の30%以上かつ2件以上の場合にアラート
      if (slotCount >= 2 && slotCount / totalCases >= 0.30) {
        timeAlert = { hour: slot, count: slotCount, totalCases };
      }
    }
  }

  return { locationAlert, timeAlert };
}

/**
 * 月次レポート用集計データを取得する。
 * 指定年月（日本時間）の確定済み事例を対象に、インシデント・アクシデント別の詳細分析を返す。
 */
export async function getMonthlyReportData(year: number, month: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const all = await db.select().from(incidents).where(eq(incidents.status, "confirmed"));

  // 指定月（JST）のレコードだけ抽出
  const monthlyAll = all.filter((inc) => {
    const jst = new Date(new Date(inc.createdAt).toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
    return jst.getFullYear() === year && jst.getMonth() + 1 === month;
  });

  const incidentRows = monthlyAll.filter((i) => i.reportType === "incident");
  const accidentRows = monthlyAll.filter((i) => i.reportType === "accident");

  function analyzeGroup(rows: typeof monthlyAll) {
    // 影響度レベル別
    const byImpactLevel: Record<string, number> = {};
    for (const inc of rows) {
      const lvl = inc.impactLevel ?? "0";
      byImpactLevel[lvl] = (byImpactLevel[lvl] ?? 0) + 1;
    }

    // 場所別（上位5件）
    const byLocation: Record<string, number> = {};
    for (const inc of rows) {
      const loc = (inc.location ?? "不明").trim().slice(0, 20);
      byLocation[loc] = (byLocation[loc] ?? 0) + 1;
    }
    const topLocations = Object.entries(byLocation)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    // 時間帯別（6時間ブロック: 深夜/早朝/日中/夕方夜間）
    const timeBlocks: Record<string, number> = {
      "深夜(0-5時)": 0,
      "早朝(6-11時)": 0,
      "日中(12-17時)": 0,
      "夕方夜間(18-23時)": 0,
    };
    for (const inc of rows) {
      const raw = inc.occurredAt ?? "";
      const hourMatch = raw.match(/(\d{1,2})[:時]/);
      const hour = hourMatch ? parseInt(hourMatch[1], 10) : null;
      if (hour === null) continue;
      if (hour >= 0 && hour <= 5) timeBlocks["深夜(0-5時)"]++;
      else if (hour >= 6 && hour <= 11) timeBlocks["早朝(6-11時)"]++;
      else if (hour >= 12 && hour <= 17) timeBlocks["日中(12-17時)"]++;
      else timeBlocks["夕方夜間(18-23時)"]++;
    }

    // 事象キーワード（summaryWhat + summaryCause から頻出語を抽出）
    const causeKeywords = [
      "転倒", "転落", "誤薬", "誤嚥", "皮膚損傷", "骨折", "出血", "感染",
      "確認不足", "手順違反", "コミュニケーション不足", "環境要因",
      "疲労", "注意不足", "設備不具合", "チェック漏れ",
    ];
    const keywordFreq: Record<string, number> = {};
    for (const inc of rows) {
      const text = (inc.summaryWhat ?? "") + " " + (inc.summaryCause ?? "") + " " + (inc.summaryResult ?? "");
      for (const kw of causeKeywords) {
        if (text.includes(kw)) {
          keywordFreq[kw] = (keywordFreq[kw] ?? 0) + 1;
        }
      }
    }
    const topKeywords = Object.entries(keywordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([keyword, count]) => ({ keyword, count }));

    // 緊急度別
    const byUrgency: Record<string, number> = { High: 0, Medium: 0, Low: 0 };
    for (const inc of rows) {
      const u = inc.urgency ?? "Low";
      byUrgency[u] = (byUrgency[u] ?? 0) + 1;
    }

    // 直近5件の事象概要
    const recentSummaries = rows
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5)
      .map((inc) => ({
        occurredAt: inc.occurredAt ?? "",
        location: inc.location ?? "",
        summaryWhat: inc.summaryWhat ?? "",
        impactLevel: inc.impactLevel ?? "0",
        urgency: inc.urgency ?? "Low",
      }));

    return {
      total: rows.length,
      byImpactLevel,
      topLocations,
      timeBlocks,
      topKeywords,
      byUrgency,
      recentSummaries,
    };
  }

  return {
    year,
    month,
    totalAll: monthlyAll.length,
    incident: analyzeGroup(incidentRows),
    accident: analyzeGroup(accidentRows),
  };
}
