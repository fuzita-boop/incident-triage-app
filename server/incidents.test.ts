import { describe, expect, it, vi, beforeEach } from "vitest";
import { isUrgentIncident } from "../shared/types";

// ── shared/types のロジックテスト ────────────────────────────────────────────

describe("isUrgentIncident", () => {
  it("レベル3b以上は緊急と判定される", () => {
    expect(isUrgentIncident("3b", "Low")).toBe(true);
    expect(isUrgentIncident("4", "Low")).toBe(true);
    expect(isUrgentIncident("5", "Low")).toBe(true);
  });

  it("レベル3a以下かつurgency=Lowは緊急でない", () => {
    expect(isUrgentIncident("0", "Low")).toBe(false);
    expect(isUrgentIncident("1", "Low")).toBe(false);
    expect(isUrgentIncident("2", "Low")).toBe(false);
    expect(isUrgentIncident("3a", "Low")).toBe(false);
  });

  it("urgency=Highは常に緊急と判定される", () => {
    expect(isUrgentIncident("0", "High")).toBe(true);
    expect(isUrgentIncident("1", "High")).toBe(true);
    expect(isUrgentIncident("3a", "High")).toBe(true);
  });

  it("urgency=Mediumはレベルに依存する", () => {
    expect(isUrgentIncident("2", "Medium")).toBe(false);
    expect(isUrgentIncident("3b", "Medium")).toBe(true);
  });
});

// ── DB helpers モックテスト ─────────────────────────────────────────────────

vi.mock("./db", () => ({
  createDraftIncident: vi.fn(),
  updateIncident: vi.fn(),
  confirmIncident: vi.fn(),
  getIncidentById: vi.fn(),
  listIncidents: vi.fn(),
  getDashboardStats: vi.fn(),
  getDb: vi.fn(),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ key: "test-key", url: "/manus-storage/test-key" }),
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

import { createDraftIncident, confirmIncident, getIncidentById, listIncidents, getDashboardStats } from "./db";
import { invokeLLM } from "./_core/llm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createAuthContext(userId = 1): TrpcContext {
  return {
    user: {
      id: userId,
      openId: "test-user",
      email: "test@example.com",
      name: "テストユーザー",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("incidents.list", () => {
  beforeEach(() => vi.clearAllMocks());

  it("一覧を返す", async () => {
    const mockList = [
      {
        id: 1,
        impactLevel: "2",
        urgency: "Medium",
        importance: "Low",
        reportType: "incident",
        status: "confirmed",
        summaryWhat: "転倒",
        location: "2階廊下",
        occurredAt: "2024-01-15",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    vi.mocked(listIncidents).mockResolvedValue(mockList as any);

    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.incidents.list({ limit: 50, offset: 0 });
    expect(result).toHaveLength(1);
    expect(result[0]?.impactLevel).toBe("2");
  });
});

describe("incidents.dashboardStats", () => {
  beforeEach(() => vi.clearAllMocks());

  it("集計データを返す", async () => {
    vi.mocked(getDashboardStats).mockResolvedValue({
      byImpactLevel: { "0": 2, "2": 1, "3b": 1 },
      byReportType: { incident: 3, accident: 1 },
      byUrgency: { High: 1, Medium: 2, Low: 1 },
      totalDraft: 2,
      totalConfirmed: 4,
      total: 4,
    });

    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.incidents.dashboardStats();
    expect(result.totalConfirmed).toBe(4);
    expect(result.byReportType.incident).toBe(3);
  });
});

describe("incidents.analyzeAndCreateDraft", () => {
  beforeEach(() => vi.clearAllMocks());

  it("AI解析後にdraftが作成される", async () => {
    const mockAnalysisResponse = {
      choices: [{
        message: {
          content: JSON.stringify({
            occurredAt: "2024-01-15 14:30",
            location: "2階廊下",
            subjectInitials: "A.T.",
            summaryWhat: "転倒が発生した",
            summaryCause: "床が濡れていた",
            summaryResult: "軽微な擦り傷",
            impactLevel: "3a",
            urgency: "Medium",
            importance: "Medium",
            reportType: "incident",
            preventionActions: ["床の清掃徹底", "注意喚起の掲示", "定期巡回の強化"],
          }),
        },
      }],
    };
    vi.mocked(invokeLLM).mockResolvedValue(mockAnalysisResponse as any);
    vi.mocked(createDraftIncident).mockResolvedValue({
      id: 1,
      status: "draft",
      impactLevel: "3a",
      urgency: "Medium",
      fileKey: "test-key",
      fileUrl: "/manus-storage/test-key",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.incidents.analyzeAndCreateDraft({
      fileBase64: Buffer.from("fake-image").toString("base64"),
      fileName: "test.jpg",
      mimeType: "image/jpeg",
      reportTypeHint: "incident",
    });

    expect(createDraftIncident).toHaveBeenCalled();
    expect(result?.status).toBe("draft");
    expect(result?.impactLevel).toBe("3a");
  });
});

describe("incidents.updateDraft", () => {
  beforeEach(() => vi.clearAllMocks());

  it("フォームデータを更新できる", async () => {
    const updatedIncident = {
      id: 1,
      status: "draft",
      impactLevel: "2",
      urgency: "Low",
      summaryWhat: "更新後の概要",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const { updateIncident } = await import("./db");
    vi.mocked(updateIncident).mockResolvedValue(updatedIncident as any);

    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.incidents.updateDraft({
      id: 1,
      summaryWhat: "更新後の概要",
      impactLevel: "2",
      urgency: "Low",
    });

    expect(updateIncident).toHaveBeenCalledWith(1, expect.objectContaining({ summaryWhat: "更新後の概要" }));
  });
});

describe("incidents.confirm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("存在しないIDはNOT_FOUNDエラー", async () => {
    vi.mocked(getIncidentById).mockResolvedValue(null);
    const caller = appRouter.createCaller(createAuthContext());
    await expect(caller.incidents.confirm({ id: 999 })).rejects.toThrow();
  });

  it("確定処理が呼ばれる", async () => {
    const mockIncident = {
      id: 1,
      impactLevel: "2",
      urgency: "Low",
      importance: "Low",
      reportType: "incident",
      status: "draft",
      summaryWhat: "転倒",
      location: "廊下",
      occurredAt: "2024-01-15",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    vi.mocked(getIncidentById).mockResolvedValue(mockIncident as any);
    vi.mocked(confirmIncident).mockResolvedValue({ ...mockIncident, status: "confirmed" } as any);

    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.incidents.confirm({ id: 1 });
    expect(confirmIncident).toHaveBeenCalledWith(1, 1);
    expect(result?.status).toBe("confirmed");
  });
});
