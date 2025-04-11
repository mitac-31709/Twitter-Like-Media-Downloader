// アプリケーション全体の設定を管理するファイル
const path = require('path');

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
  // リトライ回数 (デフォルト: 3回)
  MAX_RETRIES: 3,
  
  // リトライ間の待機時間(ミリ秒) (デフォルト: 5000ms)
  RETRY_DELAY: 5000,
  
  // API呼び出し間の待機時間(ミリ秒) (デフォルト: 1500ms)
  API_CALL_DELAY: 1500,
  
  // エラーが多発した場合の待機時間(ミリ秒) (デフォルト: 60000ms)
  ERROR_COOLDOWN: 60000,
  
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
  
  // デバッグモード (詳細情報を表示) (デフォルト: false)
  DEBUG: true,
  
  // ファイルの読み込みエンコーディング (デフォルト: utf8)
  ENCODING: 'utf8'
};

module.exports = {
  CONFIG,
  dirs
};