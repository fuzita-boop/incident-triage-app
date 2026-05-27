import { and, asc, desc, eq } from "drizzle-orm";
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
  locationTag?: "facility" | "visit";
  impactLevel?: string;
  urgency?: "High" | "Medium" | "Low";
  importance?: "High" | "Medium" | "Low";
  sortBy?: "createdAt" | "occurredAt" | "impactLevel";
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
};

export async function listIncidents(filter: IncidentFilter = {}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conditions = [];
  if (filter.status) conditions.push(eq(incidents.status, filter.status));
  if (filter.locationTag) conditions.push(eq(incidents.locationTag, filter.locationTag));
  if (filter.impactLevel) conditions.push(eq(incidents.impactLevel, filter.impactLevel as any));
  if (filter.urgency) conditions.push(eq(incidents.urgency, filter.urgency));
  if (filter.importance) conditions.push(eq(incidents.importance, filter.importance));

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

export async function getDashboardStats() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const all = await db.select().from(incidents).where(eq(incidents.status, "confirmed"));

  const byImpactLevel: Record<string, number> = {};
  const byLocationTag: Record<string, number> = { facility: 0, visit: 0 };
  const byUrgency: Record<string, number> = { High: 0, Medium: 0, Low: 0 };
  let totalDraft = 0;
  let totalConfirmed = 0;

  for (const inc of all) {
    const lvl = inc.impactLevel ?? "0";
    byImpactLevel[lvl] = (byImpactLevel[lvl] ?? 0) + 1;
    if (inc.locationTag) byLocationTag[inc.locationTag] = (byLocationTag[inc.locationTag] ?? 0) + 1;
    if (inc.urgency) byUrgency[inc.urgency] = (byUrgency[inc.urgency] ?? 0) + 1;
    if (inc.status === "confirmed") totalConfirmed++;
  }

  const drafts = await db.select().from(incidents).where(eq(incidents.status, "draft"));
  totalDraft = drafts.length;

  return { byImpactLevel, byLocationTag, byUrgency, totalDraft, totalConfirmed, total: all.length };
}
