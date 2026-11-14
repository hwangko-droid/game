'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, plain } = require('./load');

const profile = (name, classNo = 2, number = 3, career = '의약·보건') => ({ name, classNo, number, career });
const essay = { bookId: 'B03', body: '가'.repeat(300), recTarget: '의사 꿈꾸는', recReason: '병의 사회적 원인', question: '의사가 이걸 고칠 수 있을까?' };

function boot() {
  const app = loadApp();
  app.state.owner = 'hwangko@honam.hs.kr';
  app.as('hwangko@honam.hs.kr');
  app.G.초기설정();
  app.as(''); // 웹앱 방문자는 익명
  const s = app.G.readSettings_();
  const login = (name, classNo, number, career, code = '2027') => plain(app.G.apiLogin(code, profile(name, classNo, number, career)));
  const tok = (name, classNo, number, career) => login(name, classNo, number, career).data.token;
  return { ...app, admin: s.adminPassword, login, tok };
}

test('default entry code is 2027 and admin password exists', () => {
  const { G, admin } = boot();
  assert.equal(String(G.readSettings_().entryCode), '2027');
  assert.match(admin, /^관리\d{4}$/);
});

test('no token: login state and no student data', () => {
  const app = boot();
  app.tok('가학생', 2, 3);
  const b = plain(app.G.apiBootstrap(''));
  assert.equal(b.data.state, 'login');
  assert.ok(!JSON.stringify(b).includes('가학생'));
  assert.equal(app.G.apiCareerView('', '의약·보건').ok, false);
  assert.equal(app.G.apiCareerView('garbage', '의약·보건').ok, false);
});

test('wrong code rejected, right code registers with class-number id', () => {
  const app = boot();
  const bad = app.login('가학생', 2, 3, '의약·보건', '2026');
  assert.equal(bad.ok, false);
  assert.equal(bad.error, '비밀번호가 맞지 않아요.');
  const r = app.login('가학생', 2, 3);
  assert.equal(r.ok, true);
  assert.ok(r.data.token.length >= 16);
  const st = app.G.readAll_().students;
  assert.equal(st.length, 1);
  assert.equal(st[0].sid, '2-03');
  const b = plain(app.G.apiBootstrap(r.data.token)).data;
  assert.equal(b.state, 'student');
  assert.equal(b.me.name, '가학생');
  assert.equal(b.me.token, undefined);
});

test('same class/number/name logs back in with same token', () => {
  const app = boot();
  const t1 = app.tok('가학생', 2, 3);
  const t2 = app.tok(' 가학생 ', 2, 3, '교육');
  assert.equal(t1, t2);
  assert.equal(app.G.readAll_().students.length, 1);
  assert.equal(app.G.readAll_().students[0].career, '의약·보건');
});

test('same class/number with different name is rejected', () => {
  const app = boot();
  app.tok('가학생', 2, 3);
  const r = app.login('나학생', 2, 3);
  assert.equal(r.ok, false);
  assert.match(r.error, /이미 다른 이름으로 등록된 번호/);
});

test('admin password logs in as admin without profile', () => {
  const app = boot();
  const r = plain(app.G.apiLogin(app.admin, {}));
  assert.equal(r.ok, true);
  assert.equal(plain(app.G.apiBootstrap(r.data.token)).data.state, 'admin');
  assert.equal(app.G.readAll_().students.length, 0);
});

test('essay visible to friend; tokens never leak', () => {
  const app = boot();
  const a = app.tok('가학생', 2, 3), b = app.tok('나학생', 1, 9);
  const s = plain(app.G.apiSubmitEssay(a, essay));
  assert.equal(s.ok, true);
  const v = plain(app.G.apiCareerView(b, '의약·보건'));
  assert.equal(v.data.recentEssays[0].authorName, '가학생');
  assert.equal(v.data.friends.length, 2);
  const d = plain(app.G.apiEssayDetail(b, s.data.id));
  assert.equal(d.data.essay.isMine, false);
  const all = JSON.stringify([v, d, plain(app.G.apiBookCards(b, {})), plain(app.G.apiMyRecords(b)), plain(app.G.apiAdminSummary(app.admin))]);
  assert.ok(!all.includes(a), 'token leaked');
  assert.equal(plain(app.G.apiEssayDetail(a, s.data.id)).data.essay.isMine, true);
});

test('validation errors surface', () => {
  const app = boot();
  const a = app.tok('가학생', 2, 3);
  assert.equal(plain(app.G.apiSubmitEssay(a, { ...essay, body: '짧음' })).error, '감상은 최소 300자 이상 써 주세요. (지금 2자)');
});

test("update other's essay rejected", () => {
  const app = boot();
  const a = app.tok('가학생', 2, 3), b = app.tok('나학생', 1, 9);
  const id = plain(app.G.apiSubmitEssay(a, essay)).data.id;
  assert.deepEqual(plain(app.G.apiUpdateEssay(b, id, { ...essay, body: '나'.repeat(300) })), { ok: false, error: '내가 쓴 글만 고칠 수 있어요.' });
  assert.equal(app.G.readAll_().essays[0].body, essay.body);
  assert.equal(app.G.apiUpdateEssay(a, id, { ...essay, body: '다'.repeat(300) }).ok, true);
  assert.ok(app.G.readAll_().essays[0].updatedAt);
});

test('hide is admin-only and hides from students', () => {
  const app = boot();
  const a = app.tok('가학생', 2, 3), b = app.tok('나학생', 1, 9);
  const id = plain(app.G.apiSubmitEssay(a, essay)).data.id;
  assert.equal(app.G.apiAddComment(b, id, '좋은 글').ok, true);
  assert.equal(app.G.apiSetHidden(b, '독후감', id, true).ok, false);
  assert.equal(app.G.apiSetHidden(app.admin, '독후감', id, true).ok, true);
  assert.ok(plain(app.G.apiEssayDetail(app.admin, id)).data);
  const d = plain(app.G.apiEssayDetail(b, id));
  assert.equal(d.ok, true);
  assert.equal(d.data, null);
  assert.equal(app.G.apiAddComment(b, id, '또').ok, false);
  assert.equal(app.G.apiSetHidden(app.admin, '학생', '2-03', true).ok, false);
});

test('admin summary admin-only', () => {
  const app = boot();
  const a = app.tok('가학생', 2, 3);
  assert.equal(app.G.apiAdminSummary(a).ok, false);
  assert.equal(plain(app.G.apiAdminSummary(app.admin)).data[0].students[0].name, '가학생');
});

test('student adds book and writes about it', () => {
  const app = boot();
  const a = app.tok('가학생', 2, 3);
  const r = plain(app.G.apiAddBook(a, { title: '새 책', author: '저자', careers: ['교육'] }));
  assert.match(r.data.id, /^U-/);
  assert.equal(app.G.readAll_().books.find(x => x.id === r.data.id).kind, '학생추가');
  assert.equal(app.G.apiSubmitEssay(a, { ...essay, bookId: r.data.id }).ok, true);
});

test('career can change, name/class/number cannot', () => {
  const app = boot();
  const a = app.tok('가학생', 2, 3);
  assert.equal(app.G.apiUpdateCareer(a, '교육').ok, true);
  assert.equal(app.G.readAll_().students[0].career, '교육');
  assert.equal(app.G.apiUpdateCareer(a, '우주').ok, false);
});

test('writes take the lock and do not read sheets while holding it', () => {
  const app = boot();
  const a = app.tok('가학생', 2, 3);
  const before = app.state.lockCalls;
  app.state.readsUnderLock = 0;
  const id = plain(app.G.apiSubmitEssay(a, essay)).data.id;
  app.G.apiAddComment(a, id, '안녕');
  assert.equal(app.state.lockCalls - before, 2);
  assert.equal(app.state.readsUnderLock, 0);
});

test('student text is stored literally, never as formula or number', () => {
  const app = boot();
  const a = app.tok('=학생!A3', 2, 3);
  const id = plain(app.G.apiSubmitEssay(a, { ...essay, question: '007', recReason: '+82 -1' })).data.id;
  app.G.apiAddComment(a, id, "='독후감'!D7");
  const db = app.G.readAll_();
  assert.equal(db.students[0].name, '=학생!A3');
  assert.equal(db.essays[0].question, '007');
  assert.equal(db.essays[0].recReason, '+82 -1');
  assert.equal(db.comments[0].body, "='독후감'!D7");
});

test('anonymous visitor cannot run 초기설정', () => {
  const app = boot();
  app.as('');
  assert.throws(() => app.G.초기설정());
});

test('doGet returns titled page with viewport', () => {
  const { G } = boot();
  const out = G.doGet();
  assert.equal(out.name, 'index');
  assert.equal(out.title, '우리 진로 책장');
});
