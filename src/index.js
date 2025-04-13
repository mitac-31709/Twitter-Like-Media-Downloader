// Twitterのいいねから画像とメタデータをダウンロードするメインスクリプト
const { CONFIG } = require('./config/config');
const { loadLikesData, getDownloadedIds } = require('./utils/file-utils');
const { loadSkipLists, getListSizes, isTweetInAnySkipList, notFoundIds, sensitiveIds, noMediaIds, parseErrorIds, addToNoMediaList } = require('./utils/list-handlers');
const { processTweetMedia } = require('./services/media-service');
const { sleep, saveErrorLogs, logDebug } = require('./utils/error-handlers');
const { 
  formatFileSize, 
  formatTime, 
  colorize, 
  ANSI_COLORS,
  displayProgress,
  clearMultilineProgress,
  createSpinner,
  stopSpinner,
  playNotification,
  enableInteractiveMode,
  disableInteractiveMode,
  getInteractiveState
} = require('./utils/progress-bar');
const fs = require('fs').promises;
const path = require('path');

/**
 * ツイート処理の統計情報
 */
const stats = {
  startTime: 0,
  totalProcessed: 0,
  skipped: {
    total: 0,
    alreadyDownloaded: 0,
    inSkipList: 0,
    notFound: 0,
    sensitive: 0,
    parseError: 0,
    noMedia: 0
  },
  downloaded: 0,
  errors: 0,
  mediaFilesDownloaded: 0,
  metadataSaved: 0,
  apiCalls: 0,
  cachedResponses: 0,
  lastSavePoint: 0,
  savePoints: []
};

// 前回の進捗表示の行数
let lastProgressLines = 0;

/**
 * 進捗表示を更新（前回の表示をクリア）
 * @param {string} status - 状態メッセージ
 * @param {number} progress - 進捗率（0-100）
 * @param {object} details - 詳細情報（オプション）
 */
function updateProgressDisplay(status, progress, details = null) {
  try {
    // プログレスバーを表示
    displayProgress(status, progress, details);
    
    // 100%完了の場合は改行して次の表示に備える
    if (progress >= 100) {
      process.stdout.write('\n');
      if (details) {
        process.stdout.write('\n');
      }
    }
  } catch (err) {
    // プログレスバー表示で問題が発生しても処理を継続
    console.error('プログレス表示エラー:', err);
  }
}

/**
 * 状態を保存する
 * @param {number} currentIndex - 現在の処理インデックス
 * @param {Array} likesData - いいねデータ配列
 */
async function saveState(currentIndex, likesData) {
  try {
    // 処理済みインデックスを保存
    const saveData = {
      timestamp: new Date().toISOString(),
      completedIndex: currentIndex,
      totalItems: likesData.length,
      stats: { ...stats },
      remainingItems: likesData.length - currentIndex
    };
    
    stats.savePoints.push(currentIndex);
    stats.lastSavePoint = currentIndex;
    
    await fs.writeFile(
      CONFIG.STATE_FILE_PATH,
      JSON.stringify(saveData, null, 2),
      'utf8'
    );
    
    logDebug(`${colorize('セーブポイント作成', ANSI_COLORS.green)}: インデックス ${currentIndex} (${Math.round((currentIndex / likesData.length) * 100)}%)`);
    return true;
  } catch (err) {
    console.error(`${colorize('セーブポイント作成エラー', ANSI_COLORS.red)}:`, err);
    return false;
  }
}

/**
 * 保存された状態を読み込む
 * @returns {Object|null} 保存された状態オブジェクト、またはnull
 */
async function loadState() {
  try {
    const data = await fs.readFile(CONFIG.STATE_FILE_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    // ファイルがない場合は静かに失敗
    return null;
  }
}

/**
 * 各いいねから画像をダウンロード
 */
async function downloadAllImages() {
  // 開始時刻を記録
  stats.startTime = Date.now();
  lastProgressLines = 0;
  
  // いいねデータの読み込み
  const spinner = createSpinner('いいねデータを読み込み中...');
  const likesData = loadLikesData();
  stopSpinner(spinner);
  
  if (!likesData) {
    console.error(colorize('いいねデータの読み込みに失敗しました。', ANSI_COLORS.brightRed));
    process.exit(1);
  }
  
  // 保存された状態を確認
  let startIndex = 0;
  let shouldResume = false;
  
  const savedState = await loadState();
  if (savedState) {
    const resumeSpinner = createSpinner('前回の続きを確認中...');
    
    if (savedState.totalItems === likesData.length && savedState.completedIndex < likesData.length) {
      shouldResume = true;
      startIndex = savedState.completedIndex;
      
      // 統計情報の復元
      if (savedState.stats) {
        Object.assign(stats, savedState.stats);
        stats.startTime = Date.now() - (Date.now() - new Date(savedState.timestamp).getTime());
      }
      
      stopSpinner(resumeSpinner, `前回の続きから再開します (${Math.round((startIndex / likesData.length) * 100)}% 完了)`);
    } else {
      stopSpinner(resumeSpinner, '保存データを検出しましたが、一致しないため最初から開始します');
    }
  }
  
  console.log(`${colorize('━━━━━━━━━━━━━━━━━━━ ダウンロード開始 ━━━━━━━━━━━━━━━━━━━', ANSI_COLORS.cyan)}`);
  console.log(`${colorize('ダウンロードツール', ANSI_COLORS.bold)} - 合計 ${colorize(likesData.length.toString(), ANSI_COLORS.cyan)} 件のいいねを処理します`);
  
  if (shouldResume) {
    console.log(`${colorize('再開モード', ANSI_COLORS.green)}: インデックス ${startIndex} から再開 (残り ${likesData.length - startIndex} 件)`);
  }
  
  // デバッグモード時は追加メッセージを表示
  if (CONFIG.DEBUG) {
    console.log(`${colorize('デバッグモード', ANSI_COLORS.yellow)}が有効です (詳細ログを出力)`);
  }
  
  // すでにダウンロード済みのツイートIDを取得（メディアとメタデータを別々に）
  const loadingSpinner = createSpinner('ダウンロード済みファイルをスキャン中...');
  const { mediaIds, metadataIds } = getDownloadedIds();
  stopSpinner(loadingSpinner);
  
  console.log(`既存のダウンロード済みメディア: ${colorize(mediaIds.size.toString(), ANSI_COLORS.green)}件`);
  console.log(`既存の保存済みメタデータ: ${colorize(metadataIds.size.toString(), ANSI_COLORS.green)}件`);
  
  // スキップリストを読み込む
  const skipSpinner = createSpinner('スキップリストを読み込み中...');
  loadSkipLists();
  const listSizes = getListSizes();
  stopSpinner(skipSpinner);
  
  console.log(`スキップリストのツイート: ${colorize(listSizes.skipIds.toString(), ANSI_COLORS.yellow)}件`);
  console.log(`存在しないツイートリスト: ${colorize(listSizes.notFoundIds.toString(), ANSI_COLORS.yellow)}件`);
  console.log(`センシティブコンテンツリスト: ${colorize(listSizes.sensitiveIds.toString(), ANSI_COLORS.yellow)}件`);
  console.log(`解析エラーリスト: ${colorize(listSizes.parseErrorIds.toString(), ANSI_COLORS.yellow)}件`);
  console.log(`メディアなしツイートリスト: ${colorize(listSizes.noMediaIds.toString(), ANSI_COLORS.yellow)}件`);
  console.log(`${colorize('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', ANSI_COLORS.cyan)}`);
  console.log(`処理を開始します...`);
  
  // エラーカウンター（連続APIエラーを検出するため）
  let consecutiveApiErrorCount = 0;
  
  // インタラクティブモードの設定
  if (CONFIG.UX?.INTERACTIVE) {
    enableInteractiveMode({
      onPauseToggle: (isPaused) => {
        if (isPaused) {
          console.log(`${colorize('一時停止', ANSI_COLORS.yellow)}: スペースキーで再開`);
        } else {
          console.log(`${colorize('再開', ANSI_COLORS.green)}: 処理を続行します`);
        }
      },
      onSpeedChange: (speedFactor) => {
        console.log(`${colorize('速度変更', ANSI_COLORS.cyan)}: ${speedFactor.toFixed(1)}x`);
      },
      onQuit: async () => {
        console.log(`${colorize('\n終了リクエスト', ANSI_COLORS.yellow)}: 処理を安全に終了します...`);
        await saveState(startIndex, likesData);
        displayFinalStats();
        process.exit(0);
      }
    });
    
    console.log(`${colorize('インタラクティブモード', ANSI_COLORS.green)}: [スペース]一時停止/再開 [+/-]速度調整 [q]終了`);
  }
  
  // 処理終了時のクリーンアップ処理
  process.on('SIGINT', async () => {
    lastProgressLines = 0; // 進捗表示をリセット
    console.log('\n' + colorize('処理が中断されました。', ANSI_COLORS.yellow));
    
    if (CONFIG.UX?.AUTO_SAVE_POINT) {
      await saveState(startIndex, likesData);
      console.log('処理状態を保存しました。次回起動時に続きから再開できます。');
    }
    
    displayFinalStats();
    disableInteractiveMode();
    process.exit(0);
  });
  
  try {
    // ツイートの一括処理
    for (let i = startIndex; i < likesData.length; i++) {
      // インタラクティブモードの一時停止チェック
      if (CONFIG.UX?.INTERACTIVE) {
        const state = getInteractiveState();
        if (state.active && state.paused) {
          // 一時停止中は待機
          updateProgressDisplay('一時停止中', Math.min(99, Math.round((i / likesData.length) * 100)), {
            counter: `[${i + 1}/${likesData.length}]`,
            type: '停止',
            stats: {
              downloaded: stats.downloaded,
              errors: stats.errors,
              skipped: stats.skipped.total,
              apiCalls: stats.apiCalls
            }
          });
          await sleep(500);
          i--; // インデックスを戻して同じアイテムを再処理
          continue;
        }
      }
      
      const likeItem = likesData[i].like;
      const tweetId = likeItem.tweetId;
      const tweetUrl = likeItem.expandedUrl || `https://twitter.com/i/web/status/${tweetId}`;
      
      // 統計情報の更新
      stats.totalProcessed++;
      
      // 現在の進捗率を計算
      const percentage = Math.min(99, Math.round((i / likesData.length) * 100));
      
      // カウンター表示の整形（現在/合計の形式）
      const counter = `[${i + 1}/${likesData.length}]`;
      
      // ファイル名の表示を短くして重複表示を防止
      const displayId = `🔹 ${tweetId}`;

      // 経過時間とスループットの計算
      const elapsedMs = Date.now() - stats.startTime;
      const elapsedMin = elapsedMs / 60000;
      const throughputPerMin = elapsedMin > 0 ? Math.round((i / elapsedMin) * 10) / 10 : 0;
      
      // 残り時間の推定
      const itemsLeft = likesData.length - i;
      const estimatedMinLeft = throughputPerMin > 0 ? Math.round((itemsLeft / throughputPerMin) * 10) / 10 : 0;
      
      // 全体の進捗状況を表示
      updateProgressDisplay(
        `処理中: ${displayId}`, 
        percentage,
        {
          counter: `[${i + 1}/${likesData.length}]`,
          type: '初期化',
          item: tweetUrl,
          stats: {
            downloaded: stats.downloaded,
            errors: stats.errors,
            skipped: stats.skipped.total,
            apiCalls: stats.apiCalls
          }
        }
      );

      // スキップリストチェック
      if (isTweetInAnySkipList(tweetId)) {
        // スキップ理由を特定
        let skipReason = "スキップ対象";
        let skipType = "スキップ";
        
        if (notFoundIds.has(tweetId)) {
          skipReason = "存在しないツイート";
          skipType = "未発見";
          stats.skipped.notFound++;
        } else if (sensitiveIds.has(tweetId)) {
          skipReason = "センシティブコンテンツ";
          skipType = "制限";
          stats.skipped.sensitive++;
        } else if (noMediaIds.has(tweetId)) {
          skipReason = "メディアが存在しないツイート";
          skipType = "メディアなし";
          stats.skipped.noMedia++;
        } else if (parseErrorIds.has(tweetId)) {
          skipReason = "解析エラー";
          skipType = "パースエラー";
          stats.skipped.parseError++;
        } else {
          stats.skipped.inSkipList++;
        }

        // スキップ情報を表示
        updateProgressDisplay(
          `${skipReason}のためスキップ: ${displayId}`,
          percentage,
          {
            counter: `[${i + 1}/${likesData.length}]`,
            type: skipType,
            item: tweetUrl,
            stats: {
              downloaded: stats.downloaded,
              errors: stats.errors,
              skipped: stats.skipped.total,
              apiCalls: stats.apiCalls
            }
          }
        );
        
        logDebug(`${colorize('スキップ', ANSI_COLORS.yellow)}: ${tweetId} - ${skipReason}`);
        stats.skipped.total++;
        continue;
      }
      
      // メディアとメタデータの存在確認
      const hasMedia = mediaIds.has(tweetId);
      const hasMetadata = metadataIds.has(tweetId);
      
      // 両方ともダウンロード済みの場合はスキップ
      if (hasMedia && hasMetadata) {
        logDebug(`${colorize('スキップ', ANSI_COLORS.yellow)}: ${tweetId} - 既にダウンロード済み`);
        stats.skipped.alreadyDownloaded++;
        stats.skipped.total++;
        continue;
      }
      
      // 処理状態の表示を更新
      const statusText = hasMedia ? 'メタデータのみダウンロード中...' : 
                        hasMetadata ? '画像/動画のみダウンロード中...' : 
                        '画像/動画とメタデータをダウンロード中...';
      
      logDebug(`${colorize('処理中', ANSI_COLORS.cyan)}: ${tweetId} - ${statusText}`);
      
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
            
            // 改善された進捗表示関数を使用
            updateProgressDisplay(statusInfo, progress, {
              ...details,
              counter: `[${i + 1}/${likesData.length}]`,
              type: 'ダウンロード',
              item: tweetUrl,
              stats: {
                downloaded: stats.downloaded,
                errors: stats.errors,
                skipped: stats.skipped.total,
                apiCalls: stats.apiCalls
              }
            });
          }
        },
        // ロガー関数
        logger: CONFIG.DEBUG ? console.log : null
      });
      
      // 処理結果に基づいてステータスを更新
      if (processResult.error) {
        const errorType = processResult.errorType || '不明なエラー';
        console.log(`${colorize('❌ エラー', ANSI_COLORS.red)}: ${tweetId} - ${errorType}: ${processResult.error}`);
        stats.errors++;
        
        if (processResult.errorType === 'critical') {
          playNotification('error');
        }
      } else if (processResult.noMedia) {
        // メディアが存在しないツイートの場合
        console.log(`${colorize('ℹ️ メディアなし', ANSI_COLORS.yellow)}: ${tweetId} - メタデータのみ保存`);
        addToNoMediaList(tweetId);
        stats.skipped.noMedia++;
        stats.skipped.total++;
        stats.metadataSaved++;
      } else {
        logDebug(`${colorize('✅ 完了', ANSI_COLORS.green)}: ${tweetId}`);
        stats.downloaded++;
        
        // 統計情報の更新
        if (processResult.downloadedFiles?.length) {
          stats.mediaFilesDownloaded += processResult.downloadedFiles.length;
          // ファイルごとの詳細をログに残す
          processResult.downloadedFiles.forEach(file => {
            console.log(`${colorize('📥 ダウンロード', ANSI_COLORS.green)}: ${tweetId} - ${file}`);
          });
        }
        
        if (processResult.savedMetadata) {
          stats.metadataSaved++;
          logDebug(`${colorize('📋 メタデータ保存', ANSI_COLORS.green)}: ${tweetId}`);
        }
      }
      
      // API利用の統計を更新
      if (processResult.usedAPI) {
        stats.apiCalls++;
      } else if (!processResult.error) {
        stats.cachedResponses++;
      }
      
      // メタデータからのダウンロードかAPIからのダウンロードかを判定
      const usedAPI = processResult.usedAPI;
      
      if (usedAPI) {
        // API呼び出しエラーの場合はカウンターを増加
        if (processResult.errorType === 'api') {
          consecutiveApiErrorCount++;
          console.log(`${colorize('🚫 API エラー', ANSI_COLORS.red)}: ${consecutiveApiErrorCount}回連続`);
        } else {
          // エラーでなければカウンターをリセット
          consecutiveApiErrorCount = 0;
        }
        
        // 連続APIエラーが3回以上発生した場合は長めに待機
        if (consecutiveApiErrorCount >= 3) {
          const cooldownSec = CONFIG.ERROR_COOLDOWN / 1000;
          console.log(`${colorize('API制限エラー', ANSI_COLORS.red)}: ${cooldownSec}秒待機します...`);
          playNotification('warning');
          
          // カウントダウン表示
          for (let sec = cooldownSec; sec > 0; sec -= 1) {
            // 進捗表示の改善
            updateProgressDisplay(`API制限エラー - 待機中... (残り${sec}秒)`, Math.round((cooldownSec - sec) / cooldownSec * 100));
            await sleep(1000);
          }
          
          // エラーカウンターをリセット
          consecutiveApiErrorCount = 0;
        } else {
          // APIを使用した場合のみ待機（制限を避けるため）
          const delaySec = CONFIG.API_CALL_DELAY / 1000;
          logDebug(`API制限待機中... (${delaySec}秒)`);
          
          // インタラクティブモードが有効で、速度調整がある場合は待機時間を調整
          let actualDelay = CONFIG.API_CALL_DELAY;
          if (CONFIG.UX?.INTERACTIVE) {
            const state = getInteractiveState();
            if (state.active && state.speedFactor !== 1.0) {
              actualDelay = Math.max(500, actualDelay / state.speedFactor);
            }
          }
          
          await sleep(actualDelay);
        }
      } else {
        // APIを使用しなかった場合は待機なし（高速化）
        if (!processResult.error && !processResult.noMedia) {
          logDebug(`${colorize('保存済みデータ使用', ANSI_COLORS.green)}: API呼び出し省略`);
        }
      }
      
      // 定期的にセーブポイントを作成（設定に基づく）
      if (CONFIG.UX?.AUTO_SAVE_POINT && 
          i > 0 && 
          (i % CONFIG.UX.SAVE_POINT_INTERVAL === 0 || i === likesData.length - 1)) {
        await saveState(i, likesData);
      }
      
      // 統計情報の更新（10件ごとに表示）
      if (i % 10 === 0 || i === likesData.length - 1) {
        const currentPercentage = Math.round(((i + 1) / likesData.length) * 100);
        const successRate = stats.totalProcessed > 0 ? 
          Math.round((stats.downloaded / stats.totalProcessed) * 100) : 0;
        const statsText = `処理:${i+1}/${likesData.length} 成功:${stats.downloaded} スキップ:${stats.skipped.total} エラー:${stats.errors} (成功率:${successRate}%)`;
        // 統計情報表示も改善
        updateProgressDisplay(statsText, currentPercentage);
      }
    }
    
    // 進捗表示のリセットと完了メッセージの表示
    lastProgressLines = 0;
    console.log(colorize('\n処理が完了しました', ANSI_COLORS.brightGreen));
    playNotification('success');
  } finally {
    // 実行完了後に最終ログを保存
    saveErrorLogs();
    
    // インタラクティブモードを無効化
    disableInteractiveMode();
    
    // 最終結果を表示
    displayFinalStats();
  }
}

/**
 * 最終的な統計情報を表示
 */
function displayFinalStats() {
  const finalListSizes = getListSizes();
  const totalTime = (Date.now() - stats.startTime) / 1000;
  const timeStr = formatTime(Date.now() - stats.startTime);
  
  console.log(colorize('\n━━━━━━━━━━━━━━━━━━━ 処理結果 ━━━━━━━━━━━━━━━━━━━', ANSI_COLORS.cyan));
  console.log(`${colorize('処理時間', ANSI_COLORS.bold)}: ${colorize(timeStr, ANSI_COLORS.green)} (${totalTime.toFixed(1)}秒)`);
  console.log(`${colorize('処理項目数', ANSI_COLORS.bold)}: ${colorize(stats.totalProcessed.toString(), ANSI_COLORS.yellow)} 件`);
  console.log(`${colorize('ダウンロード成功', ANSI_COLORS.bold)}: ${colorize(stats.downloaded.toString(), ANSI_COLORS.green)} 件`);
  console.log(`${colorize('スキップ合計', ANSI_COLORS.bold)}: ${colorize(stats.skipped.total.toString(), ANSI_COLORS.cyan)} 件`);
  console.log(`  ${colorize('└ 既にダウンロード済み', ANSI_COLORS.dim)}: ${colorize(stats.skipped.alreadyDownloaded.toString(), ANSI_COLORS.dim)} 件`);
  console.log(`  ${colorize('└ スキップリスト', ANSI_COLORS.dim)}: ${colorize(stats.skipped.inSkipList.toString(), ANSI_COLORS.dim)} 件`);
  console.log(`  ${colorize('└ 存在しないツイート', ANSI_COLORS.dim)}: ${colorize(stats.skipped.notFound.toString(), ANSI_COLORS.dim)} 件`);
  console.log(`  ${colorize('└ センシティブ', ANSI_COLORS.dim)}: ${colorize(stats.skipped.sensitive.toString(), ANSI_COLORS.dim)} 件`);
  console.log(`  ${colorize('└ 解析エラー', ANSI_COLORS.dim)}: ${colorize(stats.skipped.parseError.toString(), ANSI_COLORS.dim)} 件`);
  console.log(`  ${colorize('└ メディアなし', ANSI_COLORS.dim)}: ${colorize(stats.skipped.noMedia.toString(), ANSI_COLORS.dim)} 件`);
  console.log(`${colorize('エラー', ANSI_COLORS.bold)}: ${colorize(stats.errors.toString(), ANSI_COLORS.red)} 件`);
  console.log(`${colorize('API呼び出し', ANSI_COLORS.bold)}: ${colorize(stats.apiCalls.toString(), ANSI_COLORS.yellow)} 件`);
  console.log(`${colorize('キャッシュ使用', ANSI_COLORS.bold)}: ${colorize(stats.cachedResponses.toString(), ANSI_COLORS.green)} 件`);
  console.log(`${colorize('ダウンロードファイル', ANSI_COLORS.bold)}: ${colorize(stats.mediaFilesDownloaded.toString(), ANSI_COLORS.yellow)} 件`);
  console.log(`${colorize('保存メタデータ', ANSI_COLORS.bold)}: ${colorize(stats.metadataSaved.toString(), ANSI_COLORS.yellow)} 件`);
  
  // セーブポイント情報
  if (stats.savePoints.length > 0) {
    console.log(`${colorize('セーブポイント作成', ANSI_COLORS.bold)}: ${colorize(stats.savePoints.length.toString(), ANSI_COLORS.cyan)} 回`);
  }
  
  console.log(colorize('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', ANSI_COLORS.cyan));
  console.log(`${colorize('スキップリスト', ANSI_COLORS.bold)}: ${colorize(finalListSizes.skipIds.toString(), ANSI_COLORS.yellow)} 件`);
  console.log(`${colorize('存在しないツイート', ANSI_COLORS.bold)}: ${colorize(finalListSizes.notFoundIds.toString(), ANSI_COLORS.yellow)} 件`);
  console.log(`${colorize('センシティブコンテンツ', ANSI_COLORS.bold)}: ${colorize(finalListSizes.sensitiveIds.toString(), ANSI_COLORS.yellow)} 件`);
  console.log(`${colorize('解析エラー', ANSI_COLORS.bold)}: ${colorize(finalListSizes.parseErrorIds.toString(), ANSI_COLORS.yellow)} 件`);
  console.log(`${colorize('メディアなし', ANSI_COLORS.bold)}: ${colorize(finalListSizes.noMediaIds.toString(), ANSI_COLORS.yellow)} 件`);
}

// メイン処理を実行
downloadAllImages().catch(err => {
  console.error(colorize('致命的なエラーが発生しました:', ANSI_COLORS.brightRed), err);
  saveErrorLogs();
  
  // 通知サウンドを再生
  playNotification('error');
});