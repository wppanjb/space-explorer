// =====================================================================
// realsystems.js —— 真实恒星系库（第一批 11 个）+ 抽样 + 构建行星
//
// 数据来源：维基百科各系统条目（引用 NASA Exoplanet Archive 等观测结果），查证于 2026-11。
// 每个数据都标注来源，界面上据此显示「实测 / 推测 / 生成」：
//   实测 = 观测值（半长轴、偏心率、半径、质量、恒星参数）
//   推测 = 由观测值估算（温度、重力、缺少的半径/质量）
//   生成 = 游戏自己定的（大气、生命、资源、价值、地表示意图、压缩后的轨道/大小）
// 游戏里的距离和大小是「压缩」过的示意比例，不是真实比例。
//
// 字段：au 半长轴(天文单位) ecc 偏心率 re 半径(地球半径) m 质量(地球质量，视向速度法得到的是下限)
//      teq 平衡温度(K，只有 TRAPPIST-1 查到了) cand 候选行星(尚未确认)
// 以后要加星系：照着下面的格式往 LIB 里加一项就行，不用改别的地方。
// =====================================================================
import { makeRng } from './rng.js';
import { LIFE_BONUS, STAR_COLS } from './constants.js';
import { SRC } from './real.js';

const MJ = 317.83, RJ = 11.209;   // 木星质量/半径（地球 = 1）
const RS_AU = .00465047;          // 太阳半径（天文单位）

// 8 类现象（第 3 阶段会给每一类做专门的外观和规则；其余 8 类留给 2.0）
export const CATS = ['redDwarf', 'redGiant', 'hotJupiter', 'lava', 'ocean', 'superEarth', 'compact', 'circumbinary'];

// star.col = STAR_COLS 的序号（0 黄 1 黄白 2 橙 3 蓝白 4 红橙），star.r = 太阳半径，star.m = 太阳质量
export const LIB = [
  { id: 'proxima', name: 'Proxima Centauri', short: 'Proxima', ly: 4.25, cats: ['redDwarf'],
    star: { type: 'M5.5Ve', col: 4, teff: 2992, r: .1542, m: .1221 },
    planets: [
      { l: 'd', au: .02881, ecc: 0, re: .81, m: .26, per: 5.123 },
      { l: 'b', au: .04848, ecc: 0, m: 1.055, per: 11.185 },
      { l: 'c', au: 1.489, ecc: .04, m: 7, per: 1928, cand: true },
    ] },
  { id: 'trappist1', name: 'TRAPPIST-1', short: 'TRAPPIST-1', ly: 40.66, cats: ['redDwarf', 'compact'],
    star: { type: 'M8V', col: 4, teff: 2566, r: .1191, m: .0898 },
    planets: [
      { l: 'b', au: .01154, ecc: .0062, re: 1.116, m: 1.374, teq: 397.6, per: 1.511 },
      { l: 'c', au: .0158, ecc: .0065, re: 1.097, m: 1.308, teq: 339.7, per: 2.422 },
      { l: 'd', au: .02227, ecc: .0084, re: .77, m: .388, teq: 286.2, per: 4.049 },
      { l: 'e', au: .02925, ecc: .0051, re: .92, m: .692, teq: 249.7, per: 6.101 },
      { l: 'f', au: .03849, ecc: .0101, re: 1.045, m: 1.039, teq: 217.7, per: 9.208 },
      { l: 'g', au: .04683, ecc: .0021, re: 1.129, m: 1.321, teq: 197.3, per: 12.352 },
      { l: 'h', au: .06189, ecc: .0057, re: .775, m: .326, teq: 171.7, per: 18.773 },
    ] },
  { id: '51peg', name: '51 Pegasi', short: '51 Peg', ly: 50.64, cats: ['hotJupiter'],
    star: { type: 'G2V', col: 0, teff: 5768, r: 1.152, m: 1.09 },
    planets: [{ l: 'b', au: .05234, ecc: 0, re: 1.07 * RJ, m: .61 * MJ, per: 4.231 }] },
  { id: 'hd209458', name: 'HD 209458', short: 'HD 209458', ly: 157, cats: ['hotJupiter'],
    star: { type: 'G0V', col: 1, teff: 6071, r: 1.203, m: 1.148 },
    planets: [{ l: 'b', au: .04707, ecc: 0, re: 1.359 * RJ, m: .682 * MJ, per: 3.525 }] },
  { id: '55cnc', name: '55 Cancri', short: '55 Cnc', ly: 41.05, cats: ['lava'],
    // 恒星半径 0.94 太阳半径不是这次查证到的，只用来估算温度
    star: { type: 'K0IV-V', col: 2, teff: 5172, r: .94, m: .905 },
    planets: [
      { l: 'e', au: .01596, ecc: .01, re: 1.856, m: 7.74, per: .7365 },
      { l: 'b', au: .11718, ecc: .0013, m: .802 * MJ, per: 14.65 },
      { l: 'c', au: .2454, ecc: .03, m: .1588 * MJ, per: 44.4 },
      { l: 'f', au: .802, ecc: .063, m: 48.5, per: 260.6 },
      { l: 'd', au: 5.58, ecc: .0153, m: 3.23 * MJ, per: 5084 },
    ] },
  { id: 'kepler16', name: 'Kepler-16', short: 'Kepler-16', ly: 245.4, cats: ['circumbinary'],
    // 双星：A 与 B 绕共同质心转，行星绕着两颗一起转（teff 4450 K 不是这次查证到的，只用来估算温度）
    star: { type: 'K7V + M', col: 2, teff: 4450, r: .6489, m: .704 },
    star2: { type: 'M', col: 4, r: .22623, m: .2054, sepAu: .2257 },
    planets: [{ l: 'b', au: .7048, ecc: .0069, re: .7538 * RJ, m: .333 * MJ, per: 228.78 }] },
  { id: 'kepler90', name: 'Kepler-90', short: 'Kepler-90', ly: 2790, cats: ['compact'],
    star: { type: 'F9IV/V', col: 1, teff: 6080, r: 1.2, m: 1.2 },
    planets: [   // 内侧 6 颗的质量是由半径估算的，g、h 的质量是实测
      { l: 'b', au: .074, ecc: 0, re: 1.3, per: 7.008 },
      { l: 'c', au: .089, ecc: 0, re: 1.45, per: 8.719 },
      { l: 'i', au: .107, ecc: 0, re: 1.32, per: 14.449 },
      { l: 'd', au: .32, ecc: 0, re: 2.87, per: 59.74 },
      { l: 'e', au: .42, ecc: 0, re: 2.61, per: 91.94 },
      { l: 'f', au: .48, ecc: .01, re: 2.77, per: 124.9 },
      { l: 'g', au: .71, ecc: .0292, re: 7.72, m: 15, per: 210.7 },
      { l: 'h', au: 1.01, ecc: .0276, re: 11.25, m: 203, per: 331.6 },
    ] },
  { id: 'kepler186', name: 'Kepler-186', short: 'Kepler-186', ly: 579, cats: ['redDwarf'],
    star: { type: 'M1V', col: 4, teff: 3755, r: .523, m: .544 },
    planets: [
      { l: 'b', au: .0343, ecc: 0, re: 1.07, per: 3.887 },
      { l: 'c', au: .0451, ecc: 0, re: 1.25, per: 7.267 },
      { l: 'd', au: .0781, ecc: 0, re: 1.4, per: 13.343 },
      { l: 'e', au: .11, ecc: 0, re: 1.27, per: 22.408 },
      { l: 'f', au: .432, ecc: 0, re: 1.17, per: 129.94 },
    ] },
  { id: 'toi700', name: 'TOI-700', short: 'TOI-700', ly: 101.6, cats: ['redDwarf', 'superEarth'],
    star: { type: 'M2V', col: 4, teff: 3480, r: .42, m: .416 },
    planets: [
      { l: 'b', au: .0677, ecc: .04, re: .944, per: 9.977 },
      { l: 'c', au: .0916, ecc: .041, re: 2.65, m: 2.5, per: 16.051 },
      { l: 'e', au: .1321, ecc: .051, re: .931, per: 27.81 },
      { l: 'd', au: .161, ecc: .047, re: 1.156, m: 2.4, per: 37.42 },
    ] },
  { id: 'lhs1140', name: 'LHS 1140', short: 'LHS 1140', ly: 48.8, cats: ['redDwarf', 'superEarth', 'ocean'],
    // b 被认为可能是被海洋覆盖的世界（候选，尚无定论）
    star: { type: 'M4.5V', col: 4, teff: 3096, r: .2159, m: .1844 },
    planets: [
      { l: 'c', au: .027, ecc: 0, re: 1.272, m: 1.91, per: 3.778 },
      { l: 'b', au: .0946, ecc: 0, re: 1.73, m: 5.6, per: 24.737, ocean: true },
    ] },
  { id: 'kepler452', name: 'Kepler-452', short: 'Kepler-452', ly: 1810, cats: ['superEarth'],
    star: { type: 'G2V', col: 0, teff: 5757, r: 1.11, m: 1.037 },
    planets: [{ l: 'b', au: 1.046, ecc: 0, re: 1.5, m: 5, teq: 265, per: 384.8 }] },
];
export const byId = id => LIB.find(s => s.id === id);

// 真实星系只放真实已知的行星，不再补生成的行星（行星少的星系，完成星系的经验按行星数折算）
export const PAD_MIN = 0;
function padded(d, seed) {
  const n = Math.max(0, PAD_MIN - d.planets.length); if (!n) return [];
  const R = makeRng(seed + 5151); let a = Math.max(...d.planets.map(p => p.au)); const out = [];
  if (d.cats.includes('hotJupiter')) a = Math.max(a, .6);   // 热木星附近很少有近距离的同伴，补的行星放远一点
  for (let k = 0; k < n; k++) {
    a *= R.uni(2, 3.2);   // 排在最外侧已知行星之外
    const re = a < .5 ? R.uni(.8, 2.2) : a < 2 ? R.uni(1, 3.2) : R.pick([R.uni(3, 4.5), R.uni(8, 11)]);
    out.push({ l: 'X' + (k + 1), au: +a.toFixed(3), ecc: +R.uni(0, .08).toFixed(3), re: +re.toFixed(2), per: +(365.25 * Math.sqrt(a ** 3 / d.star.m)).toFixed(1), padded: true });
  }
  return out;
}

// ---------- 每局抽样 ----------
// 1) 从 8 类里抽 2~3 类作为本局类别；2) 从库里抽 12~15 个真实系统（先取属于本局类别的，不够再用别的补满）
// 3) 随机放进 44 个非太阳系的位置。用独立的随机数，不影响其余宇宙生成。
function shuffle(R, a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = R.int(0, i);[a[i], a[j]] = [a[j], a[i]] } return a }
export function sampleReal(list) {
  const R = makeRng(list[1].seed + 9001);
  const cats = shuffle(R, CATS).slice(0, R.int(2, 3));
  const eligible = LIB.filter(s => s.cats.some(c => cats.includes(c))), rest = LIB.filter(s => !eligible.includes(s));
  const target = Math.min(LIB.length, R.int(12, 15));
  const chosen = [...shuffle(R, eligible), ...shuffle(R, rest)].slice(0, target);
  const slots = shuffle(R, list.slice(1).map(s => s.i));
  chosen.forEach((d, k) => {
    const s = list[slots[k]];
    Object.assign(s, {
      name: d.name, color: STAR_COLS[d.star.col], radius: starRadius(d.star.r), nPlanets: Math.max(PAD_MIN, d.planets.length),
      real: 'sys', rid: d.id, cats: d.cats, cat: d.cats[0], ly: d.ly, flare: d.cats.includes('redDwarf') ? 2.5 : 1,
    });
  });
  list.cats = cats;   // 本局启用的类别（第 3 阶段起，程序生成的星系也会按它来）
  return chosen.map(d => d.id);
}
// 恒星大小（游戏单位）：太阳 = 7.5，红矮星约 5，大恒星最大 9
const starRadius = rs => Math.min(9, Math.max(3.2, +(3.5 + 4 * Math.sqrt(rs)).toFixed(2)));

// ---------- 恒星（含双星） ----------
export function buildRealStars(sys) {
  const d = byId(sys.rid), a = { color: STAR_COLOR(d.star.col), radius: starRadius(d.star.r), orbitR: 0, speed: 0, phase: 0 };
  const stars = [a];
  if (d.star2) {
    const b = { color: STAR_COLOR(d.star2.col), radius: starRadius(d.star2.r), orbitR: 0, speed: 0, phase: 0 };
    const ma = d.star.m, mb = d.star2.m, sep = a.radius + b.radius + 10;
    a.orbitR = sep * mb / (ma + mb); b.orbitR = sep * ma / (ma + mb);
    a.phase = (sys.seed % 628) / 100; b.phase = a.phase + Math.PI;
    a.speed = b.speed = 12 * Math.sqrt((ma + mb) / sep ** 3);
    stars.push(b); stars.sep = sep; stars.innerMass = ma + mb; stars.pMin = sep * 2.5;
  }
  return stars;
}
const STAR_COLOR = i => STAR_COLS[i];

// ---------- 行星 ----------
const rockRes = ['金属矿', '稀土', '水冰', '晶体', '硅酸盐'];
const massFromRadius = re => re < 1.6 ? re ** 3.5 : re < 10 ? (re / .9) ** (1 / .59) : 300;   // 由半径估算质量
const radiusFromMass = m => m < 2 ? m ** .28 : m < 130 ? .9 * m ** .59 : 11;                  // 由质量估算半径
const kindOf = re => re < 2 ? 'rock' : re < 6 ? 'ice' : 'gas';
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const gameRadius = (kind, re) => kind === 'rock' ? clamp(.6 + 1.4 * re, 1, 2.9) : kind === 'ice' ? clamp(2.4 + .35 * (re - 1.8), 2.4, 3.8) : clamp(4 + .25 * (re - 6), 4, 6.2);
const distOf = au => 18 + 12 * (Math.log10(au) + 2);   // 对数压缩：保持由近到远的顺序，间距够开

// 平衡温度（K）：优先用查到的值，没有就按恒星温度、半径和轨道估算（反照率 0.3）
const teqOf = (d, q) => q.teq ?? d.star.teff * Math.sqrt(d.star.r * RS_AU / (2 * q.au)) * .7 ** .25;
// 示意图用的行星列表：游戏里有这个系统就用游戏里的（含补的推测行星），没有就只用已知行星
export function figPlanets(d, pls) {
  if (pls) return pls.map(p => ({ l: p.name.split(' ').pop(), au: p.au, re: p.earthR, t: p.info.temp + 273.15, padded: p.padded }));
  return d.planets.map(q => ({ l: q.l, au: q.au, re: q.re ?? radiusFromMass(q.m), t: teqOf(d, q) }));
}
export function buildRealPlanets(sys, st) {   // st = genStars(sys)（恒星信息，双星的行星要在稳定轨道之外）
  const d = byId(sys.rid), R = makeRng(sys.seed + 4321);
  const rsAU = d.star.r * RS_AU;
  const minD = Math.max(st.pMin ? st.pMin + 4 : 0, st.reduce((m, s) => Math.max(m, s.radius + s.orbitR), 0) + 12);
  let prev = -1e9;
  return d.planets.concat(padded(d, sys.seed)).sort((x, y) => x.au - y.au).map((q, i) => {
    const estR = q.re == null, estM = q.m == null;
    const re = estR ? radiusFromMass(q.m) : q.re, m = estM ? massFromRadius(re) : q.m;
    const kind = kindOf(re), radius = gameRadius(kind, re);
    const dist = prev = Math.max(distOf(q.au), minD, prev + 9);
    const teq = teqOf(d, q);
    const temp = Math.round(teq - 273.15), g = +(m / re ** 2).toFixed(2);
    // ---- 以下是游戏自己定的（生成） ----
    let atm, res, life = '无';
    if (kind === 'rock') {
      atm = teq > 900 ? '无' : teq > 330 ? R.pick(['有毒', '无', '浓厚']) : teq > 150 ? R.pick(['稀薄', '浓厚', '浓厚', '宜居']) : R.pick(['无', '稀薄']);
      if (q.ocean) atm = '宜居';
      res = teq > 900 ? '金属矿' : R.pick(rockRes);
      if (atm === '宜居') { const L = R.rand(); life = L < .5 ? '微生物' : L < .8 ? '植物' : '无' }
    } else if (kind === 'gas') { atm = '浓厚（氢氦）'; res = R.pick(['氢气', '氦-3', '氨']) }
    else { atm = '浓厚（氢氦）'; res = R.pick(['水冰', '甲烷冰', '氨冰']) }
    let value = 50 + Math.round(radius * 12) + (LIFE_BONUS[life] || 0);
    if (['晶体', '稀土', '氦-3'].includes(res)) value += 100;
    if (atm === '宜居') value += 100;
    // 行星类别（决定第一次扫描时显示哪条知识）：海洋 > 熔岩 > 热木星 > 超级地球
    const cat = q.ocean ? 'ocean' : kind === 'rock' && teq > 900 ? 'lava' : kind === 'gas' && teq > 1000 ? 'hotJupiter' : kind === 'rock' && re >= 1.25 ? 'superEarth' : null;
    const glow = kind === 'rock' && teq > 900 ? [1, .35, .05] : kind === 'gas' && teq > 1000 ? [.9, .35, .1] : null;   // 太热的行星会自己发光
    const palette = q.ocean ? [[.08, .22, .55], [.2, .5, .8]] : kind === 'rock' ? (teq > 900 ? [[.35, .1, .05], [1, .45, .1]] : teq > 330 ? [[.6, .4, .3], [.8, .6, .4]] : teq > 200 ? [[.3, .5, .8], [.3, .7, .4]] : [[.55, .55, .55], [.75, .72, .7]])
      : kind === 'gas' ? (teq > 1000 ? [[.2, .2, .3], [.55, .35, .45]] : [[.85, .65, .4], [.95, .85, .65]]) : [[.4, .7, .9], [.6, .85, 1]];
    return {
      idx: i, id: sys.i + ':' + i, name: d.short + ' ' + q.l, kind, radius, dist,
      period: Math.pow(dist, 1.5) * .06, phase: R.uni(0, 6.283), palette, ring: false,
      moons: 0, knownMoons: 0, tilt: R.uni(-.4, .4), seed: R.int(1, 1e6),
      ecc: Math.min(.4, q.ecc || 0), inc: Math.abs(R.gauss(0, .03)), node: R.uni(0, 6.283), dir: 1,
      home: false, real: true, sysLy: d.ly, cat, glow, glowI: glow ? (kind === 'rock' ? .6 : .35) : 0, cand: !!q.cand, padded: !!q.padded, au: q.au, periodDays: q.per, earthR: +re.toFixed(2), earthM: +m.toFixed(2),
      src: {
        orbit: q.padded ? SRC.estimated : SRC.measured, size: estR || q.padded ? SRC.estimated : SRC.measured, mass: estM ? SRC.estimated : SRC.measured,
        env: SRC.estimated, atm: SRC.generated, life: SRC.generated, res: SRC.generated, value: SRC.generated, art: SRC.generated,
      },
      info: { atm, temp, g, res, life, value, fuelGain: kind === 'gas' ? 25 : 10 },
    };
  });
}
