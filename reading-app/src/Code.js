/* Code.js — 웹앱 진입점과 화면이 부르는 서버 함수(api*)
 * 웹앱은 "실행: 나(선생님) / 액세스: 모든 사용자"로 배포한다. 학생은 구글 로그인 없이
 * 비밀번호(설정.입장코드)와 반·번호·이름으로 들어오고, 발급받은 접속키(token)를 모든 요청에 보낸다.
 */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('우리 진로 책장')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// 선생님이 앱스 스크립트 편집기에서 한 번 실행: 시트 탭·기본값(입장코드 2027, 관리자비밀번호)을 만든다
function 초기설정() {
  var owner = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  var active = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!active || active !== owner) throw new Error('초기설정은 시트 주인만 실행할 수 있어요.');
  setupSpreadsheet_();
}

function currentUser_(token) {
  var t = String(token == null ? '' : token).trim();
  var settings = readSettings_();
  var db = readAll_();
  var student = null;
  if (t) db.students.forEach(function (s) { if (s.token && s.token === t) student = s; });
  var state = accessState_(t, student, settings);
  return {
    sid: student ? student.sid : '', state: state, student: student, settings: settings,
    isAdmin: state === 'admin', db: db
  };
}

var ERR_ENTRY_ = '먼저 입장해 주세요.';
var ERR_ADMIN_ = '선생님만 할 수 있어요.';

// role: 'any' | 'member' (학생·관리자) | 'admin'
function run_(token, role, fn, write) {
  var lock = null;
  try {
    // 읽기·권한 확인은 잠금 밖에서 한다. 잠금은 실제로 시트에 쓰는 동안만 잡는다.
    var u = currentUser_(token);
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

function viewer_(u) { return { sid: u.sid, isAdmin: u.isAdmin }; }
function nowIso_() { return new Date().toISOString(); }
function bookIdSet_(db) {
  var s = new Set();
  db.books.forEach(function (b) { s.add(b.id); });
  return s;
}
// 접속키를 뺀 학생 정보
function publicStudent_(s) {
  return s ? { sid: s.sid, name: s.name, classNo: s.classNo, number: s.number, career: s.career } : null;
}

function apiBootstrap(token) {
  return run_(token, 'any', function (u) {
    var out = { state: u.state, isAdmin: u.isAdmin, careers: u.settings.careers };
    if (u.state === 'student' || u.state === 'admin') {
      out.me = publicStudent_(u.student);
      out.libraryUrl = u.settings.libraryUrl;
      out.minBodyChars = u.settings.minBodyChars;
    }
    return out;
  });
}

// 비밀번호 + 반·번호·이름(+진로)으로 입장. 관리자 비밀번호면 관리자로.
function apiLogin(code, profile) {
  return run_('', 'any', function (u) {
    var pw = String(u.settings.adminPassword || '').trim();
    if (pw && String(code == null ? '' : code).trim() === pw) return { token: pw, admin: true };
    if (!checkEntryCode_(code, u.settings)) return fail_('비밀번호가 맞지 않아요.');
    var v = validateProfile_(profile, u.settings);
    if (!v.ok) return v;
    var sid = studentId_(v.data.classNo, v.data.number);
    // 잠금 안에서 다시 읽어 같은 번호가 두 줄로 등록되지 않게 한다
    var existing = readAll_().students.filter(function (s) { return s.sid === sid; })[0];
    if (existing) {
      if (String(existing.name).trim() !== v.data.name) {
        return fail_('이미 다른 이름으로 등록된 번호예요. 반·번호를 확인하고, 맞다면 선생님께 말씀해 주세요.');
      }
      return { token: existing.token };
    }
    var token = Utilities.getUuid();
    appendRow_('학생', {
      sid: sid, name: v.data.name, classNo: v.data.classNo, number: v.data.number,
      career: v.data.career, joinedAt: nowIso_(), token: token
    });
    return { token: token };
  }, true);
}

function apiUpdateCareer(token, career) {
  return run_(token, 'member', function (u) {
    if (!u.student) return fail_('학생만 진로를 바꿀 수 있어요.');
    if ((u.settings.careers || []).indexOf(career) < 0) return fail_('진로 분야를 목록에서 골라 주세요.');
    updateRowById_('학생', u.sid, { career: career });
    return { career: career };
  }, true);
}

function apiCareerView(token, career) {
  return run_(token, 'member', function (u) { return careerView_(u.db, career, viewer_(u)); });
}

function apiBookCards(token, filter) {
  return run_(token, 'member', function (u) { return bookCards_(u.db, filter || {}, viewer_(u)); });
}

function apiEssayDetail(token, id) {
  return run_(token, 'member', function (u) {
    var d = essayDetail_(u.db, id, viewer_(u));
    if (!d) return null;
    d.essay.isMine = !!u.sid && d.essay.authorSid === u.sid;
    delete d.essay.authorSid;
    return d;
  });
}

function apiMyRecords(token) {
  return run_(token, 'member', function (u) { return myRecords_(u.db, u.sid); });
}

function apiAdminSummary(token) {
  return run_(token, 'admin', function (u) { return adminSummary_(u.db); });
}

function apiSubmitEssay(token, e) {
  return run_(token, 'member', function (u) {
    if (!u.student) return fail_('학생으로 입장해야 독후감을 쓸 수 있어요.');
    var v = validateEssay_(e, u.settings, bookIdSet_(u.db));
    if (!v.ok) return v;
    var id = newId_('E');
    appendRow_('독후감', {
      id: id, sid: u.sid, bookId: v.data.bookId, body: v.data.body, recTarget: v.data.recTarget,
      recReason: v.data.recReason, question: v.data.question, createdAt: nowIso_(), updatedAt: '', hidden: false
    });
    return { id: id };
  }, true);
}

function apiUpdateEssay(token, id, e) {
  return run_(token, 'member', function (u) {
    var cur = u.db.essays.filter(function (x) { return x.id === id; })[0];
    if (!cur) return fail_('글을 찾을 수 없어요.');
    if (!u.sid || cur.sid !== u.sid) return fail_('내가 쓴 글만 고칠 수 있어요.');
    var v = validateEssay_(e, u.settings, bookIdSet_(u.db));
    if (!v.ok) return v;
    updateRowById_('독후감', id, {
      bookId: v.data.bookId, body: v.data.body, recTarget: v.data.recTarget, recReason: v.data.recReason,
      question: v.data.question, updatedAt: nowIso_()
    });
    return { id: id };
  }, true);
}

function apiAddComment(token, essayId, body) {
  return run_(token, 'member', function (u) {
    if (!u.student) return fail_('학생으로 입장해야 댓글을 달 수 있어요.');
    if (!essayDetail_(u.db, essayId, viewer_(u))) return fail_('댓글을 달 수 없는 글이에요.');
    var v = validateComment_(body);
    if (!v.ok) return v;
    var id = newId_('C');
    appendRow_('댓글', { id: id, essayId: essayId, sid: u.sid, body: v.data, createdAt: nowIso_(), hidden: false });
    return { id: id };
  }, true);
}

function apiAddBook(token, b) {
  return run_(token, 'member', function (u) {
    var v = validateNewBook_(b, u.settings);
    if (!v.ok) return v;
    var id = newId_('U');
    appendRow_('도서', { id: id, title: v.data.title, author: v.data.author, kind: '학생추가', careers: v.data.careers, peakId: '', intro: '', source: '' });
    return { id: id };
  }, true);
}

function apiSetHidden(token, tab, id, hidden) {
  return run_(token, 'admin', function () {
    if (tab !== '독후감' && tab !== '댓글') return fail_('숨길 수 없는 항목이에요.');
    if (!updateRowById_(tab, id, { hidden: !!hidden })) return fail_('항목을 찾을 수 없어요.');
    return { id: id, hidden: !!hidden };
  }, true);
}
