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
  const me = { name: '가학생', classNo: 2, number: 3, career: '의약·보건' };
  const card = { id: 'E1', bookId: 'B03', bookTitle: '아픔이 길이 되려면', authorName: '가학생', authorClass: 2, career: '의약·보건',
    recTarget: '의사 꿈꾸는', recReason: st.reason || '병의 사회적 원인', question: '고칠 수 있을까?', createdAt: '2026-11-14T00:00:00Z', commentCount: 0, hidden: false };
  const book = { id: 'B03', title: st.bookTitle || '아픔이 길이 되려면', author: '김승섭', kind: '징검다리', careers: ['의약·보건'], peakId: 'P03', intro: '', source: '',
    readerCount: 1, readersByCareer: { '의약·보건': 1 }, topReason: card, peak: { id: 'P03', title: '침묵의 봄' }, bridges: [] };
  const api = {
    apiBootstrap: () => ({ ok: true, data: st.state === 'outsider' ? { state: 'outsider', isAdmin: false }
      : { state: st.state, isAdmin: st.state === 'admin', careers: ['의약·보건', '교육'], me: st.state === 'student' ? me : null, libraryUrl: st.lib, minBodyChars: 300 } }),
    apiAdminSummary: () => ({ ok: true, data: [] }),
    apiCheckCode: (c) => ({ ok: true, data: { valid: c === 'HN1' } }),
    apiRegister: (p, c) => { if (c !== 'HN1') return { ok: false, error: '입장 코드가 맞지 않아요.' }; st.state = 'student'; return { ok: true, data: { state: 'student' } }; },
    apiCareerView: (c) => ({ ok: true, data: { career: c, friends: [{ name: '가학생', classNo: 2, bookTitles: ['아픔이 길이 되려면'] }], recentEssays: [card] } }),
    apiBookCards: () => ({ ok: true, data: [book] }),
    apiEssayDetail: () => ({ ok: true, data: { essay: { ...card, body: '본문', updatedAt: '', isMine: false }, comments: [] } }),
    apiMyRecords: () => ({ ok: true, data: { essays: [], commentsOnMine: [] } }),
    apiSubmitEssay: () => ({ ok: false, error: st.submitError || '감상은 최소 300자 이상 써 주세요. (지금 299자)' }),
    apiAddComment: () => ({ ok: true, data: { id: 'C1' } }),
    apiSetHidden: () => ({ ok: true, data: {} }),
    apiAddBook: () => ({ ok: true, data: { id: 'U-1' } }),
  };
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

test('outsider sees only the notice', async () => {
  const p = await open({ state: 'outsider' });
  await p.getByText('호남고 1학년 진로 수업용').waitFor();
  assert.equal(await p.locator('nav button[data-tab]').count(), 0);
  assert.deepEqual(p.errors, []);
  await p.close();
});

test('code then profile then career tab', async () => {
  const p = await open({ state: 'needsCode' });
  await p.fill('#code-input', '틀림');
  await p.click('#code-submit');
  await p.getByText('입장 코드가 맞지 않아요').waitFor();
  await p.fill('#code-input', 'HN1');
  await p.click('#code-submit');
  await p.fill('#profile-name', '가학생');
  await p.fill('#profile-class', '2');
  await p.fill('#profile-number', '3');
  await p.selectOption('#profile-career', '의약·보건');
  await p.click('#profile-submit');
  await p.locator('nav button[data-tab="career"].active').waitFor();
  await p.getByText('병의 사회적 원인').first().waitFor();
  const reg = await p.evaluate(() => window.__calls.find(c => c[0] === 'apiRegister'));
  assert.equal(reg[1][1], 'HN1');
  assert.deepEqual(p.errors, []);
  await p.close();
});

test('escapes student html', async () => {
  const p = await open({ state: 'student', reason: XSS, bookTitle: XSS });
  await p.getByText(XSS).first().waitFor();
  await p.click('nav button[data-tab="books"]');
  await p.locator('.book-card').first().waitFor();
  await p.waitForTimeout(100);
  assert.equal(await p.evaluate(() => window.__x), undefined);
  assert.equal(await p.locator('img[src="x"]').count(), 0);
  await p.close();
});

test('write form shows count and server error', async () => {
  const p = await open({ state: 'student' });
  await p.click('nav button[data-tab="write"]');
  await p.fill('#write-body', '가'.repeat(299));
  assert.match(await p.textContent('#write-count'), /299 \/ 최소 300자/);
  await p.fill('#write-target', '의사 꿈꾸는');
  await p.fill('#write-reason', '좋아서');
  await p.click('#write-submit');
  await p.getByText('감상은 최소 300자 이상 써 주세요. (지금 299자)').waitFor();
  await p.close();
});

test('library button opens library url', async () => {
  const p = await open({ state: 'student' });
  await p.click('nav button[data-tab="books"]');
  await p.locator('.lib-btn').first().click();
  await p.waitForTimeout(50);
  assert.deepEqual(await p.evaluate(() => window.__opened), [LIB]);
  await p.close();
});

for (const width of [360, 768]) {
  test(`no horizontal scroll at ${width}px`, async () => {
    const p = await open({ state: 'student' }, { width, height: 800 });
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
  const p = await open({ state: 'student', delay: 200 });
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

test('admin without profile goes straight to the app', async () => {
  const p = await open({ state: 'admin' });
  await p.locator('#admin-btn').waitFor();
  assert.equal(await p.locator('#profile-submit').count(), 0);
  await p.locator('nav button[data-tab="career"]').waitFor();
  await p.close();
});

test('name is read-only when editing profile', async () => {
  const p = await open({ state: 'student' });
  await p.click('nav button[data-tab="mine"]');
  await p.getByText('내 정보·진로 바꾸기').click();
  assert.equal(await p.locator('#profile-name').isDisabled(), true);
  await p.close();
});
