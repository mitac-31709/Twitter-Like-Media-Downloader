// スキップリストを修正するプログラム
const fs = require('fs');
const path = require('path');

// ログディレクトリのパス
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// 各種リストのファイルパス
const SKIP_IDS_FILE = path.join(logsDir, 'skip-ids.json');
const NOT_FOUND_IDS_FILE = path.join(logsDir, 'not-found-ids.json');
const SENSITIVE_IDS_FILE = path.join(logsDir, 'sensitive-ids.json');
const PARSE_ERROR_IDS_FILE = path.join(logsDir, 'parse-error-ids.json');

// エラーログファイルを取得
function getErrorLogFiles() {
  return fs.readdirSync(logsDir)
    .filter(file => file.startsWith('error-log-') && file.endsWith('.json'))
    .map(file => path.join(logsDir, file));
}

// エラータイプを判定する関数
function determineErrorType(error) {
  if (error.includes('Tweet not found')) {
    return 'not_found';
  } else if (error.includes('sensitive content')) {
    return 'sensitive_content';
  } else if (error.includes('Cannot read properties of undefined')) {
    return 'parse_error';
  } else {
    return 'other';
  }
}

// メイン処理
async function fixSkipLists() {
  console.log('スキップリストの修正を開始します...');

  // 既存のスキップリストを読み込む
  let skipIds = [];
  if (fs.existsSync(SKIP_IDS_FILE)) {
    try {
      skipIds = JSON.parse(fs.readFileSync(SKIP_IDS_FILE, 'utf8'));
      console.log(`既存のスキップリスト: ${skipIds.length}件`);
    } catch (error) {
      console.error(`スキップリストの読み込みエラー: ${error.message}`);
      skipIds = [];
    }
  }

  // 各カテゴリのIDリスト
  const notFoundIds = new Set();
  const sensitiveIds = new Set();
  const parseErrorIds = new Set();
  const otherSkipIds = new Set();

  // エラーログファイルを処理
  let totalLogs = 0;
  const errorLogFiles = getErrorLogFiles();
  
  for (const logFile of errorLogFiles) {
    try {
      const logs = JSON.parse(fs.readFileSync(logFile, 'utf8'));
      console.log(`ログファイル処理中: ${logFile} (${logs.length}件)`);
      totalLogs += logs.length;
      
      for (const log of logs) {
        const errorType = determineErrorType(log.error);
        const tweetId = log.tweetId;
        
        if (tweetId === 'main') continue; // メイン処理のエラーはスキップ

        switch (errorType) {
          case 'not_found':
            notFoundIds.add(tweetId);
            break;
          case 'sensitive_content':
            sensitiveIds.add(tweetId);
            break;
          case 'parse_error':
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
  fs.writeFileSync(SKIP_IDS_FILE, JSON.stringify(finalSkipIds), 'utf8');
  fs.writeFileSync(NOT_FOUND_IDS_FILE, JSON.stringify(Array.from(notFoundIds)), 'utf8');
  fs.writeFileSync(SENSITIVE_IDS_FILE, JSON.stringify(Array.from(sensitiveIds)), 'utf8');
  fs.writeFileSync(PARSE_ERROR_IDS_FILE, JSON.stringify(Array.from(parseErrorIds)), 'utf8');

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