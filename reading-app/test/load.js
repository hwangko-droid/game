'use strict';
// Loads Apps Script-style source files (global functions, no modules) into one vm context.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');

function loadGs(files, globals = {}) {
  const ctx = vm.createContext({ console, Date, Math, JSON, ...globals });
  for (const f of files) {
    const code = fs.readFileSync(path.join(SRC, f), 'utf8');
    vm.runInContext(code, ctx, { filename: f });
  }
  return ctx;
}

// Plain-object copy so deepStrictEqual works across vm realms.
function plain(v) { return JSON.parse(JSON.stringify(v)); }

module.exports = { loadGs, plain };

// ---- 가짜 SpreadsheetApp (탭별 2차원 배열) ----
function sheetCoerce(v) {
  if (typeof v !== 'string') return v;
  if (v.startsWith("'")) return v.slice(1);
  if (v.startsWith('=')) return '#FORMULA_RESULT';
  if (/^[+-]?\d+(\.\d+)?$/.test(v.trim())) return Number(v);
  return v;
}

function fakeSpreadsheet() {
  const sheets = {};
  function sheet(name) {
    const rows = sheets[name];
    return {
      getName: () => name,
      getDataRange: () => ({ getValues: () => (rows.length ? rows.map(r => r.slice()) : [[]]) }),
      getLastRow: () => rows.length,
      appendRow: (r) => { rows.push(r.map(sheetCoerce)); },
      getRange: (r, c, nr = 1, nc = 1) => ({
        setValues: (vals) => {
          for (let i = 0; i < nr; i++) {
            while (rows.length < r + i) rows.push([]);
            for (let j = 0; j < nc; j++) rows[r - 1 + i][c - 1 + j] = sheetCoerce(vals[i][j]);
          }
        },
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (rows[r - 1 + i] || [])[c - 1 + j] ?? '')),
      }),
      setFrozenRows: () => {},
    };
  }
  const ss = {
    _sheets: sheets,
    getSheetByName: (n) => (sheets[n] ? sheet(n) : null),
    insertSheet: (n) => { sheets[n] = []; return sheet(n); },
  };
  return { SpreadsheetApp: { getActiveSpreadsheet: () => ss }, ss };
}

module.exports.fakeSpreadsheet = fakeSpreadsheet;
module.exports.sheetCoerce = sheetCoerce;

// ---- 앱 전체 로드 (가짜 Session/Lock/Html 포함) ----
function loadApp() {
  const f = fakeSpreadsheet();
  const state = { sid: '', owner: '', lockCalls: 0, locked: false, readsUnderLock: 0, cache: {} };
  const globals = {
    SpreadsheetApp: f.SpreadsheetApp,
    Session: { getActiveUser: () => ({ getEmail: () => state.sid }), getEffectiveUser: () => ({ getEmail: () => state.owner || state.sid }) },
    LockService: { getScriptLock: () => ({ waitLock: () => { state.lockCalls++; state.locked = true; }, releaseLock: () => { state.locked = false; } }) },
    CacheService: { getScriptCache: () => ({ get: (k) => (k in state.cache ? state.cache[k] : null), put: (k, v) => { state.cache[k] = String(v); }, remove: (k) => { delete state.cache[k]; } }) },
    HtmlService: {
      createHtmlOutputFromFile: (name) => {
        const out = { name, title: '', metas: {} };
        out.setTitle = (t) => { out.title = t; return out; };
        out.addMetaTag = (k, v) => { out.metas[k] = v; return out; };
        return out;
      },
    },
  };
  globals.Utilities = { getUuid: () => require('crypto').randomUUID() };
  const G = loadGs(['Logic.js', 'Seed.js', 'Store.js', 'Code.js'], globals);
  const ssGet = f.ss.getSheetByName;
  f.ss.getSheetByName = (n) => { const sh = ssGet(n); if (!sh) return sh; const gdr = sh.getDataRange;
    sh.getDataRange = () => { if (state.locked) state.readsUnderLock++; return gdr(); }; return sh; };
  return { G, ss: f.ss, state, as: (sid) => { state.sid = sid; } };
}
module.exports.loadApp = loadApp;
