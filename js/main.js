// Deep Space Explorer — 主程序：状态、渲染、输入、主循环与界面
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { VERSION, TAU, GR, ROMAN, STAR_COLS, SAVE_KEY, FRAG_N, FRAG_TEXT, LIFE_BONUS } from './constants.js';
import { mulberry32, makeRng, lerp } from './rng.js';
import { genGalaxy, genBackground, genNebulae, genSystems, genPlanets, genStars } from './universe.js';
import { genFragments, fragKind } from './story.js';
import { byId, figPlanets } from './realsystems.js';
import { beep } from './audio.js';
import { soft, disc, planetTexture, pointCloud } from './graphics.js';
import { drawPlanetCard, drawSysPanorama } from './cards.js';
import { T } from './text.js';
import { BANK } from './quizbank.js';
import * as H from './templates.js';


const $ = id => document.getElementById(id);

// =====================================================================
// 存档 & 状态
// =====================================================================
const params = new URLSearchParams(location.search);
// 测试结局用：?end=fall 把飞船放在离奇点 100 u 处、朝向奇点（往前飞就会越过不可回头点）；?end=scan 放在 80 u 处，可以直接扫描奇点。
// 测试模式用的是一份临时存档：不读也不写真实存档（可以和 ?seed= 一起用）。
const TEST_END = params.get('end');
const testSave = () => ({ seed: parseInt(params.get('seed')) || 42, credits: 3000, up: {}, hull: 100, cargo: { '金属矿': 3, '水冰': 2 }, sampled: [], discovered: [], beacons: [], visited: [0], probed: [], ended: false,
  frags: 7, playTime: 1, xp: 4000, xpv: 2, panos: {}, rankSeen: 5, done: [0], fuel: 100, pos: [0, 0, TEST_END === 'scan' ? 80 : 100], quat: [0, 0, 0, 1] });
function loadSave() { if (TEST_END) return testSave(); try { return JSON.parse(localStorage.getItem(SAVE_KEY)) } catch { return null } }
let save = loadSave();
const urlSeed = parseInt(params.get('seed'));
if (urlSeed && save && save.seed !== urlSeed) save = null;
const seed = urlSeed || save?.seed || 42;

const R0 = makeRng(seed);
const GAL = genGalaxy(R0), BG = genBackground(R0), NEB = genNebulae(R0), systems = genSystems(R0, GAL);

// 主线碎片：从母星系出发，逐步向银心推进（偶数序号=扫描异常行星，奇数序号=寻找信标）
const fragSys = genFragments(seed, systems);
const fragPlanetIdx = k => systems[fragSys[k]].seed % systems[fragSys[k]].nPlanets;
// 当前主线要扫描的那颗行星（同时存在两个星系时，副星系只显示它）
const isQuestPlanet =p => qOn() &&  fragKind(frags) === 'planet' && p.id === fragSys[frags] + ':' + fragPlanetIdx(frags);

let credits = save?.credits ?? 0;
const up = Object.assign({ engine: 0, tank: 0, scanner: 0, boost: 0, cargo: 0 }, save?.up || {});
const discovered = new Set(save?.discovered || []);
const beaconsGot = new Set(save?.beacons || []);
const visited = new Set(save?.visited || []);
for (const id of [...discovered]) { const [si, pi] = id.split(':').map(Number); const sy = systems[si]; if (!sy || !(pi < genPlanets(sy).length)) discovered.delete(id) }   // 旧存档里已不存在的行星（比如以前补的推测行星）直接去掉
const probed = new Set(save?.probed || []);
let bhDone = !!save?.ended;
let secret = !!save?.secret;   // 扫描奇点后得知「生命的秘密」（称号、培育舱伏笔）
const xpSeen = new Set(save?.xpSeen ?? (save?.discovered || []));   // 已给过首次扫描经验的行星：失败后收藏归零、重新扫描不再给经验
const panoGiven = new Set((save?.panoGiven ?? Object.keys(save?.panos || {})).map(String));   // 已给过全景奖励的星系
let frags = Math.min(FRAG_N, save?.frags ?? 0), playTime = save?.playTime ?? 0;
// ===== 军衔与经验 =====
const RANK_QUESTS = [0, 1, 2, 4, 7, 7];   // 各军衔已解锁的主线数量
const RANKS = T.rankNames.map((name, i) => ({ name, quests: RANK_QUESTS[i] }));
const RANK_NEED = [150, 500, 1200, 2500, 4000];   // 升到下一级所需的【累计】经验
const OLD_NEED = [100, 300, 500, 1000, 2000];     // 旧版（xpv 1）门槛，只用来迁移旧存档
const PLANET_XP = p => p.cat ? 25 : p.kind === 'rock' ? 8 : 12;   // 首次扫描行星：特别类别最多，岩石最少
const XP = { unlock: 15, beacon: 8, frag: 100, bh: 300, pano: 10 };
const rankOf = x => RANK_NEED.filter(n => x >= n).length;
const sent = { cards: new Set(save?.sent?.cards || []), panos: { ...(save?.sent?.panos || {}) } };   // 已传回地球的收藏：行星卡编号；全景图 = 星系编号 → 传回时那张图的拍摄时间（重拍之后就算新的、没传回）。失败时只有这些会保留
const panos = save?.panos || {};   // 星系全景图：星系编号 → { t 拍摄时间, ids 拍摄时已扫描的行星, star 主恒星是否已扫描 }
const doneSys = new Set(save?.done ?? (save ? systems.filter(s => genPlanets(s).every(p => p.home || discovered.has(p.id))).map(s => s.i) : []));
let xp = save?.xp ?? (save ? discovered.size * 10 + beaconsGot.size * 5 + frags * 50 + doneSys.size * 30 : 0);   // 旧存档按已有进度估算
const rankTarget = () => doneSys.has(0) ? rankOf(xp) : 0;     // 经验够了的军衔（家园星系没扫完前一直是实习生）
let rankSeen = save?.rankSeen ?? (save ? ((save.xpv || 1) >= 2 ? rankTarget() : (doneSys.has(0) ? OLD_NEED.filter(n => xp >= n).length : 0)) : 0);   // 玩家已被授予的军衔：晋升弹窗之后才会提高
if (save && (save.xpv || 1) < 2) {   // 旧存档：军衔不变，经验按在本级里的进度折算到新门槛
  const r = rankSeen, lo = r ? OLD_NEED[r - 1] : 0, hi = OLD_NEED[r], nlo = r ? RANK_NEED[r - 1] : 0;
  xp = hi == null ? Math.max(xp, RANK_NEED[4]) : Math.round(nlo + Math.max(0, Math.min(.99, (xp - lo) / (hi - lo))) * (RANK_NEED[r] - nlo));
}
let collectPending = false, welcomed = !!save;   // 新游戏：移动教学完成后再显示欢迎
const rank = () => rankSeen;
const qOn = () => frags < FRAG_N && frags < RANKS[rank()].quests;   // 下一块碎片是否已解锁
const bhOn = () => frags >= FRAG_N && !bhDone && rank() >= 5;        // 奇点任务是否已解锁
function addXp(n) { xp += n }
const sysGain = s => s.i === 0 ? 80 : 40 + 5 * genPlanets(s).filter(p => !p.home).length;   // 完成星系：固定 40 + 每颗行星 5（不随军衔增长）；太阳系训练固定 80
const maxSpeed = () => (30 + 10 * up.engine) * (hull < 25 ? .6 : 1), fuelMax = () => 100 + 40 * up.tank,
  scanRange = () => 90 + 30 * up.scanner, scanTime = () => Math.max(1, 3 - .4 * up.scanner), energyMax = () => 100 + 30 * up.boost;
const AIM_TOL = .035;                               // 单颗扫描（F / 左键）的瞄准容差（弧度）：行星要对准准星
const multiTol = () => AIM_TOL + .03 * up.scanner;  // 范围扫描圈的半径（弧度）：扫描仪每升一级，圈变大一点
const MULTI_KEY = 'KeyV';                          // 范围扫描的键（另有鼠标右键）；想换键只改这里（G 是曲速，不能用）
let fuel = Math.min(save?.fuel ?? fuelMax(), fuelMax()), energy = energyMax();
const HULL_MAX = 100; let hull = Math.min(save?.hull ?? HULL_MAX, HULL_MAX);
const cargo = save?.cargo || {};                 // 货舱：{ 资源名: 数量 }
const sampled = new Set(save?.sampled || []);    // 已采样的行星 id（每颗只采一次）
const cargoMax = () => 20 + 10 * up.cargo, cargoUsed = () => Object.values(cargo).reduce((a, b) => a + b, 0);

function doSave() {
  if (TEST_END) return;   // 测试结局模式不写存档
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      seed, credits, up, hull, cargo, sampled: [...sampled], discovered: [...discovered],
      beacons: [...beaconsGot], visited: [...visited], probed: [...probed], ended: bhDone, secret, quiz, xpSeen: [...xpSeen], panoGiven: [...panoGiven], sent: { cards: [...sent.cards], panos: sent.panos }, frags, playTime, xp, xpv: 2, panos, rankSeen, done: [...doneSys],fuel, pos: ship.pos.toArray(), quat: ship.quat.toArray()
    }))
  } catch { }
}

// =====================================================================
// 渲染基础
// =====================================================================
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.insertBefore(renderer.domElement, document.body.firstChild);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, .1, 30000);
scene.add(new THREE.AmbientLight(0x223355, .45));
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
// 辉光效果：UnrealBloomPass
const bloom = new UnrealBloomPass(
  new THREE.Vector2(innerWidth, innerHeight),
  .25,  // strength: intensity
  .3,  // radius: how widely the glow spreads
  .5  // threshold: brightness a pixel must reach to glow
);
composer.addPass(bloom); composer.addPass(new OutputPass());


scene.add(pointCloud(BG, 14));
scene.add(pointCloud(GAL, 2.2, .6, 150));
for (const n of NEB) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: soft, color: new THREE.Color(...n.c), opacity: n.o,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  }));
  s.position.set(...n.p); s.scale.setScalar(n.s); scene.add(s)
}

// 银心奇点
const bh = new THREE.Group(); scene.add(bh);
bh.add(new THREE.Mesh(new THREE.SphereGeometry(5, 32, 32), new THREE.MeshBasicMaterial({ color: 0 })));
let bhDisk;
{
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 40, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.15, 'rgba(255,200,110,.95)');
  gr.addColorStop(.5, 'rgba(255,110,40,.4)'); gr.addColorStop(1, 'rgba(255,60,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  bhDisk = new THREE.Mesh(new THREE.RingGeometry(6.5, 34, 128), new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(c),
    transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
  }));
  bhDisk.rotation.x = -Math.PI / 2 + .25; bh.add(bhDisk);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: soft, color: 0xffb060, opacity: .5, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false
  })); halo.scale.setScalar(70); bh.add(halo)
}

// 远处恒星标记
const markers = systems.map(s => {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: soft, color: new THREE.Color(...s.color), opacity: 1,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  }));
  sp.position.copy(s.pos); sp.scale.setScalar(14 + 5 * (genStars(s).length - 1)); scene.add(sp); return sp
});

// 飞行尘埃
const DUST_N = 200, DUST_R = 100, dustPos = new Float32Array(DUST_N * 3);
for (let i = 0; i < DUST_N * 3; i++)dustPos[i] = (Math.random() - .5) * DUST_R * 2;
const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dust = new THREE.Points(dustGeo,
  new THREE.PointsMaterial({
    size: .15, map: soft, color: 0xc8d4e8, transparent: true, opacity: .3,
    depthWrite: false, blending: THREE.AdditiveBlending
  })
);

dust.frustumCulled = false; scene.add(dust);

// =====================================================================
// 飞船
// =====================================================================
const UP = new THREE.Vector3(0, 1, 0);
const ship = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), vel: new THREE.Vector3() };
if (save?.pos) { ship.pos.fromArray(save.pos); ship.quat.fromArray(save.quat) }
else {
  const h = systems[0], RR = 100;
  let best = null, bm = -1e9;
  for (let a = 0; a < 360; a += 10) {
    const r = a * Math.PI / 180;
    const p = new THREE.Vector3(Math.sin(r) * RR, 20, Math.cos(r) * RR).add(h.pos);
    let other = 1e9;
    for (const s of systems) if (s !== h) other = Math.min(other, s.pos.distanceTo(p));
    if (other - RR > bm) { bm = other - RR; best = p }   // 其他恒星比家园恒星远多少，越大越好
  }
  ship.pos.copy(best);
  ship.quat.setFromRotationMatrix(new THREE.Matrix4().lookAt(ship.pos, h.pos, UP));
}

// =====================================================================
// 恒星系 LOD
// =====================================================================
const labelsEl = $('labels');
const loaded = [];   // 同时存在的恒星系（附近的都会加载，避免“最近恒星”变化时场景被整体替换）
let cur = null;      // 其中离玩家最近的一个（仅用于界面显示）
function mkLabel(cls) { const d = document.createElement('div'); if (cls) d.className = cls; labelsEl.appendChild(d); return d }

// 为信标挑选位置：保证“本星系的恒星”是该点最近的恒星（并留出余量），
// 这样飞向信标时不会因为邻近恒星变成“最近”而把星系切走
function beaconSpot(sys, R, rMax) {
  let best = null, bm = -1e9;
  for (let t = 0; t < 40; t++) {
    const an = R.uni(0, TAU), r = R.uni(25, rMax), y = R.uni(-15, 15);
    const p = new THREE.Vector3(Math.cos(an) * r, y, Math.sin(an) * r), gp = p.clone().add(sys.pos);
    let other = 1e9; for (const s of systems) { if (s === sys) continue; const d = s.pos.distanceTo(gp); if (d < other) other = d }
    const margin = other - p.length();
    if (margin >= 30) return p;
    if (margin > bm) { bm = margin; best = p }
  }
  return best;
}

function solveE(M, e) { let E = M; for (let k = 0; k < 6; k++)E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); return E }
const orbitPos = (p, E, out) => out.set(p.dist * (Math.cos(E) - p.ecc), 0, -p.dist * Math.sqrt(1 - p.ecc * p.ecc) * Math.sin(E));
function buildSystem(sys) {
  const g = new THREE.Group(); g.position.copy(sys.pos); scene.add(g);
  const sc = new THREE.Color(...sys.color);
  const stars = genStars(sys).map((st, k) => {
    const col = new THREE.Color(...st.color);
    const mesh = new THREE.Group(); g.add(mesh);   // 一颗恒星 = 一个组：圆盘 + 光晕
    const body = new THREE.Sprite(new THREE.SpriteMaterial({ map: disc, color: col, depthWrite: false }));
    body.scale.setScalar(st.radius * 2); body.renderOrder = k * 2 + 1; mesh.add(body);   // 圆盘盖在自己的光晕上面
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: soft, color: col, opacity: .9, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    glow.scale.setScalar(st.radius * 6); glow.renderOrder = k * 2; mesh.add(glow);
    const light = new THREE.PointLight(col, k === 0 ? 4 : 2.4, 0, 0); g.add(light);
    return { st, mesh, light, base: k === 0 ? 4 : 2.4, label: k > 0 ? mkLabel() : null };
  });
  const star = stars[0].mesh, light = stars[0].light;   // 兼容原有代码
  const orbits = [], planets = genPlanets(sys).map(p => {
    const pivot = new THREE.Group(); g.add(pivot);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(p.radius, 48, 48),
      new THREE.MeshStandardMaterial({ map: planetTexture(p), roughness: .9, metalness: 0, ...(p.glow ? { emissive: new THREE.Color(...p.glow), emissiveMap: planetTexture(p), emissiveIntensity: p.glowI } : {}) }));   // 熔岩 / 热木星：自己发光
    orbitPos(p, solveE(p.phase, p.ecc), mesh.position);
    mesh.rotation.z = p.tilt; pivot.add(mesh);
    pivot.rotation.set(p.inc, p.node, 0, 'YXZ');
    if (p.ring) {
      const r = new THREE.Mesh(new THREE.RingGeometry(p.radius * 1.5, p.radius * 2.5, 96),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(...p.palette[1]), transparent: true, opacity: .55, side: THREE.DoubleSide }));
      r.rotation.x = Math.PI / 2 - .3; mesh.add(r)
    }
    const moons = [];
    for (let i = 0; i < p.moons; i++) {
      const mp = new THREE.Group(); mesh.add(mp); mp.rotation.y = i * 2.4;   // 起始角度错开，卫星多时不会排成一条线
      // 前 4 颗按原来的大小和间距；第 5 颗起是小卫星，间距压紧（真实的巨行星有几十到上百颗卫星，大多很小）
      const big = i < 4, rad = big ? .13 + .07 * i : .07, dist = big ? 2.2 + i * .9 : 4.9 + (i - 3) * .18;
      const m = new THREE.Mesh(new THREE.SphereGeometry(p.radius * rad, big ? 16 : 8, big ? 16 : 8),
        new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 1 }));
      m.position.x = p.radius * dist; mp.add(m); moons.push({ pivot: mp, speed: 2.5 / (1 + i * .6) })
    }
    const pts = []; for (let i = 0; i <= 256; i++) {
      const a = i / 256 * TAU;
      pts.push(orbitPos(p, a, new THREE.Vector3()))
    }
    const orbitLine = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x4466aa, transparent: true, opacity: .3 }));
    orbitLine.rotation.copy(pivot.rotation);
    g.add(orbitLine); orbits.push(orbitLine);
    return { p, pivot, mesh, moons, label: mkLabel(), M: p.phase };
  });

  let belt = null;
  if (sys.belt || planets.length >= 4) {   // 太阳系的带在火星与木星之间（sys.belt），其他星系在第 3 颗行星外
    // 小行星带：在第 3 颗行星轨道外，随机分布在两条半径之间
    // a = 内半径，b = 外半径，随机分布在 a~b 之间
    const a = sys.belt ? sys.belt[0] : planets[2].p.dist + 6, b = sys.belt ? sys.belt[1] : planets[2].p.dist + 12;
    belt = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.35, 0), new THREE.MeshStandardMaterial({ color: 0x8a8070, roughness: 1 }), 700);
    const rng = mulberry32(sys.seed), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let i = 0; i < 700; i++) {
      const an = rng() * TAU, r = a + rng() * (b - a);
      e.set(rng() * 6, rng() * 6, rng() * 6); q.setFromEuler(e);
      m.compose(new THREE.Vector3(Math.cos(an) * r, (rng() - .5) * 1.6, Math.sin(an) * r), q, new THREE.Vector3().setScalar(.4 + rng() * 1.3));
      belt.setMatrixAt(i, m)
    }
    belt.userData = { a, b }; g.add(belt);
  }

  // 信标
  const R2 = makeRng(sys.seed + 777), beacons = [], lastD = planets[planets.length - 1].p.dist, nb = sys.i === 0 ? 1 : R2.int(1, 2);
  for (let k = 0; k < nb; k++) {
    const id = sys.i + ':b' + k; R2.uni(0, TAU); R2.uni(25, lastD + 15); R2.uni(-15, 15);   // 保持奖励的随机序列不变
    const spot = beaconSpot(sys, makeRng(sys.seed + 555 + k), lastD + 15);
    const reward = { credits: R2.int(150, 400), fuel: R2.rand() < .5 ? R2.int(25, 50) : 0 };
    if (beaconsGot.has(id)) continue;
    const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(1.6), new THREE.MeshBasicMaterial({ color: 0xffd27a, wireframe: true }));
    const local = spot; mesh.position.copy(local); g.add(mesh);
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({
      map: soft, color: 0xffc860, opacity: .9, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false
    })); gl.scale.setScalar(14); mesh.add(gl);
    beacons.push({ id, mesh, glow: gl, local, reward, ...beaconInfo(sys, k), label: mkLabel('bc') });
  }
  // 主线信标：如果当前主线要求寻找信标，且它在本星系，则额外生成一个
  // Add fade=0 属性，便于在主线推进后补建时淡入显示
  const S = { sys, group: g, star, stars, planets, belt, beacons, light, orbits, fade: 0, t: 0 };
  addStoryBeacon(S);
  return S;
}
// 主线：信号碎片信标。星系已经加载时，主线推进后也可以补建（避免邻居星系先加载导致信标缺失）
function addStoryBeacon(S) {
  const sys = S.sys;
  if (!qOn() || fragKind(frags) !== 'beacon' || fragSys[frags] !== sys.i || S.beacons.some(b => b.story)) return;
  const lastD = S.planets[S.planets.length - 1].p.dist;
  const local = beaconSpot(sys, makeRng(sys.seed + 999), lastD + 10);
  const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(2.6), new THREE.MeshBasicMaterial({ color: 0x66e0ff, wireframe: true }));
  mesh.position.copy(local); S.group.add(mesh);
  const gl = new THREE.Sprite(new THREE.SpriteMaterial({
    map: soft, color: 0x66e0ff, opacity: .95, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false
  })); gl.scale.setScalar(22); mesh.add(gl);
  S.beacons.push({ id: 'f:' + frags, story: true, pick: 20, mesh, local, reward: { credits: 0, fuel: 0 }, label: mkLabel('st') });
}

function fadeSystem(S, k) {
  S.group.traverse(o => {
    const m = o.material; if (!m) return;
    if (S.stars.some(s => o === s.mesh || o.parent === s.mesh)) return;
    if (m.userData.base === undefined) {            // 第一次遇到：记下原始透明度和原始 transparent 设置
      m.userData.base = m.opacity;
      m.userData.t0 = m.transparent;
    }
    m.transparent = k < 1 ? true : m.userData.t0;  // 淡入期间必须开启 transparent，结束后还原
    m.opacity = m.userData.base * k;
  });
}

function disposeSystem(s) {
  s.group.traverse(o => {
    o.geometry?.dispose();
    const m = o.material; if (m) { m.map?.dispose(); m.dispose() }
  });
  scene.remove(s.group);
  s.planets.forEach(p => p.label.remove()); s.beacons.forEach(b => b.label.remove()); s.stars.forEach(x => x.label?.remove());
}
// 加载规则：同一时刻最多两个星系——
//  ① 主星系：离玩家最近的恒星所在星系（与最初版本相同，带迟滞，不会来回闪烁）
//  ② 主线星系：玩家 260u 内时额外保留，保证主线的行星/信标不会因为“最近恒星”变化而消失
const LOAD_R = 140, UNLOAD_R = 190, ENTER_R = 110;
let nearest = systems[0], nearestDist = 1e9, lastEntered = -1, primarySys = null, pinnedSys = null, arriveLock = null, arriveAt = new THREE.Vector3();
const questSysIdx = () => qOn() ?  fragSys[frags] : -2;
function updateLOD() {
  let best = null, bd = 1e9;
  for (const s of systems) { const d = s.pos.distanceTo(ship.pos); s._d = d; if (d < bd) { bd = d; best = s } }
  nearest = best; nearestDist = bd;
  // ① 主星系
  if (primarySys) {
    const dc = primarySys._d;
    if (dc > UNLOAD_R || (best !== primarySys && bd < LOAD_R && dc > bd + 20)) primarySys = null;
  }
  if (!primarySys && bd < LOAD_R) primarySys = best;
  // 曲速锁定：恒星挨得很近（平均间距约 100u），曲速到达点附近往往有别的恒星更近，
  // 所以曲速目标一进入加载范围就作为主星系，到达后继续保持；
  // 解除条件：离它超过 220u，或者你已离开到达点 40u 以上且别的恒星明显更近（近 60u 以上）
  if (warp) { arriveLock = warp.target; arriveAt.copy(ship.pos) }
  else if (arriveLock && (arriveLock._d > 220 || (best !== arriveLock && arriveLock._d > bd + 60 && ship.pos.distanceTo(arriveAt) > 40))) arriveLock = null;
  if (arriveLock && arriveLock._d < LOAD_R) primarySys = arriveLock;
  // ② 主线星系
  // 保留半径只覆盖“确实需要的范围”：信标最远约 165u；扫描行星类任务需要更远的扫描距离
  const qi = questSysIdx(), qs = qi >= 0 ? systems[qi] : null;
  let pinR = 0;
  if (qs) {
    const qPl = genPlanets(qs);   // 有缓存，每帧调用不会重复计算
    pinR = fragKind(frags) === 'planet'
      ? qPl[fragPlanetIdx(frags)].dist + scanRange() + 20   // 行星离恒星多远 + 你的扫描距离 + 余量
      : qPl[qPl.length - 1].dist + 50;                        // 最外圈行星 + 信标范围 + 余量
  }
  if (qs && (qs._d < pinR || (pinnedSys === qs && qs._d <= pinR + 50))) pinnedSys = qs; else pinnedSys = null;
  // 卸载不再需要的，加载缺少的
  const want = [primarySys, pinnedSys].filter((s, i, a) => s && a.indexOf(s) === i);
  for (let i = loaded.length - 1; i >= 0; i--)if (!want.includes(loaded[i].sys)) { disposeSystem(loaded[i]); loaded.splice(i, 1) }
  for (const s of want) if (!loaded.some(L => L.sys === s)) loaded.push(buildSystem(s));
  cur = (arriveLock && loaded.find(L => L.sys === arriveLock)) || null;   // 曲速锁定的星系优先完整显示
  if (!cur) for (const L of loaded) if (!cur || L.sys._d < cur.sys._d) cur = L;
  // 进入某星系的提示 / 记为已到访
  const inside = cur && cur.sys._d < ENTER_R ? cur.sys : null;
  curSysI = inside ? inside.i : -1;
  const passing = !!(warp && inside && inside !== warp.target);   // 曲速途中路过别的星系：不弹提示 / 介绍，也不算「到访」（到了目标星系、或中途取消曲速后才算）
  if (!inside) lastEntered = -1;
  else if (!passing && lastEntered !== inside.i) {
    lastEntered = inside.i;
    const first = !visited.has(inside.i); visited.add(inside.i);
    const n = genPlanets(inside).filter(p => discovered.has(p.id)).length;
    const catName = inside.cat ? T.sys.cats[inside.cat] : '', extra = inside.rid ? T.toast.realInfo(inside.ly, catName) : catName;   // 真实星系：短提示（名字、距离、类别）
    toast(T.toast.enterSystem(inside.name, first, n, inside.nPlanets, extra), first ? 'good' : '');
    enterKnow(inside, genStars(inside).length);
  }
  markers.forEach((m, i) => m.visible = !loaded.some(L => L.sys.i === i));
}

// =====================================================================
// 输入
// =====================================================================
const keys = {}; let mouseDX = 0, mouseDY = 0, mouseHeld = false, running = false, openP = null;
$('know').parentElement.insertAdjacentHTML('beforeend', '<div id="multi" class="overlay hidden"><div class="box c-multi"></div></div>');   // 范围扫描的多张小卡片面板（用代码插入，不需要改 index.html）
$('know').parentElement.insertAdjacentHTML('beforeend', '<div id="quiz" class="overlay hidden"><div class="box c-quiz"></div></div>');   // 知识测验的邀请 / 答题 / 结果面板（用代码插入，不需要改 index.html）
$('reticle').querySelector('svg').insertAdjacentHTML('beforeend', '<circle id="ring2" class="c-ring2" cx="40" cy="40" r="26" />');   // 范围扫描圈（扫描仪升级后才显示）
const panels = { quiz: $('quiz'), multi: $('multi'), journal: $('journal'), upg: $('upg'), map: $('mapw'), ending: $('ending'), gameover: $('gameover'), cards: $('cards'), cargo: $('cargo'), help: $('help'), know: $('know'), lib: $('know') };   // 知识库和弹窗共用同一个浮层
const paused = () => !running || openP === 'journal' || openP === 'upg' || openP === 'ending' || openP === 'gameover' || openP === 'cards' || openP === 'cargo' || openP === 'help' || openP === 'know' || openP === 'lib' || openP === 'multi' || openP === 'quiz' || cardHold;
addEventListener('keydown', e => {
  if (!running) return;
  if (openP === 'quiz') { e.preventDefault(); if (!e.repeat) quizKey(e); return }   // 测验：只响应测验自己的按键（开始后不能打开知识库等任何面板）
  if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (!$('cardbig').classList.contains('hidden') && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) { showBig(bigI + (e.code === 'ArrowLeft' ? -1 : 1)); return }
  if (e.repeat || openP === 'gameover') return;
  if (cardHold && (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space' || e.code === 'Escape')) { dismissCard(); return }
  if ((openP === 'know' || openP === 'multi') && (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space')) { closePanel(); return }
  keys[e.code] = true; did[e.code] = true; if (e.code === 'NumpadEnter') did.Enter = true;
  if (e.code === 'Escape') { if (!$('cardbig').classList.contains('hidden')) { $('cardbig').classList.add('hidden'); return } if (openP) closePanel(); return };
  if (e.code === 'KeyB') toggleBloom();
  if (e.code === 'KeyM') openPanel('map');
  if (e.code === 'KeyJ') openPanel('journal');
  if (e.code === 'KeyU') openPanel('upg');
  if (e.code === 'KeyH') openPanel('help');
  if (e.code === 'KeyK') openPanel('cards');
  if (e.code === 'KeyI') openPanel('cargo');
  if (e.code === 'KeyL') openPanel('lib');
  if (paused()) return;
  if (e.code === 'KeyP') shootPano();
  if (e.code === 'Tab') cycleTarget();
  if (e.code === 'KeyR') probeTarget();
  if (!e.repeat && ((e.code === 'KeyG' && keys.KeyS) || (e.code === 'KeyS' && keys.KeyG)) && emergencyOK()) { emergencyWarp(); return }   // S + G 同时按：紧急曲速（只在奇点潮汐区内、不可回头点之前有效）
  if (e.code === 'KeyG') toggleWarp();
});
addEventListener('keyup', e => { keys[e.code] = false });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseHeld = false });
document.addEventListener('mousemove', e => {
  if (document.pointerLockElement === renderer.domElement) { mouseDX += e.movementX; mouseDY += e.movementY }
});
let mouseRight = false, multiOn = false;   // 鼠标右键按住 / 此刻是否在范围扫描
addEventListener('mousedown', e => { if (document.pointerLockElement !== renderer.domElement) return; if (e.button === 0) mouseHeld = true; if (e.button === 2) mouseRight = true });
addEventListener('mouseup', e => { if (e.button === 0) mouseHeld = false; if (e.button === 2) mouseRight = false });
addEventListener('contextmenu', e => { if (document.pointerLockElement === renderer.domElement) e.preventDefault() });
renderer.domElement.addEventListener('click', () => {
  if (running && !paused() && !openP && document.pointerLockElement !== renderer.domElement) renderer.domElement.requestPointerLock?.()
});

// 辉光开关（记住选择）
let bloomOn = true;
try { bloomOn = localStorage.getItem('deepspace-bloom') !== 'off' } catch { }
$('bloomChk').checked = bloomOn;
function setBloom(v, notify) {
  bloomOn = v; $('bloomChk').checked = v;
  try { localStorage.setItem('deepspace-bloom', v ? 'on' : 'off') } catch { }
  if (notify) toast(T.toast.bloom(v));
}
function toggleBloom() { setBloom(!bloomOn, true) }
$('bloomChk').onchange = e => setBloom(e.target.checked, false);

// ===== 游戏知识：第一次遇到时弹出 =====
const KNOW = T.know;
let knowSeen = new Set(), knowQ = [], knowSup = {};   // knowSup[key] = 弹这条通用介绍时，要附带的系统条目   // knowSeen = 弹过没有（重置教学会清空）；下面的 libSet = 知识库解锁了哪些（重置教学不碰）
const kbParam = params.get('kb');   // 测试用：?kb=reset 清空知识库和弹窗记录；?kb=all 全部解锁（弹窗记录不变，仍会弹）
if (kbParam === 'reset') try { ['deepspace-know', 'deepspace-lib', 'deepspace-libseen'].forEach(k => localStorage.removeItem(k)) } catch { }
try { knowSeen = new Set(JSON.parse(localStorage.getItem('deepspace-know') || '[]')) } catch { }
let libSet = new Set(), libSeen = new Set(), libCur = null;
try { libSet = new Set(JSON.parse(localStorage.getItem('deepspace-lib') || '[]')) } catch { }
try { libSeen = new Set(JSON.parse(localStorage.getItem('deepspace-libseen') || '[]')) } catch { }
knowSeen.forEach(k => { if (KNOW[k]) libSet.add(k) });   // 老玩家已经看过的条目直接解锁
if (kbParam === 'all') Object.keys(KNOW).forEach(k => { if (KNOW[k]?.title) libSet.add(k) });
const saveLib = () => { try { localStorage.setItem('deepspace-lib', JSON.stringify([...libSet])); localStorage.setItem('deepspace-libseen', JSON.stringify([...libSeen])) } catch { } };
// 取一条知识：真实星系的条目要按当前游戏里的行星补上标签和示意图
function knowOf(key) {
  const K = KNOW[key];
  if (!key.startsWith('sys_') || !K) return K;
  const d = byId(key.slice(4)), sys = systems.find(s => s.rid === d.id), U = T.know.sysUi, n = d.planets.length;
  return { ...K, real: true, figHtml: H.orbitFig({ star: d.star, star2: d.star2, planets: figPlanets(d, sys ? genPlanets(sys) : null) }),
    chips: [U.chipLy(d.ly), d.star2 ? U.chipBinary(d.star.type) : U.chipStar(d.star.type), U.chipPl(n)] };
}
function unlock(key, quiet) {   // 解锁一条知识库条目（quiet：不提示，由调用方自己提示）
  if (!KNOW[key] || libSet.has(key)) return;
  const first = libSet.size === 0; libSet.add(key); saveLib(); addXp(XP.unlock);   // 第一次解锁一条知识库条目 +15 经验
  if (first && !quiet) setTimeout(() => toast(T.toast.libFirst, 'good'), 1200);
}
function renderLib() {
  const box = $('know').firstElementChild; box.classList.remove('rich'); box.classList.add('lib');
  const groups = T.lib.groups.map(g => ({ name: g.name, items: g.keys.filter(k => libSet.has(k)).map(k => ({ key: k, title: KNOW[k].title, isNew: !libSeen.has(k) })) })).filter(g => g.items.length);
  const all = groups.flatMap(g => g.items);
  if (libCur !== '__quiz' && !all.some(i => i.key === libCur)) libCur = (all.find(i => i.isNew) || all[0])?.key ?? null;
  if (libCur && !libSeen.has(libCur)) { libSeen.add(libCur); saveLib() }   // 打开的那条不再算「新」
  box.innerHTML = H.libHtml({ groups: groups.map(g => ({ ...g, items: g.items.map(i => ({ ...i, isNew: i.isNew && i.key !== libCur })) })), cur: libCur, count: all.length, quiz: { badge: QUIZ_TIERS.some((_, i) => tierReady(i)) && quizAvail() > 0, on: libCur === '__quiz' }, detail: libCur === '__quiz' ? renderQuizMenu() : libCur ? H.knowDetail(knowOf(libCur)) : '' });
  box.querySelectorAll('.c-lib-it').forEach(el => el.onclick = () => { libCur = el.dataset.key; renderLib() });
  box.querySelectorAll('[data-qz]').forEach(b => b.onclick = () => startQuiz(b.dataset.qz === 'practice' ? null : +b.dataset.qz));   // 知识库里补答 / 练习
}
function know(key, delay = 0) {
  if (!KNOW[key] || knowSeen.has(key) || knowQ.includes(key)) return;
  knowQ.push(key); setTimeout(knowTry, delay);
}
// 进入星系：可能同时触发好几条知识（红矮星 / 红巨星 / 紧凑多行星 / 双星 / 三星）。一次只弹一个窗口，其余静默解锁。
function enterKnow(sys, ns) {
  const keys = [...new Set([ns === 2 ? 'star2' : ns >= 3 ? 'star3' : null, ...['compact', 'redDwarf', 'redGiant'].filter(c => sys.cats?.includes(c)).map(c => 'cat_' + c), sys.i === 0 ? null : ['star_G', 'star_F', 'star_K', 'star_blue', 'cat_redDwarf'][STAR_COLS.indexOf(sys.color)]])]   // 顺序 = 弹窗优先级：双星 / 三星 > 紧凑多行星系统 > 红矮星 / 红巨星 > 恒星类型；恒星类型介绍：按主星的颜色（太阳系的太阳不触发；红矮星色的星也算红矮星）
    .filter(k => k && KNOW[k] && !knowSeen.has(k) && !knowQ.includes(k));
  const sk = sys.rid ? 'sys_' + sys.rid : null, sysNew = !!(sk && KNOW[sk] && !knowSeen.has(sk) && !knowQ.includes(sk));
  if (!keys.length && !sysNew) return;
  if (!keys.length) { know(sk, 1500); return }   // 通用介绍都看过了：只弹这个系统自己的介绍
  const sup = [...keys.slice(1), ...(sysNew ? [sk] : [])];   // 同时遇到的其他介绍（比如双星 + 红矮星）和真实星系的介绍，都做成补充块附在第一个弹窗里
  if (sup.length) knowSup[keys[0]] = sup;
  know(keys[0], 1500);
}
function knowTry() {
  if (!knowQ.length) return;
  if (openP || !running || cardHold || warp) { setTimeout(knowTry, 1000); return }   // 有别的面板开着、或正在曲速航行，就稍后再弹
  const key = knowQ.shift(); knowSeen.add(key); unlock(key);
  const sups = knowSup[key] || []; delete knowSup[key];
  sups.forEach(k => { knowSeen.add(k); unlock(k, true) })
  try { localStorage.setItem('deepspace-know', JSON.stringify([...knowSeen])) } catch { }
  const K = knowOf(key), box = $('know').firstElementChild, rich = !!(K.fig || K.figHtml);
  box.classList.remove('lib'); box.classList.toggle('rich', rich);   // 带示意图的用新版排版
  box.innerHTML = rich ? H.knowRich(K, false, sups.map(k => k.startsWith('sys_') ? H.sysBlock(knowOf(k)) : H.extraBlock(knowOf(k))).join('')) : H.knowPlain(K);
  box.querySelectorAll('button').forEach(b => b.onclick = () => closePanel());
  openPanel('know'); beep(520, .12, 'triangle', .04);
  if (knowQ.length) setTimeout(knowTry, 1000);
}
function openPanel(n) {
  if (qzLocked() && n !== 'quiz') return;   // 答题进行中，不能打开别的面板
  if (openP === n) { closePanel(); return }
  closePanel(); openP = n; panels[n].classList.remove('hidden');
  document.exitPointerLock?.(); mouseHeld = false;
  if (n === 'journal') renderJournal();
  if (n === 'cards') { cardFilter = pendingFilter !== 'all' ? pendingFilter : curSysI >= 0 ? 'cur' : 'all'; pendingFilter = 'all'; renderCards() }   // 每次打开：在星系里默认只看当前星系，不在星系里就显示全部
  if (n === 'lib') renderLib();
  if (n === 'upg') renderUpg(); if (n === 'cargo') renderCargo();
}
let afterKnow = null;   // 关掉某个知识弹窗之后接着要做的事（扫描奇点：先看介绍，再进结局）
function closePanel() { if (openP === 'gameover' || (openP === 'quiz' && qzLocked())) return; const was = openP; if (openP) { panels[openP].classList.add('hidden'); openP = null } if ((was === 'know' || was === 'multi') && afterKnow) { const f = afterKnow; afterKnow = null; setTimeout(f, 250) } }

// Toast & 卡片
function toast(msg, cls = '') { const ms = Math.min(9000, 4300 + 40 * Math.max(0, msg.length - 40)), d = makeToast(msg, cls); d.style.animationDuration = ms * .98 + 'ms'; setTimeout(() => d.remove(), ms) }   // CSS 淡出动画时长跟停留时间一致（原来固定 4.2s，长消息会先变透明再被移除）   // 长消息多停一会儿
function makeToast(msg, cls = '', keep = false) {   // 做出一条提示但不自动消失（常驻提示用，自己负责 remove）
  const d = document.createElement('div'); d.className = 'toast ' + cls + (keep ? ' keep' : ''); $('toasts').appendChild(d);
  msg.split('\n').forEach((line, i) => { if (i) d.appendChild(document.createElement('br')); line.split('**').forEach((seg, k) => { if (!seg) return; if (k % 2) { const b = document.createElement('b'); b.textContent = seg; d.appendChild(b) } else d.appendChild(document.createTextNode(seg)) }) });   // 消息里的换行（\n）显示成分行；两个 ** 之间的文字显示成粗体
  while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
  return d;
}
let cardTimer = 0;
const cardCache = new Map();
function cardURL(p) {
  if (!cardCache.has(p.id)) cardCache.set(p.id, drawPlanetCard(p, genStars(systems[+p.id.split(':')[0]])).toDataURL('image/png'));
  return cardCache.get(p.id);
}
let cardFilter = 'all', pendingFilter = 'all', curSysI = -1;   // 筛选：'all' | 'cur' | 星系编号
let bigList = [], bigI = 0;
function showBig(i) {
  bigI = (i + bigList.length) % bigList.length;
  const im = bigList[bigI];
  $('cardimg').src = im.src; $('cardDl').href = im.src; $('cardDl').download = im.alt + '.png';
  $('cardIdx').textContent = T.cards.index(bigI + 1, bigList.length) + ' · ' + (im.classList.contains('unsent') ? T.tx.tagUnsent : T.tx.tagSent);
  $('cardbig').classList.remove('hidden');
}
$('cardPrev').onclick = () => showBig(bigI - 1);
$('cardNext').onclick = () => showBig(bigI + 1);
// ---- 星系全景图 ----
const panoCache = new Map();
function panoURL(i) {
  const s = panos[i], key = i + ':' + s.t;
  if (!panoCache.has(key)) {
    const sys = systems[i], st = genStars(sys), pl = genPlanets(sys), P = T.pano, done = pl.filter(p => !p.home && s.ids.includes(p.id)).length, tot = pl.filter(p => !p.home).length;
    panoCache.set(key, drawSysPanorama(sys, st, pl, s.ids, {
      title: P.title(sys.name), sub: starTypeText(sys) + T.sys.multi[st.length - 1],
      starLabel: P.starKnown(starClassOf(sys)), starInfo: starInfoLines(sys, st), count: P.count(done, tot),
      date: new Date(s.t).toLocaleString('zh-CN', { hour12: false }), src: sys.rid || sys.real ? P.srcReal : P.srcGen, srcCol: sys.rid || sys.real ? '#7fe0a0' : '#8fa3c4'
    }).toDataURL('image/png'));
  }
  return panoCache.get(key);
}
function starInfoLines(sys, st) {   // 全景图右上角的主恒星资料（原来要扫描恒星才能看到的内容）：类型、温度、真实恒星的半径 / 质量 / 距离、耀斑和高温区
  const cls = starClassOf(sys), d = sys.rid ? byId(sys.rid) : null, U = T.star, P = T.pano, col = d || sys.real ? '#7fe0a0' : '#8fa3c4', z = starZones(st[0].radius), f = sys.flare ?? 1;
  const lines = [[P.starType(starTypeText(sys)), '#dfe9ff'], [`${U.temp} 约 ${(d ? d.star.teff : STAR_TEMP[cls]).toLocaleString('en')} K`, col]];
  if (d) lines.push([`${U.radius} ${d.star.r} R☉ · ${U.mass} ${d.star.m} M☉`, col], [`${U.dist} ${d.ly} 光年`, col]);
  lines.push([P.starFlare(f, Math.round(z.melt), Math.round(z.flare)), '#ffb38a']);
  return lines;
}
function starTypeText(s) { return s.rid ? byId(s.rid).star.type + ' 型恒星' : s.cat === 'redGiant' ? T.sys.redGiant : T.sys.starTypes[Math.max(0, STAR_COLS.indexOf(s.color))] }
// 拍摄全景图的范围：每个星系用自己的——最外圈行星的轨道 + 30 u，最小 110 u（外圈行星离恒星可能比 110 u 远，比如海王星约 164 u）
const panoRange = s => Math.max(ENTER_R, genPlanets(s).reduce((m, p) => Math.max(m, p.dist), 0) + 30);
function panoSysIdx() {   // 此刻在哪个星系的拍摄范围内（多个重叠时取离恒星最近的）；都不在 = -1
  let bi = -1, bd = 1e9;
  for (const s of systems) { const d = s.pos.distanceTo(ship.pos); if (d < 320 && d < bd && d <= panoRange(s)) { bd = d; bi = s.i } }
  return bi;
}
function shootPano(si = panoSysIdx(), auto = false) {   // auto：扫完全部行星时自动拍一张（不闪白屏）
  if (si < 0) { toast(T.pano.noSys, 'warn'); return }
  const sys = systems[si], pl = genPlanets(sys), first = !panoGiven.has(String(sys.i));
  panos[sys.i] = { t: Date.now(), ids: pl.filter(p => p.home || discovered.has(p.id)).map(p => p.id) };
  const done = pl.filter(p => !p.home && discovered.has(p.id)).length, tot = pl.filter(p => !p.home).length;
  if (first) { addXp(XP.pano); panoGiven.add(String(sys.i)) }
  toast(auto ? T.pano.auto(sys.name, first ? XP.pano : 0) : T.pano.shot(sys.name, done, tot, first ? XP.pano : 0), 'good'); beep(1200, .06, 'square', .04); beep(800, .1, 'square', .04, .07);
  const n = panoGiven.size, mile = first && PANO_MILE[n];
  if (mile) { credits += mile; setTimeout(() => toast(T.pano.mile(n, mile), 'good'), 1600) }
  if (!auto) { const fl = document.createElement('div'); fl.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:.7;pointer-events:none;z-index:50;transition:opacity .5s'; document.body.appendChild(fl);
  requestAnimationFrame(() => { fl.style.opacity = 0; setTimeout(() => fl.remove(), 600) }) }
  doSave();
  if (openP === 'cards') renderCards();
}
// ---- 传送回地球：把还没传回的收藏（行星卡、全景图）一次传完。离地球越远，越费燃料、每项越慢；传回的收藏在飞船失败后保留 ----
let tx = null;   // { q: [{k:'c'|'p', id}], i, t, sec }：传送中；只在游戏运行时（没有打开面板）走时间
const TX_SEC_MIN = 1, TX_SEC_MAX = 5, TX_FUEL_PER_U = .02;
const unsentCards = () => [...discovered].filter(id => !sent.cards.has(id));
const unsentPanos = () => Object.keys(panos).filter(k => sent.panos[k] !== panos[k].t).map(Number);
function txInfo() {
  const dist = ship.pos.distanceTo(systems[0].pos), nc = unsentCards().length, np = unsentPanos().length;
  return { dist, nc, np, n: nc + np, sec: TX_SEC_MIN + (TX_SEC_MAX - TX_SEC_MIN) * Math.min(1, dist / GR), fuel: Math.max(2, Math.ceil(dist * TX_FUEL_PER_U)) };
}
function startTx() {
  if (tx) return; const I = txInfo(); if (!I.n) return;
  if (fuel < I.fuel) { toast(T.tx.noFuel(I.fuel, Math.floor(fuel)), 'warn'); return }
  fuel -= I.fuel; tx = { q: [...unsentCards().map(id => ({ k: 'c', id })), ...unsentPanos().map(i => ({ k: 'p', id: i }))], i: 0, t: 0, sec: I.sec };
  toast(T.tx.start(I.n, I.fuel, Math.round(I.n * I.sec)), 'good'); beep(520, .12, 'triangle', .04); doSave(); txHud(); renderTx();
}
function txTick(dt) {
  if (!tx) return; tx.t += dt;
  while (tx && tx.t >= tx.sec) {
    tx.t -= tx.sec; const it = tx.q[tx.i++];
    if (it.k === 'c') sent.cards.add(it.id); else if (panos[it.id]) sent.panos[it.id] = panos[it.id].t;
    beep(1040, .05, 'square', .025);
    if (tx.i >= tx.q.length) { const n = tx.q.length; tx = null; toast(T.tx.done(n), 'good'); beep(660, .12, 'triangle', .05); beep(990, .16, 'triangle', .05, .1) }
    doSave();
  }
  txHud();
}
function txStop() { tx = null; txHud() }
function txHud() {
  let el = $('txhud'); if (!el) { el = document.createElement('div'); el.id = 'txhud'; el.className = 'c-txhud hidden'; el.innerHTML = '<span></span><i><b></b></i>'; document.body.appendChild(el) }
  el.classList.toggle('hidden', !tx || !$('hud') || $('hud').classList.contains('hidden'));
  if (tx) { el.firstChild.textContent = T.tx.hud(tx.i + 1, tx.q.length); el.querySelector('b').style.width = Math.min(100, tx.t / tx.sec * 100) + '%' }
}
function renderTx() {
  const el = $('txbar'); if (!el) return;
  if (tx) { el.innerHTML = `<span>${T.tx.busy(tx.i, tx.q.length)}</span>`; return }
  const I = txInfo();
  el.innerHTML = I.n ? `<span>${T.tx.unsent(I.nc, I.np)}</span><button id="txGo"${fuel < I.fuel ? ' class="low"' : ''}>${T.tx.go(I.fuel, Math.round(I.n * I.sec))}</button><span class="hint">${T.tx.legend}</span>` : `<span class="hint">${T.tx.allSent}</span>`;
  const b = $('txGo'); if (b) b.onclick = e => { e.target.blur(); startTx() };
}
const PANO_MILE = { 5: 200, 10: 500, 20: 1000 };   // 收集到这么多个星系的全景图时，一次性奖励的信用点
let cardTab = 'planets', panoSort = 'new';
try { panoSort = localStorage.getItem('deepspace-panosort') === 'name' ? 'name' : 'new' } catch { }
(() => {   // 收藏夹顶部的标签：行星卡 / 星系全景（用代码插入，不需要改 index.html）
  const box = $('cflt').parentElement; box.insertAdjacentHTML('beforebegin', `<div id="ctabs" class="c-ctabs"><button data-t="planets">${T.pano.tabPlanets}</button><button data-t="pano">${T.pano.tabPano}</button><button id="panoShot" class="c-shot">${T.pano.shoot}</button></div>`);
  $('ctabs').querySelectorAll('button[data-t]').forEach(b => b.onclick = () => { cardTab = b.dataset.t; b.blur(); renderCards() });
  $('panoShot').onclick = e => { e.target.blur(); shootPano() };
  $('ctabs').insertAdjacentHTML('afterend', '<div id="txbar" class="c-txbar"></div>');
  $('panoShot').insertAdjacentHTML('afterend', `<select id="panoSort" class="c-sort"><option value="new">${T.pano.sortNew}</option><option value="name">${T.pano.sortName}</option></select>`);
  $('panoSort').value = panoSort; $('panoSort').onchange = e => { panoSort = e.target.value; try { localStorage.setItem('deepspace-panosort', panoSort) } catch { } e.target.blur(); renderCards() };
})();
const panoOrder = () => Object.keys(panos).map(Number).sort(panoSort === 'name' ? (a, b) => systems[a].name.localeCompare(systems[b].name) : (a, b) => panos[b].t - panos[a].t || b - a);   // 默认最新的在最上面；也可按名字排
function renderCards() {
  renderTx();
  $('ctabs').querySelectorAll('button[data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === cardTab));
  $('panoSort').style.display = cardTab === 'pano' ? '' : 'none';
  $('cflt').parentElement.style.display = cardTab === 'pano' ? 'none' : ''; $('cgrid').classList.toggle('pano', cardTab === 'pano');
  if (cardTab === 'pano') {
    const list = panoOrder();
    $('cgrid').innerHTML = list.length ? list.map(i => H.cardImgHtml(panoURL(i), systems[i].name + ' 全景', sent.panos[i] !== panos[i].t)).join('') : H.emptyHtml(T.pano.empty);
    const imgs = [...$('cgrid').querySelectorAll('img')]; imgs.forEach((im, i) => im.onclick = () => { bigList = imgs; showBig(i) }); return;
  }
  // 出发点（地球）一开始就已知，卡片自动收藏，但不计入「已发现」的行星数
  const homeIds = genPlanets(systems[0]).filter(p => p.home).map(p => p.id);
  const ids = [...new Set([...discovered, ...homeIds])].sort((a, b) => { const [s1, p1] = a.split(':').map(Number), [s2, p2] = b.split(':').map(Number); return s1 - s2 || p1 - p2 });
  const bySys = new Map(); ids.forEach(id => { const s = +id.split(':')[0]; bySys.set(s, (bySys.get(s) || 0) + (homeIds.includes(id) ? 0 : 1)) });
  $('cflt').innerHTML = [
    H.optionHtml('all', T.cards.all(ids.length)),
    H.optionHtml('cur', T.cards.current(curSysI >= 0 ? systems[curSysI].name : '')),
    ...[...bySys].sort((a, b) => a[0] - b[0]).map(([s, n]) => H.optionHtml(s, T.cards.system(systems[s].name, n, systems[s].nPlanets)))
  ].join('');
  $('cflt').value = cardFilter;
  const want = cardFilter === 'all' ? null : cardFilter === 'cur' ? curSysI : +cardFilter;
  const show = want === null ? ids : ids.filter(id => +id.split(':')[0] === want);
  $('cgrid').innerHTML = show.length ? show.map(id => {
    const [si, pi] = id.split(':').map(Number), p = genPlanets(systems[si])[pi];
    return H.cardImgHtml(cardURL(p), p.name, !homeIds.includes(id) && !sent.cards.has(id))
  }).join('') : H.emptyHtml(want === null ? T.cards.emptyAll : want === -1 ? T.cards.emptyNoSys : T.cards.emptySys);
  const imgs = [...$('cgrid').querySelectorAll('img')];
  imgs.forEach((im, i) => im.onclick = () => { bigList = imgs; showBig(i) });
}
$('cflt').onchange = e => { cardFilter = e.target.value; e.target.blur(); renderCards() };   // blur：让 K / Esc 等按键继续有效
$('cardClose').onclick = () => $('cardbig').classList.add('hidden');
$('cardbig').onclick = e => { if (e.target === $('cardbig')) $('cardbig').classList.add('hidden') };
// 先显示在屏幕中央，停留后飞向元素本来的位置（右上角）
function flyIn(el, { hold = 2200, fly = 650, tail = 3900, scale = 1.35, endScale = 1, fade = false } = {}) {
  const r = el.getBoundingClientRect(), dx = Math.round(innerWidth / 2 - (r.left + r.width / 2)), dy = Math.round(innerHeight / 2 - (r.top + r.height / 2));
  const at = `translate(${dx}px,${dy}px) scale(${scale})`, T = 250 + hold + fly + tail, o = t => t / T;
  const end = fade ? `translate(40px,-40px) scale(${endScale * .5})` : `scale(${endScale})`;
  return el.animate([
    { opacity: 0, transform: `translate(${dx}px,${dy}px) scale(${scale * .7})`, offset: 0 },
    { opacity: 1, transform: at, offset: o(250) },
    { opacity: 1, transform: at, offset: o(250 + hold), easing: 'ease-in-out' },
    { opacity: fade ? 0 : 1, transform: end, offset: o(250 + hold + fly) },
    { opacity: fade ? 0 : 1, transform: end, offset: 1 }], { duration: T });
}

// 第一次扫描某类行星：返回要显示在卡片上的介绍（只出现一次）
function kindNote(p) {
  const r = kindNote0(p); unlock('units', true); return r   // 第一次扫描行星后，顺便解锁「天文单位」（卡片上有 AU / R⊕ / M⊕）
}
function kindNote0(p) {
  const key = p.cat ? 'cat_' + p.cat : 'kind_' + p.kind;   // 特别的类别（热木星等）优先，普通的岩石 / 气态 / 冰巨介绍留到扫描普通行星时
  if (!KNOW[key] || knowSeen.has(key)) return '';
  knowSeen.add(key); unlock(key);
  try { localStorage.setItem('deepspace-know', JSON.stringify([...knowSeen])) } catch { }
  return H.kindNoteHtml(KNOW[key]);
}
let cardAnim;
let cardHold = false, cardHoldMs = 0;
function collectWait(si) {   // 扫完全部行星：等卡片消失再打开收藏页（以前是固定 3.5 秒，卡片还在飞就弹出来了）
  collectPending = true;
  const t = setInterval(() => {
    if (openP === 'cards') { clearInterval(t); collectPending = false; return }   // 玩家自己打开了收藏
    if (openP || cardHold || !$('card').classList.contains('hidden')) return;
    clearInterval(t); collectPending = false; cardTab = 'pano'; openPanel('cards');   // 先打开收藏页的「星系全景」，再直接放大刚拍的这张（关掉大图就回到收藏页）
    bigList = [...$('cgrid').querySelectorAll('img')]; const k = panoOrder().indexOf(si); if (k >= 0 && bigList[k]) showBig(k);
  }, 400);
}
function showCard(p, isNew) {
  const i = p.info, c = $('card'), note = kindNote(p);
  c.innerHTML = H.cardPop(cardURL(p), note, isNew ? H.cardReward(i.value, i.fuelGain) : T.cards.collected);
  c.classList.remove('hidden'); clearTimeout(cardTimer); cardAnim?.cancel();
  if (note) {   // 有介绍：留在中央，暂停游戏，等玩家关闭
    cardHold = true; cardHoldMs = 3600000; document.exitPointerLock?.(); mouseHeld = false;
    cardAnim = flyIn(c, { hold: cardHoldMs, tail: 0, fade: true, scale: 1, endScale: 230 / c.offsetWidth });
  } else {
    cardAnim = flyIn(c, { hold: 2200, tail: 0, fade: true, scale: 1, endScale: 230 / c.offsetWidth });
    cardTimer = setTimeout(() => c.classList.add('hidden'), 3100);
  }
}
function dismissCard() {
  if (!cardHold) return; cardHold = false;
  cardAnim.currentTime = 250 + cardHoldMs;   // 跳到动画的"飞走"那一段
  cardTimer = setTimeout(() => $('card').classList.add('hidden'), 750);
  if (noteQ.length) setTimeout(nextNote, 900);   // 范围扫描里还有没看过的介绍，接着弹
}
$('card').addEventListener('click', e => { if (e.target.id === 'cardOk') dismissCard() });

// =====================================================================
// 目标 / 曲速
// =====================================================================
let target = null, warp = null;
function cycleTarget() {
  const list = systems.filter(s => s.pos.distanceTo(ship.pos) > 100).sort((a, b) => a.pos.distanceTo(ship.pos) - b.pos.distanceTo(ship.pos)).slice(0, 8);
  if (!list.length) return;
  const i = list.indexOf(target); target = list[(i + 1) % list.length];
  toast(T.toast.target(target.name, Math.round(target.pos.distanceTo(ship.pos)))); beep(880, .06);
}
const ARRIVE = 90;
function warpCost(t) { return Math.max(2, (t.pos.distanceTo(ship.pos) - ARRIVE) * .12) }
function toggleWarp() {
  if (warp) { if (!warp.emergency) endWarp(false); return }   // 紧急曲速取消不了
  if (!target) { toast(T.toast.warpNoTarget, 'warn'); return }
  const d = target.pos.distanceTo(ship.pos);
  if (d < ARRIVE + 30) { toast(T.toast.warpNear); return }
  const cost = warpCost(target);
  if (fuel < cost) { toast(T.toast.warpNoFuel(cost.toFixed(0), fuel.toFixed(0)), 'warn'); return }
  fuel -= cost; warp = { target, arrive: ARRIVE, s: 0 }; warp.plan = warpPlan(target); beep(220, .5, 'sawtooth', .04); toast(T.toast.warpStart(target.name, cost.toFixed(0)));
}
function endWarp(arrived) {
  if (!warp) return;
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quat);
  ship.vel.copy(fwd).multiplyScalar(arrived ? 20 : Math.min(ship.vel.length(), maxSpeed()));
  if (arrived) { if (warp.emergency) emgFuelHint(); else toast(T.toast.warpArrive(warp.target.name), 'good'); beep(520, .2); if (target === warp.target) target = null }
  warp = null;
}

// =====================================================================
// 扫描
// =====================================================================
// ---------- 远程探测 ----------
const knows = s => visited.has(s.i) || probed.has(s.i);
const probeCost = s => Math.round(3 + s.pos.distanceTo(ship.pos) / 100);
function sysSummary(s) {
  const ps = genPlanets(s).filter(p => !p.home), gas = ps.filter(p => p.kind === 'gas').length, lifeList = ps.filter(p => p.info.life !== '无');
  let best = '', bv = -1; for (const p of lifeList) { const v = LIFE_BONUS[p.info.life] || 0; if (v > bv) { bv = v; best = p.info.life } }
  const unseen = ps.filter(p => !discovered.has(p.id)), value = unseen.reduce((a, p) => a + p.info.value, 0);
  const R2 = makeRng(s.seed + 777), nb = s.i === 0 ? 1 : R2.int(1, 2); let bc = 0;
  for (let k = 0; k < nb; k++)if (!beaconsGot.has(s.i + ':b' + k)) bc++;
  const type = (s.rid ? byId(s.rid).star.type + ' 型恒星' : s.cat === 'redGiant' ? T.sys.redGiant : T.sys.starTypes[Math.max(0, STAR_COLS.indexOf(s.color))]) + T.sys.multi[genStars(s).length - 1],
    quest = qOn() && fragSys[frags] === s.i;
  return {
    type, n: ps.length, gas, life: lifeList.length, best, value, bc, quest,
    short: T.sys.short(type, ps.length, gas, lifeList.length, bc, quest),
    text: T.sys.text(type, ps.length, gas, lifeList.length, best, value, bc, quest)
  };
}
function probeTarget() {
  const t = target;
  if (!t || t.i < 0) { toast(T.toast.probeNoTarget, 'warn'); return }
  if (knows(t)) { toast(T.toast.probeKnown(t.name)); return }
  const cost = probeCost(t);
  if (fuel < cost) { toast(T.toast.probeNoFuel(cost, fuel.toFixed(0)), 'warn'); return }
  fuel -= cost; probed.add(t.i);
  [520, 780].forEach((f, i) => beep(f, .15, 'sine', .05, i * .1));
  toast(T.toast.probeDone(t.name, sysSummary(t).short), 'good'); doSave();
}
let barKey = '';
function renderMapBar() {
  const t = target, b = $('btnProbe'); let txt, btn, dis;
  if (!t) { txt = T.map.barNone; btn = T.map.btnProbe; dis = true }
  else if (t.i < 0) { txt = T.map.barBh; btn = T.map.btnProbe; dis = true }
  else {
    const d = Math.round(t.pos.distanceTo(ship.pos));
    if (knows(t)) { txt = T.map.barKnown(t.name, d, sysSummary(t).text); btn = T.map.btnKnown; dis = true }
    else { txt = T.map.barUnknown(t.name, d); btn = T.map.btnProbeCost(probeCost(t)); dis = fuel < probeCost(t) }
  }
  const key = txt + '|' + btn + '|' + dis; if (key === barKey) return; barKey = key;
  $('mapbarTxt').textContent = txt; b.textContent = btn; b.disabled = dis;
}

// ---------- 主线：银心信号 ----------
const BH_SYS = { i: -1, name: T.map.bh, pos: new THREE.Vector3(0, 0, 0) };
const qV = new THREE.Vector3();
function setQuestTarget() {
  const n = qOn() ? systems[fragSys[frags]] : null;   // 奇点不设为目标：让玩家自己飞过去（任务面板和星图照样给方向和距离）
  target = (n && n.pos.distanceTo(ship.pos) > (n.i >= 0 ? 260 : 150)) ? n : null;
}
function questText() {
  const Q = T.quest;
  if (rank() < 1) {
    const n = genPlanets(systems[0]).filter(p => discovered.has(p.id)).length;
    return Q.training(systems[0].name, n, systems[0].nPlanets);
  }
  if (bhDone) return Q.done;
  if (frags >= FRAG_N && !bhOn()) return Q.standbyFinal(RANKS[5].name, xp, RANK_NEED[rank()]);
  if (frags < FRAG_N && !qOn()) return Q.standbyNext(frags + 1, RANKS[Math.min(5, rank() + 1)].name, xp, RANK_NEED[rank()]);
  if (frags >= FRAG_N) return Q.final(Math.round(ship.pos.length()), BH_T.range);
  const t = Q.tag(frags + 1, FRAG_N);
  const s = systems[fragSys[frags]], L = loaded.find(x => x.sys === s), here = !!L && s.pos.distanceTo(ship.pos) < 220;
  if (fragKind(frags) === 'planet') {
    const pn = s.name + ' ' + ROMAN[fragPlanetIdx(frags)];
    return here ? Q.planetHere(t, pn) : Q.planetFar(t, s.name, Math.round(s.pos.distanceTo(ship.pos)), pn);
  }
  const sb = L && L.beacons.find(x => x.story);
  if (here && sb) return Q.beaconHere(t, Math.round(qV.copy(sb.local).add(s.pos).distanceTo(ship.pos)));
  return Q.beaconFar(t, s.name, Math.round(s.pos.distanceTo(ship.pos)));
}
function collectFragment(keep = false) {
  const k = frags; frags++; credits += 200; addXp(XP.frag); hull = HULL_MAX; fuel = fuelMax();
  [660, 880, 1100, 1320].forEach((f, i) => beep(f, .2, 'triangle', .06, i * .08));
  const c = $('card');
  const html = H.fragPop(T.fragment.title(frags, FRAG_N), T.fragment.reward, FRAG_TEXT[k]);
  c.innerHTML = keep ? html + H.popSep + c.innerHTML : html;
  c.classList.remove('hidden'); clearTimeout(cardTimer);
  if (!cardHold) {
    cardAnim?.cancel();
    cardAnim = flyIn(c, { hold: 6500, tail: 0, fade: true, scale: 1, endScale: 230 / c.offsetWidth });
    cardTimer = setTimeout(() => c.classList.add('hidden'), 7400);   // 250 + 6500 + 650
  }
  toast(frags >= FRAG_N ? (bhOn() ? T.fragment.toastAll : T.fragment.toastAllLocked(RANKS[5].name))
    : qOn() ? T.fragment.toastNext(frags, FRAG_N) : T.fragment.toastLocked(frags, FRAG_N), 'good');
  loaded.forEach(addStoryBeacon);   // 下一块碎片的星系若已加载，立即补建信标
  setQuestTarget(); doSave();
}
function showEnding() {
  bhDone = true; secret = true; credits += 5000; addXp(XP.bh); knowSeen.add('blackhole'); knowSeen.add('lifeSeed'); unlock('blackhole', true); unlock('lifeSeed', true);   // 扫描奇点之后才解锁黑洞的介绍和「生命的种子」
  { const dir = ship.pos.clone().sub(bh.position); if (dir.lengthSq() < 1) dir.set(1, 0, 0); dir.normalize();   // 把飞船挪到潮汐区外的安全位置：「继续探索」和「结束游戏」之后的存档都从这里出发
    ship.pos.copy(bh.position).addScaledVector(dir, TIDE_R + 60); ship.vel.set(0, 0, 0);
    ship.quat.setFromRotationMatrix(new THREE.Matrix4().lookAt(ship.pos, bh.position, UP)); tideDepth = 0; inTide = false; $('nogo').classList.add('hidden') }
  const m = Math.floor(playTime / 60), s = Math.floor(playTime % 60);
  $('endStats').innerHTML = T.ending.stats(m, s, visited.size, systems.length, discovered.size, beaconsGot.size);
  [392, 523, 659, 784, 1047].forEach((f, i) => beep(f, .5, 'triangle', .06, i * .18));
  target = null; doSave();
  const K = knowOf('blackhole'), box = $('know').firstElementChild;   // 先弹出黑洞介绍，关掉之后再进入结局
  box.classList.remove('lib'); box.classList.add('rich'); box.innerHTML = H.knowRich(K, false); box.querySelectorAll('button').forEach(b => b.onclick = () => closePanel());
  afterKnow = () => openPanel('ending'); openPanel('know');
}

let scanT = 0, scanId = null, scanCand = null;
// 扫描范围：扫描器等级 + 信号碎片奖励 + 额外加成
// effR 30 = 30u 内扫描器可探测到的信标，range 90 = 90u 内扫描器可探测到的行星
const BH_T = { id: 'bh', name: T.map.bh, effR: 30, range: 90 };
const USE = {
  氢气: { label: T.use.氢气, fuel: 15 }, '氦-3': { label: T.use['氦-3'], fuel: 40 }, 甲烷冰: { label: T.use.甲烷冰, fuel: 25 },
  金属矿: { label: T.use.金属矿, hull: 20 }, 硅酸盐: { label: T.use.硅酸盐, hull: 10 },
};
const UPG_MAT = { engine: '稀土', tank: '水冰', scanner: '晶体', boost: '氦-3', cargo: '金属矿' };
const SCANNER_CRYSTAL = [2, 2, 3, 3, 5];   // 扫描仪每次升级需要的晶体（晶体稀有，要往外围找）
const matNeed = k => k === 'scanner' ? (SCANNER_CRYSTAL[up.scanner] ?? 0) : Math.ceil((up[k] + 1) / 2);
function hit(v) {
  if (rank() < 1) return;   // 实习生没有危险
  const d = Math.max(0, v - 15) * .6; if (d < 1) return;
  hull = Math.max(0, hull - d); toast(T.toast.crash(d.toFixed(0), hull.toFixed(0), HULL_MAX), 'warn'); beep(90, .25, 'sawtooth', .08);
}
const PRICE = { 金属矿: 20, 硅酸盐: 15, 水冰: 20, 氢气: 15, 氨: 18, 甲烷冰: 22, 氨冰: 18, 稀土: 60, 晶体: 70, '氦-3': 80 };
function takeSample(p) {
  if (sampled.has(p.id)) return;
  const want = Math.max(1, Math.round(p.radius)), n = Math.min(want, cargoMax() - cargoUsed());
  if (n <= 0) { toast(T.toast.cargoFull, 'warn'); return }
  cargo[p.info.res] = (cargo[p.info.res] || 0) + n; sampled.add(p.id);
  toast(T.toast.sampled(p.info.res, n, n < want), 'good'); doSave();
}
const SIG = {
  cache: { name: T.sig.cache, color: 0xffd27a, css: '#ffe27a' }, distress: { name: T.sig.distress, color: 0x7cf0a0, css: '#7cf0a0' },
  ruins: { name: T.sig.ruins, color: 0xc9a0ff, css: '#c9a0ff' }, decoy: { name: T.sig.decoy, color: 0xff7a7a, css: '#ff7a7a' },
};
const COMMON = ['金属矿', '硅酸盐', '水冰', '氢气', '氨', '甲烷冰'], RARE = ['稀土', '晶体', '氦-3'];
function beaconInfo(sys, k) {
  const R = makeRng(sys.seed + 888 + k * 31), u = R.rand();
  const type = u < .4 ? 'cache' : u < .65 ? 'distress' : u < .85 ? 'ruins' : 'decoy';
  const power = 1 + (R.rand() < .5 ? 0 : 1) + (R.rand() < .3 ? 1 : 0);
  return { type, power, loot: { res: type === 'ruins' ? R.pick(RARE) : R.pick(COMMON), n: R.int(2, 4) } };
}
const detectR = b => b.story ? 700 : (150 + 60 * up.scanner) * b.power * (1 + .1 * frags);
const idR = b => b.story ? 1e9 : 70 + 30 * up.scanner + 8 * frags;
function giveItem(res, n) { const k = Math.min(n, cargoMax() - cargoUsed()); if (k > 0) cargo[res] = (cargo[res] || 0) + k; return Math.max(0, k) }
// 信标奖励：信用点 + 物资/燃料，干扰信号则扣除燃料和船体
function claimBeacon(b) {
  const m = [0, 1, 1.5, 2][b.power], parts = []; let cr = 0, good = true;
  if (b.type === 'cache') { cr = b.reward.credits * .4 * m; const n = giveItem(b.loot.res, Math.round(b.loot.n * m)); parts.push(n ? T.sig.item(b.loot.res, n) : T.sig.packLost) }
  else if (b.type === 'distress') { cr = b.reward.credits * m; const f = Math.round(30 * m); fuel = Math.min(fuelMax(), fuel + f); parts.push(T.sig.fuelPlus(f)) }
  else if (b.type === 'ruins') { cr = b.reward.credits * 1.5 * m; const n = giveItem(b.loot.res, b.power); parts.push(n ? T.sig.item(b.loot.res, n) : T.sig.relicLost) }
  else { good = false; if (rank() < 1) parts.push(T.sig.trainingShield); else { const f = 8 * b.power, h = 6 * b.power; fuel = Math.max(0, fuel - f); hull = Math.max(0, hull - h); parts.push(T.sig.decoyHit(f, h)) } }
  cr = Math.round(cr); credits += cr; beaconsGot.add(b.id); addXp(XP.beacon);
  toast(T.sig.got(SIG[b.type].name, '▮'.repeat(b.power), cr, parts), good ? 'good' : 'warn');
  if (good) { beep(990, .15, 'square', .04); beep(1320, .2, 'square', .04, .12) } else beep(140, .3, 'sawtooth', .06);
}
// ===== 新手教学：分阶段，满足条件就弹出对应的教学 =====
const did = {}; let lookAcc = 0, tutFlash = 0, tutShown = 0, tutFin = 0;
const MOVES = T.tut.moves;   // [[名称, 按键], …]
const explored = () => {   // 是否有某个星系的行星已经全部发现
  const n = {}; for (const id of discovered) { const si = id.split(':')[0]; n[si] = (n[si] || 0) + 1 }
  return systems.some(s => (n[s.i] || 0) >= s.nPlanets);
};
const canUpgrade = () => UPG.some(u => up[u.k] < 5 && credits >= upCost(u.k) && (!UPG_MAT[u.k] || (cargo[UPG_MAT[u.k]] || 0) >= matNeed(u.k)));
const GALAXY_ACTS = T.tut.galaxyActs;
const STAGES = [
  {   // 0 游戏开始：移动
    name: T.tut.stageNames[0], trigger: () => true, steps: [{
      reset: MOVES.map(x => 'Key' + x[1]), init: () => { lookAcc = 0 },
      t: () => H.tutMoves(lookAcc > 400, MOVES.map(x => !!did['Key' + x[1]])),
      ok: () => lookAcc > 400 && MOVES.every(x => did['Key' + x[1]])
    }]
  },
  {   // 1 完成第一次扫描：收藏、货舱、日志、知识库
    name: T.tut.stageNames[1], trigger: () => discovered.size >= 1, steps: [{
      reset: T.tut.scanChips.map(([code]) => code),
      t: () => H.tutScan(T.tut.scanChips.map(([code]) => !!did[code])),
      ok: () => T.tut.scanChips.every(([code]) => did[code])
    }]
  },
  {   // 2 完成一个星系
    name: T.tut.stageNames[2], trigger: () => explored() && rank() >= 1, steps: [{
      reset: GALAXY_ACTS.flatMap(a => a[0]),
      t: () => H.tutGalaxy(GALAXY_ACTS.map(([codes]) => codes.some(c => did[c]))),
      ok: () => GALAXY_ACTS.every(([codes]) => codes.some(c => did[c]))
    }]
  },
  {   // 3 够升级了
    name: T.tut.stageNames[3], trigger: canUpgrade, steps: [{
      reset: ['KeyU'], t: () => H.tutUpgrade(), ok: () => did.KeyU
    }]
  },
  {   // 4 第一次收集信标
    name: T.tut.stageNames[4], trigger: () => beaconsGot.size >= 1 || frags >= 1, steps: [
      { reset: ['Space'], t: () => H.tutBeacon(), ok: () => did.Space },
    ]
  },
];
// 状态：done = 已完成的阶段；cur = 正在进行的阶段（-1 = 无）；queue = 已触发、等待轮到的阶段
let tutOff = false, tutDone = [], tutCur = -1, tutSub = 0, tutQueue = [];
try {
  const v = localStorage.getItem('deepspace-tut3');
  if (v === 'off') tutOff = true; else if (v) { const o = JSON.parse(v); tutDone = o.done || []; tutCur = Number.isInteger(o.cur) ? o.cur : -1; tutSub = o.sub || 0 }
} catch { }
const tutSave = () => { try { localStorage.setItem('deepspace-tut3', tutOff ? 'off' : JSON.stringify({ done: tutDone, cur: tutCur, sub: tutSub })) } catch { } };
function tutTick(dt) {
  const el = $('tutor');
  if (tutOff) { el.classList.add('hidden'); return }
  STAGES.forEach((s, i) => { if (i !== tutCur && !tutDone.includes(i) && !tutQueue.includes(i) && s.trigger()) tutQueue.push(i) });   // 条件满足就排队
  if (tutCur < 0) {
    if (tutQueue.length) { tutCur = tutQueue.shift(); tutSub = 0; tutShown = 0; tutSave() }
    else {
      if (tutFin > 0) { el.classList.remove('hidden', 'ok'); el.innerHTML = H.tutFinished(); if ((tutFin -= dt) <= 0) { tutOff = true; tutSave() } }
      else el.classList.add('hidden');
      return
    }
  }
  const st = STAGES[tutCur];
  el.classList.remove('hidden');
  if (tutFlash > 0) {
    tutFlash -= dt;
    if (tutFlash <= 0) {
      el.classList.remove('ok'); tutSub++; tutShown = 0;
      if (tutSub >= st.steps.length) { tutDone.push(tutCur); tutCur = -1; tutSub = 0; if (tutDone.length >= STAGES.length) tutFin = 6 }
      tutSave()
    }
    return
  }
  const s = st.steps[tutSub];
  if (tutShown === 0) { for (const k of s.reset || []) delete did[k]; s.init?.() }   // 每一步开始时清掉之前的按键记录
  tutShown += dt;
  el.innerHTML = H.tutBox(st.name, tutSub + 1, st.steps.length, typeof s.t === 'function' ? s.t() : s.t);
  if (tutShown > 1.2 && s.ok()) { tutFlash = 1; tutShown = 0; el.classList.add('ok'); el.innerHTML = T.tut.done; beep(880, .12, 'triangle', .05) }
}
const tutRestart = () => { tutOff = false; tutDone = []; tutCur = -1; tutSub = 0; tutQueue = []; tutFlash = 0; tutShown = 0; tutFin = 0; for (const k in did) delete did[k]; lookAcc = 0; tutSave() };
$('tutChk').checked = !tutOff;
$('tutChk').onchange = e => { if (e.target.checked) tutRestart(); else { tutOff = true; tutSave() } };
$('tutReset').onclick = () => { tutRestart(); knowSeen.clear(); try { localStorage.removeItem('deepspace-know') } catch { } closePanel(); toast(T.toast.tutRestart, 'good') };
$('tutOff').onclick = () => { tutOff = true; tutSave(); closePanel(); $('tutor').classList.add('hidden') };
// ===== 危险事件 =====
let scanBreakFlare = null;
let flare = null, flareCd = 20, beltAcc = 0, inBelt = false, meltDepth = 0, meltWarnCd = 0;
// 恒星距离分区（R = 恒星半径）：碰撞圈 1.5R+2 → 熔毁区（持续高温伤害，越近越重）→ 耀斑区 5R。碰撞圈外约 2.6R 以内是熔毁区
const starZones = R => { const inner = R * 1.5 + 2; return { inner, melt: Math.max(R * 2.6, inner + 8), flare: R * 5 } };
const flareDepth = (d, R) => { const z = starZones(R); return Math.max(0, Math.min(1, 1 - (d - z.melt) / (z.flare - z.melt))) };   // 耀斑强度系数：熔毁区边缘 1 → 5R 边缘 0
const danger = () => 1 + .12 * frags;
function hurt(d, why) {
  if (d < 1) return;
  hull = Math.max(0, hull - d); toast(T.toast.hurt(why, d.toFixed(0), hull.toFixed(0), HULL_MAX), 'warn'); beep(90, .25, 'sawtooth', .08);
}
function homeSpot() {   // 家园恒星外 100 u、离其他恒星系最远的一点（船体失效 / 失败重来时的出生点）
  const h = systems[0]; let best = null, bm = -1e9;
  for (let a = 0; a < 360; a += 30) {
    const r = a * Math.PI / 180, p = new THREE.Vector3(Math.sin(r) * 100, 20, Math.cos(r) * 100).add(h.pos); let o = 1e9;
    for (const s of systems) if (s !== h) o = Math.min(o, s.pos.distanceTo(p));
    if (o > bm) { bm = o; best = p }
  }
  return best;
}
function wreck() {
  const h = systems[0], best = homeSpot();
  ship.pos.copy(best); ship.vel.set(0, 0, 0); ship.quat.setFromRotationMatrix(new THREE.Matrix4().lookAt(best, h.pos, UP)); warp = null;
  for (const k of Object.keys(cargo)) { cargo[k] = Math.floor(cargo[k] / 2); if (cargo[k] <= 0) delete cargo[k] }
  credits = Math.round(credits * .9); hull = HULL_MAX * .5; fuel = Math.max(fuel, 30); flare = null; inBelt = false;
  demote();  
  toast(T.toast.wreck, 'warn'); beep(110, .6, 'sawtooth', .07); doSave();
}
// ---- 奇点潮汐 + 红屏 ----
const FALL_R = 40, NOGO_SHOW = 110;       // 不可回头点半径（越过就无法脱离）/ 开始显示距离读数的半径
let falling = null, alarmCd = 0, tideCd = 0, alarmFlip = false;   // tideCd：潮汐区心跳音的计时；alarmFlip：警报双音交替
const TIDE_R = 160;                      // 潮汐区半径：进入后被拉向奇点、船体持续受损
let tideDepth = 0, inTide = false;       // 0（区外）~ 1（奇点中心）
// 奇点警告：靠近到 BH_WARN_ON 以内就弹出，一直显示到进入 BH_WARN_OFF 以内（飞远到 BH_WARN_RESET 以外才会重置，下次靠近再弹）；没授权的话末尾多提醒一句（只提醒，不阻止）
const BH_WARN_ON = 190, BH_WARN_OFF = 130, BH_WARN_RESET = 200;
let bhWarnEl = null, bhWarnArmed = true;   // armed：飞远到 BH_WARN_RESET 以外之后，下次靠近才再弹
const bhAuthNote = () => bhDone || bhOn() ? '' : frags < FRAG_N ? `信号碎片还差 ${FRAG_N - frags} 块` : `军衔不足，需要「${RANKS[5].name}」`;
function bhWarnClear() { if (bhWarnEl) { bhWarnEl.remove(); bhWarnEl = null } }
function bhWarnTick(d) {
  if (d >= BH_WARN_RESET) bhWarnArmed = true;
  if (!bhWarnEl && bhWarnArmed && d < BH_WARN_ON && d > BH_WARN_OFF) { bhWarnArmed = false; bhWarnEl = makeToast(T.toast.tideEnter(BH_T.range, bhAuthNote()), 'warn', true); beep(160, .25, 'sawtooth', .05) }
  else if (bhWarnEl && (d <= BH_WARN_OFF || d >= BH_WARN_RESET)) bhWarnClear();
  else if (bhWarnEl && !bhWarnEl.isConnected) $('toasts').appendChild(bhWarnEl);   // 被别的提示挤掉了就放回去
}
// 紧急曲速到家后：燃料是 0，常驻提示「找恒星补充燃料」，直到燃料 > 0 才消失
let emgFuelEl = null;
function emgFuelHint() { if (emgFuelEl) emgFuelEl.remove(); emgFuelEl = makeToast(T.toast.emgArrive, 'good', true) }
function emgFuelTick() {
  if (!emgFuelEl) return;
  if (fuel > 0 || hull <= 0) { emgFuelEl.remove(); emgFuelEl = null }
  else if (!emgFuelEl.isConnected) $('toasts').appendChild(emgFuelEl);   // 被别的提示挤掉了就放回去
}
function tide(dt) {
  const d = ship.pos.distanceTo(bh.position);
  bhWarnTick(d);
  tideDepth = d < TIDE_R ? 1 - d / TIDE_R : 0;
  if (tideDepth > 0) {
    tV.copy(bh.position).sub(ship.pos).normalize();
    ship.pos.addScaledVector(tV, 30 * tideDepth * tideDepth * dt);        // 拉力：越近越强（不推进的话扫描到一半就会被拖过不可回头点）
    hull = Math.max(0, hull - (1.5 + 5 * tideDepth * tideDepth) * dt);    // 船体持续受损
    if (!inTide) { inTide = true; beep(100, .4, 'sawtooth', .06) }
  } else if (inTide && d > TIDE_R * 1.05) inTide = false;
  // 潮汐区（TIDE_R → NOGO_SHOW）：低沉的「咚—咚」心跳，越靠近间隔越短、越响、音调越高
  if (tideDepth > 0 && d >= NOGO_SHOW && !falling) {
    const kt = (d - NOGO_SHOW) / (TIDE_R - NOGO_SHOW);   // 1 = 刚进潮汐区，0 = 到 NOGO_SHOW
    tideCd -= dt; if (tideCd <= 0) { const f = 55 + 25 * (1 - kt), v = .07 + .05 * (1 - kt); beep(f, .2, 'sine', v); beep(f * .85, .24, 'sine', v * .8, .2); tideCd = .55 + 1.1 * kt }
  } else tideCd = 0;
  // 不可回头点：第二段警告 = HUD 距离读数 + 越近越急的警报；越过就无法脱离
  const nogo = $('nogo');
  if (d < NOGO_SHOW) {
    const k = Math.max(0, (d - FALL_R) / (NOGO_SHOW - FALL_R));
    nogo.classList.remove('hidden'); nogo.innerHTML = T.toast.nogoDist(Math.max(0, d - FALL_R).toFixed(0)) + (d > FALL_R && !falling && !warp ? '<br><small>' + T.toast.emgHint + '</small>' : '');   // 距离读数旁边一起提示紧急曲速
    // 越过 NOGO_SHOW：双音警报，越近越尖、越密、越响；每两声夹一下低沉的重击
    alarmCd -= dt; if (alarmCd <= 0 && !falling) {
      alarmFlip = !alarmFlip; const hi = 420 + 520 * (1 - k), v = .05 + .035 * (1 - k);
      beep(alarmFlip ? hi : hi * .72, .1, 'square', v); if (!alarmFlip) beep(48, .22, 'sine', .1 + .05 * (1 - k), .02);
      alarmCd = .1 + .5 * k;
    }
  } else nogo.classList.add('hidden');
  if (d < FALL_R) startFall();
}
function startFall() {
  if (falling) return;
  falling = { t: 0 }; scanT = 0; mouseHeld = false; flare = null; target = null;
  $('nogo').classList.remove('hidden'); $('nogo').textContent = T.toast.nogoLost;
  toast(T.toast.fallStart, 'warn'); beep(70, 1.2, 'sawtooth', .08);
}
function fallTick(dt) {   // 第三段：屏幕扭曲、船体异响，几秒后进入失败画面
  falling.t += dt; const t = falling.t, d = ship.pos.distanceTo(bh.position), cv = renderer.domElement.style;
  tideDepth = 1 - Math.min(d, TIDE_R) / TIDE_R;
  cv.opacity = Math.max(0, Math.min(1, (d - 5.8) / 8)).toFixed(3);   // 黑洞越来越大，最后一段画面渐渐变黑，全黑之后才出失败画面
  cv.filter = `blur(${(Math.min(t, 9) ** 2 * .1).toFixed(2)}px) hue-rotate(${Math.round(t * 20)}deg)`; cv.transform = `scale(${(1 + t * .025).toFixed(3)})`;
  alarmCd -= dt; if (alarmCd <= 0) { beep(55 + Math.random() * 50, .28, 'sawtooth', .07); alarmCd = .3 }
  if (t > 16 || d < 5.8) showFail();
}
function drawFailArt() {   // 无尽的黑暗里，一艘小飞船静静漂浮，远处只剩一道微弱的吸积盘余光
  const cv = $('goCanvas'), g = cv.getContext('2d'), W = cv.width, H = cv.height;
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(200,215,255,${.05 + rnd() * .22})`; g.fillRect(rnd() * W, rnd() * H, 1 + (rnd() < .1), 1) }
  const gl = g.createRadialGradient(W * .8, H * .55, 3, W * .8, H * .55, 110); gl.addColorStop(0, 'rgba(255,150,60,.4)'); gl.addColorStop(.45, 'rgba(255,90,40,.1)'); gl.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gl; g.fillRect(0, 0, W, H);
  g.save(); g.translate(W * .38, H * .5); g.rotate(-.35);   // 飞船剪影
  g.fillStyle = '#0b0f1a'; g.strokeStyle = 'rgba(160,190,255,.55)'; g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(34, 0); g.lineTo(-10, -13); g.lineTo(-22, -26); g.lineTo(-24, -8); g.lineTo(-30, 0); g.lineTo(-24, 8); g.lineTo(-22, 26); g.lineTo(-10, 13); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = 'rgba(127,212,255,.7)'; g.beginPath(); g.ellipse(8, 0, 7, 3, 0, 0, 7); g.fill();   // 驾驶舱的一点微光
  g.restore();
}
// ---- 紧急曲速：在奇点潮汐区内、不可回头点之前，同时按 S + G：耗尽燃料、能量、货舱，飞船升级归零，船体降到 20%，立刻曲速回家园星系（可以无限次，代价很重） ----
function emergencyOK() { if (!running || paused() || falling || warp?.emergency) return false; const d = ship.pos.distanceTo(bh.position); return d < TIDE_R && d > FALL_R }
function emergencyWarp() {
  if (warp) endWarp(false);
  fuel = 0; energy = 0; for (const k of Object.keys(cargo)) delete cargo[k]; for (const k of Object.keys(up)) up[k] = 0; hull = Math.min(hull, HULL_MAX * .2);
  flare = null; inBelt = false; tideDepth = 0; inTide = false; scanT = 0; mouseHeld = false; target = null; $('nogo').classList.add('hidden');
  const home = systems[0]; warp = { target: home, arrive: ARRIVE, s: 0, emergency: true }; warp.plan = warpPlan(home);
  toast(T.toast.emgStart, 'warn'); beep(220, .5, 'sawtooth', .05); beep(440, .3, 'sawtooth', .04, .15); doSave();
}
function showFail() {   // 失败：知识库、军衔、信用点和已传回地球的收藏保留；没传回的收藏、货舱和飞船升级随飞船一起消失
  falling = null; const cv = renderer.domElement.style; cv.filter = cv.transform = cv.opacity = ''; $('nogo').classList.add('hidden');
  for (const k of Object.keys(cargo)) delete cargo[k];
  for (const k of Object.keys(up)) up[k] = 0;   // 飞船升级也随飞船一起消失
  const keepC = [...discovered].filter(id => sent.cards.has(id)), keepP = Object.keys(panos).filter(k => sent.panos[k] === panos[k].t);   // 已传回地球的收藏保留，没传回的随飞船消失
  discovered.clear(); keepC.forEach(id => discovered.add(id)); sampled.clear(); for (const k of Object.keys(panos)) if (!keepP.includes(k)) delete panos[k];
  sent.cards = new Set(keepC); for (const k of Object.keys(sent.panos)) if (!keepP.includes(k)) delete sent.panos[k];
  cardCache.clear(); txStop(); { const h = document.querySelector('#gameover .hint'); if (h) h.textContent = T.tx.failKept(keepC.length, keepP.length) }
  hull = HULL_MAX; fuel = fuelMax(); energy = energyMax(); flare = null; inBelt = false; tideDepth = 0; inTide = false; scanT = 0; target = null;
  const best = homeSpot(), h = systems[0];
  ship.pos.copy(best); ship.vel.set(0, 0, 0); ship.quat.setFromRotationMatrix(new THREE.Matrix4().lookAt(best, h.pos, UP)); warp = null;
  doSave(); drawFailArt(); $('redfx').style.opacity = 0;
  openPanel('gameover'); beep(80, 1.4, 'sine', .06);
}
let hullWarned = false;
function hullWarn() {
  if (hull < HULL_MAX * .3) { if (!hullWarned) { hullWarned = true; toast(T.toast.hullCritical(hull.toFixed(0), HULL_MAX), 'warn'); beep(180, .3, 'square', .05) } }
  else if (hull > HULL_MAX * .4) hullWarned = false;   // 修好之后才会再次提示，避免在边界反复弹
}
function redFx() {
  const t = performance.now() / 1000; let a = 0;
  if (meltDepth > 0) a = Math.max(a, .3 + .5 * meltDepth + .1 * Math.sin(t * 12));   // 熔毁区：越近越红
  if (flare) a = Math.max(a, .35 + .35 * Math.sin(t * 9));                         // 耀斑预警：快速脉冲
  if (hull < HULL_MAX * .3) a = Math.max(a, .25 + .15 * Math.sin(t * 5));          // 船体危急：常亮 + 心跳
  if (falling) a = Math.max(a, .55 + .4 * Math.sin(t * 14));
  if (tideDepth > 0) a = Math.max(a, tideDepth * (.5 + .4 * Math.sin(t * (4 + 6 * tideDepth))));   // 潮汐：越近越亮越快
  $('redfx').style.opacity = Math.max(0, a).toFixed(2);
}
function welcomeTick() {   // 第一个移动教学完成（或教学已关闭）后，显示欢迎和训练目标
  if (welcomed || !running || openP || cardHold) return;
  if (!(tutOff || tutDone.includes(0))) return;
  welcomed = true;
  toast(T.rank.welcome(systems[0].name), 'good');
}

// =====================================================================
// 知识测验：完成星系后，经验够了就邀请答题（真实天文知识，题目从已解锁的知识库条目里抽）
// =====================================================================
const QUIZ_TIERS = [{ xp: 900, kn: 8, per: 20 }, { xp: 1500, kn: 16, per: 30 }, { xp: 3000, kn: 24, per: 50 }];   // 经验超过 xp、并且已解锁 kn 个有题的知识条目后，完成一个星系时弹出邀请；答对一题加 per 经验
const QUIZ_N = 5, QUIZ_SEC = 20;                                                          // 每次 5 题，每题限时 20 秒
const quiz = { offered: [...(save?.quiz?.offered || [])], used: [...(save?.quiz?.used || [])] };   // offered：邀请弹过的档位；used：已经按过「开始」的档位（只有第一次能加经验）
let quizCheck = false, qz = null;   // quizCheck：刚完成一个星系，等界面都空了再检查；qz：当前的一次答题
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a };
const quizPool = () => [...libSet].filter(k => BANK[k]);                                  // 已解锁、并且有题的条目
const quizAvail = () => quizPool().reduce((n, k) => n + BANK[k].length, 0);
const qzLocked = () => !!(qz && qz.started && !qz.done);                                  // 答题进行中：锁住所有其他面板和按键
// 每一档的题目范围：按玩家解锁的先后顺序，第 1 档 = 第 1～8 个条目，第 2 档 = 第 9～16 个，第 3 档 = 第 17 个起的全部（libSet 存在 localStorage，新建宇宙也不会变）
const tierKeys = t => quizPool().slice(t ? QUIZ_TIERS[t - 1].kn : 0, t === QUIZ_TIERS.length - 1 ? undefined : QUIZ_TIERS[t].kn);   // 最后一档一直到最后一个，题库全部都会用到
const tierReady = t => xp > QUIZ_TIERS[t].xp && quizPool().length >= QUIZ_TIERS[t].kn && !quiz.used.includes(t);   // 经验够、知识够、还没答过
// 练习：只从还没答过的档位的范围里抽（已答过的档位的条目不再练）；全答过了就从所有已解锁条目里抽
const practiceKeys = () => { const done = new Set(quiz.used.flatMap(tierKeys)), ks = quizPool().filter(k => !done.has(k)); return ks.reduce((n, k) => n + BANK[k].length, 0) >= QUIZ_N ? ks : quizPool() };   // 剩下的题不够一轮（例如档位全答过了）就从所有已解锁条目里抽
function quizTick() {   // 每帧检查：刚完成星系 → 等晋升、收藏、全景图、卡片都收完之后，按经验弹出邀请
  if (!quizCheck || !running || openP || cardHold || collectPending || warp || rankTarget() > rankSeen || !$('card').classList.contains('hidden') || !$('cardbig').classList.contains('hidden')) return;
  quizCheck = false;
  const t = QUIZ_TIERS.findIndex((_, i) => !quiz.offered.includes(i) && tierReady(i));
  if (t < 0) return;
  quiz.offered.push(t); doSave(); showQuizOffer(t);
}
function drawQuiz(keys) {   // 从给定的条目里抽 5 题：尽量每个条目一题，不够再从同一批条目里补
  const all = shuffle(keys.flatMap(k => BANK[k].map((q, i) => ({ key: k, q })))), qs = [], seen = new Set();
  for (const x of shuffle(all)) if (qs.length < QUIZ_N && !seen.has(x.key)) { seen.add(x.key); qs.push(x) }
  for (const x of all) if (qs.length < QUIZ_N && !qs.includes(x)) qs.push(x);
  return qs.map(({ key, q }) => { const opts = shuffle([q[1], q[2], q[3], q[4]]); return { key, q: q[0], opts, ans: opts.indexOf(q[1]), exp: q[5] } });
}
function showQuizOffer(t) {
  qz = { tier: t, started: false, done: false };
  $('quiz').firstElementChild.innerHTML = H.quizOfferHtml({ n: t + 1, per: QUIZ_TIERS[t].per, count: QUIZ_N, sec: QUIZ_SEC });
  $('qzStart').onclick = () => startQuiz(t);
  $('qzReview').onclick = () => { closePanel(); libCur = '__quiz'; openPanel('lib') };   // 去知识库复习；测验一直等着，知识库里随时可以开始
  $('qzSkip').onclick = () => closePanel();
  openPanel('quiz'); [660, 880].forEach((f, i) => beep(f, .15, 'triangle', .05, i * .1));
}
function startQuiz(t) {   // t：档位序号；null 或已经答过的档位 = 练习（不加经验）
  const tier = t != null && tierReady(t) ? t : null;
  const qs = drawQuiz(tier != null ? tierKeys(tier) : practiceKeys());
  if (!qs.length) { toast(T.quiz.noPool, 'warn'); return }
  if (tier != null) { quiz.used.push(tier); if (!quiz.offered.includes(tier)) quiz.offered.push(tier); doSave() }   // 按下「开始」就用掉这一档的机会：之后再答都是练习
  qz = { tier, per: tier != null ? QUIZ_TIERS[tier].per : 0, qs, i: 0, right: 0, gain: 0, started: true, done: false, answered: false, timer: 0, deadline: 0 };
  if (openP !== 'quiz') openPanel('quiz');
  showQuizQ();
}
function showQuizQ() {
  const q = qz.qs[qz.i], box = $('quiz').firstElementChild; qz.answered = false; qz.deadline = Date.now() + QUIZ_SEC * 1000;
  box.innerHTML = H.quizQHtml({ label: qz.per ? T.quiz.tierLabel(qz.tier + 1, qz.per) : T.quiz.practiceLabel, i: qz.i + 1, n: qz.qs.length, q: q.q, opts: q.opts, sec: QUIZ_SEC });
  box.querySelectorAll('.c-qz-opt').forEach(b => b.onclick = () => { b.blur(); answerQuiz(+b.dataset.i) });
  $('qzQuit').onclick = () => finishQuiz(true);
  clearInterval(qz.timer); qz.timer = setInterval(quizTimer, 100);
}
function quizTimer() {
  if (!qz || qz.answered || qz.done || openP !== 'quiz') return;
  const left = (qz.deadline - Date.now()) / 1000;
  $('qzBar').style.width = Math.max(0, left / QUIZ_SEC * 100) + '%'; $('qzTime').textContent = Math.max(0, Math.ceil(left)); $('qzBar').classList.toggle('low', left < 6);
  if (left <= 0) answerQuiz(-1);   // 超时算答错
}
function answerQuiz(i) {
  if (!qz || qz.answered || qz.done) return;
  qz.answered = true; clearInterval(qz.timer);
  const q = qz.qs[qz.i], ok = i === q.ans, last = qz.i + 1 >= qz.qs.length;
  if (ok) { qz.right++; if (qz.per) { qz.gain += qz.per; addXp(qz.per); doSave() } beep(880, .1, 'triangle', .06); beep(1320, .14, 'triangle', .06, .09) } else beep(180, .3, 'sawtooth', .05);   // 答对立刻加经验并存档
  $('quiz').querySelectorAll('.c-qz-opt').forEach((b, k) => { b.disabled = true; b.classList.toggle('ok', k === q.ans); b.classList.toggle('bad', k === i && !ok) });
  $('qzFb').innerHTML = H.quizFbHtml({ ok, timeout: i < 0, ans: q.opts[q.ans], exp: q.exp, gain: ok ? qz.per : 0 });
  $('qzBar').parentElement.classList.add('hidden');
  const nx = $('qzNext'); nx.textContent = last ? T.quiz.seeResult : T.quiz.next; nx.classList.remove('hidden'); nx.onclick = () => nextQuiz();
}
function nextQuiz() { if (!qz || !qz.answered || qz.done) return; qz.i++; if (qz.i >= qz.qs.length) finishQuiz(false); else showQuizQ() }
function finishQuiz(quit) {   // quit：中途放弃（答对的已经加了经验，没答的不算）
  if (!qz || qz.done) return; qz.done = true; clearInterval(qz.timer);
  $('quiz').firstElementChild.innerHTML = H.quizResultHtml({ quit, right: qz.right, n: qz.qs.length, gain: qz.gain, practice: !qz.per, answered: qz.i + (qz.answered ? 1 : 0),
    tiers: !qz.per && quizAvail() ? QUIZ_TIERS.map((t, i) => ({ i, n: i + 1, per: t.per })).filter(t => tierReady(t.i)) : [] });   // 练习结束：如果有符合条件的档位，直接让玩家选择答题
  $('quiz').querySelectorAll('[data-qt]').forEach(b => b.onclick = () => startQuiz(+b.dataset.qt));
  $('qzDone').onclick = () => closePanel();
  $('qzAgain').onclick = () => startQuiz(null);
  if (qz.gain) [660, 880, 1100].forEach((f, i) => beep(f, .15, 'triangle', .05, i * .08));
}
function quizKey(e) {   // 测验面板打开时的按键：1～4 / A～D 选答案，Enter / 空格 下一步
  if (!qz) return; const k = e.code, go = k === 'Enter' || k === 'NumpadEnter' || k === 'Space';
  if (!qz.started) { if (go) $('qzStart')?.click(); else if (k === 'Escape') closePanel(); return }
  if (qz.done) { if (go || k === 'Escape') closePanel(); return }
  if (!qz.answered) { const m = /^(?:Digit|Numpad)([1-4])$/.exec(k), a = /^Key([A-D])$/.exec(k); const i = m ? +m[1] - 1 : a ? 'ABCD'.indexOf(a[1]) : -1; if (i >= 0) answerQuiz(i); return }
  if (go) nextQuiz();
}
function renderQuizMenu() {   // 知识库里的「知识测验」页：待答的档位、练习
  return H.quizMenuHtml({ xp, avail: quizAvail(), pool: quizPool().length, tiers: QUIZ_TIERS.map((t, i) => ({ n: i + 1, need: t.xp, kn: t.kn, xpOk: xp > t.xp, knOk: quizPool().length >= t.kn, per: t.per, state: quiz.used.includes(i) ? 'done' : tierReady(i) ? 'ready' : 'locked' })) });
}

function promoTick() {   // 每帧检查：经验够了就弹出晋升（等收藏、卡片、其他面板都关了之后）
  if (!running || rankTarget() <= rankSeen || openP || cardHold || collectPending || !$('card').classList.contains('hidden')) return;
  rankSeen++;
  const r = rankSeen, box = $('know').firstElementChild; box.classList.remove('lib'); box.classList.add('rich');
  box.innerHTML = H.promoHtml({ rank: r, rankName: RANKS[r].name, nextName: RANKS[r + 1]?.name, xp, need: RANK_NEED[r] || 0, lo: RANK_NEED[r - 1], sysXp: 0 });
  box.querySelectorAll('button').forEach(b => b.onclick = () => closePanel());
  openPanel('know'); [660, 880, 1100, 1320].forEach((f, i) => beep(f, .2, 'triangle', .06, i * .08));
  setQuestTarget(); loaded.forEach(addStoryBeacon); doSave();
}
const DROP_XP = [0, 325, 800, 1550, 2700];   // 降到某军衔后的经验（下标 = 降级后的军衔：初/中/高/资深）
function demote() {   // 被强制送回家园：降一级（最低初级），经验降到新军衔区间的中间值
  const r = rank(), nr = Math.max(1, r - 1);
  xp = Math.min(xp, DROP_XP[nr]); rankSeen = nr;
  toast(r === nr ? T.rank.xpDropped(xp) : T.rank.demoted(RANKS[r].name, RANKS[nr].name, xp), 'warn');
  setQuestTarget();
}
function hazards(dt) {
  emgFuelTick();
  if (bhWarnEl && (warp || falling || hull <= 0 || rank() < 1)) bhWarnClear();
  if (rank() < 1) { tideDepth = 0; flare = null; inBelt = false; meltDepth = 0; return }   // 实习生：没有危险
  if (warp) { tideDepth = 0; meltDepth = 0; return }
  if (falling) { fallTick(dt); return }
  if (hull <= 0) { wreck(); return }
  tide(dt);
  let near = null;
  for (const L of loaded) for (const s of L.stars) { tV.copy(s.mesh.position).add(L.sys.pos); const d = ship.pos.distanceTo(tV), R = s.st.radius; if (d < R * 5 && (!near || d < near.d)) near = { pos: tV.clone(), R, d, mul: L.sys.flare ?? 1 } }
  // 熔毁区：持续高温伤害（5～15 点/秒，越近越重），不再是「贴着恒星也没事」
  meltDepth = 0;
  if (near) { const z = starZones(near.R); if (near.d < z.melt) meltDepth = Math.max(0, Math.min(1, 1 - (near.d - z.inner) / (z.melt - z.inner))) }
  if (meltDepth > 0) {
    hull = Math.max(0, hull - (5 + 10 * meltDepth) * danger() * dt);
    meltWarnCd -= dt; if (meltWarnCd <= 0) { meltWarnCd = 3; toast(T.toast.meltWarn, 'warn'); beep(160, .25, 'sawtooth', .06) }
  } else meltWarnCd = 0;
  if (flare) {
    flare.t -= dt;
    if (flare.t <= 0) {
      const d = ship.pos.distanceTo(flare.pos);
      if (d < flare.R * 5) { const k = flareDepth(d, flare.R); hurt((6 + 18 * k) * danger(), T.toast.hurtFlare); energy = 0; fuel = Math.max(0, fuel - 5) } else toast(T.toast.flareAvoided, 'good');   // 耀斑伤害随距离：5R 边缘约 6 点，熔毁区边缘约 24 点
      flare = null; flareCd = 25; know('flare', 1500)
    }
  } else {
    flareCd -= dt;
    if (near && flareCd <= 0 && Math.random() < .08 * (.5 + flareDepth(near.d, near.R)) * near.mul * danger() * dt) { flare = { t: 4, pos: near.pos, R: near.R }; toast(T.toast.flareWarn, 'warn'); beep(220, .3, 'square', .05) }   // 耀斑概率也随距离：边缘 0.5 倍 → 近处 1.5 倍
  }
  let now = false;
  for (const L of loaded) {
    if (!L.belt || !L.belt.visible) continue;
    const { a, b } = L.belt.userData, rx = ship.pos.x - L.sys.pos.x, rz = ship.pos.z - L.sys.pos.z, ry = ship.pos.y - L.sys.pos.y, r = Math.hypot(rx, rz), v = ship.vel.length();
    if (r > a - 1 && r < b + 1 && Math.abs(ry) < 4) { now = true; if (v > 12) { beltAcc += (v - 12) * .05 * danger() * dt; if (beltAcc >= 3) { hurt(beltAcc, T.toast.hurtBelt); beltAcc = 0 } } }
  }
  if (now && !inBelt) { toast(T.toast.beltEnter, 'warn'); know('belt', 1500) }
  inBelt = now;
}
// ---- 恒星扫描 ----
const STAR_CLASS = ['G', 'F', 'K', 'A', 'M'];
const STAR_TEMP = { G: 5700, F: 6600, K: 4600, A: 8500, M: 3200, RG: 4000 };   // 游戏里生成的恒星：各类型的典型温度（设定值）
const starClassOf = s => s.rid ? byId(s.rid).star.type[0] : s.cat === 'redGiant' ? 'RG' : STAR_CLASS[Math.max(0, STAR_COLS.indexOf(s.color))];
function completeScan(c, quiet = false) {   // quiet：一次扫多颗时，其他行星只入账、不弹卡片
  if (c.id === 'bh') {
    if (bhDone) { toast(T.toast.bhRecorded); return }
    if (frags < FRAG_N) { toast(T.toast.bhEcho(frags, FRAG_N), 'warn'); beep(120, .5, 'sine', .06); return }
    if (!bhOn()) { toast(T.toast.bhRank(RANKS[5].name), 'warn'); return }    
    showEnding(); return;
  }
  did.scan = true;
  const p = c.p, isNew = !discovered.has(p.id);
  if (isNew) {
    const gx = xpSeen.has(p.id) ? 0 : PLANET_XP(p); xpSeen.add(p.id); addXp(gx);
    if (p.ring || p.moons >= 3) know('ringMoon', 1500);
    discovered.add(p.id); credits += p.info.value; fuel = Math.min(fuelMax(), fuel + p.info.fuelGain);
        toast(T.toast.discovered(p.name, p.info.value, gx), 'good');
    [660, 880, 1100].forEach((f, i) => beep(f, .18, 'triangle', .06, i * .09)); doSave();
    const sys = systems[+p.id.split(':')[0]];
    if (genPlanets(sys).every(q => q.home || discovered.has(q.id))) {
      const gain = sysGain(sys);
      if (!doneSys.has(sys.i)) { doneSys.add(sys.i); addXp(gain) }
      toast(T.toast.sysComplete(sys.name, gain), 'good');
      shootPano(sys.i, true);   // 完成星系扫描：自动拍下这个星系的全景图
      quizCheck = true;   // 完成星系：等收藏、晋升都收完后，按经验检查要不要弹知识测验
      collectWait(sys.i);   // 收藏页要等行星卡片飞走（或玩家关掉介绍）、其他面板都关了才弹；晋升弹窗再排在收藏之后
    }
  } else beep(500, .1);
  takeSample(p);
  if (!quiet) showCard(p, isNew);
  // 主线：当前碎片对应的异常行星（即使之前已扫描过，再扫一次也能取得碎片）
  if (qOn() && fragKind(frags) === 'planet' && p.id === fragSys[frags] + ':' + fragPlanetIdx(frags)) collectFragment(true);
}

// ---- 范围扫描（扫描仪升级后：鼠标右键 / V） ----
// 圈内、扫描距离内的行星全部一起扫（不设数量上限）；已扫描过的和主线碎片行星不参与（碎片行星要单独扫，才会播放剧情）
let noteQ = [];   // 范围扫描后，要依次弹出的「第一次遇到某类行星」的介绍
function scanGroup(list) {
  const wasNew = new Map(list.map(p => [p, !discovered.has(p.id)]));
  for (const p of list) completeScan({ id: p.id, p }, true);   // 每颗各算各的：信用点、经验、采样、收藏、完成星系
  toast(T.toast.multiScan(list.length), 'good');
  showMulti(list, wasNew);
}
function showMulti(list, wasNew) {
  const box = $('multi').firstElementChild;
  box.innerHTML = H.multiHtml(list.map(p => ({ src: cardURL(p), name: p.name, reward: wasNew.get(p) ? T.multi.reward(p.info.value) : T.cards.collected, isNew: wasNew.get(p) })));
  box.querySelectorAll('.c-mc').forEach(el => el.onclick = () => { bigList = [...box.querySelectorAll('img')]; showBig(+el.dataset.i) });   // 点一张放大（可翻页、下载）
  $('multiOk').onclick = () => closePanel();
  openPanel('multi'); afterKnow = () => queueNotes(list);   // 关掉之后，再依次弹出「第一次遇到」的介绍
  beep(880, .08, 'triangle', .05); beep(1100, .1, 'triangle', .05, .08);
}
function queueNotes(list) {
  const keys = new Set(); noteQ = [];
  for (const p of list) { const key = p.cat ? 'cat_' + p.cat : 'kind_' + p.kind; if (KNOW[key] && !knowSeen.has(key) && !keys.has(key)) { keys.add(key); noteQ.push(p) } }
  nextNote();
}
function nextNote() { const p = noteQ.shift(); if (p) showCard(p, false) }

// =====================================================================
// 主更新
// =====================================================================
const tV = new THREE.Vector3(), tV2 = new THREE.Vector3(), tV3 = new THREE.Vector3(), tQ = new THREE.Quaternion(),
  tE = new THREE.Euler(), tM = new THREE.Matrix4(), inp = new THREE.Vector3();
let boostLock = false, saveTimer = 0, wr = 0, scooping = false;

// ---- 曲速航线：出发时规划一次，沿着一条平滑的曲线飞 ----
// 1) 把恒星、行星（目标星系的行星按初始相位算）、奇点潮汐区都当作球，沿「起点 → 终点」检查，哪里被挡就在球的外侧插一个绕行点（离球远一些，弧线大一些）；
// 2) 用 Catmull-Rom 曲线把起点、绕行点、终点连起来，再按弧长取样；
// 3) 按「加速度限制 + 弯道限速 + 接近时减速」算出每一点的速度，飞行时只是沿着这条曲线走。
const wsE = new THREE.Euler(), wsC = new THREE.Vector3();
const WARP_VMAX = 900, WARP_ACC = 520, WARP_DEC = 420, WARP_LAT = 1500;   // 最高速 / 起步加速度 / 减速度 / 弯道最大侧向加速度（u/s，u/s²）
const WARP_ARR_ELEV = 30 * Math.PI / 180, WARP_FACE = 250, warpF = new THREE.Vector3();   // 曲速终点：停在恒星斜上方 30°（不在行星轨道面上，能看到行星离得有一段距离）；最后 250 u 船头慢慢转向恒星
const WARP_TURN = 2.4;                                                  // 船头最快的转动速度（弧度/秒，约 137°/秒）
const WARP_GAP = 100;                                                  // 越过天体时离它（碰撞半径之外）至少多高 / 多远
function warpObstacles(t, fn) {              // fn(球心, 碰撞半径, 是否奇点, 是否行星, 是否目标星系的行星)；目标星系自己的恒星不算（曲速本来就停在 ARRIVE 之外）
  const seen = new Set(loaded.map(L => L.sys.i));
  for (const L of loaded) if (L.sys !== t) for (const s of L.stars) fn(wsC.copy(s.mesh.position).add(L.sys.pos), s.st.radius * 1.5 + 2);
  for (const sys of systems) {
    if (sys === t || seen.has(sys.i) || sys.pos.distanceToSquared(ship.pos) > 1400 * 1400) continue;
    for (const st of genStars(sys)) fn(wsC.set(Math.cos(st.phase) * st.orbitR, 0, Math.sin(st.phase) * st.orbitR).add(sys.pos), st.radius * 1.5 + 2)
  }
  for (const L of loaded) for (const pl of L.planets) { if (!pl.show) continue; pl.mesh.getWorldPosition(wsC); fn(wsC, pl.p.radius * 4 + 10, false, true, L.sys === t) }
  if (!loaded.some(L => L.sys === t)) for (const p of genPlanets(t)) {   // 目标星系还没加载：行星按初始相位算位置（加载后就是这个位置）
    orbitPos(p, solveE(p.phase, p.ecc), wsC); wsC.applyEuler(wsE.set(p.inc, p.node, 0, 'YXZ')).add(t.pos); fn(wsC, p.radius * 4 + 10, false, true, true)
  }
  fn(wsC.copy(bh.position), TIDE_R, true);   // 奇点的潮汐区
}
function segMin(a, b, c) {   // 线段 ab 上离点 c 最近的点：{u: 位置(0~1), q: 点, dist}
  const d = b.clone().sub(a), l2 = d.lengthSq(), u = l2 ? Math.max(0, Math.min(1, c.clone().sub(a).dot(d) / l2)) : 0, q = a.clone().addScaledVector(d, u);
  return { u, q, dist: q.distanceTo(c) };
}
function warpPlan(t) {
  // 垂直绕飞：银河是一张薄盘，恒星、行星、奇点几乎都在同一个水平面上，所以水平方向保持直线，遇到挡路的天体就把高度抬起来（或压下去）从它上方（下方）越过。
  // 1) 沿「起点 → 终点」的直线取样，算出每个位置为了离开天体（碰撞半径 + WARP_GAP）至少要抬高多少；
  // 2) 先把抬高量“放宽”再“平均”（窗口相同，结果一定不低于要求），得到平缓的拱形；
  // 3) 往上还是往下：看飞船相对挡路天体在上还是在下，靠哪边近就走哪边。
  const A = ship.pos.clone(), T = t.pos, obs = [];
  warpObstacles(t, (c, r, hard, planet, tgt) => obs.push({ c: c.clone(), r, hard: !!hard, planet: !!planet, tgt: !!tgt }));
  const dA0 = A.clone().sub(T), hz = Math.hypot(dA0.x, dA0.z), el = Math.max(WARP_ARR_ELEV, Math.atan2(dA0.y, hz)), ce = Math.cos(el);   // 终点：恒星斜上方（方位还是从来的那一侧，仰角至少 30°）
  const E = T.clone().add(new THREE.Vector3(hz > 1e-3 ? dA0.x / hz * ce : ce, Math.sin(el), hz > 1e-3 ? dA0.z / hz * ce : 0).multiplyScalar(ARRIVE)), L0 = A.distanceTo(E), N0 = Math.max(8, Math.ceil(L0 / 8)), ds0 = L0 / N0;
  const os = [];
  for (const o of obs) {
    if (o.tgt) continue;                                            // 目标星系的行星：终点就在它们中间，不管
    const dA = A.distanceTo(o.c), dE = E.distanceTo(o.c);
    if (o.planet && dA < o.r + WARP_GAP) continue;                  // 起点就在这颗行星附近：不管（碰撞检测兜底）
    const R = Math.min(o.r + WARP_GAP, dA - 2, dE - 2);             // 起点/终点已经贴着圈：圈缩小，保证起终点在圈外
    if (R >= o.r + 15) os.push({ c: o.c, R, r: o.r });
    else if (o.hard && dA < o.r && R >= 30) os.push({ c: o.c, R, r: Math.max(0, R - 25) });   // 起点在奇点潮汐区里（例如紧急曲速）：从奇点上方（下方）越过，不穿过奇点
  }
  const base = i => A.clone().lerp(E, i / N0), basePts = Array.from({ length: N0 + 1 }, (_, i) => base(i));
  const need = new Float64Array(N0 + 1).fill(-Infinity), needD = new Float64Array(N0 + 1).fill(Infinity), blocking = [];
  for (const o of os) {
    let hit = false;
    basePts.forEach((q, i) => { const dxz = Math.hypot(q.x - o.c.x, q.z - o.c.z); if (dxz < o.R) { const h = Math.sqrt(o.R * o.R - dxz * dxz); need[i] = Math.max(need[i], o.c.y + h); needD[i] = Math.min(needD[i], o.c.y - h); hit = true } });
    if (hit) blocking.push(o);
  }
  let sigma = 1;   // +1 向上，-1 向下
  if (blocking.length) {
    const d = A.y - blocking.reduce((a, o) => a + o.c.y, 0) / blocking.length;
    sigma = Math.abs(d) < 1.5 ? (new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quat).y >= 0 ? 1 : -1) : d > 0 ? 1 : -1;
  }
  const lift = new Float64Array(N0 + 1);   // σ 方向上需要抬高多少（>=0）
  for (let i = 0; i <= N0; i++) lift[i] = blocking.length ? Math.max(0, sigma > 0 ? need[i] - basePts[i].y : basePts[i].y - needD[i]) : 0;
  const H = Math.max(0, ...lift), w = Math.max(1, Math.round(Math.max(150, Math.min(450, 1.5 * H)) / ds0));
  const ramp = Math.max(60, Math.min(400, L0 * .3));   // 两端渐入渐出的长度
  const smooth = lf => {
    const dil = new Float64Array(N0 + 1), out = new Float64Array(N0 + 1);
    for (let i = 0; i <= N0; i++) { let m = 0; for (let j = Math.max(0, i - w); j <= Math.min(N0, i + w); j++) m = Math.max(m, lf[j]); dil[i] = m }
    for (let i = 0; i <= N0; i++) { let sum = 0, c = 0; for (let j = i - w; j <= i + w; j++) { sum += dil[Math.max(0, Math.min(N0, j))]; c++ } out[i] = sum / c }
    for (let i = 0; i <= N0; i++) { const e = Math.min(i, N0 - i) * ds0 / ramp, k = Math.min(1, e); out[i] *= k * k * (3 - 2 * k) }   // 两端渐入，起点终点不突然拔高
    return out;
  };
  const sm0 = smooth(lift);
  const clearance = ys => { let m = Infinity; for (const o of os) for (let i = 0; i <= N0; i++) { const q = basePts[i], d = Math.hypot(q.x - o.c.x, q.z - o.c.z, q.y + sigma * ys[i] - o.c.y) - o.r; if (d < m) m = d } return m };
  let mult = 1, ok = true, sm = sm0;
  if (blocking.length) {   // 万一没抬够（两端渐入等造成）：整体再抬高一点重来
    for (let it = 0; it < 4; it++) { sm = sm0.map(v => v * mult); if (clearance(sm) >= 20) break; mult *= 1.3; if (it === 3) { ok = false; sm = sm0.map(v => v * mult) } }
  }
  const poly = basePts.map((q, i) => new THREE.Vector3(q.x, q.y + sigma * sm[i], q.z));
  // 按弧长重新取样（拱形让路径变长了一点）
  const cum = [0]; for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + poly[i].distanceTo(poly[i - 1]));
  const L = cum[cum.length - 1], N = Math.max(8, Math.ceil(L / 8)), sp = []; let k = 0;
  for (let i = 0; i <= N; i++) { const d = L * i / N; while (k < cum.length - 2 && cum[k + 1] < d) k++; const f = (d - cum[k]) / Math.max(1e-6, cum[k + 1] - cum[k]); sp.push(poly[k].clone().lerp(poly[k + 1], Math.min(1, f))) }
  const best = { pts: sp, L, N, ds: L / N, wp: [A, E], scale: 1, ok, found: true, sigma, lift: Math.round(Math.max(...sm)) };
  const P = best, v = new Float32Array(P.N + 1), tan = [];
  for (let i = 0; i <= P.N; i++) tan.push(P.pts[Math.min(P.N, i + 1)].clone().sub(P.pts[Math.max(0, i - 1)]).normalize());
  for (let i = 0; i <= P.N; i++) {   // 弯道限速：曲率越大越慢
    const k = i && i < P.N ? Math.acos(Math.max(-1, Math.min(1, tan[i - 1].dot(tan[i + 1])))) / (2 * P.ds) : 0;
    v[i] = Math.min(WARP_VMAX, Math.sqrt(WARP_LAT / Math.max(k, 1e-6)));
  }
  v[0] = Math.min(v[0], 30); v[P.N] = Math.min(v[P.N], 25);
  for (let i = 1; i <= P.N; i++) v[i] = Math.min(v[i], Math.sqrt(v[i - 1] * v[i - 1] + 2 * WARP_ACC * P.ds));   // 加速度限制（向前）
  for (let i = P.N - 1; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[i + 1] * v[i + 1] + 2 * WARP_DEC * P.ds));   // 减速度限制（向后）
  P.v = v; P.tan = tan; return P;
}
function update(dt) {
  // ---- 转向 ----
  const k = keys, rollIn = (k.KeyE ? 1 : 0) - (k.KeyQ ? 1 : 0), yawIn = (k.ArrowLeft ? 1 : 0) - (k.ArrowRight ? 1 : 0), pitchIn = (k.ArrowUp ? 1 : 0) - (k.ArrowDown ? 1 : 0);
  if (!warp && !falling) {
    if (rollIn || yawIn || pitchIn) { tE.set(pitchIn * 1.2 * dt, yawIn * 1.4 * dt, -rollIn * 1.4 * dt); tQ.setFromEuler(tE); ship.quat.multiply(tQ) }
    if (mouseDX || mouseDY) { tE.set(-mouseDY * .0022, -mouseDX * .0022, 0); tQ.setFromEuler(tE); ship.quat.multiply(tQ) }
  }
  // ---- 计算转向消耗 ----
  lookAcc += Math.abs(mouseDX) + Math.abs(mouseDY) + (rollIn || yawIn || pitchIn ? 300 * dt : 0);
  mouseDX = mouseDY = 0; ship.quat.normalize();

  // ---- 移动 ----
  if (warp) {
    // 沿着出发时规划好的曲线飞：s = 已飞过的弧长；速度取自预先算好的速度曲线；船头还没对准曲线时先原地等一等（起步转向）
    const P = warp.plan, fi = Math.min(P.N - 1e-6, warp.s / P.ds), i0 = Math.floor(fi), f = fi - i0;
    tV.copy(P.tan[i0]).lerp(P.tan[i0 + 1], f).normalize();   // 这一点的前进方向
    const bf = Math.max(0, Math.min(1, 1 - (P.L - warp.s) / WARP_FACE)), bs = bf * bf * (3 - 2 * bf);   // 快到了：船头从行进方向慢慢转向恒星
    warpF.copy(warp.target.pos).sub(ship.pos).normalize().multiplyScalar(bs).addScaledVector(tV, 1 - bs).normalize();
    tM.lookAt(ship.pos, tV2.copy(ship.pos).add(warpF), UP); tQ.setFromRotationMatrix(tM); ship.quat.rotateTowards(tQ, Math.min(WARP_TURN * dt, ship.quat.angleTo(tQ) * (1 - Math.exp(-dt * 4))));   // 船头转向：先缓后快，且角速度有上限，起步不会猛甩
    tV2.set(0, 0, -1).applyQuaternion(ship.quat);
    const align = tV2.dot(warpF), kk = Math.max(0, Math.min(1, (align - .55) / .42)), vp = P.v[i0] + (P.v[i0 + 1] - P.v[i0]) * f;
    warp.s = Math.min(P.L, warp.s + Math.max(vp, 12) * kk * kk * (3 - 2 * kk) * dt);
    const fj = Math.min(P.N - 1e-6, warp.s / P.ds), j0 = Math.floor(fj);
    tV.copy(P.pts[j0]).lerp(P.pts[j0 + 1], fj - j0);                     // 曲线上的新位置
    ship.vel.copy(tV).sub(ship.pos).divideScalar(Math.max(dt, 1e-4));   // 速度 = 回到曲线上所需的位移 / 时间（这样飞船严格沿着曲线走）
    if (warp.s >= P.L - .5) endWarp(true);
    else if (k.KeyS && !warp.emergency) endWarp(false);
    energy = Math.min(energyMax(), energy + 10 * dt);
  } else if (falling) {   // 越过不可回头点：失控翻滚着被拖向奇点，不再响应操作
    tV.copy(bh.position).sub(ship.pos).normalize();
    ship.vel.lerp(tV.multiplyScalar(1.5 + .08 * falling.t * falling.t), 1 - Math.exp(-dt * 2));   // 慢慢加速，下落约 9～10 秒
    tE.set(0, 0, dt * (.45 + .46 * falling.t / 9.4)); tQ.setFromEuler(tE); ship.quat.multiply(tQ);   // 镜头绕视线滚转：画面顺时针转（左边向上、上边向右、右边向下、下边向左），约 9.4 秒正好转一圈（360°），越转越快；黑洞始终在画面中央
  } else {
    inp.set((k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0), (k.KeyZ ? 1 : 0) - (k.KeyC ? 1 : 0), (k.KeyS ? 1 : 0) - (k.KeyW ? 1 : 0));
    const shift = k.ShiftLeft || k.ShiftRight;
    if (shift && inp.lengthSq() === 0) inp.set(0, 0, -1);
    if (boostLock && energy > 25) boostLock = false;
    const boosting = shift && energy > 0 && !boostLock;
    if (boosting) { energy -= 28 * dt; if (energy <= 0) { energy = 0; boostLock = true } }
    else energy = Math.min(energyMax(), energy + (14 + 4 * up.boost) * dt);
    const moving = inp.lengthSq() > 0;
    if (moving) inp.normalize().multiplyScalar(maxSpeed() * (boosting ? 4 : 1)).applyQuaternion(ship.quat);
    if (tideDepth > 0) {   // 奇点引力：远离奇点的分量被削弱（后退尤其吃力），整体速度也被拖慢；越近越明显
      tV2.copy(ship.pos).sub(bh.position).normalize(); const out = inp.dot(tV2);
      if (out > 0) inp.addScaledVector(tV2, -out * .9 * tideDepth);
      inp.multiplyScalar(1 - .3 * tideDepth);
    }
    ship.vel.lerp(inp, 1 - Math.exp(-dt * (moving ? 2.4 : .8)));
  }
  ship.pos.addScaledVector(ship.vel, dt);
  const speed = ship.vel.length(); wr = warp ? speed / 900 : 0;

  // ---- 尘埃 ----
  for (let i = 0; i < DUST_N; i++) {
    for (let a = 0; a < 3; a++) {
      const c = a === 0 ? ship.pos.x : a === 1 ? ship.pos.y : ship.pos.z, v = dustPos[i * 3 + a];
      dustPos[i * 3 + a] = c + ((((v - c + DUST_R) % (DUST_R * 2)) + DUST_R * 2) % (DUST_R * 2)) - DUST_R;
    }
  }
  dustGeo.attributes.position.needsUpdate = true;

  // ---- 恒星系 ----
  updateLOD();
  bhDisk.rotation.z += dt * .4;
  scooping = false;
  for (const L of loaded) {
    // 淡入显示
    if (L.fade < 1) { L.fade = Math.min(1, L.fade + dt / 1.5); fadeSystem(L, L.fade); }
    // 最近的星系完整显示；若同时存在另一个星系，它只显示恒星和主线目标，避免轨道/行星互相重叠
    const full = L === cur;
    L.t += dt;
    addStoryBeacon(L);   // 保险：主线信标缺失时每帧补建（条件不满足会立即返回）    
    for (const s of L.stars) {
      const a = s.st.phase + L.t * s.st.speed;
      s.mesh.position.set(Math.cos(a) * s.st.orbitR, 0, Math.sin(a) * s.st.orbitR);
      s.light.position.copy(s.mesh.position);
      s.light.intensity = full ? s.base : 0;
    }
    for (const o of L.orbits) o.visible = full;
    if (L.belt) L.belt.visible = full;
    for (const b of L.beacons) {
      tV.copy(b.local).add(L.sys.pos); b.d = tV.distanceTo(ship.pos);
      b.mesh.visible = (full || !!b.story) && b.d < detectR(b);
      if (!b.story && !b.ided && b.d < idR(b)) { b.ided = true; const c = SIG[b.type].color; b.mesh.material.color.setHex(c); b.glow.material.color.setHex(c); if (b.type === 'decoy') toast(T.toast.decoyDetected, 'warn') }
    }
    for (const pl of L.planets) { pl.show = full || isQuestPlanet(pl.p); pl.pivot.visible = pl.show }
    for (const pl of L.planets) {
      pl.M += dt * TAU / pl.p.period / 6 * pl.p.dir; orbitPos(pl.p, solveE(pl.M, pl.p.ecc), pl.mesh.position);
      pl.mesh.rotation.y += dt * .4;
      for (const m of pl.moons) m.pivot.rotation.y += dt * m.speed;
      if (pl.show) {
        pl.mesh.getWorldPosition(tV); tV2.copy(ship.pos).sub(tV); const rr = pl.p.radius + 2.5, d = tV2.length();
        if (d < rr && d > 0) {
          // 计算碰撞法线，推开飞船
          tV2.divideScalar(d); ship.pos.copy(tV).addScaledVector(tV2, rr);
          const vn = ship.vel.dot(tV2); if (vn < 0) ship.vel.addScaledVector(tV2, -vn * 1.2); if (!warp) hit(-vn)
        }
      }
    }
    if (L.belt) L.belt.rotation.y += dt * .03;
    const sp = L.sys.pos;
    for (const s of L.stars) {
      s.mesh.rotation.y += dt * .1;
      tV.copy(s.mesh.position).add(sp);                 // 这颗恒星的世界坐标
      const sd = ship.pos.distanceTo(tV), sr = s.st.radius;
      if (sd < sr * 1.5 + 2) {
        // 计算碰撞法线，推开飞船
        tV2.copy(ship.pos).sub(tV).normalize(); ship.pos.copy(tV).addScaledVector(tV2, sr * 1.5 + 2);
        const vn = ship.vel.dot(tV2); if (vn < 0) ship.vel.addScaledVector(tV2, -vn * 1.2); if (!warp) hit(-vn)
      }
      if (sd < sr * 4.5 && fuel < fuelMax()) { fuel = Math.min(fuelMax(), fuel + 6 * dt); scooping = true }
    }
    // 信标
    for (let i = L.beacons.length - 1; i >= 0; i--) {
      const b = L.beacons[i]; b.mesh.rotation.y += dt * 1.2; b.mesh.rotation.x += dt * .6;
      tV.copy(b.local).add(sp);
      if (ship.pos.distanceTo(tV) < (b.pick || 14)) {
        const story = !!b.story;
        if (!story) claimBeacon(b);
        L.group.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose(); b.label.remove();
        L.beacons.splice(i, 1); if (story) collectFragment(); else doSave();
      }
    }
  }

  // ---- 扫描目标 ----
  tV3.set(0, 0, -1).applyQuaternion(ship.quat);
  let cand = null, cd = 1e9;
  const test = (id, pos, effR, range, obj, min = .1) => {
    tV.copy(pos).sub(ship.pos); const d = tV.length(); if (d > range || d < min) return;
    const ang = Math.acos(Math.min(1, tV.dot(tV3) / d)), angR = Math.asin(Math.min(1, effR / d));
    if (ang < Math.max(angR, .035) && d < cd) { cd = d; cand = { id, d, ...obj } }
  };
  if (!warp) {
    for (const L of loaded) for (const pl of L.planets) { if (!pl.show || pl.p.home) continue; pl.mesh.getWorldPosition(tV2); test(pl.p.id, tV2, pl.p.radius * 1.2 + .5, scanRange(), { p: pl.p, name: pl.p.name }) }
    test('bh', bh.position, BH_T.effR, BH_T.range, { name: BH_T.name });
  }
  // 范围扫描（鼠标右键 / V）：圈内、扫描距离内的行星一起扫；F / 左键仍只扫准星对准的那一颗
  multiOn = !!(mouseRight || k[MULTI_KEY]) && up.scanner > 0 && !paused();
  if (!warp && multiOn) {
    const tol = multiTol(), grp = [];
    for (const L of loaded) for (const pl of L.planets) {
      if (!pl.show || pl.p.home || discovered.has(pl.p.id) || isQuestPlanet(pl.p)) continue;
      pl.mesh.getWorldPosition(tV2); tV.copy(tV2).sub(ship.pos); const d = tV.length(); if (d > scanRange() || d < .1) continue;
      const ang = Math.acos(Math.min(1, tV.dot(tV3) / d)), angR = Math.asin(Math.min(1, (pl.p.radius * 1.2 + .5) / d));
      if (ang < tol + angR) grp.push({ p: pl.p, d });
    }
    grp.sort((a, b) => a.d - b.d);   // 圈内、扫描距离内的行星全部一起扫（不设数量上限；扫描仪等级只决定圈的大小）
    if (grp.length) cand = { id: 'multi', d: grp[0].d, multi: grp };
  }
  scanCand = cand;
  const holding = (mouseHeld || k.KeyF || multiOn) && cand && !paused();
  if (holding) {
    if (scanId !== cand.id) { scanId = cand.id; scanT = 0 }
    if (cand.star && flare) {   // 耀斑预警期间扫描恒星会被打断
      if (scanT > 0 && flare !== scanBreakFlare) { scanBreakFlare = flare; toast(T.hud.scanBreak, 'warn') }
      scanT = 0;
    } else scanT += dt / (cand.id === 'bh' ? 6 + 2 * scanTime() : scanTime() * (cand.star ? .7 + .6 * Math.max(0, Math.min(1, (cand.d - cand.R * 3) / (cand.R * 4))) : 1));   // 恒星：越近扫得越快（0.7～1.3 倍时间）；奇点：约 12 秒（升级扫描仪最多缩到 7 秒），要一边扫描一边顶住引力
    if (scanT >= 1) { if (cand.multi) scanGroup(cand.multi.map(g => g.p)); else completeScan(cand); scanT = 0; mouseHeld = mouseRight = false; keys.KeyF = keys[MULTI_KEY] = false }
  } else { scanT = Math.max(0, scanT - dt * (scanId === 'bh' ? .35 : 2)); if (!cand) scanId = null }   // 奇点的进度掉得慢一些（约 3 秒清零），偏一下不至于前功尽弃

  // ---- 摄像机 ----
  camera.position.copy(ship.pos); camera.quaternion.copy(ship.quat);
  const fovT = 60 + wr * 38 + (speed > maxSpeed() * 1.5 && !warp ? 8 : 0);
  camera.fov = lerp(camera.fov, fovT, 1 - Math.exp(-dt * 5)); camera.updateProjectionMatrix();
  bloom.strength = .25 + wr * .9;
  $('warpfx').style.opacity = Math.min(.8, wr * .9);

  playTime += dt; saveTimer += dt; if (saveTimer > 5) { saveTimer = 0; doSave() }
}

// =====================================================================
// HUD
// =====================================================================
const projV = new THREE.Vector3(), fwdV = new THREE.Vector3();
const BH_MARK_R = 300;   // 离奇点多近开始显示距离标注
const bhMarkEl = Object.assign(document.createElement('div'), { id: 'bhmark', className: 'hidden' }); $('tmark').parentNode.appendChild(bhMarkEl);
function toScreen(pos) {
  fwdV.set(0, 0, -1).applyQuaternion(camera.quaternion);
  const behind = projV.copy(pos).sub(camera.position).dot(fwdV) < 0;
  projV.copy(pos).project(camera);
  return { x: (projV.x * .5 + .5) * innerWidth, y: (-projV.y * .5 + .5) * innerHeight, behind };
}

function updateHUD() {
  $('credits').textContent = credits;
  { const r = rank(), el = $('rankTxt'); if (el) el.innerHTML = H.rankStars(r) + T.rank.hud(RANKS[r].name, xp, RANK_NEED[r]) + (secret ? ' · ✦' + T.rank.title : '') }
  $('cargoTxt').textContent = `${cargoUsed()}/${cargoMax()}`;
  $('hullTxt').textContent = hull < HULL_MAX * .3 ? T.hud.hullDamaged(hull.toFixed(0), HULL_MAX) : `${hull.toFixed(0)}/${HULL_MAX}`;
  $('hullBar').firstElementChild.style.width = hull / HULL_MAX * 100 + '%';
  $('discCount').textContent = discovered.size; $('bcCount').textContent = beaconsGot.size;
  $('fuelTxt').textContent = `${fuel.toFixed(0)}/${fuelMax()}`; $('fuelBar').firstElementChild.style.width = fuel / fuelMax() * 100 + '%';
  $('energyTxt').textContent = boostLock ? T.hud.boostHot : `${energy.toFixed(0)}/${energyMax()}`;
  $('energyBar').firstElementChild.style.width = energy / energyMax() * 100 + '%';
  $('speedTxt').textContent = ship.vel.length().toFixed(0) + ' u/s' + (warp ? T.hud.warpSuffix : '');
  $('sysName').textContent = cur && cur.sys._d < 220 ? T.hud.sysName(cur.sys.name, genStars(cur.sys).length) : T.hud.deepSpace;
  $('nearInfo').textContent = T.hud.nearest(nearest.name, Math.round(nearestDist));
  $('tgtInfo').textContent = target ? T.hud.target(target.name, Math.round(target.pos.distanceTo(ship.pos)), warpCost(target).toFixed(0)) : T.hud.targetNone;

  $('tgtProbe').textContent = target && target.i >= 0 ? (knows(target) ? T.hud.probeKnown(sysSummary(target).short) : T.hud.probeUnknown(probeCost(target))) : '';
  $('quest').textContent = questText();

  // 准星
  const ret = $('reticle'); ret.classList.toggle('hit', !!scanCand);
  { const r2 = $('ring2'), focal = innerHeight / 2 / Math.tan(camera.fov * Math.PI / 360);   // 范围扫描圈：按弧度换算成屏幕像素，随扫描仪等级变大
    r2.style.display = up.scanner > 0 ? '' : 'none'; r2.setAttribute('r', Math.max(30, Math.tan(multiTol()) * focal).toFixed(1)); r2.classList.toggle('on', multiOn) }
  $('ring').style.strokeDashoffset = 163.4 * (1 - Math.min(1, scanT));

  // 提示
  let pr = '';
  if (warp) pr = T.hud.promptWarp(warp.target.name);
  else if (scanCand) {
    if (scanCand.multi) pr = T.hud.promptMulti(scanCand.multi.length, Math.round(scanCand.d));
    else {
      const known = scanCand.p ? discovered.has(scanCand.p.id) : bhDone;
      pr = T.hud.promptScan(scanCand.p && !known ? T.hud.unknownBody : scanCand.name, Math.round(scanCand.d), known) + (up.scanner > 0 && scanCand.p ? T.hud.multiHint : '');   // 还没扫描过的行星不显示名字
    }
  } else if (scooping) pr = T.ui.scooping;
  else if (document.pointerLockElement !== renderer.domElement && !openP) pr = T.ui.pointerLock;
  $('prompt').innerHTML = H.kbd(pr);

  // 行星标签
  for (const L of loaded) {
    for (const pl of L.planets) {
      pl.mesh.getWorldPosition(tV); const d = tV.distanceTo(ship.pos), s = toScreen(tV), known = pl.p.home || discovered.has(pl.p.id);
      if (s.behind || d > 450 || warp || !pl.show) { pl.label.style.display = 'none'; continue }
      const sig = qOn() && fragKind(frags) === 'planet' && pl.p.id === fragSys[frags] + ':' + fragPlanetIdx(frags);
      pl.label.style.display = 'block'; pl.label.className = (known ? 'ok ' : '') + (sig ? 'st' : '');
      pl.label.style.transform = `translate(${s.x}px,${s.y + pl.p.radius * 620 / d + 10}px) translate(-50%,0)`;
      pl.label.innerHTML = (known ? T.hud.planetKnown(pl.p.name, Math.round(d)) : T.hud.planetUnknown(Math.round(d))) + (sig ? T.hud.planetSignal : '');
    }
    for (const b of L.beacons) {
      tV.copy(b.local).add(L.sys.pos); const d = tV.distanceTo(ship.pos), s = toScreen(tV);
      if (s.behind || warp || !b.mesh.visible) { b.label.style.display = 'none'; continue }
      b.label.style.display = 'block'; b.label.style.transform = `translate(${s.x}px,${s.y + 16}px) translate(-50%,0)`;
      const bars = b.story ? '' : ' ' + '▮'.repeat(b.power) + '▯'.repeat(3 - b.power);
      b.label.style.color = b.ided && !b.story ? SIG[b.type].css : '';
      b.label.innerHTML = (b.story ? T.sig.labelStory : b.ided ? T.sig.labelKnown(SIG[b.type].name, b.type === 'decoy') : T.sig.labelUnknown) + bars + `<br>${Math.round(d)} u`;
    }
    L.stars.forEach((x, k) => {   // 伴星标签：方便找到远处的第二、第三颗太阳
      if (!x.label) return;
      tV.copy(x.mesh.position).add(L.sys.pos); const d = tV.distanceTo(ship.pos), sc = toScreen(tV);
      if (sc.behind || d > 600 || warp) { x.label.style.display = 'none'; return }
      x.label.style.display = 'block';
      x.label.style.transform = `translate(${sc.x}px,${sc.y + x.st.radius * 620 / d + 12}px) translate(-50%,0)`;
      x.label.innerHTML = T.hud.companion('ABC'[k], Math.round(d));
    });
  }
  // 主线信标指引：即使在屏幕外也会在边缘显示方向，避免找不到
  const bm = $('bmark'); let sbPos = null;
  for (const L of loaded) { const b = L.beacons.find(x => x.story); if (b) { sbPos = qV.copy(b.local).add(L.sys.pos); break } }
  if (sbPos && !warp) {
    const dB = sbPos.distanceTo(ship.pos), s = toScreen(sbPos); let x = s.x, y = s.y;
    if (s.behind) { x = innerWidth - x; y = innerHeight - y }
    const m = 48; x = Math.max(m, Math.min(innerWidth - m, x)); y = Math.max(m, Math.min(innerHeight - m, y));
    if (s.behind) { x = x < innerWidth / 2 ? m : innerWidth - m }
    bm.classList.remove('hidden'); bm.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`;
    $('bmarkTxt').textContent = T.sig.markerStory(Math.round(dB));
  } else bm.classList.add('hidden');
  // 奇点距离标注：不管有没有任务、有没有设为目标，靠近到 BH_MARK_R 以内就一直显示（深色底 + 青色边框，不会被奇点周围的光吞掉）
  const bhm = bhMarkEl, dBh = ship.pos.distanceTo(bh.position), showBh = !warp && !falling && dBh < BH_MARK_R;
  if (showBh) {
    const s = toScreen(bh.position); let x = s.x, y = s.y + Math.min(innerHeight * .28, 34 * 620 / dBh * .55 + 22);   // 放在吸积盘下方，近了也不压在光上
    if (s.behind) { x = innerWidth - x; y = innerHeight - y }
    const m = 48; x = Math.max(m, Math.min(innerWidth - m, x)); y = Math.max(m, Math.min(innerHeight - m, y));
    if (s.behind) { x = x < innerWidth / 2 ? m : innerWidth - m }
    bhm.classList.remove('hidden'); bhm.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`;
    bhm.textContent = T.hud.markerBh(Math.round(dBh));
  } else bhm.classList.add('hidden');
  // 目标标记
  const tm = $('tmark');
  if (target && !(showBh && target.i === -1)) {   // 目标就是奇点、而奇点标注已经在显示：不重复
    const s = toScreen(target.pos); let x = s.x, y = s.y;
    if (s.behind) { x = innerWidth - x; y = innerHeight - y }
    const m = 40; x = Math.max(m, Math.min(innerWidth - m, x)); y = Math.max(m, Math.min(innerHeight - m, y));
    if (s.behind) { x = x < innerWidth / 2 ? m : innerWidth - m }
    tm.classList.remove('hidden'); tm.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`;
    $('tmarkTxt').textContent = T.hud.markerTarget(target.name, Math.round(target.pos.distanceTo(ship.pos)));
  } else tm.classList.add('hidden');
}

// =====================================================================
// 面板：日志 / 升级 / 星图
// =====================================================================
function renderJournal() {
  const ids = [...discovered].sort((a, b) => { const [s1, p1] = a.split(':').map(Number), [s2, p2] = b.split(':').map(Number); return s1 - s2 || p1 - p2 });
  const planets = ids.map(id => { const [si, pi] = id.split(':').map(Number); return genPlanets(systems[si])[pi] });
  $('jbody').innerHTML = H.journalHtml({
    locked: rank() < 1, frags, total: FRAG_N, bhDone, fragTexts: FRAG_TEXT.slice(0, frags),
    planets, reals: systems.filter(s => s.rid).map(s => ({ name: s.name, visited: visited.has(s.i), ly: s.ly, spec: byId(s.rid).star.type, cat: T.sys.cats[s.cat], found: genPlanets(s).filter(p => discovered.has(p.id)).length, total: s.nPlanets })),
    visited: visited.size, systems: systems.length, beacons: beaconsGot.size, value: planets.reduce((a, p) => a + p.info.value, 0)
  });
}
function renderCargo() {
  // 货舱
  $('cargoCap').textContent = `${cargoUsed()}/${cargoMax()}`; $('cargoCr').textContent = credits;
  // 只显示数量大于 0 的物品
  const rows = Object.entries(cargo).filter(([, n]) => n > 0);
  // 物品列表：可使用或出售
  $('cbody').innerHTML = H.cargoHtml(rows.map(([k, n]) => {
    const u = USE[k], useless = !u || (u.fuel && fuel >= fuelMax()) || (u.hull && hull >= HULL_MAX);
    return { name: k, n, label: u ? u.label : null, disabled: !!useless, price: PRICE[k] ?? 10 };
  })) + (secret ? H.podHtml() : '');
  // 物品按钮事件
  $('cbody').querySelectorAll('button[data-u]').forEach(b => b.onclick = () => {
    const k = b.dataset.u, u = USE[k]; if (!cargo[k]) return;
    if (u.fuel) fuel = Math.min(fuelMax(), fuel + u.fuel); if (u.hull) hull = Math.min(HULL_MAX, hull + u.hull);
    if (--cargo[k] <= 0) delete cargo[k]; beep(660, .12, 'triangle'); toast(T.toast.useItem(k, u.label), 'good'); doSave(); renderCargo();
  });
  // 出售按钮事件
  const sell = (k, all) => {   // 出售一个，或这一格全部
    const n = all ? (cargo[k] || 0) : Math.min(1, cargo[k] || 0); if (!n) return;
    credits += n * (PRICE[k] ?? 10); cargo[k] -= n; if (cargo[k] <= 0) delete cargo[k];
    beep(740, .15, 'triangle'); doSave(); renderCargo();
  };
  $('cbody').querySelectorAll('button[data-r]').forEach(b => b.onclick = () => sell(b.dataset.r, false));
  $('cbody').querySelectorAll('button[data-ra]').forEach(b => b.onclick = () => sell(b.dataset.ra, true));
}
const UPG = ['engine', 'tank', 'scanner', 'cargo', 'boost'].map(k => ({ k, name: T.upg[k].name, desc: T.upg[k].desc }));
const upCost = k => Math.round(120 * Math.pow(up[k] + 1, 2));
function renderUpg() {
  // 升级面板
  $('upgCr').textContent = credits;
  // 物品列表：可升级或已满级
  $('ubody').innerHTML = H.upgHtml(UPG.map(u => {
    const l = up[u.k], mat = UPG_MAT[u.k], need = matNeed(u.k), have = cargo[mat] || 0;
    return {
      k: u.k, name: u.name, level: l, max: l >= 5, descNow: u.desc(l), descNext: u.desc(l + 1), mat, have, need,
      cargoFull: cargoUsed() >= cargoMax(), can: credits >= upCost(u.k) && have >= need, cost: upCost(u.k)
    };
  }));
  // 升级按钮事件
  $('ubody').querySelectorAll('button[data-k]').forEach(b => b.onclick = () => {
    const k = b.dataset.k, c = upCost(k), mat = UPG_MAT[k], need = matNeed(k);
    if (credits < c || up[k] >= 5 || (cargo[mat] || 0) < need) return;
    credits -= c; cargo[mat] -= need; if (cargo[mat] <= 0) delete cargo[mat];
    up[k]++; if (k === 'tank') fuel = Math.min(fuelMax(), fuel + 40); beep(740, .15, 'triangle'); doSave(); renderUpg();
  });
}

const mapc = $('mapc'), tip = $('maptip'); let mapS = 1, mapCX = 0, mapCY = 0, mapHover = null;
const mx = x => mapCX + x * mapS, my = z => mapCY + z * mapS;

function drawMap() {
  const W = mapc.width = innerWidth, H = mapc.height = innerHeight, g = mapc.getContext('2d');
  mapS = Math.min(W, H) * .44 / (GR * 1.05); mapCX = W / 2; mapCY = H / 2;
  g.fillStyle = 'rgba(140,170,255,.14)';
  for (let k = 0; k < GAL.pos.length / 3; k += 13) g.fillRect(mx(GAL.pos[k * 3]), my(GAL.pos[k * 3 + 2]), 1.3, 1.3);
  g.fillStyle = '#ffb060'; g.beginPath(); g.arc(mx(0), my(0), 5, 0, TAU); g.fill();
  if (target) {
    g.strokeStyle = 'rgba(255,210,122,.5)'; g.setLineDash([5, 5]); g.beginPath();
    g.moveTo(mx(ship.pos.x), my(ship.pos.z)); g.lineTo(mx(target.pos.x), my(target.pos.z)); g.stroke(); g.setLineDash([])
  }
  for (const s of systems) {
    const v = visited.has(s.i), pb = !v && probed.has(s.i), x = mx(s.pos.x), y = my(s.pos.z);
    const col = v ? '#5fe0ff' : pb ? '#c9a8ff' : '#8fa0c4';
    if (v || pb) { g.shadowColor = col; g.shadowBlur = 12; g.fillStyle = col; g.beginPath(); g.arc(x, y, v ? 5 : 4.2, 0, TAU); g.fill(); g.shadowBlur = 0 }
    else { g.strokeStyle = col; g.lineWidth = 1.4; g.beginPath(); g.arc(x, y, 3.4, 0, TAU); g.stroke() }
    if (v || pb) {
      const sm = sysSummary(s);
      if (sm.life) { g.fillStyle = '#9dff9d'; g.beginPath(); g.arc(x + 7, y - 4, 2.2, 0, TAU); g.fill() }
      if (sm.gas) { g.fillStyle = '#ff9d5c'; g.beginPath(); g.arc(x + 7, y + 3, 2.2, 0, TAU); g.fill() }
      if (sm.bc) { g.fillStyle = '#ffe27a'; g.beginPath(); g.arc(x - 7, y - 4, 2.2, 0, TAU); g.fill() }
    }
    if (s === target || s === mapHover) { g.strokeStyle = '#ffd27a'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 9, 0, TAU); g.stroke() }
    if (s.i === 0) { g.fillStyle = '#ffd27a'; g.font = '12px monospace'; g.fillText(T.map.home, x + 7, y - 6) }
    if (qOn() && s.i === fragSys[frags]) { g.fillStyle = '#ffd27a'; g.font = '16px monospace'; g.fillText(T.map.quest, x - 7, y - 9) }
  }
  if (bhOn() || (target && target.i === -1)) {
    g.strokeStyle = '#ffd27a'; g.lineWidth = 1.5; g.beginPath(); g.arc(mx(0), my(0), 11, 0, TAU); g.stroke();
    g.fillStyle = '#ffd27a'; g.font = '12px monospace'; g.fillText(T.map.bh, mx(0) + 14, my(0) + 4);
  }
  // 玩家
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quat), px = mx(ship.pos.x), py = my(ship.pos.z), a = Math.atan2(fwd.z, fwd.x);
  g.save(); g.translate(px, py); g.rotate(a); g.fillStyle = '#9dff9d'; g.beginPath(); g.moveTo(9, 0); g.lineTo(-6, 5); g.lineTo(-6, -5); g.closePath(); g.fill(); g.restore();
  renderMapBar();
}
function mapHit(e) {
  let best = null, bd = 14;
  for (const s of systems) { const d = Math.hypot(mx(s.pos.x) - e.clientX, my(s.pos.z) - e.clientY); if (d < bd) { bd = d; best = s } }
  return best;
}
mapc.addEventListener('mousemove', e => {
  mapHover = mapHit(e);
  if (mapHover) {
    const s = mapHover, d = s.pos.distanceTo(ship.pos), kn = knows(s);
    tip.style.display = 'block'; tip.style.left = e.clientX + 14 + 'px'; tip.style.top = e.clientY + 14 + 'px';
    let info = T.map.tipUnknown;
    if (kn) {
      const sm = sysSummary(s), n = genPlanets(s).filter(p => discovered.has(p.id)).length;
      info = T.map.tipInfo(sm.type, n, sm.n, sm.gas, sm.life, sm.best, sm.value, sm.bc, sm.quest)
    }
    tip.innerHTML = T.map.tipHead(s.name, visited.has(s.i) ? T.map.tipVisited : probed.has(s.i) ? T.map.tipProbed : '', Math.round(d), Math.max(2, (d - ARRIVE) * .12).toFixed(0)) + '<br>' + info
  }
  else tip.style.display = 'none';
});
mapc.addEventListener('click', e => { const s = mapHit(e); if (s) { target = s; toast(T.toast.targetSet(s.name)); beep(880, .06) } });

// =====================================================================
// 开始 / 循环
// =====================================================================
$('ver').textContent = 'v' + VERSION;
document.querySelectorAll('.tab').forEach(b => b.onclick = () => {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t === b));
  document.querySelectorAll('.pane').forEach(p => p.classList.toggle('hidden', p.id !== b.dataset.tab));
});
$('saveHint').textContent = save ? T.start.saveFound(discovered.size, credits, seed) : T.start.seedOnly(seed);
if (TEST_END) $('saveHint').textContent = `🧪 结局测试模式（end=${TEST_END}）：使用临时存档，不读写你的真实存档`;
$('btnStart').textContent = save ? T.start.btnContinue : T.start.btnNew;
$('btnStart').onclick = () => {
  running = true; $('start').classList.add('hidden'); $('hud').classList.remove('hidden');
  renderer.domElement.requestPointerLock?.(); beep(440, .1);
  if (TEST_END) ship.quat.setFromRotationMatrix(new THREE.Matrix4().lookAt(ship.pos, bh.position, UP));   // 测试结局：开局正对奇点
  setQuestTarget();
};
$('btnEndClose').onclick = () => closePanel();
$('btnEndQuit').onclick = () => { doSave(); location.reload() };   // 结束游戏：回到开始界面（继续探险 / 新的银河）
$('btnRestart').onclick = () => location.reload();                  // 失败后重新开始：同一个银河，从家园出发
$('btnProbe').onclick = probeTarget;
$('btnNew').onclick = () => { try { localStorage.removeItem(SAVE_KEY) } catch { }; location.search = '?seed=' + Math.floor(Math.random() * 1e6) };
addEventListener('beforeunload', doSave);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight)
});

camera.position.copy(ship.pos); camera.quaternion.copy(ship.quat);
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), .05);
  if (running) { promoTick(); quizTick(); welcomeTick() }  
  if (running && !paused()) { update(dt); txTick(dt); hazards(dt); redFx(); hullWarn(); tutTick(dt); updateHUD() }
  else if (running) { updateHUD(); tutTick(dt) }   // 面板打开时游戏暂停，但 HUD 和教学提示仍要同步
  else if (!running) { // 开始界面：缓慢环视
    tQ.setFromEuler(tE.set(0, dt * .04, 0)); ship.quat.multiply(tQ); camera.quaternion.copy(ship.quat); updateLOD();
  }
  if (openP === 'map') drawMap();
  if (bloomOn) composer.render(); else renderer.render(scene, camera);
}
updateLOD(); frame();