import { trpc } from "@/lib/trpc";
import {
  IMPACT_LEVEL_SHORT,
  LOCATION_TAG_LABELS,
  isUrgentIncident,
  type ImpactLevel,
  type UrgencyLevel,
} from "../../../shared/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { AlertTriangle, Building2, CheckCircle2, ClipboardList, FileWarning, MapPin, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

const IMPACT_COLORS: Record<string, string> = {
  "0": "#94a3b8",
  "1": "#4ade80",
  "2": "#38bdf8",
  "3a": "#fbbf24",
  "3b": "#fb923c",
  "4": "#f87171",
  "5": "#dc2626",
};

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444"];

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { data: stats, isLoading } = trpc.incidents.dashboardStats.useQuery();
  const { data: recentIncidents } = trpc.incidents.list.useQuery({
    status: "confirmed",
    limit: 5,
  });
  const { data: draftIncidents } = trpc.incidents.list.useQuery({
    status: "draft",
    limit: 5,
  });

  const impactChartData = stats
    ? Object.entries(stats.byImpactLevel)
        .sort((a, b) => {
          const order = ["0", "1", "2", "3a", "3b", "4", "5"];
          return order.indexOf(a[0]) - order.indexOf(b[0]);
        })
        .map(([level, count]) => ({
          name: IMPACT_LEVEL_SHORT[level as ImpactLevel] ?? level,
          件数: count,
          fill: IMPACT_COLORS[level] ?? "#94a3b8",
        }))
    : [];

  const locationChartData = stats
    ? [
        { name: "施設内", value: stats.byLocationTag["facility"] ?? 0 },
        { name: "訪問", value: stats.byLocationTag["visit"] ?? 0 },
      ]
    : [];

  const urgencyChartData = stats
    ? [
        { name: "高（緊急）", value: stats.byUrgency["High"] ?? 0 },
        { name: "中", value: stats.byUrgency["Medium"] ?? 0 },
        { name: "低", value: stats.byUrgency["Low"] ?? 0 },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">ダッシュボード</h1>
          <p className="text-sm text-muted-foreground mt-1">
            インシデント報告の集計・分析
          </p>
        </div>
        <Button onClick={() => setLocation("/upload")} className="gap-2 shadow-sm">
          <Plus className="h-4 w-4" />
          新規登録
        </Button>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={<ClipboardList className="h-5 w-5 text-primary" />}
          label="確定済み件数"
          value={isLoading ? null : stats?.totalConfirmed ?? 0}
          color="primary"
        />
        <SummaryCard
          icon={<FileWarning className="h-5 w-5 text-amber-500" />}
          label="未確定（下書き）"
          value={isLoading ? null : stats?.totalDraft ?? 0}
          color="amber"
        />
        <SummaryCard
          icon={<Building2 className="h-5 w-5 text-blue-500" />}
          label="施設内"
          value={isLoading ? null : stats?.byLocationTag["facility"] ?? 0}
          color="blue"
        />
        <SummaryCard
          icon={<MapPin className="h-5 w-5 text-emerald-500" />}
          label="訪問"
          value={isLoading ? null : stats?.byLocationTag["visit"] ?? 0}
          color="emerald"
        />
      </div>

      {/* グラフ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 影響度レベル別 */}
        <Card className="lg:col-span-2 shadow-sm border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">影響度レベル別件数</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : impactChartData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                データがありません
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={impactChartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                  />
                  <Bar dataKey="件数" radius={[4, 4, 0, 0]}>
                    {impactChartData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* 拠点別 */}
        <Card className="shadow-sm border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">拠点別内訳</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : locationChartData.every((d) => d.value === 0) ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                データがありません
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={locationChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {locationChartData.map((_, index) => (
                      <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 下書き一覧 */}
      {(draftIncidents?.length ?? 0) > 0 && (
        <Card className="shadow-sm border-amber-200 bg-amber-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-4 w-4" />
              確定待ちの報告書（{draftIncidents?.length}件）
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {draftIncidents?.map((inc) => (
                <IncidentRow
                  key={inc.id}
                  incident={inc}
                  onClick={() => setLocation(`/incidents/${inc.id}`)}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 最近の確定済みインシデント */}
      <Card className="shadow-sm border-border/60">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              最近の確定済みインシデント
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => setLocation("/incidents")}
            >
              すべて表示
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {(recentIncidents?.length ?? 0) === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              確定済みのインシデントはありません
            </div>
          ) : (
            <div className="space-y-2">
              {recentIncidents?.map((inc) => (
                <IncidentRow
                  key={inc.id}
                  incident={inc}
                  onClick={() => setLocation(`/incidents/${inc.id}`)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | null;
  color: string;
}) {
  return (
    <Card className="shadow-sm border-border/60">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
            {value === null ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-3xl font-bold tracking-tight">{value}</p>
            )}
          </div>
          <div className="p-2 rounded-lg bg-muted/50">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function IncidentRow({
  incident,
  onClick,
}: {
  incident: any;
  onClick: () => void;
}) {
  const urgent = isUrgentIncident(
    (incident.impactLevel ?? "0") as ImpactLevel,
    (incident.urgency ?? "Low") as UrgencyLevel
  );

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors text-left group"
    >
      <span
        className={`inline-flex items-center justify-center rounded-md px-2 py-1 text-xs font-semibold level-${incident.impactLevel ?? "0"} shrink-0`}
      >
        {IMPACT_LEVEL_SHORT[(incident.impactLevel ?? "0") as ImpactLevel]}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {incident.summaryWhat ?? "（概要なし）"}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {incident.location ?? "場所不明"} ·{" "}
          {incident.occurredAt ?? "日時不明"}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {urgent && (
          <Badge className="badge-high text-xs px-2 py-0.5">緊急</Badge>
        )}
        <span className="text-xs text-muted-foreground">
          {LOCATION_TAG_LABELS[(incident.locationTag ?? "facility") as keyof typeof LOCATION_TAG_LABELS]}
        </span>
      </div>
    </button>
  );
}
