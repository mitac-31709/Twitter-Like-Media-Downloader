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
 * プログレスバーを生成する
 * @param {number} progress - 進捗（0-100）
 * @param {number} width - プログレスバーの幅
 * @param {Object} options - オプション（色など）
 * @returns {string} プログレスバー文字列
 */
function generateProgressBar(progress, width, options = {}) {
  const completed = Math.floor(progress / 100 * width);
  const remaining = width - completed;
  
  const completeChar = '█';
  const incompleteChar = '░';
  
  const completeColor = options.completeColor || 'green';
  const incompleteColor = options.incompleteColor || 'dim';
  
  const filledBar = colorize(completeChar.repeat(completed), ANSI_COLORS[completeColor]);
  const emptyBar = colorize(incompleteChar.repeat(remaining), ANSI_COLORS[incompleteColor]);
  
  return `[${filledBar}${emptyBar}] ${colorize(`${progress}%`.padStart(4), progress >= 100 ? ANSI_COLORS.green : ANSI_COLORS.yellow)}`;
}

/**
 * ダウンロード進捗の詳細情報を生成する
 * @param {Object} details - 詳細情報オブジェクト
 * @returns {string} ダウンロード進捗の文字列
 */
function generateDownloadProgress(details) {
  if (!details.filename || details.currentSize === undefined) return '';
  
  const sizeInfo = `${formatFileSize(details.currentSize)}${details.totalSize ? ' / ' + formatFileSize(details.totalSize) : ''}`;
  
  // ファイル名は短縮表示
  const filename = details.filename;
  const truncatedFilename = filename.length > 30 
    ? filename.substring(0, 15) + '...' + filename.substring(filename.length - 15) 
    : filename;
  
  return `${colorize(truncatedFilename, ANSI_COLORS.blue)} ${colorize(sizeInfo, ANSI_COLORS.yellow)}`;
}

/**
 * 複雑なプログレスバーを生成する
 * @param {string} status - 状態メッセージ
 * @param {number} progress - 進捗（0-100）
 * @param {Object} details - 追加の詳細情報
 * @returns {string} プログレスバー文字列
 */
function generateComplexProgress(status, progress, details = null) {
  // メインプログレスバー
  const mainBar = generateProgressBar(progress, 40, {
    completeColor: 'green',
    incompleteColor: 'gray'
  });

  // 状態メッセージ（APT風のフォーマット）
  const statusMsg = colorize(status, ANSI_COLORS.cyan);
  
  // 処理詳細を表示（2行目）
  let statusLine = '';
  if (details) {
    // カウンター表示
    if (details.counter) {
      statusLine += `${colorize(details.counter, ANSI_COLORS.yellow)} `;
    }

    // 処理タイプ表示
    if (details.type) {
      statusLine += `${colorize(details.type, ANSI_COLORS.green)} `;
    }

    // 処理アイテム
    if (details.item) {
      statusLine += `${details.item} `;
    }
  }

  // 進捗表示（1行目）
  const progressText = [
    mainBar,
    ` ${progress}%`,
    statusMsg
  ].join('');

  let output = progressText;

  // 詳細情報（2-3行目）
  if (statusLine) {
    output += `\n${statusLine}`;
  }

  // ダウンロード進捗（3-4行目）
  if (details?.filename && details?.currentSize !== undefined) {
    const downloadInfo = generateDownloadProgress(details);
    if (downloadInfo) {
      output += `\n  ${colorize('↳', ANSI_COLORS.dim)} ${downloadInfo}`;
    }
  }

  // 統計情報（最下行）
  if (details?.stats) {
    const { downloaded, errors, skipped, apiCalls } = details.stats;
    const statsLine = [
      `${colorize('完了', ANSI_COLORS.green)}: ${downloaded}`,
      `${colorize('エラー', ANSI_COLORS.red)}: ${errors}`,
      `${colorize('スキップ', ANSI_COLORS.yellow)}: ${skipped}`,
      `${colorize('API', ANSI_COLORS.cyan)}: ${apiCalls}`
    ].join(' | ');
    output += `\n${colorize('━'.repeat(process.stdout.columns || 80), ANSI_COLORS.dim)}\n${statsLine}`;
  }

  return output;
}

/**
 * プログレスバーを表示する（コンソール出力）
 * @param {string} status - 状態メッセージ
 * @param {number} progress - 進捗（0-100）
 * @param {Object} details - 追加の詳細情報
 */
function displayProgress(status, progress, details = null) {
  if (!CONFIG.SHOW_PROGRESS) return;

  // プログレス情報を生成
  const progressOutput = generateComplexProgress(status, progress, details);
  const lines = progressOutput.split('\n').length;

  // 前の表示をクリア
  clearMultilineProgress(Math.max(previousProgressLines, lines));
  previousProgressLines = lines;

  // 新しいプログレスを表示
  process.stdout.write(progressOutput);
}

/**
 * 複数行のプログレスバーをクリアする
 * @param {number} lines - クリアする行数
 */
function clearMultilineProgress(lines = 2) {
  // カーソルを指定行数分上に移動してクリア
  for (let i = 0; i < lines; i++) {
    process.stdout.write('\x1b[K');  // 現在行をクリア
    if (i < lines - 1) {
      process.stdout.write('\x1b[1A');  // 1行上に移動
    }
  }
  process.stdout.write('\r');  // カーソルを行頭に戻す
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
