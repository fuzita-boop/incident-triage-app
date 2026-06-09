import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, FileBarChart2, AlertTriangle, TrendingUp, MapPin, Clock, Tag } from "lucide-react";
import { toast } from "sonner";

// ─── 定数 ────────────────────────────────────────────────────────────────────

const IMPACT_LABEL: Record<string, string> = {
  "0": "Lv0 未実施",
  "1": "Lv1 実害なし",
  "2": "Lv2 追加観察",
  "3a": "Lv3a 軽微処置",
  "3b": "Lv3b 濃厚処置",
  "4": "Lv4 永続障害",
  "5": "Lv5 死亡",
};

const IMPACT_COLORS: Record<string, string> = {
  "0": "bg-gray-100 text-gray-600",
  "1": "bg-blue-50 text-blue-700",
  "2": "bg-yellow-50 text-yellow-700",
  "3a": "bg-orange-50 text-orange-700",
  "3b": "bg-orange-100 text-orange-800",
  "4": "bg-red-100 text-red-800",
  "5": "bg-red-200 text-red-900",
};

// ─── 型 ──────────────────────────────────────────────────────────────────────

interface GroupStats {
  total: number;
  byImpactLevel: Record<string, number>;
  topLocations: { name: string; count: number }[];
  timeBlocks: Record<string, number>;
  topKeywords: { keyword: string; count: number }[];
  byUrgency: Record<string, number>;
  recentSummaries: {
    occurredAt: string;
    location: string;
    summaryWhat: string;
    impactLevel: string;
    urgency: string;
  }[];
}

// ─── コンポーネント ───────────────────────────────────────────────────────────

function StatBar({ label, count, max, color }: { label: string; count: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-28 shrink-0 text-xs text-muted-foreground truncate">{label}</span>
      <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-xs font-semibold">{count}件</span>
    </div>
  );
}

function GroupCard({
  title,
  stats,
  color,
  borderColor,
  badgeClass,
}: {
  title: string;
  stats: GroupStats;
  color: string;
  borderColor: string;
  badgeClass: string;
}) {
  const levels = ["0", "1", "2", "3a", "3b", "4", "5"];
  const maxLvlCount = Math.max(...levels.map((l) => stats.byImpactLevel[l] ?? 0), 1);
  const maxLocCount = stats.topLocations[0]?.count ?? 1;
  const timeOrder = ["深夜(0-5時)", "早朝(6-11時)", "日中(12-17時)", "夕方夜間(18-23時)"];
  const maxTimeCount = Math.max(...timeOrder.map((t) => stats.timeBlocks[t] ?? 0), 1);

  return (
    <Card className={`border-l-4 ${borderColor}`}>
      <CardHeader className="pb-3 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className={`text-sm font-bold ${color}`}>{title}</CardTitle>
          <Badge className={badgeClass}>{stats.total}件</Badge>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-4">
        {stats.total === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">該当月の報告書はありません</p>
        ) : (
          <>
            {/* 影響度レベル分布 */}
            <div>
              <div className={`flex items-center gap-1.5 mb-2 text-xs font-semibold ${color}`}>
                <TrendingUp className="h-3.5 w-3.5" />
                影響度レベル分布
              </div>
              <div className="space-y-1">
                {levels.map((lvl) => {
                  const cnt = stats.byImpactLevel[lvl] ?? 0;
                  if (cnt === 0) return null;
                  const isHigh = lvl === "3b" || lvl === "4" || lvl === "5";
                  return (
                    <StatBar
                      key={lvl}
                      label={IMPACT_LABEL[lvl] ?? lvl}
                      count={cnt}
                      max={maxLvlCount}
                      color={isHigh ? "bg-orange-500" : "bg-teal-500"}
                    />
                  );
                })}
              </div>
            </div>

            {/* 発生場所 TOP5 */}
            {stats.topLocations.length > 0 && (
              <div>
                <div className={`flex items-center gap-1.5 mb-2 text-xs font-semibold ${color}`}>
                  <MapPin className="h-3.5 w-3.5" />
                  発生場所 TOP5
                </div>
                <div className="space-y-1">
                  {stats.topLocations.slice(0, 5).map((loc) => (
                    <StatBar key={loc.name} label={loc.name} count={loc.count} max={maxLocCount} color="bg-blue-400" />
                  ))}
                </div>
              </div>
            )}

            {/* 時間帯別 */}
            <div>
              <div className={`flex items-center gap-1.5 mb-2 text-xs font-semibold ${color}`}>
                <Clock className="h-3.5 w-3.5" />
                時間帯別発生状況
              </div>
              <div className="space-y-1">
                {timeOrder.map((slot) => (
                  <StatBar key={slot} label={slot} count={stats.timeBlocks[slot] ?? 0} max={maxTimeCount} color="bg-violet-400" />
                ))}
              </div>
            </div>

            {/* 頻出キーワード */}
            {stats.topKeywords.length > 0 && (
              <div>
                <div className={`flex items-center gap-1.5 mb-2 text-xs font-semibold ${color}`}>
                  <Tag className="h-3.5 w-3.5" />
                  頻出キーワード
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {stats.topKeywords.slice(0, 5).map((kw) => (
                    <Badge key={kw.keyword} variant="secondary" className="text-xs">
                      {kw.keyword} <span className="ml-1 font-bold">{kw.count}</span>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* 直近事例 */}
            {stats.recentSummaries.length > 0 && (
              <div>
                <div className={`flex items-center gap-1.5 mb-2 text-xs font-semibold ${color}`}>
                  <AlertTriangle className="h-3.5 w-3.5" />
                  直近の報告事例
                </div>
                <div className="space-y-1.5">
                  {stats.recentSummaries.slice(0, 4).map((s, i) => {
                    const isHigh = s.urgency === "High" || s.impactLevel === "3b" || s.impactLevel === "4" || s.impactLevel === "5";
                    return (
                      <div key={i} className={`rounded-md px-2 py-1.5 text-xs ${isHigh ? "bg-orange-50 border border-orange-200" : "bg-muted/50"}`}>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <Badge className={`text-[10px] px-1 py-0 ${IMPACT_COLORS[s.impactLevel] ?? ""}`}>
                            {s.impactLevel}
                          </Badge>
                          <span className="text-muted-foreground">{s.occurredAt.slice(0, 10)}</span>
                          {s.location && <span className="text-muted-foreground">・{s.location.slice(0, 8)}</span>}
                        </div>
                        <p className="text-foreground leading-tight line-clamp-2">{s.summaryWhat}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── メインページ ─────────────────────────────────────────────────────────────

export default function MonthlyReportPage() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [isDownloading, setIsDownloading] = useState(false);

  const { data, isLoading, error } = trpc.incidents.getMonthlyReport.useQuery({ year, month });

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const res = await fetch(`/api/monthly-report/pdf?year=${year}&month=${month}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("PDF生成に失敗しました");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `monthly_report_${year}_${String(month).padStart(2, "0")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("月次レポートをダウンロードしました");
    } catch (e) {
      toast.error("ダウンロードに失敗しました。もう一度お試しください。");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* ページヘッダー */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FileBarChart2 className="h-6 w-6 text-teal-600" />
            <h1 className="text-xl font-bold text-foreground">月次レポート</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            指定した月のインシデント・アクシデントを集計し、A4 1枚のPDFレポートを出力します。
          </p>
        </div>
        <Button
          onClick={handleDownload}
          disabled={isDownloading || isLoading || !data}
          className="gap-2 bg-teal-600 hover:bg-teal-700 text-white shrink-0"
        >
          <Download className="h-4 w-4" />
          {isDownloading ? "生成中..." : "PDFダウンロード"}
        </Button>
      </div>

      {/* 年月セレクター */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">対象月:</span>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}年</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map((m) => (
                  <SelectItem key={m} value={String(m)}>{m}月</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {data && (
              <Badge variant="outline" className="ml-2 text-sm">
                合計 <span className="font-bold ml-1">{data.totalAll}件</span>
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ローディング */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-teal-500 border-t-transparent mr-3" />
          集計データを読み込み中...
        </div>
      )}

      {/* エラー */}
      {error && (
        <Card className="border-destructive/50">
          <CardContent className="pt-4 text-destructive text-sm">
            データの取得に失敗しました: {error.message}
          </CardContent>
        </Card>
      )}

      {/* 集計結果 */}
      {data && !isLoading && (
        <>
          {data.totalAll === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <FileBarChart2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">{year}年{month}月の確定済み報告書はありません。</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <GroupCard
                title="インシデント（ヒヤリハット）"
                stats={data.incident}
                color="text-teal-700"
                borderColor="border-teal-500"
                badgeClass="bg-teal-100 text-teal-800 hover:bg-teal-100"
              />
              <GroupCard
                title="アクシデント（事故報告書）"
                stats={data.accident}
                color="text-orange-700"
                borderColor="border-orange-500"
                badgeClass="bg-orange-100 text-orange-800 hover:bg-orange-100"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
