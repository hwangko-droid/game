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
