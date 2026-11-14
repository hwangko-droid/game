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
function fakeSpreadsheet() {
  const sheets = {};
  function sheet(name) {
    const rows = sheets[name];
    return {
      getName: () => name,
      getDataRange: () => ({ getValues: () => (rows.length ? rows.map(r => r.slice()) : [[]]) }),
      getLastRow: () => rows.length,
      appendRow: (r) => { rows.push(r.slice()); },
      getRange: (r, c, nr = 1, nc = 1) => ({
        setValues: (vals) => {
          for (let i = 0; i < nr; i++) {
            while (rows.length < r + i) rows.push([]);
            for (let j = 0; j < nc; j++) rows[r - 1 + i][c - 1 + j] = vals[i][j];
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
