import { afterEach, describe, expect, it } from "vitest";
import {
  createEmptyReport,
  createLocalBackup,
  getLocalStats,
  getMonthlyLocalReport,
  listLocalAttachments,
  localDb,
  restoreLocalBackup,
  saveLocalReport,
} from "./localDb";

afterEach(async () => {
  await localDb.delete();
  await localDb.open();
});

describe("localDb", () => {
  it("インシデント・アクシデントを端末内IndexedDBへ保存し、集計する", async () => {
    const incident = createEmptyReport("incident");
    await saveLocalReport({ ...incident, status: "confirmed", occurredAt: "2026-08-03T10:00", summaryWhat: "転倒しそうになった", location: "デイルーム", impactLevel: "1" });
    const accident = createEmptyReport("accident");
    await saveLocalReport({ ...accident, status: "confirmed", occurredAt: "2026-08-10T14:00", summaryWhat: "誤薬を確認した", location: "居室", impactLevel: "3a", urgency: "High" });

    expect(await getLocalStats()).toMatchObject({ total: 2, confirmed: 2, incident: 1, accident: 1, urgent: 1 });
    const report = await getMonthlyLocalReport(2026, 8);
    expect(report.totalAll).toBe(2);
    expect(report.incident.topLocations).toEqual([{ name: "デイルーム", count: 1 }]);
    expect(report.accident.topKeywords).toContainEqual({ keyword: "誤薬", count: 1 });
  });

  it("バックアップZIPに添付Blobを含め、別のローカルDBへ復元できる", async () => {
    const report = createEmptyReport("incident");
    const saved = await saveLocalReport({ ...report, summaryWhat: "添付を含むテスト" });
    await localDb.attachments.add({ id: "attachment-1", reportId: saved.id, name: "sample.txt", type: "text/plain", size: 5, blob: new Blob(["local"], { type: "text/plain" }), createdAt: Date.now() });
    const archive = await createLocalBackup();
    const file = new File([archive], "backup.zip", { type: "application/zip" });
    await localDb.reports.clear();
    await localDb.attachments.clear();

    await expect(restoreLocalBackup(file, "replace")).resolves.toEqual({ reports: 1, attachments: 1 });
    const attachments = await listLocalAttachments(saved.id);
    expect(attachments).toHaveLength(1);
    expect(await attachments[0].blob.text()).toBe("local");
  });
});
