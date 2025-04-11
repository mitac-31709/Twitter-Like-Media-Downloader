// Twitterのいいねから画像とメタデータをダウンロードするメインスクリプト
const { CONFIG } = require('./config/config');
const { loadLikesData, getDownloadedIds } = require('./utils/file-utils');
const { loadSkipLists, getListSizes, notFoundIds, sensitiveIds } = require('./utils/list-handlers');
const { processTweetMedia } = require('./services/media-service');
const { sleep, saveErrorLogs } = require('./utils/error-handlers');
const { MultiProgressBar, createMultiBarLogger } = require('./utils/progress-bar');

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
  
  // デバッグモード時は追加メッセージを表示
  if (CONFIG.DEBUG) {
    console.log('デバッグモードが有効です。詳細なログが表示されます。');
    // 起動時にスクロールが残らないように少し待機
    await sleep(500);
  }
  
  // マルチプログレスバーのインスタンス化（改善版）
  const multiBar = new MultiProgressBar({
    clearOnComplete: false,
    hideCursor: true,
    barLength: 40,
    fps: CONFIG.DEBUG ? 10 : 5, // デバッグモードでは更新頻度を上げる
    synchronousUpdate: true
  });
  
  // 全体の進捗バーを作成
  const totalBar = multiBar.createMainBar(likesData.length);
  
  // 現在処理中のファイル用バーを作成
  const fileBar = multiBar.addBar('current-file', 100, {
    format: '{bar} {percentage}% | {filename} | {status}'
  }, {
    filename: '準備中...',
    status: '待機中'
  });
  
  // カスタムロガーを作成（デバッグモード設定を渡す）
  const logger = createMultiBarLogger(multiBar, {
    useBuffer: !CONFIG.DEBUG, // デバッグモードでは即時表示
    debug: CONFIG.DEBUG      // CONFIG.DEBUGの設定を反映
  });
  
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
  
  // スクロールを防止するために少し待機して、上のログを確実に表示
  await sleep(500);
  
  // プログレスバーを開始
  totalBar.start(likesData.length, 0, { status: '処理を開始しています...' });
  
  // エラーカウンター（連続APIエラーを検出するため）
  let consecutiveApiErrorCount = 0;
  
  // 定期的にプログレスバーを強制的に再描画するためのインターバル
  const redrawInterval = setInterval(() => {
    multiBar.redraw();
  }, CONFIG.DEBUG ? 500 : 1000); // デバッグモードでは更新頻度を上げる
  
  // プロセス終了時に確実にインターバルをクリア
  process.on('SIGINT', () => {
    clearInterval(redrawInterval);
    multiBar.stop();
    console.log('\n処理が中断されました。');
    process.exit(0);
  });
  
  try {
    for (let i = 0; i < likesData.length; i++) {
      const likeItem = likesData[i].like;
      const tweetId = likeItem.tweetId;
      const tweetUrl = likeItem.expandedUrl || `https://twitter.com/i/web/status/${tweetId}`;
      
      // ファイル名の表示を短くして重複表示を防止
      const displayId = tweetId.length > 10 ? tweetId.substring(0, 10) + '...' : tweetId;
      
      // デバッグモードでは詳細情報を表示
      if (CONFIG.DEBUG) {
        logger.debug(`[詳細] 処理開始: ID=${tweetId}, URL=${tweetUrl}`);
      }
      
      // 全体の進捗状況を更新
      const percentage = Math.min(99, Math.round((i / likesData.length) * 100));
      multiBar.update('main', i, { 
        status: `処理中: ${displayId}`,
        percentage: percentage
      });
      
      // ファイル進捗バーを更新
      multiBar.update('current-file', 0, {
        filename: `ID: ${displayId}`,
        status: '処理開始'
      });
      
      // 存在しないツイートリストにあるツイートはスキップ
      if (notFoundIds.has(tweetId)) {
        multiBar.updateStatus('current-file', '存在しないツイート - スキップ');
        if (CONFIG.DEBUG) logger.debug(`[詳細] ツイートID ${tweetId} は存在しないためスキップ`);
        await sleep(CONFIG.DEBUG ? 500 : 250); // デバッグモードでは表示確認用に長めに待機
        continue;
      }
      
      // センシティブコンテンツリストにあるツイートはスキップ
      if (sensitiveIds.has(tweetId)) {
        multiBar.updateStatus('current-file', 'センシティブコンテンツ - スキップ');
        if (CONFIG.DEBUG) logger.debug(`[詳細] ツイートID ${tweetId} はセンシティブコンテンツを含むためスキップ`);
        await sleep(CONFIG.DEBUG ? 500 : 250);
        continue;
      }
      
      // メディアとメタデータの存在確認
      const hasMedia = mediaIds.has(tweetId);
      const hasMetadata = metadataIds.has(tweetId);
      
      // 両方ともダウンロード済みの場合はスキップ
      if (hasMedia && hasMetadata) {
        multiBar.updateStatus('current-file', '既にダウンロード済み - スキップ');
        if (CONFIG.DEBUG) logger.debug(`[詳細] ツイートID ${tweetId} は画像とメタデータが両方既に保存済み`);
        await sleep(CONFIG.DEBUG ? 500 : 250);
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
        onProgress: (status, progress) => {
          if (progress && typeof progress === 'number') {
            multiBar.update('current-file', progress, { status });
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
      } else {
        multiBar.updateStatus('current-file', '完了');
        
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
          multiBar.updateStatus('current-file', `待機中... (${CONFIG.ERROR_COOLDOWN / 1000}秒)`);
          await sleep(CONFIG.ERROR_COOLDOWN);
          // エラーカウンターをリセット
          consecutiveApiErrorCount = 0;
        } else {
          // APIを使用した場合のみ待機（制限を避けるため）
          multiBar.updateStatus('current-file', `API制限待機中... (${CONFIG.API_CALL_DELAY / 1000}秒)`);
          await sleep(CONFIG.API_CALL_DELAY);
        }
      } else {
        // APIを使用しなかった場合は短めに待機
        await sleep(CONFIG.DEBUG ? 500 : 300); // デバッグモードでは表示確認用に長めに待機
      }
      
      // 全体の進捗バーを更新（必ず正確な進捗数を反映）
      const currentProgress = i + 1;
      const currentPercentage = Math.round((currentProgress / likesData.length) * 100);
      multiBar.update('main', currentProgress, { percentage: currentPercentage });
      
      // デバッグモード時は毎回再描画、通常時は処理の10%ごとに再描画
      if (CONFIG.DEBUG || i % Math.max(1, Math.floor(likesData.length / 10)) === 0) {
        multiBar.redraw();
      }
    }
    
    // 完了メッセージを表示
    multiBar.completeBar('main', '全ての処理が完了しました');
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
    console.log('すべてのダウンロードが完了しました！');
    console.log(`スキップリストのツイート数: ${finalListSizes.skipIds}件`);
    console.log(`存在しないツイート数: ${finalListSizes.notFoundIds}件`);
    console.log(`センシティブコンテンツ数: ${finalListSizes.sensitiveIds}件`);
    console.log(`解析エラー数: ${finalListSizes.parseErrorIds}件`);
  }
}

// メイン処理を実行
downloadAllImages().catch(err => {
  console.error('致命的なエラーが発生しました:', err);
  saveErrorLogs();
});