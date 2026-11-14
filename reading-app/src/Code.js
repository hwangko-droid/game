/* Code.js — 웹앱 진입점과 화면이 부르는 서버 함수(api*) */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('우리 진로 책장')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// 선생님이 앱스 스크립트 편집기에서 한 번 실행: 시트 탭·기본값을 만들고 실행자를 관리자로 등록
function 초기설정() {
  setupSpreadsheet(Session.getEffectiveUser().getEmail());
}

function currentUser_() {
  var email = normEmail_(Session.getActiveUser().getEmail());
  var settings = readSettings();
  var db = readAll();
  var student = null;
  db.students.forEach(function (s) { if (normEmail_(s.email) === email) student = s; });
  var state = accessState(email, student, settings);
  return { email: email, state: state, student: student, settings: settings, isAdmin: state === 'admin', db: db };
}

var ERR_ENTRY_ = '먼저 입장 절차를 마쳐 주세요.';
var ERR_ADMIN_ = '선생님만 할 수 있어요.';

// role: 'any' | 'member' (학생·관리자) | 'admin'
function run_(role, fn, write) {
  var lock = null;
  try {
    if (write) { lock = LockService.getScriptLock(); lock.waitLock(10000); }
    var u = currentUser_();
    if (role === 'member' && u.state !== 'student' && u.state !== 'admin') return fail_(ERR_ENTRY_);
    if (role === 'admin' && !u.isAdmin) return fail_(ERR_ADMIN_);
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

function apiCheckCode(code) {
  return run_('any', function (u) {
    if (u.state === 'outsider') return fail_(ERR_ENTRY_);
    return { valid: checkEntryCode(code, u.settings) };
  });
}

function apiRegister(profile, code) {
  return run_('any', function (u) {
    if (u.state === 'outsider') return fail_(ERR_ENTRY_);
    var existing = u.student;
    if (!existing && u.state !== 'admin' && !checkEntryCode(code, u.settings)) return fail_('입장 코드가 맞지 않아요.');
    var v = validateProfile(profile, u.settings);
    if (!v.ok) return v;
    if (existing) {
      updateRowById('학생', u.email, v.data);
    } else {
      appendRow('학생', { email: u.email, name: v.data.name, classNo: v.data.classNo, number: v.data.number, career: v.data.career, joinedAt: nowIso_() });
    }
    return { state: u.isAdmin ? 'admin' : 'student' };
  }, true);
}

function apiCareerView(career) {
  return run_('member', function (u) { return careerView(u.db, career, viewer_(u)); });
}

function apiBookCards(filter) {
  return run_('member', function (u) { return bookCards(u.db, filter || {}, viewer_(u)); });
}

function apiEssayDetail(id) {
  return run_('member', function (u) {
    var d = essayDetail(u.db, id, viewer_(u));
    if (!d) return null;
    d.essay.isMine = normEmail_(d.essay.authorEmail) === u.email;
    delete d.essay.authorEmail;
    return d;
  });
}

function apiMyRecords() {
  return run_('member', function (u) { return myRecords(u.db, u.email); });
}

function apiAdminSummary() {
  return run_('admin', function (u) { return adminSummary(u.db); });
}

function apiSubmitEssay(e) {
  return run_('member', function (u) {
    var v = validateEssay(e, u.settings, bookIdSet_(u.db));
    if (!v.ok) return v;
    var now = nowIso_();
    var id = newId('E');
    appendRow('독후감', {
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
    var v = validateEssay(e, u.settings, bookIdSet_(u.db));
    if (!v.ok) return v;
    updateRowById('독후감', id, {
      bookId: v.data.bookId, body: v.data.body, recTarget: v.data.recTarget, recReason: v.data.recReason,
      question: v.data.question, updatedAt: nowIso_()
    });
    return { id: id };
  }, true);
}

function apiAddComment(essayId, body) {
  return run_('member', function (u) {
    if (!essayDetail(u.db, essayId, viewer_(u)) || (!u.isAdmin && isHiddenEssay_(u.db, essayId))) return fail_('댓글을 달 수 없는 글이에요.');
    var v = validateComment(body);
    if (!v.ok) return v;
    var id = newId('C');
    appendRow('댓글', { id: id, essayId: essayId, email: u.email, body: v.data, createdAt: nowIso_(), hidden: false });
    return { id: id };
  }, true);
}

function isHiddenEssay_(db, essayId) {
  return db.essays.some(function (e) { return e.id === essayId && e.hidden; });
}

function apiAddBook(b) {
  return run_('member', function (u) {
    var v = validateNewBook(b, u.settings);
    if (!v.ok) return v;
    var id = newId('U');
    appendRow('도서', { id: id, title: v.data.title, author: v.data.author, kind: '학생추가', careers: v.data.careers, peakId: '', intro: '', source: '' });
    return { id: id };
  }, true);
}

function apiSetHidden(tab, id, hidden) {
  return run_('admin', function () {
    if (tab !== '독후감' && tab !== '댓글') return fail_('숨길 수 없는 항목이에요.');
    if (!updateRowById(tab, id, { hidden: !!hidden })) return fail_('항목을 찾을 수 없어요.');
    return { id: id, hidden: !!hidden };
  }, true);
}
