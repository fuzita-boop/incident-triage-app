import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  BarChart2,
  GitBranch,
  TrendingUp,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import type { ReportType } from "../../../shared/types";
import FishboneSvg from "./FishboneSvg";

// ─── 色定数 ──────────────────────────────────────────────────────────────────
const CHART_COLORS = ["#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe", "#ede9fe", "#f5f3ff", "#faf5ff"];
const CAUSE_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#f59e0b", "#64748b"];

// ─── 発生パターン分析 ─────────────────────────────────────────────────────────
function PatternAnalysis({
  reportType,
  location,
  occurredAt,
}: {
  reportType: ReportType;
  location?: string;
  occurredAt?: string;
}) {
  const { data, isLoading, error } = trpc.incidents.getAnalysis.useQuery({ reportType });
  const { data: hotspots } = trpc.incidents.getHotspots.useQuery(
    { reportType, location, occurredAt },
    { enabled: !!(location || occurredAt) }
  );

  if (isLoading) return <AnalysisSkeleton />;
  if (error || !data) return <ErrorState message="データの取得に失敗しました" />;
  if (data.totalSimilarCases === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        <BarChart2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
        同じ種別の確定済み事例がまだありません。
        <br />事例が蓄積されると発生パターンが表示されます。
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        同種別の確定済み事例 <strong>{data.totalSimilarCases}件</strong> を集計した発生パターンです。
      </p>

      {/* ホットスポットアラート */}
      {hotspots && (hotspots.locationAlert || hotspots.timeAlert) && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700 p-3 space-y-1.5">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-400 flex items-center gap-1">
            ⚠️ リスク集中エリア検出
          </p>
          {hotspots.locationAlert && (
            <p className="text-xs text-amber-700 dark:text-amber-500">
              📍 <strong>{hotspots.locationAlert.location}</strong> での同種別事例が全体の <strong>{Math.round((hotspots.locationAlert.count / hotspots.locationAlert.totalCases) * 100)}%</strong>（{hotspots.locationAlert.count}件/{hotspots.locationAlert.totalCases}件）を占めています。要注意エリアです。
            </p>
          )}
          {hotspots.timeAlert && (
            <p className="text-xs text-amber-700 dark:text-amber-500">
              ⏰ <strong>{hotspots.timeAlert.hour}台の時間帯</strong>に同種別事例が集中しています（{hotspots.timeAlert.count}件/{hotspots.timeAlert.totalCases}件）。この時間帯は要注意です。
            </p>
          )}
        </div>
      )}

      {/* 場所別 */}
      {data.topLocations.length > 0 && (
        <div>
          <p className="text-xs font-medium text-foreground/70 mb-2">📍 発生場所ランキング（上位8件）</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.topLocations} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                formatter={(v) => [`${v}件`, "件数"]}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {data.topLocations.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 時間帯別 */}
      {data.hourlyPattern.length > 0 && (
        <div>
          <p className="text-xs font-medium text-foreground/70 mb-2">🕐 時間帯別発生件数</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={data.hourlyPattern} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="hour" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                formatter={(v) => [`${v}件`, "件数"]}
              />
              <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 影響度レベル別 */}
      {Object.keys(data.byImpactLevel).length > 0 && (
        <div>
          <p className="text-xs font-medium text-foreground/70 mb-2">📊 影響度レベル別分布</p>
          <div className="flex gap-2 flex-wrap">
            {(["0", "1", "2", "3a", "3b", "4", "5"] as const).map((lvl) => {
              const count = data.byImpactLevel[lvl] ?? 0;
              if (count === 0) return null;
              const pct = Math.round((count / data.totalSimilarCases) * 100);
              return (
                <div key={lvl} className="flex-1 min-w-[60px] text-center p-2 rounded-lg bg-muted/50 border border-border/40">
                  <p className="text-[10px] text-muted-foreground">Lv.{lvl}</p>
                  <p className="text-lg font-bold text-foreground">{count}</p>
                  <p className="text-[10px] text-muted-foreground">{pct}%</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── フィッシュボーン図 ───────────────────────────────────────────────────────
interface FishboneProps {
  incidentId: number;
  summaryWhat: string;
  summaryCause?: string;
  summaryResult?: string;
  location?: string;
  reportType: ReportType;
}

function FishboneAnalysis({ incidentId, summaryWhat, summaryCause, summaryResult, location, reportType }: FishboneProps) {
  const [fishbone, setFishbone] = useState<{
    effect: string;
    categories: { name: string; causes: string[] }[];
  } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const fishboneMutation = trpc.incidents.getFishbone.useMutation({
    onSuccess: (data) => {
      setFishbone(data);
      setIsGenerating(false);
    },
    onError: () => {
      setIsGenerating(false);
    },
  });

  const handleGenerate = () => {
    setIsGenerating(true);
    fishboneMutation.mutate({
      id: incidentId,
      summaryWhat,
      summaryCause,
      summaryResult,
      location,
      reportType,
    });
  };

  const CATEGORY_COLORS: Record<string, string> = {
    "人（Man）": "#ef4444",
    "手順（Method）": "#f97316",
    "機械・設備（Machine）": "#3b82f6",
    "環境（Milieu）": "#22c55e",
    "管理（Management）": "#8b5cf6",
  };

  if (!fishbone) {
    return (
      <div className="py-8 text-center space-y-3">
        <GitBranch className="h-10 w-10 mx-auto text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          この事象の原因を5M視点（人・手順・設備・環境・管理）で構造化します。
        </p>
        <Button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="gap-2"
          size="sm"
        >
          {isGenerating ? (
            <>
              <span className="h-3.5 w-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              AI分析中...
            </>
          ) : (
            <>
              <GitBranch className="h-3.5 w-3.5" />
              フィッシュボーン図を生成
            </>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 flex-1 mr-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-xs font-medium text-destructive">{fishbone.effect}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={handleGenerate} disabled={isGenerating} className="gap-1 text-xs shrink-0">
          <RefreshCw className={`h-3 w-3 ${isGenerating ? "animate-spin" : ""}`} />
          再生成
        </Button>
      </div>

      {/* SVGフィッシュボーン図 */}
      {fishbone.categories.length > 0 && (
        <FishboneSvg data={fishbone} />
      )}

      {/* 各カテゴリーの詳細リスト */}
      <div className="space-y-2">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">各カテゴリーの詳細</p>
        <div className="grid grid-cols-1 gap-2">
          {fishbone.categories.map((cat, idx) => {
            const COLORS = ["#ef4444","#f97316","#3b82f6","#22c55e","#8b5cf6"];
            const color = COLORS[idx] ?? "#6366f1";
            return (
              <div key={cat.name} className="rounded-lg border border-border/60 overflow-hidden">
                <div className="px-3 py-1.5 text-xs font-semibold text-white" style={{ backgroundColor: color }}>
                  {cat.name}
                </div>
                <div className="px-3 py-2 space-y-1 bg-card">
                  {cat.causes.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">該当なし</p>
                  ) : (
                    cat.causes.map((cause, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="mt-0.5 h-4 w-4 rounded-full text-white text-[9px] flex items-center justify-center shrink-0 font-bold" style={{ backgroundColor: color }}>{i + 1}</span>
                        <p className="text-xs text-foreground/80 leading-relaxed">{cause}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── 統計的要因分析 ───────────────────────────────────────────────────────────
function StatisticalAnalysis({ reportType }: { reportType: ReportType }) {
  const { data, isLoading, error } = trpc.incidents.getAnalysis.useQuery({ reportType });

  if (isLoading) return <AnalysisSkeleton />;
  if (error || !data) return <ErrorState message="データの取得に失敗しました" />;
  if (data.totalSimilarCases === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-30" />
        同じ種別の確定済み事例がまだありません。
        <br />事例が蓄積されると統計的要因分析が表示されます。
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        同種別の確定済み事例 <strong>{data.totalSimilarCases}件</strong> に基づく要因キーワード頻度分析です。
      </p>

      {data.topCauses.length > 0 ? (
        <>
          <div>
            <p className="text-xs font-medium text-foreground/70 mb-3">🔍 頻出原因キーワード（上位10件）</p>
            <div className="space-y-2">
              {data.topCauses.map((item, i) => {
                const maxCount = data.topCauses[0]?.count ?? 1;
                const pct = Math.round((item.count / maxCount) * 100);
                return (
                  <div key={item.keyword} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-4 text-right shrink-0">{i + 1}</span>
                    <span className="text-xs font-medium w-24 shrink-0">{item.keyword}</span>
                    <div className="flex-1 h-5 bg-muted/40 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: CAUSE_COLORS[i % CAUSE_COLORS.length],
                        }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-8 text-right shrink-0">{item.count}件</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800/30">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-400 mb-1">💡 分析インサイト</p>
            <p className="text-xs text-amber-700 dark:text-amber-500 leading-relaxed">
              過去事例で最も多い要因は「<strong>{data.topCauses[0]?.keyword}</strong>」（{data.topCauses[0]?.count}件）です。
              {data.topCauses.length >= 2 && (
                <>次いで「<strong>{data.topCauses[1]?.keyword}</strong>」（{data.topCauses[1]?.count}件）が多く見られます。</>
              )}
              これらの要因に対する再発防止策を優先的に検討することを推奨します。
            </p>
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground italic py-4 text-center">
          原因キーワードが抽出できませんでした。事例が蓄積されると表示されます。
        </p>
      )}
    </div>
  );
}

// ─── ユーティリティコンポーネント ─────────────────────────────────────────────
function AnalysisSkeleton() {
  return (
    <div className="space-y-3 py-2">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="py-8 text-center text-sm text-muted-foreground">
      <AlertCircle className="h-6 w-6 mx-auto mb-2 text-destructive/50" />
      {message}
    </div>
  );
}

// ─── メインパネル ─────────────────────────────────────────────────────────────
interface ShellAnalysisPanelProps {
  incidentId: number;
  reportType: ReportType;
  summaryWhat: string;
  summaryCause?: string;
  summaryResult?: string;
  location?: string;
  occurredAt?: string;
}

export default function ShellAnalysisPanel({
  incidentId,
  reportType,
  summaryWhat,
  summaryCause,
  summaryResult,
  location,
  occurredAt,
}: ShellAnalysisPanelProps) {
  return (
    <Card className="shadow-sm border-indigo-200/60 bg-indigo-50/20 dark:bg-indigo-950/10 dark:border-indigo-800/30">
      <CardHeader className="pb-3 border-b border-indigo-200/40 dark:border-indigo-800/20">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-semibold text-indigo-700 dark:text-indigo-400 uppercase tracking-wide flex items-center gap-2">
            <BarChart2 className="h-4 w-4" />
            シェル分析
          </CardTitle>
          <Badge variant="outline" className="text-[10px] text-indigo-600 border-indigo-300 bg-indigo-50 dark:text-indigo-400 dark:border-indigo-700 dark:bg-indigo-950/30 shrink-0">
            データ分析
          </Badge>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">
          発生パターン・フィッシュボーン（特性要因図）・統計的要因の3つの視点から事象を分析します。
        </p>
      </CardHeader>
      <CardContent className="pt-4">
        <Tabs defaultValue="pattern">
          <TabsList className="w-full grid grid-cols-3 h-8 text-xs">
            <TabsTrigger value="pattern" className="text-xs gap-1">
              <BarChart2 className="h-3 w-3" />
              発生パターン
            </TabsTrigger>
            <TabsTrigger value="fishbone" className="text-xs gap-1">
              <GitBranch className="h-3 w-3" />
              フィッシュボーン
            </TabsTrigger>
            <TabsTrigger value="statistical" className="text-xs gap-1">
              <TrendingUp className="h-3 w-3" />
              統計的要因
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pattern" className="mt-4">
            <PatternAnalysis reportType={reportType} location={location} occurredAt={occurredAt} />
          </TabsContent>

          <TabsContent value="fishbone" className="mt-4">
            <FishboneAnalysis
              incidentId={incidentId}
              summaryWhat={summaryWhat}
              summaryCause={summaryCause}
              summaryResult={summaryResult}
              location={location}
              reportType={reportType}
            />
          </TabsContent>

          <TabsContent value="statistical" className="mt-4">
            <StatisticalAnalysis reportType={reportType} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
