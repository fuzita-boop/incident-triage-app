// Shared types between client and server

export type ImpactLevel = "0" | "1" | "2" | "3a" | "3b" | "4" | "5";
export type UrgencyLevel = "High" | "Medium" | "Low";
export type ReportType = "incident" | "accident";
export type IncidentStatus = "draft" | "confirmed";

export const IMPACT_LEVEL_LABELS: Record<ImpactLevel, string> = {
  "0": "レベル 0 — 不実施",
  "1": "レベル 1 — 実害なし",
  "2": "レベル 2 — 観察・検査要",
  "3a": "レベル 3a — 軽微な処置",
  "3b": "レベル 3b — 濃厚な処置",
  "4": "レベル 4 — 永続的障害",
  "5": "レベル 5 — 死亡",
};

export const IMPACT_LEVEL_SHORT: Record<ImpactLevel, string> = {
  "0": "Lv.0",
  "1": "Lv.1",
  "2": "Lv.2",
  "3a": "Lv.3a",
  "3b": "Lv.3b",
  "4": "Lv.4",
  "5": "Lv.5",
};

export const URGENCY_LABELS: Record<UrgencyLevel, string> = {
  High: "高（緊急）",
  Medium: "中",
  Low: "低",
};

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  incident: "インシデント（ヒヤリハット）",
  accident: "アクシデント（事故報告書）",
};

export const REPORT_TYPE_SHORT: Record<ReportType, string> = {
  incident: "ヒヤリハット",
  accident: "事故",
};

export const HIGH_IMPACT_LEVELS: ImpactLevel[] = ["3b", "4", "5"];

export function isUrgentIncident(impactLevel: ImpactLevel, urgency: UrgencyLevel): boolean {
  return HIGH_IMPACT_LEVELS.includes(impactLevel) || urgency === "High";
}
