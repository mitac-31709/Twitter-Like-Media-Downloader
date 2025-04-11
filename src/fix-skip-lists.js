// filepath: d:\Prog\twitterurldirect\src\fix-skip-lists.js
// スキップリストを修正するプログラム
const fs = require('fs');
const path = require('path');
const { CONFIG, dirs } = require('./config/config');
const { determineErrorType } = require('./utils/error-handlers');

/**
 * エラーログファイルを取得する関数
 * @returns {Array<string>} エラーログファイルのパス配列
 */
function getErrorLogFiles() {
  return fs.readdirSync(dirs.logsDir)
    .filter(file => file.startsWith('error-log-') && file.endsWith('.json'))
    .map(file => path.join(dirs.logsDir, file));
}

/**
 * スキップリストを修正する関数
 */
async function fixSkipLists() {
  console.log('スキップリストの修正を開始します...');

  // 既存のスキップリストを読み込む
  let skipIds = [];
  if (fs.existsSync(CONFIG.SKIP_LIST_PATH)) {
    try {
      skipIds = JSON.parse(fs.readFileSync(CONFIG.SKIP_LIST_PATH, CONFIG.ENCODING));
      console.log(`既存のスキップリスト: ${skipIds.length}件`);
    } catch (error) {
      console.error(`スキップリストの読み込みエラー: ${error.message}`);
      skipIds = [];
    }
  }

  // 各カテゴリのIDセット
  const notFoundIds = new Set();
  const sensitiveIds = new Set();
  const parseErrorIds = new Set();
  const otherSkipIds = new Set();

  // エラーログファイルを処理
  let totalLogs = 0;
  const errorLogFiles = getErrorLogFiles();
  
  console.log(`処理するログファイル数: ${errorLogFiles.length}件`);
  
  for (const logFile of errorLogFiles) {
    try {
      const logs = JSON.parse(fs.readFileSync(logFile, CONFIG.ENCODING));
      console.log(`ログファイル処理中: ${path.basename(logFile)} (${logs.length}件)`);
      totalLogs += logs.length;
      
      for (const log of logs) {
        const errorType = log.errorType || determineErrorType(log.error);
        const tweetId = log.tweetId;
        
        if (tweetId === 'main' || tweetId === 'process') continue; // メイン処理のエラーはスキップ

        switch (errorType) {
          case 'not_found':
            notFoundIds.add(tweetId);
            break;
          case 'sensitive_content':
            sensitiveIds.add(tweetId);
            break;
          case 'parse':
            parseErrorIds.add(tweetId);
            break;
          default:
            otherSkipIds.add(tweetId);
        }
      }
    } catch (error) {
      console.error(`ログファイルの処理エラー: ${logFile} - ${error.message}`);
    }
  }

  // 既存のスキップIDから、特殊なエラーのIDを除外
  const allSpecialIds = new Set([
    ...Array.from(notFoundIds),
    ...Array.from(sensitiveIds),
    ...Array.from(parseErrorIds)
  ]);
  
  const filteredSkipIds = skipIds.filter(id => !allSpecialIds.has(id));
  
  // 一般スキップIDと他のエラーIDをマージ
  const finalSkipIds = Array.from(new Set([
    ...filteredSkipIds,
    ...Array.from(otherSkipIds)
  ]));

  // 結果を保存
  fs.writeFileSync(CONFIG.SKIP_LIST_PATH, JSON.stringify(finalSkipIds), CONFIG.ENCODING);
  fs.writeFileSync(CONFIG.NOT_FOUND_LIST_PATH, JSON.stringify(Array.from(notFoundIds)), CONFIG.ENCODING);
  fs.writeFileSync(CONFIG.SENSITIVE_LIST_PATH, JSON.stringify(Array.from(sensitiveIds)), CONFIG.ENCODING);
  fs.writeFileSync(CONFIG.PARSE_ERROR_LIST_PATH, JSON.stringify(Array.from(parseErrorIds)), CONFIG.ENCODING);

  // 結果を表示
  console.log('スキップリストの修正が完了しました。');
  console.log(`処理したログエントリ: ${totalLogs}件`);
  console.log(`存在しないツイート: ${notFoundIds.size}件`);
  console.log(`センシティブコンテンツ: ${sensitiveIds.size}件`);
  console.log(`解析エラー: ${parseErrorIds.size}件`);
  console.log(`その他のエラー: ${otherSkipIds.size}件`);
  console.log(`更新後の一般スキップリスト: ${finalSkipIds.length}件`);
}

// プログラム実行
fixSkipLists().catch(error => {
  console.error('エラーが発生しました:', error);
});