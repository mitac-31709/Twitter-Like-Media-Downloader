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
 * @param {Function} options.onProgress - 進捗状況を通知するコールバック関数
 * @param {Function} options.logger - ロギング関数（オプション）
 * @returns {Promise<Object>} 処理結果
 */
async function processTweetMedia(tweetId, tweetUrl, options) {
  const { hasMedia, hasMetadata, onProgress, logger } = options;
  
  // 進捗状況更新ヘルパー関数
  const updateProgress = (status, progress) => {
    if (typeof onProgress === 'function') {
      onProgress(status, progress);
    }
  };
  
  // ログ出力関数（logger指定がなければ静かに実行）
  const log = (message) => {
    if (typeof logger === 'function') {
      logger(message);
    }
  };
  
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
    updateProgress('処理開始', 0);
    
    // メタデータがあって画像がない場合は、メタデータファイルから情報を読み込む
    if (hasMetadata && !hasMedia) {
      // ログではなくプログレスバーの状態として表示
      updateProgress('メタデータからメディア情報を読み込み中...', 10);
      const metadata = loadMetadata(tweetId);
      
      if (metadata) {
        try {
          updateProgress('メタデータからメディアをダウンロード中...', 20);
          // メタデータからメディアをダウンロード
          const downloadedFiles = await downloadMediaFromMetadata(tweetId, metadata, { 
            onProgress: (status, fileProgress, fileSize, totalSize) => {
              // ファイルサイズ情報と合わせて進捗を更新
              const overallProgress = 20 + Math.round(fileProgress * 0.7); // 20%〜90%の範囲
              updateProgress(status, overallProgress);
            },
            logger: log
          });
          
          updateProgress('ダウンロード完了、処理中...', 90);
          result.downloadedFiles = downloadedFiles;
          result.success = downloadedFiles.length > 0;
          result.usedAPI = false; // ローカルのメタデータを使用
          
          updateProgress('完了', 100);
          return result;
        } catch (error) {
          updateProgress(`エラー: ${error.message}`, 0);
          // エラーは記録するが、スキップリストには追加しない（後でもう一度試せるように）
          logError(tweetId, tweetUrl, error, 'media_download');
          // 失敗したので、APIを使用して再取得を試みる
        }
      } else {
        updateProgress('メタデータの読み込み失敗、APIを使用します', 5);
      }
    }
    
    // API経由で情報を取得
    updateProgress('Twitter APIからデータを取得中...', 30);
    result.usedAPI = true; // APIを使用
    const tweetInfo = await fetchTweetInfo(tweetId, tweetUrl);
    
    if (tweetInfo.success) {
      // メタデータの保存（まだ保存されていない場合）
      if (!hasMetadata) {
        updateProgress('メタデータを保存中...', 40);
        saveMetadata(tweetId, tweetInfo.metadata);
        result.savedMetadata = true;
      } else {
        updateProgress('メタデータは既存のものを使用', 40);
      }
      
      // メディアのダウンロード（まだダウンロードされていない場合）
      if (!hasMedia && tweetInfo.metadata.media && tweetInfo.metadata.media.length > 0) {
        updateProgress('メディアファイルをダウンロード中...', 50);
        const downloadedFiles = await downloadMediaFromMetadata(tweetId, tweetInfo.metadata, {
          onProgress: (status, fileProgress, fileSize, totalSize) => {
            // ファイルサイズ情報と合わせて進捗を更新
            const overallProgress = 50 + Math.round(fileProgress * 0.4); // 50%〜90%の範囲
            updateProgress(status, overallProgress);
          },
          logger: log
        });
        
        updateProgress('ダウンロード完了、処理中...', 95);
        result.downloadedFiles = downloadedFiles;
        result.success = downloadedFiles.length > 0;
      } else if (hasMedia) {
        updateProgress('メディアは既にダウンロード済み', 90);
        result.success = true;
      } else if (!tweetInfo.metadata.media || tweetInfo.metadata.media.length === 0) {
        updateProgress('メディアが含まれていません', 90);
        result.success = true; // メディアがない場合も成功として扱う
      }
      
      updateProgress('処理完了', 100);
    } else {
      // API呼び出しが失敗した場合
      result.error = tweetInfo.error;
      result.errorType = tweetInfo.errorType;
      
      // エラーの種類に応じて適切なリストに追加
      if (tweetInfo.errorType === 'not_found') {
        updateProgress('ツイートが存在しません', 100);
        addToNotFoundList(tweetId);
        logError(tweetId, tweetUrl, new Error(tweetInfo.error), 'not_found');
      } else if (tweetInfo.errorType === 'sensitive_content') {
        updateProgress('センシティブなコンテンツを含むツイート', 100);
        addToSensitiveList(tweetId);
        logError(tweetId, tweetUrl, new Error(tweetInfo.error), 'sensitive_content');
      } else if (tweetInfo.errorType === 'parse') {
        updateProgress('解析エラー', 100);
        addToParseErrorList(tweetId);
        logError(tweetId, tweetUrl, new Error(tweetInfo.error), 'parse');
      } else {
        // その他のエラーはスキップリストに追加
        updateProgress(`APIエラー: ${tweetInfo.error}`, 100);
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
      updateProgress('ツイートが存在しません', 100);
      addToNotFoundList(tweetId);
      logError(tweetId, tweetUrl, error, 'not_found');
    } else if (errorType === 'sensitive_content') {
      updateProgress('センシティブなコンテンツを含むツイート', 100);
      addToSensitiveList(tweetId);
      logError(tweetId, tweetUrl, error, 'sensitive_content');
    } else if (errorType === 'parse') {
      updateProgress('解析エラー', 100);
      addToParseErrorList(tweetId);
      logError(tweetId, tweetUrl, error, 'parse');
    } else {
      updateProgress(`エラー: ${error.message || 'unknown'}`, 100);
      addToSkipList(tweetId);
      logError(tweetId, tweetUrl, error, 'other');
    }
    
    return result;
  }
}

module.exports = {
  processTweetMedia
};