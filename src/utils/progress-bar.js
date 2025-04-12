const readline = require('readline');
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
  underline: '\x1b[4m',
  blink: '\x1b[5m',
  inverse: '\x1b[7m',
  hidden: '\x1b[8m',
  strikethrough: '\x1b[9m',
  // カラーマッピング（名前から実際のコードへの変換用）
  gray: '\x1b[2m'
};

// 前回の進捗表示の行数
let previousProgressLines = 0;

/**
 * テキストにカラーを適用するユーティリティ関数
 * @param {string} text - 装飾するテキスト
 * @param {string} color - 色コード、またはカラー名
 * @returns {string} カラーが適用されたテキスト
 */
function colorize(text, color) {
  const colorCode = ANSI_COLORS[color] || color || ANSI_COLORS.reset;
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
 * 複数行のプログレスバーをクリアする
 * @param {number} lines - クリアする行数（指定がない場合はpreviousProgressLinesを使用）
 */
function clearMultilineProgress(lines = null) {
  if (!CONFIG.SHOW_PROGRESS) return;
  
  // 行数が指定されていない場合は前回の行数を使用（最小1行）
  const linesToClear = lines !== null ? lines : Math.max(1, previousProgressLines);
  
  // 現在行をまずクリア
  process.stdout.write('\r\x1b[K');
  
  // 複数行ある場合は、上に移動しながら各行をクリア
  if (linesToClear > 1) {
    for (let i = 1; i < linesToClear; i++) {
      // 1行上に移動してクリア
      process.stdout.write('\x1b[1A\r\x1b[K');
    }
  }
  
  // 進捗表示の行数をリセット
  previousProgressLines = 0;
}

/**
 * プログレスバーを表示する（コンソール出力）
 * @param {string} status - 状態メッセージ
 * @param {number} percent - 進捗（0-100）
 * @param {Object} details - 追加の詳細情報
 * @param {number} [width=30] - プログレスバーの幅
 */
function displayProgress(status, percent, details = null, width = 30) {
  if (!CONFIG.SHOW_PROGRESS) return;
  
  // 現在行をクリア
  process.stdout.write('\r\x1b[K');

  // 進捗バーを計算
  const completed = Math.floor(percent / 100 * width);
  const remaining = width - completed;
  
  // 塗りつぶした部分と空の部分に分けて表示
  const completeChar = '█';
  const incompleteChar = '░';
  
  const filledBar = colorize(completeChar.repeat(completed), ANSI_COLORS.green);
  const emptyBar = colorize(incompleteChar.repeat(remaining), ANSI_COLORS.dim);
  const percentStr = colorize(`${percent}%`.padStart(4), percent >= 100 ? ANSI_COLORS.green : ANSI_COLORS.yellow);
  
  // 進捗バーを表示
  const progressBar = `[${filledBar}${emptyBar}] ${percentStr} `;
  
  // 状態メッセージをボールド表示
  const statusMsg = colorize(status, ANSI_COLORS.bold);
  
  // 基本的なプログレス表示
  let progressOutput = `${progressBar} ${statusMsg}`;
  
  // 詳細情報がある場合は追加
  let currentLines = 1;
  if (details && details.filename && details.currentSize !== undefined) {
    const sizeInfo = `${formatFileSize(details.currentSize)}${details.totalSize ? ' / ' + formatFileSize(details.totalSize) : ''}`;
    
    // ファイル名は短縮表示
    const filename = details.filename;
    const truncatedFilename = filename.length > 30 
      ? filename.substring(0, 15) + '...' + filename.substring(filename.length - 15) 
      : filename;
    
    progressOutput += `\n  ${colorize(truncatedFilename, ANSI_COLORS.blue)} ${colorize(sizeInfo, ANSI_COLORS.yellow)}`;
    currentLines = 2;  // 2行表示する
  }
  
  // 行数を記録
  previousProgressLines = currentLines;
  
  process.stdout.write(progressOutput);
  
  // 進捗が100%なら改行を入れて表示をクリア
  if (percent >= 100) {
    process.stdout.write('\n');
    previousProgressLines = 0;
  }
}

// スピナーのアニメーションパターン
const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinnerInterval;
let currentSpinnerFrame = 0;

/**
 * スピナーを表示する
 * @param {string} text - スピナーと共に表示するテキスト
 * @returns {object} スピナー制御オブジェクト
 */
function createSpinner(text) {
  // 既存のスピナーを停止
  if (spinnerInterval) {
    clearInterval(spinnerInterval);
    process.stdout.write('\r\x1b[K');
  }
  
  // 新しいスピナーを開始
  const spinner = {
    text,
    stopped: false
  };
  
  spinnerInterval = setInterval(() => {
    if (spinner.stopped) return;
    
    const frame = spinnerFrames[currentSpinnerFrame];
    process.stdout.write(`\r${colorize(frame, ANSI_COLORS.cyan)} ${spinner.text}`);
    
    currentSpinnerFrame = (currentSpinnerFrame + 1) % spinnerFrames.length;
  }, 100);
  
  return spinner;
}

/**
 * スピナーを停止する
 * @param {object} spinner - createSpinnerで作成したスピナーオブジェクト
 * @param {string} [finalText] - スピナー停止時に表示する最終テキスト（指定しない場合は元のテキスト）
 */
function stopSpinner(spinner, finalText) {
  if (!spinner) return;
  
  spinner.stopped = true;
  clearInterval(spinnerInterval);
  
  // 完了表示
  const displayText = finalText || spinner.text;
  process.stdout.write(`\r${colorize('✓', ANSI_COLORS.green)} ${displayText}\n`);
}

module.exports = {
  formatFileSize,
  formatTime,
  colorize,
  ANSI_COLORS,
  displayProgress,
  clearMultilineProgress,
  createSpinner,
  stopSpinner
};
