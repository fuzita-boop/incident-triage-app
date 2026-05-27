import { useState, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { FileImage, FileScan, FileText, Stethoscope, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { REPORT_TYPE_LABELS, type ReportType } from "../../../shared/types";

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export default function UploadPage() {
  const [, setLocation] = useLocation();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [reportType, setReportType] = useState<ReportType>("incident");
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const analyzeMutation = trpc.incidents.analyzeAndCreateDraft.useMutation({
    onSuccess: (incident) => {
      toast.success("AI解析が完了しました。内容を確認してください。");
      setLocation(`/incidents/${incident!.id}`);
    },
    onError: (err) => {
      toast.error(`解析に失敗しました: ${err.message}`);
    },
  });

  const handleFile = useCallback((f: File) => {
    if (!ACCEPTED_TYPES.includes(f.type)) {
      toast.error("JPEG、PNG、WebP、PDFファイルのみ対応しています");
      return;
    }
    if (f.size > MAX_FILE_SIZE) {
      toast.error("ファイルサイズは15MB以下にしてください");
      return;
    }
    setFile(f);
    if (f.type !== "application/pdf") {
      const url = URL.createObjectURL(f);
      setPreview(url);
    } else {
      setPreview(null);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) handleFile(dropped);
    },
    [handleFile]
  );

  const handleSubmit = async () => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      await analyzeMutation.mutateAsync({
        fileBase64: base64,
        fileName: file.name,
        mimeType: file.type,
        reportTypeHint: reportType,
      });
    };
    reader.readAsDataURL(file);
  };

  const clearFile = () => {
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* ヘッダー */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">新規報告書登録</h1>
        <p className="text-sm text-muted-foreground mt-1">
          インシデント・アクシデント報告書をアップロードしてAI解析を開始します
        </p>
      </div>

      {/* 報告種別トグル */}
      <Card className="shadow-sm border-border/60">
        <CardContent className="pt-5 pb-4">
          <p className="text-sm font-medium mb-3">報告種別</p>
          <div className="flex gap-2">
            {(["incident", "accident"] as ReportType[]).map((type) => (
              <button
                key={type}
                onClick={() => setReportType(type)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg border-2 text-sm font-medium transition-all",
                  reportType === type
                    ? type === "incident"
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-orange-500 bg-orange-50 text-orange-700"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                )}
              >
                {type === "incident" ? (
                  <Stethoscope className="h-4 w-4" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                <span className="text-xs leading-tight text-center">
                  {REPORT_TYPE_LABELS[type]}
                </span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            ※ AIが自動判定しますが、ここで手動設定した場合はその値が優先されます
          </p>
        </CardContent>
      </Card>

      {/* アップロードエリア */}
      <Card className="shadow-sm border-border/60">
        <CardContent className="pt-5 pb-5">
          <p className="text-sm font-medium mb-3">報告書ファイル</p>

          {!file ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all",
                isDragging
                  ? "border-primary bg-primary/5 scale-[1.01]"
                  : "border-border hover:border-primary/50 hover:bg-muted/30"
              )}
            >
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                <Upload className="h-7 w-7 text-muted-foreground" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">
                  ファイルをドラッグ＆ドロップ、またはクリックして選択
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  JPEG / PNG / WebP / PDF（最大15MB）
                </p>
              </div>
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <FileImage className="h-3.5 w-3.5" /> 画像ファイル
                </span>
                <span className="flex items-center gap-1">
                  <FileScan className="h-3.5 w-3.5" /> PDFファイル
                </span>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              {/* ファイルプレビュー */}
              {preview ? (
                <div className="relative">
                  <img
                    src={preview}
                    alt="プレビュー"
                    className="w-full max-h-72 object-contain bg-muted/30"
                  />
                  <button
                    onClick={clearFile}
                    className="absolute top-2 right-2 h-7 w-7 rounded-full bg-background/90 border border-border flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 bg-muted/30">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FileScan className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium truncate max-w-xs">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={clearFile}
                    className="h-7 w-7 rounded-full border border-border flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* ファイル情報 */}
              <div className="p-4 border-t border-border bg-muted/10">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{file.name}</span>
                  <span>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                </div>
              </div>
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </CardContent>
      </Card>

      {/* 送信ボタン */}
      <Button
        onClick={handleSubmit}
        disabled={!file || analyzeMutation.isPending}
        className="w-full h-12 text-base shadow-md hover:shadow-lg transition-all"
        size="lg"
      >
        {analyzeMutation.isPending ? (
          <span className="flex items-center gap-2">
            <span className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            AI解析中... しばらくお待ちください
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <FileScan className="h-5 w-5" />
            AI解析を開始する
          </span>
        )}
      </Button>

      <p className="text-xs text-center text-muted-foreground">
        解析結果は次の画面で確認・修正できます。確定操作を行うまでデータは保存されません。
      </p>
    </div>
  );
}
