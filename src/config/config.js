// アプリケーション全体の設定を管理するファイル
const path = require('path');

// バージョン情報
const APP_VERSION = '1.2.0';

// ベースディレクトリの設定
const baseDir = path.resolve(__dirname, '../../');

// ディレクトリパスの設定 (デフォルト値)
const dirs = {
  downloadDir: path.join(baseDir, 'downloaded_images'), // デフォルト: プロジェクトルートの 'downloaded_images'
  logsDir: path.join(baseDir, 'logs')  // デフォルト: プロジェクトルートの 'logs'
};

// 各種ディレクトリが存在することを確認
const fs = require('fs');
for (const dir of Object.values(dirs)) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// アプリケーション設定
const CONFIG = {
  // アプリケーションバージョン
  VERSION: APP_VERSION,
  
  // リトライ回数 (デフォルト: 3回)
  MAX_RETRIES: 3,
  
  // リトライ間の待機時間(ミリ秒) (デフォルト: 5000ms)
  RETRY_DELAY: 5000,
  
  // API呼び出し間の待機時間(ミリ秒) (デフォルト: 1500ms)
  API_CALL_DELAY: 1500,
  
  // エラーが多発した場合の待機時間(ミリ秒) (デフォルト: 60000ms)
  ERROR_COOLDOWN: 60000,
  
  // ダウンロードのタイムアウト(ミリ秒) (デフォルト: 30000ms)
  DOWNLOAD_TIMEOUT: 30000,
  
  // エラー記録用のファイルパス (デフォルト: logs/error-log-[timestamp].json)
  ERROR_LOG_FILE: path.join(dirs.logsDir, `error-log-${new Date().toISOString().replace(/:/g, '-')}.json`),
  
  // 処理をスキップするツイートIDを記録するファイルパス (デフォルト: logs/skip-ids.json)
  SKIP_LIST_PATH: path.join(dirs.logsDir, 'skip-ids.json'),
  
  // 存在しないツイートのIDを記録するファイルパス (デフォルト: logs/not-found-ids.json)
  NOT_FOUND_LIST_PATH: path.join(dirs.logsDir, 'not-found-ids.json'),
  
  // センシティブコンテンツを含むツイートのIDを記録するファイルパス (デフォルト: logs/sensitive-ids.json)
  SENSITIVE_LIST_PATH: path.join(dirs.logsDir, 'sensitive-ids.json'),
  
  // 解析エラーが発生したツイートIDを記録するファイルパス (デフォルト: logs/parse-error-ids.json)
  PARSE_ERROR_LIST_PATH: path.join(dirs.logsDir, 'parse-error-ids.json'),
  
  // メディア（画像・動画）がないツイートのIDを記録するファイルパス (デフォルト: logs/no-media-ids.json)
  NO_MEDIA_LIST_PATH: path.join(dirs.logsDir, 'no-media-ids.json'),
  
  // デバッグモード (詳細情報を表示) (デフォルト: false)
  DEBUG: process.env.DEBUG === 'true' || false,
  
  // 進捗バーを表示するかどうか (デフォルト: true)
  SHOW_PROGRESS: process.env.SHOW_PROGRESS !== 'false',
  
  // 並列ダウンロード数 (デフォルト: 1)
  // 注意: 値を増やすとTwitterのAPI制限に引っかかる可能性があります
  PARALLEL_DOWNLOADS: process.env.PARALLEL_DOWNLOADS ? parseInt(process.env.PARALLEL_DOWNLOADS) : 1,
  
  // ファイルの読み込みエンコーディング (デフォルト: utf8)
  ENCODING: 'utf8',
  
  // ネットワークリクエストのユーザーエージェント
  USER_AGENT: `TwitterURLDirect/${APP_VERSION} Node.js/${process.version}`,
  
  // UX関連の設定 (新規追加)
  UX: {
    // カラーテーマ
    COLOR_THEME: process.env.COLOR_THEME || 'default', // 'default', 'light', 'dark'
    
    // 詳細な統計表示
    SHOW_DETAILED_STATS: process.env.SHOW_DETAILED_STATS !== 'false',
    
    // ファイル名の表示スタイル ('full', 'short', 'id-only')
    FILENAME_DISPLAY: process.env.FILENAME_DISPLAY || 'short',
    
    // 進捗表示の更新間隔 (ミリ秒)
    PROGRESS_UPDATE_INTERVAL: process.env.PROGRESS_UPDATE_INTERVAL ? parseInt(process.env.PROGRESS_UPDATE_INTERVAL) : 500,
    
    // インタラクティブモード（キー入力で一時停止や速度調整などが可能）
    INTERACTIVE: process.env.INTERACTIVE !== 'false',
    
    // プログレスバーのスタイル ('bar', 'dots', 'braille')
    PROGRESS_STYLE: process.env.PROGRESS_STYLE || 'bar',
    
    // 通知サウンドを有効化（完了時や大きなエラー時）
    SOUND_NOTIFICATIONS: process.env.SOUND_NOTIFICATIONS === 'true',
    
    // 自動で定期的にセーブポイントを作成（処理中断時に再開可能）
    AUTO_SAVE_POINT: process.env.AUTO_SAVE_POINT !== 'false',
    
    // セーブポイント作成間隔（処理件数）
    SAVE_POINT_INTERVAL: process.env.SAVE_POINT_INTERVAL ? parseInt(process.env.SAVE_POINT_INTERVAL) : 20
  },
  
  // 状態保存/復元関連のパス（新規追加）
  STATE_FILE_PATH: path.join(dirs.logsDir, 'download-state.json')
};

module.exports = {
  CONFIG,
  dirs
};