// 贴图与点云工具
import * as THREE from 'three';
import { mulberry32 } from './rng.js';

function softTexture(){
  const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');
  const gr=g.createRadialGradient(64,64,0,64,64,64);
  gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.3,'rgba(255,255,255,.35)');gr.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=gr;g.fillRect(0,0,128,128);return new THREE.CanvasTexture(c)}
export const soft=softTexture();
export function planetTexture(p){
  const rng=mulberry32(p.seed),W=512,H=256,c=document.createElement('canvas');c.width=W;c.height=H;
  const g=c.getContext('2d'),[A,B]=p.palette.map(v=>v.map(x=>Math.round(x*255)));
  g.fillStyle=`rgb(${A})`;g.fillRect(0,0,W,H);
  if(p.kind==='rock'){
    for(let i=0;i<900;i++){const m=rng();g.fillStyle=`rgba(${m<.5?A:B},${.08+rng()*.18})`;
      g.beginPath();g.arc(rng()*W,rng()*H,2+rng()*22,0,7);g.fill()}
  }else{
    let y=0;while(y<H){const h=4+rng()*20,m=rng();
      g.fillStyle=`rgba(${m<.5?A:B},${.35+rng()*.5})`;g.fillRect(0,y,W,h);y+=h}
    for(let i=0;i<120;i++){g.fillStyle=`rgba(255,255,255,${rng()*.08})`;
      g.beginPath();g.ellipse(rng()*W,rng()*H,10+rng()*40,2+rng()*5,0,0,7);g.fill()}
  }
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t}
export function pointCloud(d, size, opacity = 1, fadeNear = 0, atten = true) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(d.pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(d.col, 3));
  const mat = new THREE.PointsMaterial({
    size, map: soft, vertexColors: true, transparent: true,
    opacity, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: atten
  });
  if (fadeNear > 0) {
    mat.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader
        .replace('void main() {', 'varying float vDist;\nvoid main() {')
        .replace('#include <project_vertex>', '#include <project_vertex>\n  vDist = -mvPosition.z;');
      sh.fragmentShader = sh.fragmentShader
        .replace('void main() {', 'varying float vDist;\nvoid main() {')
        .replace('#include <alphatest_fragment>',
          '#include <alphatest_fragment>\n  diffuseColor.a *= smoothstep(' + fadeNear.toFixed(1) + ', ' + (fadeNear * 2.5).toFixed(1) + ', vDist);');
    };
  }
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false; return pts;
}