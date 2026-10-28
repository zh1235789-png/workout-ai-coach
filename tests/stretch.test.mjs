import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, norm } from './harness.mjs';

test('ランの日（水）は朝・ラン前とラン後が先に来る', () => {
  const app = loadApp({ today: '2026-10-28T09:00:00+09:00' });
  const o = norm(app.stretchOrder('2026-10-28'));
  assert.equal(o.runDay, true);
  assert.deepEqual(o.keys.slice(0, 2), ['morning', 'postrun']);
});

test('ランのない日（土・木）は夜が先', () => {
  const app = loadApp({ today: '2026-10-31T09:00:00+09:00' });
  assert.equal(norm(app.stretchOrder('2026-10-31')).keys[0], 'night');
  assert.equal(norm(app.stretchOrder('2026-10-29')).keys[0], 'night');
});

test('ストレッチ画面に4グループと全種目が出る', () => {
  const app = loadApp({ today: '2026-10-28T09:00:00+09:00' });
  const h = app.renderStretch();
  for (const name of ['キャットアンドカウ', '腸腰筋ストレッチ（ハーフニーリング）', 'タオル肩回し', '壁エンジェル', '胸椎伸展ストレッチ（タオル/フォームローラー）']) assert.ok(h.includes(name), name);
  for (const label of ['朝・ラン前', 'ラン後', 'お風呂上がり', '猫背矯正']) assert.ok(h.includes(label), label);
  assert.ok((h.match(/class="st-item"/g) || []).length >= 20);
});
