import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Filter,
  Plus,
  Search,
  Stethoscope,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  IMPACT_LEVEL_SHORT,
  REPORT_TYPE_SHORT,
  isUrgentIncident,
  type ImpactLevel,
  type ReportType,
  type UrgencyLevel,
} from "../../../shared/types";

const URGENCY_JP: Record<string, string> = { High: "高（緊急）", Medium: "中", Low: "低" };

export default function IncidentListPage() {
  const [, setLocation] = useLocation();
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "draft" | "confirmed">("all");
  const [filterReportType, setFilterReportType] = useState<"all" | "incident" | "accident">("all");
  const [filterLevel, setFilterLevel] = useState<"all" | ImpactLevel>("all");
  const [filterUrgency, setFilterUrgency] = useState<"all" | UrgencyLevel>("all");
  const [sortBy, setSortBy] = useState<"createdAt" | "occurredAt">("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [keyword, setKeyword] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const utils = trpc.useUtils();
  const deleteMutation = trpc.incidents.delete.useMutation({
    onSuccess: () => {
      toast.success("報告書を削除しました");
      utils.incidents.list.invalidate();
      utils.incidents.dashboardStats.invalidate();
    },
    onError: () => {
      toast.error("削除に失敗しました。もう一度お試しください。");
    },
  });

  const { data: incidents, isLoading } = trpc.incidents.list.useQuery({
    status: filterStatus === "all" ? undefined : filterStatus,
    reportType: filterReportType === "all" ? undefined : filterReportType,
    impactLevel: filterLevel === "all" ? undefined : filterLevel,
    urgency: filterUrgency === "all" ? undefined : filterUrgency,
    sortBy,
    sortOrder,
    keyword: keyword || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    limit: 100,
  });

  return (
    <div className="space-y-5">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">報告書一覧</h1>
          <p className="text-sm text-muted-foreground mt-1">
            全報告書の管理・フィルタリング
          </p>
        </div>
        <Button onClick={() => setLocation("/upload")} className="gap-2 shadow-sm">
          <Plus className="h-4 w-4" />
          新規登録
        </Button>
      </div>

      {/* 検索バー */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9 pr-9 h-9 text-sm"
            placeholder="キーワードで検索（事象概要・場所・対象者イニシャルなど）"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setKeyword(keywordInput);
            }}
          />
          {keywordInput && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => { setKeywordInput(""); setKeyword(""); }}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9 px-4 text-sm"
          onClick={() => setKeyword(keywordInput)}
        >
          検索
        </Button>
      </div>

      {/* フィルター */}
      <Card className="shadow-sm border-border/60">
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
            <Filter className="h-4 w-4" />
            フィルター
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">ステータス</p>
              <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">すべて</SelectItem>
                  <SelectItem value="draft">未確定</SelectItem>
                  <SelectItem value="confirmed">確定済み</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">報告種別</p>
              <Select value={filterReportType} onValueChange={(v) => setFilterReportType(v as any)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">すべて</SelectItem>
                  <SelectItem value="incident">インシデント（ヒヤリハット）</SelectItem>
                  <SelectItem value="accident">アクシデント（事故報告書）</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">影響度レベル</p>
              <Select value={filterLevel} onValueChange={(v) => setFilterLevel(v as any)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">すべて</SelectItem>
                  {(["0", "1", "2", "3a", "3b", "4", "5"] as ImpactLevel[]).map((lvl) => (
                    <SelectItem key={lvl} value={lvl}>
                      Lv.{lvl}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">緊急対応性</p>
              <Select value={filterUrgency} onValueChange={(v) => setFilterUrgency(v as any)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">すべて</SelectItem>
                  <SelectItem value="High">高（緊急）</SelectItem>
                  <SelectItem value="Medium">中</SelectItem>
                  <SelectItem value="Low">低</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* 発生日時範囲 */}
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">発生日時（開始）</p>
              <Input
                type="date"
                className="h-8 text-xs"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">発生日時（終了）</p>
              <Input
                type="date"
                className="h-8 text-xs"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">並び替え</p>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="createdAt">登録日時</SelectItem>
                  <SelectItem value="occurredAt">発生日時</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">順序</p>
              <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as any)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">新しい順</SelectItem>
                  <SelectItem value="asc">古い順</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 件数・検索中表示 */}
      {!isLoading && (
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            {incidents?.length ?? 0} 件の報告書
          </p>
          {keyword && (
            <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
              <Search className="h-3 w-3" />
              「{keyword}」で検索中
              <button
                onClick={() => { setKeyword(""); setKeywordInput(""); }}
                className="ml-1 hover:text-primary/70"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {(dateFrom || dateTo) && (
            <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
              {dateFrom && dateTo ? `${dateFrom} 〜 ${dateTo}` : dateFrom ? `${dateFrom} 以降` : `${dateTo} 以前`}
              <button
                onClick={() => { setDateFrom(""); setDateTo(""); }}
                className="ml-1 hover:text-primary/70"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
        </div>
      )}

      {/* 一覧 */}
      <div className="space-y-2">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))
        ) : (incidents?.length ?? 0) === 0 ? (
          <Card className="shadow-sm border-border/60">
            <CardContent className="py-16 text-center">
              <p className="text-muted-foreground text-sm">
                条件に一致する報告書がありません
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setLocation("/upload")}
              >
                最初の報告書を登録する
              </Button>
            </CardContent>
          </Card>
        ) : (
          incidents?.map((inc) => {
            const urgent = isUrgentIncident(
              (inc.impactLevel ?? "0") as ImpactLevel,
              (inc.urgency ?? "Low") as UrgencyLevel
            );
            const rType = (inc.reportType ?? "incident") as ReportType;
            return (
              <button
                key={inc.id}
                onClick={() => setLocation(`/incidents/${inc.id}`)}
                className="w-full text-left group"
              >
                <Card
                  className={cn(
                    "shadow-sm transition-all hover:shadow-md hover:border-primary/30 cursor-pointer",
                    urgent ? "border-red-200 bg-red-50/30" : "border-border/60"
                  )}
                >
                  <CardContent className="py-4 px-5">
                    <div className="flex items-center gap-4">
                      {/* 影響度バッジ */}
                      <span
                        className={cn(
                          "inline-flex items-center justify-center rounded-lg px-2.5 py-1.5 text-sm font-bold shrink-0 level-" +
                            (inc.impactLevel ?? "0")
                        )}
                      >
                        {IMPACT_LEVEL_SHORT[(inc.impactLevel ?? "0") as ImpactLevel]}
                      </span>

                      {/* メイン情報 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {urgent && (
                            <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                          )}
                          <p className="text-sm font-semibold truncate">
                            {inc.summaryWhat ?? "（概要なし）"}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {inc.occurredAt ?? "日時不明"}
                          </span>
                          <span>·</span>
                          <span>{inc.location ?? "場所不明"}</span>
                          {inc.subjectInitials && (
                            <>
                              <span>·</span>
                              <span>{inc.subjectInitials}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* バッジ群 */}
                      <div className="flex items-center gap-2 shrink-0">
                        {urgent && (
                          <Badge className="badge-high text-xs px-2 py-0.5">緊急</Badge>
                        )}
                        <Badge
                          className={cn(
                            "text-xs px-2 py-0.5",
                            inc.urgency === "High"
                              ? "badge-high"
                              : inc.urgency === "Medium"
                              ? "badge-medium"
                              : "badge-low"
                          )}
                        >
                          {URGENCY_JP[inc.urgency ?? "Low"]}
                        </Badge>
                        {/* 報告種別バッジ */}
                        <span className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
                          {rType === "incident" ? (
                            <Stethoscope className="h-3 w-3 text-blue-500" />
                          ) : (
                            <FileText className="h-3 w-3 text-orange-500" />
                          )}
                          {REPORT_TYPE_SHORT[rType]}
                        </span>
                        {inc.status === "confirmed" ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <Clock className="h-4 w-4 text-amber-500" />
                        )}
                        {inc.status === "confirmed" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(`/api/incidents/${inc.id}/pdf`, "_blank");
                            }}
                            title="PDFダウンロード"
                            className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTargetId(inc.id);
                          }}
                          title="削除"
                          className="p-1 rounded hover:bg-red-50 transition-colors text-muted-foreground hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </button>
            );
          })
        )}
      </div>

      {/* 削除確認ダイアログ */}
      <AlertDialog open={deleteTargetId !== null} onOpenChange={(open) => { if (!open) setDeleteTargetId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>報告書を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              この操作は元に戻せません。確定済み・未確定どちらの報告書でも完全に削除されます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTargetId !== null) {
                  deleteMutation.mutate({ id: deleteTargetId });
                  setDeleteTargetId(null);
                }
              }}
            >
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
