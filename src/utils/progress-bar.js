const readline = require('readline');

/**
 * コンソールにプログレスバーを表示するクラス
 */
class ProgressBar {
  constructor(total, options = {}) {
    this.total = total;
    this.current = 0;
    this.barLength = options.barLength || 40;
    this.chars = {
      complete: options.complete || '█',
      incomplete: options.incomplete || '░',
    };
    this.showPercent = options.showPercent !== false;
    this.showCount = options.showCount !== false;
    this.startTime = null;
    this.showElapsedTime = options.showElapsedTime !== false;
  }

  /**
   * プログレスバーを開始
   */
  start() {
    this.startTime = Date.now();
    this.update(0);
    return this;
  }

  /**
   * 進捗を更新
   * @param {number} current - 現在の進捗
   */
  update(current) {
    if (current !== undefined) {
      this.current = current;
    } else {
      this.current++;
    }

    const percentage = this.current / this.total;
    const completedLength = Math.round(this.barLength * percentage);
    const incompletedLength = this.barLength - completedLength;

    const bar = this.chars.complete.repeat(completedLength) + 
                this.chars.incomplete.repeat(incompletedLength);
    
    let text = `[${bar}]`;
    
    if (this.showPercent) {
      text += ` ${Math.round(percentage * 100)}%`;
    }
    
    if (this.showCount) {
      text += ` (${this.current}/${this.total})`;
    }
    
    if (this.showElapsedTime && this.startTime) {
      const elapsed = Math.round((Date.now() - this.startTime) / 1000);
      text += ` ${formatTime(elapsed)}`;
    }
    
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(text);
    
    if (this.current >= this.total) {
      process.stdout.write('\n');
    }
    
    return this;
  }
  
  /**
   * 進捗バーの増加
   */
  increment() {
    return this.update(this.current + 1);
  }
}

/**
 * 秒を時:分:秒形式に変換
 * @param {number} seconds - 秒数
 * @return {string} 時:分:秒形式
 */
function formatTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  const parts = [];
  if (hrs > 0) parts.push(`${hrs}h`);
  if (mins > 0) parts.push(`${mins}m`);
  parts.push(`${secs}s`);
  
  return parts.join(' ');
}

module.exports = {
  ProgressBar
};
