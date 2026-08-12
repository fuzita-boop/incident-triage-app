import { useEffect, useState } from "react";
import { Link } from "wouter";
import { FilePlus2, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deleteLocalReport, listLocalReports, type LocalReport, type ReportStatus, type ReportType } from "@/lib/localDb";
import { toast } from "sonner";

export default function IncidentListPage() {
  const [reports, setReports] = useState<LocalReport[]>([]);
  const [keyword, setKeyword] = useState("");
  const [type, setType] = useState<ReportType | "all">("all");
  const [status, setStatus] = useState<ReportStatus | "all">("all");
  const load = async () => setReports(await listLocalReports({ keyword, reportType: type, status }));
  useEffect(() => { void load(); }, [keyword, type, status]);
  const remove = async (id: string) => {
    if (!window.confirm("この報告書と添付ファイルをこの端末から削除します。よろしいですか？")) return;
    await deleteLocalReport(id); await load(); toast.success("端末内の報告書を削除しました。");
  };
  return <div className="max-w-6xl mx-auto space-y-5"><div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-end"><div><h1 className="text-2xl font-bold">報告書一覧</h1><p className="text-sm text-muted-foreground mt-2">この端末に保存されている報告書のみを表示しています。</p></div><Link href="/upload"><Button className="gap-2 bg-teal-700 hover:bg-teal-800"><FilePlus2 className="h-4 w-4" />新規登録</Button></Link></div><Card className="shadow-none"><CardContent className="p-4 flex flex-col gap-3 md:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="概要・場所・対象者で検索" value={keyword} onChange={(event) => setKeyword(event.target.value)} /></div><Select value={type} onValueChange={(value) => setType(value as ReportType | "all")}><SelectTrigger className="md:w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全種別</SelectItem><SelectItem value="incident">インシデント</SelectItem><SelectItem value="accident">アクシデント</SelectItem></SelectContent></Select><Select value={status} onValueChange={(value) => setStatus(value as ReportStatus | "all")}><SelectTrigger className="md:w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全状態</SelectItem><SelectItem value="draft">下書き</SelectItem><SelectItem value="confirmed">確定済み</SelectItem></SelectContent></Select></CardContent></Card><Card className="shadow-none"><CardContent className="p-0">{reports.length === 0 ? <div className="text-center text-sm text-muted-foreground py-14">該当する報告書はありません。</div> : <div className="divide-y">{reports.map((report) => <div key={report.id} className="flex items-center gap-3 px-4 py-4 hover:bg-muted/30"><Link href={`/incidents/${report.id}`} className="flex-1 min-w-0"><div className="flex items-center gap-2"><Badge variant={report.reportType === "accident" ? "destructive" : "secondary"}>{report.reportType === "accident" ? "アクシデント" : "インシデント"}</Badge><Badge variant="outline">{report.status === "confirmed" ? "確定済み" : "下書き"}</Badge><span className="text-xs text-muted-foreground">Lv{report.impactLevel}</span></div><p className="font-medium text-sm mt-2 truncate">{report.summaryWhat || "事象概要が未入力です"}</p><p className="text-xs text-muted-foreground mt-1">{report.occurredAt?.replace("T", " ") || "日時未入力"} ・ {report.location || "場所未入力"}</p></Link><Button variant="ghost" size="icon" onClick={() => void remove(report.id)} aria-label="削除"><Trash2 className="h-4 w-4 text-destructive" /></Button></div>)}</div>}</CardContent></Card></div>;
}
