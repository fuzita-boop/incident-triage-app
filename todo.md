# AIインシデント管理・トリアージシステム TODO

## DBスキーマ・バックエンド
- [x] incidentsテーブル設計（発生日時・場所・概要・影響度・緊急対応性・重要度・拠点タグ・確定フラグ等）
- [x] pnpm db:push でマイグレーション実行
- [x] server/db.ts にインシデントCRUDヘルパー追加
- [x] tRPCルーター: ファイルアップロード→AI解析エンドポイント
- [x] tRPCルーター: インシデント確定保存エンドポイント
- [x] tRPCルーター: インシデント一覧取得（フィルタ・ソート対応）
- [x] tRPCルーター: ダッシュボード集計エンドポイント
- [x] AI解析ロジック（LLM/Vision API）: 構造化JSON抽出
- [x] 緊急アラート通知ロジック（High判定時のnotifyOwner）

## フロントエンド
- [x] グローバルスタイル・カラーパレット設定（エレガント・医療系）
- [x] DashboardLayoutを使ったナビゲーション構造
- [x] アップロード画面（画像/PDF対応、ドラッグ＆ドロップ）
- [x] AI解析中ローディングUI
- [x] 確認・編集画面（左:元画像/PDF、右:AI解析結果フォーム）
- [x] 拠点種別トグル（施設内 / 訪問看護・訪問介護）
- [x] 影響度レベル選択（0, 1, 2, 3a, 3b, 4, 5）
- [x] 緊急対応性・重要度セレクト（High/Medium/Low）
- [x] 緊急アラートバナー（High or 3b以上）
- [x] 再発防止策・改善アクション案表示（3点以内）
- [x] 確定ボタン（確定前はDB保存されない設計）
- [x] インシデント一覧画面（フィルタ・ソート対応）
- [x] ダッシュボード画面（影響度別・拠点別グラフ）
- [x] ルーティング設定（App.tsx）

## 変更: 拠点種別→報告種別
- [x] DBスキーマ: locationTag列を削除し reportType列（incident/accident）を追加してマイグレーション
- [x] shared/types: LocationTag関連を削除し ReportType型・ラベルを追加
- [x] サーバーロジック: AI解析プロンプトをreportType判定に変更、フィルタ対応
- [x] UploadPage: 拠点種別トグルを報告種別トグルに置き換え
- [x] IncidentReviewPage: 拠点種別フィールドを報告種別フィールドに置き換え
- [x] IncidentListPage: 拠点種別フィルタを報告種別フィルタに置き換え
- [x] Dashboard: 拠点別グラフを報告種別グラフに置き換え
- [x] DashboardLayout: ナビゲーションから拠点種別関連を削除
- [x] テスト更新

## テスト
- [x] AI解析ルーターのユニットテスト
- [x] インシデント保存ルーターのユニットテスト

## 変更: 複数報告書対応
- [x] サーバー: AIに「何件の報告書が含まれるか」を先に検出させるプロンプトを追加
- [x] サーバー: 複数件の場合は配列形式でまとめて解析するanalyzeMultipleReportsを実装
- [x] サーバー: analyzeAndCreateDraftの戻り値を{uploadGroupId,count,incidents,incident}に変更
- [x] フロントエンド: アップロード後に複数報告書が検出された場合の選択・確認UIを実装
- [x] フロントエンド: BatchReviewPageを新規作成し/review-group/:uploadGroupIdルートを追加
- [x] テスト更新（13テスト全パス）

## 変更: スキャン向き自動補正
- [x] sharpライブラリをインストール
- [x] サーバー: AIに向き判定（0/90/180/270度）を返させるプロンプトを追加（imageRotation.ts）
- [x] サーバー: 向き判定結果に基づいてsharpで画像を回転補正するヘルパーを実装
- [x] サーバー: PDFはpdftoppmでページ分割→各ページ向き補正→個別解析のフローに変更
- [x] サーバー: 画像ファイルは補正後Base64で本解析を実施するフローに変更
- [x] テスト更新（13テスト全パス）

## 変更: AI再発防止策の強化
- [x] サーバー: AIプロンプトを強化（reportedActions抽出 + aiSuggestedActions 5点以上提案）
- [x] サーバー: preventionActionsをreportedActionsとaiSuggestedActionsに分離したスキーマに変更
- [x] DBスキーマ: reportedActions・aiSuggestedActionsカラムをSQLで追加
- [x] フロントエンド: 確認・編集画面で「報告書記載の対策」と「AI提案再発防止策」を分離表示（追加・削除・編集可能）
- [x] テスト更新（14テスト全パス）

## 新機能: インシデント詳細PDF出力
- [x] サーバー: pdfkitでPDF生成エンドポイントを実装（GET /api/incidents/:id/pdf）
- [x] サーバー: AI提案再発防止策・報告書記載対策・全フィールドを含むPDFレイアウト設計
- [x] フロントエンド: 一覧画面・詳細画面に「PDFダウンロード」ボタンを追加

## 新機能: 月次トレンドグラフ
- [x] サーバー: getMonthlyTrends関数をserver/db.tsに追加（日本時間ベース、報告種別分離）
- [x] サーバー: monthlyTrendsルーターをincidents.tsに追加
- [x] フロントエンド: Dashboard.tsxにRecharts LineChartで折れ線グラフを追加（ヒヤリハット・事故報告書・合計）
- [x] テスト更新（15テスト全パス）
