// バイク4×4（VO2maxトラック）。2026-10-04 にハムリハから移管した。
// ワット入力は空欄・途中入力・非数値が平気で来るので、平均・前回比・フェード判定が
// そこで壊れないこと、ハムリハの記録が欠けずに・二重にならずに取り込めることを確かめる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, norm } from './harness.mjs';

const TODAY = '2026-10-04T09:00:00+09:00';
const app = (storage) => loadApp({ today: TODAY, storage, expectClean: true });

const bikeSession = (date, w, extra = {}) => ({
  id: 'b-' + date, type: 'cardio', date, cardio: 'bike', cardioMin: null, cardioKm: null,
  bike: { unit: 'W', w, lv: [null, null, null, null], hr: [null, null, null, null], z4m: null, z4s: null, rpe: null, ...extra },
});
const withSessions = (list) => ({ wac_sessions: JSON.stringify(list), wac_hamrehab_bike_imported: 'x' });

// ハムリハの書き出し（hamrehab_v1）と同じ形
const hamrehab = (days, bikeUnit = 'W') => ({ phase: 3, runSession: 7, criteria: {}, bikeUnit, days });
const hamDay = (bike, pain = null) => ({ pain, done: {}, type: 'バイク日', phase: 3, routine: {}, journal: {}, bike });

// ---- 集計 ----

test('bikeAvg() は入力済みの本数だけで平均し、空欄・0・非数値を無視する', () => {
  const a = app();
  assert.equal(a.bikeAvg({ w: [200, 201, 201, 201] }), 201);
  assert.equal(a.bikeAvg({ w: [200, 210, null, null] }), 205);
  assert.equal(a.bikeAvg({ w: ['200', '', 0, 'abc'] }), 200);
  assert.equal(a.bikeAvg({ w: [null, null, null, null] }), null);
  assert.equal(a.bikeAvg(undefined), null);
});

test('bikeFade() は4本目が1本目から5%以上落ちたら true', () => {
  const a = app();
  assert.equal(a.bikeFade({ w: [200, 200, 195, 189] }), true);
  assert.equal(a.bikeFade({ w: [200, 200, 195, 190] }), false);
  assert.equal(a.bikeFade({ w: [200, 200, null, null] }), null);
});

test('bikeLevelOf() は4本とも同じときだけレベルを返し、混在は比較不可にする', () => {
  const a = app();
  assert.equal(a.bikeLevelOf({ lv: [8, 8, 8, 8] }), 8);
  assert.equal(a.bikeLevelOf({ lv: [8, 9, 9, 9] }), null);
  assert.equal(a.bikeLevelLabel({ lv: [8, 9, 9, 9] }), 'L8→9');
  assert.equal(a.bikeLevelOf({ level: 7 }), 7); // ハムリハ旧形式
});

test('心拍は生理的にありえない値（タイプミス）を無視する', () => {
  const a = app();
  assert.equal(a.bikeHrMaxOf({ hr: [150, 1780, 165, 40] }), 165);
  assert.equal(a.bikeHrAvgOf({ hr: [150, null, 160, null] }), 155);
});

test('bikeZ4Secs() は分・秒を合算し、旧形式（小数の分）も読む', () => {
  const a = app();
  assert.equal(a.bikeZ4Secs({ z4m: 8, z4s: 30 }), 510);
  assert.equal(a.bikeZ4Secs({ z4m: null, z4s: null, z4: 9.5 }), 570);
  assert.equal(a.bikeZ4Secs({ z4m: null, z4s: null }), null);
});

// ---- 前回比 ----

test('前回比は「その日より前」かつ「同じ単位」の記録とだけ取る', () => {
  const a = app(withSessions([
    bikeSession('2026-09-20', [180, 180, 180, 180]),
    { ...bikeSession('2026-09-25', [80, 80, 80, 80]), bike: { ...bikeSession('x', [80, 80, 80, 80]).bike, unit: 'RPM' } },
    bikeSession('2026-10-10', [250, 250, 250, 250]),
  ]));
  const prev = a.bikePrevSess({ unit: 'W', w: [] }, { date: '2026-10-04' });
  assert.equal(prev.ds, '2026-09-20');
  assert.equal(a.bikeDeltaText(190, prev), '前回 180 → +10');
});

test('編集中の記録自身は比較対象から外す', () => {
  const s = bikeSession('2026-09-20', [180, 180, 180, 180]);
  const a = app(withSessions([s]));
  assert.equal(a.bikeSessions(s.id).length, 0);
  assert.equal(a.bikeSessions().length, 1);
});

test('判定文と推移カードが例外なく描画できる', () => {
  const a = app(withSessions([
    bikeSession('2026-09-20', [180, 180, 180, 180], { lv: [8, 8, 8, 8], hr: [150, 160, 165, 168], z4m: 8, z4s: 0, rpe: 8 }),
    bikeSession('2026-09-27', [190, 190, 185, 170], { lv: [8, 8, 8, 8], hr: [148, 158, 162, 166], z4m: 7, z4s: 0, rpe: 10 }),
  ]));
  const b = a.emptyBike();
  const html = a.renderBikeInputs(b, { date: '2026-10-04' }, 'log');
  assert.match(html, /VO2MAX/);
  assert.match(a.renderBikeTrendCard(), /2回/);
  const detail = a.renderBikeDetail(a.getSessions()[1]);
  assert.match(detail, /4本目が1本目から5%以上/);
  assert.match(detail, /前回 180/);
});

test('有酸素の表示名にバイクが載り、記録の要約に平均が入る', () => {
  const a = app();
  assert.equal(a.cardioName('bike'), '🚴 バイク4×4');
  const s = bikeSession('2026-10-04', [200, 200, 200, 200], { lv: [8, 8, 8, 8], rpe: 9 });
  assert.equal(a.cardioDetailLabel(s), '（平均200W L8 RPE9）');
});

test('同日にランとバイクがあれば、プロンプト用の代表はランで、両方を並べる', () => {
  const a = app(withSessions([
    bikeSession('2026-10-04', [200, 200, 200, 200]),
    { id: 'r1', type: 'cardio', date: '2026-10-04', cardio: 'run', cardioMin: 20, cardioKm: 3 },
  ]));
  const sum = a.cardioSummaryForDate('2026-10-04');
  assert.equal(sum.cardio, 'run');
  assert.equal(sum.label, 'ランニング＋バイク4×4');
  assert.equal(sum.bikeLabel, '平均200W');
});

// ---- ハムリハからの取り込み ----

test('hamrehabBikeSessions() はバイクの数値がある日だけを有酸素記録に変える', () => {
  const a = app();
  const list = norm(a.hamrehabBikeSessions(hamrehab({
    '2026-09-22': hamDay({ w: [180, 182, 181, 179], lv: [8, 8, 8, 8], hr: [150, 160, 165, 168], z4m: 8, z4s: 10, rpe: 8 }, 1),
    '2026-09-23': hamDay({ w: [null, null, null, null] }),
    '2026-09-24': { pain: 0, done: {} },
    'bad-key': hamDay({ w: [100, 100, 100, 100] }),
  }, 'RPM')));
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'hamrehab-bike-2026-09-22');
  assert.equal(list[0].cardio, 'bike');
  assert.equal(list[0].pain, 1);
  assert.equal(list[0].bike.unit, 'RPM');
  assert.equal(list[0].bike.z4s, 10);
});

test('hamrehabBikeSessions() はハムリハの書き出し以外を null で弾く', () => {
  const a = app();
  assert.equal(a.hamrehabBikeSessions(null), null);
  assert.equal(a.hamrehabBikeSessions([]), null);
  assert.equal(a.hamrehabBikeSessions({ app: 'workout-ai-coach', data: {} }), null);
});

test('mergeHamrehabBike() は何度取り込んでも二重にならない', () => {
  const a = app(withSessions([]));
  const src = hamrehab({ '2026-09-22': hamDay({ w: [180, 180, 180, 180] }) });
  assert.deepEqual(norm(a.mergeHamrehabBike(src)), { added: 1, total: 1 });
  assert.deepEqual(norm(a.mergeHamrehabBike(src)), { added: 0, total: 1 });
  assert.equal(a.getSessions().length, 1);
});

test('起動時、同じオリジンにハムリハの記録があれば一度だけ自動で取り込む', () => {
  const ham = JSON.stringify(hamrehab({ '2026-09-22': hamDay({ w: [180, 180, 180, 180] }) }, 'RPM'));
  const a = app({ hamrehab_v1: ham });
  assert.equal(a.getSessions().length, 1);
  assert.equal(a.__store.wac_hamrehab_bike_imported, '2026-10-04');
  assert.equal(a.__store.wac_bike_unit, 'RPM');

  // 取り込み後に消した記録は、次の起動で復活させない
  const b = app({ hamrehab_v1: ham, wac_sessions: '[]', wac_hamrehab_bike_imported: '2026-10-04' });
  assert.equal(b.getSessions().length, 0);
});

test('バイクの単位設定はバックアップ対象に入っている', () => {
  assert.ok(app().$('BACKUP_KEYS').includes('wac_bike_unit'));
});
