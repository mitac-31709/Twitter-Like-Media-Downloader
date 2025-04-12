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
const { colorize, ANSI_COLORS, clearMultilineProgress } = require('../utils/progress-bar');

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
    // 進捗表示の更新（エラーフラグ付き）
    const updateProgress = (status, progress, details = {}, isError = false) => {
      if (onProgress) {
        // エラー状態の場合は赤色で表示
        if (isError) {
          status = colorize(`エラー: ${tweetId} - ${status}`, ANSI_COLORS.red);
        }
        onProgress(status, progress, details);
      }
    };
    
    // デバッグログの出力
    const log = (message) => {
      if (logger) logger(message);
    };
    
    // ツイート情報の取得（APIまたはローカルキャッシュから）
    let tweetResponse = null;
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
        tweetResponse = await getTweetInfo(tweetId, tweetUrl);
        // レスポンスからメタデータを取り出す
        tweetData = tweetResponse.success ? tweetResponse.metadata : null;
      }
    } else {
      // APIからツイート情報を取得
      result.usedAPI = true;
      updateProgress('ツイート情報をAPI経由で取得中...', 10);
      tweetResponse = await getTweetInfo(tweetId, tweetUrl);
      // レスポンスからメタデータを取り出す
      tweetData = tweetResponse.success ? tweetResponse.metadata : null;
    }
    
    // ツイートが見つからない場合
    if (!tweetData) {
      result.error = 'ツイート情報を取得できませんでした';
      result.errorType = 'not_found';
      // エラー表示を更新して進捗バーを終了
      updateProgress(result.error, 100, {}, true);
      return result;
    }

    // デバッグ出力：実際のデータ構造を確認
    if (CONFIG.DEBUG) {
      log(`ツイートデータ構造: ${JSON.stringify(Object.keys(tweetData))}`);
      if (tweetData.extended_entities) {
        log(`extended_entities: ${JSON.stringify(tweetData.extended_entities)}`);
      }
      if (tweetData.entities) {
        log(`entities: ${JSON.stringify(tweetData.entities)}`);
      }
    }
    
    // ツイートAPIのレスポンス構造に応じてメディアエンティティを取得
    // TwitterDLのレスポンス構造はextended_entitiesまたはentities.mediaにメディア情報が含まれる
    if (!tweetData.mediaEntities) {
      if (tweetData.extended_entities && tweetData.extended_entities.media) {
        tweetData.mediaEntities = tweetData.extended_entities.media;
      } else if (tweetData.entities && tweetData.entities.media) {
        tweetData.mediaEntities = tweetData.entities.media;
      } else {
        tweetData.mediaEntities = [];
      }
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
      updateProgress(`メディアなし: ${tweetId} - メタデータのみ保存`, 100);
      return result;
    }
    
    // すでにメディアをダウンロード済みの場合はスキップ
    if (hasMedia) {
      log(`メディアはすでにダウンロード済み: ${tweetId}`);
      updateProgress(`すでにダウンロード済み: ${tweetId}`, 100);
      return result;
    }
    
    // メディアURLの抽出と処理
    const mediaItems = extractMediaUrlsFromMetadata(tweetData);
    
    if (mediaItems.length === 0) {
      log(`抽出可能なメディアがありません: ${tweetId}`);
      result.noMedia = true;
      updateProgress(`メディアなし: ${tweetId} - メタデータのみ保存`, 100);
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
      // より正確な進捗計算: 25%～95%の範囲で各ファイルの進捗を均等に分配
      const progressStart = 25;
      const progressEnd = 95;
      const progressRange = progressEnd - progressStart;
      const progressPerItem = progressRange / mediaItems.length;
      const progress = Math.round(progressStart + (i * progressPerItem));
      
      // オリジナルサイズのURLを取得
      const originalUrl = getOriginalMediaUrl(url);
      
      // 保存先パス
      const filePath = path.join(dirs.downloadDir, filename);
      
      // 進捗コールバックを準備
      const itemProgress = (currentBytes, totalBytes) => {
        if (onProgress) {
          // ファイル単位の進捗計算
          const fileProgress = totalBytes > 0 ? (currentBytes / totalBytes) : 0;
          // 全体の進捗に反映
          const overallProgress = Math.round(progress + (fileProgress * progressPerItem));
          
          const details = {
            filename,
            currentSize: currentBytes,
            totalSize: totalBytes,
            currentItem: i + 1,
            totalItems: mediaItems.length
          };
          
          onProgress(`ダウンロード中 (${i + 1}/${mediaItems.length})`, overallProgress, details);
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
        // エラーでもプログレスバーを更新
        updateProgress(`ダウンロードエラー: ${filename}`, progress + progressPerItem, {}, true);
      }
    }
    
    // ダウンロード結果の判定
    if (result.downloadedFiles.length === 0 && mediaItems.length > 0) {
      result.error = 'メディアのダウンロードに失敗しました';
      result.errorType = 'download';
      updateProgress(result.error, 100, {}, true);
    } else {
      // 最終進捗を更新
      updateProgress(`ダウンロード完了 (${successCount}/${mediaItems.length})`, 100);
    }
    
    return result;
  } catch (error) {
    // エラーハンドリング
    result.error = error.message;
    result.errorType = error.type || 'unknown';
    
    // エラーでもプログレスバーを完了状態に
    if (onProgress) {
      const errorMessage = `エラー: ${tweetId} - ${error.message}`;
      onProgress(colorize(errorMessage, ANSI_COLORS.red), 100, {});
    }
    
    logError(tweetId, tweetUrl, error);
    return result;
  }
}

module.exports = {
  processTweetMedia
};