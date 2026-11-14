# 고1 진로 독서 앱 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 호남고 1학년 진로 시간용 독서 앱(책 찾기 · 독후감 실명 공유 · 같은 진로 친구 지도 · 댓글)을 구글 앱스 스크립트 웹앱으로 만든다.

**Architecture:** 순수 로직(`Logic.js`), 시트 입출력(`Store.js`), 서버 API(`Code.js`), 초기 데이터(`Seed.js`), 화면(`index.html`)으로 나눈다. `.js` 파일은 앱스 스크립트 전역 함수 문법(모듈 없음)으로 쓰고, Node 테스트는 `vm` 컨텍스트에 파일을 순서대로 로드해 검증한다. `tools/bundle.js`가 서버 파일들을 `dist/Code.gs` 하나로 합쳐 선생님은 파일 2개만 붙여 넣는다.

**Tech Stack:** Google Apps Script (V8), Google Sheets, HTML/CSS/vanilla JS, Node 18+ `node:test`, Playwright(사전 설치된 Chromium).

**Spec:** `docs/superpowers/specs/2026-11-14-reading-app-design.md`

## Global Constraints

- 모든 코드는 `reading-app/` 아래. 기존 `index-3.html`은 건드리지 않는다.
- 서버 `.js` 파일: `import`/`export`/`require` 금지(앱스 스크립트 호환). 최상위 `function` 선언과 `const` 객체만.
- 사용자 식별은 `Session.getActiveUser().getEmail()`만 사용. 빈 문자열이거나 `@ai.jbedu.kr`로 끝나지 않으면 거부.
- 학생 실명·글은 등록된 사용자에게만 내려보낸다. 미등록 사용자 응답에는 학생 데이터가 한 글자도 없어야 한다.
- 입장 코드 기본값: `입장코드사용 = TRUE`. 코드 비교는 앞뒤 공백 제거·대소문자 무시.
- 감상 최소 글자 수 기본 300 (`설정.감상최소글자`).
- 진로분야 기본 목록(순서 고정): 의약·보건, 공학·IT, 자연과학, 교육, 법·행정·정치, 경영·경제, 인문·언어, 사회·심리, 미디어·예술, 아직 모르겠음.
- 도서관 링크: `https://read365.edunet.net/PureScreen/SchoolSearch?schoolName=%ED%98%B8%EB%82%A8%EA%B3%A0%EB%93%B1%ED%95%99%EA%B5%90&provCode=P10&neisCode=P100000464`
- 학생은 자기 독후감 수정만 가능, 삭제·숨김은 관리자만. 좋아요·순위 없음.
- 화면 문구는 한국어, 태블릿 세로(768px)·휴대폰(360px) 모두 가로 스크롤 없음.
- 쓰기 API는 모두 `LockService.getScriptLock().waitLock(10000)` 안에서 실행.

## Review Focus

1. **학생 글 속 HTML/스크립트** (`<img onerror=…>`가 든 감상·댓글·책 제목) → 화면에는 글자 그대로 보이고 실행되지 않아야 한다. → Task 7 `escapes student html` 테스트.
2. **다른 사람 글 수정 시도** (API에 남의 독후감ID를 보냄) → 거부. → Task 6 `update other's essay rejected`.
3. **숨김 처리된 글·댓글** → 학생 화면의 목록·지도·책 카드·상세 어디에도 안 나오고, 관리자에게는 보인다. → Task 4 `hidden excluded everywhere`.
4. **입장 코드 공백·대소문자, 코드 사용 꺼짐, 도메인 밖 계정** → 규칙대로 허용/거부. → Task 2 테스트들.
5. **아주 긴 입력·빈칸만 있는 입력** (감상 5만 자, 댓글 공백만) → 길이 상한(감상 5000자, 한 줄 항목 200자, 댓글 500자) 초과·공백만은 거부, 메시지 표시. → Task 3 테스트.

---

## File Structure

```
reading-app/
  package.json            # "test": "node --test test/"
  src/Logic.js            # 순수 함수: 검증, 접근 판정, 화면용 데이터 조립
  src/Seed.js             # SEED_CAREERS, SEED_BOOKS, SEED_SETTINGS
  src/Store.js            # 시트 읽기/쓰기, setupSpreadsheet()
  src/Code.js             # doGet, api* 함수 (google.script.run 대상)
  src/index.html          # 단일 화면 (CSS/JS 인라인)
  test/load.js            # vm 로더 + 가짜 SpreadsheetApp/Session/LockService
  test/logic.*.test.js
  test/store.test.js
  test/api.test.js
  test/ui.test.js         # Playwright, 가짜 google.script.run
  tools/bundle.js         # src/*.js → dist/Code.gs, src/index.html → dist/index.html
  DEPLOY.md               # 선생님용 배포 안내(한국어)
```

## 공통 데이터 형태 (모든 태스크가 사용)

```js
// Student  {email, name, classNo:number, number:number, career:string, joinedAt:string(ISO)}
// Book     {id, title, author, kind:'봉우리'|'징검다리'|'학생추가', careers:string[], peakId:string, intro, source}
// Essay    {id, email, bookId, body, recTarget, recReason, question, createdAt, updatedAt, hidden:boolean}
// Comment  {id, essayId, email, body, createdAt, hidden:boolean}
// Settings {careers:string[], entryCodeOn:boolean, entryCode:string, minBodyChars:number,
//           adminEmails:string[], libraryUrl:string, schoolYear:string}
// Result   {ok:true, data} | {ok:false, error:string(한국어 메시지)}
```

시트 탭·헤더(1행, 이 순서):
- `학생`: 이메일, 이름, 반, 번호, 진로분야, 최초접속일
- `도서`: 도서ID, 제목, 저자, 구분, 진로분야, 연결봉우리ID, 한줄소개, 출처   (진로분야는 쉼표 구분)
- `독후감`: 독후감ID, 이메일, 도서ID, 감상, 추천대상, 추천이유, 질문, 작성일, 수정일, 숨김
- `댓글`: 댓글ID, 독후감ID, 이메일, 내용, 작성일, 숨김
- `설정`: 키, 값 (키: 진로분야목록(쉼표), 입장코드사용, 입장코드, 감상최소글자, 관리자이메일(쉼표), 도서관링크, 학년도)

---

### Task 1: 프로젝트 골격 + 테스트 로더 + 행 변환

**Files:**
- Create: `reading-app/package.json`, `reading-app/test/load.js`, `reading-app/src/Logic.js`, `reading-app/test/logic.rows.test.js`

**Interfaces:**
- Produces:
  - `test/load.js`: `loadGs(files: string[], globals?: object) => vm.Context` — `src/`의 파일을 순서대로 한 컨텍스트에서 실행하고 컨텍스트 반환.
  - `Logic.js`: `HEADERS` (탭명 → 헤더 배열, 위 순서 그대로), `rowToObject(tab:string, row:any[]) => object`, `objectToRow(tab:string, obj:object) => any[]`, `newId(prefix:string) => string` (`prefix + '-' + Date.now().toString(36) + 4자리 랜덤`), `isSchoolEmail(email:string) => boolean`.
  - 변환 규칙: `숨김` ↔ boolean(`TRUE`/`true`/true → true), `반`/`번호` ↔ number, `진로분야`(도서) ↔ string[] (쉼표 분리·trim·빈값 제거).

- [ ] **Step 1: 실패하는 테스트 작성** — `logic.rows.test.js`
  - `rowToObject('독후감', ['E-1','a@ai.jbedu.kr','B-1','본문','추천대상','이유','질문','2026-11-14','2026-11-14','TRUE']).hidden === true`
  - `rowToObject('도서', ['B-1','코스모스','칼 세이건','봉우리','자연과학, 공학·IT','','소개','서울대 권장도서 100선']).careers` deep-equals `['자연과학','공학·IT']`
  - `objectToRow('도서', 위 객체)[4] === '자연과학,공학·IT'`
  - 왕복: 모든 탭에 대해 `rowToObject(t, objectToRow(t, o))` deep-equals `o`
  - `isSchoolEmail('kim@ai.jbedu.kr') === true`, `isSchoolEmail('') === false`, `isSchoolEmail('kim@gmail.com') === false`, `isSchoolEmail('kim@ai.jbedu.kr.evil.com') === false`, `isSchoolEmail(' KIM@AI.JBEDU.KR ') === true`
  - `newId('E')` 두 번 호출 결과가 다르고 `/^E-[a-z0-9]+$/` 매칭
- [ ] **Step 2: 실행해 실패 확인** — `cd reading-app && npm test` → FAIL (`rowToObject is not defined`)
- [ ] **Step 3: `package.json`(`"type":"commonjs"`, `"test":"node --test test/"`, 의존성 없음), `load.js`, `Logic.js`의 위 함수 구현**
- [ ] **Step 4: 실행해 통과 확인** — `npm test` → PASS
- [ ] **Step 5: 커밋** — `git add reading-app && git commit -m "reading-app: scaffold, test loader, row mapping"`

### Task 2: 접근 판정과 학생 등록 검증

**Files:**
- Modify: `reading-app/src/Logic.js`
- Test: `reading-app/test/logic.access.test.js`

**Interfaces:**
- Consumes: `isSchoolEmail` (Task 1)
- Produces:
  - `accessState(email:string, student:Student|null, settings:Settings) => 'outsider'|'admin'|'needsCode'|'needsProfile'|'student'`
    - 학교 메일 아님 → `outsider`; 관리자 이메일(대소문자 무시) → `admin`(학생 등록 여부와 무관); 등록됨 → `student`; 미등록·코드켜짐 → `needsCode`; 미등록·코드꺼짐 → `needsProfile`.
  - `checkEntryCode(input:string, settings:Settings) => boolean` (trim + 대소문자 무시; 코드꺼짐이면 항상 true)
  - `validateProfile(p:{name,classNo,number,career}, settings) => Result` — 이름 1–20자(trim), 반 1–15 정수, 번호 1–40 정수, 진로는 `settings.careers` 중 하나.

- [ ] **Step 1: 실패하는 테스트 작성**
  - `accessState('x@gmail.com', null, s) === 'outsider'`; `accessState('', null, s) === 'outsider'`
  - 관리자 `'T@ai.jbedu.kr'`가 `adminEmails:['t@ai.jbedu.kr']`일 때 `'admin'`
  - 미등록·`entryCodeOn:true` → `'needsCode'`; `entryCodeOn:false` → `'needsProfile'`; 등록 학생 → `'student'`
  - `checkEntryCode('  hn2026 ', {entryCodeOn:true, entryCode:'HN2026'}) === true`; `'hn2025'` → false; `entryCodeOn:false`이면 `''`도 true
  - `validateProfile({name:'  ', classNo:3, number:5, career:'교육'}).ok === false`; `classNo:0` 거부; `career:'우주비행사'` 거부; 정상값 `ok:true`
- [ ] **Step 2: `npm test` → FAIL**
- [ ] **Step 3: 세 함수 구현**
- [ ] **Step 4: `npm test` → PASS**
- [ ] **Step 5: 커밋** — `"reading-app: access state and profile validation"`

### Task 3: 독후감·댓글·책 추가 입력 검증

**Files:**
- Modify: `reading-app/src/Logic.js`
- Test: `reading-app/test/logic.validate.test.js`

**Interfaces:**
- Produces:
  - `validateEssay(e:{bookId, body, recTarget, recReason, question}, settings, bookIds:Set<string>) => Result` — body: trim 후 `settings.minBodyChars` 이상 5000 이하; recTarget·recReason: trim 후 1–200자; question: 0–200자(선택); bookId는 `bookIds`에 있어야 함. 성공 시 `data`는 trim된 값.
  - `validateComment(body:string) => Result` — trim 후 1–500자.
  - `validateNewBook(b:{title, author, careers:string[]}, settings) => Result` — title 1–100, author 1–60, careers 1개 이상·모두 `settings.careers` 소속.
  - 에러 메시지(정확히): `'감상은 최소 N자 이상 써 주세요. (지금 M자)'`, `'감상은 5000자까지 쓸 수 있어요.'`, `'추천 대상과 이유를 채워 주세요.'`, `'목록에 있는 책을 골라 주세요.'`, `'댓글 내용을 입력해 주세요.'`, `'댓글은 500자까지 쓸 수 있어요.'`

- [ ] **Step 1: 실패하는 테스트 작성**
  - 299자 본문 + min 300 → `{ok:false, error:'감상은 최소 300자 이상 써 주세요. (지금 299자)'}`
  - 앞뒤 공백 포함 300자 본문은 trim 후 길이로 판정
  - 50000자 → `'감상은 5000자까지 쓸 수 있어요.'`
  - recReason `'   '` → `'추천 대상과 이유를 채워 주세요.'`
  - 없는 bookId → `'목록에 있는 책을 골라 주세요.'`
  - question 빈 문자열 허용
  - `validateComment('   ').error === '댓글 내용을 입력해 주세요.'`; 501자 → 500자 메시지
  - `validateNewBook({title:'x', author:'y', careers:['우주']}).ok === false`
- [ ] **Step 2: `npm test` → FAIL**
- [ ] **Step 3: 구현**
- [ ] **Step 4: `npm test` → PASS**
- [ ] **Step 5: 커밋** — `"reading-app: essay/comment/book validation"`

### Task 4: 화면용 데이터 조립 (진로 지도·책 카드·상세·관리 현황)

**Files:**
- Modify: `reading-app/src/Logic.js`
- Test: `reading-app/test/logic.views.test.js`

**Interfaces:**
- Consumes: 공통 데이터 형태
- Produces (모든 함수 `db = {students, books, essays, comments}` 와 `viewer:{email, isAdmin}` 를 받음; `isAdmin`이 false면 hidden 항목 제외):
  - `careerView(db, career:string, viewer) => {career, friends:[{name, classNo, bookTitles:string[]}], recentEssays:EssayCard[]}` — friends: 해당 진로 학생 전원(글 없어도 포함), 반→번호 순; recentEssays: 해당 진로 학생의 글 최신순 최대 20.
  - `EssayCard = {id, bookId, bookTitle, authorName, authorClass, career, recTarget, recReason, question, createdAt, commentCount}`
  - `bookCards(db, filter:{career?:string, q?:string}, viewer) => [{...Book, readerCount, readersByCareer:{[career]:number}, topReason:EssayCard|null, peak:{id,title}|null, bridges:{id,title}[]}]` — career 필터는 `book.careers`에 포함되거나 그 진로 학생이 읽은 책; q는 제목·저자 부분일치(대소문자 무시, 공백 무시); 정렬: readerCount 내림차순, 같으면 봉우리→징검다리→학생추가, 제목순. topReason은 가장 최근 글.
  - `essayDetail(db, essayId, viewer) => {essay:EssayCard & {body, updatedAt, hidden}, comments:[{id, authorName, authorClass, body, createdAt, hidden}]} | null` — 비관리자에게 숨김 글은 null.
  - `myRecords(db, email) => {essays:EssayCard[], commentsOnMine:[{essayId, bookTitle, authorName, body, createdAt}]}` — 내 글은 숨김이어도 본인에게 보임(배지용 hidden 포함).
  - `adminSummary(db) => [{classNo, students:[{name, number, email, essayCount, commentCount}]}]` — 반·번호 순.

- [ ] **Step 1: 실패하는 테스트 작성** (픽스처: 학생 4명(의약·보건 2, 교육 1, 공학·IT 1), 책 3권(봉우리 1, 그에 연결된 징검다리 1, 학생추가 1), 독후감 4편 중 1편 hidden, 댓글 3개 중 1개 hidden)
  - `careerView(db,'의약·보건',stu).friends.length === 2` 이고 글 없는 학생도 포함
  - **`hidden excluded everywhere`**: 학생 viewer로 careerView.recentEssays, bookCards의 readerCount/topReason, essayDetail(숨김글)=null, 댓글 목록 어디에도 hidden 항목 없음; 관리자 viewer로는 모두 보임
  - bookCards 필터 `q:'코 스 모'` 가 '코스모스' 매칭
  - 징검다리 카드의 `peak.title` = 연결된 봉우리 제목, 봉우리 카드의 `bridges`에 징검다리 포함
  - 정렬: readerCount 2권이 1권보다 앞
  - `myRecords`가 본인 숨김글을 `hidden:true`로 포함
  - `adminSummary` 첫 원소 classNo가 가장 작은 반, essayCount에 숨김글 포함
- [ ] **Step 2: `npm test` → FAIL**
- [ ] **Step 3: 구현**
- [ ] **Step 4: `npm test` → PASS**
- [ ] **Step 5: 커밋** — `"reading-app: view builders"`

### Task 5: 초기 데이터와 시트 저장소

**Files:**
- Create: `reading-app/src/Seed.js`, `reading-app/src/Store.js`
- Modify: `reading-app/test/load.js` (가짜 `SpreadsheetApp` 추가)
- Test: `reading-app/test/store.test.js`

**Interfaces:**
- Consumes: `HEADERS`, `rowToObject`, `objectToRow`, `newId`
- Produces:
  - `Seed.js`: `SEED_CAREERS`(Global Constraints 목록), `SEED_SETTINGS`(키→값; 입장코드사용 TRUE, 입장코드 `'호남'+4자리 랜덤` 은 setup 시 생성, 감상최소글자 300, 도서관링크, 학년도 '2026'), `SEED_BOOKS: Book[]` (아래 표).
  - `Store.js`: `getSs_() => Spreadsheet` (`SpreadsheetApp.getActiveSpreadsheet()`), `setupSpreadsheet(adminEmail:string) => void` (없는 탭만 만들고 헤더·시드 입력, 관리자이메일에 adminEmail 기록; 두 번 실행해도 중복 없음), `readAll() => {students, books, essays, comments}`, `readSettings() => Settings`, `appendRow(tab, obj) => void`, `updateRowById(tab, id, patch:object) => boolean` (1열이 id인 행; 학생 탭은 이메일이 키).
  - 가짜 SpreadsheetApp: 탭별 2차원 배열, `getSheetByName/insertSheet/getDataRange().getValues()/appendRow/getRange(r,c,nr,nc).setValues()` 만 지원.

**SEED_BOOKS** (구분 · 제목 · 저자 · 진로분야 · 연결봉우리 · 출처):

| id | 구분 | 제목 | 저자 | 진로분야 | 봉우리 | 출처 |
|---|---|---|---|---|---|---|
| P01 | 봉우리 | 코스모스 | 칼 세이건 | 자연과학, 공학·IT | | 서울대 권장도서 100선 |
| P02 | 봉우리 | 부분과 전체 | 베르너 하이젠베르크 | 자연과학 | | 서울대 권장도서 100선 |
| P03 | 봉우리 | 침묵의 봄 | 레이첼 카슨 | 자연과학, 의약·보건 | | 서울대 권장도서 100선 |
| P04 | 봉우리 | 과학혁명의 구조 | 토머스 쿤 | 자연과학, 인문·언어 | | 서울대 권장도서 100선 |
| P05 | 봉우리 | 군주론 | 니콜로 마키아벨리 | 법·행정·정치 | | 서울대 권장도서 100선 |
| P06 | 봉우리 | 국부론 | 애덤 스미스 | 경영·경제 | | 서울대 권장도서 100선 |
| P07 | 봉우리 | 광장 | 최인훈 | 인문·언어, 사회·심리 | | 서울대 권장도서 100선 |
| P08 | 봉우리 | 난장이가 쏘아올린 작은 공 | 조세희 | 사회·심리, 인문·언어 | | 서울대 권장도서 100선 |
| P09 | 봉우리 | 열하일기 | 박지원 | 인문·언어, 교육 | | 서울대 권장도서 100선 |
| B01 | 징검다리 | 과학콘서트 | 정재승 | 자연과학, 공학·IT | P01 | |
| B02 | 징검다리 | 랩 걸 | 호프 자런 | 자연과학 | P03 | |
| B03 | 징검다리 | 아픔이 길이 되려면 | 김승섭 | 의약·보건, 사회·심리 | P03 | |
| B04 | 징검다리 | 숨결이 바람 될 때 | 폴 칼라니티 | 의약·보건 | | |
| B05 | 징검다리 | 수학이 필요한 순간 | 김민형 | 공학·IT, 자연과학 | P02 | |
| B06 | 징검다리 | 코드 | 찰스 펫졸드 | 공학·IT | | |
| B07 | 징검다리 | 정의란 무엇인가 | 마이클 샌델 | 법·행정·정치, 교육 | P05 | |
| B08 | 징검다리 | 선량한 차별주의자 | 김지혜 | 사회·심리, 법·행정·정치, 교육 | P08 | |
| B09 | 징검다리 | 죽은 경제학자의 살아있는 아이디어 | 토드 부크홀츠 | 경영·경제 | P06 | |
| B10 | 징검다리 | 사피엔스 | 유발 하라리 | 인문·언어, 사회·심리, 아직 모르겠음 | P04 | |
| B11 | 징검다리 | 미움받을 용기 | 기시미 이치로, 고가 후미타케 | 사회·심리, 교육, 아직 모르겠음 | | |
| B12 | 징검다리 | 죽은 시인의 사회 | N. H. 클라인바움 | 교육, 미디어·예술 | | |
| B13 | 징검다리 | 멋진 신세계 | 올더스 헉슬리 | 미디어·예술, 공학·IT, 아직 모르겠음 | | |

한줄소개는 빈칸으로 두고 선생님이 채운다(빌더가 지어내지 않음). `출처`의 "서울대 권장도서 100선" 표기는 DEPLOY.md에서 선생님 확인 항목으로 안내.

- [ ] **Step 1: 실패하는 테스트 작성** — `store.test.js`
  - 빈 가짜 시트에 `setupSpreadsheet('t@ai.jbedu.kr')` → 5개 탭, 각 1행이 `HEADERS`와 같음, `도서` 행 수 = 1 + SEED_BOOKS.length
  - 두 번 실행해도 `도서` 행 수 그대로
  - `readSettings()`가 `{entryCodeOn:true, minBodyChars:300, careers:SEED_CAREERS, adminEmails:['t@ai.jbedu.kr']}` 포함, entryCode `/^호남\d{4}$/`
  - `appendRow('댓글', c)` 후 `readAll().comments`에 c 포함
  - `updateRowById('독후감', id, {body:'새'})` → true, 다른 열 불변; 없는 id → false
  - SEED_BOOKS 모든 `careers`가 SEED_CAREERS 소속, 모든 `peakId`가 실재하는 봉우리 id
- [ ] **Step 2: `npm test` → FAIL**
- [ ] **Step 3: 구현**
- [ ] **Step 4: `npm test` → PASS**
- [ ] **Step 5: 커밋** — `"reading-app: seed data and sheet store"`

### Task 6: 서버 API

**Files:**
- Create: `reading-app/src/Code.js`
- Modify: `reading-app/test/load.js` (가짜 `Session`, `LockService`, `HtmlService`)
- Test: `reading-app/test/api.test.js`

**Interfaces:**
- Consumes: Task 1–5 전부
- Produces (모두 `Result` 반환, 예외는 잡아 `{ok:false, error}`로; 각 함수 첫 줄에서 `currentUser_()`):
  - `doGet() => HtmlOutput` — `index.html`, 제목 `'우리 진로 책장'`, `setXFrameOptionsMode(ALLOWALL)` 불필요, viewport 메타 추가.
  - `currentUser_() => {email, state, student, settings, isAdmin}`
  - `apiBootstrap() => {state, me:Student|null, isAdmin, careers, libraryUrl, minBodyChars}` — outsider/needsCode/needsProfile면 학생 데이터 없음.
  - `apiCheckCode(code) => {valid:boolean}` — 화면이 다음 단계로 넘어갈지만 판단. 서버에 상태를 저장하지 않는다. (웹앱이 "실행: 나"로 돌아가므로 `PropertiesService.getUserProperties()`는 방문자가 아니라 선생님 저장소다 — 쓰지 말 것.)
  - `apiRegister(profile, code)` — 미등록자는 `checkEntryCode(code)`가 참이어야 등록; 등록된 학생·관리자는 code 없이 프로필 갱신(진로 변경 허용).
  - `apiCareerView(career)`, `apiBookCards(filter)`, `apiEssayDetail(id)`, `apiMyRecords()`, `apiAdminSummary()`(관리자만)
  - `apiSubmitEssay(e) => {id}`, `apiUpdateEssay(id, e)` (작성자 본인만), `apiAddComment(essayId, body) => {id}` (숨김 글엔 불가), `apiAddBook(b) => {id}` (kind='학생추가', id `newId('U')`), `apiSetHidden(tab:'독후감'|'댓글', id, hidden:boolean)` (관리자만)
  - 학생 전용 API는 state가 `student` 또는 `admin`일 때만. 그 외 에러 `'먼저 입장 절차를 마쳐 주세요.'`

- [ ] **Step 1: 실패하는 테스트 작성** (가짜 Session으로 사용자 전환)
  - outsider `apiBootstrap()` 결과 JSON 문자열에 시드 학생 이름이 없음, `state:'outsider'`; outsider의 `apiCareerView` → ok:false
  - needsCode에서 `apiRegister(profile, '틀림')` → ok:false, 학생 탭 불변; `apiCheckCode('틀림').data.valid === false`; `apiRegister(profile, 맞는코드)` 성공 → `apiBootstrap().state === 'student'`
  - 등록 학생이 `apiRegister({...profile, career:'교육'})`(code 없음) → 진로 변경됨
  - 학생 A가 `apiSubmitEssay` 후 학생 B의 `apiCareerView`에 A의 글 카드 표시
  - **`update other's essay rejected`**: B가 `apiUpdateEssay(A의 id, …)` → `{ok:false, error:'내가 쓴 글만 고칠 수 있어요.'}`, 시트 불변
  - 학생의 `apiSetHidden` → ok:false; 관리자 숨김 후 B의 `apiEssayDetail` → ok:true, data null; 숨김 글에 `apiAddComment` → ok:false
  - 쓰기 API가 `LockService.getScriptLock().waitLock` 을 호출(가짜에서 카운트)
- [ ] **Step 2: `npm test` → FAIL**
- [ ] **Step 3: 구현**
- [ ] **Step 4: `npm test` → PASS**
- [ ] **Step 5: 커밋** — `"reading-app: server api"`

### Task 7: 화면 (index.html)

**Files:**
- Create: `reading-app/src/index.html`
- Test: `reading-app/test/ui.test.js` (Playwright; `file://`로 열고 `window.google = {script:{run: 가짜}}`를 `addInitScript`로 주입. 가짜는 Task 6 API 이름과 같은 메서드를 가지며 `withSuccessHandler/withFailureHandler` 체인 지원.)

**Interfaces:**
- Consumes: Task 6 `api*` 이름과 반환 형태
- Produces: 화면 상태 `outsider | code | profile | app(tab: career|books|write|mine) | detail | admin`

화면 요구(스펙 6.4):
- outsider: "이 앱은 호남고 1학년 진로 수업용입니다."만.
- code: 입장 코드 입력 1칸 + 확인.
- profile: 이름·반·번호·진로(select). 
- 하단 탭 4개: 우리 진로 / 책 찾기 / 독후감 쓰기 / 내 기록. 관리자는 상단에 "관리" 버튼.
- 우리 진로: 진로 select(기본 내 진로), 친구 목록(이름·반·읽은 책), 글 카드(추천이유를 가장 크게, 그 아래 "— 이름 (반)", 질문이 있으면 "❓ 질문" 줄).
- 책 찾기: 진로 select + 검색창, 카드(제목·저자·구분 배지·"친구 N명이 읽음"·대표 추천이유·봉우리/징검다리 링크), 버튼 "우리 도서관에서 찾기"(제목을 `navigator.clipboard.writeText` 후 `libraryUrl` 새 창; 클립보드 실패해도 열림, 토스트 "책 제목을 복사했어요. 검색창에 붙여 넣으세요."), "이 책으로 독후감 쓰기", 맨 아래 "목록에 없는 책 추가".
- 독후감 쓰기: 책 select, 감상 textarea(실시간 글자 수 "M / 최소 N자"), "이 책을 [___]한 친구에게 권한다", "왜냐하면 [___]", "같은 진로 친구에게 묻고 싶은 것(선택)". 입력 중 내용은 `localStorage['draft']`에 저장(try/catch), 제출 성공 시 삭제. 서버 에러 메시지는 폼 위 빨간 글씨로.
- 상세: 본문, 추천, 질문 강조, 댓글(이름·반·내용), 댓글 입력. 본인 글이면 "고치기".
- 관리: 반별 제출 현황 표, 각 글·댓글 옆 "숨기기/보이기".
- 모든 학생 입력 텍스트는 `textContent`로만 넣는다. `innerHTML`에 데이터 보간 금지.
- 폰트·외부 스크립트 없음(앱스 스크립트 iframe에서 단순하게). 색은 `:root` 변수, `prefers-color-scheme: dark` 대응.

- [ ] **Step 1: 실패하는 테스트 작성**
  - outsider 가짜 → 본문에 "호남고 1학년 진로 수업용" 표시, 탭 없음
  - needsCode → 코드 입력(`apiCheckCode`) 후 profile 화면 → 등록(`apiRegister`가 입력한 코드를 함께 받음) → "우리 진로" 탭 표시
  - **`escapes student html`**: 가짜 careerView의 recReason = `'<img src=x onerror="window.__x=1">'` → 카드에 그 문자열이 글자로 보이고 `window.__x` undefined, 문서에 `img[src="x"]` 없음
  - 감상 299자에서 글자 수 표시 "299 / 최소 300자", 가짜가 에러 반환 시 메시지 표시
  - 360px·768px 뷰포트에서 `document.documentElement.scrollWidth <= innerWidth`
  - "우리 도서관에서 찾기" 클릭 시 `window.open`이 `libraryUrl`로 호출됨(스텁)
- [ ] **Step 2: `npm test` → FAIL**
- [ ] **Step 3: 구현**
- [ ] **Step 4: `npm test` → PASS**
- [ ] **Step 5: 화면 확인용 스크린샷 1장(768px, 가짜 데이터) 찍어 눈으로 점검**
- [ ] **Step 6: 커밋** — `"reading-app: ui"`

### Task 8: 번들·배포 안내·최종 점검

**Files:**
- Create: `reading-app/tools/bundle.js`, `reading-app/DEPLOY.md`
- Modify: `reading-app/package.json` (`"bundle": "node tools/bundle.js"`)
- Test: `reading-app/test/bundle.test.js`

**Interfaces:**
- Produces: `dist/Code.gs` = `Logic.js, Seed.js, Store.js, Code.js` 순서로 이어 붙임(파일 경계 주석 포함), `dist/index.html` = 복사.

DEPLOY.md(한국어, 선생님 대상, 스크린샷 없이 단계별):
1. 학교 계정으로 구글 시트 새로 만들기 → 이름 "우리 진로 책장 2026".
2. 확장 프로그램 → Apps Script → `Code.gs` 내용 전부 지우고 `dist/Code.gs` 붙여넣기; 파일 추가(+) → HTML → 이름 `index` → `dist/index.html` 붙여넣기.
3. 함수 선택 `setupSpreadsheet` 실행용 래퍼 `초기설정()` (Code.js에 정의: 실행자 이메일로 `setupSpreadsheet` 호출) → 권한 승인.
4. 배포 → 새 배포 → 웹 앱 → 실행: 나 / 액세스 권한: "ai.jbedu.kr 내 모든 사용자" → 링크 복사.
5. `설정` 탭에서 입장 코드 확인·변경, 감상 최소 글자, 진로 목록 수정 방법.
6. `도서` 탭: 한줄소개 채우기, "서울대 권장도서 100선" 표기 확인, 책 추가 방법(진로분야는 쉼표).
7. 학생 글 숨기기, 학생부 정리할 때 `독후감` 탭 필터 쓰는 법.
8. 첫 수업 권장: "친구의 글은 앱 안에서만 읽는다" 약속 정하기.
9. 코드 수정 후에는 "배포 관리 → 새 버전"으로 갱신해야 학생 화면에 반영됨.
10. 새 학년도: 시트 사본 만들기 → 새로 배포.

- [ ] **Step 1: 실패하는 테스트 작성** — `bundle.test.js`: `npm run bundle` 후 `dist/Code.gs`를 vm에서 실행했을 때 `doGet, apiBootstrap, setupSpreadsheet, 초기설정` 모두 함수; `require(`·`module.exports`·`import ` 문자열 없음
- [ ] **Step 2: `npm test` → FAIL**
- [ ] **Step 3: bundle.js, DEPLOY.md, `초기설정()` 구현** (`load.js`가 `module.exports` 없이도 동작하므로 src에 Node 전용 코드 금지)
- [ ] **Step 4: 전체 `npm test` → PASS, `npm run bundle` 성공**
- [ ] **Step 5: 커밋 후 푸시** — `"reading-app: bundle and deploy guide"`, `git push -u origin ccr-db39b47c-p75zbr`
