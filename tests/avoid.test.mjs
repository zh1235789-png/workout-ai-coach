// 前日と同じ部位を避ける（2026-11-17）と、ジムの脚を1日1種目で再開・ブルガリアン週1回（2026-11-17）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, norm } from './harness.mjs';

const gym = (id, date, names, sets = 3) => ({ id, date, exercises: names.map(name => ({ name, sets: Array.from({ length: sets }, () => ({ weight: 40, reps: 10 })) })) });
const withSessions = (today, sessions) => loadApp({ today: today + 'T20:00:00+09:00', storage: { wac_sessions: JSON.stringify(sessions) } });
const CHEST = ['マシンチェストプレス', 'マシンインクラインプレス'];
const BACK = ['フロントプル', 'DPLシーテッドロー（縦グリップ・肘を体に沿わせる）', 'インクラインダンベルカール'];
const SHOULDER = ['ショルダープレス（志村マシン）', 'ダンベルサイドレイズ'];

test('月曜に胸をやったら、火曜（胸＋三頭）は重ならない水曜のメニューに差し替える。ラン・脚は火曜のまま', () => {
  const a = withSessions('2026-11-16', [gym('m', '2026-11-16', CHEST)]);   // 月
  const next = a.nextGymSlot('2026-11-16');
  assert.equal(next.label, '火');
  assert.equal(next.key, 'wed');
  assert.equal(next.dayKey, 'tue');
  assert.equal(next.focus, '背中＋二頭');
  assert.equal(next.leg, 'レッグエクステンション');
  assert.equal(next.run, '朝ラン（Greg 5K。イージーかスピード練習）');
  assert.equal(a.swapNoteText(next), '前日に胸をやったので、火曜の予定（胸＋三頭）を水曜のメニュー（背中＋二頭）に差し替え');
});

test('曜日どおりなら差し替えない（火=胸→水=背中、金=肩→土=胸と背中）', () => {
  const a = withSessions('2026-11-21', [gym('t', '2026-11-17', CHEST.concat(['フレンチプレス（ダンベル1個を両手で持つ）'])), gym('f', '2026-11-20', SHOULDER)]);
  assert.equal(a.nextGymSlot('2026-11-17').key, 'wed');
  assert.equal(a.nextGymSlot('2026-11-17').swappedFrom, undefined);
  assert.equal(a.nextGymSlot('2026-11-20').key, 'sat');
  assert.equal(a.nextGymSlot('2026-11-20').swappedFrom, undefined);
});

test('差し替え先は今週まだやっていない曜日を優先する', () => {
  // 月に肩（=金のメニュー済み）、火に背中 → 水（背中）は重なる。候補は 金(済み) → 土(背中で重なる) → 火 なので火のメニュー
  const a = withSessions('2026-11-17', [gym('m', '2026-11-16', SHOULDER), gym('t', '2026-11-17', BACK)]);
  const next = a.nextGymSlot('2026-11-17');
  assert.equal(next.label, '水');
  assert.equal(next.key, 'tue');
  assert.equal(next.leg, null);   // 水曜はジムの脚なし（曜日のまま）
  // 何もやっていなければ一番近い候補（金）
  assert.equal(withSessions('2026-11-17', [gym('t', '2026-11-17', BACK)]).nextGymSlot('2026-11-17').key, 'fri');
});

test('1セットだけ・アップだけ・脚と体幹は「鍛えた部位」に数えない', () => {
  assert.equal(withSessions('2026-11-16', [gym('m', '2026-11-16', ['マシンチェストプレス'], 1)]).nextGymSlot('2026-11-16').key, 'tue');
  const warm = { id: 'w', date: '2026-11-16', exercises: [{ name: 'マシンチェストプレス', sets: [{ weight: 20, reps: 15, warmup: true }, { weight: 20, reps: 15, warmup: true }, { weight: 40, reps: 10 }] }] };
  assert.equal(withSessions('2026-11-16', [warm]).nextGymSlot('2026-11-16').key, 'tue');
  assert.equal(withSessions('2026-11-16', [gym('m', '2026-11-16', ['レッグプレス', 'アブドミナル（志村マシン）'])]).nextGymSlot('2026-11-16').key, 'tue');
  // 有酸素だけの記録も数えない
  assert.equal(withSessions('2026-11-16', [{ id: 'c', type: 'cardio', cardio: 'kb', date: '2026-11-16', kbMenus: ['coretabata'] }]).nextGymSlot('2026-11-16').key, 'tue');
});

test('差し替えは週間スケジュールと今日のメニュー（AIの提案がないとき）に出る', () => {
  const a = withSessions('2026-11-17', [gym('m', '2026-11-16', CHEST)]);
  const card = a.renderWeekScheduleCard('1', '2026-11-16');
  assert.match(card, /次回は火曜：背中＋二頭・脚：レッグエクステンション/);
  assert.match(card, /🔁 前日に胸をやったので、火曜の予定（胸＋三頭）を水曜のメニュー（背中＋二頭）に差し替え/);
  assert.match(card, /<div class="wk-day">火<\/div>.*?背中＋二頭・脚：レッグエクステンション<span class="wk-tag">次回（差し替え）<\/span>.*?1\. フロントプル.*?<div class="wk-day">水<\/div>/s);
  assert.doesNotMatch(card.slice(card.indexOf('<div class="wk-day">火</div>'), card.indexOf('<div class="wk-day">水</div>')), /マシンチェストプレス/);
  // 水曜の行は予定どおり（背中＋二頭）
  assert.match(card, /<div class="wk-day">水<\/div>.*?背中＋二頭・脚なし/s);
  const today = a.renderTodayMenuCard(null, '1', '2026-11-17');
  assert.match(today, /火・背中＋二頭/);
  assert.match(today, /1?フロントプル/);
  assert.match(today, /🔁 前日に胸をやったので/);
  assert.match(today, /🦵 脚（1種目・2〜3セット）<\/div><div class="menu-ex"><div class="n">レッグエクステンション/);
  assert.doesNotMatch(today, /マシンチェストプレス/);
});

test('プロンプト: 次回が翌日なら、今日の写真の部位で差し替えるようAIに頼む（候補の順と今週済みの曜日つき）', () => {
  const mon = withSessions('2026-11-16', []).buildPrompt('1', 'none', null, 0);
  assert.match(mon, /【前日と同じ部位を避ける（2026-11-17）】/);
  assert.match(mon, /次回（火・胸＋三頭、主な部位=胸・三頭）は今日の翌日です/);
  assert.match(mon, /候補はこの順に見る: 水（背中＋二頭、主な部位=背中・二頭） → 金（肩、主な部位=肩） → 土（胸と背中、主な部位=胸・背中）/);
  assert.match(mon, /今週すでにやった曜日のメニュー: なし/);
  assert.match(mon, /ただし下の【前日と同じ部位を避ける】で差し替えるときは、差し替え先の曜日の「必須」にします/);
  // 次回が翌日でない（水→金）ときは出さない
  assert.doesNotMatch(withSessions('2026-11-18', []).buildPrompt('1', 'none', null, 0), /【前日と同じ部位を避ける/);
  // 日曜（振替）が次回のときは、振替の選び方に前日の部位を避けるよう書く
  assert.match(withSessions('2026-11-21', []).buildPrompt('1', 'none', null, 0), /前日（土）に筋トレをした部位（今日の分）と同じ部位の種目は選ばないでください/);
});

test('プロンプト: 今日の記録が保存済みで差し替わっていれば、差し替え先のメニューで組ませる', () => {
  const p = withSessions('2026-11-16', [gym('m', '2026-11-16', CHEST)]).buildPrompt('1', 'none', null, 0);
  assert.match(p, /次回の筋トレは「火（背中＋二頭）」の予定です/);
  assert.match(p, /※前日に胸をやったので、火曜の予定（胸＋三頭）を水曜のメニュー（背中＋二頭）に差し替えました。must_exercisesは水曜の「必須」にしてください/);
  assert.match(p, /次回（火。水曜のメニューに差し替え済み）の「必須」5種目/);
  assert.match(p, /次回メニューの脚は「レッグエクステンション」を1種目だけ/);
  assert.doesNotMatch(p, /【前日と同じ部位を避ける（2026-11-17）】/);
});

test('ブルガリアンは週1回以上: ジムの種目名かケトルベルの記録で数え、土曜はまだならブルガリアン', () => {
  const none = withSessions('2026-11-20', []);
  assert.equal(none.bulgarianDoneThisWeek('2026-11-20'), false);
  assert.match(none.buildPrompt('1', 'none', null, 0), /次回メニューの脚は「ブルガリアンスクワット」を1種目/);
  assert.match(none.buildPrompt('1', 'none', null, 0), /今週のブルガリアン: まだ（土曜のジムの脚はブルガリアンスクワットにする）/);
  const kb = withSessions('2026-11-20', [{ id: 'k', type: 'cardio', cardio: 'kb', date: '2026-11-18', kbMenus: ['heavywed'] }]);
  assert.equal(kb.bulgarianDoneThisWeek('2026-11-20'), true);
  assert.match(kb.buildPrompt('1', 'none', null, 0), /次回メニューの脚は「レッグプレスかハックスクワット」を1種目/);
  assert.match(kb.buildPrompt('1', 'none', null, 0), /今週のブルガリアン: 済み/);
  assert.equal(withSessions('2026-11-20', [{ id: 'n', type: 'cardio', cardio: 'kb', date: '2026-11-19', kbMenus: [], kbNote: 'ブルガリアン 左右3×10' }]).bulgarianDoneThisWeek('2026-11-20'), true);
  assert.equal(withSessions('2026-11-20', [gym('g', '2026-11-17', ['ブルガリアンスクワット'])]).bulgarianDoneThisWeek('2026-11-20'), true);
  // 先週の分は数えない（週は月曜始まり）
  assert.equal(withSessions('2026-11-20', [gym('g', '2026-11-15', ['ブルガリアンスクワット'])]).bulgarianDoneThisWeek('2026-11-20'), false);
  // 水・日はジムの脚なし
  const plan = none.$('WEEK_PLAN');
  assert.deepEqual(norm(plan.map(p => [p.key, p.leg])), [['tue', 'レッグエクステンション'], ['wed', null], ['fri', 'レッグカール'], ['sat', 'レッグプレスかハックスクワット（今週ブルガリアンがまだならブルガリアンスクワット）'], ['sun', null]]);
});
