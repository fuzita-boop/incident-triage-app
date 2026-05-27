import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  confirmIncident,
  createDraftIncident,
  getDashboardStats,
  getIncidentById,
  listIncidents,
  updateIncident,
} from "../db";
import { invokeLLM } from "../_core/llm";
import { storagePut } from "../storage";
import { notifyOwner } from "../_core/notification";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";

// ─── Impact level helpers ────────────────────────────────────────────────────

const IMPACT_LEVELS = ["0", "1", "2", "3a", "3b", "4", "5"] as const;
type ImpactLevel = (typeof IMPACT_LEVELS)[number];

function isHighUrgency(impactLevel: ImpactLevel, urgency: string): boolean {
  const highLevels: ImpactLevel[] = ["3b", "4", "5"];
  return highLevels.includes(impactLevel) || urgency === "High";
}

// ─── AI analysis ─────────────────────────────────────────────────────────────

async function analyzeIncidentWithAI(
  fileUrl: string,
  mimeType: string,
  reportTypeHint?: string,
  fileBase64?: string
) {
  const systemPrompt = `あなたは医療・介護現場のインシデント・アクシデント報告書を解析する専門AIです。
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

必ずJSONのみを返してください。マークダウンや説明文は不要です。`;

  const userContent: any[] = [
    {
      type: "text",
      text: "以下の報告書を解析し、指定のJSON形式で構造化データを抽出してください。\n必ず以下のJSONスキーマに従って返答してください：\n{\"occurredAt\":\"発生日時\",\"location\":\"発生場所\",\"subjectInitials\":\"対象者イニシャル\",\"summaryWhat\":\"何が起きたか\",\"summaryCause\":\"原因\",\"summaryResult\":\"結果・影響\",\"impactLevel\":\"0|1|2|3a|3b|4|5\",\"urgency\":\"High|Medium|Low\",\"importance\":\"High|Medium|Low\",\"reportType\":\"incident|accident\",\"preventionActions\":[\"改善アクション\"]}\nマークダウンや説明文は一切不要です。JSONのみ返してください。",
    },
  ];

  if (mimeType === "application/pdf") {
    // PDFはBase64データを直接渡す（file_urlがサポートされない場合のフォールバック）
    if (fileBase64) {
      userContent.push({
        type: "image_url",
        image_url: {
          url: `data:application/pdf;base64,${fileBase64}`,
          detail: "high",
        },
      });
    } else {
      userContent.push({
        type: "file_url",
        file_url: { url: fileUrl, mime_type: "application/pdf" },
      });
    }
  } else {
    // 画像はBase64データ URLで渡す
    if (fileBase64) {
      userContent.push({
        type: "image_url",
        image_url: {
          url: `data:${mimeType};base64,${fileBase64}`,
          detail: "high",
        },
      });
    } else {
      userContent.push({
        type: "image_url",
        image_url: { url: fileUrl, detail: "high" },
      });
    }
  }

  const response = await invokeLLM({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    response_format: { type: "json_object" },
  });

  if (!response || !response.choices || response.choices.length === 0) {
    throw new Error("AI response is empty or malformed");
  }
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("AI response content is empty");

  let parsed: any;
  try {
    // マークダウンコードブロックが含まれる場合も考慮
    const rawContent = typeof content === "string" ? content : JSON.stringify(content);
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : rawContent;
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    console.error("[AI] Failed to parse JSON response:", content);
    throw new Error(`AIのレスポンスをJSONとして解析できませんでした。内容: ${String(content).slice(0, 200)}`);
  }

  // 改善アクションは3点以内に制限
  if (Array.isArray(parsed.preventionActions)) {
    parsed.preventionActions = parsed.preventionActions.slice(0, 3);
  }

  // 報告種別ヒントがあれば上書き
  if (reportTypeHint) {
    parsed.reportType = reportTypeHint;
  }

  return parsed;
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const incidentsRouter = router({
  // ファイルアップロード → AI解析 → draft保存
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
      const fileKey = `incidents/${ctx.user.id}/${Date.now()}.${ext}`;
      const { url: fileUrl } = await storagePut(fileKey, buffer, input.mimeType);

      // AI解析（Base64を直接渡してURLアクセス問題を回避）
      const analysis = await analyzeIncidentWithAI(
        fileUrl,
        input.mimeType,
        input.reportTypeHint,
        input.fileBase64
      );

      // draft保存
      const incident = await createDraftIncident({
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
        preventionActions: JSON.stringify(analysis.preventionActions),
        status: "draft",
        createdByUserId: ctx.user.id,
      });

      return incident;
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
        preventionActions: z.array(z.string()).max(3).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, preventionActions, ...rest } = input;
      const updateData: any = { ...rest };
      if (preventionActions !== undefined) {
        updateData.preventionActions = JSON.stringify(preventionActions);
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

      // 緊急アラート通知
      const needsAlert = isHighUrgency(
        (incident.impactLevel ?? "0") as ImpactLevel,
        incident.urgency ?? "Low"
      );
      if (needsAlert) {
        await notifyOwner({
          title: `🚨 緊急インシデント確定: レベル${incident.impactLevel}`,
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
});
