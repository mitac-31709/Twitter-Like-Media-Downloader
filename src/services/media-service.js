const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { CONFIG, dirs } = require('../config/config');
const { formatFileSize } = require('../utils/progress-bar');
const { addToSkipList, addToNotFoundList, addToSensitiveList, addToParseErrorList } = require('../utils/list-handlers');
const { logError } = require('../utils/error-handlers');

// ダウンロードディレクトリの設定
const DOWNLOAD_DIR = dirs.downloadDir;

/**
 * ファイルサイズをフォーマット (直接progress-barモジュールから取得)
 * @param {number} bytes - ファイルサイズ（バイト）
 * @return {string} 人間が読みやすい形式のファイルサイズ
 */
// formatFileSize関数はprogress-barモジュールからインポートしているので、ここでは重複実装しません

/**
 * メディアファイルとメタデータを処理
 * @param {string} tweetId - ツイートID
 * @param {string} tweetUrl - ツイートURL
 * @param {Object} options - オプション（hasMedia, hasMetadata, onProgress, logger）
 * @returns {Object} 処理結果
 */
async function processTweetMedia(tweetId, tweetUrl, options = {}) {
  // 処理結果オブジェクトを初期化
  const result = {
    tweetId,
    tweetUrl,
    usedAPI: false,
    downloadedFiles: [],
    savedMetadata: false,
    error: null,
    errorType: null
  };
  
  // オプションから各設定値を取得
  const { hasMedia = false, hasMetadata = false, onProgress = null, logger = null } = options;
  
  try {
    // 進捗状況更新関数（提供されていない場合はダミー関数）
    const updateProgress = onProgress || ((status, progress) => {});
    // ロガー関数（提供されていない場合はダミー関数）
    const log = logger || (() => {});
    
    // メタデータが既にある場合はそれを読み込む
    const metadataPath = path.join(DOWNLOAD_DIR, `${tweetId}-metadata.json`);
    let metadata = null;
    
    if (hasMetadata && fs.existsSync(metadataPath)) {
      try {
        const metadataContent = fs.readFileSync(metadataPath, 'utf-8');
        metadata = JSON.parse(metadataContent);
        updateProgress('メタデータ読み込み完了', 10);
        log(`メタデータファイルを読み込みました: ${tweetId}`);
      } catch (err) {
        // メタデータ読み込みエラーは記録するが続行
        log(`メタデータ解析エラー: ${err.message}`);
        logError(`メタデータ解析エラー(${tweetId}): ${err.message}`);
        addToParseErrorList(tweetId);
      }
    }
    
    // メタデータがある場合はそこからメディアURLを取得してダウンロード
    if (metadata && metadata.mediaUrls && metadata.mediaUrls.length > 0) {
      log(`メタデータから${metadata.mediaUrls.length}個のメディアURLを検出`);
      
      // メディアがまだダウンロードされていない場合のみダウンロード処理
      if (!hasMedia) {
        updateProgress(`メタデータからメディアをダウンロード中 (0/${metadata.mediaUrls.length})`, 15);
        
        // 各メディアをダウンロード
        for (let i = 0; i < metadata.mediaUrls.length; i++) {
          const mediaUrl = metadata.mediaUrls[i];
          const mediaIndex = i + 1;
          const fileExt = getFileExtension(mediaUrl);
          const outputPath = path.join(DOWNLOAD_DIR, `${tweetId}-${mediaIndex}${fileExt}`);
          
          updateProgress(`メディア ${mediaIndex}/${metadata.mediaUrls.length} ダウンロード中...`, 
            15 + Math.round((i / metadata.mediaUrls.length) * 70));
          
          try {
            // サイズを取得してからダウンロード
            const fileInfo = await getFileInfo(mediaUrl);
            const totalBytes = fileInfo.size;
            const fileName = path.basename(outputPath);
            
            log(`メディアファイル情報取得: ${fileName}, サイズ: ${formatFileSize(totalBytes)}`);
            
            // ファイルサイズに基づいた進捗表示つきダウンロード
            await downloadFileWithProgress(mediaUrl, outputPath, {
              onProgress: (bytesDownloaded) => {
                const progress = Math.round((bytesDownloaded / totalBytes) * 100);
                const progressValue = 15 + Math.round((i / metadata.mediaUrls.length) * 70) + 
                                     Math.round((progress / 100) * (70 / metadata.mediaUrls.length));
                
                updateProgress(
                  `メディア ${mediaIndex}/${metadata.mediaUrls.length} ダウンロード中... ${progress}%`, 
                  progressValue,
                  {
                    filename: fileName,
                    currentSize: bytesDownloaded,
                    totalSize: totalBytes
                  }
                );
              }
            });
            
            result.downloadedFiles.push(outputPath);
            log(`メディアファイルをダウンロードしました: ${fileName}`);
          } catch (err) {
            // 個別ファイルのダウンロードエラーは記録するが続行
            log(`メディアダウンロードエラー: ${err.message}`);
            logError(`メディアダウンロードエラー(${tweetId}-${mediaIndex}): ${err.message}`);
          }
        }
        
        updateProgress('メディアダウンロード完了', 85);
      } else {
        updateProgress('メディアは既にダウンロード済み', 85);
      }
      
      // メタデータは既にあるので何もしない
      updateProgress('処理完了', 100);
      return result;
    }
    
    // ここまで来たらAPIを使ってツイート情報を取得する必要がある
    result.usedAPI = true;
    updateProgress('API経由でツイート情報を取得中...', 20);
    
    // API呼び出し部分（実際のコードに合わせて実装）
    // ここではダミー実装として、テスト用のデータを返す
    
    // 実際のAPI呼び出しコードは、現在のプロジェクトに合わせて実装してください
    // 例: const tweetData = await fetchTweetData(tweetId, tweetUrl);
    
    // テスト用のダミーデータ
    const dummyMediaUrls = [
      'https://example.com/image1.jpg',
      'https://example.com/image2.mp4'
    ];
    
    // メディアURLが取得できた場合はダウンロードと保存を行う
    if (dummyMediaUrls && dummyMediaUrls.length > 0) {
      // メタデータを保存
      if (!hasMetadata) {
        const metadata = {
          tweetId,
          tweetUrl,
          mediaUrls: dummyMediaUrls,
          timestamp: new Date().toISOString()
        };
        
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
        result.savedMetadata = true;
        updateProgress('メタデータを保存しました', 30);
        log(`メタデータを保存しました: ${tweetId}`);
      } else {
        updateProgress('メタデータは既に保存済み', 30);
      }
      
      // メディアのダウンロード
      if (!hasMedia) {
        updateProgress(`メディアをダウンロード中 (0/${dummyMediaUrls.length})`, 40);
        
        for (let i = 0; i < dummyMediaUrls.length; i++) {
          const mediaUrl = dummyMediaUrls[i];
          const mediaIndex = i + 1;
          const fileExt = getFileExtension(mediaUrl);
          const outputPath = path.join(DOWNLOAD_DIR, `${tweetId}-${mediaIndex}${fileExt}`);
          
          updateProgress(`メディア ${mediaIndex}/${dummyMediaUrls.length} ダウンロード中...`, 
            40 + Math.round((i / dummyMediaUrls.length) * 50));
          
          try {
            // サイズを取得してからダウンロード
            const fileInfo = await getFileInfo(mediaUrl);
            const totalBytes = fileInfo.size;
            const fileName = path.basename(outputPath);
            
            log(`メディアファイル情報取得: ${fileName}, サイズ: ${formatFileSize(totalBytes)}`);
            
            // ファイルサイズに基づいた進捗表示つきダウンロード
            await downloadFileWithProgress(mediaUrl, outputPath, {
              onProgress: (bytesDownloaded) => {
                const progress = Math.round((bytesDownloaded / totalBytes) * 100);
                const progressValue = 40 + Math.round((i / dummyMediaUrls.length) * 50) + 
                                     Math.round((progress / 100) * (50 / dummyMediaUrls.length));
                
                updateProgress(
                  `メディア ${mediaIndex}/${dummyMediaUrls.length} ダウンロード中... ${progress}%`, 
                  progressValue,
                  {
                    filename: fileName,
                    currentSize: bytesDownloaded,
                    totalSize: totalBytes
                  }
                );
              }
            });
            
            result.downloadedFiles.push(outputPath);
            log(`メディアファイルをダウンロードしました: ${fileName}`);
          } catch (err) {
            // 個別ファイルのダウンロードエラーは記録するが続行
            log(`メディアダウンロードエラー: ${err.message}`);
            logError(`メディアダウンロードエラー(${tweetId}-${mediaIndex}): ${err.message}`);
          }
        }
        
        updateProgress('メディアダウンロード完了', 90);
      } else {
        updateProgress('メディアは既にダウンロード済み', 90);
      }
    } else {
      // メディアURLが取得できない場合
      updateProgress('メディアが見つかりませんでした', 100);
      log(`メディアが見つかりませんでした: ${tweetId}`);
      addToNotFoundList(tweetId);
    }
    
    // すべての処理完了
    updateProgress('処理完了', 100);
  } catch (err) {
    // エラー処理
    result.error = err.message;
    
    // エラータイプの特定
    if (err.response) {
      if (err.response.status === 404) {
        result.errorType = 'notfound';
        addToNotFoundList(tweetId);
      } else if (err.response.status === 403) {
        result.errorType = 'sensitive';
        addToSensitiveList(tweetId);
      } else {
        result.errorType = 'api';
        addToSkipList(tweetId);
      }
    } else if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
      result.errorType = 'timeout';
      addToSkipList(tweetId);
    } else {
      result.errorType = 'unknown';
      addToParseErrorList(tweetId);
    }
    
    // エラーをログに記録
    logError(`処理エラー(${tweetId}): ${err.message}`);
  }
  
  return result;
}

/**
 * ファイル情報を取得する（サイズなど）
 * @param {string} url - ファイルURL
 * @returns {Object} ファイル情報 {type, size}
 */
async function getFileInfo(url) {
  try {
    const response = await axios.head(url, {
      timeout: CONFIG.TIMEOUT,
      headers: CONFIG.REQUEST_HEADERS
    });
    
    return {
      type: response.headers['content-type'],
      size: parseInt(response.headers['content-length'] || '0', 10)
    };
  } catch (err) {
    // ファイル情報が取得できない場合はデフォルト値を返す
    return {
      type: 'application/octet-stream',
      size: 0
    };
  }
}

/**
 * 進捗表示付きでファイルをダウンロードする
 * @param {string} url - ダウンロードURL
 * @param {string} outputPath - 保存先のパス
 * @param {Object} options - オプション
 */
async function downloadFileWithProgress(url, outputPath, options = {}) {
  const { onProgress = null } = options;
  
  // ストリーミングダウンロードを行う
  const writer = fs.createWriteStream(outputPath);
  
  try {
    const response = await axios({
      method: 'get',
      url,
      responseType: 'stream',
      timeout: CONFIG.TIMEOUT,
      headers: CONFIG.REQUEST_HEADERS
    });
    
    const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
    let downloadedBytes = 0;
    let lastReportTime = 0;
    
    response.data.on('data', (chunk) => {
      downloadedBytes += chunk.length;
      
      // 頻繁すぎる更新を避けるため、100ms以上経過した場合のみ進捗を報告
      const now = Date.now();
      if (onProgress && (now - lastReportTime > 100)) {
        onProgress(downloadedBytes, totalBytes);
        lastReportTime = now;
      }
    });
    
    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
      response.data.pipe(writer);
    });
  } catch (err) {
    // エラーが発生した場合は書き込みストリームを閉じる
    writer.end();
    // 不完全なファイルを削除
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
    throw err;
  }
}

/**
 * URLから適切なファイル拡張子を判定する
 * @param {string} url - 画像/動画URL
 * @return {string} 拡張子（.jpgなど）
 */
function getFileExtension(url) {
  try {
    // URLからパスの部分を取得
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    
    // パスから拡張子を取得
    const ext = path.extname(pathname).toLowerCase();
    
    // 有効な拡張子のリスト
    const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mov', '.webm'];
    
    // 有効な拡張子なら返す
    if (validExtensions.includes(ext)) {
      return ext;
    }
    
    // 拡張子がない場合やサポートされていない場合は
    // コンテントタイプに基づいて拡張子を推測
    if (url.includes('format=jpg') || url.includes('format=jpeg')) {
      return '.jpg';
    } else if (url.includes('format=png')) {
      return '.png';
    } else if (url.includes('format=gif')) {
      return '.gif';
    } else if (url.includes('format=webp')) {
      return '.webp';
    } else if (url.includes('format=mp4') || url.includes('video')) {
      return '.mp4';
    } else {
      // デフォルトはJPG
      return '.jpg';
    }
  } catch (e) {
    // URL解析エラーの場合はデフォルト拡張子
    return '.jpg';
  }
}

module.exports = {
  processTweetMedia
};