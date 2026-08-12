import { useEffect, useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, ClipboardList, FileCheck2, FilePlus2, HardDrive, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getLocalStats, listLocalReports, type LocalReport } from "@/lib/localDb";

export default function Dashboard() {
  const [stats, setStats] = useState({ total: 0, confirmed: 0, drafts: 0, incident: 0, accident: 0, urgent: 0 });
  const [recent, setRecent] = useState<LocalReport[]>([]);

  useEffect(() => {
    void Promise.all([getLocalStats(), listLocalReports()]).then(([nextStats, nextReports]) => {
      setStats(nextStats);
      setRecent(nextReports.slice(0, 6));
    });
  }, []);

  const summaryCards = [
    { label: "保存済み報告書", value: stats.total, icon: ClipboardList, className: "text-slate-700 bg-slate-50" },
    { label: "未確定の下書き", value: stats.drafts, icon: FilePlus2, className: "text-amber-700 bg-amber-50" },
    { label: "確定済み", value: stats.confirmed, icon: FileCheck2, className: "text-emerald-700 bg-emerald-50" },
    { label: "要確認", value: stats.urgent, icon: AlertTriangle, className: "text-red-700 bg-red-50" },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <section className="rounded-2xl bg-gradient-to-r from-teal-700 to-emerald-600 text-white px-6 py-7 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-teal-100 text-sm mb-2"><HardDrive className="h-4 w-4" />完全ローカルモード</div>
            <h1 className="text-2xl font-bold tracking-tight">インシデント管理ダッシュボード</h1>
            <p className="mt-2 text-sm text-teal-50">報告書と添付ファイルは、この端末のブラウザ内だけに保存されています。</p>
          </div>
          <Link href="/upload"><Button className="bg-white text-teal-800 hover:bg-teal-50 gap-2"><FilePlus2 className="h-4 w-4" />新規報告書を登録</Button></Link>
        </div>
      </section>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {summaryCards.map((card) => (
          <Card key={card.label} className="shadow-none"><CardContent className="p-4"><div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${card.className}`}><card.icon className="h-4 w-4" /></div><p className="mt-3 text-2xl font-bold">{card.value}</p><p className="text-xs text-muted-foreground mt-1">{card.label}</p></CardContent></Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <Card className="lg:col-span-3 shadow-none"><CardHeader className="flex-row items-center justify-between pb-3"><CardTitle className="text-base">最近更新した報告書</CardTitle><Link href="/incidents" className="text-sm text-teal-700 hover:underline">一覧を見る</Link></CardHeader><CardContent>{recent.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground">まだ報告書がありません。新規登録から記録を始めてください。</div> : <div className="divide-y">{recent.map((report) => <Link key={report.id} href={`/incidents/${report.id}`} className="flex items-center justify-between gap-4 py-3 hover:bg-muted/40 px-2 -mx-2 rounded-md"><div className="min-w-0"><div className="flex gap-2 items-center"><Badge variant={report.reportType === "accident" ? "destructive" : "secondary"}>{report.reportType === "accident" ? "アクシデント" : "インシデント"}</Badge><span className="text-xs text-muted-foreground">{report.status === "confirmed" ? "確定済み" : "下書き"}</span></div><p className="mt-1 text-sm font-medium truncate">{report.summaryWhat || "事象概要が未入力です"}</p><p className="text-xs text-muted-foreground mt-0.5">{report.location || "場所未入力"} ・ {report.occurredAt?.replace("T", " ") || "日時未入力"}</p></div><span className="shrink-0 text-xs text-muted-foreground">Lv{report.impactLevel}</span></Link>)}</div>}</CardContent></Card>
        <Card className="lg:col-span-2 shadow-none"><CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" />ローカル運用の注意</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground leading-6 space-y-3"><p>ログインは不要で、入力内容・添付画像・PDFは外部サーバーへ送信されません。</p><p>端末の故障やブラウザのサイトデータ削除に備え、定期的にバックアップZIPを書き出してください。</p><Link href="/backup"><Button variant="outline" size="sm" className="w-full">バックアップ・復元を開く</Button></Link></CardContent></Card>
      </div>
    </div>
  );
}
