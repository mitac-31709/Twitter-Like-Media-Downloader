#!/usr/bin/env node
// Twitter認証情報を設定するためのコマンドラインツール
const readline = require('readline');
const { CONFIG } = require('./config/config');

// 対話型のreadlineインターフェースを作成
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// プロンプトを非同期で表示して入力を待つ関数
function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// メイン実行関数
async function main() {
  console.log('Twitter認証情報設定ツール');
  console.log('===========================');
  console.log('このツールはレート制限を軽減し、センシティブコンテンツにアクセスするためのTwitter認証情報を設定します。');
  console.log('認証情報は.twitter-credentials.jsonファイルに保存されます。\n');
  
  // 現在の設定状態を表示
  console.log('【現在の設定状態】');
  console.log(`・認証ヘッダー (Authorization): ${CONFIG.TWITTER_AUTH ? '設定済み' : '未設定'}`);
  console.log(`・クッキー情報 (Cookie): ${CONFIG.TWITTER_COOKIE ? '設定済み' : '未設定'}`);
  console.log(`・プロキシ設定 (Proxy): ${CONFIG.TWITTER_PROXY ? CONFIG.TWITTER_PROXY : '未設定'}`);
  console.log();

  // Authorization headerの設定（オプション）
  console.log('1. 認証ヘッダーの設定（オプション）');
  console.log('   省略した場合、パッケージのデフォルト値が使用されます。');
  const authorization = await prompt('   認証ヘッダー（Authorization）を入力してください: ');
  
  // クッキー情報の設定
  console.log('\n2. クッキー情報の設定（センシティブコンテンツの取得に必要）');
  console.log('   【クッキーの取得方法】');
  console.log('   1. https://twitter.com/login にアクセスしてログインする');
  console.log('   2. ブラウザで右クリックして「検証」（F12）を押す');
  console.log('   3. 開発者ツールの「Network」タブを開く');
  console.log('   4. https://twitter.com/home にアクセスする');
  console.log('   5. リクエストヘッダーから「Cookie」の値をコピーする');
  const cookie = await prompt('   クッキー（Cookie）を入力してください: ');

  // プロキシ設定（オプション）
  console.log('\n3. プロキシ設定（オプション）');
  console.log('   例: http://username:password@host:port または socks5://host:port');
  const proxy = await prompt('   プロキシ設定を入力してください（使用しない場合は空欄）: ');

  // 設定を保存
  const credentials = {
    authorization: authorization.trim() || CONFIG.TWITTER_AUTH,
    cookie: cookie.trim() || CONFIG.TWITTER_COOKIE,
    proxy: proxy.trim() || CONFIG.TWITTER_PROXY
  };

  // 少なくとも一つの設定が入力されたかチェック
  if (!credentials.authorization && !credentials.cookie && !credentials.proxy) {
    console.log('\n⚠️ 認証情報が入力されませんでした。設定を中止します。');
    rl.close();
    return;
  }

  // 設定を保存
  console.log('\n設定を保存しています...');
  if (CONFIG.saveCredentials(credentials)) {
    console.log('✅ 認証情報が正常に保存されました。');
    console.log('これによりレート制限が軽減され、センシティブコンテンツにアクセスできるようになります。');
    console.log(`設定ファイル: ${CONFIG.CREDENTIALS_FILE_PATH}`);
  } else {
    console.log('❌ 認証情報の保存中にエラーが発生しました。');
  }

  rl.close();
}

// プログラム実行
main().catch(err => {
  console.error('エラーが発生しました:', err);
  rl.close();
});