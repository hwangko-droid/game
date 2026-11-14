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
    '학생': { sid:'3-07', name:'김가', classNo:3, number:7, career:'교육', joinedAt:'2026-11-14T00:00:00.000Z', token:'tok', level:'보통', questions:['Q1','Q2'] },
    '도서': { id:'P01', title:'코스모스', author:'칼 세이건', kind:'봉우리', careers:['자연과학'], peakId:'', intro:'', source:'x', level:'깊게', questions:['Q4'] },
    '질문': { id:'Q1', text:'기계도 생각할 수 있을까?' },
    '독후감': { id:'E-1', sid:'a@ai.jbedu.kr', bookId:'P01', body:'b', recTarget:'t', recReason:'r', question:'', createdAt:'c', updatedAt:'u', hidden:false },
    '댓글': { id:'C-1', essayId:'E-1', sid:'a@ai.jbedu.kr', body:'hi', createdAt:'c', hidden:true },
  };
  for (const [tab, o] of Object.entries(samples)) {
    assert.deepEqual(plain(L.rowToObject_(tab, L.objectToRow_(tab, o).map(sheetCoerce))), o, tab);
  }
});

test('HEADERS order', () => {
  assert.deepEqual(plain(L.HEADERS['독후감']), ['독후감ID','학생ID','도서ID','감상','추천대상','추천이유','질문','작성일','수정일','숨김']);
  assert.deepEqual(plain(L.HEADERS['설정']), ['키','값']);
});

test('studentId_ is class-number with two-digit number', () => {
  assert.equal(L.studentId_(2, 7), '2-07');
  assert.equal(L.studentId_(11, 30), '11-30');
});

test('student row carries token', () => {
  const st = L.rowToObject_('학생', ['2-07', '김가', 2, 7, '교육', 't', 'TOK']);
  assert.equal(st.token, 'TOK');
  assert.deepEqual(plain(L.HEADERS['학생']), ['학생ID', '이름', '반', '번호', '진로분야', '최초접속일', '접속키', '독서량', '관심질문']);
  assert.deepEqual(plain(L.HEADERS['질문']), ['질문ID', '질문']);
  assert.deepEqual(plain(L.HEADERS['도서']).slice(-2), ['난이도', '질문']);
});

test('newId unique and shaped', () => {
  const a = L.newId_('E'), b = L.newId_('E');
  assert.notEqual(a, b);
  assert.match(a, /^E-[a-z0-9]+$/);
});
