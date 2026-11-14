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
