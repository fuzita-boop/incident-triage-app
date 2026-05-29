import { Activity } from "lucide-react";
import { useEffect, useState } from "react";

export function DashboardLayoutSkeleton() {
  const [dots, setDots] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setDots((d) => (d + 1) % 4);
    }, 400);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background">
      {/* スプラッシュコンテンツ */}
      <div className="flex flex-col items-center gap-8 animate-in fade-in duration-700">
        {/* アプリアイコン */}
        <div className="relative">
          <div className="w-24 h-24 rounded-3xl bg-primary/10 flex items-center justify-center shadow-lg ring-1 ring-primary/20">
            <img
              src="/manus-storage/app-icon_afd9a89b.png"
              alt="AIインシデント管理"
              className="w-20 h-20 rounded-2xl object-cover"
              onError={(e) => {
                // フォールバック: アイコン画像が読み込めない場合
                const target = e.currentTarget;
                target.style.display = "none";
                const parent = target.parentElement;
                if (parent) {
                  const icon = document.createElement("div");
                  icon.className = "flex items-center justify-center w-full h-full";
                  parent.appendChild(icon);
                }
              }}
            />
          </div>
          {/* パルスリング */}
          <div className="absolute inset-0 rounded-3xl ring-2 ring-primary/30 animate-ping" style={{ animationDuration: "2s" }} />
        </div>

        {/* タイトル */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2.5">
            <Activity className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              AIインシデント管理システム
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            医療・介護現場のリスクマネジメント
          </p>
        </div>

        {/* ローディングインジケーター */}
        <div className="flex flex-col items-center gap-3">
          {/* プログレスバー */}
          <div className="w-48 h-1 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full"
              style={{
                animation: "splash-progress 1.8s ease-in-out infinite",
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground/70 tracking-wider">
            読み込み中{".".repeat(dots)}
          </p>
        </div>
      </div>

      <style>{`
        @keyframes splash-progress {
          0% { width: 0%; margin-left: 0%; }
          50% { width: 70%; margin-left: 15%; }
          100% { width: 0%; margin-left: 100%; }
        }
      `}</style>
    </div>
  );
}
