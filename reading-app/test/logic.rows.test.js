'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGs, plain, sheetCoerce } = require('./load');

const L = loadGs(['Logic.js']);

test('hidden column parses to boolean', () => {
  const e = L.rowToObject_('독후감', ['E-1','a@ai.jbedu.kr','B-1','본문','추천대상','이유','질문','2026-11-14','2026-11-14','TRUE']);
  assert.equal(e.hidden, true);
  assert.equal(L.rowToObject_('독후감', ['E-1','a','B','b','t','r','q','c','u','FALSE']).hidden, false);
});

test('book careers split and joined', () => {
  const b = L.rowToObject_('도서', ['B-1','코스모스','칼 세이건','봉우리','자연과학, 공학·IT','','소개','서울대 권장도서 100선']);
  assert.deepEqual(plain(b.careers), ['자연과학','공학·IT']);
  assert.equal(L.objectToRow_('도서', b)[4], '자연과학,공학·IT');
  assert.equal(L.objectToRow_('도서', b)[1], "'코스모스");
});

test('round trip every tab', () => {
  const samples = {
    '학생': { email:'a@ai.jbedu.kr', name:'김가', classNo:3, number:7, career:'교육', joinedAt:'2026-11-14T00:00:00.000Z' },
    '도서': { id:'P01', title:'코스모스', author:'칼 세이건', kind:'봉우리', careers:['자연과학'], peakId:'', intro:'', source:'x' },
    '독후감': { id:'E-1', email:'a@ai.jbedu.kr', bookId:'P01', body:'b', recTarget:'t', recReason:'r', question:'', createdAt:'c', updatedAt:'u', hidden:false },
    '댓글': { id:'C-1', essayId:'E-1', email:'a@ai.jbedu.kr', body:'hi', createdAt:'c', hidden:true },
  };
  for (const [tab, o] of Object.entries(samples)) {
    assert.deepEqual(plain(L.rowToObject_(tab, L.objectToRow_(tab, o).map(sheetCoerce))), o, tab);
  }
});

test('HEADERS order', () => {
  assert.deepEqual(plain(L.HEADERS['독후감']), ['독후감ID','이메일','도서ID','감상','추천대상','추천이유','질문','작성일','수정일','숨김']);
  assert.deepEqual(plain(L.HEADERS['설정']), ['키','값']);
});

test('isSchoolEmail_', () => {
  assert.equal(L.isSchoolEmail_('kim@ai.jbedu.kr'), true);
  assert.equal(L.isSchoolEmail_(''), false);
  assert.equal(L.isSchoolEmail_(null), false);
  assert.equal(L.isSchoolEmail_('kim@gmail.com'), false);
  assert.equal(L.isSchoolEmail_('kim@ai.jbedu.kr.evil.com'), false);
  assert.equal(L.isSchoolEmail_('@ai.jbedu.kr'), false);
  assert.equal(L.isSchoolEmail_(' KIM@AI.JBEDU.KR '), true);
});

test('newId unique and shaped', () => {
  const a = L.newId_('E'), b = L.newId_('E');
  assert.notEqual(a, b);
  assert.match(a, /^E-[a-z0-9]+$/);
});
