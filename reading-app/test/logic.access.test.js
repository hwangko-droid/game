'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGs } = require('./load');
const L = loadGs(['Logic.js']);

const CAREERS = ['의약·보건','공학·IT','자연과학','교육','법·행정·정치','경영·경제','인문·언어','사회·심리','미디어·예술','아직 모르겠음'];
const s = { careers: CAREERS, entryCodeOn: true, entryCode: '2027', minBodyChars: 300, adminPassword: '관리1234' };
const stu = { sid: '2-07', name: '김가', token: 'TOK' };

test('admin password token is admin', () => {
  assert.equal(L.accessState_('관리1234', null, s), 'admin');
});
test('empty admin password never matches', () => {
  assert.equal(L.accessState_('', null, { ...s, adminPassword: '' }), 'login');
});
test('known student token is student, otherwise login', () => {
  assert.equal(L.accessState_('TOK', stu, s), 'student');
  assert.equal(L.accessState_('', null, s), 'login');
  assert.equal(L.accessState_('nope', null, s), 'login');
});
test('checkEntryCode trims and ignores case; numeric code from sheet', () => {
  assert.equal(L.checkEntryCode_(' 2027 ', s), true);
  assert.equal(L.checkEntryCode_('2026', s), false);
  assert.equal(L.checkEntryCode_('', s), false);
  assert.equal(L.checkEntryCode_('2027', { ...s, entryCode: 2027 }), true);
  assert.equal(L.checkEntryCode_('', { ...s, entryCodeOn: false }), true);
});
test('validateProfile_', () => {
  const ok = { name: ' 김가 ', classNo: 3, number: 5, career: '교육' };
  const r = L.validateProfile_(ok, s);
  assert.equal(r.ok, true);
  assert.equal(r.data.name, '김가');
  assert.equal(L.validateProfile_({ ...ok, name: '  ' }, s).ok, false);
  assert.equal(L.validateProfile_({ ...ok, name: 'ㄱ'.repeat(21) }, s).ok, false);
  assert.equal(L.validateProfile_({ ...ok, classNo: 0 }, s).ok, false);
  assert.equal(L.validateProfile_({ ...ok, classNo: 16 }, s).ok, false);
  assert.equal(L.validateProfile_({ ...ok, number: 41 }, s).ok, false);
  assert.equal(L.validateProfile_({ ...ok, number: 2.5 }, s).ok, false);
  assert.equal(L.validateProfile_({ ...ok, career: '우주비행사' }, s).ok, false);
  assert.equal(L.validateProfile_({ ...ok, classNo: '3', number: '5' }, s).data.classNo, 3);
});
