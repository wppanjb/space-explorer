// 程序化宇宙生成：星系、背景星、星云、恒星系、行星（纯函数，不依赖游戏状态）
import * as THREE from 'three';
import { TAU, GR, HOME_POS, ROMAN, STAR_COLS, LIFE_BONUS } from './constants.js';
import { makeRng, lerp } from './rng.js';

const SYL = ["ae","ky","or","ven","ta","lu","xi","ra","mo","zen","thal","is","ur","no","va","kar","el","dra"];

export function genGalaxy(R,n=45000,arms=4,spin=4.2){
  const pos=new Float32Array(n*3),col=new Float32Array(n*3),core=[1,.82,.55],edge=[.45,.65,1];
  for(let i=0;i<n;i++){
    let x,y,z,t;
    if(R.rand()<.18){
      const r=Math.abs(R.gauss(0,45)),th=R.uni(0,TAU),ph=Math.acos(R.uni(-1,1));
      x=r*Math.sin(ph)*Math.cos(th);y=r*Math.cos(ph)*.55;z=r*Math.sin(ph)*Math.sin(th);t=0;
    }else{
      const r=GR*Math.pow(R.rand(),.72);t=r/GR;
      const ang=t*spin+(i%arms)*TAU/arms+R.gauss(0,.28*(1-.5*t));
      x=Math.cos(ang)*r;z=Math.sin(ang)*r;y=R.gauss(0,7)*(1-t*.6);
    }
    const b=R.uni(.55,1);
    let c=[0,1,2].map(k=>lerp(core[k],edge[k],Math.min(1,t*1.3))*b);
    if(t>.2&&R.rand()<.05)c=[b,.4*b,.65*b];
    pos.set([x,y,z],i*3);col.set(c,i*3);
  }
  return {pos,col};
}
export function genBackground(R,n=7000){
  const pos=new Float32Array(n*3),col=new Float32Array(n*3),tints=[[1,1,1],[.8,.88,1],[1,.9,.75]];
  for(let i=0;i<n;i++){
    const v=[R.gauss(),R.gauss(),R.gauss()],m=Math.hypot(...v)||1,d=R.uni(4000,6000),b=R.uni(.4,1);
    pos.set(v.map(a=>a/m*d),i*3);col.set(R.pick(tints).map(c=>c*b),i*3);
  }
  return {pos,col};
}
export function genNebulae(R,count=14){
  const pal=[[.9,.25,.55],[.3,.45,1],[.55,.3,.95],[.2,.85,.8],[1,.55,.25]],out=[];
  for(let i=0;i<count;i++){
    const r=GR*R.uni(.2,1.1),a=R.uni(0,TAU),cx=Math.cos(a)*r,cy=R.gauss(0,20),cz=Math.sin(a)*r,color=R.pick(pal);
    for(let j=0;j<26;j++)out.push({p:[cx+R.gauss(0,38),cy+R.gauss(0,14),cz+R.gauss(0,38)],
      s:R.uni(50,150),c:color.map(v=>Math.min(1,v*R.uni(.8,1.15))),o:R.uni(.05,.14)});
  }
  return out;
}
export function genSystems(R,gal,count=64){
  const list=[],names=new Set();
  const mk=(pos,home)=>{
    let name;
    do{const n=R.int(2,3);name='';for(let k=0;k<n;k++)name+=R.pick(SYL);
      name=name[0].toUpperCase()+name.slice(1)+'-'+R.int(100,999)}while(names.has(name));
    if(home)name='Helios-001';
    names.add(name);
    list.push({i:list.length,name,pos:new THREE.Vector3(...pos),seed:R.int(1,1e9),
      color:R.pick(STAR_COLS),radius:R.uni(5.5,9),nPlanets:home?7:R.int(3,8)});
  };
  mk(HOME_POS,true);
  const N=gal.pos.length/3;
  for(let tries=0;list.length<count&&tries<4000;tries++){
    const k=R.int(0,N-1),x=gal.pos[k*3],y=gal.pos[k*3+1],z=gal.pos[k*3+2],r=Math.hypot(x,z);
    if(r<80||r>GR*.95)continue;
    const p=new THREE.Vector3(x,y*.3,z);
    if(list.some(s=>s.pos.distanceTo(p)<45))continue;
    mk([x,y*.3,z],false);
  }
  return list;
}

function genInfo(p,R){
  let atm,res,life='无',temp=Math.round(190-p.dist*2.8+R.gauss(0,45));
  if(p.kind==='ice')temp-=60;
  if(p.kind==='rock'){
    atm=R.pick(['无','稀薄','浓厚','浓厚','有毒','宜居','宜居']);
    res=R.pick(['金属矿','稀土','水冰','晶体','硅酸盐']);
    const hab=temp>-30&&temp<70&&(atm==='宜居'||atm==='浓厚');
    if(hab&&R.rand()<.75){const L=R.rand();life=L<.5?'微生物':L<.8?'植物':L<.95?'动物':'文明遗迹'}
  }else if(p.kind==='gas'){
    atm='浓厚（氢氦）';res=R.pick(['氢气','氦-3','氨']);if(R.rand()<.06)life='漂浮微生物';
  }else{atm=R.pick(['稀薄','无']);res=R.pick(['水冰','甲烷冰','氨冰'])}
  const g=+(.25+p.radius*(p.kind==='rock'?.38:.22)).toFixed(2);
  let value=50+Math.round(p.radius*12)+(LIFE_BONUS[life]||0);
  if(res==='晶体'||res==='稀土'||res==='氦-3')value+=100;
  if(atm==='宜居')value+=100;
  return {atm,temp,g,res,life,value,fuelGain:p.kind==='gas'?25:10};
}
const planetCache={};
export function genPlanets(sys){
  if(planetCache[sys.i])return planetCache[sys.i];
  const R=makeRng(sys.seed),planets=[];let dist=16;
  for(let i=0;i<sys.nPlanets;i++){
    dist+=R.uni(9,17);
    const kind=dist<55?'rock':R.pick(['gas','gas','ice']);
    let radius,pal;
    if(kind==='rock'){radius=R.uni(1,2.2);
      pal=R.pick([[[.6,.4,.3],[.8,.6,.4]],[[.3,.5,.8],[.3,.7,.4]],[[.55,.55,.55],[.75,.72,.7]]])}
    else if(kind==='gas'){radius=R.uni(3.5,6);
      pal=R.pick([[[.85,.65,.4],[.95,.85,.65]],[[.7,.55,.4],[.9,.8,.6]]])}
    else{radius=R.uni(2.4,3.8);
      pal=R.pick([[[.4,.7,.9],[.6,.85,1]],[[.3,.45,.85],[.5,.65,.95]]])}
    const p={idx:i,id:sys.i+':'+i,name:sys.name+' '+ROMAN[i],kind,radius,dist,
      period:Math.pow(dist,1.5)*.06,phase:R.uni(0,TAU),palette:pal,
      ring:kind==='gas'&&R.rand()<.55,moons:kind==='rock'?R.int(0,1):R.int(0,3),
      tilt:R.uni(-.4,.4),seed:R.int(1,1e6)};
    p.info=genInfo(p,R);planets.push(p);
  }
  return planetCache[sys.i]=planets;
}
