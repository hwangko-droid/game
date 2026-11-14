'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGs, plain } = require('./load');
const { makeDb } = require('./fixture');
const L = loadGs(['Logic.js']);

const s = { careers: ['의약·보건', '교육', '자연과학', '공학·IT'] };
const qids = new Set(['Q1', 'Q2', 'Q3', 'Q4']);

test('validateInterests_ accepts 1–3 known questions and a level', () => {
  const r = L.validateInterests_({ career: '교육', level: '보통', questions: ['Q1', 'Q3'] }, s, qids);
  assert.equal(r.ok, true);
  assert.deepEqual(plain(r.data), { career: '교육', level: '보통', questions: ['Q1', 'Q3'] });
});
test('validateInterests_ rejects bad input', () => {
  const base = { career: '교육', level: '보통', questions: ['Q1'] };
  assert.equal(L.validateInterests_({ ...base, questions: [] }, s, qids).error, '궁금한 질문을 1~3개 골라 주세요.');
  assert.equal(L.validateInterests_({ ...base, questions: ['Q1', 'Q2', 'Q3', 'Q4'] }, s, qids).error, '궁금한 질문을 1~3개 골라 주세요.');
  assert.equal(L.validateInterests_({ ...base, questions: ['Q9'] }, s, qids).ok, false);
  assert.equal(L.validateInterests_({ ...base, level: '많이' }, s, qids).error, '독서량을 골라 주세요.');
  assert.equal(L.validateInterests_({ ...base, career: '우주' }, s, qids).ok, false);
});
test('validateInterests_ removes duplicates', () => {
  assert.deepEqual(plain(L.validateInterests_({ career: '교육', level: '깊게', questions: ['Q1', 'Q1'] }, s, qids).data.questions), ['Q1']);
});

function recDb() {
  const db = makeDb();
  db.questions = [{ id: 'Q1', text: '우주에서 나는?' }, { id: 'Q2', text: '공정이란?' }, { id: 'Q3', text: '배움이란?' }];
  db.books = [
    { id: 'P01', title: '코스모스', author: 'a', kind: '봉우리', careers: ['자연과학'], peakId: '', intro: '', source: '', level: '깊게', questions: ['Q1'] },
    { id: 'B01', title: '과학콘서트', author: 'b', kind: '징검다리', careers: ['자연과학'], peakId: 'P01', intro: '', source: '', level: '가볍게', questions: ['Q1'] },
    { id: 'B07', title: '정의란', author: 'c', kind: '징검다리', careers: ['교육'], peakId: '', intro: '', source: '', level: '보통', questions: ['Q2', 'Q3'] },
    { id: 'X1', title: '무관한 책', author: 'd', kind: '징검다리', careers: ['공학·IT'], peakId: '', intro: '', source: '', level: '보통', questions: [] },
    { id: 'R1', title: '이미 읽음', author: 'e', kind: '징검다리', careers: ['교육'], peakId: '', intro: '', source: '', level: '가볍게', questions: ['Q3'] },
  ];
  db.essays = [{ id: 'E9', sid: 'c@ai.jbedu.kr', bookId: 'R1', body: 'x', recTarget: 't', recReason: 'r', question: '', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '', hidden: false }];
  return db;
}
const me = { sid: 'c@ai.jbedu.kr', career: '교육', level: '가볍게', questions: ['Q1', 'Q3'] };

test('recommendBooks_ scores question×3 + career + level fit, excludes read and unrelated', () => {
  const r = plain(L.recommendBooks_(recDb(), me, { sid: me.sid, isAdmin: false }));
  assert.deepEqual(r.map(b => b.id), ['B07', 'B01', 'P01']);
  // B07: Q3(3) + 교육(1) + 보통 vs 가볍게(0) = 4 ; B01: Q1(3) + 가볍게(1) = 4 → tie by kind/title ; P01: Q1(3) + 깊게 vs 가볍게(−1) = 2
  assert.equal(r[0].match.score, 4);
  assert.deepEqual(r[0].match.questions, ['배움이란?']);
  assert.equal(r[0].match.career, true);
  assert.equal(r[1].match.levelFit, true);
  assert.equal(r[2].match.score, 2);
  assert.ok(!r.some(b => b.id === 'R1' || b.id === 'X1'));
});

test('recommendBooks_ caps at 6 and handles a student without interests', () => {
  const db = recDb();
  for (let i = 0; i < 10; i++) db.books.push({ ...db.books[1], id: 'Z' + i, title: 'z' + i });
  assert.equal(L.recommendBooks_(db, me, { sid: me.sid }).length, 6);
  assert.deepEqual(plain(L.recommendBooks_(db, { sid: 'n', career: '공학·IT', level: '', questions: [] }, { sid: 'n' })).map(b => b.id), ['X1']);
});

test('bookCards_ include question texts and level', () => {
  const c = plain(L.bookCards_(recDb(), {}, { sid: 'x' })).find(b => b.id === 'B07');
  assert.deepEqual(c.questionTexts, ['공정이란?', '배움이란?']);
  assert.equal(c.level, '보통');
});
