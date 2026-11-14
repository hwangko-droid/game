'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

test('bundle produces a single runnable Code.gs and index.html', () => {
  execFileSync('node', ['tools/bundle.js'], { cwd: ROOT });
  const gs = fs.readFileSync(path.join(ROOT, 'dist/Code.gs'), 'utf8');
  for (const bad of ['require(', 'module.exports', 'import ']) assert.ok(!gs.includes(bad), bad);
  const ctx = vm.createContext({});
  vm.runInContext(gs, ctx);
  for (const fn of ['doGet', 'apiBootstrap', 'setupSpreadsheet_', '초기설정', 'apiRegister', 'careerView_']) {
    assert.equal(typeof ctx[fn], 'function', fn);
  }
  assert.ok(gs.indexOf('Logic.js') < gs.indexOf('Code.js'));
  assert.equal(fs.readFileSync(path.join(ROOT, 'dist/index.html'), 'utf8'), fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8'));
});

test('only doGet, 초기설정 and api* are callable from the browser', () => {
  execFileSync('node', ['tools/bundle.js'], { cwd: ROOT });
  const gs = fs.readFileSync(path.join(ROOT, 'dist/Code.gs'), 'utf8');
  const names = [...gs.matchAll(/^function\s+([^\s(]+)/gm)].map(m => m[1]);
  const pub = names.filter(n => !n.endsWith('_'));
  const bad = pub.filter(n => !(n === 'doGet' || n === '초기설정' || /^api[A-Z]/.test(n)));
  assert.deepEqual(bad, []);
});
