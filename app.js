/* ============================================================
   玄枢 · 交互层
   ============================================================ */
'use strict';

const $  = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

/* ---------------- 基础工具 ---------------- */
function randInt(n) {
  if (window.crypto && crypto.getRandomValues && n > 0) {
    const buf = new Uint32Array(1);
    const lim = Math.floor(4294967296 / n) * n;
    let x;
    do { crypto.getRandomValues(buf); x = buf[0]; } while (x >= lim);
    return x % n;
  }
  return Math.floor(Math.random() * n);
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const pad2 = n => String(n).padStart(2, '0');
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 忽略 */ } }
function fmtDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/* ---------------- 音效 ---------------- */
let audioCtx = null;
function ac() {
  if (!audioCtx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    audioCtx = new C();
  }
  return audioCtx;
}
function tone(freq, dur = 0.15, type = 'sine', vol = 0.045, delay = 0) {
  if (!S.sound) return;
  try {
    const c = ac(); if (!c) return;
    const t0 = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.06);
  } catch (e) { /* 静默失败 */ }
}
function sfxFlip() { tone(784, 0.55, 'sine', 0.05); tone(1174, 0.6, 'sine', 0.028, 0.07); tone(1568, 0.7, 'sine', 0.018, 0.15); }
function sfxDeal() { tone(320, 0.08, 'triangle', 0.03); }
function sfxCoin() { tone(1180, 0.06, 'square', 0.022); tone(760, 0.09, 'triangle', 0.02, 0.05); }
function sfxKnock() { tone(196, 0.16, 'sine', 0.05); tone(392, 0.12, 'sine', 0.025, 0.05); }

/* ---------------- 全局状态 ---------------- */
const S = {
  view: 'tarot',
  spread: SPREADS[1],
  drawn: [],
  phase: 'idle',
  reversed: true,
  sound: lsGet('xuanshu_sound') !== '0',
  saved: false,
  records: []
};

/* ---------------- 星空 ---------------- */
function makeStars() {
  let s = '<svg width="100%" height="100%" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">';
  for (let i = 0; i < 170; i++) {
    const x = Math.random() * 1600, y = Math.random() * 900;
    const r = (Math.random() * 1.2 + 0.3).toFixed(2);
    const o = (Math.random() * 0.55 + 0.15).toFixed(2);
    const d = (Math.random() * 7 + 3).toFixed(1);
    const b = (Math.random() * 7).toFixed(1);
    const lo = (o * 0.2).toFixed(2);
    s += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r}" fill="#fff" opacity="${o}">`
      + `<animate attributeName="opacity" values="${o};${lo};${o}" dur="${d}s" begin="${b}s" repeatCount="indefinite"/></circle>`;
  }
  s += '</svg>';
  $('#stars').innerHTML = s;
}

/* ============================================================
   牌面绘制
   ============================================================ */
const PIPS = (() => {
  const g = (cols, rows, x0 = 82, x1 = 158, y0 = 122, y1 = 280) => {
    const out = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        out.push([
          cols === 1 ? 120 : x0 + (x1 - x0) * c / (cols - 1),
          rows === 1 ? 196 : y0 + (y1 - y0) * r / (rows - 1)
        ]);
      }
    }
    return out;
  };
  return {
    1: [[120, 196]],
    2: g(1, 2, 0, 0, 150, 248),
    3: g(1, 3, 0, 0, 128, 266),
    4: [[80, 150], [160, 150], [80, 246], [160, 246]],
    5: [[80, 144], [160, 144], [120, 198], [80, 252], [160, 252]],
    6: g(2, 3),
    7: [[120, 118], ...g(2, 3, 82, 158, 150, 276)],
    8: g(2, 4),
    9: g(3, 3),
    10: g(2, 5, 82, 158, 118, 282)
  };
})();

/* 花色图形（内联绘制，24×24 坐标系） */
const SUIT_GLYPH = {
  wands: (c, lw) => `<g fill="none" stroke="${c}" stroke-linecap="round" stroke-width="${2.1 * lw}">
      <path d="M6.2 21.6L16 7.9"/>
      <path d="M16 7.9c-2.9-.2-4.6-2-4.4-4.6 2.7-.2 4.6 1.8 4.4 4.6z" fill="${c}" stroke="none"/>
      <path d="M16 7.9c2.3-1.7 4.6-1.5 5.9.2-1.4 2-3.9 2.3-5.9-.2z" fill="${c}" stroke="none"/>
    </g>`,
  cups: (c, lw) => `<g fill="none" stroke="${c}" stroke-linecap="round" stroke-width="${1.7 * lw}">
      <path d="M5 3.4h14v4.4a7 7 0 0 1-14 0V3.4z"/>
      <path d="M12 14.9v5.3M8.2 21h7.6"/>
    </g>`,
  swords: (c, lw) => `<g fill="${c}" stroke="${c}" stroke-linecap="round" stroke-width="${1.7 * lw}">
      <path d="M12 1.6l2.1 12.2h-4.2L12 1.6z" stroke="none"/>
      <path d="M6 13.8h12" fill="none"/>
      <path d="M12 13.8V20" fill="none"/>
      <path d="M9.4 21h5.2" fill="none"/>
    </g>`,
  pentacles: (c, lw) => `<g fill="none" stroke="${c}" stroke-width="${1.3 * lw}">
      <circle cx="12" cy="12" r="9.4"/>
      <path d="M12 3.6l2.55 6.1 6.5.5-4.95 4.25 1.55 6.3L12 17.2l-5.65 3.55 1.55-6.3L2.95 10.2l6.5-.5z"
            stroke-width="${1.05 * lw}" stroke-linejoin="round"/>
    </g>`
};

function glyph(suit, x, y, size, c) {
  const s = size / 24;
  const lw = 1 / Math.pow(s, 0.55);
  return `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${s.toFixed(3)})">${SUIT_GLYPH[suit](c, lw)}</g>`;
}

function faceSVG(card, rev) {
  const major = card.arcana === 'major';
  const accent = major ? '#8c6d3f' : SUITS[card.suit].color;
  let art = '', top = '';

  if (major) {
    top = `<text x="120" y="53" text-anchor="middle" font-family="Georgia,serif" font-size="14" letter-spacing="3" fill="#8c6d3f" opacity=".9">${ROMAN[card.num]}</text>`;
    art = `<circle cx="120" cy="196" r="56" fill="none" stroke="${accent}" stroke-width="1" opacity=".5"/>
      <circle cx="120" cy="196" r="46" fill="none" stroke="${accent}" stroke-width=".6" opacity=".32" stroke-dasharray="2 4"/>
      <text x="120" y="196" dy=".35em" text-anchor="middle" font-size="62" fill="${accent}" font-family="Georgia,'Segoe UI Symbol',serif">${card.sym}</text>`;
  } else {
    top = `<g opacity=".62">${glyph(card.suit, 109, 24, 22, accent)}</g>`;
    if (card.rank === 0) {
      art = glyph(card.suit, 86, 146, 68, accent);
    } else if (card.rank < 10) {
      const cnt = card.rank + 1;
      const sz = cnt <= 6 ? 32 : cnt <= 8 ? 27 : 24;
      art = PIPS[cnt].map(([x, y]) => glyph(card.suit, x - sz / 2, y - sz / 2, sz, accent)).join('');
    } else {
      const gl = ['⚜', '♞', '♛', '♚'][card.rank - 10];
      art = `<circle cx="120" cy="182" r="50" fill="none" stroke="${accent}" stroke-width="1" opacity=".34"/>
        <text x="120" y="182" dy=".35em" text-anchor="middle" font-size="56" fill="${accent}" font-family="Georgia,'Segoe UI Symbol',serif">${gl}</text>
        <path d="M96 240h48" stroke="${accent}" stroke-width=".6" opacity=".35"/>
        <g opacity=".8">${glyph(card.suit, 105, 252, 30, accent)}</g>`;
    }
  }

  const artG = `<g${rev ? ' transform="rotate(180 120 196)"' : ''}>${art}</g>`;

  return `<svg viewBox="0 0 240 400" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <defs>
      <linearGradient id="pg" x1="0" y1="0" x2=".35" y2="1">
        <stop offset="0" stop-color="#fbf5e8"/><stop offset=".55" stop-color="#f3e8d3"/><stop offset="1" stop-color="#e5d6ba"/>
      </linearGradient>
    </defs>
    <rect width="240" height="400" fill="url(#pg)"/>
    <rect x="8" y="8" width="224" height="384" fill="none" stroke="${accent}" stroke-width=".9" opacity=".55"/>
    <rect x="13.5" y="13.5" width="213" height="373" fill="none" stroke="${accent}" stroke-width=".5" opacity=".3"/>
    ${top}
    <path d="M94 70h52" stroke="${accent}" stroke-width=".7" opacity=".45"/>
    ${artG}
    <path d="M88 318h64" stroke="${accent}" stroke-width=".7" opacity=".4"/>
    <text x="120" y="344" text-anchor="middle" font-family="'Songti SC','STSong',serif" font-size="25" letter-spacing="1.5" fill="#2b2318">${card.name}</text>
    <text x="120" y="364" text-anchor="middle" font-family="Georgia,serif" font-size="8" letter-spacing="1.2" fill="#8a7448">${card.en.toUpperCase()}</text>
    <text x="120" y="382" text-anchor="middle" font-size="6" letter-spacing="3" fill="#a08a5e">✦ ✦</text>
  </svg>`;
}

function backSVG() {
  return `<svg viewBox="0 0 240 400" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
    <defs>
      <pattern id="lat" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <path d="M0 9h18" stroke="#d9b978" stroke-width=".35" opacity=".16"/>
      </pattern>
    </defs>
    <rect width="240" height="400" fill="#0e1326"/>
    <rect width="240" height="400" fill="url(#lat)"/>
    <rect x="0.5" y="0.5" width="239" height="399" fill="none" stroke="#d9b978" stroke-opacity=".3"/>
    <rect x="9" y="9" width="222" height="382" fill="none" stroke="#d9b978" stroke-width=".9" opacity=".45"/>
    <rect x="15" y="15" width="210" height="370" fill="none" stroke="#d9b978" stroke-width=".45" opacity=".26"/>
    <circle cx="120" cy="200" r="64" fill="none" stroke="#d9b978" stroke-width=".7" opacity=".45"/>
    <circle cx="120" cy="200" r="54" fill="none" stroke="#d9b978" stroke-width=".5" opacity=".3" stroke-dasharray="1 4"/>
    <circle cx="120" cy="200" r="22" fill="none" stroke="#d9b978" stroke-width=".7" opacity=".5"/>
    <path d="M120 148l13 39 39 13-39 13-13 39-13-39-39-13 39-13z" fill="none" stroke="#d9b978" stroke-width=".7" opacity=".34"/>
    <path d="M120 176l8 16 16 8-16 8-8 16-8-16-16-8 16-8z" fill="#d9b978" opacity=".55"/>
    <text x="120" y="252" text-anchor="middle" font-size="8" letter-spacing="4" fill="#d9b978" opacity=".55">XUAN SHU</text>
    ${[[24, 24], [216, 24], [24, 376], [216, 376]].map(([x, y]) =>
      `<circle cx="${x}" cy="${y}" r="3.4" fill="none" stroke="#d9b978" stroke-width=".6" opacity=".4"/>`).join('')}
  </svg>`;
}

function cardHTML(card, rev, extraClass = '') {
  return `<div class="card ${extraClass}">
    <div class="inner">
      <div class="back">${backSVG()}</div>
      <div class="face">${faceSVG(card, rev)}</div>
    </div>
    <div class="glow"></div>
  </div>`;
}

/* ============================================================
   塔罗
   ============================================================ */
function renderSpreadList() {
  $('#spreadList').innerHTML = SPREADS.map(sp => {
    let cells = '';
    for (let r = 1; r <= sp.rows; r++) {
      for (let c = 1; c <= sp.cols; c++) {
        const on = sp.slots.some(s => s.c === c && s.r === r);
        cells += `<i class="${on ? 'on' : ''}"></i>`;
      }
    }
    return `<button class="spread-item${sp.id === S.spread.id ? ' active' : ''}" data-id="${sp.id}">
      <span class="mini" style="grid-template-columns:repeat(${sp.cols},1fr);grid-template-rows:repeat(${sp.rows},1fr)">${cells}</span>
      <span class="spread-meta"><b>${sp.name}</b><small>${sp.count} 张<span class="s-tag"> · ${sp.tag}</span></small></span>
    </button>`;
  }).join('');

  $$('.spread-item').forEach(el => {
    el.addEventListener('click', () => {
      if (S.phase === 'shuffling') return;
      const sp = SPREADS.find(x => x.id === el.dataset.id);
      if (!sp || sp.id === S.spread.id) return;
      S.spread = sp;
      S.drawn = [];
      S.phase = 'idle';
      S.saved = false;
      renderSpreadList();
      buildBoard();
      renderReading();
      updateHint();
      $('#spreadDesc').textContent = sp.desc;
      tone(520, 0.08, 'triangle', 0.02);
    });
  });
}

function buildBoard() {
  const sp = S.spread;
  const board = $('#board');
  board.style.gridTemplateColumns = sp.tmpl || `repeat(${sp.cols},1fr)`;
  board.style.maxWidth = sp.maxw + 'px';
  board.style.minWidth = sp.cols >= 6 ? Math.min(580, sp.cols * 82) + 'px' : '';
  board.innerHTML = sp.slots.map((s, i) => `
    <div class="slot${s.cross ? ' cross' : ''}" data-i="${i}" style="grid-column:${s.c};grid-row:${s.r}">
      <div class="ph"><span class="ph-n">${i + 1}</span><span class="ph-t">${s.name}</span></div>
      ${cardHTML(TAROT[0])}
      <span class="badge-n">${i + 1}</span>
    </div>`).join('');

  $$('#board .slot').forEach(slot => {
    slot.querySelector('.card').addEventListener('click', () => flip(Number(slot.dataset.i)));
  });

  requestAnimationFrame(() => {
    const wrap = $('#boardWrap');
    wrap.classList.toggle('can-scroll', wrap.scrollWidth > wrap.clientWidth + 4);
    updateHint();
  });
}

function startReading() {
  if (S.phase === 'shuffling' || S.phase === 'dealing') return;
  const wrap = $('#boardWrap');
  S.phase = 'shuffling';
  S.saved = false;
  S.drawn = [];
  AI.cancel();
  const aiOut = $('#aiOut');
  if (aiOut) aiOut.innerHTML = '';
  renderReading();
  updateHint();
  buildBoard();
  wrap.classList.add('shuffling');
  $('#startBtn').disabled = true;
  tone(180, 0.3, 'sine', 0.03);

  setTimeout(() => {
    wrap.classList.remove('shuffling');
    dealCards();
  }, 1150);
}

function dealCards() {
  const sp = S.spread;
  const deck = shuffle(TAROT.slice());
  S.drawn = deck.slice(0, sp.count).map(c => ({
    card: c,
    rev: S.reversed && Math.random() < 0.45,
    revealed: false
  }));
  S.phase = 'dealt';
  $('#startBtn').disabled = false;

  const slots = $$('#board .slot');
  slots.forEach((slot, i) => {
    slot.classList.remove('revealed');
    const face = slot.querySelector('.face');
    face.innerHTML = faceSVG(S.drawn[i].card, S.drawn[i].rev);
    const card = slot.querySelector('.card');
    card.style.animationDelay = (i * 85) + 'ms';
    card.style.animation = 'none';
    void card.offsetWidth;
    card.style.animation = '';
    slot.classList.add('dealt');
    setTimeout(() => sfxDeal(), i * 85);
  });
  $('#board').classList.add('dealing');
  setTimeout(() => {
    $('#board').classList.remove('dealing');
    slots.forEach(sl => { const c = sl.querySelector('.card'); c.style.animationDelay = ''; });
  }, sp.count * 85 + 800);

  renderReading();
  updateHint();
  if (window.innerWidth < 1080) {
    setTimeout(() => $('#boardWrap').scrollIntoView({ behavior: 'smooth', block: 'center' }), 220);
  }
}

function flip(i) {
  const d = S.drawn[i];
  if (!d || d.revealed || S.phase !== 'dealt') return;
  d.revealed = true;
  const slot = $$('#board .slot')[i];
  if (slot) {
    slot.classList.add('revealed');
    if (d.rev) slot.insertAdjacentHTML('beforeend', '<span class="rev-badge">逆位</span>');
  }
  sfxFlip();
  renderReading();
  updateHint();
  if (S.drawn.every(x => x.revealed)) {
    S.phase = 'done';
    updateHint();
    if (!S.saved) { S.saved = true; saveRecord(); }
    renderReading();
  }
}

function revealAll() {
  const pending = S.drawn.map((d, i) => i).filter(i => !S.drawn[i].revealed);
  pending.forEach((idx, k) => setTimeout(() => flip(idx), k * 190));
}

function resetReading() {
  if (S.phase === 'shuffling') return;
  S.drawn = [];
  S.phase = 'idle';
  S.saved = false;
  AI.cancel();
  const aiOut = $('#aiOut');
  if (aiOut) aiOut.innerHTML = '';
  buildBoard();
  renderReading();
  updateHint();
}

function updateHint() {
  const hint = $('#hint');
  if (S.phase === 'idle') hint.innerHTML = '在左侧选择牌阵、写下问题，然后开始。';
  else if (S.phase === 'shuffling') hint.innerHTML = '洗牌中，请在心里默念你的问题…';
  else if (S.phase === 'dealt') {
    const left = S.drawn.filter(d => !d.revealed).length;
    const scrollable = $('#boardWrap').classList.contains('can-scroll') ? '<br>牌阵超出一屏，可左右滑动查看' : '';
    hint.innerHTML = left > 0 ? `<b>点击牌面</b>翻开 · 还剩 ${left} 张${scrollable}` : '全部翻开';
  } else if (S.phase === 'done') hint.innerHTML = '牌已全部翻开 · 想重新开始，点左侧「重新开始」';
}

function renderReading() {
  const box = $('#reading');
  const sp = S.spread;
  if (!S.drawn.length) {
    box.innerHTML = `<div class="preview">
      <h3>${sp.name}<span class="pv-count">${sp.count} 张</span></h3>
      <p class="desc">${sp.desc}</p>
      <div class="prev-list">
        ${sp.slots.map((sl, i) => `<div class="prev-item"><i>${i + 1}</i><div><b>${sl.name}</b><span>${sl.mean}</span></div></div>`).join('')}
      </div>
    </div>`;
    return;
  }
  const revealed = S.drawn.filter(d => d.revealed).length;
  const all = revealed === S.drawn.length;

  const entries = S.drawn.map((d, i) => {
    const sl = sp.slots[i];
    if (!d.revealed) {
      return `<article class="entry pending">
        <div class="pos"><i>${i + 1}</i>${sl.name}</div>
        <button class="flip-btn" data-flip="${i}">点击翻开 →</button>
      </article>`;
    }
    const c = d.card;
    const mean = d.rev ? c.rev : c.up;
    return `<article class="entry">
      <div class="pos"><i>${i + 1}</i>${sl.name}</div>
      <div class="nm">${c.name}${d.rev ? '<span class="rev">逆位</span>' : ''}</div>
      <div class="kw">${c.kw.join(' · ')}</div>
      <p>${mean}</p>
      <div class="posmean">${sl.mean}</div>
    </article>`;
  }).join('');

  const summary = all ? buildSummary() : '';

  const q = $('#question').value.trim();
  box.innerHTML = `
    <div class="reading-head">
      <h3>解读</h3>
      <span class="chip">${sp.name}</span>
      <span class="chip${all ? ' on' : ''}">已翻 ${revealed}/${S.drawn.length}</span>
    </div>
    ${q ? `<div class="reading-q">问：${esc(q)}</div>` : ''}
    <div class="entries">${entries}</div>
    ${summary}
    <div class="action-row">
      ${!all ? '<button class="btn ghost tiny" id="revealAllBtn">全部翻开</button>' : ''}
      ${all ? '<button class="btn ghost tiny" id="aiReadBtn">✦ AI 深度解读</button>' : ''}
      ${revealed ? '<button class="btn ghost tiny" id="copyBtn">复制解读</button>' : ''}
    </div>`;

  const ra = $('#revealAllBtn');
  if (ra) ra.addEventListener('click', revealAll);
  $$('.flip-btn', box).forEach(btn => btn.addEventListener('click', () => flip(Number(btn.dataset.flip))));
  const cb = $('#copyBtn');
  if (cb) cb.addEventListener('click', copyReading);
  const ab = $('#aiReadBtn');
  if (ab) ab.addEventListener('click', () => aiRun('tarot', tarotAIPayload(), $('#aiOut')));
}

function buildSummary() {
  const sp = S.spread, ds = S.drawn, n = ds.length;
  const majors = ds.filter(d => d.card.arcana === 'major').length;
  const revs = ds.filter(d => d.rev).length;
  const sc = { wands: 0, cups: 0, swords: 0, pentacles: 0 };
  ds.forEach(d => { if (d.card.suit) sc[d.card.suit]++; });
  const top = Object.entries(sc).sort((a, b) => b[1] - a[1])[0];
  const P = [];

  P.push(`本次「${sp.name}」共 ${n} 张牌：大牌 ${majors} 张、逆位 ${revs} 张。`);

  if (majors >= n * 0.4) {
    P.push('大牌比例偏高，说明这件事触及的是人生阶段与内在信念，而不是一时的得失。外部条件会变，真正需要处理的是你的立场与选择。');
  } else if (majors === 0) {
    P.push('牌面全部是小牌，议题集中在日常细节与人际互动上。别急着把它上升到人生高度，先把眼前具体的事一件件处理掉。');
  } else {
    P.push('大牌与小牌比例均衡：既有需要长期面对的主题，也有当下就能着手的具体动作。');
  }

  if (top && top[1] > 0) {
    P.push(`出现最多的是${SUITS[top[0]].name}（${SUITS[top[0]].elem} · ${SUITS[top[0]].key}），能量集中在这条线上，它也是你解读整副牌时最该留意的入口。`);
  }

  if (revs === 0) {
    P.push('全部正位，能量流动顺畅——事情比你以为的更直接，该说的可以直接说，该做的可以直接做。');
  } else if (revs >= n * 0.6) {
    P.push('逆位牌偏多，说明不少能量仍在内部发酵：有些话还没准备好说出口，有些答案需要先向自己要。放慢速度，不必急着下结论。');
  } else {
    P.push('逆位牌占少数，代表局部有卡点，但整体方向仍然通畅。卡住的地方，往往就是最值得诚实面对的地方。');
  }

  const first = ds[0], last = ds[ds.length - 1];
  P.push(`起点是《${first.card.name}》${first.rev ? '（逆位）' : ''}，终点是《${last.card.name}》${last.rev ? '（逆位）' : ''}——从「${first.card.kw[0]}」走向「${last.card.kw[0]}」，这就是这次牌阵讲的故事线。`);

  let advice = '';
  if (majors === n && n > 1) advice = '这件事的关键不在技巧，而在你想成为什么样的人。先回答这个问题，其他的会自己排好队。';
  else if (top && top[1] >= Math.max(2, n * 0.35)) {
    advice = {
      wands: '把想法变成一个具体的动作，就在这周之内。火元素的牌不喜欢停在讨论里。',
      cups: '先处理情绪与关系，事实可以往后放一放。水元素的牌提醒你：感受也是信息。',
      swords: '需要一次坦白的沟通，或一个明确到不能再明确的决定。风元素的牌最怕含糊。',
      pentacles: '回到具体的钱、时间与身体。把计划拆成可执行的步骤，土元素的牌只认落地。'
    }[top[0]];
  } else {
    advice = '牌面没有给出单一的答案，因为它想让你先看清全貌。挑出最让你在意的那一张，它就是此刻的钥匙。';
  }
  if (revs >= n * 0.6) advice += '另外，允许自己慢一点——未完成的部分，本来就需要时间。';
  P.push('【建议】' + advice);

  return `<div class="summary">
    <h4>综合解读</h4>
    ${P.map(t => `<p>${t}</p>`).join('')}
    <span class="sig">—— 牌已说完，决定权在你</span>
  </div>`;
}

function readingText() {
  const sp = S.spread, ds = S.drawn;
  const lines = [`【玄枢 · ${sp.name}】`, `时间：${fmtDate(Date.now())}`];
  const q = $('#question').value.trim();
  if (q) lines.push(`问题：${q}`);
  lines.push('');
  ds.forEach((d, i) => {
    const c = d.card;
    lines.push(`${i + 1}. ${sp.slots[i].name} —— ${c.name}${d.rev ? '（逆位）' : '（正位）'}`);
    lines.push(`   ${d.rev ? c.rev : c.up}`);
  });
  if (ds.every(d => d.revealed)) {
    const tmp = document.createElement('div');
    tmp.innerHTML = buildSummary();
    lines.push('');
    lines.push('【综合解读】');
    $$('p', tmp).forEach(p => lines.push(p.textContent));
  }
  lines.push('');
  lines.push('—— 玄枢 · 供自我觉察参考');
  return lines.join('\n');
}

function copyReading() {
  const txt = readingText();
  const done = () => { const b = $('#copyBtn'); if (b) { b.textContent = '已复制 ✓'; setTimeout(() => b.textContent = '复制解读', 1600); } };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(done).catch(() => fallbackCopy(txt, done));
  } else fallbackCopy(txt, done);
}
function copyPlain(txt, btn, label) {
  const done = () => {
    if (!btn) return;
    btn.textContent = '已复制 ✓';
    setTimeout(() => { btn.textContent = label; }, 1600);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(done).catch(() => fallbackCopy(txt, done));
  } else fallbackCopy(txt, done);
}

function fallbackCopy(txt, cb) {
  const ta = document.createElement('textarea');
  ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); cb(); } catch (e) { }
  document.body.removeChild(ta);
}

/* ---------------- 今日之牌 ---------------- */
function initDaily() {
  const d = new Date();
  const key = d.getFullYear() * 372 + (d.getMonth() + 1) * 31 + d.getDate();
  let h = key;
  h = (h ^ 61) ^ (h >>> 16);
  h = h + (h << 3); h = h ^ (h >>> 4); h = Math.imul(h, 0x27d4eb2d); h = h ^ (h >>> 15);
  const idx = Math.abs(h) % TAROT.length;
  const card = TAROT[idx];
  const rev = Math.abs(h >> 5) % 100 < 35;
  const box = $('#dailyCard');
  box.innerHTML = `<div class="card"><div class="inner">
      <div class="back">${backSVG()}</div>
      <div class="face">${faceSVG(card, rev)}</div>
    </div></div>`;
  const el = $('.card', box);
  el.addEventListener('click', () => {
    const first = !el.classList.contains('flipped');
    if (first) {
      el.classList.add('flipped');
      sfxFlip();
      $('#dailyTip').textContent = `${card.name}${rev ? ' · 逆位' : ' · 正位'} — ${card.kw.join(' / ')}`;
    }
    openModal(`<div class="md-grid">
      <div class="md-card">${cardHTML(card, rev, 'face-up')}</div>
      <div>
        <div class="md-name">${card.name}</div>
        <div class="md-en">${card.en.toUpperCase()} · 今日之牌</div>
        <div class="md-kw">${card.kw.map(k => `<span class="chip">${k}</span>`).join('')}</div>
        <div class="md-sec"><h5>${rev ? '逆位提示' : '正位提示'}</h5><p>${rev ? card.rev : card.up}</p></div>
        <div class="md-sec"><h5>另一面</h5><p>${rev ? card.up : card.rev}</p></div>
      </div>
    </div>`);
  });
}

/* ============================================================
   牌义库
   ============================================================ */
let libFilter = 'all', libQuery = '';

function renderLibrary() {
  const list = TAROT.filter(c => {
    if (libFilter === 'major' && c.arcana !== 'major') return false;
    if (libFilter !== 'all' && libFilter !== 'major' && c.suit !== libFilter) return false;
    if (libQuery && !(c.name.includes(libQuery) || c.en.toLowerCase().includes(libQuery.toLowerCase()))) return false;
    return true;
  });
  $('#libGrid').innerHTML = list.map(c => `
    <div class="lib-item" data-id="${c.id}">
      ${cardHTML(c, false, 'face-up')}
      <div class="cap">${c.name}</div>
    </div>`).join('');
  $$('.lib-item').forEach(el => {
    el.addEventListener('click', () => openCardModal(TAROT.find(c => c.id === el.dataset.id)));
  });
}

function openCardModal(card) {
  const isMajor = card.arcana === 'major';
  const meta = isMajor
    ? `大阿尔卡纳 · 第 ${card.num} 号`
    : `${SUITS[card.suit].name}（${SUITS[card.suit].elem}）· ${RANK_EN[card.rank]}`;
  openModal(`<div class="md-grid">
    <div class="md-card">${cardHTML(card, false, 'face-up')}</div>
    <div>
      <div class="md-name">${card.name}</div>
      <div class="md-en">${card.en.toUpperCase()}</div>
      <div class="md-kw">${card.kw.map(k => `<span class="chip">${k}</span>`).join('')}</div>
      <div class="md-sec"><h5>牌性</h5><p>${meta}${isMajor ? '' : ' · ' + SUITS[card.suit].key}</p></div>
      <div class="md-sec"><h5>正位</h5><p>${card.up}</p></div>
      <div class="md-sec rev"><h5>逆位</h5><p>${card.rev}</p></div>
    </div>
  </div>`);
}

/* ============================================================
   易经
   ============================================================ */
const I = { lines: [], busy: false, mode: 'coin', question: '' };
const TRI_KEY = { 7: 0, 6: 1, 5: 2, 4: 3, 3: 4, 2: 5, 1: 6, 0: 7 };

function triIndex(bits) { return TRI_KEY[bits[0] * 4 + bits[1] * 2 + bits[2]]; }
function hexNo(bits) {
  const lo = triIndex(bits.slice(0, 3));
  const up = triIndex(bits.slice(3, 6));
  return HEX_TABLE[lo][up];
}
function hexNature(up, lo) {
  if (up === lo) return `${TRIGRAMS[up].name}为${TRIGRAMS[up].nature}`;
  return TRIGRAMS[up].nature + TRIGRAMS[lo].nature;
}

function lineHTML(yang, moving, marker, dim) {
  return `<div class="hline ${yang ? 'yang' : 'yin'}${moving && !dim ? ' moving' : ''}${dim ? ' dim' : ''}">
    <span class="bar"></span>${yang ? '' : '<span class="bar"></span>'}
    ${marker ? `<span class="mk">${marker}</span>` : ''}
  </div>`;
}

function renderTossProgress() {
  const n = I.lines.length;
  if (n === 0) {
    $('#hexEmpty').style.display = '';
    $('#hexResult').innerHTML = '';
    I.last = null;
    AI.cancel();
    const hx = $('#hexAI');
    if (hx) hx.innerHTML = '';
    return;
  }
  $('#hexEmpty').style.display = 'none';
  let linesHTML = '';
  for (let i = 0; i < 6; i++) {
    if (i < n) {
      const v = I.lines[i];
      const yang = (v === 7 || v === 9) ? 1 : 0;
      const mk = v === 9 ? '○' : v === 6 ? '×' : '';
      linesHTML += lineHTML(yang, v === 9 || v === 6, mk, false);
    } else {
      linesHTML += `<div class="hline dim" style="justify-content:center"><span class="bar" style="width:100%;background:rgba(255,255,255,.07)"></span></div>`;
    }
  }
  $('#hexResult').innerHTML = `<div class="hex-wrap">
    <div class="hex-col">
      <div class="hex-label">起 卦 中 · ${n} / 6</div>
      <div class="hex-lines">${linesHTML}</div>
      <div class="hex-sub">自下而上，初爻在最下</div>
    </div>
  </div>`;
}

function updateTossUI() {
  const n = I.lines.length;
  $('#tossStatus').innerHTML = n >= 6 ? '六爻已成 · <b>卦象已出</b>' : `第 <b>${n + 1}</b> 爻 · 共 6 爻`;
  $('#tossBtn').textContent = n >= 6 ? '六爻已足' : '摇 卦';
  $('#tossBtn').disabled = n >= 6 || I.busy;
}

function toss() {
  if (I.busy || I.lines.length >= 6) return;
  I.busy = true;
  $('#tossBtn').disabled = true;
  const res = [0, 1, 2].map(() => (randInt(2) === 0 ? 2 : 3));
  const coins = $$('#coins .coin');
  coins.forEach(c => {
    c.classList.remove('flipping');
    void c.offsetWidth;
    c.classList.add('flipping');
  });
  sfxCoin();
  const tick = setInterval(() => {
    coins.forEach(c => { c.textContent = randInt(2) ? '字' : '背'; });
  }, 85);

  setTimeout(() => {
    clearInterval(tick);
    coins.forEach((c, i) => {
      c.textContent = res[i] === 2 ? '字' : '背';
      c.classList.toggle('face-back', res[i] === 3);
    });
    const sum = res.reduce((a, b) => a + b, 0);
    I.lines.push(sum);
    I.busy = false;
    renderTossProgress();
    updateTossUI();
    if (I.lines.length === 6) {
      setTimeout(() => {
        showHexFromLines(I.lines);
        $('#tossStatus').innerHTML = '六爻已成 · <b>卦象已出</b>';
        tone(523, 0.5, 'sine', 0.04); tone(784, 0.6, 'sine', 0.03, 0.1);
      }, 320);
    }
  }, 720);
}

function showHexFromLines(lines) {
  const bits = lines.map(v => (v === 7 || v === 9) ? 1 : 0);
  const moving = lines.map(v => v === 6 || v === 9);
  const markers = lines.map(v => v === 9 ? '○' : v === 6 ? '×' : '');
  renderHexResult(bits, moving, markers);
}

function renderHexResult(bits, moving, markers) {
  const no = hexNo(bits);
  const h = HEXAGRAMS[no];
  const lo = triIndex(bits.slice(0, 3));
  const up = triIndex(bits.slice(3, 6));
  const hasChange = moving.some(Boolean);
  let cbits = null, cno = null;
  if (hasChange) {
    cbits = bits.map((b, i) => moving[i] ? 1 - b : b);
    cno = hexNo(cbits);
  }
  const cLo = cbits ? triIndex(cbits.slice(0, 3)) : null;
  const cUp = cbits ? triIndex(cbits.slice(3, 6)) : null;

  const mainLines = bits.map((b, i) => lineHTML(b, moving[i], markers ? markers[i] : '', false)).join('');
  const changedLines = cbits ? cbits.map((b, i) => lineHTML(b, false, '', false)).join('') : '';

  const mvList = moving.map((m, i) => m ? i + 1 : 0).filter(Boolean);
  const yaoName = i => {
    const num = i === 0 ? '初' : i === 5 ? '上' : ['', '二', '三', '四', '五', ''][i];
    return i === 0 || i === 5 ? num + (bits[i] ? '九' : '六') : (bits[i] ? '九' : '六') + num;
  };

  I.last = {
    payload: {
      q: ($('#ichingQ') && $('#ichingQ').value.trim()) || '',
      mode: I.mode === 'num' ? '梅花易数 · 数字起卦' : '六爻金钱卦',
      main: `第 ${no} 卦 ${h.name}（上${TRIGRAMS[up].name}下${TRIGRAMS[lo].name}，${hexNature(up, lo)}）— ${h.kw}`,
      read: h.read,
      moving: mvList.length ? mvList.map(i => yaoName(i - 1)).join('、') : '六爻皆静，无动爻',
      changed: cbits ? `第 ${cno} 卦 ${HEXAGRAMS[cno].name}（${HEXAGRAMS[cno].kw}）` : '无变卦'
    }
  };

  $('#hexEmpty').style.display = 'none';
  $('#hexResult').innerHTML = `
    <div class="hex-wrap">
      <div class="hex-col">
        <div class="hex-label">本 卦</div>
        <div class="hex-lines">${mainLines}</div>
        <div class="hex-name">${h.name}</div>
        <div class="hex-sub">第 ${no} 卦 · 上${TRIGRAMS[up].name} 下${TRIGRAMS[lo].name} · ${hexNature(up, lo)}</div>
      </div>
      ${cbits ? `<div class="hex-col">
        <div class="hex-label">变 卦</div>
        <div class="hex-lines">${changedLines}</div>
        <div class="hex-name">${HEXAGRAMS[cno].name}</div>
        <div class="hex-sub">第 ${cno} 卦 · 上${TRIGRAMS[cUp].name} 下${TRIGRAMS[cLo].name} · ${hexNature(cUp, cLo)}</div>
      </div>` : ''}
    </div>
    <div class="hex-read">
      <h4>${h.name} · 卦象解读</h4>
      <div class="kw">${h.kw}</div>
      <p>${h.read}</p>
      ${cbits ? `<h4 style="margin-top:22px">${HEXAGRAMS[cno].name} · 之卦</h4>
        <div class="kw">${HEXAGRAMS[cno].kw}</div>
        <p>${HEXAGRAMS[cno].read}</p>` : ''}
    </div>
    <p class="hex-tip">
      ${mvList.length
        ? `动爻：${mvList.map(i => yaoName(i - 1)).join('、')}。本卦描述此刻的处境，之卦（${HEXAGRAMS[cno].name}）描述它正在变成的样子——变化的方向比结果本身更值得留意。`
        : '六爻皆静，没有动爻。此卦呈现的是稳定的格局，短期内不会有大变动，宜守正待时。'}
    </p>`;

  mountHexAI();
}

/* 数字起卦 */
function castNumbers(a, b) {
  a = Math.abs(parseInt(a, 10)); b = Math.abs(parseInt(b, 10));
  if (!a || Number.isNaN(a)) a = randInt(99) + 1;
  if (!b || Number.isNaN(b)) b = randInt(99) + 1;
  const upIdx = ((a - 1) % 8 + 8) % 8;
  const loIdx = ((b - 1) % 8 + 8) % 8;
  const mv = ((a + b - 1) % 6 + 6) % 6;

  const bits = [...TRIGRAMS[loIdx].bits, ...TRIGRAMS[upIdx].bits];
  const moving = [false, false, false, false, false, false];
  moving[mv] = true;
  const markers = ['', '', '', '', '', ''];
  markers[mv] = bits[mv] ? '○' : '×';
  renderHexResult(bits, moving, markers);

  const no = hexNo(bits);
  const cbits = bits.map((x, i) => moving[i] ? 1 - x : x);
  const cno = hexNo(cbits);
  $('#hexResult').insertAdjacentHTML('beforeend',
    `<p class="hex-tip">起卦数：天 ${a} · 地 ${b} ｜ 上卦 ${TRIGRAMS[upIdx].name}（${TRIGRAMS[upIdx].nature}）· 下卦 ${TRIGRAMS[loIdx].name}（${TRIGRAMS[loIdx].nature}）· 动爻第 ${mv + 1} 爻 ｜ 本卦第 ${no} 卦，之卦第 ${cno} 卦。</p>`);
  tone(660, 0.4, 'sine', 0.035); tone(990, 0.5, 'sine', 0.02, 0.09);
}

/* ============================================================
   灵签
   ============================================================ */
const L = { busy: false, history: [] };

function drawLot() {
  if (L.busy) return;
  L.busy = true;
  const tube = $('#tube');
  tube.classList.add('shaking');
  sfxKnock();
  $('#lotBtn').disabled = true;
  setTimeout(() => {
    tube.classList.remove('shaking');
    L.busy = false;
    $('#lotBtn').disabled = false;
    const i = randInt(LOTS.length);
    L.history.push(i);
    renderSlip(i);
    renderLotList(i);
    tone(740, 0.5, 'sine', 0.045); tone(1108, 0.6, 'sine', 0.025, 0.1);
  }, 820);
}

function renderSlip(i) {
  const lot = LOTS[i];
  const gold = ['上上', '上吉'].includes(lot.lv);
  const bad = ['下平', '下下'].includes(lot.lv);
  const color = gold ? '#8a6a20' : bad ? '#8b3a2f' : '#5c5340';
  $('#lotStage').innerHTML = `<div class="slip">
    <span class="lv" style="color:${color};border-color:${color}66">${lot.lv}</span>
    <div class="no">第 ${i + 1} 签 · 共 ${LOTS.length} 签</div>
    <div class="poem">${lot.poem.map(line => `<p>${line}</p>`).join('')}</div>
    <div class="divider"></div>
    <div class="jie"><b>解曰</b><span>${lot.read}</span></div>
  </div>`;

  mountLotAI(i);
}

function renderLotList(hit) {
  $('#lotList').innerHTML = LOTS.map((l, i) =>
    `<span class="lot-dot${i === hit ? ' hit' : ''}">${i + 1}</span>`).join('');
}

/* ============================================================
   记录 / 弹窗
   ============================================================ */
const REC_KEY = 'xuanshu_records_v1';

function loadRecords() {
  try { S.records = JSON.parse(localStorage.getItem(REC_KEY) || '[]'); } catch (e) { S.records = []; }
}
function saveRecord() {
  const rec = {
    ts: Date.now(),
    spread: S.spread.name,
    q: $('#question').value.trim(),
    cards: S.drawn.map((d, i) => ({ p: S.spread.slots[i].name, n: d.card.name, r: d.rev }))
  };
  S.records.unshift(rec);
  S.records = S.records.slice(0, 40);
  try { localStorage.setItem(REC_KEY, JSON.stringify(S.records)); } catch (e) { }
}

function openRecords() {
  if (!S.records.length) {
    openModal('<h3 style="font-family:var(--kai);color:var(--gold-2);letter-spacing:.1em;margin-bottom:10px">占卜记录</h3><p style="color:var(--muted);font-size:13.5px">还没有记录。完成一次牌阵后会自动存档。</p>');
    return;
  }
  const html = S.records.map(r => `<div class="rec">
      <div class="t"><span>${fmtDate(r.ts)}</span><span>${r.spread}</span></div>
      ${r.q ? `<div class="q">${esc(r.q)}</div>` : ''}
      <div class="c">${r.cards.map(c => `${c.p}：${c.n}${c.r ? '(逆)' : ''}`).join(' ｜ ')}</div>
    </div>`).join('');
  openModal(`<h3 style="font-family:var(--kai);color:var(--gold-2);letter-spacing:.1em;margin-bottom:14px">占卜记录</h3>
    <div class="records">${html}</div>
    <div class="action-row"><button class="btn ghost tiny" id="clearRec">清空记录</button></div>`);
  $('#clearRec').addEventListener('click', () => {
    if (!confirm('确定清空所有占卜记录？此操作不可撤销。')) return;
    S.records = [];
    try { localStorage.removeItem(REC_KEY); } catch (e) { }
    closeModal();
  });
}

function openModal(html) {
  $('#modalBody').innerHTML = html;
  $('#modal').classList.add('open');
}
function closeModal() { $('#modal').classList.remove('open'); }


/* ============================================================
   AI 解读（用户自备大模型接口）
   ============================================================ */
const AI_STORE = 'xuanshu_ai_v1';

const AI_PRESETS = {
  deepseek: { label: 'DeepSeek（推荐）', base: 'https://api.deepseek.com/chat/completions', model: 'deepseek-flash' },
  ollama: { label: '本地 Ollama（离线可用）', base: 'http://localhost:11434/v1/chat/completions', model: 'qwen2.5:7b' },
  custom: { label: '自定义（任意 OpenAI 兼容接口）', base: '', model: '' }
};

const AI = {
  cfg: null,
  seq: 0,
  last: null,
  load() {
    try { this.cfg = JSON.parse(lsGet(AI_STORE) || 'null'); } catch (e) { this.cfg = null; }
    const btn = $('#aiBtn');
    if (btn) btn.classList.toggle('on', this.ready());
    return this.cfg;
  },
  save(cfg) {
    this.cfg = cfg;
    lsSet(AI_STORE, JSON.stringify(cfg));
    const btn = $('#aiBtn');
    if (btn) btn.classList.toggle('on', this.ready());
  },
  ready() {
    const c = this.cfg;
    if (!c || !c.base || !c.model) return false;
    if (c.key) return true;
    return /localhost|127\.0\.0\.1|\[::1\]/i.test(c.base);
  },
  cancel() { this.seq++; }
};

/* ---- 请求 ---- */
async function aiChat(messages, cfg) {
  const c = cfg || AI.cfg;
  if (!c) throw new Error('尚未配置接口');
  const body = { model: c.model, messages, temperature: 0.85, max_tokens: 1600, stream: false };

  // 桌面版：走主进程，绕开浏览器跨域限制
  if (window.xuanshuAI && typeof window.xuanshuAI.chat === 'function') {
    const r = await window.xuanshuAI.chat({ url: c.base, key: c.key || '', body });
    if (!r || !r.ok) throw new Error((r && r.error) || '请求失败');
    return r.text;
  }

  let res;
  try {
    res = await fetch(c.base, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' },
        c.key ? { Authorization: 'Bearer ' + c.key } : {}),
      body: JSON.stringify(body)
    });
  } catch (e) {
    const mixed = typeof location !== 'undefined' && location.protocol === 'https:'
      && String(c.base).toLowerCase().indexOf('http://') === 0;
    throw new Error(mixed
      ? '连不上这个 http 接口。https 页面访问 http:// 时，部分浏览器会按混合内容拦截。若是本地 Ollama，请确认已允许跨域；否则改用 https 接口或 Cloudflare Worker 代理。'
      : '无法连接接口：可能被跨域（CORS）拦截，或地址填错。DeepSeek / Kimi / 通义 支持浏览器直连；智谱等服务商请用 proxy/cloudflare-worker.js 转发。');
  }
  if (!res.ok) {
    let msg = '';
    try { msg = (await res.text()).slice(0, 200); } catch (e) { }
    if (res.status === 401 || res.status === 403) throw new Error('密钥无效或没有权限（HTTP ' + res.status + '）');
    if (res.status === 429) throw new Error('请求过于频繁，或账户额度不足（HTTP 429）');
    if (res.status === 404) throw new Error('接口地址不存在（HTTP 404），请检查是否填到 /chat/completions');
    throw new Error('接口返回 HTTP ' + res.status + (msg ? '：' + msg : ''));
  }
  let j;
  try { j = await res.json(); } catch (e) { throw new Error('返回内容不是合法 JSON'); }
  const t = (((j.choices || [])[0] || {}).message || {}).content || '';
  if (!t) throw new Error('接口没有返回解读内容');
  return t;
}

/* ---- 提示词 ---- */
const AI_SYSTEM = [
  '你是一位有二十年经验的塔罗师与易学顾问，擅长把象征语言翻译成具体、可执行的建议。',
  '写作要求：',
  '1. 说人话，像面对面聊天。不要用「能量场」「宇宙会给你答案」「一切都是最好的安排」这类空话。',
  '2. 不恐吓、不宿命论。任何看似凶的牌，都要给出化解的方向。',
  '3. 不要逐张复述牌义，重点讲牌与牌之间的关系、矛盾与出路。',
  '4. 总长 400-600 字，分三段：第一段一到两句话点明核心；第二段展开分析；第三段给三条可执行建议，每条单独一行，以「·」开头。',
  '5. 纯文本输出，不要 Markdown 标题、加粗、表格、编号列表。',
  '6. 结尾不要写免责声明或多余客套。'
].join('\n');

function buildAIMessages(kind, d) {
  const u = [];
  if (d.q) u.push('【提问】' + d.q);

  if (kind === 'tarot') {
    u.push('【牌阵】' + d.spread + '，共 ' + d.cards.length + ' 张');
    u.push('【牌面】');
    d.cards.forEach((c, i) => {
      u.push((i + 1) + '. ' + c.pos + '：' + c.name + '（' + (c.rev ? '逆' : '正') + '位）— ' + c.kw);
    });
    if (d.stat) u.push('【牌面统计】' + d.stat);
    u.push('');
    u.push('请针对上面的提问与牌面，给出你的解读。');
  } else if (kind === 'hex') {
    u.push('【起卦方式】' + (d.mode || '金钱卦'));
    u.push('【本卦】' + d.main);
    u.push('【卦辞大意】' + d.read);
    u.push('【动爻】' + d.moving);
    u.push('【变卦】' + d.changed);
    u.push('');
    u.push('请结合卦象、动爻与变卦，解读这件事此刻的处境与接下来的走向。');
  } else {
    u.push('【签文】' + d.no);
    u.push('【签诗】' + d.poem);
    u.push('【解曰】' + d.read);
    u.push('');
    u.push('请解这支签：它回应了提问者什么问题，又在提醒什么，接下来可以怎么做。');
  }
  return [
    { role: 'system', content: AI_SYSTEM },
    { role: 'user', content: u.join('\n') }
  ];
}

/* ---- 渲染 ---- */
function aiHeadHTML() {
  const m = AI.cfg && AI.cfg.model ? AI.cfg.model : '';
  return `<div class="ai-head"><span class="ai-mark">✦</span><span class="ai-title">AI 解读</span><span class="ai-sub">${esc(m)}</span></div>`;
}

function aiShell(inner, cls) {
  return `<div class="ai-block ${cls || ''}">${aiHeadHTML()}${inner}</div>`;
}

function aiLoadingHTML(kind) {
  const label = kind === 'hex' ? '正在推演卦象' : kind === 'lot' ? '正在解签' : '正在读牌';
  return `<div class="ai-loading"><i></i><i></i><i></i><span>${label}…</span></div><div class="ai-skel"></div>`;
}

function aiNeedConfigHTML() {
  return `<p class="ai-tip">AI 解读需要先连接一个大模型接口。DeepSeek、通义、Kimi、智谱，或本机的 Ollama，只要是 OpenAI 兼容接口都可以。密钥只保存在这台设备上。</p>
    <button class="btn primary tiny" id="aiCfgBtn">配置 AI 解读</button>`;
}

function aiErrorHTML(msg) {
  return `<div class="ai-err"><b>解读失败</b><br>${esc(msg)}</div>
    <div class="ai-actions">
      <button class="btn ghost tiny ai-retry">重试</button>
      <button class="btn ghost tiny ai-cfg">检查设置</button>
    </div>`;
}

function aiResultHTML(text) {
  const clean = String(text).replace(/\*\*/g, '').replace(/^#{1,4}\s*/gm, '').replace(/`/g, '').trim();
  const body = clean.split(/\n+/).map(l => l.trim()).filter(Boolean).map(line => {
    const isLi = /^[·•\-*]\s*/.test(line) || /^\d+[.、]\s*/.test(line);
    const t = line.replace(/^[·•\-*]\s*/, '');
    return `<p class="${isLi ? 'ai-li' : ''}">${esc(t)}</p>`;
  }).join('');
  const stamp = (AI.cfg && AI.cfg.model ? AI.cfg.model + ' · ' : '') +
    new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  return `<div class="ai-text">${body}</div>
    <div class="ai-actions">
      <button class="btn ghost tiny ai-copy">复制</button>
      <button class="btn ghost tiny ai-retry">重新解读</button>
      <span class="ai-stamp">${esc(stamp)}</span>
    </div>`;
}

function bindAIBlock(host, kind, payload) {
  const retry = $('.ai-retry', host);
  if (retry) retry.addEventListener('click', () => aiRun(kind, payload, host));
  const cfgBtn = $('.ai-cfg', host);
  if (cfgBtn) cfgBtn.addEventListener('click', () => openAISettings(() => aiRun(kind, payload, host)));
  const copy = $('.ai-copy', host);
  if (copy) copy.addEventListener('click', () => {
    const txt = Array.from(host.querySelectorAll('.ai-text p')).map(x => x.textContent).join('\n');
    copyPlain(txt, copy, '复制');
  });
}

async function aiRun(kind, payload, host) {
  if (!host) return;
  AI.last = { kind, payload, host };

  if (!AI.ready()) {
    host.innerHTML = aiShell(aiNeedConfigHTML(), 'need');
    const b = $('#aiCfgBtn', host);
    if (b) b.addEventListener('click', () => openAISettings(() => aiRun(kind, payload, host)));
    return;
  }

  const id = ++AI.seq;
  host.innerHTML = aiShell(aiLoadingHTML(kind), 'loading');

  try {
    const text = await aiChat(buildAIMessages(kind, payload));
    if (id !== AI.seq) return;
    host.innerHTML = aiShell(aiResultHTML(text), 'done');
    bindAIBlock(host, kind, payload);
    tone(660, 0.3, 'sine', 0.03);
  } catch (e) {
    if (id !== AI.seq) return;
    host.innerHTML = aiShell(aiErrorHTML(e.message || String(e)), 'err');
    bindAIBlock(host, kind, payload);
  }
}

/* ---- 设置面板 ---- */
function openAISettings(after) {
  const c = AI.cfg || {};
  let preset = c.preset;
  if (!preset) {
    if (/localhost|127\.0\.0\.1/i.test(c.base || '')) preset = 'ollama';
    else if (/deepseek/i.test(c.base || '')) preset = 'deepseek';
    else if (!c.base) preset = 'deepseek';   // 首次配置默认填好 DeepSeek，只需粘一个 Key
    else preset = 'custom';
  }
  const p = AI_PRESETS[preset] || AI_PRESETS.custom;

  openModal(`<h3 class="ai-modal-h">✦ AI 解读设置</h3>
    <p class="ai-modal-p">AI 解读会把你这次的<b>提问与牌面</b>发送到你自己填写的接口。密钥只保存在本机（localStorage），不经过任何中间服务器，也不会出现在占卜记录里。</p>
    <div class="field"><label>服务商</label>
      <select id="aiPreset">
        ${Object.keys(AI_PRESETS).map(k => `<option value="${k}"${k === preset ? ' selected' : ''}>${AI_PRESETS[k].label}</option>`).join('')}
      </select>
    </div>
    <div class="field"><label>接口地址</label>
      <input type="text" id="aiBase" value="${esc(c.base || p.base)}" placeholder="https://api.deepseek.com/chat/completions">
      <div class="ai-warn" id="aiBaseWarn"></div>
    </div>
    <div class="field"><label>模型</label>
      <input type="text" id="aiModel" value="${esc(c.model || p.model)}" placeholder="deepseek-flash">
    </div>
    <div class="field"><label>API Key</label>
      <input type="password" id="aiKey" value="${esc(c.key || '')}" placeholder="sk-..." autocomplete="off">
    </div>
    <div class="action-row">
      <button class="btn primary tiny" id="aiSave">保存</button>
      <button class="btn ghost tiny" id="aiTest">测试连接</button>
    </div>
    <div id="aiTestOut" class="ai-testout"></div>
    <p class="ai-hint">· 地址要填到 <code>/chat/completions</code> 这一层。<br>
    · DeepSeek / Kimi / 通义 支持浏览器直连；智谱等不支持跨域的服务商，用仓库里的 <code>proxy/cloudflare-worker.js</code> 转发。<br>
    · 本地 Ollama 不需要 Key，示例模型 <code>qwen2.5:7b</code> 需先 <code>ollama pull</code>；但从 https 页面访问 http://localhost 可能被浏览器拦，连不上就用 Worker 代理。<br>
    · 桌面版没有跨域限制，填什么都能连。</p>`);

  const presetSel = $('#aiPreset');
  const baseInput = $('#aiBase');
  const warnBox = $('#aiBaseWarn');
  const refreshWarn = () => {
    const v = baseInput.value.trim();
    const bad = typeof location !== 'undefined' && location.protocol === 'https:' && v.toLowerCase().indexOf('http://') === 0;
    warnBox.textContent = bad ? 'https 页面访问 http:// 有被浏览器拦截的风险（localhost 在部分版本例外）。连不上就换成 https 接口或 Worker 代理。' : '';
    warnBox.classList.toggle('on', bad);
  };
  baseInput.addEventListener('input', refreshWarn);

  presetSel.addEventListener('change', () => {
    const np = AI_PRESETS[presetSel.value];
    baseInput.value = np.base;
    $('#aiModel').value = np.model;
    refreshWarn();
  });
  refreshWarn();

  const readForm = () => ({
    preset: presetSel.value,
    base: $('#aiBase').value.trim(),
    model: $('#aiModel').value.trim(),
    key: $('#aiKey').value.trim()
  });

  $('#aiSave').addEventListener('click', () => {
    const cfg = readForm();
    if (!cfg.base || !cfg.model) {
      $('#aiTestOut').className = 'ai-testout bad';
      $('#aiTestOut').textContent = '接口地址和模型名不能为空。';
      return;
    }
    AI.save(cfg);
    closeModal();
    tone(880, 0.2, 'sine', 0.04);
    if (after) after();
  });

  $('#aiTest').addEventListener('click', async () => {
    const cfg = readForm();
    const out = $('#aiTestOut');
    if (!cfg.base || !cfg.model) { out.className = 'ai-testout bad'; out.textContent = '先填接口地址与模型名。'; return; }
    out.className = 'ai-testout';
    out.textContent = '测试中…';
    const btn = $('#aiTest');
    btn.disabled = true;
    try {
      const t = await aiChat([
        { role: 'system', content: '你是连通性测试助手，只回答被要求的内容。' },
        { role: 'user', content: '只回复四个字：连接正常' }
      ], cfg);
      out.className = 'ai-testout ok';
      out.textContent = '✓ 连接成功，模型回复：' + t.trim().slice(0, 40);
    } catch (e) {
      out.className = 'ai-testout bad';
      out.textContent = '✗ ' + (e.message || e);
    }
    btn.disabled = false;
  });
}

/* ---- 各模块的 AI 入口 ---- */
function tarotAIPayload() {
  const ds = S.drawn, sp = S.spread;
  const major = ds.filter(d => d.card.arcana === 'major').length;
  const rev = ds.filter(d => d.rev).length;
  const sc = { wands: 0, cups: 0, swords: 0, pentacles: 0 };
  ds.forEach(d => { if (d.card.suit) sc[d.card.suit]++; });
  const top = Object.entries(sc).sort((a, b) => b[1] - a[1])[0];
  const stat = `大牌 ${major} 张，逆位 ${rev} 张` + (top && top[1] ? `，${SUITS[top[0]].name}最多（${top[1]} 张）` : '');
  return {
    q: $('#question').value.trim(),
    spread: sp.name,
    stat,
    cards: ds.map((d, i) => ({
      pos: sp.slots[i].name,
      name: d.card.name,
      rev: d.rev,
      kw: d.card.kw.join(' / ')
    }))
  };
}

function mountHexAI() {
  const host = $('#hexAI');
  if (!host || !I.last) return;
  AI.cancel();
  host.innerHTML = `<button class="btn ghost tiny" id="hexAIBtn">✦ 用 AI 解读这一卦</button>`;
  $('#hexAIBtn').addEventListener('click', () => aiRun('hex', I.last.payload, host));
}

function mountLotAI(idx) {
  const host = $('#lotAI');
  if (!host) return;
  const lot = LOTS[idx];
  AI.cancel();
  host.innerHTML = `<button class="btn ghost tiny" id="lotAIBtn">✦ 用 AI 解这支签</button>`;
  $('#lotAIBtn').addEventListener('click', () => aiRun('lot', {
    q: ($('#lotQ') || {}).value ? $('#lotQ').value.trim() : '',
    no: `第 ${idx + 1} 签 · ${lot.lv}（共 ${LOTS.length} 签）`,
    poem: lot.poem.join('，'),
    read: lot.read
  }, host));
}

/* ============================================================
   初始化
   ============================================================ */
function switchView(v) {
  S.view = v;
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === v));
  $$('.view').forEach(el => el.classList.toggle('active', el.id === 'view-' + v));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function bindEvents() {
  $('#tabs').addEventListener('click', e => {
    const t = e.target.closest('.tab');
    if (t) switchView(t.dataset.view);
  });

  const sv = $('#soundBtn');
  sv.classList.toggle('off', !S.sound);
  sv.addEventListener('click', () => {
    S.sound = !S.sound;
    sv.classList.toggle('off', !S.sound);
    lsSet('xuanshu_sound', S.sound ? '1' : '0');
    if (S.sound) tone(880, 0.2, 'sine', 0.04);
  });

  $('#aiBtn').addEventListener('click', () => openAISettings());
  $('#recordBtn').addEventListener('click', openRecords);
  $('#modalClose').addEventListener('click', closeModal);

  $('#startBtn').addEventListener('click', startReading);
  $('#resetBtn').addEventListener('click', resetReading);
  $('#revToggle').addEventListener('change', e => { S.reversed = e.target.checked; });

  // 易经
  $('#ichingSeg').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    $$('#ichingSeg button').forEach(x => x.classList.toggle('active', x === b));
    $$('.mode').forEach(m => m.classList.toggle('active', m.id === 'mode-' + b.dataset.mode));
    I.mode = b.dataset.mode;
  });
  $('#tossBtn').addEventListener('click', toss);
  $('#tossReset').addEventListener('click', () => {
    I.lines = []; I.busy = false;
    $$('#coins .coin').forEach(c => { c.textContent = '乾'; c.classList.remove('face-back'); });
    $('#hexEmpty').style.display = '';
    $('#hexResult').innerHTML = '';
    I.last = null;
    AI.cancel();
    const hx = $('#hexAI');
    if (hx) hx.innerHTML = '';
    $('#tossStatus').innerHTML = '第 <b>1</b> 爻 · 自下而上';
    $('#tossBtn').textContent = '摇 卦';
    $('#tossBtn').disabled = false;
  });
  $('#numBtn').addEventListener('click', () => castNumbers($('#numA').value, $('#numB').value));
  $('#numTime').addEventListener('click', () => {
    const d = new Date();
    const a = d.getFullYear() + d.getMonth() + 1 + d.getDate();
    const b = a + (Math.floor((d.getHours() + 1) / 2) % 12 + 1);
    $('#numA').value = a; $('#numB').value = b;
    castNumbers(a, b);
  });

  // 灵签
  $('#lotBtn').addEventListener('click', drawLot);
  $('#tube').addEventListener('click', drawLot);

  // 牌义库
  $('#libFilters').addEventListener('click', e => {
    const b = e.target.closest('.filter');
    if (!b) return;
    libFilter = b.dataset.f;
    $$('.filter').forEach(x => x.classList.toggle('active', x === b));
    renderLibrary();
  });
  $('#libSearch').addEventListener('input', e => {
    libQuery = e.target.value.trim();
    renderLibrary();
  });

  // 弹窗
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}

function init() {
  makeStars();
  loadRecords();
  AI.load();
  renderSpreadList();
  buildBoard();
  $('#spreadDesc').textContent = S.spread.desc;
  initDaily();
  renderLibrary();
  renderReading();
  renderLotList(-1);
  bindEvents();
  updateHint();
  updateTossUI();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
