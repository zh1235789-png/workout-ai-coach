// 端末間同期（GitHub Gist）のマージ規則。
// ここが壊れると「別の端末の古い状態で記録が上書きされて消える」「消した記録が生き返る」
// という気づきにくい事故になるので、記録（id）単位の勝ち負けを固定する。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, norm } from './harness.mjs';

const NOW = '2026-11-15T20:00:00+09:00';
const T = new Date(NOW).getTime();
const S = (id, date, extra = {}) => ({ id, date, type: 'strength', ...extra });

function app(sessions = [], meta = null) {
  const storage = { wac_sessions: JSON.stringify(sessions) };
  if (meta) storage.wac_sync_meta = JSON.stringify(meta);
  return loadApp({ today: NOW, storage });
}
const ids = (a) => norm(a.getSessions()).map((s) => s.id);
const meta = (a) => norm(a.getSyncMeta());

test('記録を保存すると、増えた記録に時刻が付く', () => {
  const a = app([]);
  a.saveSessions([S('a', '2026-11-10')]);
  assert.equal(meta(a).ts.a, T);
});

test('中身を変えた記録だけ時刻が更新され、変えていない記録はそのまま', () => {
  const a = app([S('a', '2026-11-10'), S('b', '2026-11-11')], { ts: { a: 100, b: 100 }, deleted: {} });
  a.saveSessions([S('a', '2026-11-10', { memo: 'x' }), S('b', '2026-11-11')]);
  assert.equal(meta(a).ts.a, T);
  assert.equal(meta(a).ts.b, 100);
});

test('消した記録には墓標が付く', () => {
  const a = app([S('a', '2026-11-10'), S('b', '2026-11-11')], { ts: { a: 100, b: 100 }, deleted: {} });
  a.saveSessions([S('b', '2026-11-11')]);
  assert.equal(meta(a).deleted.a, T);
  assert.equal(meta(a).ts.a, undefined);
});

test('相手の方が新しい記録は相手の内容になる', () => {
  const a = app([S('a', '2026-11-10', { memo: 'old' })], { ts: { a: 100 }, deleted: {} });
  a.mergeRemote({ app: 'workout-ai-coach', sessions: [S('a', '2026-11-10', { memo: 'new' })], ts: { a: 200 }, deleted: {} });
  assert.equal(norm(a.getSessions())[0].memo, 'new');
  assert.equal(meta(a).ts.a, 200);
});

test('自分の方が新しい記録は自分の内容が残る', () => {
  const a = app([S('a', '2026-11-10', { memo: 'mine' })], { ts: { a: 300 }, deleted: {} });
  a.mergeRemote({ app: 'workout-ai-coach', sessions: [S('a', '2026-11-10', { memo: 'theirs' })], ts: { a: 200 }, deleted: {} });
  assert.equal(norm(a.getSessions())[0].memo, 'mine');
});

test('相手にしかない記録は取り込み、日付順に並べる', () => {
  const a = app([S('b', '2026-11-12')], { ts: { b: 100 }, deleted: {} });
  a.mergeRemote({ app: 'workout-ai-coach', sessions: [S('a', '2026-11-10')], ts: { a: 50 }, deleted: {} });
  assert.deepEqual(ids(a), ['a', 'b']);
});

test('相手の端末で消した記録は、こちらでも消える', () => {
  const a = app([S('a', '2026-11-10'), S('b', '2026-11-11')], { ts: { a: 100, b: 100 }, deleted: {} });
  a.mergeRemote({ app: 'workout-ai-coach', sessions: [S('b', '2026-11-11')], ts: { b: 100 }, deleted: { a: 150 } });
  assert.deepEqual(ids(a), ['b']);
  assert.equal(meta(a).deleted.a, 150);
});

test('消されたあとにこちらで直した記録は残る', () => {
  const a = app([S('a', '2026-11-10', { memo: 'fixed' })], { ts: { a: 300 }, deleted: {} });
  a.mergeRemote({ app: 'workout-ai-coach', sessions: [], ts: {}, deleted: { a: 150 } });
  assert.deepEqual(ids(a), ['a']);
});

test('自分で消した記録は、相手の古い写しから生き返らない', () => {
  const a = app([], { ts: {}, deleted: { a: 200 } });
  a.mergeRemote({ app: 'workout-ai-coach', sessions: [S('a', '2026-11-10')], ts: { a: 100 }, deleted: {} });
  assert.deepEqual(ids(a), []);
});

test('時刻の無い古い記録（同期前のもの）は消えずに残る', () => {
  const a = app([S('old', '2026-09-01')]);
  a.mergeRemote({ app: 'workout-ai-coach', sessions: [S('a', '2026-11-10')], ts: { a: 100 }, deleted: {} });
  assert.deepEqual(ids(a), ['old', 'a']);
});

test('相手のデータが空・壊れている・別アプリのものなら何もしない', () => {
  for (const bad of [null, {}, { app: 'other', sessions: [] }, { app: 'workout-ai-coach' }, 'x']) {
    const a = app([S('a', '2026-11-10')], { ts: { a: 100 }, deleted: {} });
    assert.equal(a.mergeRemote(bad), false);
    assert.deepEqual(ids(a), ['a']);
  }
});

test('置き換えて復元すると、消えた記録に墓標が付き同期先からも消える', () => {
  const a = app([S('a', '2026-11-10'), S('b', '2026-11-11')], { ts: { a: 100, b: 100 }, deleted: {} });
  const backup = JSON.stringify({ app: 'workout-ai-coach', version: 1, data: { wac_sessions: JSON.stringify([S('b', '2026-11-11')]) } });
  a.restoreBackup(backup, 'replace');
  assert.deepEqual(ids(a), ['b']);
  assert.equal(meta(a).deleted.a, T);
});

test('Gistに書く中身には記録・時刻・墓標が入る', () => {
  const a = app([S('a', '2026-11-10')], { ts: { a: 100 }, deleted: { z: 50 } });
  const d = norm(a.syncDoc());
  assert.equal(d.app, 'workout-ai-coach');
  assert.deepEqual(d.sessions.map((s) => s.id), ['a']);
  assert.deepEqual(d.ts, { a: 100 });
  assert.deepEqual(d.deleted, { z: 50 });
});

test('同期の設定が壊れていても起動できる', () => {
  const a = loadApp({ today: NOW, storage: { wac_sync: 'not json{', wac_sync_meta: '[[' }, expectClean: true });
  assert.deepEqual(meta(a), { ts: {}, deleted: {} });
});
