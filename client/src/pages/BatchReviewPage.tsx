import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FileText,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  IMPACT_LEVEL_LABELS,
  REPORT_TYPE_LABELS,
  isUrgentIncident,
  type ImpactLevel,
} from "../../../shared/types";

export default function BatchReviewPage() {
  const params = useParams<{ uploadGroupId: string }>();
  const [, setLocation] = useLocation();
  const [confirmingAll, setConfirmingAll] = useState(false);

  const { data: incidents, isLoading, error } = trpc.incidents.getByUploadGroup.useQuery(
    { uploadGroupId: params.uploadGroupId ?? "" },
    { enabled: !!params.uploadGroupId }
  );

  const confirmMutation = trpc.incidents.confirm.useMutation();
  const utils = trpc.useUtils();

  const handleConfirmAll = async () => {
    if (!incidents || incidents.length === 0) return;
    const drafts = incidents.filter((i) => i.status === "draft");
    if (drafts.length === 0) {
      toast.info("すべての報告書は確定済みです");
      return;
    }
    setConfirmingAll(true);
    try {
      for (const inc of drafts) {
        await confirmMutation.mutateAsync({ id: inc.id });
      }
      await utils.incidents.getByUploadGroup.invalidate({ uploadGroupId: params.uploadGroupId });
      toast.success(`${drafts.length}件の報告書を確定しました`);
    } catch (e: any) {
      toast.error(`確定に失敗しました: ${e.message}`);
    } finally {
      setConfirmingAll(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground text-sm">報告書を読み込んでいます...</p>
        </div>
      </div>
    );
  }

  if (error || !incidents) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
          <p className="text-sm text-muted-foreground">データの取得に失敗しました</p>
          <Button variant="outline" onClick={() => setLocation("/upload")}>
            アップロードに戻る
          </Button>
        </div>
      </div>
    );
  }

  const draftCount = incidents.filter((i) => i.status === "draft").length;
  const confirmedCount = incidents.filter((i) => i.status === "confirmed").length;
  const urgentCount = incidents.filter((i) =>
    isUrgentIncident(i.impactLevel as ImpactLevel, i.urgency ?? "Low")
  ).length;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* ヘッダー */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileText className="h-4 w-4" />
          <span>バッチアップロード結果</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {incidents.length}件の報告書が検出されました
        </h1>
        <p className="text-sm text-muted-foreground">
          各報告書を個別に確認・修正してから確定してください。一括確定も可能です。
        </p>
      </div>

      {/* サマリーバー */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-sm">
          <span className="font-medium">{draftCount}</span>
          <span>件 未確定</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span className="font-medium">{confirmedCount}</span>
          <span>件 確定済み</span>
        </div>
        {urgentCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-50 border border-red-200 text-red-700 text-sm animate-pulse">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span className="font-medium">{urgentCount}</span>
            <span>件 緊急対応要</span>
          </div>
        )}
      </div>

      {/* 緊急アラート */}
      {urgentCount > 0 && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-800">緊急対応が必要な報告書があります</p>
            <p className="text-xs text-red-600 mt-0.5">
              影響度レベル3b以上または緊急対応性Highの報告書が{urgentCount}件含まれています。速やかに確認・対応してください。
            </p>
          </div>
        </div>
      )}

      {/* 一括確定ボタン */}
      {draftCount > 0 && (
        <div className="flex justify-end">
          <Button
            onClick={handleConfirmAll}
            disabled={confirmingAll}
            className="gap-2"
          >
            {confirmingAll ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {confirmingAll ? "確定中..." : `未確定 ${draftCount}件をすべて確定`}
          </Button>
        </div>
      )}

      <Separator />

      {/* 報告書カード一覧 */}
      <div className="space-y-4">
        {incidents.map((incident, idx) => {
          const isUrgent = isUrgentIncident(
            incident.impactLevel as ImpactLevel,
            incident.urgency ?? "Low"
          );
          const isConfirmed = incident.status === "confirmed";

          return (
            <Card
              key={incident.id}
              className={`transition-all duration-200 hover:shadow-md cursor-pointer ${
                isUrgent && !isConfirmed
                  ? "border-red-300 bg-red-50/30"
                  : isConfirmed
                  ? "border-emerald-200 bg-emerald-50/20 opacity-80"
                  : "border-border hover:border-primary/30"
              }`}
              onClick={() => setLocation(`/incidents/${incident.id}`)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded shrink-0">
                      #{idx + 1}
                    </span>
                    <CardTitle className="text-base truncate">
                      {incident.summaryWhat ?? "（事象概要なし）"}
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isConfirmed ? (
                      <Badge variant="outline" className="border-emerald-400 text-emerald-700 bg-emerald-50 text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        確定済み
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-amber-400 text-amber-700 bg-amber-50 text-xs">
                        未確定
                      </Badge>
                    )}
                    {isUrgent && (
                      <Badge variant="destructive" className="text-xs">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        緊急
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground mb-3">
                  {incident.occurredAt && (
                    <span>
                      <span className="text-foreground/60 text-xs mr-1">発生日時</span>
                      {incident.occurredAt}
                    </span>
                  )}
                  {incident.location && (
                    <span>
                      <span className="text-foreground/60 text-xs mr-1">場所</span>
                      {incident.location}
                    </span>
                  )}
                  {incident.subjectInitials && (
                    <span>
                      <span className="text-foreground/60 text-xs mr-1">対象者</span>
                      {incident.subjectInitials}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge
                    variant="outline"
                    className={`text-xs ${
                      isUrgent
                        ? "border-red-400 text-red-700 bg-red-50"
                        : "border-slate-300 text-slate-600"
                    }`}
                  >
                    影響度 Lv.{incident.impactLevel ?? "0"}
                    {incident.impactLevel && ` — ${IMPACT_LEVEL_LABELS[incident.impactLevel as ImpactLevel] ?? ""}`}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`text-xs ${
                      incident.urgency === "High"
                        ? "border-red-400 text-red-700 bg-red-50"
                        : incident.urgency === "Medium"
                        ? "border-amber-400 text-amber-700 bg-amber-50"
                        : "border-slate-300 text-slate-600"
                    }`}
                  >
                    緊急対応性 {incident.urgency ?? "Low"}
                  </Badge>
                  {incident.reportType && (
                    <Badge variant="secondary" className="text-xs">
                      {REPORT_TYPE_LABELS[incident.reportType as "incident" | "accident"]}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center justify-end mt-3 text-xs text-primary font-medium gap-1">
                  詳細を確認・修正
                  <ChevronRight className="h-3.5 w-3.5" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* フッターアクション */}
      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={() => setLocation("/upload")}>
          別のファイルをアップロード
        </Button>
        <Button variant="outline" onClick={() => setLocation("/incidents")}>
          一覧に戻る
        </Button>
      </div>
    </div>
  );
}
