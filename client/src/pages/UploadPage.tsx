import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { FileScan, LoaderCircle, RotateCcw, ShieldCheck, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addLocalAttachments, saveLocalReport } from "@/lib/localDb";
import { createDraftFromOcr, extractLocalOcr, type OcrProgress } from "@/lib/localOcr";
import { toast } from "sonner";

export default function UploadPage() {
  const [, setLocation] = useLocation();
  const [files, setFiles] = useState<File[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const filesLabel = useMemo(() => files.map((file) => file.name).join("、"), [files]);

  const extractAndCreateDraft = async (selectedFiles: File[]) => {
    if (!selectedFiles.length || isExtracting) return;
    const supported = selectedFiles.filter((file) => file.type.startsWith("image/") || file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
    if (!supported.length) { toast.error("画像またはPDFを選択してください。"); return; }
    setFiles(supported);
    setRetryMessage(null);
    setIsExtracting(true);
    setProgress({ current: 0, total: 100, percent: 0, message: "端末内OCRを準備しています" });
    try {
      const result = await extractLocalOcr(supported, setProgress);
      const saved = await saveLocalReport(createDraftFromOcr(result.text, result.warnings));
      await addLocalAttachments(saved.id, supported);
      toast.success("OCRから下書きを自動作成しました。内容をご確認ください。");
      setLocation(`/incidents/${saved.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "文字の抽出に失敗しました。画像の鮮明さやファイル形式をご確認ください。";
      setRetryMessage(message);
      toast.error(message);
    } finally { setIsExtracting(false); }
  };

  return <div className="max-w-3xl mx-auto space-y-5"><div><p className="text-sm text-teal-700 font-medium">完全ローカルOCR</p><h1 className="text-2xl font-bold mt-1">画像・PDFから報告書を作成</h1><p className="text-sm text-muted-foreground mt-2">画像またはPDFを選択するだけで、この端末内で文字を読み取り、報告書の下書きを自動作成します。内容は外部へ送信されません。</p></div><Card className="shadow-none"><CardContent className="pt-6 space-y-5"><div className="rounded-2xl border-2 border-dashed border-teal-200 bg-teal-50/50 p-8 text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-100 text-teal-700"><FileScan className="h-7 w-7" /></span><h2 className="mt-4 font-semibold">画像・PDFを選択して自動作成</h2><p className="mt-2 text-sm text-muted-foreground">横向き・逆さまの画像やスキャンPDFも、向きを補正して端末内でOCRします。</p><Label htmlFor="attachments" className="mt-5 inline-flex"><Input id="attachments" type="file" accept="image/*,.pdf,application/pdf" multiple className="sr-only" disabled={isExtracting} onChange={(event) => void extractAndCreateDraft(Array.from(event.target.files ?? []))} /><Button asChild disabled={isExtracting} className="gap-2 bg-teal-700 hover:bg-teal-800"><span><Upload className="h-4 w-4" />画像・PDFを選択</span></Button></Label></div>{isExtracting && <div className="rounded-xl border bg-muted/30 p-4 space-y-3"><div className="flex items-center gap-2 text-sm font-medium"><LoaderCircle className="h-4 w-4 animate-spin text-teal-700" />{progress?.message ?? "処理しています"}</div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-teal-700 transition-all" style={{ width: `${progress?.percent ?? 0}%` }} /></div><p className="text-xs text-muted-foreground">初回は日本語OCRエンジンを端末へ準備するため、少し時間がかかる場合があります。</p></div>}{retryMessage && files.length > 0 && !isExtracting && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-sm text-amber-900">{retryMessage}</p><Button type="button" variant="outline" className="mt-3 gap-2 border-amber-300 bg-white" onClick={() => void extractAndCreateDraft(files)}><RotateCcw className="h-4 w-4" />同じファイルで再試行</Button></div>}{files.length > 0 && !isExtracting && <p className="text-sm text-muted-foreground">選択済み: {filesLabel}</p>}<p className="text-xs text-muted-foreground flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-emerald-600" />ログイン・外部API不要。元ファイル、OCR結果、下書きは端末内にのみ保存されます。</p></CardContent></Card></div>;
}
