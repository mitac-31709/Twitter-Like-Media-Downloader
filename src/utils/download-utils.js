// メディアダウンロードに関するユーティリティ関数
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { dirs } = require('../config/config');
const { sleep } = require('./error-handlers');
const { formatFileSize } = require('./progress-bar'); // ファイルサイズフォーマッター

/**
 * メディアをダウンロードして保存する
 * @param {string} mediaUrl - ダウンロードするメディアのURL
 * @param {string} tweetId - ツイートID
 * @param {number} index - メディアのインデックス
 * @param {Object} options - ダウンロードオプション
 * @param {Function} options.onProgress - 進捗状況を通知するコールバック関数
 * @param {Function} options.logger - ロギング関数（オプション）
 * @returns {Promise<Object|null>} ファイル情報またはnull（失敗時）
 */
async function downloadMedia(mediaUrl, tweetId, index, options = {}) {
  const { onProgress, logger } = options;
  
  // 進捗状況更新ヘルパー関数
  const updateProgress = (status, progress, downloadedSize, totalSize) => {
    if (typeof onProgress === 'function') {
      onProgress(status, progress, downloadedSize, totalSize);
    }
  };
  
  // ログ出力関数（logger指定がなければ静かに実行）
  const log = (message) => {
    if (typeof logger === 'function') {
      logger(message);
    }
  };
  
  try {
    // URLからファイル拡張子を取得
    let fileExtension = path.extname(new URL(mediaUrl).pathname);
    // 拡張子がなければデフォルトで.jpgを使用
    if (!fileExtension || fileExtension === '.') {
      fileExtension = '.jpg';
    }
    
    const fileName = `${tweetId}-${index}${fileExtension}`;
    const filePath = path.join(dirs.downloadDir, fileName);
    
    // ファイルが既に存在するか確認
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      updateProgress(`ファイル確認: ${fileName}`, 100, stats.size, stats.size);
      log(`    - ${fileName} (既に存在します)`);
      
      return {
        fileName,
        filePath,
        fileSize: stats.size,
        alreadyExists: true
      };
    }

    updateProgress(`${fileName} のダウンロード準備中...`, 0, 0, 0);
    
    // ヘッダーを取得して合計サイズを確認
    let totalSize = 0;
    try {
      const headResponse = await axios({
        method: 'HEAD',
        url: mediaUrl,
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      
      // Content-Lengthヘッダーからファイルサイズを取得
      if (headResponse.headers['content-length']) {
        totalSize = parseInt(headResponse.headers['content-length'], 10);
        updateProgress(`ダウンロード開始: ${fileName} (${formatFileSize(totalSize)})`, 0, 0, totalSize);
      }
    } catch (error) {
      log(`    - ヘッダー取得エラー、サイズ未確認でダウンロード続行: ${error.message}`);
    }
    
    // 画像をダウンロード
    const response = await axios({
      method: 'GET',
      url: mediaUrl,
      responseType: 'stream',
      timeout: 30000, // 30秒タイムアウト
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    // ファイルサイズをレスポンスヘッダーから取得（HEADリクエストが失敗した場合の代替手段）
    if (totalSize === 0 && response.headers['content-length']) {
      totalSize = parseInt(response.headers['content-length'], 10);
    }
    
    // 進捗状況の追跡用変数
    let downloadedSize = 0;
    
    // 進捗状況を監視するストリームを作成
    const progressStream = response.data.on('data', (chunk) => {
      downloadedSize += chunk.length;
      const progress = totalSize > 0 ? Math.round((downloadedSize / totalSize) * 100) : 0;
      
      // 進捗状況の通知（ファイルサイズ情報も含む）
      const status = totalSize > 0 ? 
        `ダウンロード中: ${fileName} (${formatFileSize(downloadedSize)}/${formatFileSize(totalSize)})` :
        `ダウンロード中: ${fileName} (${formatFileSize(downloadedSize)})`;
      
      updateProgress(status, progress, downloadedSize, totalSize);
    });
    
    // ファイルに保存
    const writer = fs.createWriteStream(filePath);
    progressStream.pipe(writer);
    
    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        const finalSize = fs.statSync(filePath).size;
        updateProgress(`完了: ${fileName}`, 100, finalSize, finalSize);
        
        resolve({
          fileName,
          filePath,
          fileSize: finalSize,
          alreadyExists: false
        });
      });
      
      writer.on('error', (err) => {
        updateProgress(`エラー: ${fileName} - ${err.message}`, 0, 0, 0);
        reject(err);
      });
      
      response.data.on('error', (err) => {
        updateProgress(`ダウンロードエラー: ${fileName} - ${err.message}`, 0, 0, 0);
        reject(err);
      });
    });
  } catch (error) {
    log(`    - ダウンロードエラー: ${mediaUrl} - ${error.message}`);
    updateProgress(`エラー: ${error.message}`, 0, 0, 0);
    return null; // エラーの場合はnullを返す
  }
}

/**
 * メタデータからメディアをダウンロードする
 * @param {string} tweetId - ツイートID
 * @param {Object} metadata - メディアを含むメタデータオブジェクト
 * @param {Object} options - ダウンロードオプション
 * @param {Function} options.onProgress - 進捗状況を通知するコールバック関数
 * @param {Function} options.logger - ロギング関数（オプション）
 * @returns {Promise<Array>} ダウンロードされたファイル情報の配列
 */
async function downloadMediaFromMetadata(tweetId, metadata, options = {}) {
  const { onProgress, logger } = options;
  
  // ログ出力関数（logger指定がなければ静かに実行）
  const log = (message) => {
    if (typeof logger === 'function') {
      logger(message);
    }
  };
  
  if (!metadata || !metadata.media || metadata.media.length === 0) {
    log('    - メタデータにメディア情報がありません');
    return [];
  }
  
  const mediaCount = metadata.media.length;
  log(`  ✅ メタデータからメディアが見つかりました: ${mediaCount}個`);
  
  if (typeof onProgress === 'function') {
    onProgress(`メディア処理開始: ${mediaCount}個のファイルが見つかりました`, 0, 0, 0);
  }
  
  const downloadResults = [];
  let completedCount = 0;
  let totalIndex = 0;
  
  // メディアを1つずつ順番にダウンロード（進捗状況を個別に追跡するため）
  for (const media of metadata.media) {
    totalIndex++;
    let mediaUrl = null;
    let mediaType = '不明';
    
    // メディアタイプに応じてURLを取得
    if (media.type === 'photo' && media.image) {
      mediaUrl = media.image;
      mediaType = '画像';
    } else if (media.type === 'video' && media.videos && media.videos.length > 0) {
      // 動画の場合、最高品質の動画をダウンロード
      const bestVideo = media.videos.reduce((prev, current) => 
        (prev.bitrate > current.bitrate) ? prev : current
      );
      mediaUrl = bestVideo.url;
      mediaType = '動画';
    } else if (media.type === 'animated_gif' && media.videos && media.videos.length > 0) {
      // GIFの場合
      mediaUrl = media.videos[0].url;
      mediaType = 'GIF';
    } else {
      log(`    - サポートされていないメディアタイプ: ${media.type}`);
      continue;
    }
    
    if (mediaUrl) {
      // 進捗コールバック用のラッパー関数
      const progressCallback = (status, progress, downloadedSize, totalSize) => {
        if (typeof onProgress === 'function') {
          // 全体の進捗状況の更新（各ファイルの進捗を割合で反映）
          const overallProgress = Math.floor((completedCount / mediaCount) * 100) + 
                                 Math.floor((progress / 100) * (1 / mediaCount) * 100);
          
          // ファイル情報も含めて更新
          onProgress(
            `[${totalIndex}/${mediaCount}] ${mediaType} ${status}`,
            overallProgress,
            downloadedSize,
            totalSize
          );
        }
      };
      
      try {
        // メディアをダウンロード
        const result = await downloadMedia(mediaUrl, tweetId, totalIndex, {
          onProgress: progressCallback,
          logger
        });
        
        if (result) {
          downloadResults.push(result);
        }
      } catch (error) {
        log(`    - ${mediaType}ダウンロードエラー: ${error.message}`);
      }
      
      // このファイルの処理が完了
      completedCount++;
    }
  }
  
  // nullを除外して実際にダウンロードされたファイルだけを取得
  const successfulDownloads = downloadResults.filter(result => result !== null);
  
  if (successfulDownloads.length > 0) {
    log(`  ✅ ${successfulDownloads.length}個のメディアをダウンロードしました`);
    
    if (typeof onProgress === 'function') {
      onProgress(`${successfulDownloads.length}個のメディアのダウンロード完了`, 100, 0, 0);
    }
  } else {
    log('  ⚠️ メディアのダウンロードに失敗しました');
    
    if (typeof onProgress === 'function') {
      onProgress('メディアのダウンロードに失敗しました', 0, 0, 0);
    }
  }
  
  // ファイル名のリストを返す
  return successfulDownloads.map(result => result.fileName);
}

module.exports = {
  downloadMedia,
  downloadMediaFromMetadata
};