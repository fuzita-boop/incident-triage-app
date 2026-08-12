import { describe, expect, it } from "vitest";
import { createDraftFromOcr } from "./localOcr";

describe("createDraftFromOcr", () => {
  it("OCR抽出テキストから事故報告書の主要項目を自動作成する", () => {
    const report = createDraftFromOcr([
      "アクシデント報告書",
      "発生日時：2026年8月12日 14時30分",
      "発生場所：デイルーム",
      "対象者：A.K.",
      "事象概要：歩行中に転倒し、右膝を打撲した。",
      "原因：足元の確認不足",
      "対応：看護師が状態を確認し、家族へ連絡した。",
      "影響度：3a",
    ].join("\n"));

    expect(report.reportType).toBe("accident");
    expect(report.occurredAt).toBe("2026-08-12T14:30");
    expect(report.location).toBe("デイルーム");
    expect(report.subjectInitials).toBe("A.K.");
    expect(report.summaryWhat).toContain("転倒");
    expect(report.summaryCause).toBe("足元の確認不足");
    expect(report.summaryResult).toContain("家族へ連絡");
    expect(report.impactLevel).toBe("3a");
  });

  it("項目ラベルが読めない場合も抽出テキストを概要下書きとして保持する", () => {
    const report = createDraftFromOcr("廊下で利用者がつまずき、職員が付き添って安全を確認した。", ["先頭20ページまでOCRしました。"]);

    expect(report.reportType).toBe("incident");
    expect(report.summaryWhat).toContain("つまずき");
    expect(report.ocrWarnings).toEqual(["先頭20ページまでOCRしました。"]);
  });

  it("日本語OCRで生じる文字間スペースと丸数字を正規化して抽出する", () => {
    const report = createDraftFromOcr("ア ク シ デ ン ト 報 告 書\n発 生 日 時 : ⑳②⑥ 年 ⑧ 月 ⑫ 日 ⑭ 時 ③0 分\n発 生 場 所 : デ イ ル ー ム\n対 象 者 : A.K.\n事 象 概 要 : 歩 行 中 に 転 倒 し た 。");

    expect(report.reportType).toBe("accident");
    expect(report.occurredAt).toBe("2026-08-12T14:30");
    expect(report.location).toBe("デイルーム");
    expect(report.subjectInitials).toBe("A.K.");
    expect(report.summaryWhat).toContain("転倒");
  });
});
