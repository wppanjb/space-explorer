// =====================================================================
// real.js —— 真实天体数据（目前只有太阳系；以后真实星系库也放这里）
//
// 每个数据都标注来源，界面上据此显示「实测 / 推测 / 生成」：
//   实测 = 来自天文观测（NASA 行星资料表 https://nssdc.gsfc.nasa.gov/planetary/factsheet/ ）
//   推测 = 由已知数据估算
//   生成 = 游戏自己定的（资源、样本价值、地表示意图、压缩后的轨道/大小等）
// 游戏里的距离和大小是「压缩」过的示意比例：dist = 30 × √AU，radius 为游戏单位。
// =====================================================================
import { makeRng } from './rng.js';
import { STAR_COLS, LIFE_BONUS } from './constants.js';

export const SRC = { measured: '实测', estimated: '推测', generated: '生成' };

const DEG = Math.PI / 180;
const RARE = ['晶体', '稀土', '氦-3'];

// 太阳系。ecc/inc/tilt 都是实测值（inc、tilt 单位：度）；au = 半长轴；
// radius = 游戏里的显示大小（压缩）；knownMoons = 已知卫星数（NASA 行星资料表，会随新发现增加）
// 游戏里实际画出的卫星数按 shownMoons() 缩小，卡片上写真实数量
export const SOL = {
  sysName: 'Sol',            // 星系名（IAU 名称，即太阳）
  star: { color: STAR_COLS[0], radius: 7.5, type: 'G2V' },   // G 型黄矮星
  belt: [46, 54],            // 小行星带（火星与木星之间，游戏距离）
  scanCount: 7,              // 可扫描的行星数（地球是出发点，不可扫描）
  planets: [
    { name: '水星', kind: 'rock', au: .387, ecc: .206, inc: 7.0, tilt: .034, radius: 1.0, knownMoons: 0, ring: false,
      palette: [[.52, .49, .47], [.72, .68, .64]], atm: '无', temp: 167, g: .38, res: '金属矿', life: '无' },
    { name: '金星', kind: 'rock', au: .723, ecc: .007, inc: 3.4, tilt: 177.4, radius: 1.9, knownMoons: 0, ring: false,
      palette: [[.9, .78, .5], [.96, .88, .66]], atm: '有毒', temp: 464, g: .91, res: '硅酸盐', life: '无' },
    { name: '地球', kind: 'rock', au: 1.0, ecc: .017, inc: 0, tilt: 23.4, radius: 2.0, knownMoons: 1, ring: false, home: true,
      palette: [[.18, .38, .75], [.25, .6, .33]], atm: '宜居', temp: 15, g: 1.0, res: '水冰', life: '动物' },
    { name: '火星', kind: 'rock', au: 1.524, ecc: .094, inc: 1.8, tilt: 25.2, radius: 1.3, knownMoons: 2, ring: false,
      palette: [[.7, .34, .2], [.86, .56, .36]], atm: '稀薄', temp: -65, g: .38, res: '水冰', life: '无' },
    { name: '木星', kind: 'gas', au: 5.204, ecc: .049, inc: 1.3, tilt: 3.1, radius: 6.0, knownMoons: 95, ring: false,
      palette: [[.78, .6, .44], [.94, .86, .74]], atm: '浓厚（氢氦）', temp: -110, g: 2.36, res: '氢气', life: '无' },
    { name: '土星', kind: 'gas', au: 9.572, ecc: .052, inc: 2.5, tilt: 26.7, radius: 5.2, knownMoons: 274, ring: true,
      palette: [[.85, .75, .5], [.94, .88, .7]], atm: '浓厚（氢氦）', temp: -140, g: .92, res: '氦-3', life: '无' },
    { name: '天王星', kind: 'ice', au: 19.16, ecc: .047, inc: .8, tilt: 97.8, radius: 3.6, knownMoons: 28, ring: false,
      palette: [[.5, .8, .84], [.7, .9, .93]], atm: '浓厚（氢氦）', temp: -195, g: .89, res: '甲烷冰', life: '无' },
    { name: '海王星', kind: 'ice', au: 30.18, ecc: .010, inc: 1.8, tilt: 28.3, radius: 3.5, knownMoons: 16, ring: false,
      palette: [[.22, .38, .86], [.4, .56, .96]], atm: '浓厚（氢氦）', temp: -200, g: 1.12, res: '水冰', life: '无' },
  ],
};

/** 游戏里画几颗卫星：≤2 颗照实画；更多时取平方根，最多 12 颗（太多会挤成一团，大部分真实卫星也只有几公里大） */
export const shownMoons = n => n <= 2 ? n : Math.min(12, Math.round(Math.sqrt(n)));

/** 把太阳系数据变成和程序生成的行星一样的对象（字段完全兼容） */
export function buildSolPlanets(sys) {
  const R = makeRng(sys.seed + 1234);
  return SOL.planets.map((d, i) => {
    const radius = d.radius, dist = 30 * Math.sqrt(d.au);
    let value = 50 + Math.round(radius * 12) + (LIFE_BONUS[d.life] || 0);
    if (RARE.includes(d.res)) value += 100;
    if (d.atm === '宜居') value += 100;
    return {
      idx: i, id: sys.i + ':' + i, name: d.name, kind: d.kind, radius, dist,
      period: Math.pow(dist, 1.5) * .06, phase: R.uni(0, 6.283), palette: d.palette,
      ring: d.ring, moons: shownMoons(d.knownMoons), knownMoons: d.knownMoons, tilt: d.tilt * DEG, seed: R.int(1, 1e6),
      ecc: d.ecc, inc: d.inc * DEG, node: R.uni(0, 6.283), dir: 1,
      home: !!d.home,   // 出发点：不可扫描、始终已知
      real: true,
      src: { orbit: SRC.measured, size: SRC.measured, env: SRC.measured, life: SRC.measured, res: SRC.generated, value: SRC.generated, art: SRC.generated },
      info: { atm: d.atm, temp: d.temp, g: d.g, res: d.res, life: d.life, value, fuelGain: d.kind === 'gas' ? 25 : 10 }
    };
  });
}
