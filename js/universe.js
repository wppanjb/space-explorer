// 程序化宇宙生成：星系、背景星、星云、恒星系、行星（纯函数，不依赖游戏状态）
import * as THREE from 'three';
import { TAU, GR, HOME_POS, ROMAN, STAR_COLS, LIFE_BONUS, rockRes } from './constants.js';
import { SOL, buildSolPlanets } from './real.js';
import { sampleReal, buildRealStars, buildRealPlanets } from './realsystems.js';
import { makeRng, lerp } from './rng.js';

// ---------- 星系的大小与间距 ----------
// 每个星系的范围（最外圈行星的远日点 + 行星占用的空间，或伴星的轨道）不超过 SYS_R_MAX（下面的 fitOrbits 保证）。
// 星系之间的间距 ≥ 两个最大范围 + SYS_BUFFER，所以任意两个星系的范围之间至少隔着 SYS_BUFFER，不会互相重叠。
// 银河半径 GR 在 constants.js（3800）；K = 相对原版（1400）放大的倍数，背景星 / 星云 / 银心的尺寸跟着放大。
export const SYS_R_MAX = 300, SYS_BUFFER = 100;
const K = GR / 1400, BH_TIDE_R = 160;   // BH_TIDE_R：奇点潮汐区半径（和 main.js 里的 TIDE_R 一致）

const SYL = ["ae", "ky", "or", "ven", "ta", "lu", "xi", "ra", "mo", "zen", "thal", "is", "ur", "no", "va", "kar", "el", "dra"];

export function genGalaxy(R, n = 260000, arms = 4, spin = 4.2) {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), core = [1, .82, .55], edge = [.45, .65, 1];
  for (let i = 0; i < n; i++) {
    let x, y, z, t;
    if (R.rand() < .18) {
      const r = Math.abs(R.gauss(0, 45)) * K, th = R.uni(0, TAU), ph = Math.acos(R.uni(-1, 1));
      x = r * Math.sin(ph) * Math.cos(th); y = r * Math.cos(ph) * .55; z = r * Math.sin(ph) * Math.sin(th); t = 0;
    } else {
      const r = GR * Math.pow(R.rand(), .72); t = r / GR;
      const ang = t * spin + (i % arms) * TAU / arms + R.gauss(0, .28 * (1 - .5 * t));
      x = Math.cos(ang) * r; z = Math.sin(ang) * r; y = R.gauss(0, 7) * (1 - t * .6) * K;
    }
    const b = R.uni(.55, 1);
    let c = [0, 1, 2].map(k => lerp(core[k], edge[k], Math.min(1, t * 1.3)) * b);
    if (t > .2 && R.rand() < .05) c = [b, .4 * b, .65 * b];
    pos.set([x, y, z], i * 3); col.set(c, i * 3);
  }
  return { pos, col };
}
export function genBackground(R, n = 7000) {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), tints = [[1, 1, 1], [.8, .88, 1], [1, .9, .75]];
  for (let i = 0; i < n; i++) {
    const v = [R.gauss(), R.gauss(), R.gauss()], m = Math.hypot(...v) || 1, d = R.uni(4000, 6000) * K, b = R.uni(.4, 1);
    pos.set(v.map(a => a / m * d), i * 3); col.set(R.pick(tints).map(c => c * b), i * 3);
  }
  return { pos, col };
}

// 生成星云，返回[{p:[x,y,z],s:scale,c:[r,g,b],o:opacity},...]
export function genNebulae(R, count = 14) {
  const pal = [[.9, .25, .55], [.3, .45, 1], [.55, .3, .95], [.2, .85, .8], [1, .55, .25]], out = [];
  for (let i = 0; i < count; i++) {
    const r = GR * R.uni(.2, 1.1), a = R.uni(0, TAU), cx = Math.cos(a) * r, cy = R.gauss(0, 20) * K, cz = Math.sin(a) * r, color = R.pick(pal);
    for (let j = 0; j < 26; j++)out.push({
      p: [cx + R.gauss(0, 38) * K, cy + R.gauss(0, 14) * K, cz + R.gauss(0, 38) * K],
      s: R.uni(50, 150) * K,
      c: color.map(v => Math.min(1, v * R.uni(.8, 1.15))),
      o: R.uni(.02, .06) // opacity
    });
  }
  return out;
}
const MIN_GAP = 2 * SYS_R_MAX + SYS_BUFFER;                 // 星系之间的最小间距：两个最大范围 + 缓冲（700 u）
const MIN_R_BH = BH_TIDE_R + SYS_R_MAX + 100;              // 星系离银心的最小距离：潮汐区 + 一个最大范围 + 缓冲（560 u）
export function genSystems(R, gal, count = 45) {
  const list = [], names = new Set();
  const mk = (pos, home) => {
    let name;
    do {
      const n = R.int(2, 3); name = ''; for (let k = 0; k < n; k++)name += R.pick(SYL);
      name = name[0].toUpperCase() + name.slice(1) + '-' + R.int(100, 999)
    } while (names.has(name));
    if (home) name = SOL.sysName;
    names.add(name);
    list.push({
      i: list.length, name, pos: new THREE.Vector3(...pos), seed: R.int(1, 1e9),
      color: R.pick(STAR_COLS), radius: R.uni(5.5, 9), nPlanets: home ? 7 : R.int(3, 8)
    });
    // 家园 = 太阳系（上面的随机数照常取，其他星系不受影响）
    if (home) Object.assign(list[0], { color: SOL.star.color, radius: SOL.star.radius, nPlanets: SOL.scanCount, real: 'sol', belt: SOL.belt });
  };
  mk(HOME_POS, true);
  const N = gal.pos.length / 3;
  for (let tries = 0; list.length < count && tries < 4000; tries++) {
    const k = R.int(0, N - 1), x = gal.pos[k * 3], y = gal.pos[k * 3 + 1], z = gal.pos[k * 3 + 2], r = Math.hypot(x, z);
    if (r < MIN_R_BH || r > GR * .95) continue;   // 离银心奇点至少 MIN_R_BH：整个星系范围都在潮汐区之外
    const p = new THREE.Vector3(x, y * .3, z);
    if (list.some(s => s.pos.distanceTo(p) < MIN_GAP)) continue;
    mk([x, y * .3, z], false);
  }
  sampleReal(list);   // 抽一批真实星系换进去（用独立随机数，其余宇宙不变）
  applyCats(list);    // 本局类别：让一部分程序生成的星系变成这些类别
  return list;
}

// ---------- 现象类别（程序生成的星系）----------
// 本局抽到的类别在 list.cats。约 45% 的生成星系变成其中一类（用独立随机数，没变的星系和以前完全一样）。
// 星系上记 cats / cat；恒星外观在这里定，行星的改动在 genPlanets 里的 catTweak。
function applyCats(list) {
  const cats = list.cats || []; if (!cats.length) return;
  const R = makeRng(list[1].seed + 9100);
  for (const s of list) {
    if (s.i === 0 || s.rid) continue;
    if (R.rand() > .45) continue;
    const c = R.pick(cats); s.cats = [c]; s.cat = c;
    if (c === 'redDwarf') { s.color = STAR_COLS[4]; s.radius = +R.uni(4, 5.2).toFixed(2); s.flare = 2.5 }
    if (c === 'redGiant') { s.color = [1, .52, .28]; s.radius = +R.uni(15, 18).toFixed(2); s.flare = .4 }
    if (c === 'compact') s.nPlanets = R.int(5, 8);
  }
}
const LAVA_PAL = [[.35, .1, .05], [1, .45, .1]], OCEAN_PAL = [[.08, .22, .55], [.2, .5, .8]];
const valueOf = p => 50 + Math.round(p.radius * 12) + (LIFE_BONUS[p.info.life] || 0) + (['晶体', '稀土', '氦-3'].includes(p.info.res) ? 100 : 0) + (p.info.atm === '宜居' ? 100 : 0);
// 按类别改行星：外观（palette / glow）、轨道、环境数值。用独立随机数。
function catTweak(sys, planets, ns) {
  const c = sys.cat, R = makeRng(sys.seed + 7771), n = planets.length;
  const redo = (p, i) => { p.period = Math.pow(p.dist, 1.5) * .06; p.info = genInfo(p, makeRng(sys.seed + 8881 + i), ns) };
  const fin = p => { p.info.value = valueOf(p) };
  const reRes = (p, i) => { if (p.kind === 'rock') p.info.res = rockRes(makeRng(sys.seed + 9991 + i).rand(), p.info.temp, p.info.atm, p.radius >= 2 || p.info.g >= 1.5) };   // 环境改了之后重新定资源
  if (c === 'redDwarf') planets.forEach((p, i) => { if (ns === 1) p.dist -= 6; redo(p, i); p.info.temp -= 40; reRes(p, i); fin(p) });
  else if (c === 'redGiant') planets.forEach((p, i) => { p.dist += 28; redo(p, i); p.info.temp += 170; reRes(p, i); fin(p) });
  else if (c === 'hotJupiter') {
    const p = planets[0]; Object.assign(p, { kind: 'gas', radius: R.uni(4.5, 5.5), ring: false, moons: R.int(0, 1), palette: [[.2, .2, .3], [.55, .35, .45]], glow: [.9, .35, .1], glowI: .35, cat: 'hotJupiter' });
    if (ns === 1) p.dist = R.uni(19, 23);
    redo(p, 0); Object.assign(p.info, { temp: R.int(600, 1100), atm: '浓厚（氢氦）', res: '氢气', life: '无', fuelGain: 25 }); fin(p);
  } else if (c === 'lava') {
    const p = planets[0]; Object.assign(p, { kind: 'rock', radius: R.uni(1.2, 2), ring: false, moons: 0, palette: LAVA_PAL, glow: [1, .35, .05], glowI: .6, cat: 'lava' });
    if (ns === 1) p.dist = R.uni(18, 21);
    redo(p, 0); Object.assign(p.info, { temp: R.int(900, 1800), atm: '无', res: '金属矿', life: '无' }); fin(p);
  } else if (c === 'ocean') {
    const rocks = planets.filter(p => p.kind === 'rock'), p = rocks.length ? R.pick(rocks) : planets[0];
    Object.assign(p, { kind: 'rock', radius: R.uni(2.2, 3), ring: false, palette: OCEAN_PAL, cat: 'ocean' });
    redo(p, p.idx); const L = R.rand();
    Object.assign(p.info, { temp: R.int(5, 35), atm: '宜居', res: '水冰', life: L < .5 ? '微生物' : L < .8 ? '植物' : '动物' }); fin(p);
  } else if (c === 'superEarth') {
    for (const p of planets.slice(0, Math.min(2, n))) {
      Object.assign(p, { kind: 'rock', radius: R.uni(2.5, 3.2), ring: false, cat: 'superEarth' });
      redo(p, p.idx); p.info.g = +R.uni(1.6, 2.6).toFixed(2); p.info.atm = R.pick(['稀薄', '浓厚', '浓厚', '宜居']); reRes(p, p.idx); fin(p); p.info.value += 60;
    }
  } else if (c === 'compact') {
    const start = ns > 1 ? planets[0].dist : 16;
    planets.forEach((p, i) => {
      const rock = i < Math.ceil(n * .6);
      Object.assign(p, { kind: rock ? 'rock' : 'ice', radius: rock ? R.uni(1, 2.2) : R.uni(2.4, 3.6), ring: false, moons: R.int(0, 1), dist: start + i * 8.5,
        palette: rock ? R.pick([[[.6, .4, .3], [.8, .6, .4]], [[.3, .5, .8], [.3, .7, .4]], [[.55, .55, .55], [.75, .72, .7]]]) : R.pick([[[.4, .7, .9], [.6, .85, 1]], [[.3, .45, .85], [.5, .65, .95]]]) });
      redo(p, i); fin(p);
    });
  }
}
function genInfo(p, R, ns = 1) {
  let atm, res, life = '无', temp = Math.round(190 - p.dist * 2.8 + (ns - 1) * 45 + R.gauss(0, 45));
  if (p.kind === 'ice') temp -= 60;
  if (p.kind === 'rock') {
    atm = R.pick(['无', '稀薄', '浓厚', '浓厚', '有毒', '宜居', '宜居']);
    res = rockRes(R.rand(), temp, atm, p.radius >= 2);   // 按温度、大气、大小定资源
    const hab = temp > -30 && temp < 70 && (atm === '宜居' || atm === '浓厚');
    if (hab && R.rand() < .75) { const L = R.rand(); life = L < .5 ? '微生物' : L < .8 ? '植物' : L < .95 ? '动物' : '文明遗迹' }
  } else if (p.kind === 'gas') {
    atm = '浓厚（氢氦）'; res = R.pick(['氢气', '氦-3', '氨']); if (R.rand() < .06) life = '漂浮微生物';
  } else { atm = R.pick(['稀薄', '无']); res = R.pick(['水冰', '甲烷冰', '氨冰']) }
  const g = +(.25 + p.radius * (p.kind === 'rock' ? .38 : .22)).toFixed(2);
  let value = 50 + Math.round(p.radius * 12) + (LIFE_BONUS[life] || 0);
  if (res === '晶体' || res === '稀土' || res === '氦-3') value += 100;
  if (atm === '宜居') value += 100;
  return { atm, temp, g, res, life, value, fuelGain: p.kind === 'gas' ? 25 : 10 };
}
// ---------- 多恒星系统 ----------
const starCache = {};
export function genStars(sys) {
  if (starCache[sys.i]) return starCache[sys.i];
  if (sys.rid) return starCache[sys.i] = buildRealStars(sys);   // 真实星系：恒星按真实数据（单星/双星）
  const R = makeRng(sys.seed + 31337), u = R.rand(), n = sys.i === 0 ? 1 : sys.cat === 'circumbinary' ? 2 : u < .6 ? 1 : u < .9 ? 2 : 3;
  const mk = first => ({ color: first ? sys.color : R.pick(STAR_COLS), radius: first ? sys.radius : R.uni(4.5, 8), orbitR: 0, speed: 0, phase: 0 });
  const stars = [mk(true)];
  for (let k = 1; k < n; k++) stars.push(mk(false));
  const mass = x => (x.radius / 7) ** 2;   // 质量 ∝ 半径²（单星 ≈ 1）
  if (n >= 2) {
    const a = stars[0], b = stars[1], sep = a.radius + b.radius + R.uni(6, 14), ma = mass(a), mb = mass(b);
    a.orbitR = sep * mb / (ma + mb); b.orbitR = sep * ma / (ma + mb);
    a.phase = R.uni(0, TAU); b.phase = a.phase + Math.PI;
    a.speed = b.speed = 12 * Math.sqrt((ma + mb) / sep ** 3);   // 开普勒第三定律：越近转得越快
    stars.sep = sep; stars.innerMass = ma + mb;
    stars.pMin = sep * 2.5;                              // 行星稳定下限
  }
  if (n === 3) {
    const c = stars[2];
    c.orbitR = Math.min(SYS_R_MAX - c.radius - 6, 400, Math.max(R.uni(230, 300), (stars.pMin + 60) / .35));   // 第三颗要远到容得下整串行星，但不能伸出星系范围 SYS_R_MAX
    c.phase = R.uni(0, TAU); c.speed = 12 * Math.sqrt((stars.innerMass + mass(c)) / c.orbitR ** 3);
    stars.pMax = c.orbitR * .35;                         // 行星稳定上限
  }
  return starCache[sys.i] = stars;
}
// ---------- 行星轨道排布：保证间距、星系范围不超过 SYS_R_MAX ----------
// 行星占的空间：带环 = 2.5 倍半径；卫星 = 最外一颗卫星的轨道 + 卫星自己的大小（和 main.js 里卫星的画法一致）；两者取大
const moonK = m => m <= 0 ? 1 : m <= 4 ? 2.33 + .97 * (m - 1) : Math.max(5.24, 4.97 + .18 * (m - 4));
const reach = p => p.radius * Math.max(p.ring ? 2.5 : 1, moonK(p.moons));
const apo = p => p.dist * (1 + (p.ecc || 0)), peri = p => p.dist * (1 - (p.ecc || 0));
const hasBelt = (sys, n) => !sys.belt && sys.cat !== 'compact' && n >= 4;   // 太阳系用自己的带；紧凑星系（行星挨得很近）没有带
const BELT_PAD = 4;                                                         // 小行星带离相邻行星占用空间的余量
// 从上到下依次尝试，第一个让星系范围 ≤ SYS_R_MAX 的就用：
//   keep = 排轨道时给每颗行星预留的偏心率；gap = 相邻行星之间球体的最小间距；belt = 第 3、4 颗之间的间距（含小行星带）
//   tight = 完全按最小间距紧凑排（不保留原来的随机间距）；strip = 最后手段：去掉环、气态巨行星最多留 1 颗卫星（只影响外观）
const RUNGS = [
  { keep: .05, gap: 8, belt: 18 }, { keep: .02, gap: 8, belt: 18 }, { keep: .02, gap: 6, belt: 16 }, { keep: 0, gap: 4, belt: 16 },
  { keep: 0, gap: 3, belt: 14 }, { keep: 0, gap: 2, belt: 12, tight: true }, { keep: 0, gap: 2, belt: 12, tight: true, strip: true }];
function layout(base, belt, r) {
  const pl = base.map(p => ({ radius: p.radius, ring: r.strip ? false : p.ring, moons: r.strip && p.kind === 'gas' ? Math.min(p.moons, 1) : p.moons, dist: p.dist, e0: p.ecc, ecc: Math.min(p.ecc, r.keep) }));
  const gapAt = i => belt && i === 3 ? r.belt : r.gap;   // i = 它与前一颗之间
  // 1) 从内到外：内侧远日点 + 两者占用空间 + 间距 ≤ 外侧近日点（偏心率先按 keep 预留，避免外圈越推越远）
  for (let i = 1; i < pl.length; i++) {
    const a = pl[i - 1], b = pl[i], need = (apo(a) + reach(a) + reach(b) + gapAt(i)) / (1 - b.ecc);
    b.dist = r.tight ? need : Math.max(b.dist, need);
  }
  // 2) 空隙有富余的行星，把偏心率放回去（不超过原来的）；相邻两颗的偏心率之和不会让轨道交叉或小于 gap
  for (let i = 0; i < pl.length; i++) {
    const a = pl[i - 1], b = pl[i], c = pl[i + 1];
    let cap = b.e0;
    if (a) cap = Math.min(cap, (b.dist - a.dist - reach(a) - reach(b) - gapAt(i) - a.dist * a.ecc) / b.dist);          // 前一颗已定
    if (c) cap = Math.min(cap, (c.dist - b.dist - reach(b) - reach(c) - gapAt(i + 1) - c.dist * c.ecc) / b.dist);      // 后一颗按预留
    b.ecc = Math.max(b.ecc, cap);
  }
  return pl;
}
const extentOf = pl => pl.reduce((m, p) => Math.max(m, apo(p) + reach(p)), 0);
// 只往外推（或压低偏心率），种类 / 半径 / 随机序列 / info 都不变；行星的 dist 变了就重算公转周期
function fitOrbits(planets, sys) {
  const belt = hasBelt(sys, planets.length); let best = null;
  for (const r of RUNGS) { best = layout(planets, belt, r); if (extentOf(best) <= SYS_R_MAX) break }
  planets.forEach((p, i) => {
    const q = best[i]; if (q.dist !== p.dist) { p.dist = q.dist; p.period = Math.pow(p.dist, 1.5) * .06 }
    p.ecc = q.ecc; p.ring = q.ring; p.moons = q.moons;
  });
}
// 星系的范围：最外圈行星的远日点 + 占用空间，或伴星的轨道（main.js 用它决定加载 / 卸载 / 进入 / 全景的半径）
const extCache = {};
export function sysExtent(sys) {
  if (extCache[sys.i] == null) extCache[sys.i] = Math.max(0, ...genPlanets(sys).map(p => apo(p) + reach(p)), ...genStars(sys).map(s => s.orbitR + s.radius));
  return extCache[sys.i];
}
// 小行星带的内外半径 [a, b]：太阳系用自己的 sys.belt；其他星系放在第 3、4 颗行星之间的空隙里；紧凑星系 / 空隙太小 = 没有带（null）
export function beltBand(sys, planets = genPlanets(sys)) {
  if (sys.belt) return sys.belt;
  if (!hasBelt(sys, planets.length)) return null;
  const p = planets[2], q = planets[3], lo = apo(p) + reach(p) + BELT_PAD, hi = peri(q) - reach(q) - BELT_PAD;
  if (hi - lo < 4) return null;
  const w = Math.min(hi - lo, 14), mid = (lo + hi) / 2;
  return [mid - w / 2, mid + w / 2];
}
const planetCache = {};
export function genPlanets(sys) {
  if (planetCache[sys.i]) return planetCache[sys.i];
  if (sys.real === 'sol') return planetCache[sys.i] = buildSolPlanets(sys);   // 真实星系：用真实数据
  if (sys.rid) return planetCache[sys.i] = buildRealPlanets(sys, genStars(sys));
  const R = makeRng(sys.seed), planets = [], stars = genStars(sys), ns = stars.length;
  const extent = ns > 1 ? Math.max(...stars.slice(0, 2).map(s => s.orbitR + s.radius)) : 0;
  let dist = 16 + (ns > 1 ? extent - 6 : 0);   // 多星系统行星轨道外移
  const OR = makeRng(sys.seed + 555);
  for (let i = 0; i < sys.nPlanets; i++) {
    dist += R.uni(9, 17);
    const kind = dist < 55 ? 'rock' : R.pick(['gas', 'gas', 'ice']);
    let radius, pal;
    if (kind === 'rock') {
      radius = R.uni(1, 2.2);
      pal = R.pick([[[.6, .4, .3], [.8, .6, .4]], [[.3, .5, .8], [.3, .7, .4]], [[.55, .55, .55], [.75, .72, .7]]])
    }
    else if (kind === 'gas') {
      radius = R.uni(3.5, 6);
      pal = R.pick([[[.85, .65, .4], [.95, .85, .65]], [[.7, .55, .4], [.9, .8, .6]]])
    }
    else {
      radius = R.uni(2.4, 3.8);
      pal = R.pick([[[.4, .7, .9], [.6, .85, 1]], [[.3, .45, .85], [.5, .65, .95]]])
    }
    const p = {
      idx: i, id: sys.i + ':' + i, name: sys.name + ' ' + ROMAN[i], kind, radius, dist,
      period: Math.pow(dist, 1.5) * .06, phase: R.uni(0, TAU), palette: pal,
      ring: kind === 'gas' && R.rand() < .55, moons: kind === 'rock' ? R.int(0, 1) : R.int(0, 3),
      tilt: R.uni(-.4, .4), seed: R.int(1, 1e6),
      ecc: OR.rand() < .2 ? OR.uni(.15, .4) : OR.uni(0, .08),
      inc: OR.rand() < .15 ? OR.uni(.12, .35) : Math.abs(OR.gauss(0, .04)),
      node: OR.uni(0, TAU),
      dir: OR.rand() < .07 ? -1 : 1
    };
    p.info = genInfo(p, R, ns); planets.push(p);
  }
  if (sys.cat) catTweak(sys, planets, ns);
  fitOrbits(planets, sys);   // 类别改完半径 / 轨道之后，统一排好间距，并保证星系范围 ≤ SYS_R_MAX
  return planetCache[sys.i] = planets;
}
