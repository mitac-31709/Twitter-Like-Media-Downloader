// Twitterのいいねから画像とメタデータをダウンロードするメインスクリプト
const { CONFIG } = require('./config/config');
const { loadLikesData, getDownloadedIds } = require('./utils/file-utils');
const { loadSkipLists, getListSizes, notFoundIds, sensitiveIds, noMediaIds, parseErrorIds, addToNoMediaList } = require('./utils/list-handlers');
const { processTweetMedia } = require('./services/media-service');
const { sleep, saveErrorLogs } = require('./utils/error-handlers');
const { 
  formatFileSize, 
  formatTime, 
  colorize, 
  ANSI_COLORS,
  displayProgress,
  clearMultilineProgress
} = require('./utils/progress-bar');

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
  
  console.log(`${colorize('ダウンロードツール', ANSI_COLORS.bold)} - 合計 ${colorize(likesData.length.toString(), ANSI_COLORS.cyan)} 件のいいねを処理します...`);
  
  // デバッグモード時は追加メッセージを表示
  if (CONFIG.DEBUG) {
    console.log(`${colorize('デバッグモード', ANSI_COLORS.yellow)}が有効です。詳細なログが表示されます。`);
    // 起動時にスクロールが残らないように少し待機
    await sleep(500);
  }
  
  // すでにダウンロード済みのツイートIDを取得（メディアとメタデータを別々に）
  const { mediaIds, metadataIds } = getDownloadedIds();
  console.log(`既存のダウンロード済みメディア: ${colorize(mediaIds.size.toString(), ANSI_COLORS.green)}件`);
  console.log(`既存の保存済みメタデータ: ${colorize(metadataIds.size.toString(), ANSI_COLORS.green)}件`);
  
  // スキップリストを読み込む
  loadSkipLists();
  const listSizes = getListSizes();
  console.log(`スキップリストのツイート: ${colorize(listSizes.skipIds.toString(), ANSI_COLORS.yellow)}件`);
  console.log(`存在しないツイートリスト: ${colorize(listSizes.notFoundIds.toString(), ANSI_COLORS.yellow)}件`);
  console.log(`センシティブコンテンツリスト: ${colorize(listSizes.sensitiveIds.toString(), ANSI_COLORS.yellow)}件`);
  console.log(`解析エラーリスト: ${colorize(listSizes.parseErrorIds.toString(), ANSI_COLORS.yellow)}件`);
  
  // スクロールを防止するために少し待機して、上のログを確実に表示
  await sleep(500);
  
  // エラーカウンター（連続APIエラーを検出するため）
  let consecutiveApiErrorCount = 0;
  
  // 処理統計情報
  const stats = {
    startTime: Date.now(),
    totalProcessed: 0,
    skipped: 0,
    downloaded: 0,
    errors: 0,
    mediaFilesDownloaded: 0,
    metadataSaved: 0
  };

  // 処理終了時のクリーンアップ処理
  process.on('SIGINT', () => {
    console.log('\n' + colorize('処理が中断されました。', ANSI_COLORS.yellow));
    process.exit(0);
  });
  
  try {
    for (let i = 0; i < likesData.length; i++) {
      const likeItem = likesData[i].like;
      const tweetId = likeItem.tweetId;
      const tweetUrl = likeItem.expandedUrl || `https://twitter.com/i/web/status/${tweetId}`;
      
      // 統計情報の更新
      stats.totalProcessed++;
      
      // ファイル名の表示を短くして重複表示を防止
      const displayId = tweetId.length > 10 ? tweetId.substring(0, 10) + '...' : tweetId;
      
      // 経過時間とスループットの計算
      const elapsedMs = Date.now() - stats.startTime;
      const elapsedMin = elapsedMs / 60000;
      const throughputPerMin = elapsedMin > 0 ? Math.round((i / elapsedMin) * 10) / 10 : 0;
      
      // 残り時間の推定
      const itemsLeft = likesData.length - i;
      const estimatedMinLeft = throughputPerMin > 0 ? Math.round((itemsLeft / throughputPerMin) * 10) / 10 : 0;
      
      // 全体の進捗状況を表示
      const percentage = Math.min(99, Math.round((i / likesData.length) * 100));
      displayProgress(
        `処理中: ID ${displayId} (${throughputPerMin}/分・残り約${estimatedMinLeft}分)`, 
        percentage
      );
      
      // スキップリストチェックを最適化 - 全てのスキップリストをまとめてチェック
      if (shouldSkipTweet(tweetId)) {
        // スキップ理由を表示
        let skipReason = "スキップ対象";
        
        if (notFoundIds.has(tweetId)) {
          skipReason = "存在しないツイート";
        } else if (sensitiveIds.has(tweetId)) {
          skipReason = "センシティブコンテンツ";
        } else if (noMediaIds.has(tweetId)) {
          skipReason = "メディアが存在しないツイート";
        } else if (parseErrorIds.has(tweetId)) {
          skipReason = "解析エラー";
        }
        
        console.log(`${colorize('スキップ', ANSI_COLORS.yellow)}: ${tweetId} - ${skipReason}`);
        await sleep(CONFIG.DEBUG ? 500 : 250);
        stats.skipped++;
        continue;
      }
      
      // メディアとメタデータの存在確認
      const hasMedia = mediaIds.has(tweetId);
      const hasMetadata = metadataIds.has(tweetId);
      
      // 両方ともダウンロード済みの場合はスキップ
      if (hasMedia && hasMetadata) {
        console.log(`${colorize('スキップ', ANSI_COLORS.yellow)}: ${tweetId} - 既にダウンロード済み`);
        await sleep(CONFIG.DEBUG ? 500 : 250);
        stats.skipped++;
        continue;
      }
      
      // 処理状態の表示を更新
      const statusText = hasMedia ? 'メタデータのみダウンロード中...' : 
                        hasMetadata ? '画像/動画のみダウンロード中...' : 
                        '画像/動画とメタデータをダウンロード中...';
      
      console.log(`${colorize('処理中', ANSI_COLORS.cyan)}: ${tweetId} - ${statusText}`);
      
      // ツイートメディアの処理
      const processResult = await processTweetMedia(tweetId, tweetUrl, { 
        hasMedia, 
        hasMetadata,
        onProgress: (status, progress, details = {}) => {
          if (progress && typeof progress === 'number') {
            // 進捗表示
            let statusInfo = status;
            
            // ファイル名と詳細情報があれば表示
            if (details.filename) {
              statusInfo += ` - ${details.filename}`;
            }
            
            if (details.currentSize && details.totalSize) {
              statusInfo += ` (${formatFileSize(details.currentSize)} / ${formatFileSize(details.totalSize)})`;
            }
            
            displayProgress(statusInfo, progress);
          }
        },
        // ロガー関数
        logger: CONFIG.DEBUG ? console.log : null
      });
      
      // 処理結果に基づいてステータスを更新
      if (processResult.error) {
        const errorMessage = `エラー: ${processResult.errorType || '不明なエラー'}`;
        console.log(`${colorize('エラー', ANSI_COLORS.red)}: ${tweetId} - ${errorMessage}: ${processResult.error}`);
        stats.errors++;
      } else if (processResult.noMedia) {
        // メディアが存在しないツイートの場合
        console.log(`${colorize('メディアなし', ANSI_COLORS.yellow)}: ${tweetId} - メタデータのみ保存`);
        addToNoMediaList(tweetId);
        stats.skipped++;
      } else {
        console.log(`${colorize('完了', ANSI_COLORS.green)}: ${tweetId}`);
        stats.downloaded++;
        
        // 統計情報の更新
        if (processResult.downloadedFiles?.length) {
          stats.mediaFilesDownloaded += processResult.downloadedFiles.length;
        }
        
        if (processResult.savedMetadata) {
          stats.metadataSaved++;
        }
      }
      
      // メタデータからのダウンロードかAPIからのダウンロードかを判定
      const usedAPI = processResult.usedAPI;
      
      if (usedAPI) {
        // API呼び出しエラーの場合はカウンターを増加
        if (processResult.errorType === 'api') {
          consecutiveApiErrorCount++;
          console.log(`${colorize('API エラー', ANSI_COLORS.red)}: ${consecutiveApiErrorCount}回連続`);
        } else {
          // エラーでなければカウンターをリセット
          consecutiveApiErrorCount = 0;
        }
        
        // 連続APIエラーが3回以上発生した場合は長めに待機
        if (consecutiveApiErrorCount >= 3) {
          const cooldownSec = CONFIG.ERROR_COOLDOWN / 1000;
          console.log(`${colorize('API制限エラー', ANSI_COLORS.red)}: ${cooldownSec}秒待機します...`);
          
          // カウントダウン表示
          for (let sec = cooldownSec; sec > 0; sec -= 1) {
            displayProgress(`API制限エラー - 待機中... (残り${sec}秒)`, Math.round((cooldownSec - sec) / cooldownSec * 100));
            await sleep(1000);
          }
          
          // エラーカウンターをリセット
          consecutiveApiErrorCount = 0;
        } else {
          // APIを使用した場合のみ待機（制限を避けるため）
          const delaySec = CONFIG.API_CALL_DELAY / 1000;
          console.log(`API制限待機中... (${delaySec}秒)`);
          await sleep(CONFIG.API_CALL_DELAY);
        }
      } else {
        // APIを使用しなかった場合は短めに待機
        if (!processResult.error && !processResult.noMedia) {
          console.log(`${colorize('保存済みデータ使用', ANSI_COLORS.green)}: API呼び出しを省略`);
        }
        await sleep(CONFIG.DEBUG ? 500 : 300); 
      }
      
      // 全体の進捗バーを更新（必ず正確な進捗数を反映）
      const currentProgress = i + 1;
      const currentPercentage = Math.round((currentProgress / likesData.length) * 100);
      
      // 統計情報の更新
      const successRate = stats.totalProcessed > 0 ? 
        Math.round((stats.downloaded / stats.totalProcessed) * 100) : 0;
      const statsText = `成功:${stats.downloaded} スキップ:${stats.skipped} エラー:${stats.errors} (成功率:${successRate}%)`;
      
      if (i % 10 === 0 || i === likesData.length - 1) {
        displayProgress(statsText, currentPercentage);
      }
    }
    
    // 統計情報の計算
    const totalTime = Date.now() - stats.startTime;
    const totalMinutes = (totalTime / 60000).toFixed(2);
    const throughput = stats.totalProcessed > 0 ? 
      (stats.totalProcessed / totalMinutes).toFixed(2) : 0;
    const successRate = stats.totalProcessed > 0 ? 
      Math.round((stats.downloaded / stats.totalProcessed) * 100) : 0;
    
    // 完了メッセージを表示
    const summaryText = `処理完了 (${totalMinutes}分, ${throughput}件/分, 成功率:${successRate}%)`;
    console.log(summaryText);

    // 少し待機する
    await sleep(CONFIG.DEBUG ? 2000 : 1000);
  } finally {
    // 実行完了後に最終ログを保存
    saveErrorLogs();
    
    // 最終結果を表示
    const finalListSizes = getListSizes();
    const totalTime = (Date.now() - stats.startTime) / 1000;
    const timeStr = formatTime(Date.now() - stats.startTime);
    
    console.log(colorize('すべてのダウンロードが完了しました！', ANSI_COLORS.brightGreen));
    console.log(colorize('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', ANSI_COLORS.green));
    console.log(`${colorize('処理時間', ANSI_COLORS.bold)}: ${colorize(timeStr, ANSI_COLORS.green)} (${totalTime.toFixed(1)}秒)`);
    console.log(`${colorize('処理項目数', ANSI_COLORS.bold)}: ${colorize(stats.totalProcessed.toString(), ANSI_COLORS.yellow)} 件`);
    console.log(`${colorize('ダウンロード成功', ANSI_COLORS.bold)}: ${colorize(stats.downloaded.toString(), ANSI_COLORS.green)} 件`);
    console.log(`${colorize('スキップ', ANSI_COLORS.bold)}: ${colorize(stats.skipped.toString(), ANSI_COLORS.cyan)} 件`);
    console.log(`${colorize('エラー', ANSI_COLORS.bold)}: ${colorize(stats.errors.toString(), ANSI_COLORS.red)} 件`);
    console.log(`${colorize('ダウンロードファイル', ANSI_COLORS.bold)}: ${colorize(stats.mediaFilesDownloaded.toString(), ANSI_COLORS.yellow)} 件`);
    console.log(`${colorize('保存メタデータ', ANSI_COLORS.bold)}: ${colorize(stats.metadataSaved.toString(), ANSI_COLORS.yellow)} 件`);
    console.log(colorize('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', ANSI_COLORS.green));
    console.log(`${colorize('スキップリスト', ANSI_COLORS.bold)}: ${colorize(finalListSizes.skipIds.toString(), ANSI_COLORS.yellow)} 件`);
    console.log(`${colorize('存在しないツイート', ANSI_COLORS.bold)}: ${colorize(finalListSizes.notFoundIds.toString(), ANSI_COLORS.yellow)} 件`);
    console.log(`${colorize('センシティブコンテンツ', ANSI_COLORS.bold)}: ${colorize(finalListSizes.sensitiveIds.toString(), ANSI_COLORS.yellow)} 件`);
    console.log(`${colorize('解析エラー', ANSI_COLORS.bold)}: ${colorize(finalListSizes.parseErrorIds.toString(), ANSI_COLORS.yellow)} 件`);
  }
}

/**
 * ツイートがスキップ対象かどうか判断する
 * @param {string} tweetId - ツイートID
 * @returns {boolean} スキップすべきならtrue
 */
function shouldSkipTweet(tweetId) {
  return notFoundIds.has(tweetId) || 
         sensitiveIds.has(tweetId) || 
         noMediaIds.has(tweetId) || 
         parseErrorIds.has(tweetId);
}

// メイン処理を実行
downloadAllImages().catch(err => {
  console.error(colorize('致命的なエラーが発生しました:', ANSI_COLORS.brightRed), err);
  saveErrorLogs();
});