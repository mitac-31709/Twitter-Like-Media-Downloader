const cliProgress = require('cli-progress');
const readline = require('readline');
const chalk = require('chalk');
const { CONFIG } = require('../config/config');

// ANSIカラーコードの定義
const ANSI_COLORS = {
  reset: '\x1b[0m',
  // 前景色（文字色）
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',
  // 背景色
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
  // スタイル
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m'
};

/**
 * テキストにカラーを適用するユーティリティ関数
 * @param {string} text - 装飾するテキスト
 * @param {string} colorCode - ANSIカラーコード
 * @returns {string} カラーが適用されたテキスト
 */
function colorize(text, colorCode) {
  return `${colorCode}${text}${ANSI_COLORS.reset}`;
}

/**
 * ファイルサイズを人間が読みやすい形式にフォーマットする
 * @param {number} bytes - ファイルサイズ（バイト）
 * @param {number} decimals - 小数点以下の桁数
 * @return {string} 人間が読みやすい形式のファイルサイズ
 */
function formatFileSize(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

/**
 * 時間をフォーマットする関数
 * @param {number} milliseconds - ミリ秒
 * @return {string} フォーマットされた時間表示
 */
function formatTime(milliseconds) {
  if (!milliseconds || milliseconds < 0) return '00:00';
  
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
  }
}

/**
 * カラフルなプログレスバーを生成する
 * @param {number} progress - 進捗（0-100）
 * @param {number} barLength - プログレスバーの長さ
 * @param {Object} options - 追加オプション
 * @return {string} プログレスバー文字列
 */
function generateProgressBar(progress, barLength = 30, options = {}) {
  // 進捗が範囲内に収まるように調整
  const normalizedProgress = Math.max(0, Math.min(100, progress));
  
  // 完了したセグメントの数を計算
  const filledLength = Math.round((barLength * normalizedProgress) / 100);
  
  // プログレスバーを構築
  const completeChar = options.completeChar || '█';
  const incompleteChar = options.incompleteChar || '░';
  
  // カラー設定（オプション）
  const completeColor = options.completeColor || 'green';
  const incompleteColor = options.incompleteColor || 'gray';
  
  // 色付きのバー部分を生成
  const bar = 
    chalk[completeColor](completeChar.repeat(filledLength)) + 
    chalk[incompleteColor](incompleteChar.repeat(barLength - filledLength));
  
  // パーセンテージを追加（右寄せ）
  const percent = normalizedProgress.toFixed(1).padStart(5) + '%';
  
  return `[${bar}] ${chalk.bold(percent)}`;
}

/**
 * ダウンロード状態を表すプログレスバーを生成
 * @param {Object} downloadInfo - ダウンロード情報
 * @return {string} フォーマットされたプログレス情報
 */
function generateDownloadProgress(downloadInfo) {
  if (!downloadInfo || !downloadInfo.currentSize) {
    return '';
  }
  
  const { filename, currentSize, totalSize } = downloadInfo;
  
  // 進捗率を計算
  const progress = totalSize > 0 ? (currentSize / totalSize) * 100 : 0;
  
  // プログレスバーを生成
  const progressBar = generateProgressBar(progress, 20, { 
    completeColor: 'cyan', 
    incompleteColor: 'gray' 
  });
  
  // ダウンロード速度情報（この実装では省略）
  
  // ファイル情報を追加
  const sizeInfo = `${formatFileSize(currentSize)}${totalSize ? ' / ' + formatFileSize(totalSize) : ''}`;
  
  // ファイル名は短縮表示
  const truncatedFilename = filename.length > 30 
    ? filename.substring(0, 15) + '...' + filename.substring(filename.length - 15) 
    : filename;
  
  return `${progressBar} ${chalk.blue(truncatedFilename)} ${chalk.yellow(sizeInfo)}`;
}

/**
 * メインプログレスバーと詳細情報を含む複合プログレスを生成
 * @param {string} status - 現在の状態メッセージ
 * @param {number} progress - 全体の進捗（0-100）
 * @param {Object} details - 詳細情報（ダウンロード情報など）
 * @return {string} フォーマットされたプログレス情報
 */
function generateComplexProgress(status, progress, details = null) {
  // メインプログレスバー
  const mainBar = generateProgressBar(progress, 40, {
    completeColor: 'green',
    incompleteColor: 'gray'
  });
  
  // 状態メッセージ
  const statusMsg = chalk.bold(status);
  
  // 基本的なプログレス表示
  let progressOutput = `${mainBar} ${statusMsg}`;
  
  // 詳細情報がある場合は追加
  if (details) {
    // ダウンロード情報がある場合
    if (details.filename && (details.currentSize !== undefined)) {
      const downloadProgress = generateDownloadProgress(details);
      if (downloadProgress) {
        progressOutput += '\n  ' + downloadProgress;
      }
    }
    
    // その他の詳細情報があれば追加可能
  }
  
  return progressOutput;
}

/**
 * プログレスバーを表示する（コンソール出力）
 * @param {string} status - 状態メッセージ
 * @param {number} progress - 進捗（0-100）
 * @param {Object} details - 追加の詳細情報
 */
function displayProgress(status, progress, details = null) {
  if (!CONFIG.SHOW_PROGRESS) return;
  
  // 前の行をクリアして新しいプログレスを表示
  process.stdout.write('\r\x1b[K');
  
  const progressOutput = generateComplexProgress(status, progress, details);
  process.stdout.write(progressOutput);
  
  // 進捗が100%なら改行を入れる
  if (progress >= 100) {
    process.stdout.write('\n');
  }
}

/**
 * 複数行のプログレスバーをクリアする
 * @param {number} lines - クリアする行数
 */
function clearMultilineProgress(lines = 2) {
  if (!CONFIG.SHOW_PROGRESS) return;
  
  // 指定された行数だけカーソルを上に移動し、その行をクリア
  for (let i = 0; i < lines; i++) {
    process.stdout.write('\r\x1b[K\x1b[1A');
  }
  // 最後に現在行をクリア
  process.stdout.write('\r\x1b[K');
}

module.exports = {
  ProgressBar,
  MultiProgressBar,
  createLogger,
  createMultiBarLogger,
  formatFileSize,
  formatTime,
  colorize,
  ANSI_COLORS,
  generateProgressBar,
  generateDownloadProgress,
  generateComplexProgress,
  displayProgress,
  clearMultilineProgress
};
