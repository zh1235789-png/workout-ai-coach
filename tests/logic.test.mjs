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
  const a = loadApp({ today:'2026-09-21T09:00:00+09:00', storage:{ wac_sessions: JSON.stringify(sessions) } });
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
  assert.deepEqual(norm(a.getVolumeTargets()['脚']), [10,12]);   // 未設定の部位は初期値
});

test('getVolumeTargets() は壊れた保存値を無視する', () => {
  const a = loadApp({ storage:{ wac_vol_targets: '{"胸":"ダメ","脚":[5]}' } });
  assert.deepEqual(norm(a.getVolumeTargets()['胸']), [12,20]);
  assert.deepEqual(norm(a.getVolumeTargets()['脚']), [10,12]);
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
  const v = norm(loadApp({ today:'2026-09-21T09:00:00+09:00', storage:{ wac_sessions: JSON.stringify(sessions) } }).weeklyVolume(0).byPart);
  assert.equal(v['広背筋'], 3);
  assert.equal(v['僧帽筋'], 1.5);   // シーテッドロウの分だけ
  assert.equal(v['二頭筋'], 1.5);
  assert.equal(v['その他'] || 0, 0);   // 有酸素マシンはどの部位にも入らない
});

// ===== weeklyVolume(): 暦週ではなく直近7日で数える =====

test('weeklyVolume() は直近7日（今日を含む）で数える', () => {
  const sessions = [
    { id:'a', date:'2026-09-24', type:'strength', exercises:[{ name:'アームカール', sets:[{},{}] }] },       // 今日
    { id:'b', date:'2026-09-18', type:'strength', exercises:[{ name:'アームカール', sets:[{},{}] }] },       // 6日前＝範囲内
    { id:'c', date:'2026-09-17', type:'strength', exercises:[{ name:'アームカール', sets:[{},{},{},{}] }] }, // 7日前＝範囲外
  ];
  const a = loadApp({ today:'2026-09-24T09:00:00+09:00', storage:{ wac_sessions: JSON.stringify(sessions) } });
  const cur = a.weeklyVolume(0);
  assert.equal(cur.from, '2026-09-18');
  assert.equal(cur.to, '2026-09-24');
  assert.equal(norm(cur.byPart)['二頭筋'], 4);
  assert.equal(cur.sessionCount, 2);
});

test('weeklyVolume(1) はその前の7日を返し、範囲が重ならない', () => {
  const sessions = [
    { id:'c', date:'2026-09-17', type:'strength', exercises:[{ name:'アームカール', sets:[{},{},{},{}] }] },
  ];
  const a = loadApp({ today:'2026-09-24T09:00:00+09:00', storage:{ wac_sessions: JSON.stringify(sessions) } });
  const prev = a.weeklyVolume(1);
  assert.equal(prev.from, '2026-09-11');
  assert.equal(prev.to, '2026-09-17');
  assert.equal(norm(prev.byPart)['二頭筋'], 4);
  assert.equal(norm(a.weeklyVolume(0).byPart)['二頭筋'] || 0, 0);
});

test('weeklyVolume() は曜日が変わっても窓がずれるだけで数え落ちない', () => {
  const sessions = [{ id:'a', date:'2026-09-21', type:'strength', exercises:[{ name:'アームカール', sets:[{},{},{}] }] }];
  const mon = loadApp({ today:'2026-09-21T09:00:00+09:00', storage:{ wac_sessions: JSON.stringify(sessions) } });
  const sun = loadApp({ today:'2026-09-27T09:00:00+09:00', storage:{ wac_sessions: JSON.stringify(sessions) } });
  assert.equal(norm(mon.weeklyVolume(0).byPart)['二頭筋'], 3);
  assert.equal(norm(sun.weeklyVolume(0).byPart)['二頭筋'], 3);   // 暦週なら翌週扱いで0になっていた
});

// ===== 集計期間の切り替え（直近7日 / 暦週） =====

test('weeklyVolume() は暦週モードだと日曜始まりで数える', () => {
  const sessions = [
    { id:'a', date:'2026-09-24', type:'strength', exercises:[{ name:'アームカール', sets:[{},{}] }] },   // 木
    { id:'b', date:'2026-09-19', type:'strength', exercises:[{ name:'アームカール', sets:[{},{}] }] },   // 前週の土
  ];
  const a = loadApp({ today:'2026-09-24T09:00:00+09:00', storage:{ wac_sessions: JSON.stringify(sessions), wac_vol_range:'week' } });
  const cur = a.weeklyVolume(0);
  assert.equal(cur.from, '2026-09-20');   // 日曜
  assert.equal(cur.to, '2026-09-26');     // 土曜
  assert.equal(norm(cur.byPart)['二頭筋'], 2);
  const prev = a.weeklyVolume(1);
  assert.equal(prev.from, '2026-09-13');
  assert.equal(norm(prev.byPart)['二頭筋'], 2);   // 9/19は前週に入る
});

test('getVolumeRange() の既定は直近7日で、保存値で切り替わる', () => {
  assert.equal(loadApp({}).getVolumeRange(), 'rolling');
  assert.equal(loadApp({ storage:{ wac_vol_range:'week' } }).getVolumeRange(), 'week');
  assert.equal(loadApp({ storage:{ wac_vol_range:'へんな値' } }).getVolumeRange(), 'rolling');
});

test('weeklyVolume() は引数でモードを上書きできる', () => {
  const sessions = [{ id:'b', date:'2026-09-19', type:'strength', exercises:[{ name:'アームカール', sets:[{},{}] }] }];
  const a = loadApp({ today:'2026-09-24T09:00:00+09:00', storage:{ wac_sessions: JSON.stringify(sessions) } });
  assert.equal(norm(a.weeklyVolume(0, 'rolling').byPart)['二頭筋'], 2);       // 5日前なので直近7日に入る
  assert.equal(norm(a.weeklyVolume(0, 'week').byPart)['二頭筋'] || 0, 0);     // 暦週では前週
});

test('renderWeeklyVolumeCard() は例外なくHTMLを返す（両モード）', () => {
  const sessions = [{ id:'a', date:'2026-09-24', type:'strength', exercises:[{ name:'ベンチプレス', sets:[{},{},{}] }] }];
  for(const range of ['rolling','week']){
    const a = loadApp({ today:'2026-09-24T09:00:00+09:00', storage:{ wac_sessions: JSON.stringify(sessions), wac_vol_range: range } });
    const html = a.renderWeeklyVolumeCard();
    assert.match(html, /部位別セット数/);
    assert.match(html, /vol-range/);            // 切り替えボタンがある
    assert.match(html, /三頭筋/);
  }
});

test('renderTrends() と weeklyVolumeText() も例外なく動く（両モード）', () => {
  for(const range of ['rolling','week']){
    const a = loadApp({ today:'2026-09-24T09:00:00+09:00', storage:{ wac_vol_range: range } });
    assert.equal(typeof a.renderTrends(), 'string');
    assert.equal(typeof a.weeklyVolumeText(), 'string');
  }
});

// ===== 脚トレは3回に分散（2026-10-14） =====

test('buildPrompt() は脚だけの日を作らず、火・金・土に脚を入れ、旧カテゴリは定義に残さない', () => {
  const p = app().buildPrompt('1', 'none', null, 0);
  assert.match(p, /火・金・土に脚種目を1〜2種目入れます（水曜はロング走なのでなし、日曜は週の脚が足りないときだけ）/);
  assert.doesNotMatch(p, /"Delts\+": /);
  assert.doesNotMatch(p, /"Legs\+": /);
});

test('buildPrompt() は脚のタイプをA/B/Cで回し、拮抗筋スーパーセットとハムの痛みの条件を含む', () => {
  const p = app().buildPrompt('1', 'none', null, 0);
  assert.match(p, /レッグエクステンション＋レッグカールの拮抗筋スーパーセット/);
  assert.match(p, /脚トレは再開済み/);
});

test('脚の目標は10〜12。旧初期値(12〜20)で保存済みなら起動時に1回だけ置き換え、自分で変えた値は残す', () => {
  const old = loadApp({ storage:{ wac_vol_targets: JSON.stringify({ 胸:[12,20], 脚:[12,20] }) } });
  assert.deepEqual(norm(old.getVolumeTargets()['脚']), [10,12]);
  assert.deepEqual(norm(old.getVolumeTargets()['胸']), [12,20]);
  const mine = loadApp({ storage:{ wac_vol_targets: JSON.stringify({ 脚:[8,14] }) } });
  assert.deepEqual(norm(mine.getVolumeTargets()['脚']), [8,14]);
  // 移行済みなら、あとで自分で12〜20に戻した値も触らない
  const back = loadApp({ storage:{ wac_vol_targets: JSON.stringify({ 脚:[12,20] }), wac_leg_target_2026_10:'1' } });
  assert.deepEqual(norm(back.getVolumeTargets()['脚']), [12,20]);
});

test('buildPrompt() はmustを曜日の必須（水曜5・ほか4）、optionalを脚1〜2＋上半身1〜2にする', () => {
  const p = app().buildPrompt('1', 'none', null, 0);
  assert.match(p, /must_exercises: 【このジムの曜日別メニュー】の次回の曜日の「必須」（水曜は5種目、ほかは4種目/);
  assert.match(p, /optional_exercises: 脚の提案1〜2種目＋上半身の提案1〜2種目/);
  assert.doesNotMatch(p, /合計8種目ちょうど/);
  assert.doesNotMatch(p, /2種目ともmust_exercises/);
  assert.doesNotMatch(p, /段階的に再開する提案/);
});

// ===== 記録は筋トレMEMO、ここは提案専用（2026-10-19） =====

test('buildPrompt() は筋トレを直近5回、有酸素を直近7日として別々に渡す', () => {
  const sessions = [];
  for (let d = 1; d <= 7; d++) {
    sessions.push({ id:'w'+d, date:`2026-09-0${d}`, exercises:[{ name:'ベンチプレス', sets:[{ weight:60+d, reps:8 }] }], next_menu:{ category:'Push' } });
  }
  for (let d = 10; d <= 20; d++) {
    sessions.push({ id:'c'+d, type:'cardio', date:`2026-09-${d}`, cardio:'run', cardioMin:30 });
  }
  const p = loadApp({ today:'2026-09-21T09:00:00+09:00', storage:{ wac_sessions: JSON.stringify(sessions) } }).buildPrompt('1', 'none', null, 0);
  const hist = p.split('【直近の筋トレ履歴')[1].split('【直近7日の有酸素運動】')[0];
  assert.doesNotMatch(hist, /2026-09-02/);           // 6回前以前は入れない
  assert.match(hist, /2026-09-03[\s\S]*2026-09-07/);  // 有酸素が多くても筋トレ5回分は残る
  assert.doesNotMatch(hist, /有酸素のみ/);
  const cardio = p.split('【直近7日の有酸素運動】')[1].split('【')[0];
  assert.match(cardio, /2026-09-15/);
  assert.doesNotMatch(cardio, /2026-09-14/);          // 7日より前は入れない
});

test('exerciseHistorySummaryText() は全期間から種目ごとに前回・最高・推定1RM推移・回数をまとめる', () => {
  const sessions = [
    { id:'a', date:'2026-08-01', exercises:[{ name:'ラットプルダウン', sets:[{ weight:20, reps:15, warmup:true }, { weight:45, reps:10 }] }, { name:'懸垂', sets:[{ weight:null, reps:6 }] }] },
    { id:'b', date:'2026-09-01', exercises:[{ name:'ラットプルダウン', sets:[{ weight:52.5, reps:8 }] }] },
    { id:'c', date:'2026-10-17', exercises:[{ name:'ラットプルダウン', sets:[{ weight:50, reps:10 }, { weight:50, reps:9 }] }] },
    { id:'d', type:'cardio', date:'2026-10-18', cardio:'run' },
  ];
  const t = loadApp({ storage:{ wac_sessions: JSON.stringify(sessions) } }).exerciseHistorySummaryText();
  const lat = t.split('\n').find(l=>l.startsWith('ラットプルダウン'));
  assert.match(lat, /前回 10\/17 50kg×10, 50kg×9/);
  assert.match(lat, /最高 52.5kg×8（09\/01）/);          // アップの20kgは数えない
  assert.match(lat, /推定1RM 60→66.7kg（08\/01→10\/17）/);
  assert.match(lat, /計3回/);
  assert.match(t, /懸垂: 前回 08\/01 自重×6 ／ 最高 自重×6（08\/01） ／ 計1回/);
  assert.ok(t.indexOf('ラットプルダウン') < t.indexOf('懸垂'));   // 前回が新しい順
  assert.equal(loadApp().exerciseHistorySummaryText(), '');
});

// ===== 店舗別の軸種目（2026-10-19） =====

test('buildPrompt() は選んだジムの曜日別メニューを渡し、志村ではケーブル不可を明記する', () => {
  const shimura = loadApp({ today:'2026-10-19T20:00:00+09:00' }).buildPrompt('1', 'none', null, 0);   // 月 → 次は火
  assert.match(shimura, /■火（胸＋三頭）\n  必須（この順で固定）: 1\. マシンチェストプレス \/ 2\. マシンインクラインプレス \/ 3\. ペクトラルフライ（志村） \/ 4\. フレンチプレス（ダンベル1個を両手で持つ）/);
  assert.match(shimura, /■水（背中＋二頭）\n  必須（この順で固定）: 1\. フロントプル .* 5\. インクラインダンベルカール/);
  assert.match(shimura, /■金（肩）\n  必須（この順で固定）: 1\. ショルダープレス（志村マシン）/);
  assert.match(shimura, /■土（胸と背中）\n  必須（この順で固定）: 1\. マシンチェストプレス \/ 2\. マシンインクラインプレス \/ 3\. チンニング（縦グリップ）/);
  assert.match(shimura, /ケーブルマシンは使えません/);
  assert.match(shimura, /must_exercisesは、次回（火）の「必須」4種目を上の順番/);
  const hongo = loadApp({ today:'2026-10-20T20:00:00+09:00' }).buildPrompt('2', 'none', null, 0);   // 火 → 次は水
  assert.match(hongo, /■水（背中＋二頭）\n  必須（この順で固定）: 1\. チンニング（縦グリップ）/);
  assert.match(hongo, /must_exercisesは、次回（水）の「必須」5種目/);
  assert.doesNotMatch(hongo, /ケーブルマシンは使えません/);
  for (const p of [shimura, hongo]) assert.match(p, /バーベルのベンチプレス・バーベルロウ・デッドリフト/);
});

test('DAY_MENUS は両店舗とも火・金・土が4種目、水が5種目で、志村にケーブル種目がなく、土曜は火・水と同じ種目', () => {
  const m = app().$('DAY_MENUS');
  for (const g of ['1', '2']) {
    for (const d of ['tue', 'fri', 'sat']) assert.equal(m[g][d].must.length, 4, `${g} ${d}`);
    assert.equal(m[g].wed.must.length, 5, `${g} wed`);
    // 土曜の種目は火曜か水曜の種目（志村の縦引きだけはチンニング）
    const earlier = new Set([...m[g].tue.must, ...m[g].wed.must, 'チンニング（縦グリップ）']);
    for (const n of m[g].sat.must) assert.ok(earlier.has(n), `${g} sat ${n}`);
    assert.ok(m[g].fri.must.some(n => /ショルダープレス/.test(n)), `${g} fri`);
  }
  const shimuraNames = ['tue','wed','fri','sat'].flatMap(d => [...m['1'][d].must, ...m['1'][d].optional]);
  assert.ok(shimuraNames.every(n => !/ケーブル|ロープ/.test(n)), shimuraNames.join(','));
});

test('軸種目の部位分類: 肘を開くロウは僧帽筋が主働、ロープ種目は広背筋にしない、ダンベルプレスは胸', () => {
  const a = app();
  assert.equal(a.bodyPartOf('Tバーロウ（ワイド・肘を開く）'), '僧帽筋');
  assert.deepEqual(norm(a.secondaryPartsOf('ケーブルロウ（ワイド・肘を開く）')).sort(), ['二頭筋', '広背筋', '肩'].sort());
  assert.equal(a.bodyPartOf('DPLシーテッドロー（縦グリップ・肘を体に沿わせる）'), '広背筋');
  assert.equal(a.bodyPartOf('フロントプル'), '広背筋');
  assert.deepEqual(norm(a.secondaryPartsOf('フロントプル')), ['二頭筋']);
  assert.equal(a.bodyPartOf('ロープオーバーヘッドエクステンション'), '三頭筋');
  assert.equal(a.bodyPartOf('ダンベルプレス'), '胸');
  assert.equal(a.bodyPartOf('ダンベルショルダープレス'), '肩');
  // 全軸種目が「その他」に落ちない
  const all = Object.values(a.$('DAY_MENUS')).flatMap(g => ['tue','wed','fri','sat'].flatMap(d => g[d].must));
  for (const n of all) assert.notEqual(a.bodyPartOf(n), 'その他', n);
});

test('buildPrompt() の脚タイプAはレッグプレスかハックスクワット、Cはブルガリアンかダンベルルーマニアンで、スクワットとヒップスラストは提案しない', () => {
  const p = app().buildPrompt('2', 'none', null, 0);
  assert.match(p, /- A: レッグプレス、またはハックスクワット（志村はどちらか、本郷はレッグプレス）/);
  assert.match(p, /バーベル・スミス・フロントのスクワットは提案しない/);
  assert.doesNotMatch(p, /A: スクワット系/);
  assert.match(p, /- C: ブルガリアンスクワット、またはダンベルのルーマニアンデッドリフト（ストラップ使用）。ヒップスラストは提案しない/);
});

// ===== 新しい刺激枠（2026-10-19） =====

test('buildPrompt() は新しい刺激枠を1種目求め、直近の提案を渡して重複を避けさせる', () => {
  const sessions = [
    { id:'a', date:'2026-09-10', exercises:[], next_menu:{ category:'Push', bonus_exercise:{ name:'ケーブルクロスオーバー', reason:'x' } } },
    { id:'b', date:'2026-09-14', exercises:[], next_menu:{ category:'Pull', bonus_exercise:{ name:'ワンハンドロウ', reason:'y' } } },
  ];
  const a = loadApp({ today:'2026-09-21T09:00:00+09:00', storage:{ wac_sessions: JSON.stringify(sessions) } });
  const p = a.buildPrompt('1', 'none', null, 0);
  assert.match(p, /直近に提案した新しい刺激: ケーブルクロスオーバー、ワンハンドロウ/);
  assert.match(p, /"bonus_exercise": \{"name":/);
  assert.match(p, /- bonus_exercise: 新しい刺激枠を1種目/);
  assert.match(app().buildPrompt('2', 'none', null, 0), /直近に提案した新しい刺激: なし/);
});

test('renderNextMenu() は新しい刺激枠を理由つきで表示し、無ければ出さない', () => {
  const a = app();
  const nm = { category:'Push', must_exercises:[], optional_exercises:[], bonus_exercise:{ name:'ダンベルプルオーバー', target:'2セット×12回 10kg', rest:'60秒', reason:'胸と広背筋を伸びた位置で鍛えられる' } };
  const html = a.renderNextMenu(nm);
  assert.match(html, /新しい刺激（さらに余裕があれば）/);
  assert.match(html, /ダンベルプルオーバー/);
  assert.match(html, /💡 胸と広背筋を伸びた位置で鍛えられる/);
  assert.doesNotMatch(a.renderNextMenu({ must_exercises:[], optional_exercises:[] }), /新しい刺激/);
});

// ===== 週の予定で脚のタイプを決める（2026-10-20） =====

test('nextGymSlot() は月・木を飛ばし、土と日を別の枠として次の筋トレ日を返す', () => {
  const a = app();
  assert.equal(a.nextGymSlot('2026-10-20').label, '水');   // 火 → 水
  assert.equal(a.nextGymSlot('2026-10-21').label, '金');   // 水 → (木オフ) → 金
  assert.equal(a.nextGymSlot('2026-10-23').label, '土');   // 金 → 土
  assert.equal(a.nextGymSlot('2026-10-24').label, '日');   // 土 → 日
  assert.equal(a.nextGymSlot('2026-10-25').label, '火');   // 日 → (月オフ) → 火
  assert.equal(a.nextGymSlot('2026-10-19').label, '火');   // 月(オフ) → 火
});

test('buildPrompt() は曜日で部位と脚タイプを指定し、ロング走の日だけ脚を外す', () => {
  const tue = loadApp({ today:'2026-10-20T20:00:00+09:00' }).buildPrompt('1', 'run', null, 0);
  assert.match(tue, /【週の予定（曜日ごとの部位と脚のタイプ）】/);
  assert.match(tue, /次回の筋トレは「水（背中＋二頭）」の予定です。次回メニューの脚は入れないでください/);
  assert.match(tue, /next_menu.categoryには「背中＋二頭」/);
  assert.match(tue, /脚種目を外すのはロング走の日（水曜）だけ/);
  const fri = loadApp({ today:'2026-10-23T20:00:00+09:00' }).buildPrompt('1', 'run', null, 0);
  assert.match(fri, /次回の筋トレは「土（胸と背中）」の予定です。次回メニューの脚はタイプCにしてください。胸と背中は火・水と同じ種目。Cはブルガリアンスクワットを優先する/);
  const wed = loadApp({ today:'2026-10-21T20:00:00+09:00' }).buildPrompt('1', 'none', null, 0);
  assert.match(wed, /次回の筋トレは「金（肩）」の予定です。次回メニューの脚はタイプAにしてください/);
  const sat = loadApp({ today:'2026-10-24T20:00:00+09:00' }).buildPrompt('1', 'none', null, 0);
  assert.match(sat, /次回の筋トレは「日（その週に足りない部位）」の予定です。次回メニューの脚は週の脚のセット数が目標を下回るときだけ/);
  assert.match(sat, /次回は日曜（その週に足りない部位）です。must_exercisesは、上の火〜土の「必須」から4種目/);
  const sun = loadApp({ today:'2026-10-25T20:00:00+09:00' }).buildPrompt('2', 'none', null, 0);
  assert.match(sun, /次回の筋トレは「火（胸＋三頭）」の予定です。次回メニューの脚はタイプBにしてください。翌日がロング走なのでBは軽め/);
});

test('チンニングが今週まだなら、日曜はmustに入れさせ、土曜までは予定どおり。済みならそう伝える', () => {
  const none = loadApp({ today:'2026-10-24T20:00:00+09:00' }).buildPrompt('1', 'none', null, 0);   // 土 → 次は日
  assert.match(none, /今週のチンニング: まだ。.*日曜のmust_exercisesに必ずチンニング（縦グリップ）/);
  const fri = loadApp({ today:'2026-10-23T20:00:00+09:00' }).buildPrompt('1', 'none', null, 0);    // 金 → 次は土
  assert.match(fri, /今週のチンニング: まだ。.*土曜までのメニューに入っているので、そのとおりに/);
  const done = loadApp({ today:'2026-10-24T20:00:00+09:00', storage:{ wac_sessions: JSON.stringify([
    { id:'a', date:'2026-10-21', exercises:[{ name:'チンニング（縦グリップ）', sets:[{ weight:null, reps:8 }] }] },
  ]) } }).buildPrompt('1', 'none', null, 0);
  assert.match(done, /今週のチンニング: 済み/);
  // 先週のチンニングは数えない（週は月曜始まり）
  const last = loadApp({ today:'2026-10-24T20:00:00+09:00', storage:{ wac_sessions: JSON.stringify([
    { id:'a', date:'2026-10-18', exercises:[{ name:'懸垂', sets:[{ weight:null, reps:8 }] }] },
  ]) } }).buildPrompt('1', 'none', null, 0);
  assert.match(last, /今週のチンニング: まだ/);
});

test('週の予定で日曜はバイク4×4を筋トレ前に行う', () => {
  const p = app().buildPrompt('1', 'none', null, 0);
  assert.match(p, /- 日: その週に足りない部位 \/ ラン=バイク4×4（筋トレ前。余裕がある週は30\/15に替えてもよい）/);
});

// ===== 週間スケジュールのカード（2026-10-21） =====

test('renderWeekScheduleCard() は月〜日を並べ、月・木は休み、今日と次回を示し、選んだジムの種目を出す', () => {
  const a = app();
  const h = a.renderWeekScheduleCard('1', '2026-10-21');   // 水
  const days = [...h.matchAll(/<div class="wk-day">(.)<\/div>/g)].map(m => m[1]).join('');
  assert.equal(days, '月火水木金土日');
  assert.equal((h.match(/休み（手術日）/g) || []).length, 2);
  assert.match(h, /class="wk-row today"><div class="wk-day">水/);
  assert.match(h, /肩・脚A<span class="wk-tag">次回<\/span>/);
  assert.match(h, /次回は金曜：肩・脚A（志村坂上の種目）/);
  assert.match(h, /1\. フロントプル/);
  assert.match(h, /バイク4×4（筋トレ前/);
  const hongo = a.renderWeekScheduleCard('2', '2026-10-21');
  assert.match(hongo, /1\. チンニング（縦グリップ）/);
  assert.doesNotMatch(hongo, /フロントプル/);
});
