const path = require('path');
const fs = require('fs');
const { CONFIG, dirs } = require('../config/config');
const { getTweetInfo } = require('./twitter-api-service');
const { downloadFile } = require('../utils/download-utils');
const { logError, logDebug } = require('../utils/error-handlers');
const { 
  saveMetadata, 
  loadMetadata, 
  extractMediaUrlsFromMetadata,
  getOriginalMediaUrl
} = require('./metadata-service');
const { colorize, ANSI_COLORS } = require('../utils/progress-bar');

/**
 * ツイートのメディアを処理する
 * @param {string} tweetId - ツイートID
 * @param {string} tweetUrl - ツイートURL
 * @param {Object} options - オプション
 * @returns {Promise<Object>} 処理結果
 */
async function processTweetMedia(tweetId, tweetUrl, options = {}) {
  const { 
    hasMedia = false,        // すでにメディアをダウンロード済みか
    hasMetadata = false,     // すでにメタデータを保存済みか
    onProgress = null,       // 進捗コールバック
    logger = null,           // ロガー関数
    forceApi = false         // 常にAPIを使用するかどうか
  } = options;
  
  // 結果オブジェクトの初期化
  const result = {
    tweetId,
    error: null,
    errorType: null,
    usedAPI: false,
    savedMetadata: false,
    noMedia: false,
    downloadedFiles: []
  };
  
  try {
    // 進捗表示の更新
    const updateProgress = (status, progress, details = {}) => {
      if (onProgress) onProgress(status, progress, details);
    };
    
    // デバッグログの出力
    const log = (message) => {
      if (logger) logger(message);
    };
    
    // ツイート情報の取得（APIまたはローカルキャッシュから）
    let tweetData = null;
    
    // 既存のメタデータを利用するか判断
    if (hasMetadata && !forceApi) {
      log(`既存のメタデータを使用: ${tweetId}`);
      tweetData = loadMetadata(tweetId);
      
      if (!tweetData) {
        log(`警告: メタデータが見つかりませんでした: ${tweetId}`);
        // メタデータが見つからない場合、APIから再取得
        result.usedAPI = true;
        updateProgress('ツイート情報をAPI経由で取得中...', 10);
        tweetData = await getTweetInfo(tweetId, tweetUrl);
      }
    } else {
      // APIからツイート情報を取得
      result.usedAPI = true;
      updateProgress('ツイート情報をAPI経由で取得中...', 10);
      tweetData = await getTweetInfo(tweetId, tweetUrl);
    }
    
    // ツイートが見つからない場合
    if (!tweetData) {
      result.error = 'ツイート情報を取得できませんでした';
      result.errorType = 'not_found';
      return result;
    }
    
    // メディアを含むかチェック（メディアエンティティがあるかどうか）
    const hasMediaEntities = tweetData.mediaEntities && tweetData.mediaEntities.length > 0;
    
    // メタデータの保存（まだ保存していない場合）
    if (!hasMetadata) {
      updateProgress('メタデータを保存中...', 20);
      result.savedMetadata = await saveMetadata(tweetId, tweetData);
    }
    
    // メディアがないツイートの場合は終了
    if (!hasMediaEntities) {
      log(`メディアが存在しないツイート: ${tweetId}`);
      result.noMedia = true;
      return result;
    }
    
    // すでにメディアをダウンロード済みの場合はスキップ
    if (hasMedia) {
      log(`メディアはすでにダウンロード済み: ${tweetId}`);
      return result;
    }
    
    // メディアURLの抽出と処理
    const mediaItems = extractMediaUrlsFromMetadata(tweetData);
    
    if (mediaItems.length === 0) {
      log(`抽出可能なメディアがありません: ${tweetId}`);
      result.noMedia = true;
      return result;
    }
    
    // ダウンロードディレクトリの確認
    if (!fs.existsSync(dirs.downloadDir)) {
      fs.mkdirSync(dirs.downloadDir, { recursive: true });
    }
    
    // 各メディアのダウンロード
    let successCount = 0;
    for (let i = 0; i < mediaItems.length; i++) {
      const { url, filename } = mediaItems[i];
      const progress = 25 + Math.floor((i / mediaItems.length) * 70); // 25%～95%の間で進捗を計算
      
      // オリジナルサイズのURLを取得
      const originalUrl = getOriginalMediaUrl(url);
      
      // 保存先パス
      const filePath = path.join(dirs.downloadDir, filename);
      
      // 進捗コールバックを準備
      const itemProgress = (currentBytes, totalBytes) => {
        if (onProgress) {
          const itemProgressPercent = totalBytes > 0 ? (currentBytes / totalBytes) * 100 : 0;
          const details = {
            filename,
            currentSize: currentBytes,
            totalSize: totalBytes,
            currentItem: i + 1,
            totalItems: mediaItems.length
          };
          
          onProgress(`ダウンロード中 (${i + 1}/${mediaItems.length})`, progress, details);
        }
      };
      
      try {
        // ファイルのダウンロード
        log(`ダウンロード開始: ${filename} (${url})`);
        await downloadFile(originalUrl, filePath, { 
          onProgress: itemProgress,
          timeout: CONFIG.DOWNLOAD_TIMEOUT
        });
        
        // ダウンロード成功をログに記録
        result.downloadedFiles.push(filename);
        successCount++;
        log(`ダウンロード完了 (${successCount}/${mediaItems.length}): ${filename}`);
      } catch (error) {
        // 個別のファイルダウンロードエラーを記録
        logError(tweetId, `メディアのダウンロード中にエラーが発生: ${filename} - ${error.message}`);
      }
    }
    
    // ダウンロード結果の判定
    if (result.downloadedFiles.length === 0) {
      result.error = 'メディアのダウンロードに失敗しました';
      result.errorType = 'download';
    }
    
    // 最終進捗を更新
    updateProgress('ダウンロード完了', 100);
    
    return result;
  } catch (error) {
    // エラーハンドリング
    result.error = error.message;
    result.errorType = error.type || 'unknown';
    
    logError(tweetId, tweetUrl, error);
    return result;
  }
}

module.exports = {
  processTweetMedia
};