// Twitterのいいねから画像とメタデータをダウンロードするメインスクリプト
const { CONFIG } = require('./config/config');
const { loadLikesData, getDownloadedIds } = require('./utils/file-utils');
const { loadSkipLists, getListSizes, notFoundIds, sensitiveIds } = require('./utils/list-handlers');
const { processTweetMedia } = require('./services/media-service');
const { sleep, saveErrorLogs } = require('./utils/error-handlers');
const { 
  MultiProgressBar, 
  createMultiBarLogger, 
  formatFileSize, 
  formatTime, 
  colorize, 
  ANSI_COLORS 
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
  
  // マルチプログレスバーのインスタンス化（カラフル版）
  const multiBar = new MultiProgressBar({
    clearOnComplete: false,
    hideCursor: true,
    barLength: 30,
    fps: CONFIG.DEBUG ? 15 : 10, // デバッグモードでは更新頻度を上げる
    synchronousUpdate: true,
    colors: {
      bar: {
        complete: ANSI_COLORS.bgCyan,
        incomplete: ANSI_COLORS.bgBlue
      },
      percentage: ANSI_COLORS.cyan,
      value: ANSI_COLORS.yellow,
      total: ANSI_COLORS.brightYellow,
      time: ANSI_COLORS.green,
      status: {
        normal: ANSI_COLORS.white,
        success: ANSI_COLORS.brightGreen,
        warning: ANSI_COLORS.brightYellow,
        error: ANSI_COLORS.brightRed
      }
    }
  });
  
  // 全体の進捗バーを作成
  const totalBar = multiBar.createMainBar(likesData.length);
  
  // 現在処理中のファイル用バーを作成
  const fileBar = multiBar.addBar('current-file', 100, {
    format: '{bar} {percentage}% | {filename} | {status}'
  }, {
    filename: colorize('準備中...', ANSI_COLORS.cyan),
    status: colorize('待機中', ANSI_COLORS.dim)
  });
  
  // カスタムロガーを作成（デバッグモード設定を渡す）
  const logger = createMultiBarLogger(multiBar, {
    useBuffer: !CONFIG.DEBUG, // デバッグモードでは即時表示
    debug: CONFIG.DEBUG      // CONFIG.DEBUGの設定を反映
  });
  
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
  
  // プログレスバーを開始
  totalBar.start(likesData.length, 0, { status: '処理を開始しています...' });
  
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
  
  // 定期的にプログレスバーを強制的に再描画するためのインターバル
  const redrawInterval = setInterval(() => {
    multiBar.redraw();
  }, CONFIG.DEBUG ? 500 : 1000); // デバッグモードでは更新頻度を上げる
  
  // プロセス終了時に確実にインターバルをクリア
  process.on('SIGINT', () => {
    clearInterval(redrawInterval);
    multiBar.stop();
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
      
      // デバッグモードでは詳細情報を表示
      if (CONFIG.DEBUG) {
        logger.debug(`[詳細] 処理開始: ID=${colorize(tweetId, ANSI_COLORS.cyan)}, URL=${colorize(tweetUrl, ANSI_COLORS.blue)}`);
      }
      
      // 経過時間とスループットの計算
      const elapsedMs = Date.now() - stats.startTime;
      const elapsedMin = elapsedMs / 60000;
      const throughputPerMin = elapsedMin > 0 ? Math.round((i / elapsedMin) * 10) / 10 : 0;
      
      // 残り時間の推定
      const itemsLeft = likesData.length - i;
      const estimatedMinLeft = throughputPerMin > 0 ? Math.round((itemsLeft / throughputPerMin) * 10) / 10 : 0;
      
      // 全体の進捗状況を更新
      const percentage = Math.min(99, Math.round((i / likesData.length) * 100));
      multiBar.update('main', i, { 
        status: `処理中: ID ${displayId} (${throughputPerMin}/分・残り約${estimatedMinLeft}分)`,
        percentage,
        speed: throughputPerMin,
        eta: estimatedMinLeft * 60 // 秒単位で変換
      });
      
      // ファイル進捗バーを更新
      multiBar.update('current-file', 0, {
        filename: `ID: ${colorize(displayId, ANSI_COLORS.cyan)}`,
        status: '処理開始'
      });
      
      // 存在しないツイートリストにあるツイートはスキップ
      if (notFoundIds.has(tweetId)) {
        multiBar.updateStatus('current-file', '存在しないツイート - スキップ');
        if (CONFIG.DEBUG) logger.debug(`[詳細] ツイートID ${colorize(tweetId, ANSI_COLORS.cyan)} は存在しないためスキップ`);
        await sleep(CONFIG.DEBUG ? 500 : 250);
        stats.skipped++;
        continue;
      }
      
      // センシティブコンテンツリストにあるツイートはスキップ
      if (sensitiveIds.has(tweetId)) {
        multiBar.updateStatus('current-file', 'センシティブコンテンツ - スキップ');
        if (CONFIG.DEBUG) logger.debug(`[詳細] ツイートID ${colorize(tweetId, ANSI_COLORS.cyan)} はセンシティブコンテンツを含むためスキップ`);
        await sleep(CONFIG.DEBUG ? 500 : 250);
        stats.skipped++;
        continue;
      }
      
      // メディアとメタデータの存在確認
      const hasMedia = mediaIds.has(tweetId);
      const hasMetadata = metadataIds.has(tweetId);
      
      // 両方ともダウンロード済みの場合はスキップ
      if (hasMedia && hasMetadata) {
        multiBar.updateStatus('current-file', '既にダウンロード済み - スキップ');
        if (CONFIG.DEBUG) logger.debug(`[詳細] ツイートID ${colorize(tweetId, ANSI_COLORS.cyan)} は画像とメタデータが両方既に保存済み`);
        await sleep(CONFIG.DEBUG ? 500 : 250);
        stats.skipped++;
        continue;
      }
      
      // 処理状態の表示を更新
      multiBar.updateStatus('current-file', hasMedia ? 'メタデータのみダウンロード中...' : 
                                           hasMetadata ? '画像/動画のみダウンロード中...' : 
                                           '画像/動画とメタデータをダウンロード中...');
      
      // ツイートメディアの処理
      const processResult = await processTweetMedia(tweetId, tweetUrl, { 
        hasMedia, 
        hasMetadata,
        onProgress: (status, progress, details = {}) => {
          if (progress && typeof progress === 'number') {
            // ファイルサイズや速度が提供されていれば表示
            const updateData = { status };
            
            if (details.currentSize && details.totalSize) {
              updateData.size = formatFileSize(details.currentSize);
              updateData.totalSize = formatFileSize(details.totalSize);
              updateData.sizeBytes = details.currentSize;
              updateData.totalSizeBytes = details.totalSize;
            }
            
            if (details.filename) {
              updateData.filename = colorize(details.filename, ANSI_COLORS.cyan);
            }
            
            multiBar.update('current-file', progress, updateData);
          } else {
            multiBar.updateStatus('current-file', status);
          }
        },
        // ロガー関数を渡してログをプログレスバー経由で表示
        logger: CONFIG.DEBUG ? 
          (message) => logger.debug(`[詳細] ${message}`) : 
          null
      });
      
      // 処理結果に基づいてステータスを更新
      if (processResult.error) {
        const errorMessage = `エラー: ${processResult.errorType || '不明なエラー'}`;
        multiBar.updateStatus('current-file', errorMessage);
        if (CONFIG.DEBUG) logger.debug(`[詳細] ${errorMessage}: ${processResult.error}`);
        stats.errors++;
      } else {
        multiBar.updateStatus('current-file', '完了');
        stats.downloaded++;
        
        // 統計情報の更新
        if (processResult.downloadedFiles?.length) {
          stats.mediaFilesDownloaded += processResult.downloadedFiles.length;
        }
        
        if (processResult.savedMetadata) {
          stats.metadataSaved++;
        }
        
        // デバッグモードでは処理結果の詳細を表示
        if (CONFIG.DEBUG) {
          const resultDetails = {
            'ダウンロードファイル': processResult.downloadedFiles?.length || 0,
            'メタデータ保存': processResult.savedMetadata ? 'あり' : 'なし',
            'API使用': processResult.usedAPI ? 'あり' : 'なし'
          };
          logger.debug(`[詳細] 処理結果: ${JSON.stringify(resultDetails)}`);
        }
      }
      
      // メタデータからのダウンロードかAPIからのダウンロードかを判定
      const usedAPI = processResult.usedAPI;
      
      if (usedAPI) {
        // API呼び出しエラーの場合はカウンターを増加
        if (processResult.errorType === 'api') {
          consecutiveApiErrorCount++;
          multiBar.updateStatus('main', `API エラー発生 (${consecutiveApiErrorCount}回連続)`);
        } else {
          // エラーでなければカウンターをリセット
          consecutiveApiErrorCount = 0;
        }
        
        // 連続APIエラーが3回以上発生した場合は長めに待機
        if (consecutiveApiErrorCount >= 3) {
          const cooldownSec = CONFIG.ERROR_COOLDOWN / 1000;
          multiBar.updateStatus('current-file', `API制限エラー - 待機中... (${cooldownSec}秒)`);
          
          // カウントダウン表示
          for (let sec = cooldownSec; sec > 0; sec -= 1) {
            multiBar.update('current-file', Math.round((cooldownSec - sec) / cooldownSec * 100), {
              status: `API制限エラー - 待機中... (残り${sec}秒)`
            });
            await sleep(1000);
          }
          
          // エラーカウンターをリセット
          consecutiveApiErrorCount = 0;
        } else {
          // APIを使用した場合のみ待機（制限を避けるため）
          const delaySec = CONFIG.API_CALL_DELAY / 1000;
          multiBar.updateStatus('current-file', `API制限待機中... (${delaySec}秒)`);
          await sleep(CONFIG.API_CALL_DELAY);
        }
      } else {
        // APIを使用しなかった場合は短めに待機
        await sleep(CONFIG.DEBUG ? 500 : 300); 
      }
      
      // 全体の進捗バーを更新（必ず正確な進捗数を反映）
      const currentProgress = i + 1;
      const currentPercentage = Math.round((currentProgress / likesData.length) * 100);
      
      // 統計情報の更新
      const successRate = stats.totalProcessed > 0 ? 
        Math.round((stats.downloaded / stats.totalProcessed) * 100) : 0;
      const statsText = `成功:${stats.downloaded} スキップ:${stats.skipped} エラー:${stats.errors} (成功率:${successRate}%)`;
      
      multiBar.update('main', currentProgress, { 
        percentage: currentPercentage,
        status: statsText
      });
      
      // デバッグモード時は毎回再描画、通常時は処理の10%ごとに再描画
      if (CONFIG.DEBUG || i % Math.max(1, Math.floor(likesData.length / 10)) === 0) {
        multiBar.redraw();
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
    multiBar.completeBar('main', summaryText);
    multiBar.completeBar('current-file', '処理完了');
    
    // 少し待機してから停止
    await sleep(CONFIG.DEBUG ? 2000 : 1000);
  } finally {
    // 必ずインターバルをクリアして、プログレスバーを停止
    clearInterval(redrawInterval);
    multiBar.stop();
    
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

// メイン処理を実行
downloadAllImages().catch(err => {
  console.error(colorize('致命的なエラーが発生しました:', ANSI_COLORS.brightRed), err);
  saveErrorLogs();
});