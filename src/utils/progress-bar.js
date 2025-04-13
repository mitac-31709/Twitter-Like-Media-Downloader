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

// カラーテーマの定義
const COLOR_THEMES = {
  default: {
    progressBar: {
      complete: 'green',
      incomplete: 'gray',
      border: 'white'
    },
    status: 'cyan',
    filename: 'blue',
    size: 'yellow',
    counter: 'yellow',
    type: 'green',
    item: 'white',
    stats: {
      completed: 'green',
      errors: 'red',
      skipped: 'yellow',
      api: 'cyan'
    }
  },
  light: {
    progressBar: {
      complete: 'green',
      incomplete: 'dim',
      border: 'dim'
    },
    status: 'blue',
    filename: 'blue',
    size: 'black',
    counter: 'black',
    type: 'blue',
    item: 'black',
    stats: {
      completed: 'green',
      errors: 'red',
      skipped: 'magenta',
      api: 'blue'
    }
  },
  dark: {
    progressBar: {
      complete: 'brightGreen',
      incomplete: 'gray',
      border: 'brightWhite'
    },
    status: 'brightCyan',
    filename: 'brightBlue',
    size: 'brightYellow',
    counter: 'brightYellow',
    type: 'brightGreen',
    item: 'brightWhite',
    stats: {
      completed: 'brightGreen',
      errors: 'brightRed',
      skipped: 'brightYellow',
      api: 'brightCyan'
    }
  }
};

// プログレスバースタイルの定義
const PROGRESS_STYLES = {
  bar: {
    complete: '█',
    incomplete: '░'
  },
  dots: {
    complete: '•',
    incomplete: '·'
  },
  braille: {
    complete: '⣿',
    incomplete: '⠄'
  },
  blocks: {
    complete: '■',
    incomplete: '□'
  },
  hash: {
    complete: '#',
    incomplete: '-'
  },
  arrow: {
    complete: '▶',
    incomplete: '∙'
  }
};

// 現在のテーマ
let currentTheme = COLOR_THEMES[CONFIG.UX?.COLOR_THEME || 'default'];

// 前回の進捗表示の行数
let previousProgressLines = 0;

// インタラクティブモードの状態管理
const interactiveState = {
  active: false,
  paused: false,
  speedFactor: 1.0,
  lastKeyPress: null,
  keyListener: null
};

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
 * カラーテーマを変更する
 * @param {string} themeName - テーマ名 ('default', 'light', 'dark')
 */
function setColorTheme(themeName) {
  if (COLOR_THEMES[themeName]) {
    currentTheme = COLOR_THEMES[themeName];
    return true;
  }
  return false;
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
  
  // プログレスバースタイルを取得
  const style = PROGRESS_STYLES[CONFIG.UX?.PROGRESS_STYLE] || PROGRESS_STYLES.bar;
  const completeChar = options.completeChar || style.complete;
  const incompleteChar = options.incompleteChar || style.incomplete;
  
  const completeColor = options.completeColor || currentTheme.progressBar.complete;
  const incompleteColor = options.incompleteColor || currentTheme.progressBar.incomplete;
  const borderColor = options.borderColor || currentTheme.progressBar.border;
  
  const filledBar = colorize(completeChar.repeat(completed), ANSI_COLORS[completeColor]);
  const emptyBar = colorize(incompleteChar.repeat(remaining), ANSI_COLORS[incompleteColor]);
  
  const progressBrackets = colorize('[]', ANSI_COLORS[borderColor]);
  const progressBorder = `${progressBrackets[0]}${filledBar}${emptyBar}${progressBrackets[1]}`;
  
  const percentColor = progress >= 100 ? 'green' : 'yellow';
  return `${progressBorder} ${colorize(`${progress}%`.padStart(4), ANSI_COLORS[percentColor])}`;
}

/**
 * ダウンロード進捗の詳細情報を生成する
 * @param {Object} details - 詳細情報オブジェクト
 * @returns {string} ダウンロード進捗の文字列
 */
function generateDownloadProgress(details) {
  if (!details.filename || details.currentSize === undefined) return '';
  
  const sizeInfo = `${formatFileSize(details.currentSize)}${details.totalSize ? ' / ' + formatFileSize(details.totalSize) : ''}`;
  
  // ファイル名表示スタイルに基づいて表示
  const filename = details.filename;
  let displayFilename = filename;
  
  switch(CONFIG.UX?.FILENAME_DISPLAY || 'short') {
    case 'short':
      displayFilename = filename.length > 30 
        ? filename.substring(0, 15) + '...' + filename.substring(filename.length - 15) 
        : filename;
      break;
    case 'id-only':
      // IDだけを表示（例: 123456789.jpg → 123456789）
      const match = filename.match(/(\d+)/);
      displayFilename = match ? match[1] : filename;
      break;
    // fullの場合はそのまま表示
  }
  
  return `${colorize(displayFilename, ANSI_COLORS[currentTheme.filename])} ${colorize(sizeInfo, ANSI_COLORS[currentTheme.size])}`;
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
    completeColor: currentTheme.progressBar.complete,
    incompleteColor: currentTheme.progressBar.incomplete,
    borderColor: currentTheme.progressBar.border
  });

  // 状態メッセージ（APT風のフォーマット）
  const statusMsg = colorize(status, ANSI_COLORS[currentTheme.status]);
  
  // インタラクティブモードの状態表示
  let interactiveInfo = '';
  if (CONFIG.UX?.INTERACTIVE && interactiveState.active) {
    if (interactiveState.paused) {
      interactiveInfo = ` ${colorize('[一時停止中]', ANSI_COLORS.yellow)}`;
    } else if (interactiveState.speedFactor !== 1.0) {
      interactiveInfo = ` ${colorize(`[速度: x${interactiveState.speedFactor.toFixed(1)}]`, ANSI_COLORS.cyan)}`;
    }
  }
  
  // 処理詳細を表示（2行目）
  let statusLine = '';
  if (details) {
    // カウンター表示
    if (details.counter) {
      statusLine += `${colorize(details.counter, ANSI_COLORS[currentTheme.counter])} `;
    }

    // 処理タイプ表示
    if (details.type) {
      statusLine += `${colorize(details.type, ANSI_COLORS[currentTheme.type])} `;
    }

    // 処理アイテム
    if (details.item) {
      statusLine += `${colorize(details.item, ANSI_COLORS[currentTheme.item])} `;
    }
  }

  // 進捗表示（1行目）
  const progressText = [
    mainBar,
    ` ${progress}%`,
    statusMsg,
    interactiveInfo
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
  if (details?.stats && CONFIG.UX?.SHOW_DETAILED_STATS) {
    const { downloaded, errors, skipped, apiCalls } = details.stats;
    const statsLine = [
      `${colorize('完了', ANSI_COLORS[currentTheme.stats.completed])}: ${downloaded}`,
      `${colorize('エラー', ANSI_COLORS[currentTheme.stats.errors])}: ${errors}`,
      `${colorize('スキップ', ANSI_COLORS[currentTheme.stats.skipped])}: ${skipped}`,
      `${colorize('API', ANSI_COLORS[currentTheme.stats.api])}: ${apiCalls}`
    ].join(' | ');
    output += `\n${colorize('━'.repeat(process.stdout.columns || 80), ANSI_COLORS.dim)}\n${statsLine}`;
  }

  // インタラクティブモードのヘルプ（最初の数回だけ表示）
  if (CONFIG.UX?.INTERACTIVE && interactiveState.active && interactiveState.lastKeyPress === null) {
    output += `\n${colorize('ヘルプ: [スペース] 一時停止/再開 [+/-] 速度調整 [q] 終了', ANSI_COLORS.dim)}`;
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

/**
 * 通知音を再生する
 * @param {string} type - 通知タイプ ('success', 'error', 'warning')
 */
function playNotification(type) {
  if (!CONFIG.UX?.SOUND_NOTIFICATIONS) return;
  
  // プラットフォームに依存しない簡易的な通知音
  let beepCode;
  switch (type) {
    case 'success':
      // 成功音（連続ビープ：高音 → さらに高音）
      beepCode = '\x07\x07';
      break;
    case 'error':
      // エラー音（連続ビープ：低音 → 高音 → 低音）
      beepCode = '\x07\x07\x07';
      break;
    case 'warning':
      // 警告音（単一ビープ）
      beepCode = '\x07';
      break;
    default:
      beepCode = '\x07';
  }
  
  process.stdout.write(beepCode);
}

/**
 * インタラクティブモードを有効化する
 * （キーボードショートカットでの操作を可能にする）
 * @param {Object} options - オプション
 */
function enableInteractiveMode(options = {}) {
  if (!CONFIG.UX?.INTERACTIVE || interactiveState.active) return false;
  
  // インタラクティブモードの状態を初期化
  interactiveState.active = true;
  interactiveState.paused = false;
  interactiveState.speedFactor = 1.0;
  interactiveState.lastKeyPress = null;
  
  // stdin設定
  if (!process.stdin.isTTY) return false;
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  
  // キー入力ハンドラーを設定
  interactiveState.keyListener = (key) => {
    interactiveState.lastKeyPress = Date.now();
    
    // Ctrl+C で終了
    if (key === '\u0003') {
      process.exit();
    }
    
    // スペースで一時停止/再開
    if (key === ' ') {
      interactiveState.paused = !interactiveState.paused;
      if (options.onPauseToggle) {
        options.onPauseToggle(interactiveState.paused);
      }
    }
    
    // +/-で速度調整
    if (key === '+' || key === '=') {
      interactiveState.speedFactor = Math.min(5.0, interactiveState.speedFactor + 0.5);
      if (options.onSpeedChange) {
        options.onSpeedChange(interactiveState.speedFactor);
      }
    }
    if (key === '-' || key === '_') {
      interactiveState.speedFactor = Math.max(0.5, interactiveState.speedFactor - 0.5);
      if (options.onSpeedChange) {
        options.onSpeedChange(interactiveState.speedFactor);
      }
    }
    
    // qで終了
    if (key === 'q' || key === 'Q') {
      if (options.onQuit) {
        options.onQuit();
      }
    }
    
    // その他のキー入力
    if (options.onKeyPress) {
      options.onKeyPress(key);
    }
  };
  
  // キー入力イベントリスナーを追加
  process.stdin.on('data', interactiveState.keyListener);
  
  return true;
}

/**
 * インタラクティブモードを無効化する
 */
function disableInteractiveMode() {
  if (!interactiveState.active) return;
  
  // イベントリスナーを削除
  if (interactiveState.keyListener) {
    process.stdin.removeListener('data', interactiveState.keyListener);
  }
  
  // stdin設定を元に戻す
  process.stdin.setRawMode(false);
  process.stdin.pause();
  
  // 状態をリセット
  interactiveState.active = false;
  interactiveState.paused = false;
  interactiveState.speedFactor = 1.0;
  interactiveState.lastKeyPress = null;
  interactiveState.keyListener = null;
}

/**
 * 現在のインタラクティブモードの状態を取得する
 * @returns {Object} 状態オブジェクト
 */
function getInteractiveState() {
  return { ...interactiveState };
}

module.exports = {
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
  getInteractiveState,
  setColorTheme
};
