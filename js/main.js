// Deep Space Explorer — 主程序：状态、渲染、输入、主循环与界面
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';

import { VERSION, TAU, GR, ROMAN, STAR_COLS, SAVE_KEY, FRAG_N, FRAG_TEXT, LIFE_BONUS } from './constants.js';
import { mulberry32, makeRng, lerp } from './rng.js';
import { genGalaxy, genBackground, genNebulae, genSystems, genPlanets } from './universe.js';
import { genFragments, fragKind } from './story.js';
import { beep } from './audio.js';
import { soft, planetTexture, pointCloud } from './graphics.js';

const $ = id => document.getElementById(id);

// =====================================================================
// 存档 & 状态
// =====================================================================
const params=new URLSearchParams(location.search);
function loadSave(){try{return JSON.parse(localStorage.getItem(SAVE_KEY))}catch{return null}}
let save=loadSave();
const urlSeed=parseInt(params.get('seed'));
if(urlSeed&&save&&save.seed!==urlSeed)save=null;
const seed=urlSeed||save?.seed||42;

const R0=makeRng(seed);
const GAL=genGalaxy(R0),BG=genBackground(R0),NEB=genNebulae(R0),systems=genSystems(R0,GAL);

// 主线碎片：从母星系出发，逐步向银心推进（偶数序号=扫描异常行星，奇数序号=寻找信标）
const fragSys=genFragments(seed,systems);
const fragPlanetIdx=k=>k===0?2:systems[fragSys[k]].seed%systems[fragSys[k]].nPlanets;
// 当前主线要扫描的那颗行星（同时存在两个星系时，副星系只显示它）
const isQuestPlanet=p=>frags<FRAG_N&&fragKind(frags)==='planet'&&p.id===fragSys[frags]+':'+fragPlanetIdx(frags);

let credits=save?.credits??0;
const up=Object.assign({engine:0,tank:0,scanner:0,boost:0},save?.up||{});
const discovered=new Set(save?.discovered||[]);
const beaconsGot=new Set(save?.beacons||[]);
const visited=new Set(save?.visited||[]);
const probed=new Set(save?.probed||[]);
let bhDone=!!save?.ended;
let frags=Math.min(FRAG_N,save?.frags??0),playTime=save?.playTime??0;
const maxSpeed=()=>30+10*up.engine, fuelMax=()=>100+40*up.tank,
  scanRange=()=>90+30*up.scanner, scanTime=()=>Math.max(1,3-.4*up.scanner), energyMax=()=>100+30*up.boost;
let fuel=Math.min(save?.fuel??fuelMax(),fuelMax()),energy=energyMax();

function doSave(){
  try{localStorage.setItem(SAVE_KEY,JSON.stringify({seed,credits,up,discovered:[...discovered],
    beacons:[...beaconsGot],visited:[...visited],probed:[...probed],ended:bhDone,frags,playTime,fuel,pos:ship.pos.toArray(),quat:ship.quat.toArray()}))}catch{}
}

// =====================================================================
// 渲染基础
// =====================================================================
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
document.body.insertBefore(renderer.domElement,document.body.firstChild);
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,.1,30000);
scene.add(new THREE.AmbientLight(0x223355,.45));
const composer=new EffectComposer(renderer);
composer.addPass(new RenderPass(scene,camera));
const bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.8,.6,.15);
composer.addPass(bloom);composer.addPass(new OutputPass());


scene.add(pointCloud(BG,14));
scene.add(pointCloud(GAL,2.2,.95));
for(const n of NEB){
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:soft,color:new THREE.Color(...n.c),opacity:n.o,
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
  s.position.set(...n.p);s.scale.setScalar(n.s);scene.add(s)}

// 银心奇点
const bh=new THREE.Group();scene.add(bh);
bh.add(new THREE.Mesh(new THREE.SphereGeometry(5,32,32),new THREE.MeshBasicMaterial({color:0})));
let bhDisk;
{
  const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');
  const gr=g.createRadialGradient(128,128,40,128,128,128);
  gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.15,'rgba(255,200,110,.95)');
  gr.addColorStop(.5,'rgba(255,110,40,.4)');gr.addColorStop(1,'rgba(255,60,0,0)');
  g.fillStyle=gr;g.fillRect(0,0,256,256);
  bhDisk=new THREE.Mesh(new THREE.RingGeometry(6.5,34,128),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),
    transparent:true,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false}));
  bhDisk.rotation.x=-Math.PI/2+.25;bh.add(bhDisk);
  const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:soft,color:0xffb060,opacity:.8,transparent:true,
    blending:THREE.AdditiveBlending,depthWrite:false}));halo.scale.setScalar(110);bh.add(halo)}

// 远处恒星标记
const markers=systems.map(s=>{
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:soft,color:new THREE.Color(...s.color),opacity:1,
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
  sp.position.copy(s.pos);sp.scale.setScalar(14);scene.add(sp);return sp});

// 飞行尘埃
const DUST_N=700,DUST_R=100,dustPos=new Float32Array(DUST_N*3);
for(let i=0;i<DUST_N*3;i++)dustPos[i]=(Math.random()-.5)*DUST_R*2;
const dustGeo=new THREE.BufferGeometry();dustGeo.setAttribute('position',new THREE.BufferAttribute(dustPos,3));
const dust=new THREE.Points(dustGeo,new THREE.PointsMaterial({size:.55,color:0x9fc4ff,transparent:true,opacity:.6,
  depthWrite:false,blending:THREE.AdditiveBlending}));
dust.frustumCulled=false;scene.add(dust);

// =====================================================================
// 飞船
// =====================================================================
const UP=new THREE.Vector3(0,1,0);
const ship={pos:new THREE.Vector3(),quat:new THREE.Quaternion(),vel:new THREE.Vector3()};
if(save?.pos){ship.pos.fromArray(save.pos);ship.quat.fromArray(save.quat)}
else{
  const h=systems[0];ship.pos.copy(h.pos).add(new THREE.Vector3(0,25,140));
  ship.quat.setFromRotationMatrix(new THREE.Matrix4().lookAt(ship.pos,h.pos,UP));
}

// =====================================================================
// 恒星系 LOD
// =====================================================================
const labelsEl=$('labels');
const loaded=[];   // 同时存在的恒星系（附近的都会加载，避免“最近恒星”变化时场景被整体替换）
let cur=null;      // 其中离玩家最近的一个（仅用于界面显示）
function mkLabel(cls){const d=document.createElement('div');if(cls)d.className=cls;labelsEl.appendChild(d);return d}

// 为信标挑选位置：保证“本星系的恒星”是该点最近的恒星（并留出余量），
// 这样飞向信标时不会因为邻近恒星变成“最近”而把星系切走
function beaconSpot(sys,R,rMax){
  let best=null,bm=-1e9;
  for(let t=0;t<40;t++){
    const an=R.uni(0,TAU),r=R.uni(25,rMax),y=R.uni(-15,15);
    const p=new THREE.Vector3(Math.cos(an)*r,y,Math.sin(an)*r),gp=p.clone().add(sys.pos);
    let other=1e9;for(const s of systems){if(s===sys)continue;const d=s.pos.distanceTo(gp);if(d<other)other=d}
    const margin=other-p.length();
    if(margin>=30)return p;
    if(margin>bm){bm=margin;best=p}
  }
  return best;
}

function buildSystem(sys){
  const g=new THREE.Group();g.position.copy(sys.pos);scene.add(g);
  const sc=new THREE.Color(...sys.color);
  const star=new THREE.Mesh(new THREE.SphereGeometry(sys.radius,48,48),new THREE.MeshBasicMaterial({color:sc}));g.add(star);
  const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:soft,color:sc,opacity:.9,transparent:true,
    blending:THREE.AdditiveBlending,depthWrite:false}));glow.scale.setScalar(sys.radius*7);star.add(glow);
  const light=new THREE.PointLight(sc,4,0,0);g.add(light);   // 同时只有一个星系的光源亮着（见主循环），避免叠加过亮

  const orbits=[],planets=genPlanets(sys).map(p=>{
    const pivot=new THREE.Group();g.add(pivot);
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(p.radius,48,48),
      new THREE.MeshStandardMaterial({map:planetTexture(p),roughness:.9,metalness:0}));
    mesh.position.x=p.dist;mesh.rotation.z=p.tilt;pivot.add(mesh);
    if(p.ring){const r=new THREE.Mesh(new THREE.RingGeometry(p.radius*1.5,p.radius*2.5,96),
      new THREE.MeshBasicMaterial({color:new THREE.Color(...p.palette[1]),transparent:true,opacity:.55,side:THREE.DoubleSide}));
      r.rotation.x=Math.PI/2-.3;mesh.add(r)}
    const moons=[];
    for(let i=0;i<p.moons;i++){
      const mp=new THREE.Group();mesh.add(mp);
      const m=new THREE.Mesh(new THREE.SphereGeometry(p.radius*(.13+.07*i),16,16),
        new THREE.MeshStandardMaterial({color:0xaaaaaa,roughness:1}));
      m.position.x=p.radius*(2.2+i*.9);mp.add(m);moons.push({pivot:mp,speed:2.5/(1+i*.6)})}
    const pts=[];for(let i=0;i<=256;i++){const a=i/256*TAU;pts.push(new THREE.Vector3(Math.cos(a)*p.dist,0,Math.sin(a)*p.dist))}
    const orbitLine=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({color:0x4466aa,transparent:true,opacity:.3}));
    g.add(orbitLine);orbits.push(orbitLine);
    pivot.rotation.y=p.phase;
    return {p,pivot,mesh,moons,label:mkLabel()};
  });

  let belt=null;
  if(planets.length>=4){
    const a=planets[2].p.dist+6,b=planets[2].p.dist+12;
    belt=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.35,0),new THREE.MeshStandardMaterial({color:0x8a8070,roughness:1}),700);
    const rng=mulberry32(sys.seed),m=new THREE.Matrix4(),q=new THREE.Quaternion(),e=new THREE.Euler();
    for(let i=0;i<700;i++){const an=rng()*TAU,r=a+rng()*(b-a);
      e.set(rng()*6,rng()*6,rng()*6);q.setFromEuler(e);
      m.compose(new THREE.Vector3(Math.cos(an)*r,(rng()-.5)*1.6,Math.sin(an)*r),q,new THREE.Vector3().setScalar(.4+rng()*1.3));
      belt.setMatrixAt(i,m)}
    g.add(belt);
  }

  // 信标
  const R2=makeRng(sys.seed+777),beacons=[],lastD=planets[planets.length-1].p.dist,nb=sys.i===0?1:R2.int(1,2);
  for(let k=0;k<nb;k++){
    const id=sys.i+':b'+k;R2.uni(0,TAU);R2.uni(25,lastD+15);R2.uni(-15,15);   // 保持奖励的随机序列不变
    const spot=beaconSpot(sys,makeRng(sys.seed+555+k),lastD+15);
    const reward={credits:R2.int(150,400),fuel:R2.rand()<.5?R2.int(25,50):0};
    if(beaconsGot.has(id))continue;
    const mesh=new THREE.Mesh(new THREE.OctahedronGeometry(1.6),new THREE.MeshBasicMaterial({color:0xffd27a,wireframe:true}));
    const local=spot;mesh.position.copy(local);g.add(mesh);
    const gl=new THREE.Sprite(new THREE.SpriteMaterial({map:soft,color:0xffc860,opacity:.9,transparent:true,
      blending:THREE.AdditiveBlending,depthWrite:false}));gl.scale.setScalar(14);mesh.add(gl);
    beacons.push({id,mesh,local,reward,label:mkLabel('bc')});
  }
  const S={sys,group:g,star,planets,belt,beacons,light,orbits};
  addStoryBeacon(S);
  return S;
}
// 主线：信号碎片信标。星系已经加载时，主线推进后也可以补建（避免邻居星系先加载导致信标缺失）
function addStoryBeacon(S){
  const sys=S.sys;
  if(frags>=FRAG_N||fragKind(frags)!=='beacon'||fragSys[frags]!==sys.i||S.beacons.some(b=>b.story))return;
  const lastD=S.planets[S.planets.length-1].p.dist;
  const local=beaconSpot(sys,makeRng(sys.seed+999),lastD+10);
  const mesh=new THREE.Mesh(new THREE.OctahedronGeometry(2.6),new THREE.MeshBasicMaterial({color:0x66e0ff,wireframe:true}));
  mesh.position.copy(local);S.group.add(mesh);
  const gl=new THREE.Sprite(new THREE.SpriteMaterial({map:soft,color:0x66e0ff,opacity:.95,transparent:true,
    blending:THREE.AdditiveBlending,depthWrite:false}));gl.scale.setScalar(22);mesh.add(gl);
  S.beacons.push({id:'f:'+frags,story:true,pick:20,mesh,local,reward:{credits:0,fuel:0},label:mkLabel('st')});
}
function disposeSystem(s){
  s.group.traverse(o=>{
    o.geometry?.dispose();
    const m=o.material;if(m){m.map?.dispose();m.dispose()}
  });
  scene.remove(s.group);
  s.planets.forEach(p=>p.label.remove());s.beacons.forEach(b=>b.label.remove());
}
// 加载规则：同一时刻最多两个星系——
//  ① 主星系：离玩家最近的恒星所在星系（与最初版本相同，带迟滞，不会来回闪烁）
//  ② 主线星系：玩家 260u 内时额外保留，保证主线的行星/信标不会因为“最近恒星”变化而消失
const LOAD_R=260,UNLOAD_R=330,ENTER_R=180;
let nearest=systems[0],nearestDist=1e9,lastEntered=-1,primarySys=null,pinnedSys=null,arriveLock=null,arriveAt=new THREE.Vector3();
const questSysIdx=()=>frags<FRAG_N?fragSys[frags]:-2;
function updateLOD(){
  let best=null,bd=1e9;
  for(const s of systems){const d=s.pos.distanceTo(ship.pos);s._d=d;if(d<bd){bd=d;best=s}}
  nearest=best;nearestDist=bd;
  // ① 主星系
  if(primarySys){
    const dc=primarySys._d;
    if(dc>UNLOAD_R||(best!==primarySys&&bd<LOAD_R&&dc>bd+20))primarySys=null;
  }
  if(!primarySys&&bd<LOAD_R)primarySys=best;
  // 曲速锁定：恒星挨得很近（平均间距约 100u），曲速到达点附近往往有别的恒星更近，
  // 所以曲速目标一进入加载范围就作为主星系，到达后继续保持；
  // 解除条件：离它超过 220u，或者你已离开到达点 40u 以上且别的恒星明显更近（近 60u 以上）
  if(warp){arriveLock=warp.target;arriveAt.copy(ship.pos)}
  else if(arriveLock&&(arriveLock._d>220||(best!==arriveLock&&arriveLock._d>bd+60&&ship.pos.distanceTo(arriveAt)>40)))arriveLock=null;
  if(arriveLock&&arriveLock._d<LOAD_R)primarySys=arriveLock;
  // ② 主线星系
  // 保留半径只覆盖“确实需要的范围”：信标最远约 165u；扫描行星类任务需要更远的扫描距离
  const qi=questSysIdx(),qs=qi>=0?systems[qi]:null,pinR=(frags<FRAG_N&&fragKind(frags)==='planet')?240:190;
  if(qs&&(qs._d<pinR||(pinnedSys===qs&&qs._d<=pinR+50)))pinnedSys=qs;else pinnedSys=null;
  // 卸载不再需要的，加载缺少的
  const want=[primarySys,pinnedSys].filter((s,i,a)=>s&&a.indexOf(s)===i);
  for(let i=loaded.length-1;i>=0;i--)if(!want.includes(loaded[i].sys)){disposeSystem(loaded[i]);loaded.splice(i,1)}
  for(const s of want)if(!loaded.some(L=>L.sys===s))loaded.push(buildSystem(s));
  cur=(arriveLock&&loaded.find(L=>L.sys===arriveLock))||null;   // 曲速锁定的星系优先完整显示
  if(!cur)for(const L of loaded)if(!cur||L.sys._d<cur.sys._d)cur=L;
  // 进入某星系的提示 / 记为已到访
  const inside=cur&&cur.sys._d<ENTER_R?cur.sys:null;
  if(!inside)lastEntered=-1;
  else if(lastEntered!==inside.i){
    lastEntered=inside.i;
    const first=!visited.has(inside.i);visited.add(inside.i);
    const n=genPlanets(inside).filter(p=>discovered.has(p.id)).length;
    toast(`进入 ${inside.name} 星系 · ${first?'首次到访 · ':''}已发现 ${n}/${inside.nPlanets}`,first?'good':'');
  }
  markers.forEach((m,i)=>m.visible=!loaded.some(L=>L.sys.i===i));
}

// =====================================================================
// 输入
// =====================================================================
const keys={};let mouseDX=0,mouseDY=0,mouseHeld=false,running=false,openP=null;
const panels={journal:$('journal'),upg:$('upg'),map:$('mapw'),ending:$('ending')};
const paused=()=>!running||openP==='journal'||openP==='upg'||openP==='ending';
addEventListener('keydown',e=>{
  if(!running)return;
  if(['Tab','Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
  if(e.repeat)return;
  keys[e.code]=true;
  if(e.code==='Escape'){if(openP)closePanel();return}
  if(e.code==='KeyB')toggleBloom();
  if(e.code==='KeyM')openPanel('map');
  if(e.code==='KeyJ')openPanel('journal');
  if(e.code==='KeyU')openPanel('upg');
  if(paused())return;
  if(e.code==='Tab')cycleTarget();
  if(e.code==='KeyR')probeTarget();
  if(e.code==='KeyG')toggleWarp();
});
addEventListener('keyup',e=>{keys[e.code]=false});
addEventListener('blur',()=>{for(const k in keys)keys[k]=false;mouseHeld=false});
document.addEventListener('mousemove',e=>{
  if(document.pointerLockElement===renderer.domElement){mouseDX+=e.movementX;mouseDY+=e.movementY}});
addEventListener('mousedown',e=>{if(e.button===0&&document.pointerLockElement===renderer.domElement)mouseHeld=true});
addEventListener('mouseup',e=>{if(e.button===0)mouseHeld=false});
renderer.domElement.addEventListener('click',()=>{
  if(running&&!paused()&&!openP&&document.pointerLockElement!==renderer.domElement)renderer.domElement.requestPointerLock?.()});

// 辉光开关（记住选择）
let bloomOn=true;
try{bloomOn=localStorage.getItem('deepspace-bloom')!=='off'}catch{}
$('bloomChk').checked=bloomOn;
function setBloom(v,notify){
  bloomOn=v;$('bloomChk').checked=v;
  try{localStorage.setItem('deepspace-bloom',v?'on':'off')}catch{}
  if(notify)toast('辉光：'+(v?'开':'关'));
}
function toggleBloom(){setBloom(!bloomOn,true)}
$('bloomChk').onchange=e=>setBloom(e.target.checked,false);

function openPanel(n){
  if(openP===n){closePanel();return}
  closePanel();openP=n;panels[n].classList.remove('hidden');
  document.exitPointerLock?.();mouseHeld=false;
  if(n==='journal')renderJournal();if(n==='upg')renderUpg();
}
function closePanel(){if(openP){panels[openP].classList.add('hidden');openP=null}}

// Toast & 卡片
function toast(msg,cls=''){
  const d=document.createElement('div');d.className='toast '+cls;d.textContent=msg;$('toasts').appendChild(d);
  setTimeout(()=>d.remove(),4300);
  while($('toasts').children.length>4)$('toasts').firstChild.remove();
}
let cardTimer=0;
function showCard(p,isNew){
  const i=p.info,c=$('card');
  c.innerHTML=`<h3>${p.name}</h3>类型：${({rock:'岩石行星',gas:'气态巨行星',ice:'冰巨星'})[p.kind]}<br>
    大气：${i.atm}<br>温度：${i.temp} °C<br>重力：${i.g} g<br>资源：${i.res}<br>生命：<span class="v">${i.life}</span><br>
    ${isNew?`<span class="v">+${i.value} 信用点 · +${i.fuelGain} 燃料</span>`:'已记录'}`;
  c.classList.remove('hidden');clearTimeout(cardTimer);cardTimer=setTimeout(()=>c.classList.add('hidden'),7000);
}

// =====================================================================
// 目标 / 曲速
// =====================================================================
let target=null,warp=null;
function cycleTarget(){
  const list=systems.filter(s=>s.pos.distanceTo(ship.pos)>100).sort((a,b)=>a.pos.distanceTo(ship.pos)-b.pos.distanceTo(ship.pos)).slice(0,8);
  if(!list.length)return;
  const i=list.indexOf(target);target=list[(i+1)%list.length];
  toast(`目标：${target.name} · ${Math.round(target.pos.distanceTo(ship.pos))} u`);beep(880,.06);
}
const ARRIVE=90;
function warpCost(t){return Math.max(2,(t.pos.distanceTo(ship.pos)-ARRIVE)*.12)}
function toggleWarp(){
  if(warp){endWarp(false);return}
  if(!target){toast('先按 Tab 或在星图中选择目标恒星','warn');return}
  const d=target.pos.distanceTo(ship.pos);
  if(d<ARRIVE+30){toast('已在目标附近');return}
  const cost=warpCost(target);
  if(fuel<cost){toast(`燃料不足：需要 ${cost.toFixed(0)}，当前 ${fuel.toFixed(0)}。靠近恒星或扫描气态巨行星可补充`,'warn');return}
  fuel-=cost;warp={target,arrive:ARRIVE};beep(220,.5,'sawtooth',.04);toast(`曲速启动 → ${target.name}（-${cost.toFixed(0)} 燃料）`);
}
function endWarp(arrived){
  if(!warp)return;
  const fwd=new THREE.Vector3(0,0,-1).applyQuaternion(ship.quat);
  ship.vel.copy(fwd).multiplyScalar(arrived?20:Math.min(ship.vel.length(),maxSpeed()));
  if(arrived){toast(`抵达 ${warp.target.name}`,'good');beep(520,.2);if(target===warp.target)target=null}
  warp=null;
}

// =====================================================================
// 扫描
// =====================================================================
// ---------- 远程探测 ----------
const STAR_TYPES=['G 型黄矮星','F 型黄白星','K 型橙矮星','A 型蓝白星','M 型红矮星'];
const knows=s=>visited.has(s.i)||probed.has(s.i);
const probeCost=s=>Math.round(3+s.pos.distanceTo(ship.pos)/100);
function sysSummary(s){
  const ps=genPlanets(s),gas=ps.filter(p=>p.kind==='gas').length,lifeList=ps.filter(p=>p.info.life!=='无');
  let best='',bv=-1;for(const p of lifeList){const v=LIFE_BONUS[p.info.life]||0;if(v>bv){bv=v;best=p.info.life}}
  const unseen=ps.filter(p=>!discovered.has(p.id)),value=unseen.reduce((a,p)=>a+p.info.value,0);
  const R2=makeRng(s.seed+777),nb=s.i===0?1:R2.int(1,2);let bc=0;
  for(let k=0;k<nb;k++)if(!beaconsGot.has(s.i+':b'+k))bc++;
  const type=STAR_TYPES[Math.max(0,STAR_COLS.indexOf(s.color))],quest=frags<FRAG_N&&fragSys[frags]===s.i;
  return {type,n:ps.length,gas,life:lifeList.length,best,value,bc,quest,
    short:`${type} · 行星${ps.length} 气态${gas} 生命${lifeList.length} 信标${bc}${quest?' · ★先驱者信号':''}`,
    text:`${type} · 行星 ${ps.length}（气态 ${gas}）· 生命迹象 ${lifeList.length}${best?`（最高：${best}）`:''} · 未发现样本约 ${value} · 信标 ${bc}${quest?' · 检测到先驱者信号':''}`};
}
function probeTarget(){
  const t=target;
  if(!t||t.i<0){toast('请先选择一颗恒星作为目标（Tab 或星图）','warn');return}
  if(knows(t)){toast(`${t.name}：情报已掌握`);return}
  const cost=probeCost(t);
  if(fuel<cost){toast(`燃料不足：远程探测需要 ${cost}，当前 ${fuel.toFixed(0)}`,'warn');return}
  fuel-=cost;probed.add(t.i);
  [520,780].forEach((f,i)=>beep(f,.15,'sine',.05,i*.1));
  toast(`探测完成 ${t.name}：${sysSummary(t).short}`,'good');doSave();
}
let barKey='';
function renderMapBar(){
  const t=target,b=$('btnProbe');let txt,btn,dis;
  if(!t){txt='点击恒星设为目标';btn='远程探测 (R)';dis=true}
  else if(t.i<0){txt='目标：银心奇点';btn='远程探测 (R)';dis=true}
  else{
    const d=Math.round(t.pos.distanceTo(ship.pos));
    if(knows(t)){txt=`${t.name} · ${d} u · ${sysSummary(t).text}`;btn='情报已掌握';dis=true}
    else{txt=`${t.name} · ${d} u · 情报未知`;btn=`远程探测 R（-${probeCost(t)} 燃料）`;dis=fuel<probeCost(t)}
  }
  const key=txt+'|'+btn+'|'+dis;if(key===barKey)return;barKey=key;
  $('mapbarTxt').textContent=txt;b.textContent=btn;b.disabled=dis;
}

// ---------- 主线：银心信号 ----------
const BH_SYS={i:-1,name:'银心奇点',pos:new THREE.Vector3(0,0,0)};
const qV=new THREE.Vector3();
function setQuestTarget(){
  const n=frags<FRAG_N?systems[fragSys[frags]]:(bhDone?null:BH_SYS);
  target=(n&&n.pos.distanceTo(ship.pos)>(n.i>=0?260:150))?n:null;
}
function questText(){
  if(bhDone)return '主线已完成 · 自由探索';
  if(frags>=FRAG_N)return `主线 ${FRAG_N}/${FRAG_N}：前往银心奇点并扫描它（${Math.round(ship.pos.length())} u）`;
  const s=systems[fragSys[frags]],L=loaded.find(x=>x.sys===s),here=!!L&&s.pos.distanceTo(ship.pos)<220;
  if(fragKind(frags)==='planet'){
    const pn=s.name+' '+ROMAN[fragPlanetIdx(frags)];
    return here?`主线 ${frags}/${FRAG_N}：扫描 ${pn} 上的异常信号`
      :`主线 ${frags}/${FRAG_N}：前往 ${s.name}（${Math.round(s.pos.distanceTo(ship.pos))} u），扫描 ${pn} 上的异常信号`;
  }
  const sb=L&&L.beacons.find(x=>x.story);
  if(here&&sb)return `主线 ${frags}/${FRAG_N}：飞向青色信号碎片信标 ◈（${Math.round(qV.copy(sb.local).add(s.pos).distanceTo(ship.pos))} u）`;
  return `主线 ${frags}/${FRAG_N}：前往 ${s.name}（${Math.round(s.pos.distanceTo(ship.pos))} u），寻找信号碎片信标`;
}
function collectFragment(){
  const k=frags;frags++;credits+=200;
  [660,880,1100,1320].forEach((f,i)=>beep(f,.2,'triangle',.06,i*.08));
  const c=$('card');
  c.innerHTML=`<h3>信号碎片 ${frags}/${FRAG_N}</h3><span class="v">+200 信用点</span><br>${FRAG_TEXT[k]}`;
  c.classList.remove('hidden');clearTimeout(cardTimer);cardTimer=setTimeout(()=>c.classList.add('hidden'),12000);
  toast(frags>=FRAG_N?'七块碎片已集齐 —— 信号指向银心奇点':`信号碎片 ${frags}/${FRAG_N} · 新的坐标已标记`,'good');
  loaded.forEach(addStoryBeacon);   // 下一块碎片的星系若已加载，立即补建信标
  setQuestTarget();doSave();
}
function showEnding(){
  bhDone=true;credits+=5000;
  const m=Math.floor(playTime/60),s=Math.floor(playTime%60);
  $('endStats').innerHTML=`用时 ${m} 分 ${s} 秒 · 到访 ${visited.size}/${systems.length} 个恒星系 · 发现 ${discovered.size} 颗行星 · 信标 ${beaconsGot.size} 个<br>奖励 +5000 信用点`;
  [392,523,659,784,1047].forEach((f,i)=>beep(f,.5,'triangle',.06,i*.18));
  target=null;doSave();openPanel('ending');
}

let scanT=0,scanId=null,scanCand=null;
const BH_T={id:'bh',name:'银心奇点',effR:30,range:320};
function completeScan(c){
  if(c.id==='bh'){
    if(bhDone){toast('银心奇点：数据已记录');return}
    if(frags<FRAG_N){toast(`奇点深处传来微弱的回响……（信号碎片 ${frags}/${FRAG_N}）`,'warn');beep(120,.5,'sine',.06);return}
    showEnding();return;
  }
  const p=c.p,isNew=!discovered.has(p.id);
  if(isNew){
    discovered.add(p.id);credits+=p.info.value;fuel=Math.min(fuelMax(),fuel+p.info.fuelGain);
    toast(`发现 ${p.name} · +${p.info.value} 信用点`,'good');
    [660,880,1100].forEach((f,i)=>beep(f,.18,'triangle',.06,i*.09));doSave();
  }else beep(500,.1);
  showCard(p,isNew);
  // 主线：当前碎片对应的异常行星（即使之前已扫描过，再扫一次也能取得碎片）
  if(frags<FRAG_N&&fragKind(frags)==='planet'&&p.id===fragSys[frags]+':'+fragPlanetIdx(frags))collectFragment();
}

// =====================================================================
// 主更新
// =====================================================================
const tV=new THREE.Vector3(),tV2=new THREE.Vector3(),tV3=new THREE.Vector3(),tQ=new THREE.Quaternion(),
      tE=new THREE.Euler(),tM=new THREE.Matrix4(),inp=new THREE.Vector3();
let boostLock=false,saveTimer=0,wr=0,scooping=false;

function update(dt){
  // ---- 转向 ----
  const k=keys,rollIn=(k.KeyE?1:0)-(k.KeyQ?1:0),yawIn=(k.ArrowLeft?1:0)-(k.ArrowRight?1:0),pitchIn=(k.ArrowUp?1:0)-(k.ArrowDown?1:0);
  if(!warp){
    if(rollIn||yawIn||pitchIn){tE.set(pitchIn*1.2*dt,yawIn*1.4*dt,-rollIn*1.4*dt);tQ.setFromEuler(tE);ship.quat.multiply(tQ)}
    if(mouseDX||mouseDY){tE.set(-mouseDY*.0022,-mouseDX*.0022,0);tQ.setFromEuler(tE);ship.quat.multiply(tQ)}
  }
  mouseDX=mouseDY=0;ship.quat.normalize();

  // ---- 移动 ----
  if(warp){
    const t=warp.target;tV.copy(t.pos).sub(ship.pos);const dist=tV.length();tV.normalize();
    tM.lookAt(ship.pos,t.pos,UP);tQ.setFromRotationMatrix(tM);ship.quat.slerp(tQ,1-Math.exp(-dt*2.5));
    tV2.set(0,0,-1).applyQuaternion(ship.quat);
    const align=Math.max(0,tV2.dot(tV)),remaining=dist-warp.arrive;
    const tgt=Math.max(25,Math.min(900,remaining*1.1))*align*align,sp=ship.vel.length();
    const ns=lerp(sp,tgt,1-Math.exp(-dt*(tgt>sp?1.2:4)));
    ship.vel.copy(tV2).multiplyScalar(ns);
    if(remaining<4)endWarp(true);
    else if(k.KeyS)endWarp(false);
    energy=Math.min(energyMax(),energy+10*dt);
  }else{
    inp.set((k.KeyD?1:0)-(k.KeyA?1:0),(k.Space?1:0)-(k.KeyC?1:0),(k.KeyS?1:0)-(k.KeyW?1:0));
    const shift=k.ShiftLeft||k.ShiftRight;
    if(shift&&inp.lengthSq()===0)inp.set(0,0,-1);
    if(boostLock&&energy>25)boostLock=false;
    const boosting=shift&&energy>0&&!boostLock;
    if(boosting){energy-=28*dt;if(energy<=0){energy=0;boostLock=true}}
    else energy=Math.min(energyMax(),energy+(14+4*up.boost)*dt);
    const moving=inp.lengthSq()>0;
    if(moving)inp.normalize().multiplyScalar(maxSpeed()*(boosting?4:1)).applyQuaternion(ship.quat);
    ship.vel.lerp(inp,1-Math.exp(-dt*(moving?2.4:.8)));
  }
  ship.pos.addScaledVector(ship.vel,dt);
  const speed=ship.vel.length();wr=warp?speed/900:0;

  // ---- 尘埃 ----
  for(let i=0;i<DUST_N;i++){
    for(let a=0;a<3;a++){
      const c=a===0?ship.pos.x:a===1?ship.pos.y:ship.pos.z,v=dustPos[i*3+a];
      dustPos[i*3+a]=c+((((v-c+DUST_R)%(DUST_R*2))+DUST_R*2)%(DUST_R*2))-DUST_R;
    }
  }
  dustGeo.attributes.position.needsUpdate=true;

  // ---- 恒星系 ----
  updateLOD();
  bhDisk.rotation.z+=dt*.4;
  scooping=false;
  for(const L of loaded){
    // 最近的星系完整显示；若同时存在另一个星系，它只显示恒星和主线目标，避免轨道/行星互相重叠
    const full=L===cur;
    L.light.intensity=full?4:0;
    for(const o of L.orbits)o.visible=full;
    if(L.belt)L.belt.visible=full;
    for(const b of L.beacons)b.mesh.visible=full||!!b.story;
    for(const pl of L.planets){pl.show=full||isQuestPlanet(pl.p);pl.pivot.visible=pl.show}
    for(const pl of L.planets){
      pl.pivot.rotation.y+=dt*TAU/pl.p.period/6;pl.mesh.rotation.y+=dt*.4;
      for(const m of pl.moons)m.pivot.rotation.y+=dt*m.speed;
      if(!warp&&pl.show){
        pl.mesh.getWorldPosition(tV);tV2.copy(ship.pos).sub(tV);const rr=pl.p.radius+2.5,d=tV2.length();
        if(d<rr&&d>0){tV2.divideScalar(d);ship.pos.copy(tV).addScaledVector(tV2,rr);
          const vn=ship.vel.dot(tV2);if(vn<0)ship.vel.addScaledVector(tV2,-vn*1.2)}
      }
    }
    if(L.belt)L.belt.rotation.y+=dt*.03;
    L.star.rotation.y+=dt*.1;
    const sp=L.sys.pos,sd=ship.pos.distanceTo(sp),sr=L.sys.radius;
    if(!warp&&sd<sr*1.5+2){tV2.copy(ship.pos).sub(sp).normalize();ship.pos.copy(sp).addScaledVector(tV2,sr*1.5+2);
      const vn=ship.vel.dot(tV2);if(vn<0)ship.vel.addScaledVector(tV2,-vn*1.2)}
    if(sd<sr*4.5&&fuel<fuelMax()){fuel=Math.min(fuelMax(),fuel+6*dt);scooping=true}
    // 信标
    for(let i=L.beacons.length-1;i>=0;i--){
      const b=L.beacons[i];b.mesh.rotation.y+=dt*1.2;b.mesh.rotation.x+=dt*.6;
      tV.copy(b.local).add(sp);
      if(ship.pos.distanceTo(tV)<(b.pick||14)){
        const story=!!b.story;
        if(!story){
          beaconsGot.add(b.id);credits+=b.reward.credits;fuel=Math.min(fuelMax(),fuel+b.reward.fuel);
          toast(`信标：+${b.reward.credits} 信用点${b.reward.fuel?` · +${b.reward.fuel} 燃料`:''}`,'good');
          beep(990,.15,'square',.04);beep(1320,.2,'square',.04,.12);
        }
        L.group.remove(b.mesh);b.mesh.geometry.dispose();b.mesh.material.dispose();b.label.remove();
        L.beacons.splice(i,1);if(story)collectFragment();else doSave();
      }
    }
  }

  // ---- 扫描目标 ----
  tV3.set(0,0,-1).applyQuaternion(ship.quat);
  let cand=null,cd=1e9;
  const test=(id,pos,effR,range,obj)=>{
    tV.copy(pos).sub(ship.pos);const d=tV.length();if(d>range||d<.1)return;
    const ang=Math.acos(Math.min(1,tV.dot(tV3)/d)),angR=Math.asin(Math.min(1,effR/d));
    if(ang<Math.max(angR,.035)&&d<cd){cd=d;cand={id,d,...obj}}
  };
  if(!warp){
    for(const L of loaded)for(const pl of L.planets){if(!pl.show)continue;pl.mesh.getWorldPosition(tV2);test(pl.p.id,tV2,pl.p.radius*1.2+.5,scanRange(),{p:pl.p,name:pl.p.name})}
    test('bh',bh.position,BH_T.effR,BH_T.range,{name:BH_T.name});
  }
  scanCand=cand;
  const holding=(mouseHeld||k.KeyF)&&cand&&!paused();
  if(holding){
    if(scanId!==cand.id){scanId=cand.id;scanT=0}
    scanT+=dt/scanTime();
    if(scanT>=1){completeScan(cand);scanT=0;mouseHeld=false;keys.KeyF=false}
  }else{scanT=Math.max(0,scanT-dt*2);if(!cand)scanId=null}

  // ---- 摄像机 ----
  camera.position.copy(ship.pos);camera.quaternion.copy(ship.quat);
  const fovT=60+wr*38+(speed>maxSpeed()*1.5&&!warp?8:0);
  camera.fov=lerp(camera.fov,fovT,1-Math.exp(-dt*5));camera.updateProjectionMatrix();
  bloom.strength=.8+wr*.9;$('warpfx').style.opacity=Math.min(.8,wr*.9);

  playTime+=dt;saveTimer+=dt;if(saveTimer>5){saveTimer=0;doSave()}
}

// =====================================================================
// HUD
// =====================================================================
const projV=new THREE.Vector3(),fwdV=new THREE.Vector3();
function toScreen(pos){
  fwdV.set(0,0,-1).applyQuaternion(camera.quaternion);
  const behind=projV.copy(pos).sub(camera.position).dot(fwdV)<0;
  projV.copy(pos).project(camera);
  return {x:(projV.x*.5+.5)*innerWidth,y:(-projV.y*.5+.5)*innerHeight,behind};
}
function updateHUD(){
  $('credits').textContent=credits;$('discCount').textContent=discovered.size;$('bcCount').textContent=beaconsGot.size;
  $('fuelTxt').textContent=`${fuel.toFixed(0)}/${fuelMax()}`;$('fuelBar').firstElementChild.style.width=fuel/fuelMax()*100+'%';
  $('energyTxt').textContent=boostLock?'过热':`${energy.toFixed(0)}/${energyMax()}`;
  $('energyBar').firstElementChild.style.width=energy/energyMax()*100+'%';
  $('speedTxt').textContent=ship.vel.length().toFixed(0)+' u/s'+(warp?' · 曲速':'');
  $('sysName').textContent=cur&&cur.sys._d<220?cur.sys.name+' 星系':'深空';
  $('nearInfo').textContent=`最近恒星：${nearest.name} · ${Math.round(nearestDist)} u`;
  $('tgtInfo').textContent=target?`目标：${target.name} · ${Math.round(target.pos.distanceTo(ship.pos))} u · 曲速 -${warpCost(target).toFixed(0)} 燃料`:'目标：无（Tab 选择）';

  $('tgtProbe').textContent=target&&target.i>=0?(knows(target)?'情报：'+sysSummary(target).short:`情报：未知 · 按 R 远程探测（-${probeCost(target)} 燃料）`):'';
  $('quest').textContent=questText();

  // 准星
  const ret=$('reticle');ret.classList.toggle('hit',!!scanCand);
  $('ring').style.strokeDashoffset=163.4*(1-Math.min(1,scanT));

  // 提示
  let pr='';
  if(warp)pr=`曲速航行中 → ${warp.target.name}　<span class="k">S</span> / <span class="k">G</span> 取消`;
  else if(scanCand){
    const known=scanCand.p?discovered.has(scanCand.p.id):bhDone;
    pr=`${scanCand.name}　${Math.round(scanCand.d)} u${known?'（已记录）':''}<br>按住 <span class="k">鼠标左键</span> / <span class="k">F</span> 扫描`;
  }else if(scooping)pr='恒星采集中 · 燃料补充';
  else if(document.pointerLockElement!==renderer.domElement&&!openP)pr='点击画面以控制飞船';
  $('prompt').innerHTML=pr;

  // 行星标签
  for(const L of loaded){
    for(const pl of L.planets){
      pl.mesh.getWorldPosition(tV);const d=tV.distanceTo(ship.pos),s=toScreen(tV),known=discovered.has(pl.p.id);
      if(s.behind||d>450||warp||!pl.show){pl.label.style.display='none';continue}
      const sig=frags<FRAG_N&&fragKind(frags)==='planet'&&pl.p.id===fragSys[frags]+':'+fragPlanetIdx(frags);
      pl.label.style.display='block';pl.label.className=(known?'ok ':'')+(sig?'st':'');
      pl.label.style.transform=`translate(${s.x}px,${s.y+pl.p.radius*620/d+10}px) translate(-50%,0)`;
      pl.label.innerHTML=(known?`${pl.p.name}<br>${Math.round(d)} u`:`未知天体<br>${Math.round(d)} u`)+(sig?'<br>◇ 异常信号':'');
    }
    for(const b of L.beacons){
      tV.copy(b.local).add(L.sys.pos);const d=tV.distanceTo(ship.pos),s=toScreen(tV);
      if(s.behind||d>500||warp||!b.mesh.visible){b.label.style.display='none';continue}
      b.label.style.display='block';b.label.style.transform=`translate(${s.x}px,${s.y+16}px) translate(-50%,0)`;
      b.label.innerHTML=(b.story?'◈ 信号碎片':'◈ 信号信标')+`<br>${Math.round(d)} u`;
    }
  }
  // 主线信标指引：即使在屏幕外也会在边缘显示方向，避免找不到
  const bm=$('bmark');let sbPos=null;
  for(const L of loaded){const b=L.beacons.find(x=>x.story);if(b){sbPos=qV.copy(b.local).add(L.sys.pos);break}}
  if(sbPos&&!warp){
    const dB=sbPos.distanceTo(ship.pos),s=toScreen(sbPos);let x=s.x,y=s.y;
    if(s.behind){x=innerWidth-x;y=innerHeight-y}
    const m=48;x=Math.max(m,Math.min(innerWidth-m,x));y=Math.max(m,Math.min(innerHeight-m,y));
    if(s.behind){x=x<innerWidth/2?m:innerWidth-m}
    bm.classList.remove('hidden');bm.style.transform=`translate(${x}px,${y}px) translate(-50%,-50%)`;
    $('bmarkTxt').textContent=`信号碎片 ${Math.round(dB)}u`;
  }else bm.classList.add('hidden');
  // 目标标记
  const tm=$('tmark');
  if(target){
    const s=toScreen(target.pos);let x=s.x,y=s.y;
    if(s.behind){x=innerWidth-x;y=innerHeight-y}
    const m=40;x=Math.max(m,Math.min(innerWidth-m,x));y=Math.max(m,Math.min(innerHeight-m,y));
    if(s.behind){x=x<innerWidth/2?m:innerWidth-m}
    tm.classList.remove('hidden');tm.style.transform=`translate(${x}px,${y}px) translate(-50%,-50%)`;
    $('tmarkTxt').textContent=`${target.name} ${Math.round(target.pos.distanceTo(ship.pos))}u`;
  }else tm.classList.add('hidden');
}

// =====================================================================
// 面板：日志 / 升级 / 星图
// =====================================================================
function renderJournal(){
  const ids=[...discovered].sort((a,b)=>{const [s1,p1]=a.split(':').map(Number),[s2,p2]=b.split(':').map(Number);return s1-s2||p1-p2});
  let total=0;
  const rows=ids.map(id=>{
    const [si,pi]=id.split(':').map(Number),p=genPlanets(systems[si])[pi];total+=p.info.value;
    return `<tr><td>${p.name}</td><td>${({rock:'岩石',gas:'气态',ice:'冰巨'})[p.kind]}</td><td>${p.info.atm}</td><td>${p.info.temp}°C</td><td>${p.info.res}</td><td>${p.info.life}</td><td>${p.info.value}</td></tr>`}).join('');
  const story=`<h3 style="margin:0 0 6px;color:var(--c2)">主线 · 银心信号 ${frags}/${FRAG_N}${bhDone?' · 已完成':''}</h3>`+
    (frags?'<ol style="opacity:.85;line-height:1.7;margin:0 0 12px;padding-left:20px">'+FRAG_TEXT.slice(0,frags).map(t=>`<li>${t}</li>`).join('')+'</ol>':'<p>尚未获得信号碎片。</p>');
  $('jbody').innerHTML=story+`<p>已发现行星 <b>${ids.length}</b> 颗 · 到访恒星系 <b>${visited.size}/${systems.length}</b> · 信标 <b>${beaconsGot.size}</b> · 银心奇点 ${bhDone?'✔':'未扫描'} · 累计样本价值 <b style="color:var(--c2)">${total}</b></p>
   ${ids.length?`<table><tr><th>名称</th><th>类型</th><th>大气</th><th>温度</th><th>资源</th><th>生命</th><th>价值</th></tr>${rows}</table>`:'<p>还没有发现。飞近行星、瞄准并按住鼠标左键扫描。</p>'}`;
}
const UPG=[
  {k:'engine',name:'引擎',desc:l=>`巡航速度 ${30+10*l} u/s`},
  {k:'tank',name:'燃料舱',desc:l=>`燃料上限 ${100+40*l}`},
  {k:'scanner',name:'扫描仪',desc:l=>`扫描距离 ${90+30*l} u · 耗时 ${Math.max(1,3-.4*l).toFixed(1)} s`},
  {k:'boost',name:'推进器',desc:l=>`能量上限 ${100+30*l} · 回复更快`},
];
const upCost=k=>Math.round(120*Math.pow(up[k]+1,2));
function renderUpg(){
  $('upgCr').textContent=credits;
  $('ubody').innerHTML='<table>'+UPG.map(u=>{
    const l=up[u.k],max=l>=5;
    return `<tr><td>${u.name}</td><td class="pips">${'■'.repeat(l)+'□'.repeat(5-l)}</td><td>${u.desc(l)}${max?'':` → ${u.desc(l+1)}`}</td>
      <td><button data-k="${u.k}" ${max||credits<upCost(u.k)?'disabled':''}>${max?'已满级':'升级 '+upCost(u.k)}</button></td></tr>`}).join('')+'</table>';
  $('ubody').querySelectorAll('button[data-k]').forEach(b=>b.onclick=()=>{
    const k=b.dataset.k,c=upCost(k);if(credits<c||up[k]>=5)return;
    credits-=c;up[k]++;if(k==='tank')fuel=Math.min(fuelMax(),fuel+40);beep(740,.15,'triangle');doSave();renderUpg();});
}

const mapc=$('mapc'),tip=$('maptip');let mapS=1,mapCX=0,mapCY=0,mapHover=null;
const mx=x=>mapCX+x*mapS,my=z=>mapCY+z*mapS;
function drawMap(){
  const W=mapc.width=innerWidth,H=mapc.height=innerHeight,g=mapc.getContext('2d');
  mapS=Math.min(W,H)*.44/(GR*1.05);mapCX=W/2;mapCY=H/2;
  g.fillStyle='rgba(140,170,255,.22)';
  for(let i=0;i<GAL.pos.length;i+=36)g.fillRect(mx(GAL.pos[i]),my(GAL.pos[i+2]),1.3,1.3);
  g.fillStyle='#ffb060';g.beginPath();g.arc(mx(0),my(0),5,0,TAU);g.fill();
  if(target){g.strokeStyle='rgba(255,210,122,.5)';g.setLineDash([5,5]);g.beginPath();
    g.moveTo(mx(ship.pos.x),my(ship.pos.z));g.lineTo(mx(target.pos.x),my(target.pos.z));g.stroke();g.setLineDash([])}
  for(const s of systems){
    const v=visited.has(s.i),pb=!v&&probed.has(s.i),x=mx(s.pos.x),y=my(s.pos.z);
    g.fillStyle=v?'#7fd4ff':pb?'#c9a8ff':'#7a8499';g.beginPath();g.arc(x,y,v?4:pb?3.4:2.6,0,TAU);g.fill();
    if(v||pb){
      const sm=sysSummary(s);
      if(sm.life){g.fillStyle='#9dff9d';g.beginPath();g.arc(x+7,y-4,2.2,0,TAU);g.fill()}
      if(sm.gas){g.fillStyle='#ff9d5c';g.beginPath();g.arc(x+7,y+3,2.2,0,TAU);g.fill()}
      if(sm.bc){g.fillStyle='#ffe27a';g.beginPath();g.arc(x-7,y-4,2.2,0,TAU);g.fill()}
    }
    if(s===target||s===mapHover){g.strokeStyle='#ffd27a';g.lineWidth=1.5;g.beginPath();g.arc(x,y,9,0,TAU);g.stroke()}
    if(s.i===0){g.fillStyle='#ffd27a';g.font='12px monospace';g.fillText('H',x+7,y-6)}
    if(frags<FRAG_N&&s.i===fragSys[frags]){g.fillStyle='#ffd27a';g.font='16px monospace';g.fillText('★',x-7,y-9)}
  }
  if((frags>=FRAG_N&&!bhDone)||(target&&target.i===-1)){
    g.strokeStyle='#ffd27a';g.lineWidth=1.5;g.beginPath();g.arc(mx(0),my(0),11,0,TAU);g.stroke();
    g.fillStyle='#ffd27a';g.font='12px monospace';g.fillText('银心奇点',mx(0)+14,my(0)+4);
  }
  // 玩家
  const fwd=new THREE.Vector3(0,0,-1).applyQuaternion(ship.quat),px=mx(ship.pos.x),py=my(ship.pos.z),a=Math.atan2(fwd.z,fwd.x);
  g.save();g.translate(px,py);g.rotate(a);g.fillStyle='#9dff9d';g.beginPath();g.moveTo(9,0);g.lineTo(-6,5);g.lineTo(-6,-5);g.closePath();g.fill();g.restore();
  renderMapBar();
}
function mapHit(e){
  let best=null,bd=14;
  for(const s of systems){const d=Math.hypot(mx(s.pos.x)-e.clientX,my(s.pos.z)-e.clientY);if(d<bd){bd=d;best=s}}
  return best;
}
mapc.addEventListener('mousemove',e=>{
  mapHover=mapHit(e);
  if(mapHover){const s=mapHover,d=s.pos.distanceTo(ship.pos),kn=knows(s);
    tip.style.display='block';tip.style.left=e.clientX+14+'px';tip.style.top=e.clientY+14+'px';
    let info='未知 · 选中后可远程探测';
    if(kn){const sm=sysSummary(s),n=genPlanets(s).filter(p=>discovered.has(p.id)).length;
      info=`${sm.type}<br>行星 ${n}/${sm.n} 已发现 · 气态 ${sm.gas} · 生命迹象 ${sm.life}${sm.best?`（${sm.best}）`:''}<br>未发现样本约 ${sm.value} · 信标 ${sm.bc}${sm.quest?'<br>★ 检测到先驱者信号':''}`}
    tip.innerHTML=`<b>${s.name}</b>${visited.has(s.i)?' · 已到访':probed.has(s.i)?' · 已探测':''}<br>距离 ${Math.round(d)} u · 曲速 -${Math.max(2,(d-ARRIVE)*.12).toFixed(0)} 燃料<br>${info}`}
  else tip.style.display='none';
});
mapc.addEventListener('click',e=>{const s=mapHit(e);if(s){target=s;toast('目标：'+s.name);beep(880,.06)}});

// =====================================================================
// 开始 / 循环
// =====================================================================
$('ver').textContent='v'+VERSION;
$('saveHint').textContent=save?`检测到存档：${discovered.size} 颗行星 · ${credits} 信用点 · seed ${seed}`:`seed ${seed}`;
$('btnStart').textContent=save?'继续探险':'开始探险';
$('btnStart').onclick=()=>{
  running=true;$('start').classList.add('hidden');$('hud').classList.remove('hidden');
  renderer.domElement.requestPointerLock?.();beep(440,.1);
  setQuestTarget();
  if(!save){
    toast(`主线：${systems[0].name} ${ROMAN[fragPlanetIdx(0)]} 检测到异常信号——飞近它，瞄准并按住左键扫描`,'good');
    setTimeout(()=>toast('Tab 选目标 · G 曲速跳跃 · 按住左键扫描'),1500);
  }
};
$('btnEndClose').onclick=()=>closePanel();
$('btnProbe').onclick=probeTarget;
$('btnNew').onclick=()=>{try{localStorage.removeItem(SAVE_KEY)}catch{};location.search='?seed='+Math.floor(Math.random()*1e6)};
addEventListener('beforeunload',doSave);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight)});

camera.position.copy(ship.pos);camera.quaternion.copy(ship.quat);
const clock=new THREE.Clock();
function frame(){
  requestAnimationFrame(frame);
  const dt=Math.min(clock.getDelta(),.05);
  if(running&&!paused()){update(dt);updateHUD()}
  else if(!running){ // 开始界面：缓慢环视
    tQ.setFromEuler(tE.set(0,dt*.04,0));ship.quat.multiply(tQ);camera.quaternion.copy(ship.quat);updateLOD();
  }
  if(openP==='map')drawMap();
  if(bloomOn)composer.render();else renderer.render(scene,camera);
}
updateLOD();frame();
