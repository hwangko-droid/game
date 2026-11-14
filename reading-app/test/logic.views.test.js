'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGs, plain } = require('./load');
const { makeDb } = require('./fixture');
const L = loadGs(['Logic.js']);

const stu = { sid: 'c@ai.jbedu.kr', isAdmin: false };
const adm = { sid: 't@ai.jbedu.kr', isAdmin: true };
const all = (v) => JSON.stringify(v);

test('careerView lists all friends incl. those without essays, ordered by class then number', () => {
  const v = plain(L.careerView_(makeDb(), '의약·보건', stu));
  assert.deepEqual(v.friends.map(f => f.name), ['나학생', '가학생']);
  assert.deepEqual(v.friends[1].bookTitles, ['과학콘서트']);
  assert.deepEqual(v.friends[0].bookTitles, []); // b의 글은 숨김
  assert.equal(v.recentEssays.length, 1);
  assert.equal(v.recentEssays[0].authorName, '가학생');
  assert.equal(v.recentEssays[0].commentCount, 1);
});

test('hidden excluded everywhere for students, visible to admin', () => {
  const db = makeDb();
  assert.ok(!all(L.careerView_(db, '의약·보건', stu)).includes('숨김'));
  assert.ok(!all(L.bookCards_(db, {}, stu)).includes('숨김'));
  assert.equal(L.essayDetail_(db, 'E4', stu), null);
  assert.ok(!all(L.essayDetail_(db, 'E1', stu)).includes('숨김댓글'));
  const p = plain(L.bookCards_(db, {}, stu)).find(b => b.id === 'P01');
  assert.equal(p.readerCount, 1);

  assert.ok(all(L.careerView_(db, '의약·보건', adm)).includes('숨김이유'));
  assert.equal(plain(L.bookCards_(db, {}, adm)).find(b => b.id === 'P01').readerCount, 2);
  assert.ok(L.essayDetail_(db, 'E4', adm));
  assert.ok(all(L.essayDetail_(db, 'E1', adm)).includes('숨김댓글'));
});

test('recentEssays newest first, max 20', () => {
  const db = makeDb();
  for (let i = 0; i < 25; i++) db.essays.push({ ...db.essays[0], id: 'X' + i, createdAt: `2026-10-${String(i + 1).padStart(2, '0')}T00:00:00.000Z` });
  const v = plain(L.careerView_(db, '의약·보건', stu));
  assert.equal(v.recentEssays.length, 20);
  assert.equal(v.recentEssays[0].id, 'E1');
});

test('bookCards search ignores spaces and case', () => {
  const r = plain(L.bookCards_(makeDb(), { q: '코 스 모' }, stu));
  assert.deepEqual(r.map(b => b.id), ['P01']);
  assert.deepEqual(plain(L.bookCards_(makeDb(), { q: '정재승' }, stu)).map(b => b.id), ['B01']);
});

test('bookCards career filter includes tagged books and books read by that career', () => {
  const ids = plain(L.bookCards_(makeDb(), { career: '교육' }, stu)).map(b => b.id).sort();
  assert.deepEqual(ids, ['B01', 'U-1']);
});

test('bookCards peak/bridge links, ordering, topReason', () => {
  const r = plain(L.bookCards_(makeDb(), {}, stu));
  assert.deepEqual(r.map(b => b.id), ['B01', 'P01', 'U-1']);
  const b01 = r[0], p01 = r[1];
  assert.equal(b01.readerCount, 2);
  assert.deepEqual(b01.readersByCareer, { '의약·보건': 1, '교육': 1 });
  assert.equal(b01.topReason.recReason, '이유2');
  assert.deepEqual(b01.peak, { id: 'P01', title: '코스모스' });
  assert.deepEqual(p01.bridges, [{ id: 'B01', title: '과학콘서트' }]);
  assert.equal(r[2].topReason, null);
});

test('bookCards tie order: peak before bridge before student-added', () => {
  const db = makeDb(); db.essays = [];
  assert.deepEqual(plain(L.bookCards_(db, {}, stu)).map(b => b.kind), ['봉우리', '징검다리', '학생추가']);
});

test('essayDetail shape', () => {
  const d = plain(L.essayDetail_(makeDb(), 'E1', stu));
  assert.equal(d.essay.body, '본문1');
  assert.equal(d.essay.bookTitle, '과학콘서트');
  assert.deepEqual(d.comments.map(c => [c.authorName, c.authorClass, c.body]), [['다학생', 1, '댓글1']]);
  assert.equal(L.essayDetail_(makeDb(), 'nope', stu), null);
});

test('myRecords includes own hidden essay flagged', () => {
  const r = plain(L.myRecords_(makeDb(), 'b@ai.jbedu.kr'));
  assert.equal(r.essays.length, 1);
  assert.equal(r.essays[0].hidden, true);
  const a = plain(L.myRecords_(makeDb(), 'a@ai.jbedu.kr'));
  assert.deepEqual(a.commentsOnMine.map(c => c.body), ['댓글1']);
});

test('adminSummary ordered by class, counts include hidden', () => {
  const s = plain(L.adminSummary_(makeDb()));
  assert.deepEqual(s.map(c => c.classNo), [1, 2, 3]);
  assert.deepEqual(s[0].students.map(x => x.name), ['다학생', '나학생']);
  assert.equal(s[0].students[1].essayCount, 1);
  assert.equal(s[0].students[0].commentCount, 1);
});
