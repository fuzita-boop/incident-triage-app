import { describe, it, expect, vi, beforeEach } from "vitest";
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
  createDraftIncidents: vi.fn(),
  updateIncident: vi.fn(),
  confirmIncident: vi.fn(),
  getIncidentById: vi.fn(),
  getIncidentsByUploadGroup: vi.fn(),
  listIncidents: vi.fn(),
  getDashboardStats: vi.fn(),
  deleteIncident: vi.fn(),
  deleteIncidentsByUploadGroup: vi.fn(),
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

// imageRotationのモック: 回転なしでそのまま返す
vi.mock("./imageRotation", () => ({
  autoCorrectOrientation: vi.fn().mockResolvedValue({ correctedBase64: "fake-base64", rotationApplied: 0 }),
  extractAndCorrectPdfPages: vi.fn().mockResolvedValue({ pageBase64s: [], rotationsApplied: [] }),
}));

import {
  createDraftIncident,
  createDraftIncidents,
  confirmIncident,
  getIncidentById,
  getIncidentsByUploadGroup,
  listIncidents,
  getDashboardStats,
  deleteIncident,
  deleteIncidentsByUploadGroup,
} from "./db";
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

describe("incidents.analyzeAndCreateDraft (単一報告書)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("AI解析後に単一draftが作成され、count=1で返る", async () => {
    // Step1: 件数検出 → "1"
    // Step2: 単一解析 → JSON
    vi.mocked(invokeLLM)
      .mockResolvedValueOnce({ choices: [{ message: { content: "1" } }] } as any)
      .mockResolvedValueOnce({
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
      } as any);

    vi.mocked(createDraftIncident).mockResolvedValue({
      id: 1,
      status: "draft",
      impactLevel: "3a",
      urgency: "Medium",
      fileKey: "test-key",
      fileUrl: "/manus-storage/test-key",
      uploadGroupId: "test-group",
      pageIndex: 0,
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

    expect(createDraftIncident).toHaveBeenCalledTimes(1);
    expect(result.count).toBe(1);
    expect(result.incident?.status).toBe("draft");
    expect(result.incident?.impactLevel).toBe("3a");
  });
});

describe("incidents.analyzeAndCreateDraft (複数報告書)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("複数報告書を検出した場合にcreateDraftIncidentsが呼ばれ、count=3で返る", async () => {
    const { extractAndCorrectPdfPages } = await import("./imageRotation");
    // PDFページ分割: 3ページを返すようにモック
    vi.mocked(extractAndCorrectPdfPages).mockResolvedValueOnce({
      pageBase64s: [
        Buffer.from("page1").toString("base64"),
        Buffer.from("page2").toString("base64"),
        Buffer.from("page3").toString("base64"),
      ],
      rotationsApplied: [0, 0, 0],
    } as any);

    // 各ページの個別解析レスポンス（3回）
    const makePageResponse = (idx: number, level: string, urg: string, type: string) => ({
      choices: [{ message: { content: JSON.stringify({
        occurredAt: `2024-01-${15 + idx}`, location: `${idx + 1}F`, subjectInitials: "A.B.",
        summaryWhat: `転倒${idx + 1}`, summaryCause: `原因${idx + 1}`, summaryResult: `結果${idx + 1}`,
        impactLevel: level, urgency: urg, importance: urg, reportType: type,
        preventionActions: [`対策${idx + 1}`],
      }) } }],
    });
    vi.mocked(invokeLLM)
      .mockResolvedValueOnce(makePageResponse(0, "1", "Low", "incident") as any)
      .mockResolvedValueOnce(makePageResponse(1, "2", "Medium", "incident") as any)
      .mockResolvedValueOnce(makePageResponse(2, "3b", "High", "accident") as any);

    const mockDrafts = [
      { id: 1, status: "draft", impactLevel: "1", urgency: "Low", uploadGroupId: "grp", pageIndex: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 2, status: "draft", impactLevel: "2", urgency: "Medium", uploadGroupId: "grp", pageIndex: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: 3, status: "draft", impactLevel: "3b", urgency: "High", uploadGroupId: "grp", pageIndex: 2, createdAt: new Date(), updatedAt: new Date() },
    ];
    vi.mocked(createDraftIncidents).mockResolvedValue(mockDrafts as any);

    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.incidents.analyzeAndCreateDraft({
      fileBase64: Buffer.from("fake-pdf").toString("base64"),
      fileName: "test.pdf",
      mimeType: "application/pdf",
    });

    expect(createDraftIncidents).toHaveBeenCalledTimes(1);
    expect(result.count).toBe(3);
    expect(result.incidents).toHaveLength(3);
    expect(result.incidents[2]?.impactLevel).toBe("3b");
  });
});

describe("incidents.analyzeAndCreateDraft (PDFページ分割・回転0度)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("PDFページ分割成功・回転0度の場合でも各ページを個別解析する", async () => {
    const { extractAndCorrectPdfPages } = await import("./imageRotation");
    // 2ページ、回転なし
    vi.mocked(extractAndCorrectPdfPages).mockResolvedValueOnce({
      pageBase64s: [
        Buffer.from("page1").toString("base64"),
        Buffer.from("page2").toString("base64"),
      ],
      rotationsApplied: [0, 0],
    } as any);

    const makePageResponse = (idx: number) => ({
      choices: [{ message: { content: JSON.stringify({
        occurredAt: `2024-02-0${idx + 1}`, location: `${idx + 1}F`, subjectInitials: "X.Y.",
        summaryWhat: `事象${idx + 1}`, summaryCause: `原因${idx + 1}`, summaryResult: `結果${idx + 1}`,
        impactLevel: "1", urgency: "Low", importance: "Low", reportType: "incident",
        preventionActions: [`対策${idx + 1}`],
      }) } }],
    });
    vi.mocked(invokeLLM)
      .mockResolvedValueOnce(makePageResponse(0) as any)
      .mockResolvedValueOnce(makePageResponse(1) as any);

    const mockDrafts = [
      { id: 10, status: "draft", impactLevel: "1", urgency: "Low", uploadGroupId: "grp2", pageIndex: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 11, status: "draft", impactLevel: "1", urgency: "Low", uploadGroupId: "grp2", pageIndex: 1, createdAt: new Date(), updatedAt: new Date() },
    ];
    vi.mocked(createDraftIncidents).mockResolvedValue(mockDrafts as any);

    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.incidents.analyzeAndCreateDraft({
      fileBase64: Buffer.from("fake-pdf-2pages").toString("base64"),
      fileName: "test2.pdf",
      mimeType: "application/pdf",
    });

    // 回転が0度でもページ分割済みの場合は個別解析される
    expect(createDraftIncidents).toHaveBeenCalledTimes(1);
    expect(result.count).toBe(2);
    expect(result.incidents).toHaveLength(2);
  });
});

describe("incidents.getByUploadGroup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uploadGroupIdで絞り込んだ一覧を返す", async () => {
    const mockGroup = [
      { id: 1, uploadGroupId: "grp-abc", pageIndex: 0, status: "draft", impactLevel: "1", createdAt: new Date(), updatedAt: new Date() },
      { id: 2, uploadGroupId: "grp-abc", pageIndex: 1, status: "draft", impactLevel: "2", createdAt: new Date(), updatedAt: new Date() },
    ];
    vi.mocked(getIncidentsByUploadGroup).mockResolvedValue(mockGroup as any);

    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.incidents.getByUploadGroup({ uploadGroupId: "grp-abc" });
    expect(result).toHaveLength(2);
    expect(result[0]?.uploadGroupId).toBe("grp-abc");
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
    await caller.incidents.updateDraft({
      id: 1,
      summaryWhat: "更新後の概要",
      impactLevel: "2",
      urgency: "Low",
    });

    expect(updateIncident).toHaveBeenCalledWith(1, expect.objectContaining({ summaryWhat: "更新後の概要" }));
  });

  it("reportedActionsとaiSuggestedActionsをJSON文字列としてシリアライズして保存する", async () => {
    const { updateIncident } = await import("./db");
    vi.mocked(updateIncident).mockResolvedValue({ id: 1 } as any);

    const caller = appRouter.createCaller(createAuthContext());
    await caller.incidents.updateDraft({
      id: 1,
      reportedActions: ["ベッド柵を上げる", "見守りを強化する"],
      aiSuggestedActions: ["転倒リスクアセスメントを毎月実施する", "夜間の巡回頻度を増やす", "環境整備チェックリストを導入する"],
    });

    expect(updateIncident).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        reportedActions: JSON.stringify(["ベッド柵を上げる", "見守りを強化する"]),
        aiSuggestedActions: JSON.stringify(["転倒リスクアセスメントを毎月実施する", "夜間の巡回頻度を増やす", "環境整備チェックリストを導入する"]),
        preventionActions: JSON.stringify(["転倒リスクアセスメントを毎月実施する", "夜間の巡回頻度を増やす", "環境整備チェックリストを導入する"]),
      })
    );
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
      location: "廈下",
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

describe("incidents.delete", () => {
  beforeEach(() => vi.clearAllMocks());

  it("存在するレコードを削除できる", async () => {
    const mockIncident = {
      id: 1,
      status: "draft",
      summaryWhat: "転倒",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    vi.mocked(getIncidentById).mockResolvedValue(mockIncident as any);
    vi.mocked(deleteIncident).mockResolvedValue(undefined);

    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.incidents.delete({ id: 1 });
    expect(deleteIncident).toHaveBeenCalledWith(1);
    expect(result.success).toBe(true);
    expect(result.id).toBe(1);
  });

  it("存在しないIDはNOT_FOUNDエラー", async () => {
    vi.mocked(getIncidentById).mockResolvedValue(null);
    const caller = appRouter.createCaller(createAuthContext());
    await expect(caller.incidents.delete({ id: 999 })).rejects.toThrow();
    expect(deleteIncident).not.toHaveBeenCalled();
  });
});

describe("incidents.deleteGroup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("グループ内の全レコードを削除できる", async () => {
    vi.mocked(deleteIncidentsByUploadGroup).mockResolvedValue(undefined);

    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.incidents.deleteGroup({ uploadGroupId: "group-abc" });
    expect(deleteIncidentsByUploadGroup).toHaveBeenCalledWith("group-abc");
    expect(result.success).toBe(true);
    expect(result.uploadGroupId).toBe("group-abc");
  });
});
