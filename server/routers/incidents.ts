import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  confirmIncident,
  createDraftIncident,
  createDraftIncidents,
  getDashboardStats,
  getIncidentById,
  getIncidentsByUploadGroup,
  getMonthlyTrends,
  listIncidents,
  updateIncident,
} from "../db";
import { invokeLLM } from "../_core/llm";
import { storagePut } from "../storage";
import { notifyOwner } from "../_core/notification";
import { protectedProcedure, router } from "../_core/trpc";
import { nanoid } from "nanoid";
import { autoCorrectOrientation, extractAndCorrectPdfPages } from "../imageRotation";

// Impact level helpers

const IMPACT_LEVELS = ["0", "1", "2", "3a", "3b", "4", "5"] as const;
type ImpactLevel = (typeof IMPACT_LEVELS)[number];

function isHighUrgency(impactLevel: ImpactLevel, urgency: string): boolean {
  const highLevels: ImpactLevel[] = ["3b", "4", "5"];
  return highLevels.includes(impactLevel) || urgency === "High";
}

// AI analysis helpers

const SYSTEM_PROMPT = `あなたは医療・介護現場のインシデント・アクシデント報告書を解析する専門AIです。
以下の基準に従って、報告書の内容を正確に構造化JSONとして抽出してください。

【影響度レベル定義】
- レベル0: 誤りが発生したが、利用者に実施されなかった（直前で阻止）
- レベル1: 利用者に実施されたが、実害・不利益はなく、処置や治療も不要
- レベル2: 利用者に実施され、実害はなかったが、追加の観察や検査を要した
- レベル3a: 擦り傷、軽微な皮膚縫合など、簡単な処置や治療を要した
- レベル3b: 骨折、手術、入院など、濃厚な処置や治療を要した
- レベル4: 永続的な障害や後遺症が残った
- レベル5: 死亡に至った

【緊急対応性ロジック】
- レベル3b以上、または「出血が止まらない」「骨折疑い」「意識低下」「意識混濁」等の文脈がある場合 → High
- 医療処置・家族連絡・行政報告が必要な場合 → High
- それ以外で注意が必要 → Medium
- 軽微 → Low

【重要度ロジック】
- レベルが低くても「複数回発生」「マニュアルの不備」「環境的欠陥」がある場合 → High または Medium
- 再発防止策の策定が必要 → Medium以上

【報告種別】
- ヒヤリハット・インシデント・危険予知・ニアミス等の文脈 → incident
- 事故・アクシデント・転倒骨折・受診・入院・死亡等の文脈 → accident

【再発防止策の抽出・提案】
"reportedActions": 報告書に実際に記載されている対策・改善策をそのまま抽出する。記載がなければ空配列。
"aiSuggestedActions": 医療・介護安全管理の専門家として、以下の角度から具体的な再発防止策を深く提案する。
  - 「確認不足」「手順の不備」「環境整備」「コミュニケーション」「教育・研修」「リスクアセスメント」「チェックリスト導入」などの角度から分析する
  - 報告書に記載のない根本的な原因や潜在リスクも指摘する
  - 具体的な行動計画（導入するもの、実施タイミング、担当者など）を含める
  - 5点以上の実践的な提案を行うこと

必ずJSONのみを返してください。マークダウンや説明文は不要です。`;

const SINGLE_REPORT_SCHEMA = `{
  "occurredAt": "発生日時",
  "location": "発生場所",
  "subjectInitials": "対象者イニシャル",
  "summaryWhat": "何が起きたか",
  "summaryCause": "原因",
  "summaryResult": "結果・影響",
  "impactLevel": "0|1|2|3a|3b|4|5",
  "urgency": "High|Medium|Low",
  "importance": "High|Medium|Low",
  "reportType": "incident|accident",
  "reportedActions": ["報告書に記載された対策（なければ空配列）"],
  "aiSuggestedActions": ["AI提案の再発防止策1", "AI提案の再発防止策2", "...5点以上"]
}`;

const MULTI_REPORT_SCHEMA = `{
  "reports": [
    {
      "occurredAt": "発生日時",
      "location": "発生場所",
      "subjectInitials": "対象者イニシャル",
      "summaryWhat": "何が起きたか",
      "summaryCause": "原因",
      "summaryResult": "結果・影響",
      "impactLevel": "0|1|2|3a|3b|4|5",
      "urgency": "High|Medium|Low",
      "importance": "High|Medium|Low",
      "reportType": "incident|accident",
      "reportedActions": ["報告書に記載された対策（なければ空配列）"],
      "aiSuggestedActions": ["AI提案の再発防止策1", "AI提案の再発防止策2", "...5点以上"]
    }
  ]
}`;

function buildMediaContent(mimeType: string, fileBase64: string, fileUrl: string) {
  if (mimeType === "application/pdf") {
    if (fileBase64) {
      return { type: "image_url" as const, image_url: { url: `data:application/pdf;base64,${fileBase64}`, detail: "high" as const } };
    }
    return { type: "file_url" as const, file_url: { url: fileUrl, mime_type: "application/pdf" as const } };
  }
  if (fileBase64) {
    return { type: "image_url" as const, image_url: { url: `data:${mimeType};base64,${fileBase64}`, detail: "high" as const } };
  }
  return { type: "image_url" as const, image_url: { url: fileUrl, detail: "high" as const } };
}

function parseJsonSafe(content: string | unknown): any {
  const raw = typeof content === "string" ? content : JSON.stringify(content);
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : raw;
  return JSON.parse(jsonStr);
}

function normalizeReport(parsed: any, reportTypeHint?: string): any {
  // 後方互換: preventionActionsがあればaiSuggestedActionsにもコピー
  if (Array.isArray(parsed.preventionActions) && !parsed.aiSuggestedActions) {
    parsed.aiSuggestedActions = parsed.preventionActions;
  }
  if (!Array.isArray(parsed.reportedActions)) parsed.reportedActions = [];
  if (!Array.isArray(parsed.aiSuggestedActions)) parsed.aiSuggestedActions = [];
  if (reportTypeHint) parsed.reportType = reportTypeHint;
  return parsed;
}

/** Step 1: ファイルに何件の報告書が含まれるか検出する */
async function detectReportCount(mimeType: string, fileBase64: string, fileUrl: string): Promise<number> {
  const mediaContent = buildMediaContent(mimeType, fileBase64, fileUrl);
  const response = await invokeLLM({
    messages: [
      { role: "system", content: "あなたは医療・介護現場の書類解析AIです。" },
      {
        role: "user",
        content: [
          { type: "text", text: "このファイルに含まれる独立した報告書（インシデント・アクシデント報告書）の件数を数えてください。各ページが1件の報告書に対応している場合が多いです。件数のみを整数で返してください。例: 3" },
          mediaContent as any,
        ],
      },
    ],
  });

  const content = response?.choices?.[0]?.message?.content;
  if (!content) return 1;
  const raw = typeof content === "string" ? content : JSON.stringify(content);
  const match = raw.match(/\d+/);
  const count = match ? parseInt(match[0], 10) : 1;
  return Math.max(1, Math.min(count, 20));
}

/** Step 2a: 単一報告書の解析 */
async function analyzeSingleReport(mimeType: string, fileBase64: string, fileUrl: string, reportTypeHint?: string): Promise<any> {
  const mediaContent = buildMediaContent(mimeType, fileBase64, fileUrl);
  const response = await invokeLLM({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `以下の報告書を解析し、指定のJSON形式で構造化データを抽出してください。
特に「aiSuggestedActions」は医療・介護安全の専門家として、確認不足・手順不備・環境整備・コミュニケーション・教育研修・リスクアセスメントなどの観点から5点以上の具体的な再発防止策を提案してください。
必ず以下のJSONスキーマに従って返答してください：
${SINGLE_REPORT_SCHEMA}
マークダウンや説明文は一切不要です。JSONのみ返してください。`,
          },
          mediaContent as any,
        ],
      },
    ],
    response_format: { type: "json_object" },
  });

  const content = response?.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI response is empty or malformed");
  try {
    return normalizeReport(parseJsonSafe(content), reportTypeHint);
  } catch (e) {
    console.error("[AI] Failed to parse single report JSON:", content);
    throw new Error(`AIのレスポンスをJSONとして解析できませんでした。内容: ${String(content).slice(0, 200)}`);
  }
}

/** Step 2b: 複数報告書の一括解析 */
async function analyzeMultipleReports(mimeType: string, fileBase64: string, fileUrl: string, count: number, reportTypeHint?: string): Promise<any[]> {
  const mediaContent = buildMediaContent(mimeType, fileBase64, fileUrl);
  const response = await invokeLLM({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `このファイルには${count}件の報告書が含まれています。各報告書を順番に解析し、以下のJSON配列形式で返してください：
${MULTI_REPORT_SCHEMA}
各報告書の「aiSuggestedActions」は医療・介護安全の専門家として、確認不足・手順不備・環境整備・コミュニケーション・教育研修・リスクアセスメントなどの観点から5点以上の具体的な再発防止策を提案してください。
各報告書を1要素として配列に格納してください。マークダウンや説明文は一切不要です。JSONのみ返してください。`,
          },
          mediaContent as any,
        ],
      },
    ],
    response_format: { type: "json_object" },
  });

  const content = response?.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI response is empty or malformed");
  try {
    const parsed = parseJsonSafe(content);
    const reports: any[] = Array.isArray(parsed.reports) ? parsed.reports : [parsed];
    return reports.map(r => normalizeReport(r, reportTypeHint));
  } catch (e) {
    console.error("[AI] Failed to parse multi report JSON:", content);
    throw new Error(`AIのレスポンスをJSONとして解析できませんでした。内容: ${String(content).slice(0, 200)}`);
  }
}

// Router

export const incidentsRouter = router({
  // ファイルアップロード → AI解析 → draft保存（複数報告書対応）
  analyzeAndCreateDraft: protectedProcedure
    .input(
      z.object({
        fileBase64: z.string(),
        fileName: z.string(),
        mimeType: z.string(),
        reportTypeHint: z.enum(["incident", "accident"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Base64 → Buffer → S3アップロード
      const buffer = Buffer.from(input.fileBase64, "base64");
      const ext = input.fileName.split(".").pop() ?? "bin";
      const uploadGroupId = nanoid(12);
      const fileKey = `incidents/${ctx.user.id}/${uploadGroupId}.${ext}`;
      const { url: fileUrl } = await storagePut(fileKey, buffer, input.mimeType);

      // Step 0: 向き自動補正
      let analysisBase64 = input.fileBase64;
      let analysisMimeType = input.mimeType;
      let correctedPageBase64s: string[] | null = null;

      if (input.mimeType === "application/pdf") {
        try {
          const { pageBase64s, rotationsApplied } = await extractAndCorrectPdfPages(input.fileBase64);
          if (pageBase64s.length > 0) {
            const anyRotated = rotationsApplied.some((r) => r !== 0);
            if (anyRotated) {
              console.log(`[incidents] PDF pages rotated: ${rotationsApplied.join(",")}°`);
            }
            correctedPageBase64s = pageBase64s;
          }
        } catch (e) {
          console.warn("[incidents] PDF page extraction failed, using original:", e);
        }
      } else {
        const { correctedBase64, rotationApplied } = await autoCorrectOrientation(input.fileBase64, input.mimeType);
        if (rotationApplied !== 0) {
          console.log(`[incidents] Applied ${rotationApplied}° rotation correction`);
          analysisBase64 = correctedBase64;
          analysisMimeType = "image/jpeg";
        }
      }

      // Step 1: 件数検出
      let reportCount: number;
      if (correctedPageBase64s && correctedPageBase64s.length > 0) {
        reportCount = correctedPageBase64s.length;
      } else {
        reportCount = await detectReportCount(analysisMimeType, analysisBase64, fileUrl);
      }

      let drafts;
      if (reportCount <= 1) {
        // 単一報告書
        const singleBase64 = correctedPageBase64s ? correctedPageBase64s[0]! : analysisBase64;
        const singleMime = correctedPageBase64s ? "image/jpeg" : analysisMimeType;
        const analysis = await analyzeSingleReport(singleMime, singleBase64, fileUrl, input.reportTypeHint);
        const incident = await createDraftIncident({
          uploadGroupId,
          pageIndex: 0,
          fileKey,
          fileUrl,
          fileMimeType: input.mimeType,
          occurredAt: analysis.occurredAt,
          location: analysis.location,
          subjectInitials: analysis.subjectInitials,
          summaryWhat: analysis.summaryWhat,
          summaryCause: analysis.summaryCause,
          summaryResult: analysis.summaryResult,
          impactLevel: analysis.impactLevel,
          urgency: analysis.urgency,
          importance: analysis.importance,
          reportType: analysis.reportType,
          preventionActions: JSON.stringify(analysis.aiSuggestedActions ?? []),
          reportedActions: JSON.stringify(analysis.reportedActions ?? []),
          aiSuggestedActions: JSON.stringify(analysis.aiSuggestedActions ?? []),
          status: "draft",
          createdByUserId: ctx.user.id,
        });
        drafts = [incident];
      } else {
        // 複数報告書
        let analyses: any[];
        if (correctedPageBase64s && correctedPageBase64s.length > 0) {
          analyses = await Promise.all(
            correctedPageBase64s.map((pageB64) =>
              analyzeSingleReport("image/jpeg", pageB64, fileUrl, input.reportTypeHint)
            )
          );
        } else {
          analyses = await analyzeMultipleReports(analysisMimeType, analysisBase64, fileUrl, reportCount, input.reportTypeHint);
        }
        const dataList = analyses.map((analysis, idx) => ({
          uploadGroupId,
          pageIndex: idx,
          fileKey,
          fileUrl,
          fileMimeType: input.mimeType,
          occurredAt: analysis.occurredAt,
          location: analysis.location,
          subjectInitials: analysis.subjectInitials,
          summaryWhat: analysis.summaryWhat,
          summaryCause: analysis.summaryCause,
          summaryResult: analysis.summaryResult,
          impactLevel: analysis.impactLevel,
          urgency: analysis.urgency,
          importance: analysis.importance,
          reportType: analysis.reportType,
          preventionActions: JSON.stringify(analysis.aiSuggestedActions ?? []),
          reportedActions: JSON.stringify(analysis.reportedActions ?? []),
          aiSuggestedActions: JSON.stringify(analysis.aiSuggestedActions ?? []),
          status: "draft" as const,
          createdByUserId: ctx.user.id,
        }));
        drafts = await createDraftIncidents(dataList);
      }

      return {
        uploadGroupId,
        count: drafts.length,
        incidents: drafts,
        incident: drafts[0] ?? null,
      };
    }),

  // アップロードグループ内の全インシデント取得
  getByUploadGroup: protectedProcedure
    .input(z.object({ uploadGroupId: z.string() }))
    .query(async ({ input }) => {
      return getIncidentsByUploadGroup(input.uploadGroupId);
    }),

  // draft更新（管理者が編集）
  updateDraft: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        occurredAt: z.string().optional(),
        location: z.string().optional(),
        subjectInitials: z.string().optional(),
        summaryWhat: z.string().optional(),
        summaryCause: z.string().optional(),
        summaryResult: z.string().optional(),
        impactLevel: z.enum(["0", "1", "2", "3a", "3b", "4", "5"]).optional(),
        urgency: z.enum(["High", "Medium", "Low"]).optional(),
        importance: z.enum(["High", "Medium", "Low"]).optional(),
        reportType: z.enum(["incident", "accident"]).optional(),
        reportedActions: z.array(z.string()).optional(),
        aiSuggestedActions: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, reportedActions, aiSuggestedActions, ...rest } = input;
      const updateData: any = { ...rest };
      if (reportedActions !== undefined) {
        updateData.reportedActions = JSON.stringify(reportedActions);
      }
      if (aiSuggestedActions !== undefined) {
        updateData.aiSuggestedActions = JSON.stringify(aiSuggestedActions);
        updateData.preventionActions = JSON.stringify(aiSuggestedActions); // 後方互換
      }
      return updateIncident(id, updateData);
    }),

  // 確定保存
  confirm: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const incident = await getIncidentById(input.id);
      if (!incident) throw new TRPCError({ code: "NOT_FOUND" });

      const confirmed = await confirmIncident(input.id, ctx.user.id);

      const needsAlert = isHighUrgency(
        (incident.impactLevel ?? "0") as ImpactLevel,
        incident.urgency ?? "Low"
      );
      if (needsAlert) {
        await notifyOwner({
          title: `緊急インシデント確定: レベル${incident.impactLevel}`,
          content: `緊急対応性: ${incident.urgency}\n場所: ${incident.location ?? "不明"}\n概要: ${incident.summaryWhat ?? ""}`,
        }).catch(() => {});
      }

      return confirmed;
    }),

  // 1件取得
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const incident = await getIncidentById(input.id);
      if (!incident) throw new TRPCError({ code: "NOT_FOUND" });
      return incident;
    }),

  // 一覧取得
  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(["draft", "confirmed"]).optional(),
        reportType: z.enum(["incident", "accident"]).optional(),
        impactLevel: z.string().optional(),
        urgency: z.enum(["High", "Medium", "Low"]).optional(),
        importance: z.enum(["High", "Medium", "Low"]).optional(),
        sortBy: z.enum(["createdAt", "occurredAt"]).default("createdAt"),
        sortOrder: z.enum(["asc", "desc"]).default("desc"),
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      return listIncidents(input);
    }),

  // ダッシュボード集計
  dashboardStats: protectedProcedure.query(async () => {
    return getDashboardStats();
  }),

  // 月次トレンド
  monthlyTrends: protectedProcedure
    .input(z.object({ months: z.number().min(3).max(24).default(12) }).optional())
    .query(async ({ input }) => {
      return getMonthlyTrends(input?.months ?? 12);
    }),
});
