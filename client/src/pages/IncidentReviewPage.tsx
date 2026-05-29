import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
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
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  Lightbulb,
  Plus,
  Sparkles,
  Stethoscope,
  Trash2,
} from "lucide-react";
import ShellAnalysisPanel from "@/components/ShellAnalysisPanel";
import { cn } from "@/lib/utils";
import {
  IMPACT_LEVEL_LABELS,
  REPORT_TYPE_LABELS,
  isUrgentIncident,
  type ImpactLevel,
  type ReportType,
  type UrgencyLevel,
} from "../../../shared/types";

const IMPACT_LEVELS: ImpactLevel[] = ["0", "1", "2", "3a", "3b", "4", "5"];
const URGENCY_OPTIONS: UrgencyLevel[] = ["High", "Medium", "Low"];
const URGENCY_LABELS_JP: Record<UrgencyLevel, string> = {
  High: "高（緊急）",
  Medium: "中",
  Low: "低",
};

function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

export default function IncidentReviewPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const id = parseInt(params.id ?? "0", 10);

  const { data: incident, isLoading, refetch } = trpc.incidents.getById.useQuery({ id });

  const updateMutation = trpc.incidents.updateDraft.useMutation({
    onSuccess: () => toast.success("変更を保存しました"),
    onError: (e) => toast.error(`保存失敗: ${e.message}`),
  });

  const confirmMutation = trpc.incidents.confirm.useMutation({
    onSuccess: () => {
      toast.success("報告書を確定しました");
      refetch();
    },
    onError: (e) => toast.error(`確定失敗: ${e.message}`),
  });

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const utils = trpc.useUtils();
  const deleteMutation = trpc.incidents.delete.useMutation({
    onSuccess: () => {
      toast.success("報告書を削除しました");
      utils.incidents.list.invalidate();
      utils.incidents.dashboardStats.invalidate();
      setLocation("/incidents");
    },
    onError: () => toast.error("削除に失敗しました。もう一度お試しください。"),
  });

  // フォーム状態
  const [form, setForm] = useState({
    occurredAt: "",
    location: "",
    subjectInitials: "",
    summaryWhat: "",
    summaryCause: "",
    summaryResult: "",
    impactLevel: "0" as ImpactLevel,
    urgency: "Low" as UrgencyLevel,
    importance: "Low" as UrgencyLevel,
    reportType: "incident" as ReportType,
    reportedActions: [] as string[],      // 報告書記載の対策
    aiSuggestedActions: [] as string[],   // AI提案の再発防止策
  });

  useEffect(() => {
    if (incident) {
      // 後方互換: aiSuggestedActionsがなければpreventionActionsから読む
      const aiActions = parseJsonArray(incident.aiSuggestedActions as string | null)
        .length > 0
        ? parseJsonArray(incident.aiSuggestedActions as string | null)
        : parseJsonArray(incident.preventionActions as string | null);

      setForm({
        occurredAt: incident.occurredAt ?? "",
        location: incident.location ?? "",
        subjectInitials: incident.subjectInitials ?? "",
        summaryWhat: incident.summaryWhat ?? "",
        summaryCause: incident.summaryCause ?? "",
        summaryResult: incident.summaryResult ?? "",
        impactLevel: (incident.impactLevel ?? "0") as ImpactLevel,
        urgency: (incident.urgency ?? "Low") as UrgencyLevel,
        importance: (incident.importance ?? "Low") as UrgencyLevel,
        reportType: (incident.reportType ?? "incident") as ReportType,
        reportedActions: parseJsonArray(incident.reportedActions as string | null),
        aiSuggestedActions: aiActions,
      });
    }
  }, [incident]);

  const isUrgent = isUrgentIncident(form.impactLevel, form.urgency);
  const isConfirmed = incident?.status === "confirmed";

  const handleSave = () => {
    updateMutation.mutate({
      id,
      ...form,
      reportedActions: form.reportedActions.filter((a) => a.trim() !== ""),
      aiSuggestedActions: form.aiSuggestedActions.filter((a) => a.trim() !== ""),
    });
  };

  const handleConfirm = () => {
    updateMutation.mutate(
      {
        id,
        ...form,
        reportedActions: form.reportedActions.filter((a) => a.trim() !== ""),
        aiSuggestedActions: form.aiSuggestedActions.filter((a) => a.trim() !== ""),
      },
      { onSuccess: () => confirmMutation.mutate({ id }) }
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground">インシデントが見つかりません</p>
        <Button variant="outline" onClick={() => setLocation("/incidents")}>
          一覧に戻る
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ヘッダー */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/incidents")}
          className="gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          一覧に戻る
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight">
              報告書 #{id} — 確認・編集
            </h1>
            {isConfirmed ? (
              <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1">
                <CheckCircle2 className="h-3 w-3" />
                確定済み
              </Badge>
            ) : (
              <Badge className="bg-amber-50 text-amber-700 border-amber-200">
                未確定（下書き）
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            ハルシネーション対策: 元の報告書とAI解析結果を照合してください
          </p>
        </div>
      </div>

      {/* 緊急アラートバナー */}
      {isUrgent && (
        <div className="urgent-banner rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-700 text-sm">
              🚨 緊急対応が必要な{form.reportType === "accident" ? "アクシデント（事故）" : "インシデント（ヒヤリハット）"}です
            </p>
            <p className="text-xs text-red-600 mt-0.5">
              影響度レベル {form.impactLevel} / 緊急対応性: {URGENCY_LABELS_JP[form.urgency]}
              — 即時の医療処置・家族連絡・行政報告を確認してください
            </p>
          </div>
        </div>
      )}

      {/* メインコンテンツ: 左右分割 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 左: 元の報告書 */}
        <Card className="shadow-sm border-border/60">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              元の報告書
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {incident.fileUrl ? (
              incident.fileMimeType === "application/pdf" ? (
                <iframe
                  src={incident.fileUrl}
                  className="w-full h-[520px] rounded-lg border border-border"
                  title="報告書PDF"
                />
              ) : (
                <img
                  src={incident.fileUrl}
                  alt="報告書"
                  className="w-full rounded-lg border border-border object-contain max-h-[520px] bg-muted/20"
                />
              )
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground text-sm bg-muted/20 rounded-lg">
                ファイルが見つかりません
              </div>
            )}
          </CardContent>
        </Card>

        {/* 右: AI解析結果フォーム */}
        <div className="space-y-4">
          {/* 基本情報 */}
          <Card className="shadow-sm border-border/60">
            <CardHeader className="pb-3 border-b border-border/50">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                AI解析結果 — 確認・修正
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {/* 報告種別 */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">報告種別</Label>
                <div className="flex gap-2">
                  {(["incident", "accident"] as ReportType[]).map((type) => (
                    <button
                      key={type}
                      disabled={isConfirmed}
                      onClick={() => setForm((f) => ({ ...f, reportType: type }))}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 py-3 px-4 rounded-lg border-2 text-sm font-medium transition-all",
                        form.reportType === type
                          ? type === "incident"
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-orange-500 bg-orange-50 text-orange-700"
                          : "border-border text-muted-foreground hover:border-primary/40",
                        isConfirmed && "opacity-60 cursor-not-allowed"
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
              </div>

              {/* 発生日時・場所 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">発生日時</Label>
                  <Input
                    value={form.occurredAt}
                    onChange={(e) => setForm((f) => ({ ...f, occurredAt: e.target.value }))}
                    disabled={isConfirmed}
                    placeholder="例: 2024年1月15日 14:30"
                    className="text-sm h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">発生場所</Label>
                  <Input
                    value={form.location}
                    onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                    disabled={isConfirmed}
                    placeholder="例: 2階 食堂"
                    className="text-sm h-9"
                  />
                </div>
              </div>

              {/* 対象者 */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">対象者（イニシャル）</Label>
                <Input
                  value={form.subjectInitials}
                  onChange={(e) => setForm((f) => ({ ...f, subjectInitials: e.target.value }))}
                  disabled={isConfirmed}
                  placeholder="例: A.T."
                  className="text-sm h-9"
                />
              </div>

              {/* 事象概要 */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">事象概要 — 何が起きたか</Label>
                <Textarea
                  value={form.summaryWhat}
                  onChange={(e) => setForm((f) => ({ ...f, summaryWhat: e.target.value }))}
                  disabled={isConfirmed}
                  rows={2}
                  className="text-sm resize-none"
                  placeholder="30文字程度で簡潔に"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">事象概要 — 原因</Label>
                <Textarea
                  value={form.summaryCause}
                  onChange={(e) => setForm((f) => ({ ...f, summaryCause: e.target.value }))}
                  disabled={isConfirmed}
                  rows={2}
                  className="text-sm resize-none"
                  placeholder="30文字程度で簡潔に"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">事象概要 — 結果・影響</Label>
                <Textarea
                  value={form.summaryResult}
                  onChange={(e) => setForm((f) => ({ ...f, summaryResult: e.target.value }))}
                  disabled={isConfirmed}
                  rows={2}
                  className="text-sm resize-none"
                  placeholder="30文字程度で簡潔に"
                />
              </div>
            </CardContent>
          </Card>

          {/* 分類 */}
          <Card className="shadow-sm border-border/60">
            <CardHeader className="pb-3 border-b border-border/50">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                分類・判定
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {/* 影響度レベル */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">影響度レベル</Label>
                <Select
                  value={form.impactLevel}
                  onValueChange={(v) => setForm((f) => ({ ...f, impactLevel: v as ImpactLevel }))}
                  disabled={isConfirmed}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {IMPACT_LEVELS.map((lvl) => (
                      <SelectItem key={lvl} value={lvl}>
                        <span className="inline-flex items-center gap-2">
                          <span className={cn("inline-flex items-center justify-center rounded px-1.5 py-0.5 text-xs font-semibold level-" + lvl)}>
                            Lv.{lvl}
                          </span>
                          <span className="text-xs">{IMPACT_LEVEL_LABELS[lvl].split(" — ")[1]}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className={cn("rounded-lg px-3 py-2 text-xs level-" + form.impactLevel)}>
                  {IMPACT_LEVEL_LABELS[form.impactLevel]}
                </div>
              </div>

              {/* 緊急対応性・重要度 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">緊急対応性</Label>
                  <Select
                    value={form.urgency}
                    onValueChange={(v) => setForm((f) => ({ ...f, urgency: v as UrgencyLevel }))}
                    disabled={isConfirmed}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {URGENCY_OPTIONS.map((u) => (
                        <SelectItem key={u} value={u}>
                          <span className={cn("badge-" + u.toLowerCase(), "rounded px-1.5 py-0.5 text-xs font-medium")}>
                            {URGENCY_LABELS_JP[u]}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">重要度</Label>
                  <Select
                    value={form.importance}
                    onValueChange={(v) => setForm((f) => ({ ...f, importance: v as UrgencyLevel }))}
                    disabled={isConfirmed}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {URGENCY_OPTIONS.map((u) => (
                        <SelectItem key={u} value={u}>
                          <span className={cn("badge-" + u.toLowerCase(), "rounded px-1.5 py-0.5 text-xs font-medium")}>
                            {URGENCY_LABELS_JP[u]}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 報告書記載の対策 */}
          <Card className="shadow-sm border-border/60">
            <CardHeader className="pb-3 border-b border-border/50">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-500" />
                報告書に記載された対策
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
              {form.reportedActions.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">報告書に対策の記載はありませんでした</p>
              ) : (
                form.reportedActions.map((action, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="mt-2 h-5 w-5 rounded-full bg-slate-100 text-slate-600 text-xs flex items-center justify-center font-semibold shrink-0">
                      {i + 1}
                    </span>
                    <Textarea
                      value={action}
                      onChange={(e) => {
                        const updated = [...form.reportedActions];
                        updated[i] = e.target.value;
                        setForm((f) => ({ ...f, reportedActions: updated }));
                      }}
                      disabled={isConfirmed}
                      rows={2}
                      className="text-sm resize-none flex-1"
                      placeholder={`報告書記載の対策 ${i + 1}`}
                    />
                    {!isConfirmed && (
                      <button
                        onClick={() => {
                          const updated = form.reportedActions.filter((_, idx) => idx !== i);
                          setForm((f) => ({ ...f, reportedActions: updated }));
                        }}
                        className="mt-2 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))
              )}
              {!isConfirmed && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs gap-1.5 mt-1"
                  onClick={() => setForm((f) => ({ ...f, reportedActions: [...f.reportedActions, ""] }))}
                >
                  <Plus className="h-3.5 w-3.5" />
                  対策を追加
                </Button>
              )}
            </CardContent>
          </Card>

          {/* AI提案の再発防止策 */}
          <Card className="shadow-sm border-primary/20 bg-primary/[0.02]">
            <CardHeader className="pb-3 border-b border-primary/15">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-sm font-semibold text-primary/80 uppercase tracking-wide flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-primary" />
                  AI提案: 再発防止策・改善アクション
                </CardTitle>
                <Badge variant="outline" className="text-[10px] text-primary border-primary/30 bg-primary/5 shrink-0">
                  AI分析
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                確認不足・手順不備・環境整備・教育研修など多角的な観点からAIが提案した再発防止策です。内容を確認・修正してください。
              </p>
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
              {form.aiSuggestedActions.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">AI提案がありません</p>
              ) : (
                form.aiSuggestedActions.map((action, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="mt-2 h-5 w-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-semibold shrink-0">
                      {i + 1}
                    </span>
                    <Textarea
                      value={action}
                      onChange={(e) => {
                        const updated = [...form.aiSuggestedActions];
                        updated[i] = e.target.value;
                        setForm((f) => ({ ...f, aiSuggestedActions: updated }));
                      }}
                      disabled={isConfirmed}
                      rows={2}
                      className="text-sm resize-none flex-1 bg-white/60"
                      placeholder={`改善アクション ${i + 1}`}
                    />
                    {!isConfirmed && (
                      <button
                        onClick={() => {
                          const updated = form.aiSuggestedActions.filter((_, idx) => idx !== i);
                          setForm((f) => ({ ...f, aiSuggestedActions: updated }));
                        }}
                        className="mt-2 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))
              )}
              {!isConfirmed && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs gap-1.5 mt-1 border-primary/30 text-primary hover:bg-primary/5"
                  onClick={() => setForm((f) => ({ ...f, aiSuggestedActions: [...f.aiSuggestedActions, ""] }))}
                >
                  <Plus className="h-3.5 w-3.5" />
                  提案を追加
                </Button>
              )}
            </CardContent>
          </Card>

          {/* シェル分析 */}
          <ShellAnalysisPanel
            incidentId={id}
            reportType={form.reportType}
            summaryWhat={form.summaryWhat}
            summaryCause={form.summaryCause}
            summaryResult={form.summaryResult}
            location={form.location}
          />

          {/* アクションボタン */}
          {!isConfirmed && (
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handleSave}
                disabled={updateMutation.isPending || confirmMutation.isPending}
                className="flex-1"
              >
                {updateMutation.isPending ? "保存中..." : "変更を保存"}
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={updateMutation.isPending || confirmMutation.isPending}
                className="flex-1 shadow-md"
              >
                {confirmMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    確定中...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    確定して保存
                  </span>
                )}
              </Button>
            </div>
          )}

          {isConfirmed && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                この報告書は確定済みです。編集はできません。
              </div>
              <Button
                variant="outline"
                className="w-full gap-2 border-teal-200 text-teal-700 hover:bg-teal-50"
                onClick={() => window.open(`/api/incidents/${incident?.id}/pdf`, "_blank")}
              >
                <Download className="h-4 w-4" />
                PDFでダウンロード
              </Button>
            </div>
          )}

          {/* 削除ボタン */}
          <div className="pt-2 border-t border-border/40">
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2 text-destructive border-destructive/30 hover:bg-destructive/5"
              onClick={() => setShowDeleteDialog(true)}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="h-4 w-4" />
              この報告書を削除
            </Button>
          </div>
        </div>
      </div>

      {/* 削除確認ダイアログ */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
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
              onClick={() => deleteMutation.mutate({ id })}
            >
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
