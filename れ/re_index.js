// Ver.2.0: シンプルTwitter Like Media Downloader
const fs = require('fs');
const path = require('path');
const { TwitterDL } = require('twitter-downloader');

const LIKE_FILE = 'like.js';
const DL_DIR = 'downloaded_images';
const SKIP_FILE = 'logs/skip-ids.json';
const ERROR_LOG = 'logs/error-log.json';
const STATE_FILE = 'logs/download-state.json';

const RETRY = 2;
const API_DELAY = 1500;

function loadLikes() {
  const txt = fs.readFileSync(LIKE_FILE, 'utf8');
  const m = txt.match(/=\s*(\[[\s\S]*\]);?$/);
  return m ? JSON.parse(m[1]) : [];
}

function getDownloadedIds() {
  if (!fs.existsSync(DL_DIR)) return new Set();
  return new Set(fs.readdirSync(DL_DIR)
    .map(f => f.match(/^(\d+)-/) || f.match(/^(\d+)-metadata\.json$/))
    .filter(Boolean).map(m => m[1]));
}

function loadJson(file, def) {
  try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : def; }
  catch { return def; }
}

function saveJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchTweet(tweetId, url) {
  for (let i = 0; i <= RETRY; i++) {
    try {
      const res = await TwitterDL(url);
      if (res.status === 'success' && res.result) return res.result;
      throw new Error(res.message || 'API error');
    } catch (e) {
      if (i === RETRY) throw e;
      await sleep(API_DELAY);
    }
  }
}

function extractMedia(meta) {
  const media = (meta.extended_entities && meta.extended_entities.media) || (meta.entities && meta.entities.media) || [];
  return media.map((m, i) => {
    if (m.type === 'photo') {
      const url = m.media_url_https.split('?')[0];
      const ext = path.extname(url) || '.jpg';
      return { url: url + '?format=' + ext.slice(1) + '&name=orig', filename: `${meta.id_str || meta.id}-${i + 1}${ext}` };
    }
    if (m.type === 'video' || m.type === 'animated_gif') {
      const v = (m.video_info.variants || []).filter(v => v.content_type === 'video/mp4').sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
      if (v) return { url: v.url, filename: `${meta.id_str || meta.id}-${i + 1}.mp4` };
    }
    return null;
  }).filter(Boolean);
}

async function download(url, out, onProgress) {
  const proto = url.startsWith('https') ? require('https') : require('http');
  return new Promise((resolve, reject) => {
    proto.get(url, res => {
      if (res.statusCode >= 400) return reject(new Error('HTTP ' + res.statusCode));
      const total = parseInt(res.headers['content-length'] || '0');
      let done = 0;
      const ws = fs.createWriteStream(out);
      res.on('data', chunk => { done += chunk.length; onProgress && onProgress(done, total); });
      res.pipe(ws);
      ws.on('finish', () => resolve());
      ws.on('error', reject);
    }).on('error', reject);
  });
}

function printUsage() {
  console.log(`\nTwitter Like Media Downloader Ver.2.0 (シンプル版)\n`);
  console.log(`使い方: node re_index.js [--help]`);
  console.log(`\nlike.js（Twitterエクスポートのいいねデータ）を元に、画像・動画・メタデータをdownloaded_images/に保存します。`);
  console.log(`\nオプション:`);
  console.log(`  --help     この使い方を表示\n`);
  console.log(`\nファイル構成:`);
  console.log(`  like.js                入力データ（必須）`);
  console.log(`  downloaded_images/     保存先ディレクトリ`);
  console.log(`  logs/skip-ids.json     スキップIDリスト`);
  console.log(`  logs/error-log.json    エラーログ`);
  console.log(`  logs/download-state.json セーブポイント`);
  console.log(`\n`);
}

// 安全な終了処理
function safeExit(state) {
  try {
    if (state) saveJson(STATE_FILE, state);
    // 進捗途中のスキップリスト・エラーログも保存
    if (typeof globalThis._skip === 'object') saveJson(SKIP_FILE, globalThis._skip);
    if (Array.isArray(globalThis._errors)) saveJson(ERROR_LOG, globalThis._errors);
  } catch (e) {
    // 保存失敗時も静かに終了
  }
  console.log('\n安全に終了しました。');
  process.exit(0);
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage();
    return;
  }

  const likes = loadLikes();
  const skip = loadJson(SKIP_FILE, {});
  const errors = loadJson(ERROR_LOG, []);
  const state = loadJson(STATE_FILE, {});
  const doneIds = getDownloadedIds();
  let start = state.index || 0;
  let ok = 0, fail = 0, skipc = 0;

  // グローバルに参照を持たせて安全終了時に保存できるように
  globalThis._skip = skip;
  globalThis._errors = errors;

  // Ctrl+Cやkill時の安全終了
  process.on('SIGINT', () => safeExit({ index: start }));
  process.on('SIGTERM', () => safeExit({ index: start }));

  for (let i = start; i < likes.length; i++) {
    const t = likes[i].like;
    const id = t.tweetId;
    const url = t.expandedUrl || `https://twitter.com/i/web/status/${id}`;
    if (doneIds.has(id) || skip[id]) { skipc++; continue; }
    process.stdout.write(`(${i + 1}/${likes.length}) ${id} ... `);
    try {
      const meta = await fetchTweet(id, url);
      const media = extractMedia(meta);
      if (!media.length) throw new Error('no media');
      saveJson(path.join(DL_DIR, `${id}-metadata.json`), meta);
      for (const m of media) {
        await download(m.url, path.join(DL_DIR, m.filename), (d, t) => {});
      }
      ok++;
      console.log('OK');
    } catch (e) {
      fail++;
      skip[id] = e.message;
      errors.push({ id, url, error: e.message });
      saveJson(SKIP_FILE, skip);
      saveJson(ERROR_LOG, errors);
      console.log('FAIL:', e.message);
    }
    start = i; // 現在のインデックスを常に更新
    if ((i + 1) % 20 === 0) saveJson(STATE_FILE, { index: i + 1 });
    await sleep(API_DELAY);
  }
  saveJson(STATE_FILE, { index: likes.length });
  console.log(`完了: ${ok}件, 失敗: ${fail}件, スキップ: ${skipc}件`);
}

main();