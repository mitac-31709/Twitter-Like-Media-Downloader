// ツイートメディアの処理機能を提供するサービス
const { fetchTweetInfo } = require('./twitter-api-service');
const { downloadMediaFromMetadata } = require('../utils/download-utils');
const { loadMetadata, saveMetadata } = require('../utils/file-utils');
const { logError } = require('../utils/error-handlers');
const { addToSkipList, addToNotFoundList, addToSensitiveList, addToParseErrorList } = require('../utils/list-handlers');

/**
 * ツイートからメディアとメタデータを処理する
 * @param {string} tweetId - ツイートID
 * @param {string} tweetUrl - ツイートのURL
 * @param {Object} options - 処理オプション
 * @param {boolean} options.hasMedia - すでにメディアがダウンロード済みか
 * @param {boolean} options.hasMetadata - すでにメタデータが保存済みか
 * @returns {Promise<Object>} 処理結果
 */
async function processTweetMedia(tweetId, tweetUrl, options) {
  const { hasMedia, hasMetadata } = options;
  
  // 結果オブジェクト
  const result = {
    tweetId,
    success: false,
    downloadedFiles: [],
    savedMetadata: false,
    errorType: null,
    error: null,
    usedAPI: false // APIを使用したかどうかのフラグを追加
  };
  
  try {
    // メタデータがあって画像がない場合は、メタデータファイルから情報を読み込む
    if (hasMetadata && !hasMedia) {
      console.log(`  🔄 メタデータが存在します。APIを使わずにメディアをダウンロードします。`);
      const metadata = loadMetadata(tweetId);
      
      if (metadata) {
        try {
          // メタデータからメディアをダウンロード
          const downloadedFiles = await downloadMediaFromMetadata(tweetId, metadata);
          result.downloadedFiles = downloadedFiles;
          result.success = downloadedFiles.length > 0;
          result.usedAPI = false; // ローカルのメタデータを使用
          return result;
        } catch (error) {
          console.error(`  ❌ メタデータからのダウンロードに失敗しました: ${error.message}`);
          // エラーは記録するが、スキップリストには追加しない（後でもう一度試せるように）
          logError(tweetId, tweetUrl, error, 'media_download');
          // 失敗したので、APIを使用して再取得を試みる
        }
      } else {
        console.log(`  ⚠️ メタデータの読み込みに失敗しました。APIを使用します。`);
      }
    }
    
    // API経由で情報を取得
    result.usedAPI = true; // APIを使用
    const tweetInfo = await fetchTweetInfo(tweetId, tweetUrl);
    
    if (tweetInfo.success) {
      // メタデータの保存（まだ保存されていない場合）
      if (!hasMetadata) {
        saveMetadata(tweetId, tweetInfo.metadata);
        result.savedMetadata = true;
      } else {
        console.log(`  ⏭️ メタデータは既に保存済みです。`);
      }
      
      // メディアのダウンロード（まだダウンロードされていない場合）
      if (!hasMedia && tweetInfo.metadata.media && tweetInfo.metadata.media.length > 0) {
        const downloadedFiles = await downloadMediaFromMetadata(tweetId, tweetInfo.metadata);
        result.downloadedFiles = downloadedFiles;
        result.success = downloadedFiles.length > 0;
      } else if (hasMedia) {
        console.log(`  ⏭️ メディアは既にダウンロード済みです。`);
        result.success = true;
      } else if (!tweetInfo.metadata.media || tweetInfo.metadata.media.length === 0) {
        console.log('  ⚠️ このツイートにはメディアが含まれていません。');
        result.success = true; // メディアがない場合も成功として扱う
      }
    } else {
      // API呼び出しが失敗した場合
      result.error = tweetInfo.error;
      result.errorType = tweetInfo.errorType;
      
      // エラーの種類に応じて適切なリストに追加
      if (tweetInfo.errorType === 'not_found') {
        addToNotFoundList(tweetId);
        logError(tweetId, tweetUrl, new Error(tweetInfo.error), 'not_found');
      } else if (tweetInfo.errorType === 'sensitive_content') {
        addToSensitiveList(tweetId);
        logError(tweetId, tweetUrl, new Error(tweetInfo.error), 'sensitive_content');
      } else if (tweetInfo.errorType === 'parse') {
        addToParseErrorList(tweetId);
        logError(tweetId, tweetUrl, new Error(tweetInfo.error), 'parse');
      } else {
        // その他のエラーはスキップリストに追加
        addToSkipList(tweetId);
        logError(tweetId, tweetUrl, new Error(tweetInfo.error), 'api');
      }
    }
    
    return result;
  } catch (error) {
    // 予期せぬエラーが発生した場合
    const errorType = error.errorType || 'other';
    result.error = error.message || error.toString();
    result.errorType = errorType;
    
    // エラータイプに応じた処理
    if (errorType === 'not_found') {
      addToNotFoundList(tweetId);
      logError(tweetId, tweetUrl, error, 'not_found');
    } else if (errorType === 'sensitive_content') {
      addToSensitiveList(tweetId);
      logError(tweetId, tweetUrl, error, 'sensitive_content');
    } else if (errorType === 'parse') {
      addToParseErrorList(tweetId);
      logError(tweetId, tweetUrl, error, 'parse');
    } else {
      addToSkipList(tweetId);
      logError(tweetId, tweetUrl, error, 'other');
    }
    
    return result;
  }
}

module.exports = {
  processTweetMedia
};