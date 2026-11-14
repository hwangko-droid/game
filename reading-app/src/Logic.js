/* Logic.js — 순수 함수 (시트·세션에 의존하지 않음) */

var SCHOOL_DOMAIN = 'ai.jbedu.kr';

var HEADERS = {
  '학생': ['이메일', '이름', '반', '번호', '진로분야', '최초접속일'],
  '도서': ['도서ID', '제목', '저자', '구분', '진로분야', '연결봉우리ID', '한줄소개', '출처'],
  '독후감': ['독후감ID', '이메일', '도서ID', '감상', '추천대상', '추천이유', '질문', '작성일', '수정일', '숨김'],
  '댓글': ['댓글ID', '독후감ID', '이메일', '내용', '작성일', '숨김'],
  '설정': ['키', '값']
};

// 탭별 [객체 키, 변환 종류]
var FIELDS_ = {
  '학생': [['email', 's'], ['name', 's'], ['classNo', 'n'], ['number', 'n'], ['career', 's'], ['joinedAt', 's']],
  '도서': [['id', 's'], ['title', 's'], ['author', 's'], ['kind', 's'], ['careers', 'list'], ['peakId', 's'], ['intro', 's'], ['source', 's']],
  '독후감': [['id', 's'], ['email', 's'], ['bookId', 's'], ['body', 's'], ['recTarget', 's'], ['recReason', 's'], ['question', 's'], ['createdAt', 's'], ['updatedAt', 's'], ['hidden', 'b']],
  '댓글': [['id', 's'], ['essayId', 's'], ['email', 's'], ['body', 's'], ['createdAt', 's'], ['hidden', 'b']]
};

function splitList_(v) {
  return String(v == null ? '' : v).split(',').map(function (x) { return x.trim(); }).filter(Boolean);
}

function toBool_(v) {
  return v === true || String(v).trim().toUpperCase() === 'TRUE';
}

function cellToValue_(v, kind) {
  if (kind === 'n') return v === '' || v == null ? 0 : Number(v);
  if (kind === 'b') return toBool_(v);
  if (kind === 'list') return splitList_(v);
  if (v instanceof Date) return v.toISOString();
  return v == null ? '' : String(v);
}

function valueToCell_(v, kind) {
  if (kind === 'list') return (v || []).join(',');
  if (kind === 'b') return v ? 'TRUE' : 'FALSE';
  if (kind === 'n') return Number(v) || 0;
  return v == null ? '' : v;
}

function rowToObject(tab, row) {
  var o = {};
  FIELDS_[tab].forEach(function (f, i) { o[f[0]] = cellToValue_(row[i], f[1]); });
  return o;
}

function objectToRow(tab, obj) {
  return FIELDS_[tab].map(function (f) { return valueToCell_(obj[f[0]], f[1]); });
}

function newId(prefix) {
  var rand = Math.floor(Math.random() * 36 * 36 * 36 * 36).toString(36);
  while (rand.length < 4) rand = '0' + rand;
  newId.seq_ = (newId.seq_ || 0) + 1;
  return prefix + '-' + Date.now().toString(36) + rand + newId.seq_.toString(36);
}

function normEmail_(email) {
  return String(email == null ? '' : email).trim().toLowerCase();
}

function isSchoolEmail(email) {
  var e = normEmail_(email);
  var at = e.lastIndexOf('@');
  return at > 0 && e.slice(at + 1) === SCHOOL_DOMAIN;
}

/* ---------- 접근 판정 · 등록 ---------- */

function ok_(data) { return { ok: true, data: data }; }
function fail_(error) { return { ok: false, error: error }; }

function isAdminEmail_(email, settings) {
  var e = normEmail_(email);
  return (settings.adminEmails || []).some(function (a) { return normEmail_(a) === e; });
}

function accessState(email, student, settings) {
  if (!isSchoolEmail(email)) return 'outsider';
  if (isAdminEmail_(email, settings)) return 'admin';
  if (student) return 'student';
  return settings.entryCodeOn ? 'needsCode' : 'needsProfile';
}

function checkEntryCode(input, settings) {
  if (!settings.entryCodeOn) return true;
  var a = String(input == null ? '' : input).trim().toLowerCase();
  var b = String(settings.entryCode == null ? '' : settings.entryCode).trim().toLowerCase();
  return a !== '' && a === b;
}

function intInRange_(v, lo, hi) {
  var n = Number(v);
  return String(v).trim() !== '' && Number.isInteger(n) && n >= lo && n <= hi ? n : null;
}

function validateProfile(p, settings) {
  p = p || {};
  var name = String(p.name == null ? '' : p.name).trim();
  if (name.length < 1 || name.length > 20) return fail_('이름을 1~20자로 입력해 주세요.');
  var classNo = intInRange_(p.classNo, 1, 15);
  if (classNo === null) return fail_('반을 1~15 사이 숫자로 입력해 주세요.');
  var number = intInRange_(p.number, 1, 40);
  if (number === null) return fail_('번호를 1~40 사이 숫자로 입력해 주세요.');
  if ((settings.careers || []).indexOf(p.career) < 0) return fail_('진로 분야를 목록에서 골라 주세요.');
  return ok_({ name: name, classNo: classNo, number: number, career: p.career });
}

/* ---------- 입력 검증 ---------- */

function str_(v) { return String(v == null ? '' : v).trim(); }

function validateEssay(e, settings, bookIds) {
  e = e || {};
  var min = Number(settings.minBodyChars) || 0;
  var body = str_(e.body);
  if (body.length < min) return fail_('감상은 최소 ' + min + '자 이상 써 주세요. (지금 ' + body.length + '자)');
  if (body.length > 5000) return fail_('감상은 5000자까지 쓸 수 있어요.');
  var recTarget = str_(e.recTarget), recReason = str_(e.recReason), question = str_(e.question);
  if (!recTarget || !recReason) return fail_('추천 대상과 이유를 채워 주세요.');
  if (recTarget.length > 200 || recReason.length > 200) return fail_('추천 대상과 이유는 각각 200자까지 쓸 수 있어요.');
  if (question.length > 200) return fail_('질문은 200자까지 쓸 수 있어요.');
  if (!bookIds.has(e.bookId)) return fail_('목록에 있는 책을 골라 주세요.');
  return ok_({ bookId: e.bookId, body: body, recTarget: recTarget, recReason: recReason, question: question });
}

function validateComment(body) {
  var b = str_(body);
  if (!b) return fail_('댓글 내용을 입력해 주세요.');
  if (b.length > 500) return fail_('댓글은 500자까지 쓸 수 있어요.');
  return ok_(b);
}

function validateNewBook(b, settings) {
  b = b || {};
  var title = str_(b.title), author = str_(b.author);
  if (title.length < 1 || title.length > 100) return fail_('책 제목을 1~100자로 입력해 주세요.');
  if (author.length < 1 || author.length > 60) return fail_('저자를 1~60자로 입력해 주세요.');
  var careers = Array.isArray(b.careers) ? b.careers : [];
  if (!careers.length || careers.some(function (c) { return (settings.careers || []).indexOf(c) < 0; })) {
    return fail_('진로 분야를 하나 이상 목록에서 골라 주세요.');
  }
  return ok_({ title: title, author: author, careers: careers.slice() });
}
