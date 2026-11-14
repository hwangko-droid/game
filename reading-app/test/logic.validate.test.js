'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGs } = require('./load');
const L = loadGs(['Logic.js']);

const s = { careers: ['교육','자연과학'], minBodyChars: 300 };
const ids = new Set(['B-1']);
const base = { bookId: 'B-1', body: '가'.repeat(300), recTarget: '교사 꿈꾸는', recReason: '재밌다', question: '' };

test('body too short reports counts', () => {
  assert.deepEqual({ ...L.validateEssay_({ ...base, body: '가'.repeat(299) }, s, ids) },
    { ok: false, error: '감상은 최소 300자 이상 써 주세요. (지금 299자)' });
});
test('body length measured after trim', () => {
  const r = L.validateEssay_({ ...base, body: '   ' + '가'.repeat(300) + '\n\n' }, s, ids);
  assert.equal(r.ok, true);
  assert.equal(r.data.body.length, 300);
  assert.equal(L.validateEssay_({ ...base, body: '   ' + '가'.repeat(299) + '   ' }, s, ids).ok, false);
});
test('body too long', () => {
  assert.equal(L.validateEssay_({ ...base, body: '가'.repeat(50000) }, s, ids).error, '감상은 5000자까지 쓸 수 있어요.');
});
test('blank reason rejected', () => {
  assert.equal(L.validateEssay_({ ...base, recReason: '   ' }, s, ids).error, '추천 대상과 이유를 채워 주세요.');
  assert.equal(L.validateEssay_({ ...base, recTarget: '' }, s, ids).error, '추천 대상과 이유를 채워 주세요.');
  assert.equal(L.validateEssay_({ ...base, recReason: '가'.repeat(201) }, s, ids).ok, false);
});
test('unknown book rejected', () => {
  assert.equal(L.validateEssay_({ ...base, bookId: 'X' }, s, ids).error, '목록에 있는 책을 골라 주세요.');
});
test('question optional, capped at 200', () => {
  assert.equal(L.validateEssay_({ ...base, question: '' }, s, ids).ok, true);
  assert.equal(L.validateEssay_({ ...base, question: undefined }, s, ids).ok, true);
  assert.equal(L.validateEssay_({ ...base, question: '가'.repeat(201) }, s, ids).ok, false);
});
test('comment validation', () => {
  assert.equal(L.validateComment_('   ').error, '댓글 내용을 입력해 주세요.');
  assert.equal(L.validateComment_('가'.repeat(501)).error, '댓글은 500자까지 쓸 수 있어요.');
  assert.equal(L.validateComment_('  좋아 ').data, '좋아');
});
test('new book validation', () => {
  assert.equal(L.validateNewBook_({ title: 'x', author: 'y', careers: ['우주'] }, s).ok, false);
  assert.equal(L.validateNewBook_({ title: 'x', author: 'y', careers: [] }, s).ok, false);
  assert.equal(L.validateNewBook_({ title: ' ', author: 'y', careers: ['교육'] }, s).ok, false);
  assert.equal(L.validateNewBook_({ title: 'x'.repeat(101), author: 'y', careers: ['교육'] }, s).ok, false);
  const r = L.validateNewBook_({ title: ' 책 ', author: ' 저자 ', careers: ['교육'] }, s);
  assert.equal(r.ok, true);
  assert.equal(r.data.title, '책');
});
