/* Store.js — 구글 시트 읽기/쓰기 */

var TABS_ = ['학생', '도서', '독후감', '댓글', '설정', '질문'];

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

function setupSpreadsheet_() {
  var ss = getSs_();
  TABS_.forEach(function (tab) {
    var sh = ss.getSheetByName(tab);
    if (!sh) {
      sh = ss.insertSheet(tab);
      sh.appendRow(HEADERS[tab]);
      if (sh.setFrozenRows) sh.setFrozenRows(1);
      if (tab === '도서') SEED_BOOKS.forEach(function (b) { sh.appendRow(objectToRow_('도서', b)); });
      if (tab === '질문') SEED_QUESTIONS.forEach(function (q) { sh.appendRow(objectToRow_('질문', q)); });
    }
  });
  var sh = ss.getSheetByName('설정');
  var have = {};
  dataRows_('설정').forEach(function (r) { have[String(r[0])] = true; });
  Object.keys(SEED_SETTINGS).forEach(function (k) {
    if (have[k]) return;
    var v = SEED_SETTINGS[k];
    if (k === '관리자비밀번호') v = '관리' + String(1000 + Math.floor(Math.random() * 9000));
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
    adminPassword: String(kv['관리자비밀번호'] == null ? '' : kv['관리자비밀번호']).trim(),
    libraryUrl: String(kv['도서관링크'] || SEED_SETTINGS['도서관링크']),
    schoolYear: String(kv['학년도'] == null ? '' : kv['학년도'])
  };
}

function readAll_() {
  function read(tab) { return dataRows_(tab).map(function (r) { return rowToObject_(tab, r); }); }
  return { students: read('학생'), books: read('도서'), essays: read('독후감'), comments: read('댓글'), questions: read('질문') };
}

function appendRow_(tab, obj) {
  sheet_(tab).appendRow(objectToRow_(tab, obj));
}

function updateRowById_(tab, id, patch) {
  var sh = sheet_(tab);
  var values = sh.getDataRange().getValues();
  var key = String(id);
  for (var i = 1; i < values.length; i++) {
    var cell = String(values[i][0]);
    if (cell !== key) continue;
    var obj = rowToObject_(tab, values[i]);
    Object.keys(patch).forEach(function (k) { obj[k] = patch[k]; });
    var row = objectToRow_(tab, obj);
    sh.getRange(i + 1, 1, 1, row.length).setValues([row]);
    return true;
  }
  return false;
}
