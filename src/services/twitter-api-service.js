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
        // Not foundエラーの場合、追加のステータスコードチェックを行う
        // ステータスコードが404の場合のみ真の"not found"として扱う
        if (error.statusCode === 404 || (error.response && error.response.statusCode === 404)) {
          throw error;
        } else {
          // ステータスコードが404以外の場合は一時的なエラーとして扱い、リトライする
          console.log(`  ℹ️ 一時的なエラーと判断、リトライします`);
          break;
        }
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
  // 特殊なエラーパターンを検知するための最大リトライ回数
  const maxSpecialRetries = 2;
  let specialRetryCount = 0;
  
  async function attemptFetch() {
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
        
        // HTTPステータスコードの確認（レスポンスに含まれる場合）
        let statusCode = null;
        if (result.statusCode) {
          statusCode = result.statusCode;
        } else if (result.error && result.error.statusCode) {
          statusCode = result.error.statusCode;
        }
        
        // エラータイプの判定を改善
        let errorType = 'other';
        const lowerErrorMsg = errorMsg.toLowerCase();
        
        // 404エラーの明確な判定
        if (statusCode === 404 || 
            lowerErrorMsg.includes('tweet not found') || 
            lowerErrorMsg.includes('ツイートが見つかりません') ||
            lowerErrorMsg.includes('does not exist') ||
            lowerErrorMsg.includes('存在しません')) {
          errorType = 'not_found';
        } 
        // センシティブコンテンツの判定
        else if (lowerErrorMsg.includes('sensitive content') || 
                lowerErrorMsg.includes('センシティブなコンテンツ') ||
                lowerErrorMsg.includes('sensitive')) {
          errorType = 'sensitive_content';
        } 
        // レート制限エラーの判定
        else if (statusCode === 429 ||
                lowerErrorMsg.includes('rate limit') || 
                lowerErrorMsg.includes('too many requests') ||
                lowerErrorMsg.includes('レート制限')) {
          errorType = 'rate_limit';
        }
        // 認証エラーの判定
        else if (statusCode === 401 ||
                lowerErrorMsg.includes('unauthorized') || 
                lowerErrorMsg.includes('authorization') ||
                lowerErrorMsg.includes('認証')) {
          errorType = 'authentication';
        } 
        // その他のエラー
        else {
          errorType = 'api';
        }
        
        // 一時的なエラーと思われる場合（rate_limitやapi）は、
        // 特殊なリトライ処理を行う（Not foundが誤検出される場合がある）
        if ((errorType === 'not_found' || errorType === 'rate_limit' || errorType === 'api') && 
            specialRetryCount < maxSpecialRetries) {
          console.log(`  🔄 特殊状況検知: "${errorType}" エラー - 追加リトライを実行 (${specialRetryCount + 1}/${maxSpecialRetries})`);
          specialRetryCount++;
          
          // 追加のディレイを挟んでリトライ
          await sleep(CONFIG.RETRY_DELAY * 1.5);
          return await attemptFetch();
        }
        
        return {
          success: false,
          metadata: null,
          error: errorMsg,
          errorType,
          statusCode
        };
      }
    } catch (error) {
      // エラータイプがすでに設定されているか確認
      const errorType = error.errorType || determineErrorType(error);
      
      // NetworkやTimeoutエラーと思われる場合は、リトライを試みる
      if ((errorType === 'network' || errorType === 'timeout') && 
          specialRetryCount < maxSpecialRetries) {
        console.log(`  🔄 ネットワークエラー検知 - 追加リトライを実行 (${specialRetryCount + 1}/${maxSpecialRetries})`);
        specialRetryCount++;
        
        // 追加のディレイを挟んでリトライ
        await sleep(CONFIG.RETRY_DELAY * 2);
        return await attemptFetch();
      }
      
      return {
        success: false,
        metadata: null,
        error: error.message || (typeof error === 'string' ? error : JSON.stringify(error)),
        errorType,
        statusCode: error.statusCode || (error.response && error.response.statusCode)
      };
    }
  }
  
  // 実際のフェッチ処理を開始
  return await attemptFetch();
}

// 以前の互換性のために getTweetInfo として fetchTweetInfo をエクスポート
const getTweetInfo = fetchTweetInfo;

module.exports = {
  callTwitterAPI,
  fetchTweetInfo,
  getTweetInfo // 互換性のために両方の名前でエクスポート
};