// 主线「银心信号」：碎片所在星系的生成规则
import { makeRng } from './rng.js';
import { FRAG_N } from './constants.js';

// 主线碎片：从母星系出发，逐步向银心推进（偶数序号=扫描异常行星，奇数序号=寻找信标）
export function genFragments(seed, systems){
  const R=makeRng(seed+4242),bands=[228,380,310,250,190,140,100],used=new Set([0]),out=[0];
  for(let k=1;k<FRAG_N;k++){
    const prev=systems[out[k-1]].pos;let best=null,bs=1e9;
    for(const s of systems){
      if(used.has(s.i))continue;
      const r=Math.hypot(s.pos.x,s.pos.z),dp=s.pos.distanceTo(prev);
      const score=Math.abs(r-bands[k])+(dp<90?200:0)+(dp>320?dp-320:0)+R.uni(0,25);
      if(score<bs){bs=score;best=s}
    }
    used.add(best.i);out.push(best.i);
  }
  return out;
}
export const fragKind=k=>k%2===0?'planet':'beacon';
