// 行星收藏卡：根据行星数据程序化绘制，同一颗行星永远画出同一张（不需要存图片）
import { mulberry32 } from './rng.js';

const clamp = v => Math.max(0, Math.min(1, v));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const css = (c, a = 1) => `rgba(${c.map(v => Math.round(clamp(v) * 255)).join(',')},${a})`;
const SKY = {   // [天顶颜色, 地平线颜色]
  '无': [[0, 0, .01], [.01, .01, .04]], '稀薄': [[.02, .04, .12], [.22, .28, .45]],
  '浓厚': [[.25, .12, .08], [.9, .58, .32]], '有毒': [[.12, .2, .05], [.75, .78, .28]],
  '宜居': [[.08, .25, .6], [.7, .85, .97]]
};
const KIND = { rock: '岩石行星', gas: '气态巨行星', ice: '冰巨星' };
const LIFE_COL = { '微生物': [.5, 1, .7], '植物': [.4, .95, .4], '动物': [1, .75, .4], '文明遗迹': [.6, .9, 1], '漂浮微生物': [.5, 1, .8] };

function rarity(p) {
  const v = p.info.value;
  return v >= 320 ? { name: '传说', col: '#ffb347', n: 4 } : v >= 220 ? { name: '史诗', col: '#c58bff', n: 3 }
    : v >= 120 ? { name: '稀有', col: '#6fc3ff', n: 2 } : { name: '普通', col: '#9aa7bd', n: 1 };
}

// ---------- 场景元素 ----------
function ridge(g, W, SH, base, amp, rnd, fill) {
  const k = [0, 1, 2].map(() => ({ f: .004 + rnd() * .012, a: amp * (.3 + rnd() * .7), ph: rnd() * 6.28 }));
  g.beginPath(); g.moveTo(0, SH);
  for (let x = 0; x <= W; x += 4) {
    let y = base; for (const q of k) y -= Math.abs(Math.sin(x * q.f + q.ph)) * q.a * .6 + Math.sin(x * q.f * 2.3 + q.ph) * q.a * .2;
    g.lineTo(x, y);
  }
  g.lineTo(W, SH); g.closePath(); g.fillStyle = fill; g.fill();
}
function glow(g, x, y, r, col, a = 1) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, css(col, a)); gr.addColorStop(1, css(col, 0)); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
}
function plant(g, x, y, h, rnd, col) {
  g.strokeStyle = css(mix(col, [0, 0, 0], .45)); g.lineWidth = 2 + h / 40;
  const bend = (rnd() - .5) * h * .5;
  g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + bend * .2, y - h * .6, x + bend, y - h); g.stroke();
  glow(g, x + bend, y - h, 12 + h / 6, col, .9); g.fillStyle = css(mix(col, [1, 1, 1], .5)); g.beginPath(); g.arc(x + bend, y - h, 3 + h / 30, 0, 7); g.fill();
  for (let i = 0; i < 3; i++) { const t = .3 + i * .2, s = i % 2 ? 1 : -1;
    g.beginPath(); g.moveTo(x + bend * t * t, y - h * t); g.quadraticCurveTo(x + s * h * .3, y - h * (t + .1), x + s * h * .35, y - h * (t - .05)); g.stroke(); }
}
function animal(g, x, y, s, rnd, col) {
  const dark = css(mix(col, [0, 0, 0], .6)); g.fillStyle = dark; g.strokeStyle = dark; g.lineWidth = s * .08;
  g.beginPath(); g.ellipse(x, y - s * .7, s * .75, s * .38, 0, 0, 7); g.fill();
  const legs = 4 + (rnd() * 3 | 0);
  for (let i = 0; i < legs; i++) { const lx = x - s * .6 + i * (s * 1.2 / (legs - 1));
    g.beginPath(); g.moveTo(lx, y - s * .5); g.lineTo(lx + (rnd() - .5) * s * .3, y - s * .2); g.lineTo(lx + (rnd() - .5) * s * .4, y); g.stroke(); }
  g.beginPath(); g.moveTo(x + s * .6, y - s * .85); g.quadraticCurveTo(x + s * 1, y - s * 1.3, x + s * .9, y - s * 1.6); g.stroke();
  glow(g, x + s * .9, y - s * 1.6, s * .35, col, 1); g.fillStyle = '#fff'; g.beginPath(); g.arc(x + s * .9, y - s * 1.6, s * .06, 0, 7); g.fill();
}
function ruin(g, x, y, s, col) {
  g.fillStyle = 'rgba(8,12,22,.95)'; g.strokeStyle = css(col, .9); g.lineWidth = 2;
  for (const dx of [-1, 1]) { g.fillRect(x + dx * s * .5 - s * .12, y - s * 1.3, s * .24, s * 1.3); g.strokeRect(x + dx * s * .5 - s * .12, y - s * 1.3, s * .24, s * 1.3); }
  g.beginPath(); g.arc(x, y - s * 1.3, s * .5, Math.PI, 0); g.stroke();
  glow(g, x, y - s * .6, s * .8, col, .35);
  g.beginPath(); g.moveTo(x - s * .12, y - s * .5); g.lineTo(x + s * .12, y - s * .5); g.moveTo(x, y - s * .9); g.lineTo(x, y - s * .3); g.stroke();
}
function lifeScene(g, p, W, SH, rnd, col) {
  const life = p.info.life, gy = SH * .9;
  if (life === '植物') for (let i = 0; i < 9; i++) plant(g, 20 + rnd() * (W - 40), gy + rnd() * 30, 40 + rnd() * 90, rnd, col);
  else if (life === '动物') { animal(g, W * (.25 + rnd() * .2), gy + 20, 46, rnd, col); animal(g, W * (.65 + rnd() * .15), gy - 4, 22, rnd, col) }
  else if (life === '文明遗迹') ruin(g, W * (.3 + rnd() * .3), gy + 14, 60, col);
  else if (life === '微生物') for (let i = 0; i < 6; i++) { const x = rnd() * W, y = gy + rnd() * 28; glow(g, x, y, 30 + rnd() * 30, col, .35); }
}
// 右下角“显微放大”小圆图：每种生命长什么样一眼可见
function macro(g, p, cx, cy, R, rnd, col) {
  g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 7); g.clip();
  const bg = g.createRadialGradient(cx, cy, 0, cx, cy, R); bg.addColorStop(0, css(mix(col, [0, 0, 0], .75))); bg.addColorStop(1, 'rgba(2,6,12,1)');
  g.fillStyle = bg; g.fillRect(cx - R, cy - R, R * 2, R * 2);
  const life = p.info.life;
  if (life === '微生物' || life === '漂浮微生物') {
    for (let i = 0; i < 9; i++) { const a = rnd() * 6.28, d = rnd() * R * .75, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d, r = 6 + rnd() * 12;
      g.strokeStyle = css(col, .8); g.lineWidth = 1.2; g.fillStyle = css(col, .18); g.beginPath(); g.ellipse(x, y, r, r * .7, a, 0, 7); g.fill(); g.stroke();
      g.fillStyle = css(mix(col, [1, 1, 1], .6), .9); g.beginPath(); g.arc(x, y, r * .28, 0, 7); g.fill();
      g.beginPath(); g.moveTo(x - r * Math.cos(a), y - r * Math.sin(a)); g.quadraticCurveTo(x - r * 2, y + r, x - r * 2.6 * Math.cos(a), y - r * 2.2 * Math.sin(a)); g.stroke(); }
  } else if (life === '植物') {
    g.strokeStyle = css(col, .7); g.lineWidth = 1; const s = 15;
    for (let r = -6; r < 7; r++) for (let c = -6; c < 7; c++) { const x = cx + c * s * 1.5, y = cy + r * s * 1.73 + (c % 2 ? s * .86 : 0); g.beginPath();
      for (let k = 0; k < 6; k++) g.lineTo(x + s * Math.cos(k * 1.047), y + s * Math.sin(k * 1.047)); g.closePath(); g.stroke(); }
  } else if (life === '动物') {
    for (let i = 0; i < 40; i++) { const a = i / 40 * 6.28; g.strokeStyle = css(mix(col, [1, 1, 1], rnd() * .5), .8); g.beginPath(); g.moveTo(cx + Math.cos(a) * R * .22, cy + Math.sin(a) * R * .22); g.lineTo(cx + Math.cos(a) * R * .75, cy + Math.sin(a) * R * .75); g.stroke(); }
    g.fillStyle = '#05080f'; g.beginPath(); g.ellipse(cx, cy, R * .2, R * .2 * .7, 0, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(cx - R * .06, cy - R * .06, R * .04, 0, 7); g.fill();
  } else {
    g.strokeStyle = css(col, .9); g.lineWidth = 1.5;
    for (let r = 1; r <= 3; r++) { g.beginPath(); g.arc(cx, cy, R * .25 * r, 0, 7); g.stroke(); }
    for (let i = 0; i < 24; i++) { const a = i / 24 * 6.28, r1 = R * .5 + (i % 3) * 5; g.beginPath(); g.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.lineTo(cx + Math.cos(a + .1) * (r1 + 9 + (i % 2) * 8), cy + Math.sin(a + .1) * (r1 + 9 + (i % 2) * 8)); g.stroke(); }
  }
  g.restore(); g.strokeStyle = css(mix(col, [1, 1, 1], .4)); g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
}

// 画天空里的一个、两个或三个太阳（岩石行星和气态巨行星共用）
function drawSuns(g, stars, rnd, W, SH, dist) {
  const n = stars.length, sx = W * (.15 + rnd() * .7), sy = SH * (.15 + rnd() * .15), sr = Math.max(10, 70 - dist * .42);
  const suns = [{ x: sx, y: sy, r: sr, col: stars[0].color }];
  if (n > 1) {   // 紧密伴星：在主星旁边，大小按恒星半径比例，颜色不同
    const side = rnd() < .5 ? -1 : 1, rr = Math.max(.45, Math.min(1.1, stars[1].radius / stars[0].radius));
    suns.push({ x: Math.max(30, Math.min(W - 30, sx + side * (sr * 2.2 + 50 + rnd() * 70))), y: sy + (rnd() - .4) * 40, r: sr * rr, col: stars[1].color });
  }
  if (n > 2) suns.push({ x: W * (.1 + rnd() * .8), y: SH * (.06 + rnd() * .1), r: Math.max(5, sr * .3), col: stars[2].color });   // 远处的第三颗，看起来很小
  for (const o of suns) { glow(g, o.x, o.y, o.r * 4, o.col, .55); g.fillStyle = css(mix(o.col, [1, 1, 1], .7)); g.beginPath(); g.arc(o.x, o.y, o.r * .6, 0, 7); g.fill() }
}
// 一团柔软的云
function puff(g, x, y, rx, ry, col, a) {
  g.save(); g.translate(x, y); g.scale(1, ry / rx);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx); gr.addColorStop(0, css(col, a)); gr.addColorStop(.6, css(col, a * .55)); gr.addColorStop(1, css(col, 0));
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, 7); g.fill(); g.restore();
}
// 漂浮在云海里的水母状生物
function floater(g, x, y, s, col) {
  glow(g, x, y, s * 2.2, col, .35);
  g.fillStyle = css(mix(col, [0, 0, 0], .35), .85); g.beginPath(); g.ellipse(x, y, s, s * .62, 0, Math.PI, 0); g.fill();
  g.strokeStyle = css(col, .8); g.lineWidth = 1.4;
  for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(x + k * s * .35, y); g.quadraticCurveTo(x + k * s * .5 + s * .2, y + s * .9, x + k * s * .4, y + s * 1.7); g.stroke() }
}

// ---------- 主函数 ----------
// stars：该星系的恒星数组 [{color, radius}, ...]（来自 genStars）；也兼容只传一个颜色 [r,g,b]
export function drawPlanetCard(p, stars, W = 480, H = 640) {
  if (typeof stars[0] === 'number') stars = [{ color: stars, radius: 7 }];
  const starColor = stars[0].color, nStars = stars.length;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const rnd = mulberry32(p.seed * 7 + 13), i = p.info, SH = 400, rar = rarity(p);
  const lifeCol = LIFE_COL[i.life] || null;
  g.save(); g.beginPath(); g.roundRect(0, 0, W, H, 18); g.clip();
  g.fillStyle = '#05080f'; g.fillRect(0, 0, W, H);

  if (p.kind === 'gas') {                       // 气态巨行星：没有地面，画“悬浮在云海上空”的视角
    const top = mix(p.palette[0], [0, 0, 0], .82), hor = mix(p.palette[1], [1, 1, 1], .3), HY = SH * .5;   // HY：云海的地平线
    const gr = g.createLinearGradient(0, 0, 0, HY); gr.addColorStop(0, css(top)); gr.addColorStop(1, css(mix(hor, top, .35)));
    g.fillStyle = gr; g.fillRect(0, 0, W, SH);
    for (let k = 0; k < 90; k++) { g.fillStyle = `rgba(255,255,255,${.1 + rnd() * .45})`; g.fillRect(rnd() * W, rnd() * HY * .7, 1.2, 1.2) }
    drawSuns(g, stars, rnd, W, SH, p.dist);
    if (p.ring) {   // 巨大的星环横跨天空
      g.save(); g.translate(W * .5, HY * .3); g.rotate(-.12);
      for (let w = 0; w < 4; w++) { g.strokeStyle = css(mix(p.palette[1], [1, 1, 1], .25 + w * .12), .38 - w * .07); g.lineWidth = 16 - w * 3.5;
        g.beginPath(); g.ellipse(0, HY * 1.1, W * (.95 + w * .05), HY * 1.0, 0, Math.PI * 1.08, Math.PI * 1.92); g.stroke() }
      g.restore();
    }
    for (let m = 0; m < p.moons; m++) { const mx = rnd() * W, my = SH * (.08 + rnd() * .25), mr = 9 + rnd() * 14; g.fillStyle = '#b8b8c0'; g.beginPath(); g.arc(mx, my, mr, 0, 7); g.fill(); g.fillStyle = 'rgba(0,0,10,.45)'; g.beginPath(); g.arc(mx + mr * .35, my, mr * .95, 0, 7); g.fill() }
    g.fillStyle = css(hor, .35); g.fillRect(0, HY - 3, W, 6);   // 地平线上的一线微光
    let nearCol = hor;
    for (let L = 0; L < 9; L++) {   // 云海：由远到近，云层越来越大、越来越暗
      const t = L / 8, y = HY + (SH - HY) * (t * t * .9 + .02), rx = 50 + t * 150, ry = 12 + t * 40;
      const col = mix(mix(hor, p.palette[1], t * .5), mix(p.palette[0], [0, 0, 0], t * .35), t * .8); nearCol = col;
      for (let k = 0, n = 18 - (t * 8 | 0); k < n; k++) puff(g, rnd() * (W + 100) - 50, y + (rnd() - .5) * 16, rx * (.6 + rnd() * .8), ry * (.7 + rnd() * .8), L % 2 ? col : mix(col, [1, 1, 1], .15), .85);
    }
    const vx = W * (.2 + rnd() * .6), vy = SH * .88;   // 前景的风暴漩涡
    for (let r = 0; r < 5; r++) { g.strokeStyle = css(mix(nearCol, [1, 1, 1], .35), .2); g.lineWidth = 3; g.beginPath(); g.ellipse(vx, vy, 40 + r * 22, 10 + r * 5, 0, 0, Math.PI * 1.7 + r * .3); g.stroke() }
    if (i.life === '漂浮微生物') for (let k = 0; k < 4; k++) floater(g, W * (.1 + rnd() * .6), HY + 30 + rnd() * 120, 12 + rnd() * 14, lifeCol);
    const fg = g.createLinearGradient(0, SH * .8, 0, SH); fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(1, css(mix(p.palette[0], [0, 0, 0], .7), .85));
    g.fillStyle = fg; g.fillRect(0, SH * .8, W, SH * .2);
  } else {                                      // 岩石 / 冰巨星：画地表风景
    const sky = SKY[i.atm] || SKY['稀薄'], showStars = i.atm === '无' || i.atm === '稀薄';
    const gr = g.createLinearGradient(0, 0, 0, SH); gr.addColorStop(0, css(sky[0])); gr.addColorStop(1, css(sky[1])); g.fillStyle = gr; g.fillRect(0, 0, W, SH);
    if (showStars) for (let k = 0; k < 160; k++) { g.fillStyle = `rgba(255,255,255,${.2 + rnd() * .7})`; g.fillRect(rnd() * W, rnd() * SH * .75, 1 + rnd() * 1.2, 1 + rnd() * 1.2) }
    drawSuns(g, stars, rnd, W, SH, p.dist);
    for (let m = 0; m < p.moons; m++) { const mx = rnd() * W, my = SH * (.1 + rnd() * .3), mr = 10 + rnd() * 16; g.fillStyle = '#b8b8c0'; g.beginPath(); g.arc(mx, my, mr, 0, 7); g.fill(); g.fillStyle = 'rgba(0,0,10,.45)'; g.beginPath(); g.arc(mx + mr * .35, my, mr * .95, 0, 7); g.fill() }
    let ground = p.kind === 'ice' ? mix(p.palette[0], [.9, .95, 1], .55) : p.palette[0];
    if (i.life === '植物' || (i.atm === '宜居' && i.life !== '无')) ground = mix(ground, [.2, .5, .2], .35);
    const layers = [[.62, 95, .65], [.74, 65, .4], [.86, 40, .15]];
    for (const [b, a, fog] of layers) ridge(g, W, SH, SH * b, a, rnd, css(mix(mix(ground, [0, 0, 0], .2 + (.65 - fog) * .4), sky[1], fog)));
    const fg = g.createLinearGradient(0, SH * .88, 0, SH); fg.addColorStop(0, css(mix(ground, [0, 0, 0], .35))); fg.addColorStop(1, css(mix(ground, [0, 0, 0], .7))); g.fillStyle = fg; g.fillRect(0, SH * .88, W, SH * .12);
    for (let k = 0; k < 30; k++) { g.fillStyle = css(mix(ground, [0, 0, 0], .5 + rnd() * .3)); g.beginPath(); g.ellipse(rnd() * W, SH * (.9 + rnd() * .1), 4 + rnd() * 14, 2 + rnd() * 5, 0, 0, 7); g.fill() }
    for (let k = 1; k < Math.min(nStars, 2); k++) { g.fillStyle = css(stars[k].color, .07); g.fillRect(0, 0, W, SH) }   // 第二颗太阳的光在景物上叠一层淡淡的色调
    if (lifeCol) lifeScene(g, p, W, SH, rnd, lifeCol);
  }
  if (lifeCol) macro(g, p, W - 86, SH - 78, 62, rnd, lifeCol);

  // 下半部分：信息区
  const ig = g.createLinearGradient(0, SH, 0, H); ig.addColorStop(0, '#0b1424'); ig.addColorStop(1, '#060b16'); g.fillStyle = ig; g.fillRect(0, SH, W, H - SH);
  g.fillStyle = rar.col; g.fillRect(0, SH, W, 3);
  g.fillStyle = '#e8f1ff'; g.font = 'bold 26px "Microsoft YaHei",sans-serif'; g.fillText(p.name, 24, SH + 40);
  g.fillStyle = rar.col; g.font = '15px "Microsoft YaHei",sans-serif'; g.fillText(`${KIND[p.kind]} · ${rar.name} ${'★'.repeat(rar.n)}${nStars > 1 ? ' · ' + ['', '双星系统', '三星系统'][nStars - 1] : ''}`, 24, SH + 64);
  g.fillStyle = '#b8c7e0'; g.font = '15px "Microsoft YaHei",monospace';
  const rows = [[`温度 ${i.temp}°C`, `重力 ${i.g} g`], [`大气 ${i.atm}`, `资源 ${i.res}`], [`生命 ${i.life}`, `样本价值 ${i.value}`]];
  rows.forEach((r, k) => { g.fillText(r[0], 24, SH + 100 + k * 28); g.fillText(r[1], W / 2 + 10, SH + 100 + k * 28) });
  g.fillStyle = '#5c6b86'; g.font = '12px monospace'; g.fillText('DEEP SPACE EXPLORER', 24, H - 18);
  g.restore(); g.strokeStyle = rar.col; g.lineWidth = 3; g.beginPath(); g.roundRect(1.5, 1.5, W - 3, H - 3, 18); g.stroke();
  return c;
}
