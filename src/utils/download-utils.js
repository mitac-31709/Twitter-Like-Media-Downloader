// メディアダウンロードに関するユーティリティ関数
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { dirs } = require('../config/config');
const { sleep } = require('./error-handlers');

/**
 * メディアをダウンロードして保存する
 * @param {string} mediaUrl - ダウンロードするメディアのURL
 * @param {string} tweetId - ツイートID
 * @param {number} index - メディアのインデックス
 * @returns {Promise<string|null>} ファイル名またはnull（失敗時）
 */
async function downloadMedia(mediaUrl, tweetId, index) {
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
      console.log(`    - ${fileName} (既に存在します)`);
      return fileName;
    }

    // 画像をダウンロード
    const response = await axios({
      method: 'GET',
      url: mediaUrl,
      responseType: 'stream',
      timeout: 10000, // 10秒タイムアウト
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    // ファイルに保存
    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(fileName));
      writer.on('error', reject);
      response.data.on('error', reject);
    });
  } catch (error) {
    console.error(`    - ダウンロードエラー: ${mediaUrl} - ${error.message}`);
    return null; // エラーの場合はnullを返す
  }
}

/**
 * メタデータからメディアをダウンロードする
 * @param {string} tweetId - ツイートID
 * @param {Object} metadata - メディアを含むメタデータオブジェクト
 * @returns {Promise<Array>} ダウンロードされたファイル名の配列
 */
async function downloadMediaFromMetadata(tweetId, metadata) {
  if (!metadata || !metadata.media || metadata.media.length === 0) {
    console.log('    - メタデータにメディア情報がありません');
    return [];
  }
  
  console.log(`  ✅ メタデータからメディアが見つかりました: ${metadata.media.length}個`);
  
  const downloadPromises = [];
  let mediaCount = 0;
  
  // メディアの種類に応じてダウンロード
  for (const media of metadata.media) {
    if (media.type === 'photo' && media.image) {
      // 写真の場合
      downloadPromises.push(downloadMedia(media.image, tweetId, ++mediaCount));
    } else if (media.type === 'video' && media.videos && media.videos.length > 0) {
      // 動画の場合、最高品質の動画をダウンロード
      const bestVideo = media.videos.reduce((prev, current) => 
        (prev.bitrate > current.bitrate) ? prev : current
      );
      downloadPromises.push(downloadMedia(bestVideo.url, tweetId, ++mediaCount));
    } else if (media.type === 'animated_gif' && media.videos && media.videos.length > 0) {
      // GIFの場合
      downloadPromises.push(downloadMedia(media.videos[0].url, tweetId, ++mediaCount));
    } else {
      console.log(`    - サポートされていないメディアタイプ: ${media.type}`);
    }
  }
  
  // すべてのダウンロードを待機
  const results = await Promise.all(downloadPromises);
  // nullを除外して実際にダウンロードされたファイル名だけを取得
  const downloadedFiles = results.filter(result => result !== null);
  
  if (downloadedFiles.length > 0) {
    console.log(`  ✅ ${downloadedFiles.length}個のメディアをダウンロードしました`);
  } else {
    console.log('  ⚠️ メディアのダウンロードに失敗しました');
  }
  
  return downloadedFiles;
}

module.exports = {
  downloadMedia,
  downloadMediaFromMetadata
};