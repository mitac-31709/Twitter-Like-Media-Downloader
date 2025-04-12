const fs = require('fs');
const { CONFIG, dirs } = require('../config/config');

// エラーログ保存用の配列
let errorLog = [];

/**
 * 中央集権的なエラーハンドリング関数
 * @param {string} tweetId - ツイートID
 * @param {string} url - ツイートURL
 * @param {Error|string} error - エラーオブジェクトまたはエラーメッセージ
 * @param {string} [errorType] - エラータイプ ('not_found', 'sensitive_content', 'api', 'parse', 'other')
 */
function handleError(tweetId, url, error, errorType = 'other') {
  const timestamp = new Date().toISOString();
  const errorObj = {
    timestamp,
    tweetId,
    url,
    error: error && error.message ? error.message : 
           (typeof error === 'string' ? error : 
           (error ? JSON.stringify(error) : 'Unknown error')),
    errorType,
    isNotFound: errorType === 'not_found', // 後方互換性のため
    stack: error && error.stack ? error.stack : new Error().stack
  };

  // コンソールにもエラーを表示（デバッグモードの場合）
  if (CONFIG.DEBUG) {
    console.error(`エラー [${errorType}]: ${tweetId} - ${errorObj.error}`);
  }

  // ロギング
  errorLog.push(errorObj);

  // 定期的に保存（20件ごと）
  if (errorLog.length >= 20) {
    saveErrorLogs();
  }
}

/**
 * エラーを記録する関数
 * @param {string|Error|object} arg1 - ツイートID、エラーメッセージ、またはエラーオブジェクト
 * @param {Error|string} [arg3] - エラーオブジェクトまたはエラーメッセージ（オプション）
 * @param {string} [arg4] - エラータイプ ('not_found', 'sensitive_content', 'api', 'parse', 'other')
 */
function logError(arg1, arg2, arg3, arg4) {
  try {
    let tweetId, url, error, errorType = 'other';
    
    // 引数のパターンを判断
    if (typeof arg1 === 'string' && arg2 && arg3) {
      // 4引数または3引数パターン: logError(tweetId, url, error, [errorType])
      tweetId = arg1;
      url = arg2;
      error = arg3;
      if (arg4) errorType = arg4;
    } else if (typeof arg1 === 'string' && arg2) {
      // 2引数パターン: logError(tweetId, error)
      tweetId = arg1;
      url = 'unknown';
      error = arg2;
    } else {
      // 1引数パターン: logError(error)
      tweetId = 'unknown';
      url = 'unknown';
      error = arg1;
    }
    
    // 中央集権的なエラーハンドリング関数を呼び出し
    handleError(tweetId, url, error, errorType);
  } catch (e) {
    console.error(`エラーログの記録中にエラーが発生しました: ${e.message}`);
  }
}

/**
 * デバッグログを出力する関数（DEBUG モードの場合のみ）
 * @param {string} message - ログメッセージ
 */
function logDebug(message) {
  if (CONFIG.DEBUG) {
    console.log(message);
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
    logDebug(`エラーログを保存しました: ${logFilePath}`);
    
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
    if (errorMsg.includes('rate limit')) return 'rate_limit';
    if (errorMsg.includes('network error') || 
        errorMsg.includes('ENOTFOUND') || 
        errorMsg.includes('ETIMEDOUT') || 
        errorMsg.includes('ECONNRESET')) return 'network';
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
  logDebug,
  saveErrorLogs,
  determineErrorType,
  sleep
};
