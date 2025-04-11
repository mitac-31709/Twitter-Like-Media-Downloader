// filepath: d:\Prog\twitterurldirect\src\utils\error-handlers.js
// エラー処理とロギングのユーティリティ関数
const fs = require('fs');
const { CONFIG, dirs } = require('../config/config');

// エラーログ保存用の配列
let errorLog = [];

/**
 * エラーを記録する関数
 * @param {string} tweetId - ツイートID
 * @param {string} url - ツイートURL
 * @param {Error|string} error - エラーオブジェクトまたはエラーメッセージ
 * @param {string} errorType - エラータイプ ('not_found', 'sensitive_content', 'api', 'parse', 'other')
 */
function logError(tweetId, url, error, errorType = 'other') {
  try {
    const timestamp = new Date().toISOString();
    
    // エラーオブジェクト作成
    const errorObj = {
      timestamp,
      tweetId,
      url,
      error: error.message || (typeof error === 'string' ? error : JSON.stringify(error)),
      errorType,
      isNotFound: errorType === 'not_found', // 後方互換性のため
      stack: error.stack || new Error().stack
    };
    
    // ロギング
    errorLog.push(errorObj);
    
    // 定期的に保存（20件ごと）
    if (errorLog.length >= 20) {
      saveErrorLogs();
    }
  } catch (e) {
    console.error(`エラーログの記録中にエラーが発生しました: ${e.message}`);
  }
}

/**
 * エラーログをファイルに保存する関数
 */
function saveErrorLogs() {
  try {
    if (errorLog.length === 0) return;
    
    // ログディレクトリの確認
    if (!fs.existsSync(dirs.logsDir)) {
      fs.mkdirSync(dirs.logsDir, { recursive: true });
    }
    
    // 新しいログファイルを作成（タイムスタンプ付き）
    const now = new Date().toISOString().replace(/:/g, '-');
    const logFilePath = `${dirs.logsDir}/error-log-${now}.json`;
    
    fs.writeFileSync(logFilePath, JSON.stringify(errorLog, null, 2));
    console.log(`エラーログを保存しました: ${logFilePath}`);
    
    // ログリストをクリア
    errorLog = [];
  } catch (e) {
    console.error(`エラーログの保存中にエラーが発生しました: ${e.message}`);
  }
}

/**
 * エラータイプを判別する関数
 * @param {Error|string} error - エラーオブジェクトまたはエラーメッセージ
 * @returns {string} エラータイプ
 */
function determineErrorType(error) {
  const errorMsg = error.message || error;
  
  if (typeof errorMsg === 'string') {
    if (errorMsg.includes('Tweet not found')) return 'not_found';
    if (errorMsg.includes('sensitive content')) return 'sensitive_content';
    if (errorMsg.includes('properties of undefined')) return 'parse';
    if (errorMsg.includes('Authorization')) return 'api';
  }
  
  return 'other';
}

/**
 * 待機関数（処理を一時停止する）
 * @param {number} ms - 待機時間（ミリ秒）
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 終了時にログを保存する処理
process.on('exit', () => {
  if (errorLog.length > 0) {
    saveErrorLogs();
  }
});

// 未処理のエラーでもログを保存する
process.on('uncaughtException', (err) => {
  logError('process', 'uncaught exception', err);
  saveErrorLogs();
  // プロセスを終了する前にログが確実に書き込まれるようにする
  console.error('未処理のエラーが発生しました:', err);
  process.exit(1);
});

module.exports = {
  logError,
  saveErrorLogs,
  determineErrorType,
  sleep
};