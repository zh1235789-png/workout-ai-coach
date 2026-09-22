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

// ===== bodyPartOf(): 二頭筋と三頭筋を分けて数える =====

test('bodyPartOf() はカール系を二頭筋にする', () => {
  const a = app();
  for(const n of ['アームカール','インクラインカール','プリチャーカール','バイセップカール','コンセントレーションカール']){
    assert.equal(a.bodyPartOf(n), '二頭筋', n);
  }
});

test('bodyPartOf() はプレスダウン系を三頭筋にする', () => {
  const a = app();
  for(const n of ['トライセッププレスダウン','スカルクラッシャー','フレンチプレス','キックバック','ナローベンチプレス']){
    assert.equal(a.bodyPartOf(n), '三頭筋', n);
  }
});

test('bodyPartOf() は脚・背中の種目を腕に取られない', () => {
  const a = app();
  assert.equal(a.bodyPartOf('レッグカール'), '脚');
  assert.equal(a.bodyPartOf('レッグエクステンション'), '脚');
  assert.equal(a.bodyPartOf('バックエクステンション'), '広背筋');
});

test('BODY_PART_ORDER は腕と背中をまとめず、4つに分けている', () => {
  const order = norm(app().$('BODY_PART_ORDER'));
  assert.ok(!order.includes('腕'));
  assert.ok(!order.includes('背中'));
  assert.deepEqual(order, ['胸','広背筋','僧帽筋','肩','二頭筋','三頭筋','脚','体幹','その他']);
});

test('bodyPartOf() はナローグリップの背中種目を三頭筋にしない', () => {
  const a = app();
  assert.equal(a.bodyPartOf('ナローグリップラットプルダウン'), '広背筋');
  assert.equal(a.bodyPartOf('ナローグリップロウ'), '広背筋');
  assert.equal(a.bodyPartOf('ナローグリップベンチプレス'), '三頭筋');
});

test('bodyPartOf() は背中を広背筋と僧帽筋に分ける', () => {
  const a = app();
  assert.equal(a.bodyPartOf('ラットプルダウン'), '広背筋');
  assert.equal(a.bodyPartOf('シーテッドロウ'), '広背筋');
  assert.equal(a.bodyPartOf('懸垂'), '広背筋');
  assert.equal(a.bodyPartOf('シュラッグ'), '僧帽筋');
  assert.equal(a.bodyPartOf('デッドリフト'), '僧帽筋');
  assert.equal(a.bodyPartOf('ルーマニアンデッドリフト'), '脚');
  assert.equal(a.bodyPartOf('ロータリートルソー'), '体幹');
});

test('secondaryPartsOf() は補助的に使う部位を返す（主働筋は除く）', () => {
  const a = app();
  assert.deepEqual(norm(a.secondaryPartsOf('ベンチプレス')).sort(), ['三頭筋','肩']);
  assert.deepEqual(norm(a.secondaryPartsOf('ラットプルダウン')), ['二頭筋']);
  assert.deepEqual(norm(a.secondaryPartsOf('シーテッドロウ')).sort(), ['二頭筋','僧帽筋']);
  assert.deepEqual(norm(a.secondaryPartsOf('アームカール')), []);
});

test('weeklyVolume() は補助部位を0.5セットとして数える', () => {
  const sessions = [{ id:'s1', date:'2026-09-21', type:'strength', exercises:[
    { name:'ベンチプレス', sets:[{warmup:true},{},{},{},{}] },
    { name:'アームカール', sets:[{},{},{}] },
  ]}];
  const a = loadApp({ storage:{ wac_sessions: JSON.stringify(sessions) } });
  const v = norm(a.weeklyVolume(0).byPart);
  assert.equal(v['胸'], 4);        // 本番4セット（ウォームアップは除外）
  assert.equal(v['三頭筋'], 2);    // 4 × 0.5
  assert.equal(v['肩'], 2);        // 4 × 0.5
  assert.equal(v['二頭筋'], 3);
});

test('getVolumeTargets() は初期値を返し、保存値で上書きできる', () => {
  assert.deepEqual(norm(app().getVolumeTargets()['胸']), [12,20]);
  const a = loadApp({ storage:{ wac_vol_targets: JSON.stringify({ 胸:[8,14] }) } });
  assert.deepEqual(norm(a.getVolumeTargets()['胸']), [8,14]);
  assert.deepEqual(norm(a.getVolumeTargets()['脚']), [12,20]);   // 未設定の部位は初期値
});

test('getVolumeTargets() は壊れた保存値を無視する', () => {
  const a = loadApp({ storage:{ wac_vol_targets: '{"胸":"ダメ","脚":[5]}' } });
  assert.deepEqual(norm(a.getVolumeTargets()['胸']), [12,20]);
  assert.deepEqual(norm(a.getVolumeTargets()['脚']), [12,20]);
});

test('volumeClass() は目標の下限・上限で色を変える', () => {
  const a = app();
  assert.equal(a.volumeClass('胸', 0), '');
  assert.equal(a.volumeClass('胸', 11.5), ' low');
  assert.equal(a.volumeClass('胸', 12), ' good');
  assert.equal(a.volumeClass('胸', 20), ' good');
  assert.equal(a.volumeClass('胸', 20.5), ' over');
});

test('secondaryPartsOf() は複合種目の意図どおりに補助筋を割り当てる', () => {
  const a = app();
  // デッドリフトは主働=僧帽筋、補助=広背筋・脚
  assert.equal(a.bodyPartOf('デッドリフト'), '僧帽筋');
  assert.deepEqual(norm(a.secondaryPartsOf('デッドリフト')).sort(), ['広背筋','脚']);
  // スクワットは体幹にも0.5入る
  assert.deepEqual(norm(a.secondaryPartsOf('バーベルスクワット')), ['体幹']);
  // ショルダープレスは三頭筋のみ（肩は主働なので除外）
  assert.deepEqual(norm(a.secondaryPartsOf('ショルダープレス')), ['三頭筋']);
});

test('volumeClass() は渡した目標表を使う', () => {
  const a = app();
  assert.equal(a.volumeClass('胸', 9, { 胸:[8,14] }), ' good');
  assert.equal(a.volumeClass('胸', 9), ' low');   // 初期値は12〜20
});

test('bodyPartOf() はレッグレイズ系を体幹にする', () => {
  const a = app();
  assert.equal(a.bodyPartOf('レッグレイズ'), '体幹');
  assert.equal(a.bodyPartOf('ハンギングレッグレイズ'), '体幹');
  assert.equal(a.bodyPartOf('ニーレイズ'), '体幹');
  // 他のレッグ種目・レイズ種目は変わらない
  assert.equal(a.bodyPartOf('レッグプレス'), '脚');
  assert.equal(a.bodyPartOf('レッグカール'), '脚');
  assert.equal(a.bodyPartOf('サイドレイズ'), '肩');
});

test('bodyPartOf() は有酸素マシンを部位に数えない', () => {
  const a = app();
  for(const n of ['トレッドミル','アップライトバイク','リカンベントバイク','クロストレーナー','ステアクライマー']){
    assert.equal(a.bodyPartOf(n), 'その他', n);
  }
});

test('secondaryPartsOf() はインクライン/ダンベルプレスの補助筋も拾う', () => {
  const a = app();
  assert.deepEqual(norm(a.secondaryPartsOf('インクラインプレス')).sort(), ['三頭筋','肩']);
  assert.deepEqual(norm(a.secondaryPartsOf('インクラインダンベルプレス')).sort(), ['三頭筋','肩']);
});

test('secondaryPartsOf() は肘を曲げない種目で二頭筋を数えない', () => {
  const a = app();
  assert.deepEqual(norm(a.secondaryPartsOf('ストレートアームプルダウン')), []);
  assert.deepEqual(norm(a.secondaryPartsOf('ダンベルプルオーバー')), []);
});

test('secondaryPartsOf() は後部肩の種目で僧帽筋を数える', () => {
  const a = app();
  assert.deepEqual(norm(a.secondaryPartsOf('フェイスプル')), ['僧帽筋']);
  assert.deepEqual(norm(a.secondaryPartsOf('リアデルトフライ')), ['僧帽筋']);
});

test('secondaryPartsOf() はフライ系で三頭筋を数えない', () => {
  const a = app();
  assert.deepEqual(norm(a.secondaryPartsOf('ペクトラルフライ')), []);
  assert.deepEqual(norm(a.secondaryPartsOf('ダンベルフライ')), []);
  assert.deepEqual(norm(a.secondaryPartsOf('ケーブルクロスオーバー')), []);
});

test('secondaryPartsOf() は有酸素マシン・器具名で補助筋を数えない', () => {
  const a = app();
  assert.deepEqual(norm(a.secondaryPartsOf('ローイングマシン')), []);
  assert.deepEqual(norm(a.secondaryPartsOf('アップライトバイク')), []);
  assert.deepEqual(norm(a.secondaryPartsOf('パワーラック')), []);
});

test('weeklyVolume() は有酸素マシンをセット数に加えない', () => {
  const sessions = [{ id:'s1', date:'2026-09-21', type:'strength', exercises:[
    { name:'ローイングマシン', sets:[{},{},{}] },
    { name:'シーテッドロウ', sets:[{},{},{}] },
  ]}];
  const v = norm(loadApp({ storage:{ wac_sessions: JSON.stringify(sessions) } }).weeklyVolume(0).byPart);
  assert.equal(v['広背筋'], 3);
  assert.equal(v['僧帽筋'], 1.5);   // シーテッドロウの分だけ
  assert.equal(v['二頭筋'], 1.5);
  assert.equal(v['その他'] || 0, 0);   // 有酸素マシンはどの部位にも入らない
});
