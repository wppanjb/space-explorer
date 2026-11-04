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
import { beep } from './audio.js';
import { soft, disc, planetTexture, pointCloud } from './graphics.js';
import { drawPlanetCard } from './cards.js';
import { T } from './text.js';
import * as H from './templates.js';


const $ = id => document.getElementById(id);

// =====================================================================
// 存档 & 状态
// =====================================================================
const params = new URLSearchParams(location.search);
function loadSave() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) } catch { return null } }
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
const probed = new Set(save?.probed || []);
let bhDone = !!save?.ended;
let frags = Math.min(FRAG_N, save?.frags ?? 0), playTime = save?.playTime ?? 0;
// ===== 军衔与经验 =====
const RANK_QUESTS = [0, 1, 2, 4, 7, 7];   // 各军衔已解锁的主线数量
const RANKS = T.rankNames.map((name, i) => ({ name, quests: RANK_QUESTS[i] }));
const RANK_NEED = [100, 300, 500, 1000, 2000];   // 升到下一级所需的【累计】经验
const SYS_XP = [30, 50, 100, 200, 300, 300];      // 各军衔「完成一个星系」得到的经验（实习生/初级/中级/高级/资深/特级）
const rankOf = x => RANK_NEED.filter(n => x >= n).length;
const doneSys = new Set(save?.done ?? (save ? systems.filter(s => genPlanets(s).every(p => discovered.has(p.id))).map(s => s.i) : []));
let xp = save?.xp ?? (save ? discovered.size * 10 + beaconsGot.size * 5 + frags * 50 + doneSys.size * 30 : 0);   // 旧存档按已有进度估算
const rankTarget = () => doneSys.has(0) ? rankOf(xp) : 0;     // 经验够了的军衔（家园星系没扫完前一直是实习生）
let rankSeen = save?.rankSeen ?? (save ? rankTarget() : 0);   // 玩家已被授予的军衔：晋升弹窗之后才会提高
let collectPending = false, welcomed = !!save;   // 新游戏：移动教学完成后再显示欢迎
const rank = () => rankSeen;
const qOn = () => frags < FRAG_N && frags < RANKS[rank()].quests;   // 下一块碎片是否已解锁
const bhOn = () => frags >= FRAG_N && !bhDone && rank() >= 5;        // 奇点任务是否已解锁
function addXp(n) { xp += n }
const maxSpeed = () => (30 + 10 * up.engine) * (hull < 25 ? .6 : 1), fuelMax = () => 100 + 40 * up.tank,
  scanRange = () => 90 + 30 * up.scanner, scanTime = () => Math.max(1, 3 - .4 * up.scanner), energyMax = () => 100 + 30 * up.boost;
let fuel = Math.min(save?.fuel ?? fuelMax(), fuelMax()), energy = energyMax();
const HULL_MAX = 100; let hull = Math.min(save?.hull ?? HULL_MAX, HULL_MAX);
const cargo = save?.cargo || {};                 // 货舱：{ 资源名: 数量 }
const sampled = new Set(save?.sampled || []);    // 已采样的行星 id（每颗只采一次）
const cargoMax = () => 20 + 10 * up.cargo, cargoUsed = () => Object.values(cargo).reduce((a, b) => a + b, 0);

function doSave() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      seed, credits, up, hull, cargo, sampled: [...sampled], discovered: [...discovered],
      beacons: [...beaconsGot], visited: [...visited], probed: [...probed], ended: bhDone, frags, playTime, xp, rankSeen, done: [...doneSys],fuel, pos: ship.pos.toArray(), quat: ship.quat.toArray()
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
      new THREE.MeshStandardMaterial({ map: planetTexture(p), roughness: .9, metalness: 0 }));
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
      const mp = new THREE.Group(); mesh.add(mp);
      const m = new THREE.Mesh(new THREE.SphereGeometry(p.radius * (.13 + .07 * i), 16, 16),
        new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 1 }));
      m.position.x = p.radius * (2.2 + i * .9); mp.add(m); moons.push({ pivot: mp, speed: 2.5 / (1 + i * .6) })
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
  if (planets.length >= 4) {
    // 小行星带：在第 3 颗行星轨道外，随机分布在两条半径之间
    // a = 内半径，b = 外半径，随机分布在 a~b 之间
    const a = planets[2].p.dist + 6, b = planets[2].p.dist + 12;
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
  if (!inside) lastEntered = -1;
  else if (lastEntered !== inside.i) {
    lastEntered = inside.i;
    const first = !visited.has(inside.i); visited.add(inside.i);
    const n = genPlanets(inside).filter(p => discovered.has(p.id)).length;
    toast(T.toast.enterSystem(inside.name, first, n, inside.nPlanets), first ? 'good' : '');
    const ns = genStars(inside).length; if (ns === 2) know('star2', 1500); else if (ns >= 3) know('star3', 1500);
  }
  markers.forEach((m, i) => m.visible = !loaded.some(L => L.sys.i === i));
}

// =====================================================================
// 输入
// =====================================================================
const keys = {}; let mouseDX = 0, mouseDY = 0, mouseHeld = false, running = false, openP = null;
const panels = { journal: $('journal'), upg: $('upg'), map: $('mapw'), ending: $('ending'), cards: $('cards'), cargo: $('cargo'), help: $('help'), know: $('know') };
const paused = () => !running || openP === 'journal' || openP === 'upg' || openP === 'ending' || openP === 'cards' || openP === 'cargo' || openP === 'help' || openP === 'know' || cardHold;
addEventListener('keydown', e => {
  if (!running) return;
  if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (!$('cardbig').classList.contains('hidden') && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) { showBig(bigI + (e.code === 'ArrowLeft' ? -1 : 1)); return }
  if (e.repeat) return;
  if (cardHold && (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space' || e.code === 'Escape')) { dismissCard(); return }
  if (openP === 'know' && (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space')) { closePanel(); return }
  keys[e.code] = true; did[e.code] = true; if (e.code === 'NumpadEnter') did.Enter = true;
  if (e.code === 'Escape') { if (!$('cardbig').classList.contains('hidden')) { $('cardbig').classList.add('hidden'); return } if (openP) closePanel(); return };
  if (e.code === 'KeyB') toggleBloom();
  if (e.code === 'KeyM') openPanel('map');
  if (e.code === 'KeyJ') openPanel('journal');
  if (e.code === 'KeyU') openPanel('upg');
  if (e.code === 'KeyH') openPanel('help');
  if (e.code === 'KeyK') openPanel('cards');
  if (e.code === 'KeyI') openPanel('cargo');
  if (paused()) return;
  if (e.code === 'Tab') cycleTarget();
  if (e.code === 'KeyR') probeTarget();
  if (e.code === 'KeyG') toggleWarp();
});
addEventListener('keyup', e => { keys[e.code] = false });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseHeld = false });
document.addEventListener('mousemove', e => {
  if (document.pointerLockElement === renderer.domElement) { mouseDX += e.movementX; mouseDY += e.movementY }
});
addEventListener('mousedown', e => { if (e.button === 0 && document.pointerLockElement === renderer.domElement) mouseHeld = true });
addEventListener('mouseup', e => { if (e.button === 0) mouseHeld = false });
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
let knowSeen = new Set(), knowQ = [];
try { knowSeen = new Set(JSON.parse(localStorage.getItem('deepspace-know') || '[]')) } catch { }
function know(key, delay = 0) {
  if (!KNOW[key] || knowSeen.has(key) || knowQ.includes(key)) return;
  knowQ.push(key); setTimeout(knowTry, delay);
}
function knowTry() {
  if (!knowQ.length) return;
  if (openP || !running) { setTimeout(knowTry, 1000); return }   // 有别的面板开着就稍后再弹
  const key = knowQ.shift(); knowSeen.add(key);
  try { localStorage.setItem('deepspace-know', JSON.stringify([...knowSeen])) } catch { }
  const K = KNOW[key], box = $('know').firstElementChild;
  box.classList.toggle('rich', !!K.fig);   // 双星/三星用新版排版
  box.innerHTML = K.fig ? H.knowRich(K) : H.knowPlain(K);
  box.querySelectorAll('button').forEach(b => b.onclick = () => closePanel());
  openPanel('know'); beep(520, .12, 'triangle', .04);
  if (knowQ.length) setTimeout(knowTry, 1000);
}
function openPanel(n) {
  if (openP === n) { closePanel(); return }
  closePanel(); openP = n; panels[n].classList.remove('hidden');
  document.exitPointerLock?.(); mouseHeld = false;
  if (n === 'journal') renderJournal();
  if (n === 'cards') { cardFilter = pendingFilter; pendingFilter = 'all'; renderCards() }
  if (n === 'upg') renderUpg(); if (n === 'cargo') renderCargo();
}
function closePanel() { if (openP) { panels[openP].classList.add('hidden'); openP = null } }

// Toast & 卡片
function toast(msg, cls = '') {
  const d = document.createElement('div'); d.className = 'toast ' + cls; d.textContent = msg; $('toasts').appendChild(d);
  setTimeout(() => d.remove(), 4300);
  while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
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
  $('cardIdx').textContent = T.cards.index(bigI + 1, bigList.length);
  $('cardbig').classList.remove('hidden');
}
$('cardPrev').onclick = () => showBig(bigI - 1);
$('cardNext').onclick = () => showBig(bigI + 1);
function renderCards() {
  const ids = [...discovered].sort((a, b) => { const [s1, p1] = a.split(':').map(Number), [s2, p2] = b.split(':').map(Number); return s1 - s2 || p1 - p2 });
  const bySys = new Map(); ids.forEach(id => { const s = +id.split(':')[0]; bySys.set(s, (bySys.get(s) || 0) + 1) });
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
    return H.cardImgHtml(cardURL(p), p.name)
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
  const key = 'kind_' + p.kind;
  if (!KNOW[key] || knowSeen.has(key)) return '';
  knowSeen.add(key);
  try { localStorage.setItem('deepspace-know', JSON.stringify([...knowSeen])) } catch { }
  return H.kindNoteHtml(KNOW[key]);
}
let cardAnim;
let cardHold = false, cardHoldMs = 0;
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
  if (warp) { endWarp(false); return }
  if (!target) { toast(T.toast.warpNoTarget, 'warn'); return }
  const d = target.pos.distanceTo(ship.pos);
  if (d < ARRIVE + 30) { toast(T.toast.warpNear); return }
  const cost = warpCost(target);
  if (fuel < cost) { toast(T.toast.warpNoFuel(cost.toFixed(0), fuel.toFixed(0)), 'warn'); return }
  fuel -= cost; warp = { target, arrive: ARRIVE }; beep(220, .5, 'sawtooth', .04); toast(T.toast.warpStart(target.name, cost.toFixed(0)));
}
function endWarp(arrived) {
  if (!warp) return;
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quat);
  ship.vel.copy(fwd).multiplyScalar(arrived ? 20 : Math.min(ship.vel.length(), maxSpeed()));
  if (arrived) { toast(T.toast.warpArrive(warp.target.name), 'good'); beep(520, .2); if (target === warp.target) target = null }
  warp = null;
}

// =====================================================================
// 扫描
// =====================================================================
// ---------- 远程探测 ----------
const knows = s => visited.has(s.i) || probed.has(s.i);
const probeCost = s => Math.round(3 + s.pos.distanceTo(ship.pos) / 100);
function sysSummary(s) {
  const ps = genPlanets(s), gas = ps.filter(p => p.kind === 'gas').length, lifeList = ps.filter(p => p.info.life !== '无');
  let best = '', bv = -1; for (const p of lifeList) { const v = LIFE_BONUS[p.info.life] || 0; if (v > bv) { bv = v; best = p.info.life } }
  const unseen = ps.filter(p => !discovered.has(p.id)), value = unseen.reduce((a, p) => a + p.info.value, 0);
  const R2 = makeRng(s.seed + 777), nb = s.i === 0 ? 1 : R2.int(1, 2); let bc = 0;
  for (let k = 0; k < nb; k++)if (!beaconsGot.has(s.i + ':b' + k)) bc++;
  const type = T.sys.starTypes[Math.max(0, STAR_COLS.indexOf(s.color))] + T.sys.multi[genStars(s).length - 1],
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
  const n = qOn() ? systems[fragSys[frags]] : (bhOn() ? BH_SYS : null);
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
  const k = frags; frags++; credits += 200; addXp(50); hull = HULL_MAX; fuel = fuelMax();
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
  bhDone = true; credits += 5000;
  const m = Math.floor(playTime / 60), s = Math.floor(playTime % 60);
  $('endStats').innerHTML = T.ending.stats(m, s, visited.size, systems.length, discovered.size, beaconsGot.size);
  [392, 523, 659, 784, 1047].forEach((f, i) => beep(f, .5, 'triangle', .06, i * .18));
  target = null; doSave(); openPanel('ending');
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
const matNeed = k => Math.ceil((up[k] + 1) / 2);
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
  cr = Math.round(cr); credits += cr; beaconsGot.add(b.id); addXp(5);
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
  {   // 1 完成第一次扫描：收藏与货舱
    name: T.tut.stageNames[1], trigger: () => discovered.size >= 1, steps: [{
      reset: ['KeyK', 'KeyI', 'KeyJ'],
      t: () => H.tutScan(T.tut.scanChips.map(([code]) => !!did[code])),
      ok: () => did.KeyK && did.KeyI && did.KeyJ
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
let flare = null, flareCd = 20, beltAcc = 0, inBelt = false;
const danger = () => 1 + .12 * frags;
function hurt(d, why) {
  if (d < 1) return;
  hull = Math.max(0, hull - d); toast(T.toast.hurt(why, d.toFixed(0), hull.toFixed(0), HULL_MAX), 'warn'); beep(90, .25, 'sawtooth', .08);
}
function wreck() {
  const h = systems[0]; let best = null, bm = -1e9;
  for (let a = 0; a < 360; a += 30) {
    const r = a * Math.PI / 180, p = new THREE.Vector3(Math.sin(r) * 100, 20, Math.cos(r) * 100).add(h.pos); let o = 1e9;
    for (const s of systems) if (s !== h) o = Math.min(o, s.pos.distanceTo(p));
    if (o > bm) { bm = o; best = p }
  }
  ship.pos.copy(best); ship.vel.set(0, 0, 0); ship.quat.setFromRotationMatrix(new THREE.Matrix4().lookAt(best, h.pos, UP)); warp = null;
  for (const k of Object.keys(cargo)) { cargo[k] = Math.floor(cargo[k] / 2); if (cargo[k] <= 0) delete cargo[k] }
  credits = Math.round(credits * .9); hull = HULL_MAX * .5; fuel = Math.max(fuel, 30); flare = null; inBelt = false;
  demote();  
  toast(T.toast.wreck, 'warn'); beep(110, .6, 'sawtooth', .07); doSave();
}
// ---- 奇点潮汐 + 红屏 ----
const TIDE_R = 160;                      // 潮汐区半径：进入后被拉向奇点、船体持续受损
let tideDepth = 0, inTide = false;       // 0（区外）~ 1（奇点中心）
function tide(dt) {
  const d = ship.pos.distanceTo(bh.position);
  tideDepth = d < TIDE_R ? 1 - d / TIDE_R : 0;
  if (tideDepth > 0) {
    tV.copy(bh.position).sub(ship.pos).normalize();
    ship.pos.addScaledVector(tV, 20 * tideDepth * tideDepth * dt);        // 拉力：越近越强
    hull = Math.max(0, hull - (1.5 + 5 * tideDepth * tideDepth) * dt);    // 船体持续受损
    if (!inTide) { inTide = true; toast(T.toast.tideEnter(BH_T.range), 'warn'); beep(100, .4, 'sawtooth', .06) }
  } else if (inTide && d > TIDE_R * 1.05) inTide = false;
}
let hullWarned = false;
function hullWarn() {
  if (hull < HULL_MAX * .3) { if (!hullWarned) { hullWarned = true; toast(T.toast.hullCritical(hull.toFixed(0), HULL_MAX), 'warn'); beep(180, .3, 'square', .05) } }
  else if (hull > HULL_MAX * .4) hullWarned = false;   // 修好之后才会再次提示，避免在边界反复弹
}
function redFx() {
  const t = performance.now() / 1000; let a = 0;
  if (flare) a = Math.max(a, .35 + .35 * Math.sin(t * 9));                         // 耀斑预警：快速脉冲
  if (hull < HULL_MAX * .3) a = Math.max(a, .25 + .15 * Math.sin(t * 5));          // 船体危急：常亮 + 心跳
  if (tideDepth > 0) a = Math.max(a, tideDepth * (.5 + .4 * Math.sin(t * (4 + 6 * tideDepth))));   // 潮汐：越近越亮越快
  $('redfx').style.opacity = Math.max(0, a).toFixed(2);
}
function welcomeTick() {   // 第一个移动教学完成（或教学已关闭）后，显示欢迎和训练目标
  if (welcomed || !running || openP || cardHold) return;
  if (!(tutOff || tutDone.includes(0))) return;
  welcomed = true;
  toast(T.rank.welcome(systems[0].name), 'good');
}
function promoTick() {   // 每帧检查：经验够了就弹出晋升（等收藏、卡片、其他面板都关了之后）
  if (!running || rankTarget() <= rankSeen || openP || cardHold || collectPending || !$('card').classList.contains('hidden')) return;
  rankSeen++;
  const r = rankSeen, box = $('know').firstElementChild; box.classList.add('rich');
  box.innerHTML = H.promoHtml({ rank: r, rankName: RANKS[r].name, nextName: RANKS[r + 1]?.name, xp, need: RANK_NEED[r] || 0, lo: RANK_NEED[r - 1], sysXp: SYS_XP[r] });
  box.querySelectorAll('button').forEach(b => b.onclick = () => closePanel());
  openPanel('know'); [660, 880, 1100, 1320].forEach((f, i) => beep(f, .2, 'triangle', .06, i * .08));
  setQuestTarget(); loaded.forEach(addStoryBeacon); doSave();
}
const DROP_XP = [0, 200, 400, 750, 1500];   // 降到某军衔后的经验（下标 = 降级后的军衔：初/中/高/资深）
function demote() {   // 被强制送回家园：降一级（最低初级），经验降到新军衔区间的中间值
  const r = rank(), nr = Math.max(1, r - 1);
  xp = Math.min(xp, DROP_XP[nr]); rankSeen = nr;
  toast(r === nr ? T.rank.xpDropped(xp) : T.rank.demoted(RANKS[r].name, RANKS[nr].name, xp), 'warn');
  setQuestTarget();
}
function hazards(dt) {
  if (rank() < 1) { tideDepth = 0; flare = null; inBelt = false; return }   // 实习生：没有危险
  if (warp) { tideDepth = 0; return }
  if (hull <= 0) { wreck(); return }
  tide(dt);
  let near = null;
  for (const L of loaded) for (const s of L.stars) { tV.copy(s.mesh.position).add(L.sys.pos); if (ship.pos.distanceTo(tV) < s.st.radius * 5) near = { pos: tV.clone(), r: s.st.radius * 5 } }
  if (flare) {
    flare.t -= dt;
    if (flare.t <= 0) { if (ship.pos.distanceTo(flare.pos) < flare.r) { hurt(12 * danger(), T.toast.hurtFlare); energy = 0; fuel = Math.max(0, fuel - 5) } else toast(T.toast.flareAvoided, 'good'); flare = null; flareCd = 25 }
  } else {
    flareCd -= dt;
    if (near && flareCd <= 0 && Math.random() < .08 * danger() * dt) { flare = { t: 4, pos: near.pos, r: near.r }; toast(T.toast.flareWarn, 'warn'); beep(220, .3, 'square', .05) }
  }
  let now = false;
  for (const L of loaded) {
    if (!L.belt || !L.belt.visible) continue;
    const { a, b } = L.belt.userData, rx = ship.pos.x - L.sys.pos.x, rz = ship.pos.z - L.sys.pos.z, ry = ship.pos.y - L.sys.pos.y, r = Math.hypot(rx, rz), v = ship.vel.length();
    if (r > a - 1 && r < b + 1 && Math.abs(ry) < 4) { now = true; if (v > 12) { beltAcc += (v - 12) * .05 * danger() * dt; if (beltAcc >= 3) { hurt(beltAcc, T.toast.hurtBelt); beltAcc = 0 } } }
  }
  if (now && !inBelt) toast(T.toast.beltEnter, 'warn');
  inBelt = now;
}
function completeScan(c) {
  if (c.id === 'bh') {
    if (bhDone) { toast(T.toast.bhRecorded); return }
    if (frags < FRAG_N) { toast(T.toast.bhEcho(frags, FRAG_N), 'warn'); beep(120, .5, 'sine', .06); return }
    if (!bhOn()) { toast(T.toast.bhRank(RANKS[5].name), 'warn'); return }    
    showEnding(); return;
  }
  did.scan = true;
  const p = c.p, isNew = !discovered.has(p.id);
  if (isNew) {
    addXp(10);
    discovered.add(p.id); credits += p.info.value; fuel = Math.min(fuelMax(), fuel + p.info.fuelGain);
        toast(T.toast.discovered(p.name, p.info.value), 'good');
    [660, 880, 1100].forEach((f, i) => beep(f, .18, 'triangle', .06, i * .09)); doSave();
    const sys = systems[+p.id.split(':')[0]];
    if (genPlanets(sys).every(q => discovered.has(q.id))) {
      const gain = SYS_XP[rank()];
      if (!doneSys.has(sys.i)) { doneSys.add(sys.i); addXp(gain) }
      toast(T.toast.sysComplete(sys.name, gain), 'good');
      collectPending = true;   // 晋升弹窗要等收藏关闭之后
      setTimeout(() => { collectPending = false; if (openP !== 'cards') { pendingFilter = String(sys.i); openPanel('cards') } }, 3500);
    }
  } else beep(500, .1);
  takeSample(p);
  showCard(p, isNew);
  // 主线：当前碎片对应的异常行星（即使之前已扫描过，再扫一次也能取得碎片）
  if (qOn() && fragKind(frags) === 'planet' && p.id === fragSys[frags] + ':' + fragPlanetIdx(frags)) collectFragment(true);
}

// =====================================================================
// 主更新
// =====================================================================
const tV = new THREE.Vector3(), tV2 = new THREE.Vector3(), tV3 = new THREE.Vector3(), tQ = new THREE.Quaternion(),
  tE = new THREE.Euler(), tM = new THREE.Matrix4(), inp = new THREE.Vector3();
let boostLock = false, saveTimer = 0, wr = 0, scooping = false;

function update(dt) {
  // ---- 转向 ----
  const k = keys, rollIn = (k.KeyE ? 1 : 0) - (k.KeyQ ? 1 : 0), yawIn = (k.ArrowLeft ? 1 : 0) - (k.ArrowRight ? 1 : 0), pitchIn = (k.ArrowUp ? 1 : 0) - (k.ArrowDown ? 1 : 0);
  if (!warp) {
    if (rollIn || yawIn || pitchIn) { tE.set(pitchIn * 1.2 * dt, yawIn * 1.4 * dt, -rollIn * 1.4 * dt); tQ.setFromEuler(tE); ship.quat.multiply(tQ) }
    if (mouseDX || mouseDY) { tE.set(-mouseDY * .0022, -mouseDX * .0022, 0); tQ.setFromEuler(tE); ship.quat.multiply(tQ) }
  }
  // ---- 计算转向消耗 ----
  lookAcc += Math.abs(mouseDX) + Math.abs(mouseDY) + (rollIn || yawIn || pitchIn ? 300 * dt : 0);
  mouseDX = mouseDY = 0; ship.quat.normalize();

  // ---- 移动 ----
  if (warp) {
    const t = warp.target; tV.copy(t.pos).sub(ship.pos); const dist = tV.length(); tV.normalize();
    tM.lookAt(ship.pos, t.pos, UP); tQ.setFromRotationMatrix(tM); ship.quat.slerp(tQ, 1 - Math.exp(-dt * 2.5));
    tV2.set(0, 0, -1).applyQuaternion(ship.quat);
    const align = Math.max(0, tV2.dot(tV)), remaining = dist - warp.arrive;
    const tgt = Math.max(25, Math.min(900, remaining * 1.1)) * align * align, sp = ship.vel.length();
    const ns = lerp(sp, tgt, 1 - Math.exp(-dt * (tgt > sp ? 1.2 : 4)));
    ship.vel.copy(tV2).multiplyScalar(ns);
    if (remaining < 4) endWarp(true);
    else if (k.KeyS) endWarp(false);
    energy = Math.min(energyMax(), energy + 10 * dt);
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
      if (!warp && pl.show) {
        pl.mesh.getWorldPosition(tV); tV2.copy(ship.pos).sub(tV); const rr = pl.p.radius + 2.5, d = tV2.length();
        if (d < rr && d > 0) {
          // 计算碰撞法线，推开飞船
          tV2.divideScalar(d); ship.pos.copy(tV).addScaledVector(tV2, rr);
          const vn = ship.vel.dot(tV2); if (vn < 0) ship.vel.addScaledVector(tV2, -vn * 1.2); hit(-vn)
        }
      }
    }
    if (L.belt) L.belt.rotation.y += dt * .03;
    const sp = L.sys.pos;
    for (const s of L.stars) {
      s.mesh.rotation.y += dt * .1;
      tV.copy(s.mesh.position).add(sp);                 // 这颗恒星的世界坐标
      const sd = ship.pos.distanceTo(tV), sr = s.st.radius;
      if (!warp && sd < sr * 1.5 + 2) {
        // 计算碰撞法线，推开飞船
        tV2.copy(ship.pos).sub(tV).normalize(); ship.pos.copy(tV).addScaledVector(tV2, sr * 1.5 + 2);
        const vn = ship.vel.dot(tV2); if (vn < 0) ship.vel.addScaledVector(tV2, -vn * 1.2); hit(-vn)
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
  const test = (id, pos, effR, range, obj) => {
    tV.copy(pos).sub(ship.pos); const d = tV.length(); if (d > range || d < .1) return;
    const ang = Math.acos(Math.min(1, tV.dot(tV3) / d)), angR = Math.asin(Math.min(1, effR / d));
    if (ang < Math.max(angR, .035) && d < cd) { cd = d; cand = { id, d, ...obj } }
  };
  if (!warp) {
    for (const L of loaded) for (const pl of L.planets) { if (!pl.show) continue; pl.mesh.getWorldPosition(tV2); test(pl.p.id, tV2, pl.p.radius * 1.2 + .5, scanRange(), { p: pl.p, name: pl.p.name }) }
    test('bh', bh.position, BH_T.effR, BH_T.range, { name: BH_T.name });
  }
  scanCand = cand;
  const holding = (mouseHeld || k.KeyF) && cand && !paused();
  if (holding) {
    if (scanId !== cand.id) { scanId = cand.id; scanT = 0 }
    scanT += dt / scanTime();
    if (scanT >= 1) { completeScan(cand); scanT = 0; mouseHeld = false; keys.KeyF = false }
  } else { scanT = Math.max(0, scanT - dt * 2); if (!cand) scanId = null }

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
function toScreen(pos) {
  fwdV.set(0, 0, -1).applyQuaternion(camera.quaternion);
  const behind = projV.copy(pos).sub(camera.position).dot(fwdV) < 0;
  projV.copy(pos).project(camera);
  return { x: (projV.x * .5 + .5) * innerWidth, y: (-projV.y * .5 + .5) * innerHeight, behind };
}

function updateHUD() {
  $('credits').textContent = credits;
  { const r = rank(), el = $('rankTxt'); if (el) el.innerHTML = H.rankStars(r) + T.rank.hud(RANKS[r].name, xp, RANK_NEED[r]) }
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
  $('ring').style.strokeDashoffset = 163.4 * (1 - Math.min(1, scanT));

  // 提示
  let pr = '';
  if (warp) pr = T.hud.promptWarp(warp.target.name);
  else if (scanCand) {
    const known = scanCand.p ? discovered.has(scanCand.p.id) : bhDone;
    pr = T.hud.promptScan(scanCand.name, Math.round(scanCand.d), known);
  } else if (scooping) pr = T.ui.scooping;
  else if (document.pointerLockElement !== renderer.domElement && !openP) pr = T.ui.pointerLock;
  $('prompt').innerHTML = H.kbd(pr);

  // 行星标签
  for (const L of loaded) {
    for (const pl of L.planets) {
      pl.mesh.getWorldPosition(tV); const d = tV.distanceTo(ship.pos), s = toScreen(tV), known = discovered.has(pl.p.id);
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
  // 目标标记
  const tm = $('tmark');
  if (target) {
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
    planets, visited: visited.size, systems: systems.length, beacons: beaconsGot.size, value: planets.reduce((a, p) => a + p.info.value, 0)
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
  }));
  // 物品按钮事件
  $('cbody').querySelectorAll('button[data-u]').forEach(b => b.onclick = () => {
    const k = b.dataset.u, u = USE[k]; if (!cargo[k]) return;
    if (u.fuel) fuel = Math.min(fuelMax(), fuel + u.fuel); if (u.hull) hull = Math.min(HULL_MAX, hull + u.hull);
    if (--cargo[k] <= 0) delete cargo[k]; beep(660, .12, 'triangle'); toast(T.toast.useItem(k, u.label), 'good'); doSave(); renderCargo();
  });
  // 出售按钮事件
  $('cbody').querySelectorAll('button[data-r]').forEach(b => b.onclick = () => {
    const k = b.dataset.r; credits += (cargo[k] || 0) * (PRICE[k] ?? 10); delete cargo[k]; beep(740, .15, 'triangle'); doSave(); renderCargo();
  });
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
$('btnStart').textContent = save ? T.start.btnContinue : T.start.btnNew;
$('btnStart').onclick = () => {
  running = true; $('start').classList.add('hidden'); $('hud').classList.remove('hidden');
  renderer.domElement.requestPointerLock?.(); beep(440, .1);
  setQuestTarget();
};
$('btnEndClose').onclick = () => closePanel();
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
  if (running) { promoTick(); welcomeTick() }  
  if (running && !paused()) { update(dt); hazards(dt); redFx(); hullWarn(); tutTick(dt); updateHUD() }
  else if (running) { updateHUD(); tutTick(dt) }   // 面板打开时游戏暂停，但 HUD 和教学提示仍要同步
  else if (!running) { // 开始界面：缓慢环视
    tQ.setFromEuler(tE.set(0, dt * .04, 0)); ship.quat.multiply(tQ); camera.quaternion.copy(ship.quat); updateLOD();
  }
  if (openP === 'map') drawMap();
  if (bloomOn) composer.render(); else renderer.render(scene, camera);
}
updateLOD(); frame();