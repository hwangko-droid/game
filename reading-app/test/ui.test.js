'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { chromium } = require('playwright');

const PAGE = 'file://' + path.join(__dirname, '..', 'src', 'index.html');
const LIB = 'https://read365.edunet.net/PureScreen/SchoolSearch?x=1';
const CAREERS = ['의약·보건', '교육'];
const XSS = '<img src=x onerror="window.__x=1">';

// 브라우저 안에서 도는 가짜 google.script.run. scenario는 JSON으로 넘어간다.
function installFake(scenario) {
  const st = JSON.parse(scenario);
  window.__calls = [];
  window.__opened = [];
  window.open = (u) => { window.__opened.push(u); return null; };
  const me = { sid: '2-03', name: '가학생', classNo: 2, number: 3, career: '의약·보건', level: st.fresh ? '' : '보통', questions: st.fresh ? [] : ['Q01'] };
  const QS = [{ id: 'Q01', text: '아픈 건 몸 탓일까, 사회 탓일까?' }, { id: 'Q02', text: '기계도 생각할 수 있을까?' }, { id: 'Q03', text: '공정하다는 건 뭘까?' }, { id: 'Q04', text: '나는 왜 이런 사람일까?' }];
  const card = { id: 'E1', bookId: 'B03', bookTitle: '아픔이 길이 되려면', authorName: '가학생', authorClass: 2, career: '의약·보건',
    recTarget: '의사 꿈꾸는', recReason: st.reason || '병의 사회적 원인', question: '고칠 수 있을까?', createdAt: '2026-11-14T00:00:00Z', commentCount: 0, hidden: false };
  const book = { id: 'B03', title: st.bookTitle || '아픔이 길이 되려면', author: '김승섭', kind: '징검다리', careers: ['의약·보건'], peakId: 'P03', intro: '', source: '',
    readerCount: 1, readersByCareer: { '의약·보건': 1 }, topReason: card, peak: { id: 'P03', title: '침묵의 봄' }, bridges: [], level: '보통', questionTexts: ['아픈 건 몸 탓일까, 사회 탓일까?'] };
  const isTok = (t) => t === 'TOK' || t === 'ADMIN';
  const api = {
    apiBootstrap: (t) => ({ ok: true, data: !isTok(t) ? { state: 'login', isAdmin: false, careers: ['의약·보건', '교육'], questions: QS }
      : { state: t === 'ADMIN' ? 'admin' : 'student', isAdmin: t === 'ADMIN', careers: ['의약·보건', '교육'], questions: QS, me: t === 'ADMIN' ? null : me, libraryUrl: st.lib, minBodyChars: 300 } }),
    apiLogin: (code, p) => code === '관리1234' ? { ok: true, data: { token: 'ADMIN', admin: true } }
      : code !== '2027' ? { ok: false, error: '비밀번호가 맞지 않아요.' } : { ok: true, data: { token: 'TOK' } },
    apiUpdateProfile: (t, p) => { Object.assign(me, p); return { ok: true, data: p }; },
    apiRecommend: () => ({ ok: true, data: [{ ...book, match: { score: 4, questions: ['아픈 건 몸 탓일까, 사회 탓일까?'], career: true, levelFit: true } }] }),
    apiAdminSummary: () => ({ ok: true, data: [] }),
    apiCareerView: (t, c) => ({ ok: true, data: { career: c, friends: [{ name: '가학생', classNo: 2, bookTitles: ['아픔이 길이 되려면'] }], recentEssays: [card] } }),
    apiBookCards: () => ({ ok: true, data: [book] }),
    apiEssayDetail: () => ({ ok: true, data: { essay: { ...card, body: '본문', updatedAt: '', isMine: false }, comments: [] } }),
    apiMyRecords: () => ({ ok: true, data: { essays: [], commentsOnMine: [] } }),
    apiSubmitEssay: () => ({ ok: false, error: st.submitError || '감상은 최소 300자 이상 써 주세요. (지금 299자)' }),
    apiAddComment: () => ({ ok: true, data: { id: 'C1' } }),
    apiAddBook: () => ({ ok: true, data: { id: 'U-1' } }),
    apiSetHidden: () => ({ ok: true, data: {} }),
  };
  if (st.token) { try { localStorage.setItem('readingAppToken', st.token); } catch (e) {} }
  else { try { localStorage.removeItem('readingAppToken'); } catch (e) {} }
  function runner(ok, fail) {
    return new Proxy({}, {
      get(_, name) {
        if (name === 'withSuccessHandler') return (f) => runner(f, fail);
        if (name === 'withFailureHandler') return (f) => runner(ok, f);
        return (...args) => { window.__calls.push([name, args]); setTimeout(() => {
          try { ok && ok(api[name](...args)); } catch (e) { fail && fail(e); } }, st.delay || 5); };
      },
    });
  }
  window.google = { script: { get run() { return runner(null, null); } } };
}

let browser;
test.before(async () => { browser = await chromium.launch(); });
test.after(async () => { await browser.close(); });

async function open(scenario, viewport = { width: 768, height: 1024 }) {
  const page = await browser.newPage({ viewport });
  page.setDefaultTimeout(3000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(installFake, JSON.stringify({ lib: LIB, ...scenario }));
  await page.goto(PAGE);
  page.errors = errors;
  return page;
}

test('no token shows the login screen only', async () => {
  const p = await open({});
  await p.locator('#login-code').waitFor();
  assert.equal(await p.locator('nav button[data-tab]').count(), 0);
  assert.deepEqual(p.errors, []);
  await p.close();
});

test('login with 2027 stores token and enters the app', async () => {
  const p = await open({});
  await p.fill('#login-code', '2026');
  await p.fill('#profile-name', '가학생');
  await p.fill('#profile-class', '2');
  await p.fill('#profile-number', '3');
  await p.selectOption('#profile-career', '의약·보건');
  await p.click('#login-submit');
  await p.getByText('비밀번호가 맞지 않아요').waitFor();
  await p.fill('#login-code', '2027');
  await p.click('#login-submit');
  await p.locator('nav button[data-tab="career"].active').waitFor();
  await p.getByText('병의 사회적 원인').first().waitFor();
  const login = await p.evaluate(() => window.__calls.find(c => c[0] === 'apiLogin'));
  assert.deepEqual(login[1][1], { name: '가학생', classNo: '2', number: '3', career: '의약·보건' });
  assert.equal(await p.evaluate(() => localStorage.getItem('readingAppToken')), 'TOK');
  const cv = await p.evaluate(() => window.__calls.find(c => c[0] === 'apiCareerView'));
  assert.equal(cv[1][0], 'TOK');
  assert.deepEqual(p.errors, []);
  await p.close();
});

test('saved token goes straight in', async () => {
  const p = await open({ token: 'TOK' });
  await p.locator('nav button[data-tab="career"].active').waitFor();
  assert.equal(await p.evaluate(() => window.__calls[0][1][0]), 'TOK');
  await p.close();
});

test('admin password enters admin mode without profile', async () => {
  const p = await open({});
  await p.fill('#login-code', '관리1234');
  await p.click('#login-submit');
  await p.locator('#admin-btn').waitFor();
  await p.close();
});

test('leave this device clears token', async () => {
  const p = await open({ token: 'TOK' });
  await p.click('nav button[data-tab="mine"]');
  await p.getByText('이 기기에서 나가기').click();
  await p.locator('#login-code').waitFor();
  assert.equal(await p.evaluate(() => localStorage.getItem('readingAppToken')), null);
  await p.close();
});

test('escapes student html', async () => {
  const p = await open({ token: 'TOK', reason: XSS, bookTitle: XSS });
  await p.getByText(XSS).first().waitFor();
  await p.click('nav button[data-tab="books"]');
  await p.locator('.book-card').first().waitFor();
  await p.waitForTimeout(100);
  assert.equal(await p.evaluate(() => window.__x), undefined);
  assert.equal(await p.locator('img[src="x"]').count(), 0);
  await p.close();
});

test('write form shows count and server error', async () => {
  const p = await open({ token: 'TOK' });
  await p.click('nav button[data-tab="write"]');
  await p.fill('#write-body', '가'.repeat(299));
  assert.match(await p.textContent('#write-count'), /299 \/ 최소 300자/);
  await p.fill('#write-target', '의사 꿈꾸는');
  await p.fill('#write-reason', '좋아서');
  await p.click('#write-submit');
  await p.getByText('감상은 최소 300자 이상 써 주세요. (지금 299자)').waitFor();
  await p.close();
});

test('library button opens search results for the book', async () => {
  const p = await open({ token: 'TOK' });
  await p.click('nav button[data-tab="books"]');
  await p.locator('.lib-btn').first().click();
  await p.waitForTimeout(50);
  assert.deepEqual(await p.evaluate(() => window.__opened),
    ['https://read365.edunet.net/PureScreen/SchoolSearchResult?x=1&searchKeyword=' + encodeURIComponent('아픔이 길이 되려면')]);
  await p.close();
});

for (const width of [360, 768]) {
  test(`no horizontal scroll at ${width}px`, async () => {
    const p = await open({ token: 'TOK' }, { width, height: 800 });
    await p.getByText('병의 사회적 원인').first().waitFor();
    for (const tab of ['career', 'books', 'write', 'mine']) {
      await p.click(`nav button[data-tab="${tab}"]`);
      await p.waitForTimeout(50);
      const [sw, iw] = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      assert.ok(sw <= iw, `${tab}: ${sw} > ${iw}`);
    }
    await p.close();
  });
}

test('Hangul IME Enter and double click post one comment', async () => {
  const p = await open({ token: 'TOK', delay: 200 });
  await p.locator('.essay-card').first().click();
  await p.fill('#comment-input', '좋은 글이에요');
  await p.dispatchEvent('#comment-input', 'keydown', { key: 'Enter', isComposing: true, keyCode: 229 });
  await p.waitForTimeout(50);
  assert.equal(await p.evaluate(() => window.__calls.filter(c => c[0] === 'apiAddComment').length), 0);
  await p.press('#comment-input', 'Enter');
  await p.locator('#comment-send').click({ force: true }).catch(() => {});
  await p.waitForTimeout(50);
  assert.equal(await p.evaluate(() => window.__calls.filter(c => c[0] === 'apiAddComment').length), 1);
  await p.close();
});

test('first visit asks questions (max 3) and reading level', async () => {
  const p = await open({ token: 'TOK', fresh: true });
  await p.locator('#interests').waitFor();
  const boxes = p.locator('#interests input[name="q"]');
  for (let i = 0; i < 4; i++) await boxes.nth(i).check({ force: true }).catch(() => {});
  assert.equal(await p.locator('#interests input[name="q"]:checked').count(), 3);
  await p.click('#interests-save');
  await p.getByText('독서량을 골라 주세요').waitFor();
  await p.check('#interests input[name="level"][value="가볍게"]');
  await p.click('#interests-save');
  await p.locator('nav button[data-tab="career"].active').waitFor();
  const c = await p.evaluate(() => window.__calls.find(x => x[0] === 'apiUpdateProfile'));
  assert.equal(c[1][0], 'TOK');
  assert.deepEqual(c[1][1], { career: '의약·보건', level: '가볍게', questions: ['Q01', 'Q02', 'Q03'] });
  await p.close();
});

test('student with interests skips the question screen', async () => {
  const p = await open({ token: 'TOK' });
  await p.locator('nav button[data-tab="career"].active').waitFor();
  assert.equal(await p.locator('#interests').count(), 0);
  await p.close();
});

test('book search shows my recommendations with the reason', async () => {
  const p = await open({ token: 'TOK' });
  await p.click('nav button[data-tab="books"]');
  await p.getByText('나에게 맞는 책').waitFor();
  await p.locator('#recommend .book-card').first().waitFor();
  const t = await p.textContent('#recommend');
  assert.match(t, /아픈 건 몸 탓일까, 사회 탓일까\?/);
  assert.match(t, /보통/);
  await p.close();
});

test('내 기록 lets student change career, questions, level', async () => {
  const p = await open({ token: 'TOK' });
  await p.click('nav button[data-tab="mine"]');
  await p.getByText('내 진로·질문·독서량 바꾸기').click();
  await p.locator('#interests').waitFor();
  assert.equal(await p.locator('#interests input[name="q"]:checked').count(), 1);
  await p.selectOption('#interests-career', '교육');
  await p.click('#interests-save');
  await p.waitForTimeout(100);
  const c = await p.evaluate(() => window.__calls.find(x => x[0] === 'apiUpdateProfile'));
  assert.deepEqual(c[1][1], { career: '교육', level: '보통', questions: ['Q01'] });
  await p.close();
});
