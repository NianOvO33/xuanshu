'use strict';

const { app, BrowserWindow, Menu, shell, nativeTheme, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');

// 部分机器（受限账户 / 虚拟机 / 旧显卡驱动）上 GPU 进程沙箱初始化失败，
// 会导致窗口无法创建。这里只关闭 GPU 进程沙箱，渲染进程保持不变。
app.commandLine.appendSwitch('disable-gpu-sandbox');

let win = null;

// 单实例：重复双击时唤起已打开的窗口，而不是再开一个
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: '#07080f',
    title: '玄枢 · 塔罗与东方占卜',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      // 纯本地静态页面，不加载任何远程内容
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false
    }
  });

  // loadFile 能正确处理 asar 打包与含中文的安装路径
  win.loadFile(path.join(__dirname, 'app', 'index.html'));

  const reveal = () => {
    if (!win || win.isDestroyed()) return;
    if (!win.isVisible()) win.show();
    win.focus();
  };
  win.once('ready-to-show', reveal);
  // 兜底：极少数环境下 ready-to-show 不触发，也不能让窗口一直藏着
  setTimeout(reveal, 4000);

  // 站内不跳转外部页面；如需外链一律交给系统浏览器
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) e.preventDefault();
  });

  win.on('closed', () => { win = null; });
}


/* ---------------- AI 解读：主进程代发请求（绕开跨域） ---------------- */
ipcMain.handle('ai:chat', async (_e, payload) => {
  try {
    const { url, key, body } = payload || {};
    if (!url || !/^https?:/i.test(url)) return { ok: false, error: '接口地址无效，需要以 http(s):// 开头' };
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const data = Buffer.from(JSON.stringify(body || {}), 'utf8');

    const res = await new Promise((resolve, reject) => {
      const req = lib.request({
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + (u.search || ''),
        method: 'POST',
        headers: Object.assign({
          'Content-Type': 'application/json',
          'Content-Length': data.length,
          'Accept': 'application/json'
        }, key ? { Authorization: 'Bearer ' + key } : {}),
        timeout: 90000
      }, r => {
        const chunks = [];
        r.on('data', c => chunks.push(c));
        r.on('end', () => resolve({ status: r.statusCode, buf: Buffer.concat(chunks) }));
      });
      req.on('timeout', () => req.destroy(new Error('请求超时（90 秒）')));
      req.on('error', reject);
      req.write(data);
      req.end();
    });

    const text = res.buf.toString('utf8');
    if (res.status < 200 || res.status >= 300) {
      let msg = text.slice(0, 300);
      try {
        const j = JSON.parse(text);
        if (j && j.error) msg = j.error.message || (typeof j.error === 'string' ? j.error : msg);
      } catch (err) { /* 保持原文 */ }
      if (res.status === 401 || res.status === 403) return { ok: false, error: '密钥无效或没有权限（HTTP ' + res.status + '）' };
      if (res.status === 404) return { ok: false, error: '接口地址不存在（HTTP 404），请检查是否填到 /chat/completions' };
      if (res.status === 429) return { ok: false, error: '请求过于频繁或额度不足（HTTP 429）' };
      return { ok: false, error: 'HTTP ' + res.status + '：' + msg };
    }

    let j;
    try { j = JSON.parse(text); } catch (err) { return { ok: false, error: '返回内容不是合法 JSON' }; }
    const content = (((j.choices || [])[0] || {}).message || {}).content || '';
    if (!content) return { ok: false, error: '接口没有返回解读内容' };
    return { ok: true, text: content };
  } catch (err) {
    return { ok: false, error: '无法连接接口：' + (err && err.message ? err.message : String(err)) };
  }
});

const menu = Menu.buildFromTemplate([
  {
    label: '视图',
    submenu: [
      { role: 'reload', label: '重新加载' },
      { role: 'toggleDevTools', label: '开发者工具' },
      { type: 'separator' },
      { role: 'resetZoom', label: '实际大小' },
      { role: 'zoomIn', label: '放大' },
      { role: 'zoomOut', label: '缩小' },
      { type: 'separator' },
      { role: 'togglefullscreen', label: '全屏' }
    ]
  },
  {
    label: '窗口',
    submenu: [
      { role: 'minimize', label: '最小化' },
      { role: 'close', label: '关闭' }
    ]
  }
]);

// 强制深色，让 Windows 标题栏与界面一致
nativeTheme.themeSource = 'dark';

app.whenReady().then(() => {
  Menu.setApplicationMenu(menu);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
