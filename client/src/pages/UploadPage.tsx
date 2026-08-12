import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Upload, FilePlus2, Paperclip, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { addLocalAttachments, createEmptyReport, saveLocalReport, type LocalReport } from "@/lib/localDb";
import { toast } from "sonner";

export default function UploadPage() {
  const [, setLocation] = useLocation();
  const [report, setReport] = useState<LocalReport>(() => createEmptyReport());
  const [files, setFiles] = useState<File[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const filesLabel = useMemo(() => files.map((file) => file.name).join("、"), [files]);
  const update = <K extends keyof LocalReport>(key: K, value: LocalReport[K]) => setReport((current) => ({ ...current, [key]: value }));

  const save = async () => {
    if (!report.summaryWhat.trim()) { toast.error("事象概要（何が起きたか）を入力してください。"); return; }
    setIsSaving(true);
    try {
      const saved = await saveLocalReport(report);
      await addLocalAttachments(saved.id, files);
      toast.success("端末内に下書きを保存しました。");
      setLocation(`/incidents/${saved.id}`);
    } catch {
      toast.error("保存に失敗しました。ブラウザの保存容量をご確認ください。");
    } finally { setIsSaving(false); }
  };

  return <div className="max-w-3xl mx-auto space-y-5"><div><p className="text-sm text-teal-700 font-medium">完全ローカル入力</p><h1 className="text-2xl font-bold mt-1">新規報告書を登録</h1><p className="text-sm text-muted-foreground mt-2">添付した画像・PDFを含め、すべてのデータはこの端末内にのみ保存されます。AIによる外部解析は行いません。</p></div><Card className="shadow-none"><CardContent className="pt-5 grid gap-5"><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div className="space-y-2"><Label>報告種別</Label><Select value={report.reportType} onValueChange={(value) => update("reportType", value as LocalReport["reportType"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="incident">インシデント（ヒヤリハット）</SelectItem><SelectItem value="accident">アクシデント（事故報告書）</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label htmlFor="occurredAt">発生日時</Label><Input id="occurredAt" type="datetime-local" value={report.occurredAt} onChange={(event) => update("occurredAt", event.target.value)} /></div></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div className="space-y-2"><Label htmlFor="location">発生場所</Label><Input id="location" value={report.location} onChange={(event) => update("location", event.target.value)} placeholder="例：デイルーム" /></div><div className="space-y-2"><Label htmlFor="subjectInitials">対象者（イニシャル等）</Label><Input id="subjectInitials" value={report.subjectInitials} onChange={(event) => update("subjectInitials", event.target.value)} placeholder="例：A.K." /></div></div><div className="space-y-2"><Label htmlFor="summaryWhat">事象概要（何が起きたか）</Label><Textarea id="summaryWhat" className="min-h-28" value={report.summaryWhat} onChange={(event) => update("summaryWhat", event.target.value)} placeholder="事実を簡潔に記載してください" /></div><div className="space-y-2"><Label htmlFor="summaryCause">想定される要因</Label><Textarea id="summaryCause" value={report.summaryCause} onChange={(event) => update("summaryCause", event.target.value)} placeholder="例：確認手順が十分でなかった" /></div><div className="space-y-2"><Label htmlFor="summaryResult">結果・対応状況</Label><Textarea id="summaryResult" value={report.summaryResult} onChange={(event) => update("summaryResult", event.target.value)} /></div><div className="grid grid-cols-1 sm:grid-cols-3 gap-4"><div className="space-y-2"><Label>影響度</Label><Select value={report.impactLevel} onValueChange={(value) => update("impactLevel", value as LocalReport["impactLevel"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["0", "1", "2", "3a", "3b", "4", "5"].map((level) => <SelectItem key={level} value={level}>レベル {level}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>緊急対応性</Label><Select value={report.urgency} onValueChange={(value) => update("urgency", value as LocalReport["urgency"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Low", "Medium", "High"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>重要度</Label><Select value={report.importance} onValueChange={(value) => update("importance", value as LocalReport["importance"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Low", "Medium", "High"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div></div><div className="rounded-xl border border-dashed p-4 bg-muted/30"><Label htmlFor="attachments" className="cursor-pointer flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 text-teal-700"><Upload className="h-5 w-5" /></span><span><span className="block font-medium">画像・PDFを端末内に添付</span><span className="block text-xs text-muted-foreground mt-1">クリックして選択。ファイルはネットワークへ送信されません。</span></span></Label><Input id="attachments" type="file" accept="image/*,.pdf,application/pdf" multiple className="sr-only" onChange={(event) => setFiles(Array.from(event.target.files ?? []))} />{files.length > 0 && <p className="mt-3 text-sm flex items-start gap-2"><Paperclip className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />{filesLabel}</p>}</div><div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between sm:items-center pt-2"><p className="text-xs text-muted-foreground flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-emerald-600" />ログイン・外部API不要。端末内だけに保存。</p><Button onClick={() => void save()} disabled={isSaving} className="gap-2 bg-teal-700 hover:bg-teal-800"><FilePlus2 className="h-4 w-4" />{isSaving ? "保存中..." : "下書きを保存"}</Button></div></CardContent></Card></div>;
}
