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

// コマンドライン引数の処理
const argv = process.argv.slice(2);
const noAuth = argv.includes('--no-auth') || argv.includes('--no-login');
const forceAuth = argv.includes('--force-auth') || argv.includes('--use-login');

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

  // 認証を使用するかどうか (デフォルト: true)
  // --no-authまたは--no-loginオプションで無効化、--force-authまたは--use-loginオプションで強制有効化
  USE_AUTH: !noAuth, // --no-authフラグがある場合はfalse、それ以外はtrueに設定

  // Twitter API認証情報 (認証情報を環境変数、設定ファイル、または直接入力から取得)
  // Authorization headerは省略可能 - 省略した場合はパッケージのデフォルト値が使用される
  TWITTER_AUTH: process.env.TWITTER_AUTH || '',

  // Twitterのクッキー情報 (センシティブコンテンツなどを取得するために必要)
  // ブラウザで取得したcookieの値を設定する
  TWITTER_COOKIE: process.env.TWITTER_COOKIE || '',

  // プロキシ設定 (任意) - http, https, socks5をサポート
  TWITTER_PROXY: process.env.TWITTER_PROXY || null,

  // クレデンシャル設定ファイルのパス
  CREDENTIALS_FILE_PATH: path.join(baseDir, '.twitter-credentials.json'),

  // クレデンシャル設定ファイルを読み込む
  loadCredentials() {
    try {
      if (fs.existsSync(this.CREDENTIALS_FILE_PATH)) {
        const credentials = JSON.parse(fs.readFileSync(this.CREDENTIALS_FILE_PATH, 'utf8'));
        if (credentials.authorization) this.TWITTER_AUTH = credentials.authorization;
        if (credentials.cookie) this.TWITTER_COOKIE = credentials.cookie;
        if (credentials.proxy) this.TWITTER_PROXY = credentials.proxy;
        
        // 認証情報の読み込み後に、コマンドライン引数を確認して有効/無効を設定
        this.USE_AUTH = forceAuth || (!noAuth && (!!this.TWITTER_AUTH || !!this.TWITTER_COOKIE));
        
        return true;
      }
    } catch (err) {
      console.error('認証情報の読み込み中にエラーが発生しました:', err);
    }
    return false;
  },

  // クレデンシャル設定を保存する
  saveCredentials(credentials = {}) {
    try {
      const data = {
        authorization: credentials.authorization || this.TWITTER_AUTH,
        cookie: credentials.cookie || this.TWITTER_COOKIE,
        proxy: credentials.proxy || this.TWITTER_PROXY
      };
      fs.writeFileSync(this.CREDENTIALS_FILE_PATH, JSON.stringify(data, null, 2), 'utf8');
      return true;
    } catch (err) {
      console.error('認証情報の保存中にエラーが発生しました:', err);
      return false;
    }
  },
  
  // 認証設定を切り替える
  toggleAuth(useAuth = true) {
    this.USE_AUTH = useAuth;
    console.log(`認証モード: ${useAuth ? '有効' : '無効'}`);
    return this.USE_AUTH;
  }
};

// アプリケーション起動時に認証情報を読み込み
CONFIG.loadCredentials();

// 起動時にコマンドライン引数で認証を使用するかどうかが指定された場合、それに従う
if (noAuth) {
  CONFIG.USE_AUTH = false;
  console.log('コマンドライン引数 --no-auth が指定されました。認証情報を使用せずに実行します。');
} else if (forceAuth) {
  CONFIG.USE_AUTH = true;
  console.log('コマンドライン引数 --force-auth が指定されました。認証情報を強制的に使用します。');
} else if (CONFIG.USE_AUTH) {
  console.log('認証情報を使用して実行します。無効にするには --no-auth オプションを使用してください。');
} else {
  console.log('認証情報を使用せずに実行します。有効にするには --force-auth オプションを使用してください。');
}

module.exports = {
  CONFIG,
  dirs
};