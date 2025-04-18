# Twitter URL Direct - プロジェクト構造と機能説明

このドキュメントは、TwitterURLDirect（Twitterのいいねから画像・動画をダウンロードするツール）の全体構造と処理の流れを説明します。プログラムの理解とメンテナンスを容易にするために作成されています。

## プロジェクトの目的

TwitterURLDirectは、Twitterから「いいね」したツイートのメディア（画像・動画）とメタデータを自動的にダウンロードして保存するツールです。主に以下の機能を提供します：

1. Twitterからエクスポートしたいいねデータを解析
2. 各いいねに含まれるメディアファイル（画像・動画）をダウンロード
3. ツイートのメタデータをJSON形式で保存
4. 進捗状況のリアルタイム表示
5. エラー発生時のスキップとログ記録
6. スキップリストによる処理の最適化
7. キャッシュを活用した高速な再処理

## ファイル構成

```
twitterurldirect/
│
├── index.js               # メインエントリーポイント
├── fix-skip-lists.js      # スキップリスト修正ツールのエントリーポイント
├── like.js                # Twitterからエクスポートされたいいねデータ
│
├── src/                   # ソースコードディレクトリ
│   ├── index.js           # メイン実行スクリプト
│   ├── fix-skip-lists.js  # スキップリスト修正ツール
│   │
│   ├── config/            # 設定ファイル
│   │   └── config.js      # プログラム全体の設定
│   │
│   ├── services/          # 主要サービス
│   │   ├── media-service.js         # メディア処理サービス
│   │   ├── metadata-service.js      # メタデータ管理サービス
│   │   └── twitter-api-service.js   # Twitter API連携サービス
│   │
│   └── utils/             # ユーティリティ関数群
│       ├── download-utils.js   # ダウンロード用ユーティリティ
│       ├── error-handlers.js   # エラー処理ユーティリティ
│       ├── file-utils.js       # ファイル操作ユーティリティ
│       ├── list-handlers.js    # スキップリスト管理
│       └── progress-bar.js     # 進捗表示ユーティリティ
│
├── downloaded_images/     # ダウンロードされたメディアとメタデータの保存先
└── logs/                  # エラーログとスキップリストの保存先
```

## 主要な処理フロー

### 1. 初期化プロセス

1. いいねデータの読み込み (`file-utils.js`)
   - like.jsファイルからいいねデータを解析
   - Twitterの特殊なデータ形式を標準的なJSONに変換

2. 既存データのスキャン
   - ダウンロード済みのメディアファイルを確認
   - 保存済みのメタデータを確認
   - 各種スキップリストを読み込み

### 2. メインループ処理 (src/index.js)

各いいねに対して以下の処理を実行：

1. スキップチェック
   - スキップリストに含まれるかチェック
   - 既にダウンロード済みかチェック
   - スキップ理由に応じた統計情報の更新

2. メディア処理 (`media-service.js`)
   - ツイートIDからメタデータを取得
   - メディアエンティティの抽出
   - ダウンロードURLの生成

3. ファイルダウンロード (`download-utils.js`)
   - HTTPSリクエストの発行
   - ダウンロード進捗の表示
   - ファイルの書き込み

4. メタデータ管理 (`metadata-service.js`)
   - メタデータの抽出と加工
   - JSONファイルとしての保存
   - キャッシュの活用

### 3. 進捗管理システム

`progress-bar.js` による高度な進捗表示：

1. 全体の進捗
   - 処理済みアイテム数/総数
   - 推定残り時間
   - 成功率

2. 現在の処理
   - ファイル名
   - ダウンロード進捗
   - ファイルサイズ

3. 統計情報
   - ダウンロード成功数
   - スキップ数
   - エラー数
   - API呼び出し数

### 4. エラー処理システム

1. エラーの種類
   - API制限エラー
   - ネットワークエラー
   - 存在しないツイート
   - センシティブコンテンツ
   - パースエラー
   - ダウンロードエラー

2. エラーハンドリング
   - エラーの記録とログ保存
   - スキップリストへの追加
   - 再試行ロジック
   - API制限の回避

3. リカバリー機能
   - 中断時の再開
   - 部分的なダウンロードの再試行
   - キャッシュの活用

### 5. スキップリスト管理

`list-handlers.js` による効率的なスキップ処理：

1. スキップリストの種類
   - 一般スキップリスト
   - 存在しないツイートリスト
   - センシティブコンテンツリスト
   - 解析エラーリスト
   - メディアなしツイートリスト

2. 最適化機能
   - リストの重複排除
   - カテゴリ別の管理
   - 自動更新と保存

### 6. パフォーマンス最適化

1. キャッシュシステム
   - メタデータのキャッシュ
   - APIレスポンスのキャッシュ
   - ファイル存在チェックの最適化

2. API制限対策
   - リクエスト間隔の制御
   - エラー時の待機処理
   - バックオフアルゴリズム

3. リソース管理
   - メモリ使用量の最適化
   - ファイルハンドルの適切な管理
   - 進捗表示の効率化

## 使用方法

### 基本的な使用法

1. Twitterからいいねデータをエクスポート
2. データを`like.js`として保存
3. `node index.js`でダウンロード開始

### 追加機能

1. スキップリストの最適化
   ```bash
   node fix-skip-lists.js
   ```

2. デバッグモードの有効化
   ```bash
   # config.jsでDEBUG = trueに設定
   ```

3. 処理の中断と再開
   - Ctrl+Cで安全に中断
   - 次回実行時に自動的に続きから再開

### 出力ファイル

1. メディアファイル
   - `downloaded_images/[tweet-id]-[number].[ext]`
   - 画像はJPG/PNG/GIF
   - 動画はMP4形式

2. メタデータ
   - `downloaded_images/[tweet-id]-metadata.json`
   - ツイート情報
   - メディア情報
   - ダウンロード時刻

3. ログファイル
   - `logs/error-log-[timestamp].json`
   - エラー情報
   - スタックトレース
   - タイムスタンプ

## パフォーマンスと制限

1. API制限
   - 基本間隔: 2秒
   - エラー時: 30秒
   - 連続エラー時: 300秒

2. メモリ使用
   - 平均: 50-100MB
   - 最大: 200MB程度

3. 処理速度
   - 通常時: 25-30ツイート/分
   - キャッシュ使用時: 50-60ツイート/分

## 今後の改善計画

1. 機能追加
   - 並列ダウンロード
   - Web UI
   - 検索機能
   - バッチ処理

2. 最適化
   - データベース導入
   - メモリ使用量削減
   - キャッシュ戦略改善

3. ユーザビリティ
   - 設定のGUI化
   - インストーラー作成
   - 多言語対応