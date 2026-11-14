'use strict';
// src/*.js 서버 파일을 dist/Code.gs 하나로 합치고 index.html을 복사한다.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ORDER = ['Logic.js', 'Seed.js', 'Store.js', 'Code.js'];

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const parts = ORDER.map((f) => `// ===== ${f} =====\n` + fs.readFileSync(path.join(ROOT, 'src', f), 'utf8').trim() + '\n');
const header = '// 우리 진로 책장 — 이 파일 전체를 앱스 스크립트의 Code.gs에 붙여 넣으세요. (자동 생성: npm run bundle)\n\n';
fs.writeFileSync(path.join(ROOT, 'dist', 'Code.gs'), header + parts.join('\n'));
fs.copyFileSync(path.join(ROOT, 'src', 'index.html'), path.join(ROOT, 'dist', 'index.html'));
console.log('dist/Code.gs, dist/index.html 생성 완료');
