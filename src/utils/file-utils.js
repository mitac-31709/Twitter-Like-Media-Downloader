// filepath: d:\Prog\twitterurldirect\src\utils\file-utils.js
// ファイル操作に関するユーティリティ関数
const fs = require('fs');
const path = require('path');
const { CONFIG, dirs } = require('../config/config');

/**
 * すでにダウンロード済みのツイートIDを確認する（メディアとメタデータを別々に）
 * @returns {Object} メディアIDとメタデータIDのセット
 */
function getDownloadedIds() {
  try {
    const files = fs.readdirSync(dirs.downloadDir);
    const mediaIds = new Set();
    const metadataIds = new Set();
    
    // ファイル名からツイートIDを抽出
    files.forEach(file => {
      // メディアファイル（画像・動画）からのID抽出
      const mediaMatch = file.match(/^(\d+)-\d+/);
      if (mediaMatch && mediaMatch[1]) {
        mediaIds.add(mediaMatch[1]);
      }
      
      // メタデータファイルからのID抽出
      const metadataMatch = file.match(/^(\d+)-metadata\.json$/);
      if (metadataMatch && metadataMatch[1]) {
        metadataIds.add(metadataMatch[1]);
      }
    });
    
    return { mediaIds, metadataIds };
  } catch (error) {
    console.error(`ダウンロード済みのIDを確認中にエラーが発生しました: ${error.message}`);
    return { mediaIds: new Set(), metadataIds: new Set() };
  }
}

/**
 * メタデータファイルから情報を読み込む
 * @param {string} tweetId - ツイートID
 * @returns {Object|null} メタデータオブジェクト（失敗時はnull）
 */
function loadMetadata(tweetId) {
  const fileName = `${tweetId}-metadata.json`;
  const filePath = path.join(dirs.downloadDir, fileName);
  
  if (fs.existsSync(filePath)) {
    try {
      const metadataContent = fs.readFileSync(filePath, CONFIG.ENCODING);
      return JSON.parse(metadataContent);
    } catch (error) {
      console.error(`メタデータの読み込みに失敗しました: ${error.message}`);
      return null;
    }
  }
  
  return null;
}

/**
 * メタデータをJSONファイルとして保存する
 * @param {string} tweetId - ツイートID
 * @param {Object} metadata - 保存するメタデータオブジェクト
 * @returns {string|null} 保存したファイル名（失敗時はnull）
 */
function saveMetadata(tweetId, metadata) {
  const fileName = `${tweetId}-metadata.json`;
  const filePath = path.join(dirs.downloadDir, fileName);
  
  // ファイルが既に存在するか確認
  if (fs.existsSync(filePath)) {
    console.log(`    - ${fileName} (既に存在します)`);
    return fileName;
  }
  
  // メタデータをJSONファイルとして保存
  try {
    fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2), CONFIG.ENCODING);
    console.log(`    - メタデータを保存しました: ${fileName}`);
    return fileName;
  } catch (error) {
    console.error(`    - メタデータの保存に失敗しました: ${error.message}`);
    return null;
  }
}

/**
 * いいねデータをファイルから読み込む
 * @returns {Array|null} いいねデータの配列（失敗時はnull）
 */
function loadLikesData() {
  try {
    // like.jsファイルの読み込み
    const likeFilePath = path.join(path.resolve(__dirname, '../../'), 'like.js');
    const likeFileContent = fs.readFileSync(likeFilePath, CONFIG.ENCODING);

    // Twitterのデータ形式に合わせて、JavaScriptの文字列からJSONを抽出
    // "window.YTD.like.part0 = " の後の配列部分を取得
    const jsonMatch = likeFileContent.match(/window\.YTD\.like\.part0\s*=\s*(\[[\s\S]*\])/);
    if (!jsonMatch || !jsonMatch[1]) {
      console.error('有効なJSONデータが見つかりません');
      return null;
    }

    return JSON.parse(jsonMatch[1]);
  } catch (error) {
    console.error(`いいねデータの読み込みに失敗しました: ${error.message}`);
    return null;
  }
}

module.exports = {
  getDownloadedIds,
  loadMetadata,
  saveMetadata,
  loadLikesData
};