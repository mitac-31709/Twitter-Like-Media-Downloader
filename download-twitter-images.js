// Twitterのいいねから画像とメタデータをダウンロードするスクリプト
const fs = require('fs');
const path = require('path');
const { TwitterDL } = require('twitter-downloader');
const axios = require('axios');
const cliProgress = require('cli-progress');

// プログレスバーの作成
const multibar = new cliProgress.MultiBar({
  clearOnComplete: false,
  format: '{bar} {percentage}% | {value}/{total} | {status}',
  hideCursor: true,
  barCompleteChar: '\u2588',
  barIncompleteChar: '\u2591',
}, cliProgress.Presets.shades_classic);

// ダウンロード先のディレクトリを作成
const downloadDir = path.join(__dirname, 'downloaded_images');
if (!fs.existsSync(downloadDir)) {
  fs.mkdirSync(downloadDir);
}

// エラーログを保存するディレクトリ
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// 設定
const CONFIG = {
  // リトライ回数
  MAX_RETRIES: 3,
  // リトライ間の待機時間(ミリ秒)
  RETRY_DELAY: 5000,
  // API呼び出し間の待機時間(ミリ秒)
  API_CALL_DELAY: 1500,
  // エラーが多発した場合の待機時間(ミリ秒)
  ERROR_COOLDOWN: 60000,
  // エラー記録用のファイル
  ERROR_LOG_FILE: path.join(logsDir, `error-log-${new Date().toISOString().replace(/:/g, '-')}.json`),
  // 処理をスキップするツイートIDを記録するファイル
  SKIP_LIST_PATH: path.join(logsDir, 'skip-ids.json'),
  // 存在しないツイートのIDを記録するファイル
  NOT_FOUND_LIST_PATH: path.join(logsDir, 'not-found-ids.json'),
  // センシティブコンテンツを含むツイートのIDを記録するファイル
  SENSITIVE_LIST_PATH: path.join(logsDir, 'sensitive-ids.json'),
  // デバッグモード (詳細情報を表示)
  DEBUG: true
};

// スキップIDセット（グローバル変数として定義）
let skipIds = new Set();
// 存在しないツイートのIDセット（グローバル変数として定義）
let notFoundIds = new Set();
// センシティブコンテンツを含むツイートのIDセット（グローバル変数として定義）
let sensitiveIds = new Set();

// エラーログの記録
let errorLog = [];
function logError(tweetId, url, error, errorType = 'other') {
  try {
    const timestamp = new Date().toISOString();
    
    // エラーオブジェクト作成
    const errorObj = {
      timestamp,
      tweetId,
      url,
      error: error.message || (typeof error === 'string' ? error : JSON.stringify(error)),
      errorType, // エラーの種類を追加 (not_found, sensitive_content, api, parse, other)
      isNotFound: errorType === 'not_found', // 後方互換性のため
      stack: error.stack || new Error().stack
    };
    
    // ロギング
    errorLog.push(errorObj);
    
    // 定期的に保存（20件ごと）
    if (errorLog.length >= 20) {
      saveErrorLogs();
    }
  } catch (e) {
    console.error(`エラーログの記録中にエラーが発生しました: ${e.message}`);
  }
}

// エラーログの保存
function saveErrorLogs() {
  try {
    if (errorLog.length === 0) return;
    
    // ログディレクトリが存在しない場合は作成
    if (!fs.existsSync('./logs')) {
      fs.mkdirSync('./logs', { recursive: true });
    }
    
    // 新しいログファイルを作成（タイムスタンプ付き）
    const now = new Date().toISOString().replace(/:/g, '-');
    const logFilePath = `./logs/error-log-${now}.json`;
    
    fs.writeFileSync(logFilePath, JSON.stringify(errorLog, null, 2));
    console.log(`エラーログを保存しました: ${logFilePath}`);
    
    // ログリストをクリア
    errorLog = [];
  } catch (e) {
    console.error(`エラーログの保存中にエラーが発生しました: ${e.message}`);
  }
}

// スキップリストの読み込み
function loadSkipLists() {
  try {
    // スキップリスト
    if (fs.existsSync(CONFIG.SKIP_LIST_PATH)) {
      const skipList = JSON.parse(fs.readFileSync(CONFIG.SKIP_LIST_PATH, 'utf8'));
      skipList.forEach(id => skipIds.add(id));
      console.log(`スキップリストを読み込みました: ${skipIds.size}件`);
    }
    
    // 存在しないツイートリスト
    if (fs.existsSync(CONFIG.NOT_FOUND_LIST_PATH)) {
      const notFoundList = JSON.parse(fs.readFileSync(CONFIG.NOT_FOUND_LIST_PATH, 'utf8'));
      notFoundList.forEach(id => notFoundIds.add(id));
      console.log(`存在しないツイートリストを読み込みました: ${notFoundIds.size}件`);
    }
    
    // センシティブコンテンツリスト
    if (fs.existsSync(CONFIG.SENSITIVE_LIST_PATH)) {
      const sensitiveList = JSON.parse(fs.readFileSync(CONFIG.SENSITIVE_LIST_PATH, 'utf8'));
      sensitiveList.forEach(id => sensitiveIds.add(id));
      console.log(`センシティブコンテンツリストを読み込みました: ${sensitiveIds.size}件`);
    }
  } catch (e) {
    console.error(`スキップリストの読み込み中にエラーが発生しました: ${e.message}`);
  }
}

// スキップリストの保存
function saveSkipList(skipIds) {
  try {
    // ディレクトリが存在しない場合は作成
    if (!fs.existsSync('./logs')) {
      fs.mkdirSync('./logs', { recursive: true });
    }
    
    fs.writeFileSync(CONFIG.SKIP_LIST_PATH, JSON.stringify([...skipIds], null, 2));
  } catch (e) {
    console.error(`スキップリストの保存中にエラーが発生しました: ${e.message}`);
  }
}

// Not Found リストの保存
function saveNotFoundList(notFoundIds) {
  try {
    // ディレクトリが存在しない場合は作成
    if (!fs.existsSync('./logs')) {
      fs.mkdirSync('./logs', { recursive: true });
    }
    
    fs.writeFileSync(CONFIG.NOT_FOUND_LIST_PATH, JSON.stringify([...notFoundIds], null, 2));
  } catch (e) {
    console.error(`存在しないツイートリストの保存中にエラーが発生しました: ${e.message}`);
  }
}

// センシティブコンテンツリストの保存
function saveSensitiveList(sensitiveIds) {
  try {
    // ディレクトリが存在しない場合は作成
    if (!fs.existsSync('./logs')) {
      fs.mkdirSync('./logs', { recursive: true });
    }
    
    fs.writeFileSync(CONFIG.SENSITIVE_LIST_PATH, JSON.stringify([...sensitiveIds], null, 2));
  } catch (e) {
    console.error(`センシティブコンテンツリストの保存中にエラーが発生しました: ${e.message}`);
  }
}

// スキップリストに追加
function addToSkipList(tweetId) {
  skipIds.add(tweetId);
  saveSkipList(skipIds);
}

// 存在しないツイートリストに追加
function addToNotFoundList(tweetId) {
  notFoundIds.add(tweetId);
  saveNotFoundList(notFoundIds);
}

// センシティブコンテンツリストに追加
function addToSensitiveList(tweetId) {
  sensitiveIds.add(tweetId);
  saveSensitiveList(sensitiveIds);
}

// like.jsファイルの読み込み
const likeFilePath = path.join(__dirname, 'like.js');
const likeFileContent = fs.readFileSync(likeFilePath, 'utf8');

// Twitterのデータ形式に合わせて、JavaScriptの文字列からJSONを抽出
// "window.YTD.like.part0 = " の後の配列部分を取得
const jsonMatch = likeFileContent.match(/window\.YTD\.like\.part0\s*=\s*(\[[\s\S]*\])/);
if (!jsonMatch || !jsonMatch[1]) {
  console.error('有効なJSONデータが見つかりません');
  process.exit(1);
}

const likesData = JSON.parse(jsonMatch[1]);

// すでにダウンロード済みのツイートIDを確認（メディアとメタデータを別々に）
function getDownloadedIds() {
  const files = fs.readdirSync(downloadDir);
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
}

// 既存のメタデータファイルから情報を読み込む関数
function loadMetadata(tweetId) {
  const fileName = `${tweetId}-metadata.json`;
  const filePath = path.join(downloadDir, fileName);
  
  if (fs.existsSync(filePath)) {
    try {
      const metadataContent = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(metadataContent);
    } catch (error) {
      console.error(`    - メタデータの読み込みに失敗しました: ${error.message}`);
      return null;
    }
  }
  
  return null;
}

// メタデータをJSONファイルとして保存する関数
function saveMetadata(tweetId, metadata) {
  const fileName = `${tweetId}-metadata.json`;
  const filePath = path.join(downloadDir, fileName);
  
  // ファイルが既に存在するか確認
  if (fs.existsSync(filePath)) {
    console.log(`    - ${fileName} (既に存在します)`);
    return fileName;
  }
  
  // メタデータをJSONファイルとして保存
  try {
    fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2), 'utf8');
    console.log(`    - メタデータを保存しました: ${fileName}`);
    return fileName;
  } catch (error) {
    console.error(`    - メタデータの保存に失敗しました: ${error.message}`);
    return null;
  }
}

// 画像をダウンロードして保存する関数
async function downloadMedia(mediaUrl, tweetId, index) {
  try {
    // URLからファイル拡張子を取得
    let fileExtension = path.extname(new URL(mediaUrl).pathname);
    // 拡張子がなければデフォルトで.jpgを使用
    if (!fileExtension || fileExtension === '.') {
      fileExtension = '.jpg';
    }
    
    const fileName = `${tweetId}-${index}${fileExtension}`;
    const filePath = path.join(downloadDir, fileName);
    
    // ファイルが既に存在するか確認
    if (fs.existsSync(filePath)) {
      console.log(`    - ${fileName} (既に存在します)`);
      return fileName;
    }

    // プログレスバー用の変数
    let downloadedBytes = 0;
    let totalBytes = 0;
    const progressBar = multibar.create(100, 0, { status: `ダウンロード中: ${fileName}` });

    // 画像をダウンロード
    const response = await axios({
      method: 'GET',
      url: mediaUrl,
      responseType: 'stream',
      timeout: 10000, // 10秒タイムアウト
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      onDownloadProgress: (progressEvent) => {
        // レスポンスヘッダーからファイルサイズを取得
        if (totalBytes === 0 && progressEvent.total) {
          totalBytes = progressEvent.total;
          progressBar.setTotal(totalBytes);
        }
        
        // ダウンロード済みバイト数を更新
        downloadedBytes = progressEvent.loaded;
        
        // プログレスバーを更新
        if (totalBytes > 0) {
          const percentage = Math.floor((downloadedBytes / totalBytes) * 100);
          progressBar.update(downloadedBytes, { status: `${fileName} (${percentage}%)` });
        } else {
          // ファイルサイズが不明の場合
          progressBar.update(downloadedBytes, { status: `${fileName} (サイズ不明)` });
        }
      }
    });
    
    // レスポンスヘッダーからファイルサイズを取得（onDownloadProgressが動作しない場合のフォールバック）
    if (response.headers['content-length']) {
      totalBytes = parseInt(response.headers['content-length'], 10);
      progressBar.setTotal(totalBytes);
    }
    
    // ファイルに保存
    const writer = fs.createWriteStream(filePath);
    
    // ダウンロード中のデータチャンクを監視し、プログレスバーを更新
    response.data.on('data', chunk => {
      downloadedBytes += chunk.length;
      if (totalBytes > 0) {
        progressBar.update(downloadedBytes);
      } else {
        // ファイルサイズが不明の場合、増分だけを表示
        progressBar.update(downloadedBytes, { status: `${fileName} (${(downloadedBytes / 1024).toFixed(1)} KB)` });
      }
    });
    
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        progressBar.update(totalBytes || downloadedBytes, { status: `完了: ${fileName}` });
        resolve(fileName);
      });
      writer.on('error', err => {
        progressBar.stop();
        reject(err);
      });
      response.data.on('error', err => {
        progressBar.stop();
        reject(err);
      });
    });
  } catch (error) {
    console.error(`    - ダウンロードエラー: ${mediaUrl} - ${error.message}`);
    return null; // エラーの場合はnullを返す
  }
}

// メタデータからメディアをダウンロードする関数
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

// APIを呼び出す関数（リトライ機能付き）
async function callTwitterAPI(tweetUrl, retryCount = 0) {
  try {
    const result = await TwitterDL(tweetUrl);
    
    // レスポンスの詳細をデバッグ表示
    if (CONFIG.DEBUG && result) {
      console.log(`  🔍 APIレスポンス: ${JSON.stringify(result).substring(0, 200)}...`);
    }
    
    return result;
  } catch (error) {
    console.error(`  ⚠️ API呼び出しエラー: ${error.message || '理由不明'} (試行回数: ${retryCount + 1}/${CONFIG.MAX_RETRIES + 1})`);
    
    // エラーオブジェクトの詳細情報を出力
    if (CONFIG.DEBUG) {
      console.error(`  🔍 エラー詳細: ${JSON.stringify(error, Object.getOwnPropertyNames(error)).substring(0, 300)}...`);
    }
    
    // エラータイプの特定
    const isNotFound = error.message && error.message.includes('Tweet not found');
    const isSensitiveContent = error.message && error.message.includes('sensitive content');
    const isAuthError = error.message && error.message.includes('Authorization');
    const isParseError = error.message && error.message.includes('Cannot read properties of undefined');
    
    // エラータイプをプロパティとして設定
    if (isNotFound) {
      error.errorType = 'not_found';
      throw error;
    } else if (isSensitiveContent) {
      error.errorType = 'sensitive_content';
      throw error;
    } else if (isParseError) {
      error.errorType = 'parse_error';
      throw error;
    } else if (isAuthError) {
      console.error(`  🔑 認証エラーが発生しました。TwitterDLの認証情報が無効になっている可能性があります。`);
      error.errorType = 'api';
    } else {
      error.errorType = 'api'; // その他のAPIエラー
    }
    
    // 最大リトライ回数に達していない場合はリトライ
    if (retryCount < CONFIG.MAX_RETRIES) {
      console.log(`  ⏱️ ${CONFIG.RETRY_DELAY / 1000}秒後にリトライします...`);
      await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));
      return callTwitterAPI(tweetUrl, retryCount + 1);
    }
    
    // リトライ回数を超えたらエラーを投げる
    throw error;
  }
}

// 待機関数（処理を一時停止する）
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 各いいねから画像をダウンロード
async function downloadAllImages() {
  console.log(`合計 ${likesData.length} 件のいいねを処理します...`);
  
  // すでにダウンロード済みのツイートIDを取得（メディアとメタデータを別々に）
  const { mediaIds, metadataIds } = getDownloadedIds();
  console.log(`既存のダウンロード済みメディア: ${mediaIds.size}件`);
  console.log(`既存の保存済みメタデータ: ${metadataIds.size}件`);
  
  // スキップリストを読み込む
  loadSkipLists();
  console.log(`スキップリストのツイート: ${skipIds.size}件`);
  console.log(`存在しないツイートリスト: ${notFoundIds.size}件`);
  console.log(`センシティブコンテンツリスト: ${sensitiveIds.size}件`);
  
  // 全体進捗を表示するプログレスバー
  const totalProgressBar = multibar.create(likesData.length, 0, { 
    status: `全体の進捗: 0/${likesData.length} ツイート処理中...` 
  });
  
  // エラーカウンター（連続APIエラーを検出するため）
  let consecutiveApiErrorCount = 0;
  
  for (let i = 0; i < likesData.length; i++) {
    const likeItem = likesData[i].like;
    const tweetId = likeItem.tweetId;
    const tweetUrl = likeItem.expandedUrl || `https://twitter.com/i/web/status/${tweetId}`;
    
    // プログレスバーにステータスを表示
    totalProgressBar.update(i, { status: `全体の進捗: ${i}/${likesData.length} - 処理中: ${tweetId}` });
    
    console.log(`[${i+1}/${likesData.length}] ツイート処理中: ${tweetId}`);
    
		// スキップリストにあるツイートは以前スキップされていたことを表示するが、処理は続行
		if (skipIds.has(tweetId)) {
			console.log(`  🔄 このツイートは以前エラーが発生しましたが、再試行します。`);
		}
    
    // 存在しないツイートリストにあるツイートはスキップ
    if (notFoundIds.has(tweetId)) {
      console.log(`  ⏭️ このツイートは存在しないためスキップします。`);
      totalProgressBar.increment();
      continue;
    }
    
    // センシティブコンテンツリストにあるツイートはスキップ
    if (sensitiveIds.has(tweetId)) {
      console.log(`  ⏭️ このツイートはセンシティブコンテンツを含むためスキップします。`);
      totalProgressBar.increment();
      continue;
    }
    
    // メディアとメタデータの存在確認
    const hasMedia = mediaIds.has(tweetId);
    const hasMetadata = metadataIds.has(tweetId);
    
    // 両方ともダウンロード済みの場合はスキップ
    if (hasMedia && hasMetadata) {
      console.log(`  ⏭️ このツイートの画像とメタデータは両方既に保存済みです。スキップします。`);
      totalProgressBar.increment();
      continue;
    }
    
    // メタデータがあって画像がない場合は、メタデータファイルから情報を読み込む
    if (hasMetadata && !hasMedia) {
      console.log(`  🔄 メタデータが存在します。APIを使わずにメディアをダウンロードします。`);
      const metadata = loadMetadata(tweetId);
      if (metadata) {
        try {
          await downloadMediaFromMetadata(tweetId, metadata);
          // エラーカウンターをリセット（成功したため）
          consecutiveApiErrorCount = 0;
          totalProgressBar.increment();
          continue; // このツイートの処理を完了
        } catch (error) {
          console.error(`  ❌ メタデータからのダウンロードに失敗しました: ${error.message}`);
          // エラーは記録するが、スキップリストには追加しない（後でもう一度試せるように）
          logError(tweetId, tweetUrl, error, 'media_download');
        }
      } else {
        console.log(`  ⚠️ メタデータの読み込みに失敗しました。APIを使用します。`);
      }
    }
    
    // それ以外の場合は、API経由で情報を取得
    try {
      // TwitterDL関数を使用してツイート情報を取得（リトライ機能付き）
      const result = await callTwitterAPI(tweetUrl);
      
      if (result.status === 'success' && result.result) {
        // メタデータの保存（まだ保存されていない場合）
        if (!hasMetadata) {
          saveMetadata(tweetId, result.result);
        } else {
          console.log(`  ⏭️ メタデータは既に保存済みです。`);
        }
        
        // メディアのダウンロード（まだダウンロードされていない場合）
        if (!hasMedia && result.result.media && result.result.media.length > 0) {
          console.log(`  ✅ メディアが見つかりました: ${result.result.media.length}個`);
          
          const downloadPromises = [];
          let mediaCount = 0;
          
          // メディアの種類に応じてダウンロード
          for (const media of result.result.media) {
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
          console.log(`  ✅ ${downloadedFiles.length}個のメディアをダウンロードしました`);
        } else if (hasMedia) {
          console.log(`  ⏭️ メディアは既にダウンロード済みです。`);
        } else if (!result.result.media || result.result.media.length === 0) {
          console.log('  ⚠️ このツイートにはメディアが含まれていません。');
        }
        
        // 処理が成功したのでエラーカウンターをリセット
        consecutiveApiErrorCount = 0;
      } else {
        // エラーメッセージをより詳細に表示
        const errorMsg = result.message || 
                         (result.error ? JSON.stringify(result.error) : '不明なエラー');
        console.log(`  ❌ ツイート情報の取得に失敗しました: ${errorMsg}`);
        
        // エラーの種類に応じて適切なリストに追加
        if (errorMsg.includes('Tweet not found') || errorMsg.includes('ツイートが見つかりません')) {
          addToNotFoundList(tweetId);
          logError(tweetId, tweetUrl, new Error(errorMsg), 'not_found');
        } else if (errorMsg.includes('sensitive content') || errorMsg.includes('センシティブなコンテンツ')) {
          addToSensitiveList(tweetId);
          logError(tweetId, tweetUrl, new Error(errorMsg), 'sensitive_content');
        } else {
          // その他のエラーはスキップリストに追加
          addToSkipList(tweetId);
          logError(tweetId, tweetUrl, new Error(errorMsg), 'api');
          // APIエラーカウンターを増加
          consecutiveApiErrorCount++;
        }
      }
    } catch (error) {
      // エラータイプの確認（callTwitterAPIで設定されるか、ここで推測）
      const errorType = error.errorType || 
                        (error.message && error.message.includes('Tweet not found') ? 'not_found' : 
                        (error.message && error.message.includes('sensitive content') ? 'sensitive_content' : 
                        (error.message && error.message.includes('properties of undefined') ? 'parse' : 'other')));
      
      // エラータイプに応じた処理
      if (errorType === 'not_found') {
        console.log(`  ❌ ツイート情報の取得に失敗しました: Tweet not found! (このツイートは存在しないため次回からスキップします)`);
        // 存在しないツイートをリストに追加
        addToNotFoundList(tweetId);
        // エラーをログに記録
        logError(tweetId, tweetUrl, error, 'not_found');
        // エラーカウンターは増やさない（存在しないツイートはAPIエラー扱いしない）
      } else if (errorType === 'sensitive_content') {
        console.log(`  ❌ ツイート情報の取得に失敗しました: センシティブなコンテンツが含まれています (このツイートは次回からスキップします)`);
        // センシティブコンテンツを含むツイートをリストに追加
        addToSensitiveList(tweetId);
        // エラーをログに記録
        logError(tweetId, tweetUrl, error, 'sensitive_content');
        // エラーカウンターは増やさない（センシティブコンテンツはAPIエラー扱いしない）
      } else if (errorType === 'parse') {
        console.log(`  ❌ ツイート情報の解析に失敗しました: ${error.message || error.toString() || '理由不明'}`);
        // 失敗したツイートをスキップリストに追加
        addToSkipList(tweetId);
        // エラーをログに記録
        logError(tweetId, tweetUrl, error, 'parse');
        // エラーカウンターは増やさない（パースエラーはAPIエラー扱いしない）
      } else if (errorType === 'api') {
        console.log(`  ❌ API呼び出しに失敗しました: ${error.message || error.toString() || '理由不明'}`);
        // 失敗したツイートをスキップリストに追加
        addToSkipList(tweetId);
        // エラーをログに記録
        logError(tweetId, tweetUrl, error, 'api');
        // APIエラーカウンターを増加
        consecutiveApiErrorCount++;
      } else {
        console.log(`  ❌ エラーが発生しました: ${error.message || error.toString() || '理由不明'}`);
        // 失敗したツイートをスキップリストに追加
        addToSkipList(tweetId);
        // エラーをログに記録
        logError(tweetId, tweetUrl, error, 'other');
        // その他のエラーはカウントに含めない
      }
    }
    
    // 連続APIエラーが3回以上発生した場合は長めに待機
    if (consecutiveApiErrorCount >= 3) {
      console.log(`⚠️ 連続して${consecutiveApiErrorCount}回のAPIエラーが発生しました。${CONFIG.ERROR_COOLDOWN / 1000}秒間待機します...`);
      await sleep(CONFIG.ERROR_COOLDOWN);
      // エラーカウンターをリセット
      consecutiveApiErrorCount = 0;
    } else {
      // 通常のAPIの制限を避けるための待機
      await sleep(CONFIG.API_CALL_DELAY);
    }
    
    // ツイート処理完了後、プログレスバーを更新
    totalProgressBar.increment();
  }
  
  // プログレスバーを完了表示にする
  totalProgressBar.update(likesData.length, { status: `完了: ${likesData.length}/${likesData.length} ツイートを処理しました` });
  
  // 最終結果を表示
  console.log('すべてのダウンロードが完了しました！');
  console.log(`スキップリストのツイート数: ${skipIds.size}件`);
  console.log(`存在しないツイート数: ${notFoundIds.size}件`);
  console.log(`センシティブコンテンツ数: ${sensitiveIds.size}件`);
  
  // プログレスバーを停止
  multibar.stop();
}

// メイン処理を実行
downloadAllImages().catch(err => {
  console.error('致命的なエラーが発生しました:', err);
  // エラーをログに記録
  logError('main', 'main process', err);
});