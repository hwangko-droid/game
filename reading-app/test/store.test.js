'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGs, plain, fakeSpreadsheet } = require('./load');

function setup() {
  const f = fakeSpreadsheet();
  const G = loadGs(['Logic.js', 'Seed.js', 'Store.js'], { SpreadsheetApp: f.SpreadsheetApp });
  return { G, ss: f.ss };
}

test('setupSpreadsheet creates tabs with headers and seed books', () => {
  const { G, ss } = setup();
  G.setupSpreadsheet_();
  for (const tab of ['학생', '도서', '독후감', '댓글', '설정', '질문']) {
    assert.deepEqual(plain(ss._sheets[tab][0]), plain(G.HEADERS[tab]), tab);
  }
  assert.equal(ss._sheets['도서'].length, 1 + G.SEED_BOOKS.length);
});

test('setupSpreadsheet is idempotent', () => {
  const { G, ss } = setup();
  G.setupSpreadsheet_();
  const code = G.readSettings_().entryCode;
  G.setupSpreadsheet_();
  assert.equal(ss._sheets['도서'].length, 1 + G.SEED_BOOKS.length);
  assert.equal(ss._sheets['설정'].length, 1 + Object.keys(G.SEED_SETTINGS).length);
  assert.equal(G.readSettings_().entryCode, code);
  const pw = G.readSettings_().adminPassword;
  G.setupSpreadsheet_();
  assert.equal(G.readSettings_().adminPassword, pw);
});

test('readSettings defaults', () => {
  const { G } = setup();
  G.setupSpreadsheet_();
  const s = plain(G.readSettings_());
  assert.equal(s.entryCodeOn, true);
  assert.equal(s.minBodyChars, 300);
  assert.deepEqual(s.careers, plain(G.SEED_CAREERS));
  assert.match(s.adminPassword, /^관리\d{4}$/);
  assert.equal(s.entryCode, '2027');
  assert.match(s.libraryUrl, /^https:\/\/read365\.edunet\.net\/PureScreen\/SchoolSearch\?/);
  assert.equal(s.schoolYear, '2026');
});

test('appendRow and readAll round trip', () => {
  const { G } = setup();
  G.setupSpreadsheet_();
  const c = { id: 'C-1', essayId: 'E-1', sid: 'a@ai.jbedu.kr', body: '안녕', createdAt: 'x', hidden: false };
  G.appendRow_('댓글', c);
  assert.deepEqual(plain(G.readAll_().comments), [c]);
  assert.equal(G.readAll_().books.length, G.SEED_BOOKS.length);
});

test('updateRowById patches only given fields', () => {
  const { G } = setup();
  G.setupSpreadsheet_();
  const e = { id: 'E-1', sid: 'a@ai.jbedu.kr', bookId: 'P01', body: '옛', recTarget: 't', recReason: 'r', question: 'q', createdAt: 'c', updatedAt: '', hidden: false };
  G.appendRow_('독후감', e);
  assert.equal(G.updateRowById_('독후감', 'E-1', { body: '새' }), true);
  assert.deepEqual(plain(G.readAll_().essays[0]), { ...e, body: '새' });
  assert.equal(G.updateRowById_('독후감', 'nope', { body: 'x' }), false);
});

test('updateRowById on 학생 keys by student id', () => {
  const { G } = setup();
  G.setupSpreadsheet_();
  G.appendRow_('학생', { sid: '1-01', name: '가', classNo: 1, number: 1, career: '교육', joinedAt: 'x', token: 'T' });
  assert.equal(G.updateRowById_('학생', '1-01', { career: '공학·IT' }), true);
  assert.equal(G.readAll_().students[0].career, '공학·IT');
});

test('seed books consistent', () => {
  const { G } = setup();
  const ids = new Set(G.SEED_BOOKS.map(b => b.id));
  assert.equal(ids.size, G.SEED_BOOKS.length);
  for (const b of G.SEED_BOOKS) {
    for (const c of b.careers) assert.ok(G.SEED_CAREERS.includes(c), `${b.title}: ${c}`);
    if (b.peakId) assert.equal(G.SEED_BOOKS.find(x => x.id === b.peakId).kind, '봉우리', b.title);
  }
  assert.equal(G.SEED_BOOKS.length, 22);
  assert.equal(G.SEED_BOOKS.filter(b => b.source === '서울대 권장도서 100선').length, 9);
});

test('entry code setting fails closed', () => {
  const { G, ss } = setup();
  G.setupSpreadsheet_();
  const row = ss._sheets['설정'].find(r => r[0] === '입장코드사용');
  for (const [v, want] of [['', true], ['켜짐', true], ['ON', true], ['TRUE', true], ['FALSE', false], ['false', false], [false, false], [' False ', false], ['끄기', true]]) {
    row[1] = v;
    assert.equal(G.readSettings_().entryCodeOn, want, JSON.stringify(v));
  }
});

test('seed questions linked to books, every book has a level', () => {
  const { G } = setup();
  G.setupSpreadsheet_();
  const qs = G.readAll_().questions;
  assert.equal(qs.length, G.SEED_QUESTIONS.length);
  assert.ok(qs.length >= 12);
  const ids = new Set(qs.map(q => q.id));
  for (const b of G.readAll_().books) {
    assert.ok(['가볍게', '보통', '깊게'].includes(b.level), b.title);
    assert.ok(b.questions.length >= 1, b.title);
    for (const q of b.questions) assert.ok(ids.has(q), `${b.title}: ${q}`);
  }
  for (const q of qs) assert.ok(G.readAll_().books.some(b => b.questions.includes(q.id)), q.text);
});
