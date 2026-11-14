'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, plain } = require('./load');

const T = 't@ai.jbedu.kr', A = 'a@ai.jbedu.kr', B = 'b@ai.jbedu.kr';
const profile = (name, career = '의약·보건') => ({ name, classNo: 2, number: 3, career });
const essay = { bookId: 'B03', body: '가'.repeat(300), recTarget: '의사 꿈꾸는', recReason: '병의 사회적 원인', question: '의사가 이걸 고칠 수 있을까?' };

function boot() {
  const app = loadApp();
  app.as(T); app.G.초기설정();
  const code = app.G.readSettings_().entryCode;
  const reg = (email, name, career) => { app.as(email); return plain(app.G.apiRegister(profile(name, career), code)); };
  return { ...app, code, reg };
}

test('초기설정 makes runner the admin', () => {
  const { G } = boot();
  assert.deepEqual(plain(G.readSettings_().adminEmails), [T]);
});

test('outsider gets nothing', () => {
  const app = boot();
  app.reg(A, '가학생');
  app.as('x@gmail.com');
  const b = plain(app.G.apiBootstrap());
  assert.equal(b.data.state, 'outsider');
  assert.ok(!JSON.stringify(b).includes('가학생'));
  assert.equal(app.G.apiCareerView('의약·보건').ok, false);
  assert.equal(app.G.apiBookCards({}).ok, false);
  app.as('');
  assert.equal(plain(app.G.apiBootstrap()).data.state, 'outsider');
});

test('entry code flow', () => {
  const app = boot();
  app.as(A);
  assert.equal(plain(app.G.apiBootstrap()).data.state, 'needsCode');
  assert.equal(plain(app.G.apiCheckCode('틀림')).data.valid, false);
  assert.equal(plain(app.G.apiCheckCode(' ' + app.code.toLowerCase() + ' ')).data.valid, true);
  assert.equal(app.G.apiRegister(profile('가학생'), '틀림').ok, false);
  assert.equal(app.G.readAll_().students.length, 0);
  assert.equal(app.G.apiCareerView('의약·보건').ok, false);
  assert.equal(app.G.apiRegister(profile('가학생'), app.code).ok, true);
  assert.equal(plain(app.G.apiBootstrap()).data.state, 'student');
  assert.equal(plain(app.G.apiBootstrap()).data.me.name, '가학생');
});

test('registered student can change career without code', () => {
  const app = boot();
  app.reg(A, '가학생');
  const r = plain(app.G.apiRegister({ ...profile('가학생'), career: '교육' }));
  assert.equal(r.ok, true);
  assert.equal(app.G.readAll_().students.length, 1);
  assert.equal(app.G.readAll_().students[0].career, '교육');
});

test('essay visible to same-career friend', () => {
  const app = boot();
  app.reg(A, '가학생'); app.reg(B, '나학생');
  app.as(A);
  const s = plain(app.G.apiSubmitEssay(essay));
  assert.equal(s.ok, true);
  app.as(B);
  const v = plain(app.G.apiCareerView('의약·보건')).data;
  assert.equal(v.recentEssays[0].recReason, '병의 사회적 원인');
  assert.equal(v.recentEssays[0].authorName, '가학생');
  const d = plain(app.G.apiEssayDetail(s.data.id)).data;
  assert.equal(d.essay.isMine, false);
  assert.equal(d.essay.authorEmail, undefined);
});

test('validation errors surface', () => {
  const app = boot();
  app.reg(A, '가학생');
  assert.equal(plain(app.G.apiSubmitEssay({ ...essay, body: '짧음' })).error, '감상은 최소 300자 이상 써 주세요. (지금 2자)');
});

test("update other's essay rejected", () => {
  const app = boot();
  app.reg(A, '가학생'); app.reg(B, '나학생');
  app.as(A);
  const id = plain(app.G.apiSubmitEssay(essay)).data.id;
  app.as(B);
  assert.deepEqual(plain(app.G.apiUpdateEssay(id, { ...essay, body: '나'.repeat(300) })), { ok: false, error: '내가 쓴 글만 고칠 수 있어요.' });
  assert.equal(app.G.readAll_().essays[0].body, essay.body);
  app.as(A);
  assert.equal(app.G.apiUpdateEssay(id, { ...essay, body: '다'.repeat(300) }).ok, true);
  const e = app.G.readAll_().essays[0];
  assert.equal(e.body, '다'.repeat(300));
  assert.ok(e.updatedAt);
  assert.equal(plain(app.G.apiEssayDetail(id)).data.essay.isMine, true);
});

test('hide is admin-only and hides from students', () => {
  const app = boot();
  app.reg(A, '가학생'); app.reg(B, '나학생');
  app.as(A);
  const id = plain(app.G.apiSubmitEssay(essay)).data.id;
  app.as(B);
  assert.equal(app.G.apiAddComment(id, '좋은 글').ok, true);
  assert.equal(app.G.apiSetHidden('독후감', id, true).ok, false);
  app.as(T);
  assert.equal(app.G.apiSetHidden('독후감', id, true).ok, true);
  assert.ok(plain(app.G.apiEssayDetail(id)).data);
  app.as(B);
  const d = plain(app.G.apiEssayDetail(id));
  assert.equal(d.ok, true);
  assert.equal(d.data, null);
  assert.equal(app.G.apiAddComment(id, '또').ok, false);
  app.as(T);
  assert.equal(app.G.apiSetHidden('학생', A, true).ok, false);
});

test('admin summary admin-only', () => {
  const app = boot();
  app.reg(A, '가학생');
  assert.equal(app.G.apiAdminSummary().ok, false);
  app.as(T);
  assert.equal(plain(app.G.apiAdminSummary()).data[0].students[0].name, '가학생');
});

test('student adds book', () => {
  const app = boot();
  app.reg(A, '가학생');
  const r = plain(app.G.apiAddBook({ title: '새 책', author: '저자', careers: ['교육'] }));
  assert.equal(r.ok, true);
  assert.match(r.data.id, /^U-/);
  const b = app.G.readAll_().books.find(x => x.id === r.data.id);
  assert.equal(b.kind, '학생추가');
  assert.equal(app.G.apiSubmitEssay({ ...essay, bookId: r.data.id }).ok, true);
});

test('write apis take the script lock', () => {
  const app = boot();
  app.reg(A, '가학생');
  const before = app.state.lockCalls;
  app.as(A);
  const id = plain(app.G.apiSubmitEssay(essay)).data.id;
  app.G.apiAddComment(id, 'x');
  app.G.apiUpdateEssay(id, essay);
  app.G.apiAddBook({ title: 'q', author: 'w', careers: ['교육'] });
  assert.equal(app.state.lockCalls - before, 4);
});

test('myRecords and bookCards for student', () => {
  const app = boot();
  app.reg(A, '가학생');
  app.G.apiSubmitEssay(essay);
  assert.equal(plain(app.G.apiMyRecords()).data.essays.length, 1);
  const cards = plain(app.G.apiBookCards({ career: '의약·보건' })).data;
  assert.equal(cards[0].id, 'B03');
  assert.equal(cards[0].readerCount, 1);
});

test('doGet returns titled page with viewport', () => {
  const { G } = boot();
  const out = G.doGet();
  assert.equal(out.name, 'index');
  assert.equal(out.title, '우리 진로 책장');
  assert.match(out.metas.viewport, /width=device-width/);
});

test('student text is stored literally, never as formula or number', () => {
  const app = boot();
  app.reg(A, '=학생!A3');
  app.as(A);
  const id = plain(app.G.apiSubmitEssay({ ...essay, question: '007', recReason: '+82 -1' })).data.id;
  app.G.apiAddComment(id, "='독후감'!D7");
  const db = app.G.readAll_();
  assert.equal(db.students[0].name, '=학생!A3');
  assert.equal(db.essays[0].question, '007');
  assert.equal(db.essays[0].recReason, '+82 -1');
  assert.equal(db.comments[0].body, "='독후감'!D7");
  app.G.apiUpdateEssay(id, { ...essay, body: '=' + '가'.repeat(300) });
  assert.equal(app.G.readAll_().essays[0].body, '=' + '가'.repeat(300));
});

test('entry code locks out after 5 wrong tries', () => {
  const app = boot();
  app.as(A);
  for (let i = 0; i < 5; i++) assert.equal(plain(app.G.apiCheckCode('틀림' + i)).data.valid, false);
  const r = plain(app.G.apiCheckCode(app.code));
  assert.equal(r.ok, false);
  assert.match(r.error, /여러 번 틀렸어요/);
  assert.equal(app.G.apiRegister(profile('가학생'), app.code).ok, false);
  app.as(B); // 다른 학생은 영향 없음
  assert.equal(plain(app.G.apiCheckCode(app.code)).data.valid, true);
});

test('wrong codes in apiRegister also count', () => {
  const app = boot();
  app.as(A);
  for (let i = 0; i < 5; i++) app.G.apiRegister(profile('가학생'), 'x' + i);
  assert.equal(app.G.apiRegister(profile('가학생'), app.code).ok, false);
});

test('visitor cannot run 초기설정 as the owner', () => {
  const app = boot();
  app.state.owner = T;
  app.as(A);
  assert.throws(() => app.G.초기설정());
});

test('submit and comment do not read sheets while holding the lock', () => {
  const app = boot();
  app.reg(A, '가학생');
  app.as(A);
  app.state.readsUnderLock = 0;
  const id = plain(app.G.apiSubmitEssay(essay)).data.id;
  app.G.apiAddComment(id, '안녕');
  assert.equal(app.state.readsUnderLock, 0);
});

test('registration is not duplicated', () => {
  const app = boot();
  app.reg(A, '가학생');
  app.as(A);
  // 화면이 오래된 상태에서 같은 학생이 다시 등록 요청을 보내도 한 줄만 유지
  app.G.apiRegister(profile('가학생'), app.code);
  assert.equal(app.G.readAll_().students.length, 1);
});

test('name cannot be changed after registration', () => {
  const app = boot();
  app.reg(A, '가학생');
  app.as(A);
  assert.equal(app.G.apiRegister({ ...profile('나학생'), career: '교육' }).ok, true);
  const s = app.G.readAll_().students[0];
  assert.equal(s.name, '가학생');
  assert.equal(s.career, '교육');
});

test('admin without a profile is not forced to register', () => {
  const app = boot();
  app.as(T);
  const b = plain(app.G.apiBootstrap()).data;
  assert.equal(b.state, 'admin');
  assert.equal(b.me, null);
  assert.equal(b.libraryUrl.startsWith('https://'), true);
});
