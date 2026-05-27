import {
  boolean,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Incident reports ───────────────────────────────────────────────────────

/**
 * 影響度レベル: 0, 1, 2, 3a, 3b, 4, 5
 * 緊急対応性 / 重要度: High, Medium, Low
 * 報告種別: incident (インシデント/ヒヤリハット), accident (アクシデント/事故報告書)
 * ステータス: draft (AI解析済み・未確定), confirmed (管理者確定済み)
 */
export const incidents = mysqlTable("incidents", {
  id: int("id").autoincrement().primaryKey(),

  // ── ファイル参照 ──────────────────────────────────────────────────
  uploadGroupId: varchar("uploadGroupId", { length: 64 }),
  pageIndex: int("pageIndex").default(0),

  fileKey: varchar("fileKey", { length: 512 }),
  fileUrl: varchar("fileUrl", { length: 1024 }),
  fileMimeType: varchar("fileMimeType", { length: 64 }),

  // ── AI解析結果（確定前は draft として保持）────────────────────────
  occurredAt: varchar("occurredAt", { length: 128 }),      // 発生日時（テキスト）
  location: varchar("location", { length: 256 }),           // 発生場所
  subjectInitials: varchar("subjectInitials", { length: 64 }), // 対象者イニシャル
  summaryWhat: text("summaryWhat"),                          // 事象概要 - 何が
  summaryCause: text("summaryCause"),                        // 事象概要 - 原因
  summaryResult: text("summaryResult"),                      // 事象概要 - 結果

  impactLevel: mysqlEnum("impactLevel", ["0", "1", "2", "3a", "3b", "4", "5"]).default("0"),
  urgency: mysqlEnum("urgency", ["High", "Medium", "Low"]).default("Low"),
  importance: mysqlEnum("importance", ["High", "Medium", "Low"]).default("Low"),
  reportType: mysqlEnum("reportType", ["incident", "accident"]).default("incident"),

  // ── AI提案の改善アクション（JSON配列文字列として保存）────────────
  preventionActions: text("preventionActions"),              // JSON string: string[] (後方互換用)
  reportedActions: text("reportedActions"),                  // JSON string: 報告書に記載された対策
  aiSuggestedActions: text("aiSuggestedActions"),            // JSON string: AIが追加提案する再発防止策

  // ── ステータス ────────────────────────────────────────────────────
  status: mysqlEnum("status", ["draft", "confirmed"]).default("draft").notNull(),
  isUrgentAlerted: boolean("isUrgentAlerted").default(false),

  // ── 作成者 ────────────────────────────────────────────────────────
  createdByUserId: int("createdByUserId"),
  confirmedByUserId: int("confirmedByUserId"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  confirmedAt: timestamp("confirmedAt"),
});

export type Incident = typeof incidents.$inferSelect;
export type InsertIncident = typeof incidents.$inferInsert;
