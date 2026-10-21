// 可复现的伪随机数：同一个种子永远生成同一个宇宙
import { TAU } from './constants.js';

export function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
export function makeRng(seed){
  const r = mulberry32(seed);
  return {rand:r,
    uni:(a,b)=>a+(b-a)*r(), int:(a,b)=>a+Math.floor(r()*(b-a+1)),
    gauss:(m=0,s=1)=>m+s*Math.sqrt(-2*Math.log(1-r()))*Math.cos(TAU*r()),
    pick:arr=>arr[Math.floor(r()*arr.length)]};
}
export const lerp=(a,b,t)=>a+(b-a)*t;
