// Mac で写真から次回メニューを作り Gist に足すスクリプト（tools/coach_cli.mjs、2026-11-25〜）。
// 書き込みの前の純粋な部分（プロンプト生成・回答の検査・Gist の中身の組み立て）と、
// 足した記録をアプリが同期で取り込めることを確かめる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, norm } from './harness.mjs';
import { parseArgs, storageFromDoc, promptFromDoc, applyToDoc } from '../tools/coach_cli.mjs';

const TODAY = '2026-11-25T20:00:00+09:00';
const NOW = new Date(TODAY).getTime();
const doc = (extra = {}) => ({ app: 'workout-ai-coach', v: 1, sessions: [
  { id: '1', date: '2026-11-24', exercises: [{ name: 'チンニング（縦グリップ）', sets: [{ weight: null, reps: 8 }] }], next_menu: { category: '胸＋三頭' } },
], ts: { '1': 100 }, deleted: {}, ...extra });
const answer = JSON.stringify({ date: '2026-11-25', evaluation: 'よくできました', exercises: [{ name: 'マシンチェストプレス', sets: [{ weight: 50, reps: 10 }, { weight: 50, reps: 9 }] }],
  next_menu: { gym: 'エニタイムフィットネス志村坂上店', category: '肩＋腕（任意）', must_exercises: [{ name: 'ショルダープレス（志村マシン）', target: '3×10 40kg' }] } });

test('引数: コマンド・値つきの指定・フラグ', () => {
  assert.deepEqual(parseArgs(['apply', 'a.json', '--pain', '1', '--dry-run']), { _: ['apply', 'a.json'], pain: '1', 'dry-run': true });
});

test('プロンプトはアプリと同じもの。ジムは指定 → 同期された最後のジム → 志村の順、コンディション文は同期された設定を使う', () => {
  const d = doc({ settings: { wac_condition: '同期したコンディション文', wac_last_gym: '2' }, sts: { wac_condition: 1 } });
  const { gymId, prompt } = promptFromDoc(d, { today: TODAY, pain: '0' });
  assert.equal(gymId, '2');
  const app = loadApp({ today: TODAY, storage: storageFromDoc(d) });
  assert.equal(prompt, app.buildPrompt('2', null, null, 0));
  assert.match(prompt, /同期したコンディション文/);
  assert.match(prompt, /【今日の左ハムの痛み】0/);
  assert.equal(promptFromDoc(d, { today: TODAY, gym: '1' }).gymId, '1');
  assert.equal(promptFromDoc(doc(), { today: TODAY }).gymId, '1');
  assert.match(promptFromDoc(doc(), { today: TODAY }).prompt, /【今日の左ハムの痛み】未記録/);
});

test('回答はアプリと同じ検査を通して1件足し、時刻（ts）と痛みを付ける。元の中身は変えない', () => {
  const d = doc();
  const { doc: out, result } = applyToDoc(d, 'こちらです\n```json\n' + answer + '\n```', { pain: '0', now: NOW, today: TODAY });
  assert.equal(result.id, String(NOW));
  assert.equal(result.pain, 0);
  assert.equal(out.sessions.length, 2);
  assert.equal(out.ts[String(NOW)], NOW);
  assert.equal(out.ts['1'], 100);
  assert.equal(d.sessions.length, 1);
});

test('同じ日の筋トレの記録がすでにあれば止める（--force で足せる）。壊れた回答・項目不足も止める', () => {
  const d = applyToDoc(doc(), answer, { now: NOW, today: TODAY }).doc;
  assert.throws(() => applyToDoc(d, answer, { now: NOW + 1, today: TODAY }), /2026-11-25 の筋トレの記録がすでにあります/);
  assert.equal(applyToDoc(d, answer, { now: NOW + 1, force: true, today: TODAY }).doc.sessions.length, 3);
  assert.throws(() => applyToDoc(doc(), '{"exercises": [', { today: TODAY }), /JSON/);
  assert.throws(() => applyToDoc(doc(), '{"exercises": []}', { today: TODAY }), /next_menu/);
});

test('Macで足した記録は、アプリが同期で取り込み、今日のメニューに出る', () => {
  const { doc: out } = applyToDoc(doc(), answer, { now: NOW, today: TODAY });
  const app = loadApp({ today: TODAY, storage: { wac_sessions: JSON.stringify(doc().sessions), wac_sync_meta: JSON.stringify({ ts: { '1': 100 }, deleted: {} }) } });
  assert.equal(app.mergeRemote(out), true);
  assert.deepEqual(norm(app.getSessions()).map(s => s.id), ['1', String(NOW)]);
  const last = norm(app.getSessions()).find(s => s.id === String(NOW));
  assert.match(app.renderTodayMenuCard(last, '1', '2026-11-26'), /3×10 40kg/);
});
