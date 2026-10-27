'use strict';
/**
 * 构建前把根目录的网页文件同步到 desktop/app/，
 * 避免改了网页版却打进旧包（踩过这个坑）。
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const dest = path.resolve(__dirname, '..', 'app');
const files = ['index.html', 'style.css', 'data.js', 'app.js'];

fs.mkdirSync(dest, { recursive: true });
for (const f of files) {
  const src = path.join(root, f);
  if (!fs.existsSync(src)) {
    console.error('[sync] 缺少文件：' + src);
    process.exit(1);
  }
  fs.copyFileSync(src, path.join(dest, f));
  const kb = (fs.statSync(src).size / 1024).toFixed(1);
  console.log('[sync] ' + f + '  ' + kb + ' KB');
}
console.log('[sync] 已同步到 desktop/app/');
