import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import JSZip from "jszip";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { getIncidentById, getIncidentAnalysisData } from "../db";
import { generateIncidentPdf } from "../pdfExport";
import { generateMonthlyReportPdf } from "../monthlyReportPdf";
import { getMonthlyReportData } from "../db";
import { invokeLLM } from "./llm";
import { sdk } from "./sdk";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);

  // PDF export endpoint
  app.get("/api/incidents/:id/pdf", async (req, res) => {
    try {
      const id = parseInt(req.params.id ?? "", 10);
      if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
      const incident = await getIncidentById(id);
      if (!incident) { res.status(404).json({ error: "Incident not found" }); return; }

      // シェル分析データを並行取得（失敗しても PDF 生成は続行）
      const reportType = (incident.reportType ?? "incident") as "incident" | "accident";
      const [analysis, fishbone] = await Promise.allSettled([
        getIncidentAnalysisData(reportType),
        (async () => {
          if (!incident.summaryWhat) return null;
          const reportLabel = reportType === "accident" ? "アクシデント（事故報告書）" : "インシデント（ヒヤリハット）";
          const resp = await invokeLLM({
            messages: [
              {
                role: "system",
                content: `あなたは医療・介護現場のリスクマネジメント専門家です。以下の${reportLabel}報告書の内容を分析し、フィッシュボーン図（特性要因図）として構造化してください。5カテゴリー（人/手順/機械・設備/環境/管理）で分類し、必ずJSONのみを返してください。`,
              },
              {
                role: "user",
                content: `事象: ${incident.summaryWhat}\n原因: ${incident.summaryCause ?? "不明"}\n結果: ${incident.summaryResult ?? "不明"}\n発生場所: ${incident.location ?? "不明"}`,
              },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "fishbone_analysis",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    effect: { type: "string" },
                    categories: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string" },
                          causes: { type: "array", items: { type: "string" } },
                        },
                        required: ["name", "causes"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["effect", "categories"],
                  additionalProperties: false,
                },
              },
            },
          });
          const content = (resp.choices[0]?.message?.content ?? "{}") as string;
          try { return JSON.parse(content); } catch { return null; }
        })(),
      ]);

      const shellAnalysis = {
        analysis: analysis.status === "fulfilled" ? analysis.value : null,
        fishbone: fishbone.status === "fulfilled" ? fishbone.value : null,
      };

      const pdfBuffer = await generateIncidentPdf(incident, shellAnalysis);
      const filename = encodeURIComponent(`incident_${id}_${new Date().toISOString().slice(0, 10)}.pdf`);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${filename}`);
      res.setHeader("Content-Length", pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (err) {
      console.error("[PDF Export] Error:", err);
      res.status(500).json({ error: "PDF generation failed" });
    }
  });
  // 一括PDF/ZIPダウンロードエンドポイント
  app.get("/api/incidents/bulk-pdf", async (req, res) => {
    try {
      // 認証チェック
      let authedUser: Awaited<ReturnType<typeof sdk.authenticateRequest>> | null = null;
      try {
        authedUser = await sdk.authenticateRequest(req);
      } catch {
        authedUser = null;
      }
      if (!authedUser) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const idsParam = (req.query.ids as string) ?? "";
      const ids = idsParam
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n) && n > 0)
        .slice(0, 50); // 最大50件

      if (ids.length === 0) {
        res.status(400).json({ error: "No valid IDs provided" });
        return;
      }

      // JSZipで各PDFを生成してZIPに追加
      const zip = new JSZip();

      for (const id of ids) {
        try {
          const incident = await getIncidentById(id);
          if (!incident) continue;

          const reportType = (incident.reportType ?? "incident") as "incident" | "accident";
          const [analysis, fishbone] = await Promise.allSettled([
            getIncidentAnalysisData(reportType),
            (async () => {
              if (!incident.summaryWhat) return null;
              const reportLabel = reportType === "accident" ? "アクシデント（事故報告書）" : "インシデント（ヒヤリハット）";
              const resp = await invokeLLM({
                messages: [
                  { role: "system", content: `あなたは医療・介護現場のリスクマネジメント専門家です。以下の${reportLabel}報告書の内容を分析し、フィッシュボーン図として構造化してください。5カテゴリー（人/手順/機械・設備/環境/管理）で分類し、必ずJSONのみを返してください。` },
                  { role: "user", content: `事象: ${incident.summaryWhat}\n原因: ${incident.summaryCause ?? "不明"}\n結果: ${incident.summaryResult ?? "不明"}\n発生場所: ${incident.location ?? "不明"}` },
                ],
                response_format: {
                  type: "json_schema",
                  json_schema: {
                    name: "fishbone_analysis",
                    strict: true,
                    schema: {
                      type: "object",
                      properties: {
                        effect: { type: "string" },
                        categories: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              name: { type: "string" },
                              causes: { type: "array", items: { type: "string" } },
                            },
                            required: ["name", "causes"],
                            additionalProperties: false,
                          },
                        },
                      },
                      required: ["effect", "categories"],
                      additionalProperties: false,
                    },
                  },
                },
              });
              const content = (resp.choices[0]?.message?.content ?? "{}") as string;
              try { return JSON.parse(content); } catch { return null; }
            })(),
          ]);

          const shellAnalysis = {
            analysis: analysis.status === "fulfilled" ? analysis.value : null,
            fishbone: fishbone.status === "fulfilled" ? fishbone.value : null,
          };

          const pdfBuffer = await generateIncidentPdf(incident, shellAnalysis);
          const dateStr = (incident.occurredAt ?? incident.createdAt?.toISOString().slice(0, 10) ?? "unknown").slice(0, 10);
          const filename = `${dateStr}_report_${id}.pdf`;
          zip.file(filename, pdfBuffer);
        } catch (err) {
          console.warn(`[Bulk PDF] Failed to generate PDF for incident ${id}:`, err);
        }
      }

      const zipName = `reports_${new Date().toISOString().slice(0, 10)}.zip`;
      const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(zipName)}`);
      res.send(zipBuffer);
    } catch (err) {
      console.error("[Bulk PDF] Error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "ZIP generation failed" });
      }
    }
  });

  // 月次レポートPDFエンドポイント
  app.get("/api/monthly-report/pdf", async (req, res) => {
    try {
      // 認証チェック（sdk.authenticateRequestでセッションJWTを検証）
      try {
        await sdk.authenticateRequest(req);
      } catch {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const yearStr = req.query.year as string;
      const monthStr = req.query.month as string;
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);

      if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        res.status(400).json({ error: "Invalid year or month" });
        return;
      }

      const data = await getMonthlyReportData(year, month);
      const pdfBuffer = await generateMonthlyReportPdf(data);
      const filename = encodeURIComponent(`monthly_report_${year}_${String(month).padStart(2, "0")}.pdf`);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${filename}`);
      res.setHeader("Content-Length", pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (err) {
      console.error("[Monthly Report PDF] Error:", err);
      res.status(500).json({ error: "PDF generation failed" });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
