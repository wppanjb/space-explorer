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
const TAG_COL = { 实测: '#7fe0a0', 推测: '#ffd27a', 生成: '#8fa3c4' };   // 数据来源标签的颜色
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
// ---------- 地球专用：植物、动物和人类 ----------
function tree(g, x, y, h, rnd) {   // 树：棕色树干 + 几团绿色树冠
  g.fillStyle = '#5b3f2a'; g.fillRect(x - h * .035, y - h * .5, h * .07, h * .5);
  for (let k = 0; k < 4; k++) {
    const cx = x + (rnd() - .5) * h * .3, cy = y - h * (.55 + rnd() * .3), r = h * (.2 + rnd() * .1);
    g.fillStyle = css(mix([.16, .42, .17], [.4, .6, .22], rnd() * .7)); g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
  }
}
function grass(g, x, y, h, rnd) {   // 一丛草和小花
  g.strokeStyle = '#3d7a2e'; g.lineWidth = 1.6;
  for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(x + k * 3, y); g.quadraticCurveTo(x + k * 5, y - h * .6, x + k * 8 + (rnd() - .5) * 6, y - h); g.stroke() }
  if (rnd() < .6) { g.fillStyle = ['#ffd84a', '#ff8fb0', '#ffffff'][rnd() * 3 | 0]; g.beginPath(); g.arc(x + 4, y - h * .9, 2.6, 0, 7); g.fill() }
}
function cat(g, x, y, s) {   // 坐着的橘猫：身体、头、尖耳朵、弯尾巴、眼睛、胡须、条纹
  const fur = '#e08a3c', dark = '#b8631f';
  g.lineCap = 'round';
  g.strokeStyle = fur; g.lineWidth = s * .16;                                   // 尾巴：绕到身体前方再翘起
  g.beginPath(); g.moveTo(x + s * .35, y - s * .12); g.bezierCurveTo(x + s * .95, y - s * .05, x + s * .85, y - s * .7, x + s * .6, y - s * .75); g.stroke();
  g.fillStyle = fur; g.beginPath(); g.ellipse(x, y - s * .4, s * .42, s * .42, 0, 0, 7); g.fill();   // 身体
  g.beginPath(); g.ellipse(x - s * .12, y - s * .06, s * .3, s * .12, 0, 0, 7); g.fill();            // 前爪
  g.fillStyle = '#f6d9b0'; g.beginPath(); g.ellipse(x - s * .08, y - s * .3, s * .17, s * .26, 0, 0, 7); g.fill();   // 白肚皮
  g.fillStyle = fur; g.beginPath(); g.arc(x - s * .08, y - s * .92, s * .3, 0, 7); g.fill();         // 头
  g.beginPath(); g.moveTo(x - s * .34, y - s * 1.02); g.lineTo(x - s * .32, y - s * 1.36); g.lineTo(x - s * .1, y - s * 1.16); g.fill();   // 左耳
  g.beginPath(); g.moveTo(x + s * .18, y - s * 1.16); g.lineTo(x + s * .22, y - s * 1.36); g.lineTo(x + s * .26, y - s * 1.0); g.fill();   // 右耳
  g.strokeStyle = dark; g.lineWidth = s * .05;                                  // 条纹
  for (const k of [-.12, 0, .12]) { g.beginPath(); g.moveTo(x - s * .08 + s * k, y - s * 1.2); g.lineTo(x - s * .08 + s * k, y - s * 1.1); g.stroke() }
  for (const k of [.18, .36]) { g.beginPath(); g.moveTo(x + s * .3, y - s * (.2 + k)); g.lineTo(x + s * .42, y - s * (.24 + k)); g.stroke() }
  g.fillStyle = '#2a4a1e';                                                      // 眼睛、鼻子
  g.beginPath(); g.ellipse(x - s * .2, y - s * .94, s * .045, s * .06, 0, 0, 7); g.ellipse(x + s * .04, y - s * .94, s * .045, s * .06, 0, 0, 7); g.fill();
  g.fillStyle = '#e86a7a'; g.beginPath(); g.arc(x - s * .08, y - s * .85, s * .03, 0, 7); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 1;                     // 胡须
  for (const d of [-1, 1]) for (const k of [-.03, .04]) { g.beginPath(); g.moveTo(x - s * .08 + d * s * .1, y - s * (.86 + k)); g.lineTo(x - s * .08 + d * s * .38, y - s * (.88 + k * 3)); g.stroke() }
}
function bird(g, x, y, s) {   // 飞鸟：两道弧线
  g.strokeStyle = 'rgba(30,40,60,.8)'; g.lineWidth = 1.8; g.beginPath();
  g.moveTo(x - s, y); g.quadraticCurveTo(x - s * .5, y - s * .6, x, y); g.quadraticCurveTo(x + s * .5, y - s * .6, x + s, y); g.stroke();
}
function person(g, x, y, s, shirt) {   // 站立的人：头、身体、手臂、两条腿
  g.lineCap = 'round'; g.strokeStyle = '#2b3350'; g.lineWidth = s * .09;
  g.beginPath(); g.moveTo(x - s * .12, y - s * .5); g.lineTo(x - s * .14, y); g.moveTo(x + s * .12, y - s * .5); g.lineTo(x + s * .14, y); g.stroke();
  g.fillStyle = shirt; g.beginPath(); g.roundRect(x - s * .22, y - s * 1.05, s * .44, s * .58, s * .1); g.fill();
  g.strokeStyle = '#e8b890'; g.lineWidth = s * .08; g.beginPath(); g.moveTo(x - s * .22, y - s * .98); g.lineTo(x - s * .3, y - s * .6); g.moveTo(x + s * .22, y - s * .98); g.lineTo(x + s * .3, y - s * .6); g.stroke();
  g.fillStyle = '#e8b890'; g.beginPath(); g.arc(x, y - s * 1.22, s * .17, 0, 7); g.fill();
  g.fillStyle = '#3a2a22'; g.beginPath(); g.arc(x, y - s * 1.27, s * .17, Math.PI, 0); g.fill();
}
function earthScene(g, W, SH, rnd) {
  const gy = SH * .9;
  for (let k = 0; k < 7; k++) tree(g, 20 + rnd() * (W - 40), SH * (.8 + rnd() * .06), 70 + rnd() * 60, rnd);        // 远处的树
  for (let k = 0; k < 4; k++) bird(g, W * (.2 + rnd() * .65), SH * (.12 + rnd() * .3), 6 + rnd() * 5);
  cat(g, W * .2, gy + 8, 38);                                                                                  // 动物
  for (let k = 0; k < 16; k++) grass(g, 10 + rnd() * (W - 20), gy + rnd() * (SH * .1), 12 + rnd() * 16, rnd);   // 植物
  tree(g, W * .88, gy + 4, 120, rnd);
  person(g, W * .55, gy + 14, 46, '#d65a4a'); person(g, W * .63, gy + 16, 40, '#3f7fd1'); person(g, W * .59, gy + 22, 26, '#e8c23c');   // 人类：两个大人和一个孩子
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
  const rnd = mulberry32(p.seed * 7 + 13), i = p.info, SH = 400;
  // 出发点（地球）：不是样本，没有稀有度；也不画外星生物，只画蓝天、白云和绿色的大地
  const rar = p.home ? { name: '出发点', n: 0, col: '#7fd4ff' } : rarity(p);
  const lifeCol = p.home ? null : (LIFE_COL[i.life] || null);
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
    for (let m = 0; m < p.moons; m++) { const mx = rnd() * W, my = SH * (.08 + rnd() * .25), mr = m < 4 ? 9 + rnd() * 14 : 2.5 + rnd() * 3.5; g.fillStyle = '#b8b8c0'; g.beginPath(); g.arc(mx, my, mr, 0, 7); g.fill(); g.fillStyle = 'rgba(0,0,10,.45)'; g.beginPath(); g.arc(mx + mr * .35, my, mr * .95, 0, 7); g.fill() }
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
    if (p.home) for (let k = 0; k < 16; k++) puff(g, rnd() * W, SH * (.12 + rnd() * .38), 40 + rnd() * 70, 9 + rnd() * 14, [1, 1, 1], .5);   // 白云
    for (let m = 0; m < p.moons; m++) { const mx = rnd() * W, my = SH * (.1 + rnd() * .3), mr = m < 4 ? 10 + rnd() * 16 : 2.5 + rnd() * 3.5; g.fillStyle = '#b8b8c0'; g.beginPath(); g.arc(mx, my, mr, 0, 7); g.fill(); g.fillStyle = 'rgba(0,0,10,.45)'; g.beginPath(); g.arc(mx + mr * .35, my, mr * .95, 0, 7); g.fill() }
    let ground = p.kind === 'ice' ? mix(p.palette[0], [.9, .95, 1], .55) : p.palette[0];
    if (i.life === '植物' || (i.atm === '宜居' && i.life !== '无')) ground = mix(ground, [.2, .5, .2], .35);
    if (p.home) ground = [.3, .5, .28];   // 地球的大地是绿色的（贴图的蓝色是海洋）
    const layers = [[.62, 95, .65], [.74, 65, .4], [.86, 40, .15]];
    for (const [b, a, fog] of layers) ridge(g, W, SH, SH * b, a, rnd, css(mix(mix(ground, [0, 0, 0], .2 + (.65 - fog) * .4), sky[1], fog)));
    const fg = g.createLinearGradient(0, SH * .88, 0, SH); fg.addColorStop(0, css(mix(ground, [0, 0, 0], .35))); fg.addColorStop(1, css(mix(ground, [0, 0, 0], .7))); g.fillStyle = fg; g.fillRect(0, SH * .88, W, SH * .12);
    for (let k = 0; k < 30; k++) { g.fillStyle = css(mix(ground, [0, 0, 0], .5 + rnd() * .3)); g.beginPath(); g.ellipse(rnd() * W, SH * (.9 + rnd() * .1), 4 + rnd() * 14, 2 + rnd() * 5, 0, 0, 7); g.fill() }
    for (let k = 1; k < Math.min(nStars, 2); k++) { g.fillStyle = css(stars[k].color, .07); g.fillRect(0, 0, W, SH) }   // 第二颗太阳的光在景物上叠一层淡淡的色调
    if (p.home) earthScene(g, W, SH, rnd); else if (lifeCol) lifeScene(g, p, W, SH, rnd, lifeCol);
  }
  if (lifeCol) macro(g, p, W - 86, SH - 78, 62, rnd, lifeCol);

  // 下半部分：信息区
  const ig = g.createLinearGradient(0, SH, 0, H); ig.addColorStop(0, '#0b1424'); ig.addColorStop(1, '#060b16'); g.fillStyle = ig; g.fillRect(0, SH, W, H - SH);
  g.fillStyle = rar.col; g.fillRect(0, SH, W, 3);
  g.fillStyle = '#e8f1ff'; g.font = 'bold 26px "Microsoft YaHei",sans-serif'; g.fillText(p.name, 24, SH + 40);
  const subFont = '15px "Microsoft YaHei",sans-serif', subTxt = `${KIND[p.kind]} · ${rar.name}${rar.n ? ' ' + '★'.repeat(rar.n) : ''}${nStars > 1 ? ' · ' + ['', '双星系统', '三星系统'][nStars - 1] : ''}`;
  g.fillStyle = rar.col; g.font = subFont; g.fillText(subTxt, 24, SH + 64);
  if (p.real && !p.home) { const w = g.measureText(subTxt).width; g.fillStyle = p.cand || p.padded ? '#ffd27a' : '#7fe0a0'; g.fillText(p.cand ? ' · 候选行星' : p.padded ? ' · 推测行星' : ' · 真实行星', 24 + w, SH + 64) }   // 真实行星标签单独上色（绿 = 真实，黄 = 候选 / 推测）
  g.fillStyle = '#b8c7e0'; g.font = '15px "Microsoft YaHei",monospace';
  // 每行是 [[文字, 来源标签], [文字, 来源标签]]；来源标签只有真实行星才显示（实测 / 推测 / 生成）
  const real = p.real && !p.home, tg = k => real ? (p.src[k] ?? p.src.env) : null, ex = p.au != null;   // ex：系外行星，多显示半径 / 质量 / 轨道
  const rows = [
    [[`温度 ${i.temp}°C`, tg('env')], [`重力 ${i.g} g`, tg('env')]],
    [[`大气 ${i.atm}`, tg('atm')], [`资源 ${i.res}`, tg('res')]],
    p.home ? [['生命 有'], [`已知卫星 ${p.knownMoons} 颗`]] : [[`生命 ${i.life}`, tg('life')], [`样本价值 ${i.value}`, tg('value')]],
  ];
  if (ex) {
    rows.push([[`半径 ${p.earthR} R⊕`, p.src.size], [`质量 ${p.earthM} M⊕`, p.src.mass]]);
    rows.push([[`轨道 ${+p.au.toPrecision(3)} AU`, p.src.orbit], [p.periodDays >= 1000 ? `周期 ${(p.periodDays / 365.25).toFixed(1)} 年` : `周期 ${+p.periodDays.toPrecision(3)} 天`, p.src.orbit]]);
  } else if (real) rows.push([[p.knownMoons > 0 ? `已知卫星 ${p.knownMoons} 颗` : '无卫星', p.src.orbit]]);   // 太阳系：写真实的卫星数量
  const y0 = SH + (rows.length > 4 ? 94 : 100), dy = rows.length > 4 ? 26 : 28;
  const item = (it, x, y) => {
    if (!it) return; g.fillStyle = '#b8c7e0'; g.font = '15px "Microsoft YaHei",monospace'; g.fillText(it[0], x, y);
    if (it[1]) { const w = g.measureText(it[0]).width; g.fillStyle = TAG_COL[it[1]]; g.font = '11px "Microsoft YaHei",sans-serif'; g.fillText(it[1], x + w + 6, y) }
  };
  rows.forEach((r, k) => { item(r[0], 24, y0 + k * dy); item(r[1], W / 2 + 10, y0 + k * dy) });
  if (real) {   // 右下角图例
    g.font = '11px "Microsoft YaHei",sans-serif'; let x = W - 24;
    for (const t of ['生成', '推测', '实测']) { const w = g.measureText(t).width; x -= w; g.fillStyle = TAG_COL[t]; g.fillText(t, x, H - 18); x -= 10 }
  }
  g.fillStyle = '#5c6b86'; g.font = '12px monospace'; g.fillText('DEEP SPACE EXPLORER', 24, H - 18);
  g.restore(); g.strokeStyle = rar.col; g.lineWidth = 3; g.beginPath(); g.roundRect(1.5, 1.5, W - 3, H - 3, 18); g.stroke();
  return c;
}

// ---------- 星系全景图（示意图）：俯视图，已扫描的行星画实心，没扫描的只画轨道和虚线圈 ----------
// meta = { title, sub, starLabel, count, date, src, srcCol }；snapIds = 拍摄时已扫描的行星 id（出发点始终算已知）
export function drawSysPanorama(sys, stars, planets, snapIds, meta, W = 800, H = 450) {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  g.fillStyle = '#04060f'; g.fillRect(0, 0, W, H);
  const rnd = mulberry32(sys.seed ^ 0x5eed);
  for (let i = 0; i < 140; i++) { g.fillStyle = `rgba(255,255,255,${.15 + rnd() * .5})`; g.fillRect(rnd() * W, rnd() * H, rnd() < .1 ? 2 : 1, rnd() < .1 ? 2 : 1) }
  const cx = W / 2, cy = H / 2 + 14, tilt = .4, ids = new Set(snapIds);
  const maxD = Math.max(60, ...planets.map(p => p.dist)), rx = d => 64 + 290 * Math.sqrt(d / maxD);
  const sc = stars[0].color, sr = Math.max(14, Math.min(46, 10 + stars[0].radius * 1.6));
  // 小行星带
  if (sys.belt) {
    const [a, b] = sys.belt, r1 = rx(a), r2 = rx(b), br = mulberry32(sys.seed ^ 0xbe17);
    for (let i = 0; i < 260; i++) { const t = br() * 6.283, r = r1 + (r2 - r1) * br(); g.fillStyle = `rgba(190,180,165,${.25 + br() * .4})`; g.fillRect(cx + Math.cos(t) * r, cy + Math.sin(t) * r * tilt, 1.6, 1.6) }
  }
  // 轨道
  g.lineWidth = 1;
  for (const p of planets) { const r = rx(p.dist); g.strokeStyle = ids.has(p.id) || p.home ? 'rgba(127,212,255,.32)' : 'rgba(127,212,255,.14)'; g.setLineDash(ids.has(p.id) || p.home ? [] : [3, 5]); g.beginPath(); g.ellipse(cx, cy, r, r * tilt, 0, 0, 6.283); g.stroke() }
  g.setLineDash([]);
  // 恒星（多星系统：伴星画在旁边）
  const glow = g.createRadialGradient(cx, cy, sr * .3, cx, cy, sr * 3.2); glow.addColorStop(0, css(sc, .55)); glow.addColorStop(1, css(sc, 0));
  g.fillStyle = glow; g.beginPath(); g.arc(cx, cy, sr * 3.2, 0, 6.283); g.fill();
  g.fillStyle = css(mix(sc, [1, 1, 1], .35)); g.beginPath(); g.arc(cx, cy, sr, 0, 6.283); g.fill();
  stars.slice(1).forEach((s, i) => { const x = cx + (i ? -1 : 1) * (sr + 20 + i * 10), y = cy - sr * .6 - i * 6, r = Math.max(5, Math.min(16, 4 + s.radius * .9)); g.fillStyle = css(mix(s.color, [1, 1, 1], .3)); g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill() });
  g.textAlign = 'center'; g.font = '12px "Microsoft YaHei",sans-serif'; g.fillStyle = '#c9d6ee'; g.fillText(meta.starLabel, cx, cy + sr + 18);
  // 行星（靠下的画在前面）
  const spots = planets.map(p => { const r = rx(p.dist); return { p, x: cx + Math.cos(p.phase) * r, y: cy + Math.sin(p.phase) * r * tilt } }).sort((a, b) => a.y - b.y);
  for (const { p, x, y } of spots) {
    const known = ids.has(p.id) || p.home, pr = Math.max(5, Math.min(17, 3.5 + p.radius * 2.1));
    if (known) {
      const gr = g.createRadialGradient(x - pr * .35, y - pr * .35, pr * .1, x, y, pr); gr.addColorStop(0, css(p.palette[1])); gr.addColorStop(1, css(p.palette[0]));
      if (p.glow) { g.fillStyle = css(p.glow, .3); g.beginPath(); g.arc(x, y, pr * 1.9, 0, 6.283); g.fill() }
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, pr, 0, 6.283); g.fill();
      if (p.ring) { g.strokeStyle = 'rgba(230,215,170,.8)'; g.lineWidth = 2; g.beginPath(); g.ellipse(x, y, pr * 1.8, pr * .5, -.25, 0, 6.283); g.stroke() }
      g.fillStyle = '#dfe9ff'; g.font = '11px "Microsoft YaHei",sans-serif'; g.fillText(p.name, x, y + pr + 13);
    } else {
      g.strokeStyle = 'rgba(160,190,230,.55)'; g.lineWidth = 1.2; g.setLineDash([2, 3]); g.beginPath(); g.arc(x, y, pr, 0, 6.283); g.stroke(); g.setLineDash([]);
      g.fillStyle = 'rgba(160,190,230,.7)'; g.font = '11px "Microsoft YaHei",sans-serif'; g.fillText('?', x, y + 4);
    }
  }
  // 标题和页脚
  g.textAlign = 'left'; g.fillStyle = '#e8f1ff'; g.font = 'bold 22px "Microsoft YaHei",sans-serif'; g.fillText(meta.title, 24, 38);
  g.fillStyle = '#9fb4d6'; g.font = '13px "Microsoft YaHei",sans-serif'; g.fillText(meta.sub, 24, 60);
  g.fillStyle = meta.srcCol; g.fillText(meta.src, 24, H - 18);
  g.textAlign = 'right'; g.fillStyle = '#9fb4d6'; g.fillText(`${meta.count}  ·  ${meta.date}`, W - 24, H - 18);
  g.textAlign = 'left'; g.strokeStyle = 'rgba(127,212,255,.3)'; g.lineWidth = 2; g.strokeRect(1, 1, W - 2, H - 2);
  return cv;
}
