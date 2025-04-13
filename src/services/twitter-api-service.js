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
    // Twitter認証オプションを構築
    const twitterOptions = {};
    
    // 認証モードが有効な場合のみ認証情報を使用
    if (CONFIG.USE_AUTH) {
      // 認証情報が設定されている場合は、オプションに追加
      if (CONFIG.TWITTER_AUTH) {
        twitterOptions.authorization = CONFIG.TWITTER_AUTH;
      }
      
      // クッキー情報が設定されている場合は、オプションに追加（センシティブコンテンツの取得に必要）
      if (CONFIG.TWITTER_COOKIE) {
        twitterOptions.cookie = CONFIG.TWITTER_COOKIE;
      }
      
      // プロキシ設定が指定されている場合は、オプションに追加
      if (CONFIG.TWITTER_PROXY) {
        twitterOptions.proxy = CONFIG.TWITTER_PROXY;
      }
      
      // デバッグモードの場合、認証情報の使用状況を表示
      if (CONFIG.DEBUG) {
        console.log('  🔑 認証情報を使用してTwitter APIを呼び出しています');
      }
    } else if (CONFIG.DEBUG) {
      console.log('  🔒 認証情報を使用せずにTwitter APIを呼び出しています');
    }
    
    // TwitterDLの呼び出し（認証情報とクッキー情報を渡す）
    const result = await TwitterDL(tweetUrl, Object.keys(twitterOptions).length > 0 ? twitterOptions : undefined);
    
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
      case 'parse':
        // 特定のエラータイプの場合は直ちにエラーをスローする
        throw error;
      case 'sensitive_content':
        // センシティブコンテンツエラーで認証が無効な場合は、認証設定の使用を推奨するメッセージを表示
        if (!CONFIG.USE_AUTH && (CONFIG.TWITTER_AUTH || CONFIG.TWITTER_COOKIE)) {
          console.warn('  📢 センシティブコンテンツを取得するには、コマンドラインオプション --force-auth を使用して認証を有効にしてください');
        }
        throw error;
      case 'api':
        if (error.message && error.message.includes('Authorization')) {
          console.error(`  🔑 認証エラーが発生しました。TwitterDLの認証情報が無効になっている可能性があります。`);
          
          // 認証が有効でエラーが発生した場合は、無認証モードを提案
          if (CONFIG.USE_AUTH) {
            console.warn('  💡 認証情報が原因でエラーが発生している場合は、--no-auth オプションを使用して認証なしで試してみてください');
          }
        } else if (error.message && error.message.toLowerCase().includes('rate limit')) {
          // レート制限エラーが発生し、認証が無効な場合は認証を提案
          if (!CONFIG.USE_AUTH && (CONFIG.TWITTER_AUTH || CONFIG.TWITTER_COOKIE)) {
            console.warn('  💡 レート制限エラーが発生しました。--force-auth オプションを使用して認証情報を有効にするとレート制限を回避できる場合があります');
          }
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

// 以前の互換性のために getTweetInfo として fetchTweetInfo をエクスポート
const getTweetInfo = fetchTweetInfo;

module.exports = {
  callTwitterAPI,
  fetchTweetInfo,
  getTweetInfo // 互換性のために両方の名前でエクスポート
};