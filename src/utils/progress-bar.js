const cliProgress = require('cli-progress');
const readline = require('readline');

/**
 * ファイルサイズをフォーマットする関数
 * @param {number} bytes - バイト数
 * @return {string} フォーマットされたサイズ表示
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * cli-progressを使用したプログレスバーのラッパークラス
 */
class ProgressBar {
  constructor(total, options = {}) {
    // 基本設定
    const barFormat = options.barFormat || 
      '{bar} {percentage}% ({value}/{total}) {duration}';
    
    // プログレスバーオプション
    const progressOptions = {
      format: barFormat,
      barCompleteChar: options.complete || '█',
      barIncompleteChar: options.incomplete || '░',
      hideCursor: true,
      clearOnComplete: true,
      stopOnComplete: true,
      barsize: options.barLength || 40,
      etaBuffer: 10,
      forceRedraw: options.forceRedraw !== false,
      linewrap: false
    };

    // プログレスバーを作成
    this.progressBar = new cliProgress.SingleBar(progressOptions);
    this.total = total;
  }

  /**
   * プログレスバーを開始
   */
  start() {
    this.progressBar.start(this.total, 0);
    return this;
  }

  /**
   * 進捗を更新
   * @param {number} current - 現在の進捗
   * @param {Object} payload - 追加のペイロードデータ
   */
  update(current, payload = {}) {
    if (current !== undefined) {
      this.progressBar.update(current, payload);
    } else {
      this.progressBar.increment(1, payload);
    }
    return this;
  }
  
  /**
   * 進捗バーの増加
   * @param {Object} payload - 追加のペイロードデータ
   */
  increment(payload = {}) {
    this.progressBar.increment(1, payload);
    return this;
  }

  /**
   * プログレスバーを停止
   */
  stop() {
    this.progressBar.stop();
    return this;
  }

  /**
   * パーセントの更新
   * @param {number} percentage - パーセント値
   * @param {Object} payload - 追加のペイロードデータ
   */
  updatePercentage(percentage, payload = {}) {
    const current = Math.floor(this.total * (percentage / 100));
    return this.update(current, payload);
  }

  /**
   * ステータス情報を更新
   * @param {string} status - ステータステキスト
   */
  updateStatus(status) {
    return this.update(undefined, { status });
  }

  /**
   * ファイルサイズ情報を更新
   * @param {number} size - 現在のサイズ（バイト）
   * @param {number} totalSize - 合計サイズ（バイト）
   */
  updateFileSize(size, totalSize) {
    return this.update(undefined, { 
      size: formatFileSize(size),
      totalSize: formatFileSize(totalSize),
      sizeBytes: size,
      totalSizeBytes: totalSize
    });
  }
}

/**
 * マルチプログレスバーの管理クラス
 */
class MultiProgressBar {
  constructor(options = {}) {
    // MultiBarのオプション
    const multiBarOptions = {
      clearOnComplete: options.clearOnComplete !== false,
      hideCursor: true,
      format: options.format || '{bar} {percentage}% | {value}/{total} | {status}',
      barCompleteChar: options.complete || '█',
      barIncompleteChar: options.incomplete || '░',
      // スクロール時の問題を修正するオプション
      forceRedraw: true,
      linewrap: false,
      stopOnComplete: false,
      noTTYOutput: options.noTTYOutput || false,
      emptyOnZero: true,
      synchronousUpdate: true,
      barGlue: '',
      autopadding: true,
      // インジケータ設定 - 上書きモードを強制
      stream: options.stream || process.stdout,
      fps: options.fps || 20,
      barsize: options.barLength || 40,
      // 端末コントロール処理の最適化
      terminalFactory: {
        getCursorPos: () => 0,
        moveCursor: (stream, dx, dy) => {
          readline.moveCursor(stream, dx, dy);
        },
        cursorTo: (stream, x, y) => {
          if (typeof y !== 'number') {
            readline.cursorTo(stream, x);
          } else {
            readline.cursorTo(stream, x, y);
          }
        },
        clearLine: (stream, dir) => {
          readline.clearLine(stream, dir);
        },
        clearScreenDown: (stream) => {
          readline.clearScreenDown(stream);
        }
      }
    };
    
    // MultiBarを作成
    this.multiBar = new cliProgress.MultiBar(multiBarOptions);
    this.bars = {};
    this.isActive = true;
    
    // バッファリングされたログメッセージ
    this.logBuffer = [];
    
    // プログレスバーが停止したときの自動クリーンアップ
    process.on('exit', () => {
      if (this.isActive) {
        this.stop();
      }
    });
  }
  
  /**
   * 新しいプログレスバーを追加
   * @param {string} id - バーの識別子
   * @param {number} total - 合計値
   * @param {Object} options - バーのオプション
   * @param {Object} payload - 初期ペイロードデータ
   */
  addBar(id, total, options = {}, payload = {}) {
    const barFormat = options.format || this.multiBar.options.format;
    
    // 初期ペイロード
    const initialPayload = {
      status: payload.status || 'Pending...',
      ...payload
    };
    
    // バーを作成
    const bar = this.multiBar.create(total, 0, initialPayload, {
      format: barFormat
    });
    
    // バーをIDで保存
    this.bars[id] = bar;
    
    return bar;
  }
  
  /**
   * 全体の進捗バーを作成
   * @param {number} total - 合計値
   */
  createMainBar(total) {
    return this.addBar('main', total, {
      format: '{bar} {percentage}% | 全体進捗: {value}/{total} | 経過: {duration_formatted} | {status}'
    }, { 
      status: '処理開始...' 
    });
  }
  
  /**
   * ファイル処理用の進捗バーを作成
   * @param {string} id - ファイル識別子
   * @param {string} filename - ファイル名
   * @param {number} size - ファイルサイズ（バイト）
   */
  createFileBar(id, filename, size) {
    const formattedSize = formatFileSize(size);
    return this.addBar(id, 100, {
      format: '{bar} {percentage}% | {filename} | {size}/{totalSize} | {status}'
    }, {
      filename: filename,
      size: '0 B',
      totalSize: formattedSize,
      sizeBytes: 0,
      totalSizeBytes: size,
      status: '準備中...'
    });
  }
  
  /**
   * バーを更新
   * @param {string} id - バーの識別子
   * @param {number} value - 現在の進捗
   * @param {Object} payload - 追加のペイロードデータ
   */
  update(id, value, payload = {}) {
    const bar = this.bars[id];
    if (bar && this.isActive) {
      if (value !== undefined) {
        bar.update(value, payload);
      } else {
        bar.increment(0, payload);
      }
    }
    return this;
  }
  
  /**
   * バーのステータスを更新
   * @param {string} id - バーの識別子
   * @param {string} status - ステータステキスト
   */
  updateStatus(id, status) {
    return this.update(id, undefined, { status });
  }
  
  /**
   * ファイルサイズを更新
   * @param {string} id - バーの識別子
   * @param {number} size - 現在のサイズ（バイト）
   */
  updateFileSize(id, size) {
    const bar = this.bars[id];
    if (bar && bar.payload && this.isActive) {
      const totalSize = bar.payload.totalSizeBytes || 0;
      const percentage = totalSize > 0 ? Math.floor((size / totalSize) * 100) : 0;
      
      this.update(id, percentage, {
        size: formatFileSize(size),
        sizeBytes: size
      });
    }
    return this;
  }
  
  /**
   * バーを完了状態にする
   * @param {string} id - バーの識別子
   * @param {string} status - 完了時のステータステキスト
   */
  completeBar(id, status = '完了') {
    const bar = this.bars[id];
    if (bar && this.isActive) {
      bar.update(bar.getTotal(), { status });
    }
    return this;
  }
  
  /**
   * プログレスバーを強制的に再描画
   */
  redraw() {
    if (this.isActive) {
      this.multiBar.update();
    }
    return this;
  }
  
  /**
   * 全てのバーを停止
   */
  stop() {
    this.isActive = false;
    this.multiBar.stop();
    
    // ログバッファをクリア
    this.flushLogBuffer();
    
    // プログレスバーが残らないように、複数行をクリア
    const numBars = Object.keys(this.bars).length;
    if (numBars > 0 && this.multiBar.terminal) {
      const stream = this.multiBar.options.stream || process.stdout;
      
      // 最後に一度画面をクリア
      readline.cursorTo(stream, 0);
      readline.clearScreenDown(stream);
    }
    
    return this;
  }
  
  /**
   * ログバッファをフラッシュ
   * @private
   */
  flushLogBuffer() {
    if (this.logBuffer.length > 0) {
      this.logBuffer.forEach(entry => {
        console[entry.type](...entry.args);
      });
      this.logBuffer = [];
    }
  }
}

/**
 * プログレスバーとコンソールログの干渉を避けるヘルパー関数
 * @param {ProgressBar} progressBar - プログレスバーインスタンス
 */
function createLogger(progressBar) {
  return {
    log: (...args) => {
      // プログレスバーを一時的に消去して通常のログを表示
      progressBar.progressBar.terminal.cursorTo(0);
      progressBar.progressBar.terminal.clearLine();
      console.log(...args);
      // プログレスバーを再描画
      progressBar.progressBar.render();
    },
    info: (...args) => {
      progressBar.progressBar.terminal.cursorTo(0);
      progressBar.progressBar.terminal.clearLine();
      console.info(...args);
      progressBar.progressBar.render();
    },
    warn: (...args) => {
      progressBar.progressBar.terminal.cursorTo(0);
      progressBar.progressBar.terminal.clearLine();
      console.warn(...args);
      progressBar.progressBar.render();
    },
    error: (...args) => {
      progressBar.progressBar.terminal.cursorTo(0);
      progressBar.progressBar.terminal.clearLine();
      console.error(...args);
      progressBar.progressBar.render();
    }
  };
}

/**
 * マルチプログレスバー用のロガー
 * @param {MultiProgressBar} multiBar - MultiProgressBarインスタンス
 * @param {Object} options - ロガーオプション
 */
function createMultiBarLogger(multiBar, options = {}) {
  const useBuffer = options.useBuffer !== false;
  const isDebug = options.debug === true;
  
  // ログを出力する共通関数
  const logWithMultiBar = (type, args) => {
    if (!multiBar.isActive) {
      console[type](...args);
      return;
    }
    
    if (useBuffer) {
      // バッファにログを追加
      multiBar.logBuffer.push({ type, args });
    } else {
      // プログレスバーを一時停止して通常のログを表示
      const stream = multiBar.multiBar.options.stream || process.stdout;
      
      // カーソル位置を保存してバーをクリア
      readline.cursorTo(stream, 0);
      readline.clearScreenDown(stream);
      
      // メッセージを出力
      console[type](...args);
      
      // プログレスバーを再描画
      multiBar.redraw();
    }
  };
  
  return {
    log: (...args) => logWithMultiBar('log', args),
    info: (...args) => logWithMultiBar('info', args),
    warn: (...args) => logWithMultiBar('warn', args),
    error: (...args) => logWithMultiBar('error', args),
    debug: (...args) => {
      if (isDebug) {
        logWithMultiBar('debug', args);
      }
    }
  };
}

module.exports = {
  ProgressBar,
  MultiProgressBar,
  createLogger,
  createMultiBarLogger,
  formatFileSize
};
