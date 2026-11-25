#!/usr/bin/env node
// 筋トレMEMOの写真から次回メニューを作り、Gist 経由でアプリに届ける（2026-11-25〜）。
// iPhone から Claude Code（Remote Control）に写真を送る → Mac の Claude がこれを使う:
//   1) node tools/coach_cli.mjs prompt [--gym 1|2] [--pain N]
//        Gist の記録・設定から、アプリの「①プロンプトをコピー」と同じプロンプトを標準出力に書く
//   2) Claude が写真とプロンプトから回答（JSON）を作り、ファイルに保存する
//   3) node tools/coach_cli.mjs apply 回答.json [--pain N] [--dry-run] [--force]
//        アプリと同じ解析・検査（parseClaudeJson / validateResult）を通してから Gist に1件足す
// アプリは開いたときの同期で取り込む（記録ごとの時刻 ts を付けるので、ほかの端末の古い状態に負けない）。
// gh CLI（gist 権限）で読み書きする。プロンプト・解析のコードは index.html をそのまま読み込んで使う（二重管理しない）。
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadApp, norm } from '../tests/harness.mjs';

const GIST_FILE = 'workout-ai-coach.json';

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run' || a === '--force') out[a.slice(2)] = true;
    else if (a.startsWith('--')) out[a.slice(2)] = argv[++i];
    else out._.push(a);
  }
  return out;
}

function gh(args, input) {
  return execFileSync('gh', args, { encoding: 'utf8', input, maxBuffer: 64 * 1024 * 1024, stdio: [input == null ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
}
function findGist() {
  for (let page = 1; page <= 10; page++) {
    const list = JSON.parse(gh(['api', `/gists?per_page=100&page=${page}`]));
    const g = list.find(x => x.files && x.files[GIST_FILE]);
    if (g) return g.id;
    if (list.length < 100) break;
  }
  throw new Error(`Gist（${GIST_FILE}）が見つかりません。アプリの設定タブで同期を一度オンにしてください`);
}
function readDoc(id) {
  const doc = JSON.parse(gh(['gist', 'view', id, '-f', GIST_FILE, '--raw']));
  if (!doc || doc.app !== 'workout-ai-coach' || !Array.isArray(doc.sessions)) throw new Error('Gist の中身が筋トレAIコーチの形式ではありません');
  return doc;
}
function writeDoc(id, doc) {
  gh(['api', '-X', 'PATCH', `/gists/${id}`, '--input', '-'], JSON.stringify({ files: { [GIST_FILE]: { content: JSON.stringify(doc) } } }));
}

// Gist の中身をアプリの localStorage の形にする（純粋関数）
export function storageFromDoc(doc) {
  const storage = { wac_sessions: JSON.stringify(doc.sessions || []) };
  const settings = (doc.settings && typeof doc.settings === 'object') ? doc.settings : {};
  for (const [k, v] of Object.entries(settings)) if (v != null) storage[k] = String(v);
  return storage;
}

// 1) プロンプト。ジムは指定がなければアプリで最後に選んだジム（同期済みなら）か志村
export function promptFromDoc(doc, { gym, pain, today } = {}) {
  const app = loadApp({ today, storage: storageFromDoc(doc) });
  const gymId = gym === '2' || gym === '1' ? gym : app.getLastGym();
  const p = pain == null || pain === '' ? null : Number(pain);
  return { gymId, prompt: app.buildPrompt(gymId, null, null, Number.isFinite(p) ? p : null) };
}

// 3) 回答を検査して、Gist の中身に1件足した新しい中身を返す（純粋関数。書き込みはしない）
export function applyToDoc(doc, answerText, { pain, now, force, today } = {}) {
  const app = loadApp({ today, storage: storageFromDoc(doc) });
  const result = norm(app.validateResult(app.parseClaudeJson(answerText)));
  const t = now || Date.now();
  result.id = String(t);
  const p = pain == null || pain === '' ? null : Number(pain);
  result.pain = Number.isFinite(p) ? p : null;
  const same = (doc.sessions || []).filter(s => s && s.type !== 'cardio' && s.date === result.date);
  if (same.length && !force) {
    throw new Error(`${result.date} の筋トレの記録がすでにあります（${same.length}件）。同じ写真を二重に送っていないか確かめ、別の記録なら --force を付けてください`);
  }
  const out = JSON.parse(JSON.stringify(doc));
  out.sessions = (out.sessions || []).concat([result]).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  out.ts = Object.assign({}, out.ts, { [result.id]: t });
  return { doc: out, result };
}

function summary(r) {
  const nm = r.next_menu || {};
  const ex = (r.exercises || []).map(e => `${e.name} ${(e.sets || []).filter(s => !s.warmup).length}セット`).join('、');
  const next = (nm.must_exercises || []).map(e => e.name).join('、');
  return `記録 ${r.date}: ${ex}\n次回 ${nm.category || ''}（${nm.gym || ''}）: ${next}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  if (cmd === 'prompt') {
    const id = findGist();
    const { gymId, prompt } = promptFromDoc(readDoc(id), { gym: args.gym, pain: args.pain });
    process.stderr.write(`（ジム: ${gymId === '2' ? '本郷' : '志村坂上'}）\n`);
    process.stdout.write(prompt + '\n');
  } else if (cmd === 'apply') {
    if (!args._[1]) throw new Error('回答のファイルを指定してください: apply 回答.json');
    const text = readFileSync(args._[1], 'utf8');
    const id = findGist();
    const { doc, result } = applyToDoc(readDoc(id), text, { pain: args.pain, force: args.force });
    if (args['dry-run']) { process.stdout.write('（dry-run: 書き込みません）\n' + summary(result) + '\n'); return; }
    writeDoc(id, doc);
    const check = readDoc(id);
    if (!check.sessions.some(s => s.id === result.id)) throw new Error('書き込んだ記録を Gist で確認できませんでした');
    process.stdout.write('Gist に追加しました（アプリを開くと同期で入ります）\n' + summary(result) + '\n');
  } else {
    process.stdout.write('使い方: coach_cli.mjs prompt [--gym 1|2] [--pain N]\n        coach_cli.mjs apply 回答.json [--pain N] [--dry-run] [--force]\n');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  main().catch(e => { process.stderr.write('エラー: ' + e.message + '\n'); process.exit(1); });
}
