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
  if (v == null || v === '') return '';
  // 앞에 ' 를 붙이면 시트가 수식(=…)·숫자·날짜로 해석하지 않고 글자 그대로 저장한다 (읽을 때 ' 는 보이지 않음)
  return "'" + String(v);
}

function rowToObject_(tab, row) {
  var o = {};
  FIELDS_[tab].forEach(function (f, i) { o[f[0]] = cellToValue_(row[i], f[1]); });
  return o;
}

function objectToRow_(tab, obj) {
  return FIELDS_[tab].map(function (f) { return valueToCell_(obj[f[0]], f[1]); });
}

function newId_(prefix) {
  var rand = Math.floor(Math.random() * 36 * 36 * 36 * 36).toString(36);
  while (rand.length < 4) rand = '0' + rand;
  newId_.seq_ = (newId_.seq_ || 0) + 1;
  return prefix + '-' + Date.now().toString(36) + rand + newId_.seq_.toString(36);
}

function normEmail_(email) {
  return String(email == null ? '' : email).trim().toLowerCase();
}

function isSchoolEmail_(email) {
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

function accessState_(email, student, settings) {
  if (!isSchoolEmail_(email)) return 'outsider';
  if (isAdminEmail_(email, settings)) return 'admin';
  if (student) return 'student';
  return settings.entryCodeOn ? 'needsCode' : 'needsProfile';
}

function checkEntryCode_(input, settings) {
  if (!settings.entryCodeOn) return true;
  var a = String(input == null ? '' : input).trim().toLowerCase();
  var b = String(settings.entryCode == null ? '' : settings.entryCode).trim().toLowerCase();
  return a !== '' && a === b;
}

function intInRange_(v, lo, hi) {
  var n = Number(v);
  return String(v).trim() !== '' && Number.isInteger(n) && n >= lo && n <= hi ? n : null;
}

function validateProfile_(p, settings) {
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

function validateEssay_(e, settings, bookIds) {
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

function validateComment_(body) {
  var b = str_(body);
  if (!b) return fail_('댓글 내용을 입력해 주세요.');
  if (b.length > 500) return fail_('댓글은 500자까지 쓸 수 있어요.');
  return ok_(b);
}

function validateNewBook_(b, settings) {
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

/* ---------- 화면용 데이터 조립 ---------- */

var KIND_ORDER_ = { '봉우리': 0, '징검다리': 1, '학생추가': 2 };

function kindRank_(k) { return k in KIND_ORDER_ ? KIND_ORDER_[k] : 9; }

function indexBy_(arr, key) {
  var m = {};
  arr.forEach(function (x) { m[key(x)] = x; });
  return m;
}

function byNewest_(a, b) { return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0; }
function byOldest_(a, b) { return -byNewest_(a, b); }
function byClassNo_(a, b) { return a.classNo - b.classNo || a.number - b.number; }

// 뷰어가 볼 수 있는 항목만 남긴 db와 조회용 색인
function ctx_(db, viewer) {
  var admin = !!(viewer && viewer.isAdmin);
  var essays = db.essays.filter(function (e) { return admin || !e.hidden; });
  var comments = db.comments.filter(function (c) { return admin || !c.hidden; });
  var visibleEssayIds = indexBy_(essays, function (e) { return e.id; });
  comments = comments.filter(function (c) { return visibleEssayIds[c.essayId]; });
  return {
    admin: admin,
    essays: essays,
    comments: comments,
    stu: indexBy_(db.students, function (s) { return normEmail_(s.email); }),
    book: indexBy_(db.books, function (b) { return b.id; })
  };
}

function essayCard_(c, e) {
  var s = c.stu[normEmail_(e.email)] || {};
  var b = c.book[e.bookId] || {};
  return {
    id: e.id, bookId: e.bookId, bookTitle: b.title || '', authorName: s.name || '', authorClass: s.classNo || 0,
    career: s.career || '', recTarget: e.recTarget, recReason: e.recReason, question: e.question,
    createdAt: e.createdAt, hidden: !!e.hidden,
    commentCount: c.comments.filter(function (x) { return x.essayId === e.id; }).length
  };
}

function careerOf_(c, email) {
  var s = c.stu[normEmail_(email)];
  return s ? s.career : '';
}

function careerView_(db, career, viewer) {
  var c = ctx_(db, viewer);
  var friends = db.students.filter(function (s) { return s.career === career; }).slice().sort(byClassNo_)
    .map(function (s) {
      var titles = [];
      c.essays.forEach(function (e) {
        if (normEmail_(e.email) !== normEmail_(s.email)) return;
        var t = (c.book[e.bookId] || {}).title;
        if (t && titles.indexOf(t) < 0) titles.push(t);
      });
      return { name: s.name, classNo: s.classNo, bookTitles: titles };
    });
  var recent = c.essays.filter(function (e) { return careerOf_(c, e.email) === career; })
    .slice().sort(byNewest_).slice(0, 20).map(function (e) { return essayCard_(c, e); });
  return { career: career, friends: friends, recentEssays: recent };
}

function squash_(s) { return String(s || '').replace(/\s+/g, '').toLowerCase(); }

function bookCards_(db, filter, viewer) {
  filter = filter || {};
  var c = ctx_(db, viewer);
  var q = squash_(filter.q);
  var cards = db.books.map(function (b) {
    var es = c.essays.filter(function (e) { return e.bookId === b.id; }).slice().sort(byNewest_);
    var readers = {}, byCareer = {};
    es.forEach(function (e) {
      var em = normEmail_(e.email);
      if (readers[em]) return;
      readers[em] = true;
      var cr = careerOf_(c, em);
      if (cr) byCareer[cr] = (byCareer[cr] || 0) + 1;
    });
    var peak = b.peakId && c.book[b.peakId] ? { id: b.peakId, title: c.book[b.peakId].title } : null;
    var bridges = db.books.filter(function (x) { return x.peakId === b.id; }).map(function (x) { return { id: x.id, title: x.title }; });
    return {
      id: b.id, title: b.title, author: b.author, kind: b.kind, careers: b.careers.slice(), peakId: b.peakId,
      intro: b.intro, source: b.source,
      readerCount: Object.keys(readers).length, readersByCareer: byCareer,
      topReason: es.length ? essayCard_(c, es[0]) : null, peak: peak, bridges: bridges
    };
  });
  if (filter.career) {
    cards = cards.filter(function (k) { return k.careers.indexOf(filter.career) >= 0 || k.readersByCareer[filter.career]; });
  }
  if (q) {
    cards = cards.filter(function (k) { return squash_(k.title).indexOf(q) >= 0 || squash_(k.author).indexOf(q) >= 0; });
  }
  return cards.sort(function (a, b) {
    return b.readerCount - a.readerCount ||
      kindRank_(a.kind) - kindRank_(b.kind) ||
      String(a.title).localeCompare(String(b.title), 'ko');
  });
}

function essayDetail_(db, essayId, viewer) {
  var c = ctx_(db, viewer);
  var e = c.essays.filter(function (x) { return x.id === essayId; })[0];
  if (!e) return null;
  var card = essayCard_(c, e);
  card.body = e.body;
  card.updatedAt = e.updatedAt;
  card.authorEmail = e.email;
  var comments = c.comments.filter(function (x) { return x.essayId === e.id; }).slice().sort(byOldest_)
    .map(function (x) {
      var s = c.stu[normEmail_(x.email)] || {};
      return { id: x.id, authorName: s.name || '', authorClass: s.classNo || 0, body: x.body, createdAt: x.createdAt, hidden: !!x.hidden };
    });
  return { essay: card, comments: comments };
}

function myRecords_(db, email) {
  var me = normEmail_(email);
  var c = ctx_(db, { isAdmin: false });
  var mineAll = db.essays.filter(function (e) { return normEmail_(e.email) === me; });
  var essays = mineAll.slice().sort(byNewest_).map(function (e) { return essayCard_(c, e); });
  var mineIds = indexBy_(mineAll, function (e) { return e.id; });
  var commentsOnMine = c.comments.filter(function (x) { return mineIds[x.essayId] && normEmail_(x.email) !== me; })
    .slice().sort(byNewest_).map(function (x) {
      var s = c.stu[normEmail_(x.email)] || {};
      return { essayId: x.essayId, bookTitle: (c.book[mineIds[x.essayId].bookId] || {}).title || '', authorName: s.name || '', body: x.body, createdAt: x.createdAt };
    });
  return { essays: essays, commentsOnMine: commentsOnMine };
}

function adminSummary_(db) {
  var classes = {};
  db.students.slice().sort(byClassNo_).forEach(function (s) {
    var em = normEmail_(s.email);
    (classes[s.classNo] = classes[s.classNo] || []).push({
      name: s.name, number: s.number, email: s.email,
      essayCount: db.essays.filter(function (e) { return normEmail_(e.email) === em; }).length,
      commentCount: db.comments.filter(function (x) { return normEmail_(x.email) === em; }).length
    });
  });
  return Object.keys(classes).map(Number).sort(function (a, b) { return a - b; })
    .map(function (k) { return { classNo: k, students: classes[k] }; });
}
