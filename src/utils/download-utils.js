// ファイルダウンロード関連のユーティリティ関数
const fs = require('fs');
const https = require('https');
const http = require('http');
const { CONFIG } = require('../config/config');
const { logError } = require('./error-handlers');

/**
 * URLからファイルをダウンロードする関数
 * @param {string} url - ダウンロードするファイルのURL
 * @param {string} outputPath - 保存先のパス
 * @param {Object} options - オプション
 * @returns {Promise<void>}
 */
function downloadFile(url, outputPath, options = {}) {
  const { 
    timeout = CONFIG.DOWNLOAD_TIMEOUT || 30000,
    onProgress = null,
    headers = {}
  } = options;

  return new Promise((resolve, reject) => {
    // URLが有効かチェック
    if (!url || typeof url !== 'string') {
      return reject(new Error('無効なURL'));
    }

    // URLプロトコルの判定
    const isHttps = url.startsWith('https:');
    const client = isHttps ? https : http;
    
    // カスタムヘッダーの設定
    const requestHeaders = {
      'User-Agent': CONFIG.USER_AGENT || 'Node.js',
      ...headers
    };

    // リクエスト送信
    const req = client.get(url, { 
      headers: requestHeaders,
      timeout: timeout
    }, (res) => {
      // リダイレクトの処理
      if (res.statusCode === 301 || res.statusCode === 302) {
        const redirectUrl = res.headers.location;
        
        // 再帰的にリダイレクト先をダウンロード (最大5回まで)
        if (options._redirectCount >= 5) {
          return reject(new Error('リダイレクトが多すぎます'));
        }
        
        return downloadFile(redirectUrl, outputPath, {
          ...options,
          _redirectCount: (options._redirectCount || 0) + 1
        })
        .then(resolve)
        .catch(reject);
      }
      
      // エラーステータスコードの処理
      if (res.statusCode < 200 || res.statusCode >= 400) {
        return reject(new Error(`HTTP エラー: ${res.statusCode}`));
      }

      // ファイルサイズの取得
      const totalSize = parseInt(res.headers['content-length'], 10) || 0;
      let downloadedBytes = 0;
      let lastReportedProgress = 0;

      // 出力ファイルストリームの作成
      const fileStream = fs.createWriteStream(outputPath);
      
      // エラーイベント
      res.on('error', (error) => {
        // ファイルストリームをクローズ
        fileStream.close();
        
        // 不完全なファイルを削除
        fs.unlink(outputPath, () => {});
        
        reject(new Error(`ダウンロード中にエラーが発生しました: ${error.message}`));
      });

      // データイベント（チャンクの受信）
      res.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        
        // 進捗レポート（頻度を制限）
        if (onProgress && totalSize > 0) {
          const currentProgress = Math.floor((downloadedBytes / totalSize) * 100);
          if (currentProgress !== lastReportedProgress) {
            lastReportedProgress = currentProgress;
            onProgress(downloadedBytes, totalSize);
          }
        } else if (onProgress) {
          // ファイルサイズが不明の場合は定期的に報告
          onProgress(downloadedBytes, 0);
        }
      });

      // 受信完了イベント
      res.on('end', () => {
        fileStream.end();
      });
      
      // ファイルストリームのイベント
      fileStream.on('finish', () => {
        // 最終進捗を報告
        if (onProgress) {
          onProgress(downloadedBytes, totalSize);
        }
        resolve();
      });
      
      fileStream.on('error', (error) => {
        // ファイルストリームをクローズ
        fileStream.close();
        
        // 不完全なファイルを削除
        fs.unlink(outputPath, () => {});
        
        reject(new Error(`ファイル書き込み中にエラーが発生しました: ${error.message}`));
      });
      
      // データをファイルにパイプ
      res.pipe(fileStream);
    });

    // リクエストのエラーイベント
    req.on('error', (error) => {
      reject(new Error(`ネットワークエラー: ${error.message}`));
    });

    // タイムアウト処理
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`リクエストがタイムアウトしました (${timeout}ms)`));
    });
  });
}

/**
 * ファイルの拡張子を取得する
 * @param {string} url - ファイルのURL
 * @param {string} contentType - Content-Typeヘッダー
 * @returns {string} ファイル拡張子（先頭のドット付き）
 */
function getFileExtension(url, contentType) {
  // Content-Typeから拡張子を取得
  const contentTypeMap = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/bmp': '.bmp',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov'
  };
  
  // Content-Typeが存在し、マッピングが存在する場合
  if (contentType && contentTypeMap[contentType.toLowerCase()]) {
    return contentTypeMap[contentType.toLowerCase()];
  }
  
  // URLから拡張子を取得
  if (url) {
    // URLからクエリパラメータを削除
    const urlWithoutQuery = url.split('?')[0];
    
    // 拡張子を抽出（最後の.以降）
    const match = urlWithoutQuery.match(/\.([^./\\]+)$/);
    if (match && match[1]) {
      return `.${match[1].toLowerCase()}`;
    }
  }
  
  // 拡張子が特定できない場合はデフォルト値
  if (contentType) {
    // videoコンテンツの場合はmp4、それ以外はjpgをデフォルトとする
    if (contentType.startsWith('video/')) {
      return '.mp4';
    }
  }
  
  return '.jpg'; // デフォルト拡張子
}

module.exports = {
  downloadFile,
  getFileExtension
};