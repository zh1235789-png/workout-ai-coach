import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, norm } from './harness.mjs';

const app = () => loadApp({ today: '2026-09-21T09:00:00+09:00' });

// ===== extractJsonObject(): 前後の文章から最初のJSONを切り出す =====

test('extractJsonObject() は前後に文章があっても本体を取り出す', () => {
  assert.equal(app().extractJsonObject('はい、こちらです。{"a":1} 以上です。'), '{"a":1}');
});

test('extractJsonObject() は入れ子の括弧で早期終了しない', () => {
  assert.equal(app().extractJsonObject('x {"a":{"b":{"c":1}}} y'), '{"a":{"b":{"c":1}}}');
});

test('extractJsonObject() は文字列中の } に引っかからない', () => {
  assert.equal(app().extractJsonObject('{"note":"閉じ括弧 } を含む","a":1}'),
    '{"note":"閉じ括弧 } を含む","a":1}');
});

test('extractJsonObject() はエスケープされた引用符を正しく扱う', () => {
  assert.equal(app().extractJsonObject('{"note":"He said \\"hi\\" }","a":1}'),
    '{"note":"He said \\"hi\\" }","a":1}');
});

test('extractJsonObject() は { が無ければ null', () => {
  assert.equal(app().extractJsonObject('JSONはありません'), null);
});

test('extractJsonObject() は閉じられていなければ null（途中で切れた回答）', () => {
  assert.equal(app().extractJsonObject('{"a":1, "b":'), null);
});

// ===== tidyJson() =====

test('tidyJson() はスマートクォートを直す', () => {
  assert.equal(app().tidyJson('{“a”:1}'), '{"a":1}');
});

test('tidyJson() は末尾カンマを除去する', () => {
  const a = app();
  assert.equal(a.tidyJson('{"a":1,}'), '{"a":1}');
  assert.equal(a.tidyJson('[1,2,]'), '[1,2]');
  assert.equal(a.tidyJson('{"a":[1,2,], }'), '{"a":[1,2]}');
});

// ===== parseClaudeJson(): Claudeの回答をそのまま貼れることが要件 =====

test('parseClaudeJson() は素のJSONを読む', () => {
  assert.deepEqual(norm(app().parseClaudeJson('{"a":1}')), { a: 1 });
});

test('parseClaudeJson() はコードフェンス付きを読む', () => {
  assert.deepEqual(norm(app().parseClaudeJson('```json\n{"a":1}\n```')), { a: 1 });
});

test('parseClaudeJson() は言語指定なしのフェンスも読む', () => {
  assert.deepEqual(norm(app().parseClaudeJson('```\n{"a":1}\n```')), { a: 1 });
});

test('parseClaudeJson() は前後の説明文を無視する', () => {
  assert.deepEqual(norm(app().parseClaudeJson('分析しました。\n{"a":1}\nご確認ください。')), { a: 1 });
});

test('parseClaudeJson() は末尾カンマやスマートクォートを救済する', () => {
  assert.deepEqual(norm(app().parseClaudeJson('{"a":1,}')), { a: 1 });
  assert.deepEqual(norm(app().parseClaudeJson('{“a”:1}')), { a: 1 });
});

test('parseClaudeJson() は空入力を拒否する', () => {
  assert.throws(() => app().parseClaudeJson('   '), /内容が空/);
});

test('parseClaudeJson() は配列を受け付けない（オブジェクト前提のため）', () => {
  assert.throws(() => app().parseClaudeJson('[1,2,3]'), /JSON/);
});

test('parseClaudeJson() は途中で切れた回答を明示的に弾く', () => {
  assert.throws(() => app().parseClaudeJson('{"a":1, "b":'), /途中で切れ/);
});

test('parseClaudeJson() は { が無いとき貼り直しを促す', () => {
  assert.throws(() => app().parseClaudeJson('すみません、出力できません'), /見当たりません/);
});

// ===== validateResult(): 形が違う出力に気づく =====

const ok = () => ({ exercises: [], next_menu: {} });

test('validateResult() は exercises が配列でなければ弾く', () => {
  assert.throws(() => app().validateResult({ next_menu: {} }), /exercises/);
});

test('validateResult() は next_menu が無ければ弾く', () => {
  assert.throws(() => app().validateResult({ exercises: [] }), /next_menu/);
});

test('validateResult() は不足項目をまとめて知らせる', () => {
  assert.throws(() => app().validateResult({}), /exercises, next_menu/);
});

test('validateResult() は date が無ければ今日を補う', () => {
  assert.equal(app().validateResult(ok()).date, '2026-09-21');
});

test('validateResult() は既にある date を上書きしない', () => {
  const o = ok(); o.date = '2026-09-01';
  assert.equal(app().validateResult(o).date, '2026-09-01');
});

test('validateResult() は種目名が無くても既定値で通す', () => {
  const o = ok(); o.exercises = [{}];
  assert.equal(norm(app().validateResult(o)).exercises[0].name, '種目');
});

test('validateResult() は sets が配列でなければ空配列にする', () => {
  const o = ok(); o.exercises = [{ name: 'ベンチ', sets: 'まちがい' }];
  assert.deepEqual(norm(app().validateResult(o)).exercises[0].sets, []);
});

test('validateResult() は maxRM 未指定を null にする', () => {
  const o = ok(); o.exercises = [{ name: 'ベンチ' }];
  assert.equal(norm(app().validateResult(o)).exercises[0].maxRM, null);
});

// ===== 小さなユーティリティ =====

test('parseRestSeconds() は秒表記をそのまま読む', () => {
  const a = app();
  assert.equal(a.parseRestSeconds('90秒'), 90);
  assert.equal(a.parseRestSeconds('180'), 180);
});

test('parseRestSeconds() は分表記を秒に直す', () => {
  const a = app();
  assert.equal(a.parseRestSeconds('3分'), 180);
  assert.equal(a.parseRestSeconds('1分'), 60);
});

test('parseRestSeconds() は範囲外と空を null にする', () => {
  const a = app();
  assert.equal(a.parseRestSeconds('700'), null);   // 600秒超
  assert.equal(a.parseRestSeconds('0'), null);
  assert.equal(a.parseRestSeconds(''), null);
  assert.equal(a.parseRestSeconds('しっかり休む'), null);
});

test('parseRestSeconds() は「2分30秒」の秒側を落とす（既知の割り切り）', () => {
  assert.equal(app().parseRestSeconds('2分30秒'), 120);
});

test('numOrNull() は空と非数値を null にする', () => {
  const a = app();
  assert.equal(a.numOrNull(''), null);
  assert.equal(a.numOrNull('  '), null);
  assert.equal(a.numOrNull(null), null);
  assert.equal(a.numOrNull(undefined), null);
  assert.equal(a.numOrNull('abc'), null);
  assert.equal(a.numOrNull('60'), 60);
  assert.equal(a.numOrNull('62.5'), 62.5);
});

test('numOrNull() は 0 を null にしない（自重の記録が消えない）', () => {
  assert.equal(app().numOrNull('0'), 0);
});

test('fmtTime() は秒を m:ss にする', () => {
  const a = app();
  assert.equal(a.fmtTime(0), '0:00');
  assert.equal(a.fmtTime(9), '0:09');
  assert.equal(a.fmtTime(60), '1:00');
  assert.equal(a.fmtTime(185), '3:05');
});

test('fmtTime() は負の秒を 0:00 にする', () => {
  assert.equal(app().fmtTime(-5), '0:00');
});

test('escapeHtml() は HTML の特殊文字を実体参照にする', () => {
  assert.equal(app().escapeHtml(`<img src=x onerror="alert('1')">`),
    '&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;');
});

test('escapeHtml() は & を二重エスケープしない', () => {
  assert.equal(app().escapeHtml('a & b'), 'a &amp; b');
});

test('escapeHtml() は null/undefined を空文字にし、0 は残す', () => {
  const a = app();
  assert.equal(a.escapeHtml(null), '');
  assert.equal(a.escapeHtml(undefined), '');
  assert.equal(a.escapeHtml(0), '0');
});

test('shiftMonth() は月を前後に動かす', () => {
  const a = app();
  assert.equal(a.shiftMonth('2026-09', 1), '2026-10');
  assert.equal(a.shiftMonth('2026-09', -1), '2026-08');
});

test('shiftMonth() は年をまたぐ', () => {
  const a = app();
  assert.equal(a.shiftMonth('2026-12', 1), '2027-01');
  assert.equal(a.shiftMonth('2026-01', -1), '2025-12');
});

test('shiftMonth() は複数月ぶんも動かせる', () => {
  assert.equal(app().shiftMonth('2026-09', -12), '2025-09');
});
