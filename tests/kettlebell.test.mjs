// 自宅のケトルベル（2026-10-28 ハムリハから反映）。有酸素の記録の1種類として残し、
// 内容メモが一覧・プロンプトに出ること、脚トレの判断にプロンプトで使われることを確かめる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, norm } from './harness.mjs';

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

test('ケトルベルのメニュー選択: その日のおすすめ、複数選択で内容欄を作る、改行は1行に（2026-10-30）', () => {
  const a = app([]);
  assert.deepEqual(norm(a.kbRecommend('2026-11-03', 'kb')), ['light']);            // 火
  assert.deepEqual(norm(a.kbRecommend('2026-11-04', 'kb')), ['heavy']);            // 水
  assert.deepEqual(norm(a.kbRecommend('2026-11-08', 'kb')), ['heavy', 'upper']);   // 日
  assert.deepEqual(norm(a.kbRecommend('2026-11-08', 'kbtabata')), ['tabata', 'upper']);
  assert.deepEqual(norm(a.kbRecommend('2026-11-02', 'kb')), []);                   // 月（休み）
  const note = a.kbNoteFromMenus(['upper', 'light']);   // 並びは KB_MENUS の順
  assert.equal(note.split('\n').length, 2);
  assert.match(note, /^【軽め】かかと上げゴブレットスクワット 3×8〜10（3秒で下ろす）／片脚RDL 左右3×8\n【上半身】ハンマーカール/);
  const h = a.renderKbMenuPicker('2026-11-08', 'kb', ['heavy']);
  assert.match(h, /data-kbm="heavy" class="kbm-btn sel">しっかり ★/);
  assert.match(h, /data-kbm="upper" class="kbm-btn">上半身 ★/);
  assert.match(h, /data-kbm="light" class="kbm-btn">軽め</);
  assert.equal(a.cardioDetailLabel({ cardio:'kb', cardioMin:20, kbNote:'【軽め】A\n【上半身】B' }), '（20分 / 【軽め】A　【上半身】B）');
});

test('ケトルベルは選んだメニューのセット数を0.5倍して部位別セット数に入れ、内訳を出す（2026-10-30）', () => {
  const sessions = [
    { id:'g', date:'2026-10-28', exercises:[{ name:'アームカール', sets:[{},{},{}] }] },
    { id:'k1', type:'cardio', cardio:'kb', date:'2026-10-29', kbMenus:['light'], kbNote:'x' },
    { id:'k2', type:'cardio', cardio:'kbtabata', date:'2026-10-30', kbMenus:['tabata', 'upper'] },
    { id:'k3', type:'cardio', cardio:'kb', date:'2026-10-30', kbNote:'手書きだけ' },            // 数えない
    { id:'r', type:'cardio', cardio:'run', date:'2026-10-30', kbMenus:['heavy'] },               // ケトルベル以外は数えない
    { id:'old', type:'cardio', cardio:'kb', date:'2026-10-10', kbMenus:['heavy'] },             // 範囲外
  ];
  const a = loadApp({ today:'2026-10-30T20:00:00+09:00', storage:{ wac_sessions: JSON.stringify(sessions) } });
  assert.deepEqual(norm(a.kbVolumeOf(sessions[1])), { 脚:3 });
  assert.deepEqual(norm(a.kbVolumeOf(sessions[2])), { 脚:2, 二頭筋:1.5, 三頭筋:1.5, 肩:1.5 });
  const v = a.weeklyVolume(0, 'rolling');
  assert.equal(v.kbCount, 2);
  assert.equal(v.sessionCount, 1);
  assert.equal(norm(v.byPart)['脚'], 5);
  assert.equal(norm(v.byPart)['二頭筋'], 4.5);   // ジム3＋KB1.5
  assert.deepEqual(norm(v.byPartKb), { 脚:5, 二頭筋:1.5, 三頭筋:1.5, 肩:1.5 });
  const p = a.buildPrompt('1', 'none', null, 0);
  assert.match(p, /（うちケトルベル2回分: 肩1\.5 二頭筋1\.5 三頭筋1\.5 脚5）/);
  assert.match(p, /記録で選んだメニューのセット数を0\.5倍して/);
  const card = a.renderWeeklyVolumeCard();
  assert.match(card, /うちKB5・/);
  assert.match(card, /自宅のケトルベル（2回）/);
});

test('ケトルベルだけの週でも部位別セット数をプロンプトに出す', () => {
  const a = loadApp({ today:'2026-10-30T20:00:00+09:00', storage:{ wac_sessions: JSON.stringify([{ id:'k', type:'cardio', cardio:'kb', date:'2026-10-29', kbMenus:['heavy'] }]) } });
  assert.match(a.buildPrompt('1', 'none', null, 0), /【部位別セット数/);
});
