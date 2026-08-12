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

## 修正: インシデント/アクシデント区別の統一
- [x] AIプロンプト: 緊急アラートの文言をreportTypeに応じて切り替え（「インシデント」固定を廃止）
- [x] server/routers/incidents.ts: notifyOwnerの文言をreportTypeに応じて切り替え
- [x] server/pdfExport.ts: 緊急アラートバナーの文言をreportTypeに応じて切り替え
- [x] IncidentReviewPage.tsx: 緊急アラートバナーの「インシデント」→reportTypeに応じたラベルに変更
- [x] IncidentListPage.tsx: 「インシデント一覧」「件のインシデント」等の表記を中立表現に変更
- [x] Dashboard.tsx: 「インシデント報告の集計」等の表記を中立表現に変更
- [x] DashboardLayout.tsx: サイドバーの「インシデント一覧」ラベルを「報告書一覧」に変更

## 新機能: スプラッシュ画面
- [x] DashboardLayoutSkeleton.tsxをスプラッシュ画面に置き換え（アプリアイコン・タイトル・ローディングアニメーション）
- [x] client/index.html: iPhoneスプラッシュ画面用metaタグを追加

## 新機能: ファイル削除機能
- [x] server/db.ts: deleteIncident（単件削除）ヘルパーを追加
- [x] server/routers/incidents.ts: deleteIncidentルーターを追加（draft/confirmed両対応）
- [x] IncidentListPage.tsx: 各行に削除ボタンを追加（確認ダイアログ付き）
- [x] IncidentReviewPage.tsx: 削除ボタンを追加（確認ダイアログ付き）
- [x] BatchReviewPage.tsx: 各ドラフトカードに削除ボタンを追加（グループ一括削除も対応）
- [x] テスト更新

## 機能追加: 削除時のストレージファイル実体削除
- [x] server/storage.ts: storageDelete ヘルパーを追加（Forge API経由でS3ファイル削除）
- [x] server/db.ts: getIncidentsByFileKey ヘルパーを追加（同一fileKeyを参照する件数確認）
- [x] server/routers/incidents.ts: delete/deleteGroup でfileKeyの参照カウントを確認し最後の参照なら実ファイルも削除
- [x] server/incidents.test.ts: ストレージ削除テストを追加

## 機能追加: 報告書キーワード・日付範囲検索
- [x] server/db.ts: listIncidents に keyword/dateFrom/dateTo フィルターを追加
- [x] server/routers/incidents.ts: list プロシージャに keyword/dateFrom/dateTo を追加
- [x] IncidentListPage.tsx: 検索バーと日付フィルターUIを追加

## 機能追加: AI提案セクションへのシェル分析追加
- [x] server/db.ts: getIncidentAnalysisData ヘルパー（場所別・時間帯別・レベル別・原因キーワード集計）を追加
- [x] server/routers/incidents.ts: incidents.getAnalysis プロシージャを追加（同一reportTypeの過去データ集計）
- [x] server/routers/incidents.ts: incidents.getFishbone プロシージャを追加（AIによる5Mフィッシュボーン分析）
- [x] client: recharts をインストール
- [x] client/src/components/ShellAnalysisPanel.tsx: シェル分析パネルコンポーネントを新規作成（発生パターン・フィッシュボーン・統計的要因の3タブ）
- [x] client/src/pages/IncidentReviewPage.tsx: ShellAnalysisPanelをAI提案セクションの直後に挿入
- [x] server/incidents.test.ts: getAnalysis/getFishbone テストを追加（25件全通過）

## 機能追加: フィッシュボーン図SVG可視化
- [x] ShellAnalysisPanel.tsx: フィッシュボーンカード一覧をSVGベースの特性要因図に置き換え

## 機能追加: シェル分析のPDF出力組み込み
- [x] server/pdfExport.ts: フィッシュボーン分析・統計的要因分析をPDFに追加
- [x] server/_core/index.ts: PDF生成エンドポイントでシェル分析データを並行取得して渡す

## 機能追加: 発生パターンのアラート機能
- [x] server/db.ts: getHotspots ヘルパーを追加（場所・時間帯の集中度スコア計算）
- [x] server/routers/incidents.ts: incidents.getHotspots プロシージャを追加
- [x] ShellAnalysisPanel.tsx: 発生パターンタブにホットスポットアラートバッジを表示
- [x] IncidentReviewPage.tsx: 報告書の場所・時間帯がホットスポットの場合に警告バナーを表示
- [x] server/incidents.test.ts: getHotspotsテストを追加（27件全通過）

## 機能追加: PDFへのフィッシュボーン図SVG画像埋め込み
- [x] server/fishboneSvgRenderer.ts: SVGフィッシュボーン図をサーバー側でPNG変換するヘルパーを新規作成（sharp使用）
- [x] server/pdfExport.ts: フィッシュボーンセクションをPNG画像埋め込みに変更（テキストフォールバック付き）
- [x] server/incidents.test.ts: fishboneSvgRendererテストを追加（28件全通過）

## 機能追加: 一覧画面からの一括PDF/ZIPダウンロード
- [x] server/_core/index.ts: /api/incidents/bulk-pdf エンドポイントを追加（archiverでZIP生成、最大50件）
- [x] client/src/pages/IncidentListPage.tsx: 複数選択モード・チェックボックスUIを追加
- [x] client/src/pages/IncidentListPage.tsx: ZIPダウンロードボタンを追加（選択中のみ表示）

## バグ修正: PDFフィッシュボーン図文字化け・PDF後に戻れない問題
- [x] server/pdfExport.ts: フィッシュボーン図のPNG画像埋め込みを廃止し、テキスト形式（カテゴリ別箇条書き）に変更（renderFishboneToPngのimport削除）
- [x] server/fishboneSvgRenderer.ts: pdfExportから切り離し（importを削除）
- [x] client/src/pages/IncidentReviewPage.tsx: PDF出力ボタンをfetch+Blob方式に変更（window.open廃止、isPdfDownloading状態追加）

## 新機能: 月次レポートPDF出力
- [x] server/db.ts: getMonthlyReportData ヘルパーを追加（指定年月のインシデント/アクシデント別集計）
- [x] server/routers/incidents.ts: incidents.getMonthlyReport プロシージャを追加
- [x] server/monthlyReportPdf.ts: A4 1枚の月次レポートPDF生成ロジックを新規作成
- [x] server/_core/index.ts: /api/monthly-report エンドポイントを追加
- [x] client/src/pages/MonthlyReportPage.tsx: 月・年選択UI + プレビュー + ダウンロードボタン
- [x] client/src/App.tsx: /monthly-report ルートを追加
- [x] client/src/components/DashboardLayout.tsx: サイドバーに「月次レポート」リンクを追加
- [x] server/incidents.test.ts: getMonthlyReportData テストを追加

## 移行: 完全ローカルPWA・GitHub Pages対応
- [x] 現行の外部依存・既存クラウドデータの保全方法・GitHub連携状況を調査する
- [x] 既存クラウドデータをJSON形式でバックアップ・ローカルPWAへインポートできる仕組みを設計する
- [x] IndexedDB（報告書・画像/PDF Blob・分析結果）を使用するローカルデータ層を実装する
- [x] ログイン・サーバーDB・クラウドストレージ・必須外部APIへの依存を画面フローから除去する
- [x] ローカル処理で利用できる報告書入力・分類・分析・月次PDF出力を実装する
- [x] Service Worker・Web App Manifest・事前キャッシュを設定し、オフライン起動を可能にする
- [x] GitHub Pagesサブパス対応の静的ビルド設定を追加する
- [x] GitHub ActionsによるGitHub Pages自動デプロイ設定を追加する
- [x] ローカル保存・バックアップ/復元・オフライン起動・静的ビルドをテストする
- [ ] GitHubリポジトリへ移行内容を同期し、GitHub Pagesを有効化して公開URLを確認する
- [ ] GitHub ActionsのNode.jsセットアップ順序を修正し、Pagesデプロイを成功させる
