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
const isQuestPlanet = p => frags < FRAG_N && fragKind(frags) === 'planet' && p.id === fragSys[frags] + ':' + fragPlanetIdx(frags);

let credits = save?.credits ?? 0;
const up = Object.assign({ engine: 0, tank: 0, scanner: 0, boost: 0, cargo: 0 }, save?.up || {});
const discovered = new Set(save?.discovered || []);
const beaconsGot = new Set(save?.beacons || []);
const visited = new Set(save?.visited || []);
const probed = new Set(save?.probed || []);
let bhDone = !!save?.ended;
let frags = Math.min(FRAG_N, save?.frags ?? 0), playTime = save?.playTime ?? 0;
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
      beacons: [...beaconsGot], visited: [...visited], probed: [...probed], ended: bhDone, frags, playTime, fuel, pos: ship.pos.toArray(), quat: ship.quat.toArray()
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
  if (frags >= FRAG_N || fragKind(frags) !== 'beacon' || fragSys[frags] !== sys.i || S.beacons.some(b => b.story)) return;
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
const questSysIdx = () => frags < FRAG_N ? fragSys[frags] : -2;
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
    toast(`进入 ${inside.name} 星系 · ${first ? '首次到访 · ' : ''}已发现 ${n}/${inside.nPlanets}`, first ? 'good' : '');
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
  if (notify) toast('辉光：' + (v ? '开' : '关'));
}
function toggleBloom() { setBloom(!bloomOn, true) }
$('bloomChk').onchange = e => setBloom(e.target.checked, false);

// ===== 游戏知识：第一次遇到时弹出 =====
const FIG_STAR2 = `<svg class="kfig" viewBox="0 0 360 150" preserveAspectRatio="xMidYMid slice">
  <defs>
    <radialGradient id="gA"><stop offset="0" stop-color="#fffbe8"/><stop offset=".35" stop-color="#ffd27a"/><stop offset="1" stop-color="#ffb04a" stop-opacity="0"/></radialGradient>
    <radialGradient id="gB"><stop offset="0" stop-color="#f2faff"/><stop offset=".35" stop-color="#8fd0ff"/><stop offset="1" stop-color="#5fa8ff" stop-opacity="0"/></radialGradient>
  </defs>
  <circle cx="180" cy="75" r="62" fill="none" stroke="#7fd4ff" stroke-opacity=".35" stroke-dasharray="3 5"/>
  <circle cx="180" cy="75" r="12" fill="none" stroke="#ffffff" stroke-opacity=".18"/>
  <g><animateTransform attributeName="transform" type="rotate" from="0 180 75" to="360 180 75" dur="5s" repeatCount="indefinite"/>
    <circle cx="171" cy="75" r="17" fill="url(#gA)"/><circle cx="195" cy="75" r="11" fill="url(#gB)"/></g>
  <g><animateTransform attributeName="transform" type="rotate" from="0 180 75" to="360 180 75" dur="22s" repeatCount="indefinite"/>
    <circle cx="242" cy="75" r="5" fill="#6fa8ff"/><circle cx="240.5" cy="73.5" r="1.8" fill="#cfe6ff"/></g>
  <circle cx="180" cy="75" r="1.6" fill="#fff"/>
  <text x="180" y="108" fill="#9fb4d6" font-size="9" text-anchor="middle">质心</text>
  <text x="350" y="138" fill="#7fd4ff" font-size="10" text-anchor="end">行星轨道 ≥ 2.5 × 两星间距</text>
</svg>`;
const FIG_STAR3 = `<svg class="kfig" viewBox="0 0 360 150" preserveAspectRatio="xMidYMid slice">
  <defs>
    <radialGradient id="gA3"><stop offset="0" stop-color="#fffbe8"/><stop offset=".35" stop-color="#ffd27a"/><stop offset="1" stop-color="#ffb04a" stop-opacity="0"/></radialGradient>
    <radialGradient id="gB3"><stop offset="0" stop-color="#f2faff"/><stop offset=".35" stop-color="#8fd0ff"/><stop offset="1" stop-color="#5fa8ff" stop-opacity="0"/></radialGradient>
    <radialGradient id="gC3"><stop offset="0" stop-color="#fff0e8"/><stop offset=".35" stop-color="#ff9a6a"/><stop offset="1" stop-color="#ff7a4a" stop-opacity="0"/></radialGradient>
  </defs>
  <circle cx="110" cy="75" r="200" fill="none" stroke="#ff9a6a" stroke-opacity=".25" stroke-dasharray="2 6"/>
  <circle cx="110" cy="75" r="52" fill="none" stroke="#7fd4ff" stroke-opacity=".35" stroke-dasharray="3 5"/>
  <circle cx="110" cy="75" r="30" fill="none" stroke="#ff7a7a" stroke-opacity=".28" stroke-dasharray="1 4"/>
  <g><animateTransform attributeName="transform" type="rotate" from="0 110 75" to="360 110 75" dur="5s" repeatCount="indefinite"/>
    <circle cx="101" cy="75" r="14" fill="url(#gA3)"/><circle cx="125" cy="75" r="9" fill="url(#gB3)"/></g>
  <g><animateTransform attributeName="transform" type="rotate" from="0 110 75" to="360 110 75" dur="20s" repeatCount="indefinite"/>
    <circle cx="162" cy="75" r="4.5" fill="#6fa8ff"/></g>
  <circle cx="310" cy="75" r="16" fill="url(#gC3)"><animate attributeName="r" values="15;17;15" dur="4s" repeatCount="indefinite"/></circle>
  <text x="310" y="108" fill="#ffb59a" font-size="9" text-anchor="middle">远处的第三颗</text>
  <text x="110" y="140" fill="#9fb4d6" font-size="9" text-anchor="middle">内侧双星</text>
  <text x="168" y="22" fill="#7fd4ff" font-size="10">稳定区（窄带）</text>
</svg>`;

function knowRich(K) {
  return K.svg + `<div class="kbody"><h2>📖 ${K.t}</h2><div class="ktag">${K.tag}</div>
    <div class="kchips">${K.chips.map(c => `<span class="kchip">${c}</span>`).join('')}</div>` +
    K.sec.map(([ico, h, p, cls]) => `<div class="ksec ${cls || ''}"><div class="kico">${ico}</div><div><h4>${h}</h4><p>${p}</p></div></div>`).join('') +
    `<div class="kfoot"><span class="hint">Enter / Space / Esc 关闭</span><button id="knowOk2">知道了</button></div></div>`;
}
const KNOW = {
  star2: {
    t: '双星系统', svg: FIG_STAR2, tag: '两颗恒星，一个共同的质心',
    chips: ['恒星 ×2', '行星轨道 ≥ 2.5× 两星间距'],
    sec: [
      ['🌌', '这是什么', '两颗恒星并不是一颗绕着另一颗转，而是<b>一起围绕共同的质心</b>公转。质量越接近，就越像互相追逐。银河里大约有<b>一半</b>的类太阳恒星都有伴星，单星反而没那么"普通"。'],
      ['🪐', '行星在哪里', '太近的轨道会被两颗恒星轮流拉扯而失稳，所以行星只能待在<b>离它们足够远</b>的地方，整体绕着质心转，游戏里是两星间距约 2.5 倍以外。现实中这类"环双星行星"已被发现，天空中会同时挂着<b>两个太阳</b>。'],
      ['✨', '特别之处', '两颗恒星的类型可能不同，一颗橙黄、一颗蓝白，行星表面会有<b>两种颜色的光和影</b>。两颗星的相对位置不断变化，白天和黑夜也比单星复杂。'],
      ['🚀', '游戏提示', '每颗恒星都可以靠近补充燃料，也都可能爆发<b>耀斑</b>。飞近任何一颗之前，先留意耀斑预警。', 'tip'],
    ]
  },
  star3: {
    t: '三星系统', svg: FIG_STAR3, tag: '一对紧密的恒星，和一颗遥远的伴星',
    chips: ['恒星 ×3', '行星只能待在两条界线之间'],
    sec: [
      ['🌌', '这是什么', '稳定的三星系统几乎都是<b>层级式</b>的：两颗恒星紧紧相伴，第三颗在远处绕着这一对公转。三颗星地位平等地互相绕转极不稳定，往往很快就有一颗被抛出系统。半人马座 α 就是一个例子。'],
      ['🪐', '一条窄带', '行星被夹在两条界线之间：<b>内侧</b>是紧密双星的搅动（太近会失稳），<b>外侧</b>是第三颗恒星的引力（太远会被扯走）。所以这里的行星往往挤在一条<b>较窄的轨道带</b>里。'],
      ['✨', '特别之处', '天空中最多可以同时有三个"太阳"，亮度和颜色各不相同。远处那颗伴星看起来更像一颗特别亮的星，而不是太阳。'],
      ['🚀', '游戏提示', '每颗恒星都可以靠近采集燃料，但也都可能爆发<b>耀斑</b>。这里有三颗恒星，可以挑离耀斑最远、最安全的那一颗靠近。行星彼此靠得近，常常可以一口气扫描完。', 'tip'],
    ]
  },
  kind_rock: {
    t: '岩石行星', h: `<p>有固体表面的类地行星，离恒星较近的行星大多是这一类。</p>
    <p>主要由金属和硅酸盐构成，采样可得到<b>固体材料</b>（具体看卡片上的"资源"一栏）。有些还有大气，甚至生命，<b>样本价值越高</b>，奖励越多。</p>
    <p>扫描岩石行星可补充 <b>10</b> 点燃料。</p>` },
  kind_gas: {
    t: '气态巨行星', h: `<p>主要由氢和氦组成，<b>没有固体表面</b>，体积大、质量大，常带有行星环和较多卫星。</p>
    <p>它们是良好的燃料来源：扫描气态巨行星可补充 <b>25</b> 点燃料，比岩石行星多得多。</p>` },
  kind_ice: {
    t: '冰巨行星', h: `<p>类似天王星、海王星：厚厚的氢氦外层下面，是大量的<b>水、氨、甲烷</b>等"冰"。因为距离恒星很远，温度极低。</p>
    <p>采样常得到<b>水冰、氨、甲烷冰</b>这类材料。扫描可补充 <b>10</b> 点燃料。</p>` },
};
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
  box.classList.toggle('rich', !!K.svg);   // 双星/三星用新版排版
  box.innerHTML = K.svg ? knowRich(K) : `<h2>📖 ${K.t}</h2>${K.h}<div class="row" style="margin-top:12px"><button id="knowOk">知道了</button></div><p class="hint">Enter / Space / Esc 关闭</p>`;
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
  $('cardIdx').textContent = `${bigI + 1} / ${bigList.length}`;
  $('cardbig').classList.remove('hidden');
}
$('cardPrev').onclick = () => showBig(bigI - 1);
$('cardNext').onclick = () => showBig(bigI + 1);
function renderCards() {
  const ids = [...discovered].sort((a, b) => { const [s1, p1] = a.split(':').map(Number), [s2, p2] = b.split(':').map(Number); return s1 - s2 || p1 - p2 });
  const bySys = new Map(); ids.forEach(id => { const s = +id.split(':')[0]; bySys.set(s, (bySys.get(s) || 0) + 1) });
  $('cflt').innerHTML = [
    `<option value="all">全部（${ids.length}）</option>`,
    `<option value="cur">当前星系${curSysI >= 0 ? '：' + systems[curSysI].name : '（不在星系内）'}</option>`,
    ...[...bySys].sort((a, b) => a[0] - b[0]).map(([s, n]) => `<option value="${s}">${systems[s].name}（${n}/${systems[s].nPlanets}）</option>`)
  ].join('');
  $('cflt').value = cardFilter;
  const want = cardFilter === 'all' ? null : cardFilter === 'cur' ? curSysI : +cardFilter;
  const show = want === null ? ids : ids.filter(id => +id.split(':')[0] === want);
  $('cgrid').innerHTML = show.length ? show.map(id => {
    const [si, pi] = id.split(':').map(Number), p = genPlanets(systems[si])[pi];
    return `<img src="${cardURL(p)}" alt="${p.name}">`
  }).join('') : want === null ? '<p>还没有收藏。扫描行星后，它的卡片会出现在这里。</p>'
    : want === -1 ? '<p>飞船当前不在任何星系内。</p>' : '<p>这个星系还没有收藏的卡片。</p>';
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
  return `<div class="kinfo"><b>${KNOW[key].t}</b>${KNOW[key].h.replace(/<\/p>\s*$/, '<button id="cardOk">知道了（Enter）</button></p>')}</div>`;
}
let cardAnim;
let cardHold = false, cardHoldMs = 0;
function showCard(p, isNew) {
  const i = p.info, c = $('card'), note = kindNote(p);
  c.innerHTML = `<div style="position:relative"><img src="${cardURL(p)}" style="border-radius:10px;display:block;margin:0 auto 6px">${note}</div>` +
    (isNew ? `<span class="v">+${i.value} 信用点 · +${i.fuelGain} 燃料 · 已收藏</span>` : '已收藏');
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
  toast(`目标：${target.name} · ${Math.round(target.pos.distanceTo(ship.pos))} u`); beep(880, .06);
}
const ARRIVE = 90;
function warpCost(t) { return Math.max(2, (t.pos.distanceTo(ship.pos) - ARRIVE) * .12) }
function toggleWarp() {
  if (warp) { endWarp(false); return }
  if (!target) { toast('先按 Tab 或在星图中选择目标恒星', 'warn'); return }
  const d = target.pos.distanceTo(ship.pos);
  if (d < ARRIVE + 30) { toast('已在目标附近'); return }
  const cost = warpCost(target);
  if (fuel < cost) { toast(`燃料不足：需要 ${cost.toFixed(0)}，当前 ${fuel.toFixed(0)}。靠近恒星或扫描气态巨行星可补充`, 'warn'); return }
  fuel -= cost; warp = { target, arrive: ARRIVE }; beep(220, .5, 'sawtooth', .04); toast(`曲速启动 → ${target.name}（-${cost.toFixed(0)} 燃料）`);
}
function endWarp(arrived) {
  if (!warp) return;
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quat);
  ship.vel.copy(fwd).multiplyScalar(arrived ? 20 : Math.min(ship.vel.length(), maxSpeed()));
  if (arrived) { toast(`抵达 ${warp.target.name}`, 'good'); beep(520, .2); if (target === warp.target) target = null }
  warp = null;
}

// =====================================================================
// 扫描
// =====================================================================
// ---------- 远程探测 ----------
const STAR_TYPES = ['G 型黄矮星', 'F 型黄白星', 'K 型橙矮星', 'A 型蓝白星', 'M 型红矮星'];
const knows = s => visited.has(s.i) || probed.has(s.i);
const probeCost = s => Math.round(3 + s.pos.distanceTo(ship.pos) / 100);
function sysSummary(s) {
  const ps = genPlanets(s), gas = ps.filter(p => p.kind === 'gas').length, lifeList = ps.filter(p => p.info.life !== '无');
  let best = '', bv = -1; for (const p of lifeList) { const v = LIFE_BONUS[p.info.life] || 0; if (v > bv) { bv = v; best = p.info.life } }
  const unseen = ps.filter(p => !discovered.has(p.id)), value = unseen.reduce((a, p) => a + p.info.value, 0);
  const R2 = makeRng(s.seed + 777), nb = s.i === 0 ? 1 : R2.int(1, 2); let bc = 0;
  for (let k = 0; k < nb; k++)if (!beaconsGot.has(s.i + ':b' + k)) bc++;
  const type = STAR_TYPES[Math.max(0, STAR_COLS.indexOf(s.color))] + ['', '（双星系统）', '（三星系统）'][genStars(s).length - 1],
    quest = frags < FRAG_N && fragSys[frags] === s.i;
  return {
    type, n: ps.length, gas, life: lifeList.length, best, value, bc, quest,
    short: `${type} · 行星${ps.length} 气态${gas} 生命${lifeList.length} 信标${bc}${quest ? ' · ★先驱者信号' : ''}`,
    text: `${type} · 行星 ${ps.length}（气态 ${gas}）· 生命迹象 ${lifeList.length}${best ? `（最高：${best}）` : ''} · 可获得约 ${value} 信用点 · 信标 ${bc}${quest ? ' · 检测到先驱者信号' : ''}`
  };
}
function probeTarget() {
  const t = target;
  if (!t || t.i < 0) { toast('请先选择一颗恒星作为目标（Tab 或星图）', 'warn'); return }
  if (knows(t)) { toast(`${t.name}：情报已掌握`); return }
  const cost = probeCost(t);
  if (fuel < cost) { toast(`燃料不足：远程探测需要 ${cost}，当前 ${fuel.toFixed(0)}`, 'warn'); return }
  fuel -= cost; probed.add(t.i);
  [520, 780].forEach((f, i) => beep(f, .15, 'sine', .05, i * .1));
  toast(`探测完成 ${t.name}：${sysSummary(t).short}`, 'good'); doSave();
}
let barKey = '';
function renderMapBar() {
  const t = target, b = $('btnProbe'); let txt, btn, dis;
  if (!t) { txt = '点击恒星设为目标'; btn = '远程探测 (R)'; dis = true }
  else if (t.i < 0) { txt = '目标：银心奇点'; btn = '远程探测 (R)'; dis = true }
  else {
    const d = Math.round(t.pos.distanceTo(ship.pos));
    if (knows(t)) { txt = `${t.name} · ${d} u · ${sysSummary(t).text}`; btn = '情报已掌握'; dis = true }
    else { txt = `${t.name} · ${d} u · 情报未知`; btn = `远程探测 R（-${probeCost(t)} 燃料）`; dis = fuel < probeCost(t) }
  }
  const key = txt + '|' + btn + '|' + dis; if (key === barKey) return; barKey = key;
  $('mapbarTxt').textContent = txt; b.textContent = btn; b.disabled = dis;
}

// ---------- 主线：银心信号 ----------
const BH_SYS = { i: -1, name: '银心奇点', pos: new THREE.Vector3(0, 0, 0) };
const qV = new THREE.Vector3();
function setQuestTarget() {
  const n = frags < FRAG_N ? systems[fragSys[frags]] : (bhDone ? null : BH_SYS);
  target = (n && n.pos.distanceTo(ship.pos) > (n.i >= 0 ? 260 : 150)) ? n : null;
}
function questText() {
  if (bhDone) return '主线已完成 · 自由探索';
  if (frags >= FRAG_N) return `主线 ${FRAG_N}/${FRAG_N}：前往银心奇点，进入 ${BH_T.range} u 内扫描它（${Math.round(ship.pos.length())} u）`;
  const s = systems[fragSys[frags]], L = loaded.find(x => x.sys === s), here = !!L && s.pos.distanceTo(ship.pos) < 220;
  if (fragKind(frags) === 'planet') {
    const pn = s.name + ' ' + ROMAN[fragPlanetIdx(frags)];
    return here ? `主线 ${frags}/${FRAG_N}：扫描 ${pn} 上的异常信号`
      : `主线 ${frags}/${FRAG_N}：前往 ${s.name}（${Math.round(s.pos.distanceTo(ship.pos))} u），扫描 ${pn} 上的异常信号`;
  }
  const sb = L && L.beacons.find(x => x.story);
  if (here && sb) return `主线 ${frags}/${FRAG_N}：飞向青色信号碎片信标 ◈（${Math.round(qV.copy(sb.local).add(s.pos).distanceTo(ship.pos))} u）`;
  return `主线 ${frags}/${FRAG_N}：前往 ${s.name}（${Math.round(s.pos.distanceTo(ship.pos))} u），寻找信号碎片信标`;
}
function collectFragment(keep = false) {
  const k = frags; frags++; credits += 200; hull = HULL_MAX; fuel = fuelMax();
  [660, 880, 1100, 1320].forEach((f, i) => beep(f, .2, 'triangle', .06, i * .08));
  const c = $('card');
  const html = `<div style="font-size:17px;line-height:1.8"><h3>信号碎片 ${frags}/${FRAG_N}</h3><span class="v" style="font-size:13px">+200 信用点 · 船体与燃料完全恢复 · 信号发现距离 +10%</span><br><br>${FRAG_TEXT[k]}</div>`;
  c.innerHTML = keep ? html + '<hr style="border:0;border-top:1px solid rgba(127,212,255,.25);margin:8px 0">' + c.innerHTML : html;
  c.classList.remove('hidden'); clearTimeout(cardTimer);
  if (!cardHold) {
    cardAnim?.cancel();
    cardAnim = flyIn(c, { hold: 6500, tail: 0, fade: true, scale: 1, endScale: 230 / c.offsetWidth });
    cardTimer = setTimeout(() => c.classList.add('hidden'), 7400);   // 250 + 6500 + 650
  }
  toast(frags >= FRAG_N ? '七块碎片已集齐 —— 信号指向银心奇点' : `信号碎片 ${frags}/${FRAG_N} · 新的坐标已标记`, 'good');
  loaded.forEach(addStoryBeacon);   // 下一块碎片的星系若已加载，立即补建信标
  setQuestTarget(); doSave();
}
function showEnding() {
  bhDone = true; credits += 5000;
  const m = Math.floor(playTime / 60), s = Math.floor(playTime % 60);
  $('endStats').innerHTML = `用时 ${m} 分 ${s} 秒 · 到访 ${visited.size}/${systems.length} 个恒星系 · 发现 ${discovered.size} 颗行星 · 信标 ${beaconsGot.size} 个<br>奖励 +5000 信用点`;
  [392, 523, 659, 784, 1047].forEach((f, i) => beep(f, .5, 'triangle', .06, i * .18));
  target = null; doSave(); openPanel('ending');
}

let scanT = 0, scanId = null, scanCand = null;
// 扫描范围：扫描器等级 + 信号碎片奖励 + 额外加成
// effR 30 = 30u 内扫描器可探测到的信标，range 90 = 90u 内扫描器可探测到的行星
const BH_T = { id: 'bh', name: '银心奇点', effR: 30, range: 90 };
const USE = {
  氢气: { label: '加注燃料 +15', fuel: 15 }, '氦-3': { label: '加注燃料 +40', fuel: 40 }, 甲烷冰: { label: '加注燃料 +25', fuel: 25 },
  金属矿: { label: '修补船体 +20', hull: 20 }, 硅酸盐: { label: '修补船体 +10', hull: 10 },
};
const UPG_MAT = { engine: '稀土', tank: '水冰', scanner: '晶体', boost: '氦-3', cargo: '金属矿' };
const matNeed = k => Math.ceil((up[k] + 1) / 2);
function hit(v) {
  const d = Math.max(0, v - 15) * .6; if (d < 1) return;
  hull = Math.max(0, hull - d); toast(`撞击！船体 -${d.toFixed(0)}（${hull.toFixed(0)}/${HULL_MAX}）`, 'warn'); beep(90, .25, 'sawtooth', .08);
}
const PRICE = { 金属矿: 20, 硅酸盐: 15, 水冰: 20, 氢气: 15, 氨: 18, 甲烷冰: 22, 氨冰: 18, 稀土: 60, 晶体: 70, '氦-3': 80 };
function takeSample(p) {
  if (sampled.has(p.id)) return;
  const want = Math.max(1, Math.round(p.radius)), n = Math.min(want, cargoMax() - cargoUsed());
  if (n <= 0) { toast('货舱已满，无法采样（按 I 查看）', 'warn'); return }
  cargo[p.info.res] = (cargo[p.info.res] || 0) + n; sampled.add(p.id);
  toast(`采样：${p.info.res} ×${n}${n < want ? '（货舱已满，只装下一部分）' : ''}`, 'good'); doSave();
}
const SIG = {
  cache: { name: '补给信标', color: 0xffd27a, css: '#ffe27a' }, distress: { name: '求救信号', color: 0x7cf0a0, css: '#7cf0a0' },
  ruins: { name: '遗迹信号', color: 0xc9a0ff, css: '#c9a0ff' }, decoy: { name: '干扰信号', color: 0xff7a7a, css: '#ff7a7a' },
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
  if (b.type === 'cache') { cr = b.reward.credits * .4 * m; const n = giveItem(b.loot.res, Math.round(b.loot.n * m)); parts.push(n ? `${b.loot.res} ×${n}` : '货舱已满，物资丢失') }
  else if (b.type === 'distress') { cr = b.reward.credits * m; const f = Math.round(30 * m); fuel = Math.min(fuelMax(), fuel + f); parts.push(`+${f} 燃料`) }
  else if (b.type === 'ruins') { cr = b.reward.credits * 1.5 * m; const n = giveItem(b.loot.res, b.power); parts.push(n ? `${b.loot.res} ×${n}` : '货舱已满，遗物丢失') }
  else { good = false; const f = 8 * b.power, h = 6 * b.power; fuel = Math.max(0, fuel - f); hull = Math.max(0, hull - h); parts.push(`燃料 -${f} · 船体 -${h}`) }
  cr = Math.round(cr); credits += cr; beaconsGot.add(b.id);
  toast(`${SIG[b.type].name} ${'▮'.repeat(b.power)}：${cr ? `+${cr} 信用点 · ` : ''}${parts.join(' · ')}`, good ? 'good' : 'warn');
  if (good) { beep(990, .15, 'square', .04); beep(1320, .2, 'square', .04, .12) } else beep(140, .3, 'sawtooth', .06);
}
// ===== 新手教学：分阶段，满足条件就弹出对应的教学 =====
const did = {}; let lookAcc = 0, tutFlash = 0, tutShown = 0, tutFin = 0;
const K = k => `<span class="k">${k}</span>`;
const MOVES = [['前进', 'W'], ['后退', 'S'], ['左移', 'A'], ['右移', 'D'], ['上升', 'Z'], ['下降', 'C'], ['左滚', 'Q'], ['右滚', 'E']];
const chip = (done, txt) => done ? `<span class="k" style="white-space:nowrap">✔ ${txt}</span>` : `<span style="opacity:.55;white-space:nowrap">${txt}</span>`;
const explored = () => {   // 是否有某个星系的行星已经全部发现
  const n = {}; for (const id of discovered) { const si = id.split(':')[0]; n[si] = (n[si] || 0) + 1 }
  return systems.some(s => (n[s.i] || 0) >= s.nPlanets);
};
const canUpgrade = () => UPG.some(u => up[u.k] < 5 && credits >= upCost(u.k) && (!UPG_MAT[u.k] || (cargo[UPG_MAT[u.k]] || 0) >= matNeed(u.k)));
const GALAXY_ACTS = [
  [['ShiftLeft', 'ShiftRight'], `按 ${K('Shift')} 加速（消耗能量）`],
  [['Tab'], `按 ${K('Tab')} 切换目标恒星`],
  [['KeyR'], `按 ${K('R')} 远程探测选中的恒星（消耗燃料）`],
  [['KeyM'], `按 ${K('M')} 打开星图，点击恒星也能设为目标`],
  [['KeyG'], `按 ${K('G')} 启动曲速前往目标（消耗燃料）`],
];
const STAGES = [
  {   // 0 游戏开始：移动
    name: '游戏开始', trigger: () => true, steps: [{
      reset: MOVES.map(x => 'Key' + x[1]), init: () => { lookAcc = 0 },
      t: () => { const c = MOVES.map(([n, k]) => chip(did['Key' + k], `${n} ${k}`)); return `把每个动作都试一遍：<br>${[chip(lookAcc > 400, '转动视角 鼠标/方向键'), ...c.slice(0, 4)].join(' · ')}<br>${c.slice(4).join(' · ')}` },
      ok: () => lookAcc > 400 && MOVES.every(x => did['Key' + x[1]])
    }]
  },
  {   // 1 完成第一次扫描：收藏与货舱
    name: '完成第一次扫描', trigger: () => discovered.size >= 1, steps: [{
      reset: ['KeyK', 'KeyI'],
      t: () => `按 ${K('K')} 查看收藏的行星卡片，按 ${K('I')} 打开货舱，按 ${K('J')} 打开日志。`,
      ok: () => did.KeyK && did.KeyI && did.KeyJ
    }]
  },
  {
    name: '完成一个星系', trigger: explored, steps: [{
      reset: GALAXY_ACTS.flatMap(a => a[0]),
      t: () => `这个星系的行星都发现了！该去下一个了。<br>把以下每个动作都试一遍：<br>${GALAXY_ACTS.map(([codes, txt]) => codes.some(c => did[c]) ? `<span style="color:#9fe8b0">✔ ${txt}</span>` : `☐ ${txt}`).join('<br>')}`,
      ok: () => GALAXY_ACTS.every(([codes]) => codes.some(c => did[c]))
    }]
  },
  {   // 3 够升级了
    name: '升级', trigger: canUpgrade, steps: [{
      reset: ['KeyU'], t: `信用点和材料够升级一次了！按 ${K('U')} 打开升级。`, ok: () => did.KeyU
    }]
  },
  {   // 4 第一次收集信号
    name: '第一次收集信号', trigger: () => beaconsGot.size >= 1 || frags >= 1, steps: [
      {
        reset: ['Enter'],
        t: `你收集到了第一个信号！太空里的信号（◈ 标记）有四类：<br>
        <span style="color:#ffe27a">补给</span>：资源<br>
        <span style="color:#7cf0a0">求救</span>：燃料 + 信用点<br>
        <span style="color:#c9a0ff">遗迹</span>：稀有资源 + 大量信用点<br>
        <span style="color:#ff7a7a">干扰 ⚠</span>：陷阱，别靠近<br>
        ▮▮▮ 表示强度，越强越远就能发现，奖励也越多。走近到一定距离才能识别类型。<br>
        按 ${K('Enter')} 继续`, ok: () => did.Enter
      },
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
      if (tutFin > 0) { el.classList.remove('hidden', 'ok'); el.innerHTML = `<b>教学完成</b> · 按 ${K('H')} 随时查看全部操作与游戏说明`; if ((tutFin -= dt) <= 0) { tutOff = true; tutSave() } }
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
  el.innerHTML = `<small>新手教学 · ${st.name}${st.steps.length > 1 ? ` · ${tutSub + 1}/${st.steps.length}` : ''}</small><br>${typeof s.t === 'function' ? s.t() : s.t}`;
  if (tutShown > 1.2 && s.ok()) { tutFlash = 1; tutShown = 0; el.classList.add('ok'); el.innerHTML = '✔ 完成'; beep(880, .12, 'triangle', .05) }
}
const tutRestart = () => { tutOff = false; tutDone = []; tutCur = -1; tutSub = 0; tutQueue = []; tutFlash = 0; tutShown = 0; tutFin = 0; for (const k in did) delete did[k]; lookAcc = 0; tutSave() };
$('tutChk').checked = !tutOff;
$('tutChk').onchange = e => { if (e.target.checked) tutRestart(); else { tutOff = true; tutSave() } };
$('tutReset').onclick = () => { tutRestart(); knowSeen.clear(); try { localStorage.removeItem('deepspace-know') } catch { } closePanel(); toast('教学已重新开始', 'good') };
$('tutOff').onclick = () => { tutOff = true; tutSave(); closePanel(); $('tutor').classList.add('hidden') };
// ===== 危险事件 =====
let flare = null, flareCd = 20, beltAcc = 0, inBelt = false;
const danger = () => 1 + .12 * frags;
function hurt(d, why) {
  if (d < 1) return;
  hull = Math.max(0, hull - d); toast(`${why}！船体 -${d.toFixed(0)}（${hull.toFixed(0)}/${HULL_MAX}）`, 'warn'); beep(90, .25, 'sawtooth', .08);
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
  toast('船体失效！应急信标把你送回家园恒星：货舱物资损失一半，信用点 -10%', 'warn'); beep(110, .6, 'sawtooth', .07); doSave();
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
    if (!inTide) { inTide = true; toast(`⚠ 进入奇点潮汐区：船体持续受损。进入 ${BH_T.range} u 内才能扫描`, 'warn'); beep(100, .4, 'sawtooth', .06) }
  } else if (inTide && d > TIDE_R * 1.05) inTide = false;
}
let hullWarned = false;
function hullWarn() {
  if (hull < HULL_MAX * .3) { if (!hullWarned) { hullWarned = true; toast(`⚠ 船体危急（${hull.toFixed(0)}/${HULL_MAX}）：再受损将被应急信标送回家园`, 'warn'); beep(180, .3, 'square', .05) } }
  else if (hull > HULL_MAX * .4) hullWarned = false;   // 修好之后才会再次提示，避免在边界反复弹
}
function redFx() {
  const t = performance.now() / 1000; let a = 0;
  if (flare) a = Math.max(a, .35 + .35 * Math.sin(t * 9));                         // 耀斑预警：快速脉冲
  if (hull < HULL_MAX * .3) a = Math.max(a, .25 + .15 * Math.sin(t * 5));          // 船体危急：常亮 + 心跳
  if (tideDepth > 0) a = Math.max(a, tideDepth * (.5 + .4 * Math.sin(t * (4 + 6 * tideDepth))));   // 潮汐：越近越亮越快
  $('redfx').style.opacity = Math.max(0, a).toFixed(2);
}
function hazards(dt) {
  if (warp) { tideDepth = 0; return }
  if (hull <= 0) { wreck(); return }
  tide(dt);
  let near = null;
  for (const L of loaded) for (const s of L.stars) { tV.copy(s.mesh.position).add(L.sys.pos); if (ship.pos.distanceTo(tV) < s.st.radius * 5) near = { pos: tV.clone(), r: s.st.radius * 5 } }
  if (flare) {
    flare.t -= dt;
    if (flare.t <= 0) { if (ship.pos.distanceTo(flare.pos) < flare.r) { hurt(12 * danger(), '恒星耀斑'); energy = 0; fuel = Math.max(0, fuel - 5) } else toast('耀斑已避开', 'good'); flare = null; flareCd = 25 }
  } else {
    flareCd -= dt;
    if (near && flareCd <= 0 && Math.random() < .08 * danger() * dt) { flare = { t: 4, pos: near.pos, r: near.r }; toast('⚠ 耀斑预警：4 秒后爆发，快远离恒星！', 'warn'); beep(220, .3, 'square', .05) }
  }
  let now = false;
  for (const L of loaded) {
    if (!L.belt || !L.belt.visible) continue;
    const { a, b } = L.belt.userData, rx = ship.pos.x - L.sys.pos.x, rz = ship.pos.z - L.sys.pos.z, ry = ship.pos.y - L.sys.pos.y, r = Math.hypot(rx, rz), v = ship.vel.length();
    if (r > a - 1 && r < b + 1 && Math.abs(ry) < 4) { now = true; if (v > 12) { beltAcc += (v - 12) * .05 * danger() * dt; if (beltAcc >= 3) { hurt(beltAcc, '小行星撞击'); beltAcc = 0 } } }
  }
  if (now && !inBelt) toast('进入小行星带：减速到 12 u/s 以下可安全通过', 'warn');
  inBelt = now;
}
function completeScan(c) {
  if (c.id === 'bh') {
    if (bhDone) { toast('银心奇点：数据已记录'); return }
    if (frags < FRAG_N) { toast(`奇点深处传来微弱的回响……（信号碎片 ${frags}/${FRAG_N}）`, 'warn'); beep(120, .5, 'sine', .06); return }
    showEnding(); return;
  }
  did.scan = true;
  const p = c.p, isNew = !discovered.has(p.id);
  if (isNew) {
    discovered.add(p.id); credits += p.info.value; fuel = Math.min(fuelMax(), fuel + p.info.fuelGain);
    toast(`发现 ${p.name} · +${p.info.value} 信用点`, 'good');
    [660, 880, 1100].forEach((f, i) => beep(f, .18, 'triangle', .06, i * .09)); doSave();
    const sys = systems[+p.id.split(':')[0]];
    if (genPlanets(sys).every(q => discovered.has(q.id))) {
      toast(`${sys.name} 星系已完成探索 · 即将打开收藏`, 'good');
      setTimeout(() => { if (openP !== 'cards') { pendingFilter = String(sys.i); openPanel('cards') } }, 3500);
    }
  } else beep(500, .1);
  takeSample(p);
  showCard(p, isNew);
  // 主线：当前碎片对应的异常行星（即使之前已扫描过，再扫一次也能取得碎片）
  if (frags < FRAG_N && fragKind(frags) === 'planet' && p.id === fragSys[frags] + ':' + fragPlanetIdx(frags)) collectFragment(true);
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
      if (!b.story && !b.ided && b.d < idR(b)) { b.ided = true; const c = SIG[b.type].color; b.mesh.material.color.setHex(c); b.glow.material.color.setHex(c); if (b.type === 'decoy') toast('⚠ 检测到干扰信号：这是陷阱，别靠近', 'warn') }
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
  $('cargoTxt').textContent = `${cargoUsed()}/${cargoMax()}`;
  $('hullTxt').textContent = hull < HULL_MAX * .3 ? `受损 ${hull.toFixed(0)}/${HULL_MAX}` : `${hull.toFixed(0)}/${HULL_MAX}`;
  $('hullBar').firstElementChild.style.width = hull / HULL_MAX * 100 + '%';
  $('discCount').textContent = discovered.size; $('bcCount').textContent = beaconsGot.size;
  $('fuelTxt').textContent = `${fuel.toFixed(0)}/${fuelMax()}`; $('fuelBar').firstElementChild.style.width = fuel / fuelMax() * 100 + '%';
  $('energyTxt').textContent = boostLock ? '过热' : `${energy.toFixed(0)}/${energyMax()}`;
  $('energyBar').firstElementChild.style.width = energy / energyMax() * 100 + '%';
  $('speedTxt').textContent = ship.vel.length().toFixed(0) + ' u/s' + (warp ? ' · 曲速' : '');
  $('sysName').textContent = cur && cur.sys._d < 220 ? cur.sys.name + ' 星系' + ['', '（双星）', '（三星）'][genStars(cur.sys).length - 1] : '深空';
  $('nearInfo').textContent = `最近恒星：${nearest.name} · ${Math.round(nearestDist)} u`;
  $('tgtInfo').textContent = target ? `目标：${target.name} · ${Math.round(target.pos.distanceTo(ship.pos))} u · 曲速 -${warpCost(target).toFixed(0)} 燃料` : '目标：无（Tab 选择）';

  $('tgtProbe').textContent = target && target.i >= 0 ? (knows(target) ? '情报：' + sysSummary(target).short : `情报：未知 · 按 R 远程探测（-${probeCost(target)} 燃料）`) : '';
  $('quest').textContent = questText();

  // 准星
  const ret = $('reticle'); ret.classList.toggle('hit', !!scanCand);
  $('ring').style.strokeDashoffset = 163.4 * (1 - Math.min(1, scanT));

  // 提示
  let pr = '';
  if (warp) pr = `曲速航行中 → ${warp.target.name}　<span class="k">S</span> / <span class="k">G</span> 取消`;
  else if (scanCand) {
    const known = scanCand.p ? discovered.has(scanCand.p.id) : bhDone;
    pr = `${scanCand.name}　${Math.round(scanCand.d)} u${known ? '（已记录）' : ''}<br>按住 <span class="k">鼠标左键</span> / <span class="k">F</span> 扫描`;
  } else if (scooping) pr = '恒星采集中 · 燃料补充';
  else if (document.pointerLockElement !== renderer.domElement && !openP) pr = '点击画面以控制飞船';
  $('prompt').innerHTML = pr;

  // 行星标签
  for (const L of loaded) {
    for (const pl of L.planets) {
      pl.mesh.getWorldPosition(tV); const d = tV.distanceTo(ship.pos), s = toScreen(tV), known = discovered.has(pl.p.id);
      if (s.behind || d > 450 || warp || !pl.show) { pl.label.style.display = 'none'; continue }
      const sig = frags < FRAG_N && fragKind(frags) === 'planet' && pl.p.id === fragSys[frags] + ':' + fragPlanetIdx(frags);
      pl.label.style.display = 'block'; pl.label.className = (known ? 'ok ' : '') + (sig ? 'st' : '');
      pl.label.style.transform = `translate(${s.x}px,${s.y + pl.p.radius * 620 / d + 10}px) translate(-50%,0)`;
      pl.label.innerHTML = (known ? `${pl.p.name}<br>${Math.round(d)} u` : `未知天体<br>${Math.round(d)} u`) + (sig ? '<br>◇ 异常信号' : '');
    }
    for (const b of L.beacons) {
      tV.copy(b.local).add(L.sys.pos); const d = tV.distanceTo(ship.pos), s = toScreen(tV);
      if (s.behind || warp || !b.mesh.visible) { b.label.style.display = 'none'; continue }
      b.label.style.display = 'block'; b.label.style.transform = `translate(${s.x}px,${s.y + 16}px) translate(-50%,0)`;
      const bars = b.story ? '' : ' ' + '▮'.repeat(b.power) + '▯'.repeat(3 - b.power);
      b.label.style.color = b.ided && !b.story ? SIG[b.type].css : '';
      b.label.innerHTML = (b.story ? '◈ 信号碎片' : b.ided ? `◈ ${SIG[b.type].name}${b.type === 'decoy' ? ' ⚠' : ''}` : '◈ 未知信号') + bars + `<br>${Math.round(d)} u`;
    }
    L.stars.forEach((x, k) => {   // 伴星标签：方便找到远处的第二、第三颗太阳
      if (!x.label) return;
      tV.copy(x.mesh.position).add(L.sys.pos); const d = tV.distanceTo(ship.pos), sc = toScreen(tV);
      if (sc.behind || d > 600 || warp) { x.label.style.display = 'none'; return }
      x.label.style.display = 'block';
      x.label.style.transform = `translate(${sc.x}px,${sc.y + x.st.radius * 620 / d + 12}px) translate(-50%,0)`;
      x.label.innerHTML = `伴星 ${'ABC'[k]}<br>${Math.round(d)} u`;
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
    $('bmarkTxt').textContent = `信号碎片 ${Math.round(dB)}u`;
  } else bm.classList.add('hidden');
  // 目标标记
  const tm = $('tmark');
  if (target) {
    const s = toScreen(target.pos); let x = s.x, y = s.y;
    if (s.behind) { x = innerWidth - x; y = innerHeight - y }
    const m = 40; x = Math.max(m, Math.min(innerWidth - m, x)); y = Math.max(m, Math.min(innerHeight - m, y));
    if (s.behind) { x = x < innerWidth / 2 ? m : innerWidth - m }
    tm.classList.remove('hidden'); tm.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`;
    $('tmarkTxt').textContent = `${target.name} ${Math.round(target.pos.distanceTo(ship.pos))}u`;
  } else tm.classList.add('hidden');
}

// =====================================================================
// 面板：日志 / 升级 / 星图
// =====================================================================
function renderJournal() {
  const ids = [...discovered].sort((a, b) => { const [s1, p1] = a.split(':').map(Number), [s2, p2] = b.split(':').map(Number); return s1 - s2 || p1 - p2 });
  let total = 0;
  const rows = ids.map(id => {
    const [si, pi] = id.split(':').map(Number), p = genPlanets(systems[si])[pi]; total += p.info.value;
    return `<tr><td>${p.name}</td><td>${({ rock: '岩石', gas: '气态', ice: '冰巨' })[p.kind]}</td><td>${p.info.atm}</td><td>${p.info.temp}°C</td><td>${p.info.res}</td><td>${p.info.life}</td><td>${p.info.value}</td></tr>`
  }).join('');
  const story = `<h3 style="margin:0 0 6px;color:var(--c2)">主线 · 银心信号 ${frags}/${FRAG_N}${bhDone ? ' · 已完成' : ''}</h3>` +
    (frags ? '<ol style="opacity:.85;line-height:1.7;margin:0 0 12px;padding-left:20px">' + FRAG_TEXT.slice(0, frags).map(t => `<li>${t}</li>`).join('') + '</ol>' : '<p>尚未获得信号碎片。</p>');
  $('jbody').innerHTML = story + `<p>已发现行星 <b>${ids.length}</b> 颗 · 到访恒星系 <b>${visited.size}/${systems.length}</b> · 信标 <b>${beaconsGot.size}</b> · 银心奇点 ${bhDone ? '✔' : '未扫描'} · 累计样本价值 <b style="color:var(--c2)">${total}</b></p>
   ${ids.length ? `<table><tr><th>名称</th><th>类型</th><th>大气</th><th>温度</th><th>资源</th><th>生命</th><th>价值</th></tr>${rows}</table>` : '<p>还没有发现。飞近行星、瞄准并按住鼠标左键扫描。</p>'}`;
}
function renderCargo() {
  // 货舱
  $('cargoCap').textContent = `${cargoUsed()}/${cargoMax()}`; $('cargoCr').textContent = credits;
  // 只显示数量大于 0 的物品
  const rows = Object.entries(cargo).filter(([, n]) => n > 0);
  // 物品列表：可使用或出售
  $('cbody').innerHTML = rows.length ? '<table>' + rows.map(([k, n]) => {
    const u = USE[k], useless = !u || (u.fuel && fuel >= fuelMax()) || (u.hull && hull >= HULL_MAX);
    return `<tr><td>${k}</td><td>×${n}</td><td>${u ? `<button data-u="${k}" ${useless ? 'disabled' : ''}>${u.label}</button>` : '<span style="opacity:.6">仅可出售</span>'}</td>
      <td><button data-r="${k}">出售 ${PRICE[k] ?? 10}/个</button></td></tr>`
  }).join('') + '</table>' : '<p>货舱是空的。扫描行星时会自动采样。</p>';
  // 物品按钮事件
  $('cbody').querySelectorAll('button[data-u]').forEach(b => b.onclick = () => {
    const k = b.dataset.u, u = USE[k]; if (!cargo[k]) return;
    if (u.fuel) fuel = Math.min(fuelMax(), fuel + u.fuel); if (u.hull) hull = Math.min(HULL_MAX, hull + u.hull);
    if (--cargo[k] <= 0) delete cargo[k]; beep(660, .12, 'triangle'); toast(`${k}：${u.label}`, 'good'); doSave(); renderCargo();
  });
  // 出售按钮事件
  $('cbody').querySelectorAll('button[data-r]').forEach(b => b.onclick = () => {
    const k = b.dataset.r; credits += (cargo[k] || 0) * (PRICE[k] ?? 10); delete cargo[k]; beep(740, .15, 'triangle'); doSave(); renderCargo();
  });
}
const UPG = [
  { k: 'engine', name: '引擎', desc: l => `巡航速度 ${30 + 10 * l} u/s` },
  { k: 'tank', name: '燃料舱', desc: l => `燃料上限 ${100 + 40 * l}` },
  { k: 'scanner', name: '扫描仪', desc: l => `扫描距离 ${90 + 30 * l} u · 耗时 ${Math.max(1, 3 - .4 * l).toFixed(1)} s` },
  { k: 'cargo', name: '货舱', desc: l => `容量 ${20 + 10 * l}` },
  { k: 'boost', name: '推进器', desc: l => `能量上限 ${100 + 30 * l} · 回复更快` },
];
const upCost = k => Math.round(120 * Math.pow(up[k] + 1, 2));
function renderUpg() {
  // 升级面板
  $('upgCr').textContent = credits;
  // 物品列表：可升级或已满级
  $('ubody').innerHTML = '<table>' + UPG.map(u => {
    const l = up[u.k], max = l >= 5, mat = UPG_MAT[u.k], need = matNeed(u.k), have = cargo[mat] || 0, can = credits >= upCost(u.k) && have >= need;
    return `<tr><td>${u.name}</td><td class="pips">${'■'.repeat(l) + '□'.repeat(5 - l)}</td><td>${u.desc(l)}${max ? '' : ` → ${u.desc(l + 1)}`}</td>
      <td>${max ? '' : `<span style="color:${have >= need ? '#9fe8b0' : '#ff9a9a'}">${mat} ${have}/${need}</span>${have < need && cargoUsed() >= cargoMax() ? ' <span style="opacity:.7">货舱已满，按 I 腾位</span>' : ''}`}</td>
      <td><button data-k="${u.k}" ${max || !can ? 'disabled' : ''}>${max ? '已满级' : '升级 ' + upCost(u.k)}</button></td></tr>`
  }).join('') + '</table>';
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
    if (s.i === 0) { g.fillStyle = '#ffd27a'; g.font = '12px monospace'; g.fillText('H', x + 7, y - 6) }
    if (frags < FRAG_N && s.i === fragSys[frags]) { g.fillStyle = '#ffd27a'; g.font = '16px monospace'; g.fillText('★', x - 7, y - 9) }
  }
  if ((frags >= FRAG_N && !bhDone) || (target && target.i === -1)) {
    g.strokeStyle = '#ffd27a'; g.lineWidth = 1.5; g.beginPath(); g.arc(mx(0), my(0), 11, 0, TAU); g.stroke();
    g.fillStyle = '#ffd27a'; g.font = '12px monospace'; g.fillText('银心奇点', mx(0) + 14, my(0) + 4);
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
    let info = '未知 · 选中后可远程探测';
    if (kn) {
      const sm = sysSummary(s), n = genPlanets(s).filter(p => discovered.has(p.id)).length;
      info = `${sm.type}<br>行星 ${n}/${sm.n} 已发现 · 气态 ${sm.gas} · 生命迹象 ${sm.life}${sm.best ? `（${sm.best}）` : ''}<br>可获得约 ${sm.value} 信用点 · 信标 ${sm.bc}${sm.quest ? '<br>★ 检测到先驱者信号' : ''}`
    }
    tip.innerHTML = `<b>${s.name}</b>${visited.has(s.i) ? ' · 已到访' : probed.has(s.i) ? ' · 已探测' : ''}<br>距离 ${Math.round(d)} u · 曲速 -${Math.max(2, (d - ARRIVE) * .12).toFixed(0)} 燃料<br>${info}`
  }
  else tip.style.display = 'none';
});
mapc.addEventListener('click', e => { const s = mapHit(e); if (s) { target = s; toast('目标：' + s.name); beep(880, .06) } });

// =====================================================================
// 开始 / 循环
// =====================================================================
$('ver').textContent = 'v' + VERSION;
document.querySelectorAll('.tab').forEach(b => b.onclick = () => {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t === b));
  document.querySelectorAll('.pane').forEach(p => p.classList.toggle('hidden', p.id !== b.dataset.tab));
});
$('saveHint').textContent = save ? `检测到存档：${discovered.size} 颗行星 · ${credits} 信用点 · seed ${seed}` : `seed ${seed}`;
$('btnStart').textContent = save ? '继续探险' : '开始探险';
$('btnStart').onclick = () => {
  running = true; $('start').classList.add('hidden'); $('hud').classList.remove('hidden');
  renderer.domElement.requestPointerLock?.(); beep(440, .1);
  setQuestTarget();
  if (!save) {
    toast(`主线：${systems[fragSys[0]].name} 星系检测到异常信号，目标已标记`, 'good');
  }
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
  if (running && !paused()) { update(dt); hazards(dt); redFx(); hullWarn(); tutTick(dt); updateHUD() }
  else if (running) updateHUD();   // 面板打开时游戏暂停，但 HUD（燃料、船体、信用点）仍要同步  
  else if (!running) { // 开始界面：缓慢环视
    tQ.setFromEuler(tE.set(0, dt * .04, 0)); ship.quat.multiply(tQ); camera.quaternion.copy(ship.quat); updateLOD();
  }
  if (openP === 'map') drawMap();
  if (bloomOn) composer.render(); else renderer.render(scene, camera);
}
updateLOD(); frame();
