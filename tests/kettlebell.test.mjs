// 自宅のケトルベル（2026-10-28 ハムリハから反映）。有酸素の記録の1種類として残し、
// 内容メモが一覧・プロンプトに出ること、脚トレの判断にプロンプトで使われることを確かめる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './harness.mjs';

const TODAY = '2026-10-28T09:00:00+09:00';
const kb = (date, cardio, kbNote) => ({ id: 'k-' + date + cardio, type: 'cardio', date, cardio, pain: 0, cardioMin: 15, cardioKm: null, kbNote });
const app = (list) => loadApp({ today: TODAY, storage: { wac_sessions: JSON.stringify(list) }, expectClean: true });

test('ケトルベルの記録は内容メモ付きで表示される', () => {
  const a = app([]);
  assert.equal(a.cardioDetailLabel(kb('2026-10-27', 'kb', 'スイング15×5 16kg')), '（15分 / スイング15×5 16kg）');
  assert.equal(a.cardioName('kbtabata').trim(), '🏋️ KBタバタ');
});

test('同じ日にランとKBタバタがあれば代表はラン、ラベルは両方', () => {
  const a = app([kb('2026-10-28', 'kbtabata', 'ブロックA'), { id: 'r', type: 'cardio', date: '2026-10-28', cardio: 'run', cardioMin: 30, cardioKm: 5 }]);
  const s = a.cardioSummaryForDate('2026-10-28');
  assert.equal(s.cardio, 'run');
  assert.equal(s.label, 'ランニング＋KBタバタ');
});

test('直近のケトルベルとルールがプロンプトに入る', () => {
  const a = app([kb('2026-10-26', 'kbtabata', 'ブロックA 16kg')]);
  const p = a.buildPrompt('1', 'none', null, 0);
  assert.match(p, /2026-10-26: KBタバタ（15分 \/ ブロックA 16kg）/);
  assert.match(p, /【自宅のケトルベル】/);
  assert.match(p, /月・木以外の週5回/);
  assert.match(p, /KBタバタは週2回まで（水・日。どちらも翌日が休み）/);
  assert.match(p, /ランの日はランの後/);
});
