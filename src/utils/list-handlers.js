// スキップリスト管理のユーティリティ関数
const fs = require('fs');
const { CONFIG, dirs } = require('../config/config');

// スキップIDセット
let skipIds = new Set();
// 存在しないツイートのIDセット
let notFoundIds = new Set();
// センシティブコンテンツを含むツイートのIDセット
let sensitiveIds = new Set();
// 解析エラーが発生したツイートのIDセット
let parseErrorIds = new Set();
// メディア（画像・動画）がないツイートのIDセット
let noMediaIds = new Set();

/**
 * すべてのスキップリストを読み込む
 */
function loadSkipLists() {
  try {
    // スキップリスト
    if (fs.existsSync(CONFIG.SKIP_LIST_PATH)) {
      const skipList = JSON.parse(fs.readFileSync(CONFIG.SKIP_LIST_PATH, CONFIG.ENCODING));
      skipList.forEach(id => skipIds.add(id));
      console.log(`スキップリストを読み込みました: ${skipIds.size}件`);
    }
    
    // 存在しないツイートリスト
    if (fs.existsSync(CONFIG.NOT_FOUND_LIST_PATH)) {
      const notFoundList = JSON.parse(fs.readFileSync(CONFIG.NOT_FOUND_LIST_PATH, CONFIG.ENCODING));
      notFoundList.forEach(id => notFoundIds.add(id));
      console.log(`存在しないツイートリストを読み込みました: ${notFoundIds.size}件`);
    }
    
    // センシティブコンテンツリスト
    if (fs.existsSync(CONFIG.SENSITIVE_LIST_PATH)) {
      const sensitiveList = JSON.parse(fs.readFileSync(CONFIG.SENSITIVE_LIST_PATH, CONFIG.ENCODING));
      sensitiveList.forEach(id => sensitiveIds.add(id));
      console.log(`センシティブコンテンツリストを読み込みました: ${sensitiveIds.size}件`);
    }
    
    // 解析エラーリスト
    if (fs.existsSync(CONFIG.PARSE_ERROR_LIST_PATH)) {
      const parseErrorList = JSON.parse(fs.readFileSync(CONFIG.PARSE_ERROR_LIST_PATH, CONFIG.ENCODING));
      parseErrorList.forEach(id => parseErrorIds.add(id));
      console.log(`解析エラーリストを読み込みました: ${parseErrorIds.size}件`);
    }
    
    // メディア（画像・動画）がないツイートリスト
    if (fs.existsSync(CONFIG.NO_MEDIA_LIST_PATH)) {
      const noMediaList = JSON.parse(fs.readFileSync(CONFIG.NO_MEDIA_LIST_PATH, CONFIG.ENCODING));
      noMediaList.forEach(id => noMediaIds.add(id));
      console.log(`メディアがないツイートリストを読み込みました: ${noMediaIds.size}件`);
    }
  } catch (e) {
    console.error(`スキップリストの読み込み中にエラーが発生しました: ${e.message}`);
  }
}

/**
 * スキップリストを保存する
 */
function saveSkipList() {
  try {
    // ディレクトリが存在しない場合は作成
    if (!fs.existsSync(dirs.logsDir)) {
      fs.mkdirSync(dirs.logsDir, { recursive: true });
    }
    
    fs.writeFileSync(CONFIG.SKIP_LIST_PATH, JSON.stringify([...skipIds], null, 2));
  } catch (e) {
    console.error(`スキップリストの保存中にエラーが発生しました: ${e.message}`);
  }
}

/**
 * 存在しないツイートリストを保存する
 */
function saveNotFoundList() {
  try {
    // ディレクトリが存在しない場合は作成
    if (!fs.existsSync(dirs.logsDir)) {
      fs.mkdirSync(dirs.logsDir, { recursive: true });
    }
    
    fs.writeFileSync(CONFIG.NOT_FOUND_LIST_PATH, JSON.stringify([...notFoundIds], null, 2));
  } catch (e) {
    console.error(`存在しないツイートリストの保存中にエラーが発生しました: ${e.message}`);
  }
}

/**
 * センシティブコンテンツリストを保存する
 */
function saveSensitiveList() {
  try {
    // ディレクトリが存在しない場合は作成
    if (!fs.existsSync(dirs.logsDir)) {
      fs.mkdirSync(dirs.logsDir, { recursive: true });
    }
    
    fs.writeFileSync(CONFIG.SENSITIVE_LIST_PATH, JSON.stringify([...sensitiveIds], null, 2));
  } catch (e) {
    console.error(`センシティブコンテンツリストの保存中にエラーが発生しました: ${e.message}`);
  }
}

/**
 * 解析エラーリストを保存する
 */
function saveParseErrorList() {
  try {
    // ディレクトリが存在しない場合は作成
    if (!fs.existsSync(dirs.logsDir)) {
      fs.mkdirSync(dirs.logsDir, { recursive: true });
    }
    
    fs.writeFileSync(CONFIG.PARSE_ERROR_LIST_PATH, JSON.stringify([...parseErrorIds], null, 2));
  } catch (e) {
    console.error(`解析エラーリストの保存中にエラーが発生しました: ${e.message}`);
  }
}

/**
 * メディアがないツイートリストを保存する
 */
function saveNoMediaList() {
  try {
    // ディレクトリが存在しない場合は作成
    if (!fs.existsSync(dirs.logsDir)) {
      fs.mkdirSync(dirs.logsDir, { recursive: true });
    }
    
    fs.writeFileSync(CONFIG.NO_MEDIA_LIST_PATH, JSON.stringify([...noMediaIds], null, 2));
  } catch (e) {
    console.error(`メディアがないツイートリストの保存中にエラーが発生しました: ${e.message}`);
  }
}

/**
 * スキップリストに追加
 * @param {string} tweetId - ツイートID
 */
function addToSkipList(tweetId) {
  skipIds.add(tweetId);
  saveSkipList();
}

/**
 * 存在しないツイートリストに追加
 * @param {string} tweetId - ツイートID
 */
function addToNotFoundList(tweetId) {
  notFoundIds.add(tweetId);
  saveNotFoundList();
}

/**
 * センシティブコンテンツリストに追加
 * @param {string} tweetId - ツイートID
 */
function addToSensitiveList(tweetId) {
  sensitiveIds.add(tweetId);
  saveSensitiveList();
}

/**
 * 解析エラーリストに追加
 * @param {string} tweetId - ツイートID
 */
function addToParseErrorList(tweetId) {
  parseErrorIds.add(tweetId);
  saveParseErrorList();
}

/**
 * メディアがないツイートリストに追加
 * @param {string} tweetId - ツイートID
 */
function addToNoMediaList(tweetId) {
  noMediaIds.add(tweetId);
  saveNoMediaList();
}

/**
 * スキップリストの現在のサイズを取得
 * @returns {Object} 各リストのサイズ
 */
function getListSizes() {
  return {
    skipIds: skipIds.size,
    notFoundIds: notFoundIds.size,
    sensitiveIds: sensitiveIds.size,
    parseErrorIds: parseErrorIds.size,
    noMediaIds: noMediaIds.size
  };
}

/**
 * ツイートがスキップリストに含まれているか確認
 * @param {string} tweetId - ツイートID
 * @returns {boolean} いずれかのリストに含まれていればtrue
 */
function isTweetInAnySkipList(tweetId) {
  return skipIds.has(tweetId) || 
         notFoundIds.has(tweetId) || 
         sensitiveIds.has(tweetId) || 
         parseErrorIds.has(tweetId) ||
         noMediaIds.has(tweetId);
}

/**
 * ツイートがどのスキップリストに含まれているか確認
 * @param {string} tweetId - ツイートID
 * @returns {Object} 各リストの有無
 */
function checkTweetInLists(tweetId) {
  return {
    inSkipList: skipIds.has(tweetId),
    inNotFoundList: notFoundIds.has(tweetId),
    inSensitiveList: sensitiveIds.has(tweetId),
    inParseErrorList: parseErrorIds.has(tweetId),
    inNoMediaList: noMediaIds.has(tweetId)
  };
}

module.exports = {
  loadSkipLists,
  saveSkipList,
  saveNotFoundList,
  saveSensitiveList,
  saveParseErrorList,
  saveNoMediaList,
  addToSkipList,
  addToNotFoundList,
  addToSensitiveList,
  addToParseErrorList,
  addToNoMediaList,
  getListSizes,
  isTweetInAnySkipList,
  checkTweetInLists,
  // セットも直接アクセスできるように公開
  skipIds,
  notFoundIds,
  sensitiveIds,
  parseErrorIds,
  noMediaIds
};