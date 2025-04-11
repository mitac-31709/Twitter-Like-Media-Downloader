# Twitter Like Media Downloader

Twitter Like Media Downloaderは、Twitterからエクスポートした「いいね」データから画像や動画などのメディアを自動的に取得するNodeJSアプリケーションです。いいねしたコンテンツを高画質で保存し、関連するメタデータも併せて整理します。

## 機能

- Twitterからエクスポートした「いいね」データからメディア（画像・動画）を自動ダウンロード
- 高画質版メディアの優先ダウンロード、メタデータをJSON形式で保存（投稿者情報、投稿日時、いいねした日時などの詳細情報を含む）
- 重複ダウンロードの防止
- ダウンロードエラーの自動処理とログ記録
- プログレスバーによるダウンロード進捗の可視化（全体進捗と個別ファイルのダウンロード状況）

## 必要条件

- Node.js 14.0.0以上
- npm または yarn

## インストール方法

1. リポジトリをクローン:

```bash
git clone https://github.com/mitac-31709/Twitter-Like-Media-Downloader.git
cd Twitter-Like-Media-Downloader
```

2. 必要なパッケージをインストール:

```bash
npm install
# または
yarn install
```

3. 設定ファイルの作成:

```bash
cp src/config/config.example.js src/config/config.js
```

4. 設定ファイルを編集:
   `src/config/config.js`を任意のエディタで開き、ダウンロード先ディレクトリなどの設定を行ってください。

## 使用方法

### データのエクスポート方法

1. Twitterアカウントにログイン
2. 設定 > アカウント > データのアーカイブ をクリック
3. 「いいね」データをリクエストし、ダウンロード
4. ダウンロードしたZIPファイルから `like.js`を抽出

### アプリの実行

1. エクスポートしたlike.jsファイルを `data`ディレクトリに配置
2. メインスクリプトを実行:

```bash
node index.js
```

または

```bash
npm start
```

これにより、`downloaded_media`ディレクトリに画像やメディアファイル、メタデータが保存されます。

### コマンドラインオプション

```
node index.js --help              # ヘルプを表示
node index.js --threads=8         # スレッド数を指定（デフォルト: 4）
node index.js --skip-existing     # 既存ファイルをスキップ
node index.js --force-download    # 全てのファイルを再ダウンロード
node index.js --quiet             # 詳細なログを表示しない
```

## ディレクトリ構造

```
Twitter-Like-Media-Downloader/
├── data/                  # 入力データディレクトリ（like.jsを配置）
├── downloaded_media/      # ダウンロードされたメディアの保存先
├── logs/                  # ログファイル
├── src/                   # ソースコード
│   ├── config/            # 設定ファイル
│   ├── utils/             # ユーティリティ関数
│   └── downloaders/       # メディアダウンロード処理
├── index.js               # メインスクリプト
├── package.json
└── README.md
```

## プログレスバー機能

このアプリケーションには、ダウンロード進捗を視覚的に確認できるプログレスバー機能が実装されています。

### 主な特徴

- **全体の進捗表示**: 全ツイート処理の進行状況をリアルタイムに表示
- **個別ファイルの進捗表示**: 各メディアファイルのダウンロード状況を詳細に表示
- **マルチプログレスバー**: 複数のダウンロードを同時に監視可能
- **ファイルサイズ表示**: ダウンロード中のファイルサイズと進捗率を表示
- **ステータス情報**: 現在処理中のファイル名や完了状態を表示

この機能により、大量のメディアをダウンロードする際でも処理状況を一目で把握でき、特に長時間の処理でも安心して待機できます。

## エラー処理

- ネットワークエラー: 自動的に再試行します（最大試行回数は設定可能）
- 削除された投稿: スキップしてログに記録
- メディア取得失敗: 代替URLを試行
- ダウンロード失敗: エラーログに詳細を記録して継続処理
- アクセス制限コンテンツ: 設定に基づいて処理（スキップまたはダウンロード）
- 壊れたメディアファイル: 検証して再ダウンロード

## 設定オプション

設定ファイル `src/config/config.js`で以下の項目をカスタマイズできます:

- `downloadDir`: メディア保存先ディレクトリ
- `maxRetries`: ダウンロード再試行回数
- `concurrentDownloads`: 同時ダウンロード数
- `includeMetadata`: メタデータ保存の有無
- `downloadSensitiveContent`: センシティブコンテンツのダウンロード設定
- `fileNaming`: ファイル命名規則
- `mediaQuality`: 画像・動画の品質設定

## 貢献方法

1. このリポジトリをフォーク
2. 機能ブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add some amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを作成

## ライセンス

[MIT](LICENSE)

## 免責事項

このツールは個人的な用途での使用を目的としています。著作権を侵害するようなコンテンツのダウンロードや再配布は行わないでください。
