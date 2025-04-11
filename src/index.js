// Twitterのいいねから画像とメタデータをダウンロードするメインスクリプト
const { CONFIG } = require('./config/config');
const { loadLikesData, getDownloadedIds } = require('./utils/file-utils');
const { loadSkipLists, getListSizes, notFoundIds, sensitiveIds } = require('./utils/list-handlers');
const { processTweetMedia } = require('./services/media-service');
const { sleep, saveErrorLogs } = require('./utils/error-handlers');

/**
 * 各いいねから画像をダウンロード
 */
async function downloadAllImages() {
  // いいねデータの読み込み
  const likesData = loadLikesData();
  if (!likesData) {
    console.error('いいねデータの読み込みに失敗しました。');
    process.exit(1);
  }
  
  console.log(`合計 ${likesData.length} 件のいいねを処理します...`);
  
  // すでにダウンロード済みのツイートIDを取得（メディアとメタデータを別々に）
  const { mediaIds, metadataIds } = getDownloadedIds();
  console.log(`既存のダウンロード済みメディア: ${mediaIds.size}件`);
  console.log(`既存の保存済みメタデータ: ${metadataIds.size}件`);
  
  // スキップリストを読み込む
  loadSkipLists();
  const listSizes = getListSizes();
  console.log(`スキップリストのツイート: ${listSizes.skipIds}件`);
  console.log(`存在しないツイートリスト: ${listSizes.notFoundIds}件`);
  console.log(`センシティブコンテンツリスト: ${listSizes.sensitiveIds}件`);
  console.log(`解析エラーリスト: ${listSizes.parseErrorIds}件`);
  
  // エラーカウンター（連続APIエラーを検出するため）
  let consecutiveApiErrorCount = 0;
  
  for (let i = 0; i < likesData.length; i++) {
    const likeItem = likesData[i].like;
    const tweetId = likeItem.tweetId;
    const tweetUrl = likeItem.expandedUrl || `https://twitter.com/i/web/status/${tweetId}`;
    
    console.log(`[${i+1}/${likesData.length}] ツイート処理中: ${tweetId}`);
    
    // 存在しないツイートリストにあるツイートはスキップ
    if (notFoundIds.has(tweetId)) {
      console.log(`  ⏭️ このツイートは存在しないためスキップします。`);
      continue;
    }
    
    // センシティブコンテンツリストにあるツイートはスキップ
    if (sensitiveIds.has(tweetId)) {
      console.log(`  ⏭️ このツイートはセンシティブコンテンツを含むためスキップします。`);
      continue;
    }
    
    // メディアとメタデータの存在確認
    const hasMedia = mediaIds.has(tweetId);
    const hasMetadata = metadataIds.has(tweetId);
    
    // 両方ともダウンロード済みの場合はスキップ
    if (hasMedia && hasMetadata) {
      console.log(`  ⏭️ このツイートの画像とメタデータは両方既に保存済みです。スキップします。`);
      continue;
    }
    
    // ツイートメディアの処理
    const processResult = await processTweetMedia(tweetId, tweetUrl, { hasMedia, hasMetadata });
    
    // メタデータからのダウンロードかAPIからのダウンロードかを判定
    const usedAPI = processResult.usedAPI;
    
    if (usedAPI) {
      // API呼び出しエラーの場合はカウンターを増加
      if (processResult.errorType === 'api') {
        consecutiveApiErrorCount++;
      } else {
        // エラーでなければカウンターをリセット
        consecutiveApiErrorCount = 0;
      }
      
      // 連続APIエラーが3回以上発生した場合は長めに待機
      if (consecutiveApiErrorCount >= 3) {
        console.log(`⚠️ 連続して${consecutiveApiErrorCount}回のAPIエラーが発生しました。${CONFIG.ERROR_COOLDOWN / 1000}秒間待機します...`);
        await sleep(CONFIG.ERROR_COOLDOWN);
        // エラーカウンターをリセット
        consecutiveApiErrorCount = 0;
      } else {
        // APIを使用した場合のみ待機（制限を避けるため）
        console.log(`  ⏱️ APIの制限を避けるため ${CONFIG.API_CALL_DELAY / 1000}秒間待機します...`);
        await sleep(CONFIG.API_CALL_DELAY);
      }
    } else {
      // APIを使用しなかった場合は待機しない
      console.log('  ✅ APIを使用しなかったため、待機せずに次の処理に進みます');
    }
  }
  
  // 実行完了後に最終ログを保存
  saveErrorLogs();
  
  // 最終結果を表示
  const finalListSizes = getListSizes();
  console.log('すべてのダウンロードが完了しました！');
  console.log(`スキップリストのツイート数: ${finalListSizes.skipIds}件`);
  console.log(`存在しないツイート数: ${finalListSizes.notFoundIds}件`);
  console.log(`センシティブコンテンツ数: ${finalListSizes.sensitiveIds}件`);
  console.log(`解析エラー数: ${finalListSizes.parseErrorIds}件`);
}

// メイン処理を実行
downloadAllImages().catch(err => {
  console.error('致命的なエラーが発生しました:', err);
  saveErrorLogs();
});