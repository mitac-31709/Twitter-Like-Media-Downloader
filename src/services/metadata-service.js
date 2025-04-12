// メタデータ処理に特化したサービス
const fs = require('fs');
const path = require('path');
const { CONFIG, dirs } = require('../config/config');
const { logError, logDebug } = require('../utils/error-handlers');
const { colorize, ANSI_COLORS } = require('../utils/progress-bar');

/**
 * ツイートメタデータを保存
 * @param {string} tweetId - ツイートID
 * @param {object} tweetData - ツイートデータ
 * @returns {Promise<boolean>} 保存成功時はtrue
 */
async function saveMetadata(tweetId, tweetData) {
  try {
    if (!tweetId || !tweetData) {
      logError(tweetId, '保存するメタデータがありません');
      return false;
    }
    
    // ディレクトリが存在しない場合は作成
    if (!fs.existsSync(dirs.downloadDir)) {
      fs.mkdirSync(dirs.downloadDir, { recursive: true });
    }
    
    // メタデータファイル名
    const metadataFilename = `${tweetId}-metadata.json`;
    const metadataPath = path.join(dirs.downloadDir, metadataFilename);
    
    // 保存する前にいくつかの追加情報を付与
    const enhancedData = {
      ...tweetData,
      downloadedAt: new Date().toISOString(),
      appVersion: CONFIG.VERSION
    };
    
    // メタデータをファイルに保存
    fs.writeFileSync(metadataPath, JSON.stringify(enhancedData, null, 2), CONFIG.ENCODING);
    
    logDebug(`${colorize('メタデータ保存', ANSI_COLORS.green)}: ${tweetId} - ${metadataFilename}`);
    return true;
  } catch (error) {
    logError(tweetId, `メタデータの保存中にエラーが発生しました: ${error.message}`);
    return false;
  }
}

/**
 * ツイートメタデータを読み込む
 * @param {string} tweetId - ツイートID
 * @returns {object|null} メタデータオブジェクト、存在しない場合はnull
 */
function loadMetadata(tweetId) {
  try {
    const metadataFilename = `${tweetId}-metadata.json`;
    const metadataPath = path.join(dirs.downloadDir, metadataFilename);
    
    if (!fs.existsSync(metadataPath)) {
      return null;
    }
    
    const metadata = JSON.parse(fs.readFileSync(metadataPath, CONFIG.ENCODING));
    return metadata;
  } catch (error) {
    logError(tweetId, `メタデータの読み込み中にエラーが発生しました: ${error.message}`);
    return null;
  }
}

/**
 * メタデータからメディアURLを抽出
 * @param {object} metadata - メタデータオブジェクト
 * @returns {Array<{url: string, filename: string}>} メディアURLとファイル名のリスト
 */
function extractMediaUrlsFromMetadata(metadata) {
  try {
    const mediaUrls = [];
    
    if (!metadata || !metadata.mediaEntities || !Array.isArray(metadata.mediaEntities)) {
      return mediaUrls;
    }
    
    metadata.mediaEntities.forEach((media, index) => {
      let url = '';
      let filename = '';
      
      if (media.type === 'photo') {
        // 画像の場合は最大解像度のURLを取得
        url = media.media_url_https;
        
        // ファイル名を作成
        const extension = path.extname(url).split('?')[0] || '.jpg';
        filename = `${metadata.tweetId}-${index + 1}${extension}`;
      } 
      else if (media.type === 'video' || media.type === 'animated_gif') {
        // 動画の場合は最高品質のものを取得
        if (media.video_info && media.video_info.variants && Array.isArray(media.video_info.variants)) {
          // ビットレートでソートして最高品質のものを選択
          const videoVariants = media.video_info.variants
            .filter(v => v.content_type === 'video/mp4' && v.bitrate)
            .sort((a, b) => b.bitrate - a.bitrate);
          
          if (videoVariants.length > 0) {
            url = videoVariants[0].url;
            filename = `${metadata.tweetId}-${index + 1}.mp4`;
          }
        }
      }
      
      if (url && filename) {
        mediaUrls.push({ url, filename });
      }
    });
    
    return mediaUrls;
  } catch (error) {
    logError(metadata?.tweetId || 'unknown', `メタデータからメディアURLの抽出中にエラーが発生しました: ${error.message}`);
    return [];
  }
}

/**
 * メタデータ中のメディアURLをorignalサイズに変更
 * @param {string} mediaUrl - メディアURL
 * @returns {string} オリジナルサイズのメディアURL
 */
function getOriginalMediaUrl(mediaUrl) {
  try {
    // すでにoriginalサイズの場合はそのまま返す
    if (mediaUrl.includes('?format=') || mediaUrl.includes('&format=')) {
      return mediaUrl;
    }
    
    // Twitter画像URLの形式であるかを確認
    if (mediaUrl.includes('pbs.twimg.com/media/')) {
      // name.jpg → name?format=jpg&name=orig
      const urlBase = mediaUrl.split('?')[0]; // クエリパラメータを削除
      const extension = path.extname(urlBase).substring(1); // 拡張子（先頭の.を除く）
      
      // 元のURLにoriginalパラメータを追加
      return `${urlBase}?format=${extension}&name=orig`;
    }
    
    // 対応していない形式の場合はそのまま返す
    return mediaUrl;
  } catch (error) {
    logError('unknown', `メディアURLの変換中にエラーが発生しました: ${error.message}`);
    return mediaUrl;
  }
}

module.exports = {
  saveMetadata,
  loadMetadata,
  extractMediaUrlsFromMetadata,
  getOriginalMediaUrl
};