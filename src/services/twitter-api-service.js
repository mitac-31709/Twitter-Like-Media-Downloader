// Twitter APIの呼び出し機能を提供するサービス
const { TwitterDL } = require('twitter-downloader');
const { CONFIG } = require('../config/config');
const { sleep, determineErrorType } = require('../utils/error-handlers');

/**
 * TwitterのAPIを呼び出す関数（リトライ機能付き）
 * @param {string} tweetUrl - ツイートのURL
 * @param {number} retryCount - 現在のリトライ回数
 * @returns {Promise<Object>} TwitterDLの結果オブジェクト
 * @throws {Error} リトライ回数を超えた場合やエラーが発生した場合
 */
async function callTwitterAPI(tweetUrl, retryCount = 0) {
  try {
    const result = await TwitterDL(tweetUrl);
    
    // レスポンスの詳細をデバッグ表示
    if (CONFIG.DEBUG && result) {
      console.log(`  🔍 APIレスポンス: ${JSON.stringify(result).substring(0, 200)}...`);
    }
    
    return result;
  } catch (error) {
    console.error(`  ⚠️ API呼び出しエラー: ${error.message || '理由不明'} (試行回数: ${retryCount + 1}/${CONFIG.MAX_RETRIES + 1})`);
    
    // エラーオブジェクトの詳細情報を出力（デバッグモード時）
    if (CONFIG.DEBUG) {
      console.error(`  🔍 エラー詳細: ${JSON.stringify(error, Object.getOwnPropertyNames(error)).substring(0, 300)}...`);
    }
    
    // エラータイプの特定
    const errorType = determineErrorType(error);
    error.errorType = errorType;
    
    // エラーの種類によって異なる処理
    switch (errorType) {
      case 'not_found':
      case 'sensitive_content':
      case 'parse':
        // 特定のエラータイプの場合は直ちにエラーをスローする
        throw error;
      case 'api':
        if (error.message && error.message.includes('Authorization')) {
          console.error(`  🔑 認証エラーが発生しました。TwitterDLの認証情報が無効になっている可能性があります。`);
        }
        break;
    }
    
    // 最大リトライ回数に達していない場合はリトライ
    if (retryCount < CONFIG.MAX_RETRIES) {
      console.log(`  ⏱️ ${CONFIG.RETRY_DELAY / 1000}秒後にリトライします...`);
      await sleep(CONFIG.RETRY_DELAY);
      return callTwitterAPI(tweetUrl, retryCount + 1);
    }
    
    // リトライ回数を超えたらエラーを投げる
    throw error;
  }
}

/**
 * ツイートの情報を取得する関数
 * @param {string} tweetId - ツイートID
 * @param {string} tweetUrl - ツイートのURL
 * @returns {Promise<Object>} ツイート情報（結果とエラー状態を含む）
 */
async function fetchTweetInfo(tweetId, tweetUrl) {
  try {
    // TwitterDL関数を使用してツイート情報を取得（リトライ機能付き）
    const result = await callTwitterAPI(tweetUrl);
    
    if (result.status === 'success' && result.result) {
      return {
        success: true,
        metadata: result.result,
        error: null,
        errorType: null
      };
    } else {
      // エラーメッセージをより詳細に表示
      const errorMsg = result.message || 
                     (result.error ? JSON.stringify(result.error) : '不明なエラー');
      
      // エラータイプを判定
      let errorType = 'other';
      if (errorMsg.includes('Tweet not found') || errorMsg.includes('ツイートが見つかりません')) {
        errorType = 'not_found';
      } else if (errorMsg.includes('sensitive content') || errorMsg.includes('センシティブなコンテンツ')) {
        errorType = 'sensitive_content';
      } else {
        errorType = 'api';
      }
      
      return {
        success: false,
        metadata: null,
        error: errorMsg,
        errorType
      };
    }
  } catch (error) {
    // エラータイプがすでに設定されているか確認
    const errorType = error.errorType || determineErrorType(error);
    
    return {
      success: false,
      metadata: null,
      error: error.message || (typeof error === 'string' ? error : JSON.stringify(error)),
      errorType
    };
  }
}

module.exports = {
  callTwitterAPI,
  fetchTweetInfo
};