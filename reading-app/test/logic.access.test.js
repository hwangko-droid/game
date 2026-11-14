'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGs } = require('./load');
const L = loadGs(['Logic.js']);

const CAREERS = ['의약·보건','공학·IT','자연과학','교육','법·행정·정치','경영·경제','인문·언어','사회·심리','미디어·예술','아직 모르겠음'];
const s = { careers: CAREERS, entryCodeOn: true, entryCode: 'HN2026', minBodyChars: 300, adminEmails: ['t@ai.jbedu.kr'] };
const stu = { email: 'kim@ai.jbedu.kr', name: '김가' };

test('outsider for non-school or empty email', () => {
  assert.equal(L.accessState('x@gmail.com', null, s), 'outsider');
  assert.equal(L.accessState('', null, s), 'outsider');
});
test('admin case-insensitive, regardless of registration', () => {
  assert.equal(L.accessState('T@ai.jbedu.kr', null, s), 'admin');
  assert.equal(L.accessState('t@ai.jbedu.kr', stu, s), 'admin');
});
test('unregistered needs code when on, profile when off', () => {
  assert.equal(L.accessState('kim@ai.jbedu.kr', null, s), 'needsCode');
  assert.equal(L.accessState('kim@ai.jbedu.kr', null, { ...s, entryCodeOn: false }), 'needsProfile');
});
test('registered is student', () => {
  assert.equal(L.accessState('kim@ai.jbedu.kr', stu, s), 'student');
});
test('checkEntryCode trims and ignores case', () => {
  assert.equal(L.checkEntryCode('  hn2026 ', s), true);
  assert.equal(L.checkEntryCode('hn2025', s), false);
  assert.equal(L.checkEntryCode('', s), false);
  assert.equal(L.checkEntryCode(undefined, s), false);
  assert.equal(L.checkEntryCode('', { ...s, entryCodeOn: false }), true);
});
test('validateProfile', () => {
  const ok = { name: ' 김가 ', classNo: 3, number: 5, career: '교육' };
  const r = L.validateProfile(ok, s);
  assert.equal(r.ok, true);
  assert.equal(r.data.name, '김가');
  assert.equal(L.validateProfile({ ...ok, name: '  ' }, s).ok, false);
  assert.equal(L.validateProfile({ ...ok, name: 'ㄱ'.repeat(21) }, s).ok, false);
  assert.equal(L.validateProfile({ ...ok, classNo: 0 }, s).ok, false);
  assert.equal(L.validateProfile({ ...ok, classNo: 16 }, s).ok, false);
  assert.equal(L.validateProfile({ ...ok, number: 41 }, s).ok, false);
  assert.equal(L.validateProfile({ ...ok, number: 2.5 }, s).ok, false);
  assert.equal(L.validateProfile({ ...ok, career: '우주비행사' }, s).ok, false);
  assert.equal(L.validateProfile({ ...ok, classNo: '3', number: '5' }, s).data.classNo, 3);
});
