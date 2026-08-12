# ローカルPWA検証メモ

## 2026-08-12: サブパス静的ビルド

`VITE_BASE_PATH=/incident-triage-app/ pnpm build` は成功し、Service Worker (`sw.js`)、PWAマニフェスト (`manifest.webmanifest`)、アイコンを生成した。ローカルプレビューでは、以下のHTTP応答を確認済みである。

| URL | 結果 |
| --- | --- |
| `/incident-triage-app/` | HTTP 200、サブパスマニフェスト参照あり |
| `/incident-triage-app/sw.js` | HTTP 200 |
| `/incident-triage-app/monthly-report` | HTTP 200、SPAフォールバックあり |

公開プロキシを経由したブラウザ確認ではページが空白になった。コンソール出力はなく、静的アセットの読み込み経路またはルーティング初期化を追加調査する必要がある。

## 2026-08-12: GitHub Pages互換プレビュー

Viteのプレビューサーバーはサブパス配信の静的アセット解決を再現しないため、`/incident-triage-app/` 配下を静的配信する検証用サーバーで再確認した。ブラウザでダッシュボード、ローカル保存の説明、ナビゲーションを表示できた。また、Service Workerは対象サブパスをスコープとして有効化され、IndexedDBには `incident-triage-local` データベースが作成されていることを確認した。

## 2026-08-12: 実画面の保存確認

個人情報を含まないテスト事象を新規報告書画面で入力して下書き保存した。詳細画面へ遷移し、「端末内に下書きを保存しました」と表示された。入力した概要・場所・要因・対応状況は詳細画面にも表示され、ネットワーク送信を伴わないIndexedDB保存フローが動作していることを確認した。

## 2026-08-12: オフライン起動

Service Workerの事前キャッシュには381エントリが保存されていることを確認した。GitHub Pages相当のローカル静的配信を停止した後、同一URLへ再遷移してもダッシュボードが表示された。保存したテスト報告書も1件として表示され、アプリ本体の起動とIndexedDBのデータ閲覧がキャッシュだけで継続することを確認した。

## 2026-08-12: GitHub Pages設定

`https://github.com/fuzita-boop/incident-triage-app/settings/pages` を確認したところ、リポジトリを公開するか、非公開Pagesを利用できるプランへ変更するまでPagesを有効化できない状態だった。公開に必要なGitHub Actionsワークフローは `main` ブランチへ同期済みである。

## 2026-08-12: GitHub公開操作

ユーザーの確認後、GitHubの一般設定にある公開設定変更ダイアログを開いた。次の画面でリポジトリ名を入力して「Change to public」を確定すると、ソースコードとワークフローが公開状態になる。端末内のIndexedDBデータやバックアップZIPはGitHubリポジトリに含まれない。

GitHubの公開確認ダイアログが表示され、「I want to make this repository public」という最初の確認ステップが確認できた。GitHubは影響内容の確認後に公開実行ボタンを表示する段階的な確認フローを使用する。

ユーザー確認に基づき、GitHubが示した影響内容を確認する段階を進め、最終の「Make this repository public」操作を送信した。公開状態への変更完了とPagesワークフローの実行結果は、次の確認で検証する。
