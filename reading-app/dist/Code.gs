// 우리 진로 책장 — 이 파일 전체를 앱스 스크립트의 Code.gs에 붙여 넣으세요. (자동 생성: npm run bundle)

// ===== Logic.js =====
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

// ===== Seed.js =====
/* Seed.js — 처음 한 번 시트에 넣는 기본값. 이후에는 시트에서 직접 고친다. */

var SEED_CAREERS = ['의약·보건', '공학·IT', '자연과학', '교육', '법·행정·정치', '경영·경제', '인문·언어', '사회·심리', '미디어·예술', '아직 모르겠음'];

var SEED_SETTINGS = {
  '진로분야목록': SEED_CAREERS.join(','),
  '입장코드사용': 'TRUE',
  '입장코드': '',            // setupSpreadsheet가 '호남'+4자리로 생성
  '감상최소글자': 300,
  '관리자이메일': '',        // setupSpreadsheet가 실행자 이메일로 채움
  '도서관링크': 'https://read365.edunet.net/PureScreen/SchoolSearch?schoolName=%ED%98%B8%EB%82%A8%EA%B3%A0%EB%93%B1%ED%95%99%EA%B5%90&provCode=P10&neisCode=P100000464',
  '학년도': '2026'
};

// 한줄소개는 선생님이 채운다. '서울대 권장도서 100선' 표기는 선생님 확인 필요 (DEPLOY.md).
var SEED_BOOKS = [
  ['P01', '봉우리', '코스모스', '칼 세이건', '자연과학,공학·IT', '', '서울대 권장도서 100선'],
  ['P02', '봉우리', '부분과 전체', '베르너 하이젠베르크', '자연과학', '', '서울대 권장도서 100선'],
  ['P03', '봉우리', '침묵의 봄', '레이첼 카슨', '자연과학,의약·보건', '', '서울대 권장도서 100선'],
  ['P04', '봉우리', '과학혁명의 구조', '토머스 쿤', '자연과학,인문·언어', '', '서울대 권장도서 100선'],
  ['P05', '봉우리', '군주론', '니콜로 마키아벨리', '법·행정·정치', '', '서울대 권장도서 100선'],
  ['P06', '봉우리', '국부론', '애덤 스미스', '경영·경제', '', '서울대 권장도서 100선'],
  ['P07', '봉우리', '광장', '최인훈', '인문·언어,사회·심리', '', '서울대 권장도서 100선'],
  ['P08', '봉우리', '난장이가 쏘아올린 작은 공', '조세희', '사회·심리,인문·언어', '', '서울대 권장도서 100선'],
  ['P09', '봉우리', '열하일기', '박지원', '인문·언어,교육', '', '서울대 권장도서 100선'],
  ['B01', '징검다리', '과학콘서트', '정재승', '자연과학,공학·IT', 'P01', ''],
  ['B02', '징검다리', '랩 걸', '호프 자런', '자연과학', 'P03', ''],
  ['B03', '징검다리', '아픔이 길이 되려면', '김승섭', '의약·보건,사회·심리', 'P03', ''],
  ['B04', '징검다리', '숨결이 바람 될 때', '폴 칼라니티', '의약·보건', '', ''],
  ['B05', '징검다리', '수학이 필요한 순간', '김민형', '공학·IT,자연과학', 'P02', ''],
  ['B06', '징검다리', '코드', '찰스 펫졸드', '공학·IT', '', ''],
  ['B07', '징검다리', '정의란 무엇인가', '마이클 샌델', '법·행정·정치,교육', 'P05', ''],
  ['B08', '징검다리', '선량한 차별주의자', '김지혜', '사회·심리,법·행정·정치,교육', 'P08', ''],
  ['B09', '징검다리', '죽은 경제학자의 살아있는 아이디어', '토드 부크홀츠', '경영·경제', 'P06', ''],
  ['B10', '징검다리', '사피엔스', '유발 하라리', '인문·언어,사회·심리,아직 모르겠음', 'P04', ''],
  ['B11', '징검다리', '미움받을 용기', '기시미 이치로, 고가 후미타케', '사회·심리,교육,아직 모르겠음', '', ''],
  ['B12', '징검다리', '죽은 시인의 사회', 'N. H. 클라인바움', '교육,미디어·예술', '', ''],
  ['B13', '징검다리', '멋진 신세계', '올더스 헉슬리', '미디어·예술,공학·IT,아직 모르겠음', '', '']
].map(function (r) {
  return { id: r[0], kind: r[1], title: r[2], author: r[3], careers: r[4].split(','), peakId: r[5], intro: '', source: r[6] };
});

// ===== Store.js =====
/* Store.js — 구글 시트 읽기/쓰기 */

var TABS_ = ['학생', '도서', '독후감', '댓글', '설정'];

function getSs_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function sheet_(tab) {
  var sh = getSs_().getSheetByName(tab);
  if (!sh) throw new Error('시트 탭 "' + tab + '"이 없습니다. 초기설정을 먼저 실행해 주세요.');
  return sh;
}

function dataRows_(tab) {
  var values = sheet_(tab).getDataRange().getValues();
  return values.slice(1).filter(function (r) { return r.some(function (c) { return c !== '' && c != null; }); });
}

function setupSpreadsheet_(adminEmail) {
  var ss = getSs_();
  TABS_.forEach(function (tab) {
    var sh = ss.getSheetByName(tab);
    if (!sh) {
      sh = ss.insertSheet(tab);
      sh.appendRow(HEADERS[tab]);
      if (sh.setFrozenRows) sh.setFrozenRows(1);
      if (tab === '도서') SEED_BOOKS.forEach(function (b) { sh.appendRow(objectToRow_('도서', b)); });
    }
  });
  var sh = ss.getSheetByName('설정');
  var have = {};
  dataRows_('설정').forEach(function (r) { have[String(r[0])] = true; });
  Object.keys(SEED_SETTINGS).forEach(function (k) {
    if (have[k]) return;
    var v = SEED_SETTINGS[k];
    if (k === '입장코드') v = '호남' + String(1000 + Math.floor(Math.random() * 9000));
    if (k === '관리자이메일') v = adminEmail || '';
    sh.appendRow([k, v]);
  });
}

function isExplicitFalse_(v) {
  return v === false || String(v == null ? '' : v).trim().toUpperCase() === 'FALSE';
}

function readSettings_() {
  var kv = {};
  dataRows_('설정').forEach(function (r) { kv[String(r[0]).trim()] = r[1]; });
  var careers = splitList_(kv['진로분야목록']);
  return {
    careers: careers.length ? careers : SEED_CAREERS.slice(),
    entryCodeOn: !isExplicitFalse_(kv['입장코드사용']),  // 분명히 FALSE일 때만 끈다
    entryCode: String(kv['입장코드'] == null ? '' : kv['입장코드']).trim(),
    minBodyChars: kv['감상최소글자'] === '' || kv['감상최소글자'] == null ? 300 : Number(kv['감상최소글자']),
    adminEmails: splitList_(kv['관리자이메일']),
    libraryUrl: String(kv['도서관링크'] || SEED_SETTINGS['도서관링크']),
    schoolYear: String(kv['학년도'] == null ? '' : kv['학년도'])
  };
}

function readAll_() {
  function read(tab) { return dataRows_(tab).map(function (r) { return rowToObject_(tab, r); }); }
  return { students: read('학생'), books: read('도서'), essays: read('독후감'), comments: read('댓글') };
}

function appendRow_(tab, obj) {
  sheet_(tab).appendRow(objectToRow_(tab, obj));
}

function updateRowById_(tab, id, patch) {
  var sh = sheet_(tab);
  var values = sh.getDataRange().getValues();
  var key = tab === '학생' ? normEmail_(id) : String(id);
  for (var i = 1; i < values.length; i++) {
    var cell = tab === '학생' ? normEmail_(values[i][0]) : String(values[i][0]);
    if (cell !== key) continue;
    var obj = rowToObject_(tab, values[i]);
    Object.keys(patch).forEach(function (k) { obj[k] = patch[k]; });
    var row = objectToRow_(tab, obj);
    sh.getRange(i + 1, 1, 1, row.length).setValues([row]);
    return true;
  }
  return false;
}

// ===== Code.js =====
/* Code.js — 웹앱 진입점과 화면이 부르는 서버 함수(api*) */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('우리 진로 책장')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// 선생님이 앱스 스크립트 편집기에서 한 번 실행: 시트 탭·기본값을 만들고 실행자를 관리자로 등록
function 초기설정() {
  var owner = normEmail_(Session.getEffectiveUser().getEmail());
  if (normEmail_(Session.getActiveUser().getEmail()) !== owner) throw new Error('초기설정은 시트 주인만 실행할 수 있어요.');
  setupSpreadsheet_(owner);
}

function currentUser_() {
  var email = normEmail_(Session.getActiveUser().getEmail());
  var settings = readSettings_();
  var db = readAll_();
  var student = null;
  db.students.forEach(function (s) { if (normEmail_(s.email) === email) student = s; });
  var state = accessState_(email, student, settings);
  return { email: email, state: state, student: student, settings: settings, isAdmin: state === 'admin', db: db };
}

var ERR_ENTRY_ = '먼저 입장 절차를 마쳐 주세요.';
var ERR_ADMIN_ = '선생님만 할 수 있어요.';

// role: 'any' | 'member' (학생·관리자) | 'admin'
function run_(role, fn, write) {
  var lock = null;
  try {
    // 읽기·권한 확인은 잠금 밖에서 한다. 잠금은 실제로 시트에 쓰는 동안만 잡는다.
    var u = currentUser_();
    if (role === 'member' && u.state !== 'student' && u.state !== 'admin') return fail_(ERR_ENTRY_);
    if (role === 'admin' && !u.isAdmin) return fail_(ERR_ADMIN_);
    if (write) { lock = LockService.getScriptLock(); lock.waitLock(10000); }
    var r = fn(u);
    return r && typeof r.ok === 'boolean' ? r : ok_(r);
  } catch (e) {
    return fail_('문제가 생겼어요. 잠시 후 다시 시도해 주세요. (' + (e && e.message ? e.message : e) + ')');
  } finally {
    if (lock && lock.releaseLock) lock.releaseLock();
  }
}

function viewer_(u) { return { email: u.email, isAdmin: u.isAdmin }; }
function nowIso_() { return new Date().toISOString(); }
function bookIdSet_(db) {
  var s = new Set();
  db.books.forEach(function (b) { s.add(b.id); });
  return s;
}

function apiBootstrap() {
  return run_('any', function (u) {
    var member = u.state === 'student' || u.state === 'admin';
    var out = { state: u.state, isAdmin: u.isAdmin };
    if (u.state === 'outsider') return out;
    out.careers = u.settings.careers;
    if (member || u.state === 'needsProfile') {
      out.me = u.student;
      out.libraryUrl = u.settings.libraryUrl;
      out.minBodyChars = u.settings.minBodyChars;
    }
    return out;
  });
}

var MAX_CODE_FAILS_ = 5;
var ERR_CODE_LOCK_ = '입장 코드를 여러 번 틀렸어요. 15분 뒤에 다시 시도해 주세요.';

function codeFails_(email) {
  return Number(CacheService.getScriptCache().get('codefail:' + email) || 0);
}

// 코드를 확인하고, 틀리면 실패 횟수를 올린다. 잠겨 있으면 null.
function tryCode_(u, code) {
  if (codeFails_(u.email) >= MAX_CODE_FAILS_) return null;
  var valid = checkEntryCode_(code, u.settings);
  if (!valid) CacheService.getScriptCache().put('codefail:' + u.email, String(codeFails_(u.email) + 1), 900);
  return valid;
}

function apiCheckCode(code) {
  return run_('any', function (u) {
    if (u.state === 'outsider') return fail_(ERR_ENTRY_);
    var valid = tryCode_(u, code);
    if (valid === null) return fail_(ERR_CODE_LOCK_);
    return { valid: valid };
  });
}

function apiRegister(profile, code) {
  return run_('any', function (u) {
    if (u.state === 'outsider') return fail_(ERR_ENTRY_);
    if (!u.student && u.state !== 'admin') {
      var valid = tryCode_(u, code);
      if (valid === null) return fail_(ERR_CODE_LOCK_);
      if (!valid) return fail_('입장 코드가 맞지 않아요.');
    }
    var v = validateProfile_(profile, u.settings);
    if (!v.ok) return v;
    // 잠금 안에서 다시 확인해 같은 학생이 두 줄로 등록되지 않게 한다
    var existing = readAll_().students.some(function (s) { return normEmail_(s.email) === u.email; });
    if (existing) {
      // 이름은 등록 후 바꿀 수 없다(다른 친구 이름 사칭 방지). 바꿀 일이 있으면 선생님이 시트에서 고친다.
      updateRowById_('학생', u.email, { classNo: v.data.classNo, number: v.data.number, career: v.data.career });
    } else {
      appendRow_('학생', { email: u.email, name: v.data.name, classNo: v.data.classNo, number: v.data.number, career: v.data.career, joinedAt: nowIso_() });
    }
    return { state: u.isAdmin ? 'admin' : 'student' };
  }, true);
}

function apiCareerView(career) {
  return run_('member', function (u) { return careerView_(u.db, career, viewer_(u)); });
}

function apiBookCards(filter) {
  return run_('member', function (u) { return bookCards_(u.db, filter || {}, viewer_(u)); });
}

function apiEssayDetail(id) {
  return run_('member', function (u) {
    var d = essayDetail_(u.db, id, viewer_(u));
    if (!d) return null;
    d.essay.isMine = normEmail_(d.essay.authorEmail) === u.email;
    delete d.essay.authorEmail;
    return d;
  });
}

function apiMyRecords() {
  return run_('member', function (u) { return myRecords_(u.db, u.email); });
}

function apiAdminSummary() {
  return run_('admin', function (u) { return adminSummary_(u.db); });
}

function apiSubmitEssay(e) {
  return run_('member', function (u) {
    var v = validateEssay_(e, u.settings, bookIdSet_(u.db));
    if (!v.ok) return v;
    var now = nowIso_();
    var id = newId_('E');
    appendRow_('독후감', {
      id: id, email: u.email, bookId: v.data.bookId, body: v.data.body, recTarget: v.data.recTarget,
      recReason: v.data.recReason, question: v.data.question, createdAt: now, updatedAt: '', hidden: false
    });
    return { id: id };
  }, true);
}

function apiUpdateEssay(id, e) {
  return run_('member', function (u) {
    var cur = u.db.essays.filter(function (x) { return x.id === id; })[0];
    if (!cur) return fail_('글을 찾을 수 없어요.');
    if (normEmail_(cur.email) !== u.email) return fail_('내가 쓴 글만 고칠 수 있어요.');
    var v = validateEssay_(e, u.settings, bookIdSet_(u.db));
    if (!v.ok) return v;
    updateRowById_('독후감', id, {
      bookId: v.data.bookId, body: v.data.body, recTarget: v.data.recTarget, recReason: v.data.recReason,
      question: v.data.question, updatedAt: nowIso_()
    });
    return { id: id };
  }, true);
}

function apiAddComment(essayId, body) {
  return run_('member', function (u) {
    if (!essayDetail_(u.db, essayId, viewer_(u)) || (!u.isAdmin && isHiddenEssay_(u.db, essayId))) return fail_('댓글을 달 수 없는 글이에요.');
    var v = validateComment_(body);
    if (!v.ok) return v;
    var id = newId_('C');
    appendRow_('댓글', { id: id, essayId: essayId, email: u.email, body: v.data, createdAt: nowIso_(), hidden: false });
    return { id: id };
  }, true);
}

function isHiddenEssay_(db, essayId) {
  return db.essays.some(function (e) { return e.id === essayId && e.hidden; });
}

function apiAddBook(b) {
  return run_('member', function (u) {
    var v = validateNewBook_(b, u.settings);
    if (!v.ok) return v;
    var id = newId_('U');
    appendRow_('도서', { id: id, title: v.data.title, author: v.data.author, kind: '학생추가', careers: v.data.careers, peakId: '', intro: '', source: '' });
    return { id: id };
  }, true);
}

function apiSetHidden(tab, id, hidden) {
  return run_('admin', function () {
    if (tab !== '독후감' && tab !== '댓글') return fail_('숨길 수 없는 항목이에요.');
    if (!updateRowById_(tab, id, { hidden: !!hidden })) return fail_('항목을 찾을 수 없어요.');
    return { id: id, hidden: !!hidden };
  }, true);
}
