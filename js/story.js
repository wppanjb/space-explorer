// 主线「银心信号」：碎片所在星系的生成规则
import { makeRng } from './rng.js';
import { FRAG_N, GR } from './constants.js';

// 主线碎片：从母星系出发，逐步向银心推进（偶数序号=扫描异常行星，奇数序号=寻找信标）
export function genFragments(seed, systems){
  // R = 伪随机数生成器，bands = 每个碎片的目标半径，used = 已选星系索引集合，out = 已选星系索引列表
  const K=GR/1400;   // 银河相对原版的放大倍数：目标半径、「太近 / 太远」的距离都按它缩放
  const R=makeRng(seed+4242),bands = [365, 608, 496, 400, 304, 224, 160].map(b=>b*K),used=new Set([0]),out=[];
  for(let k=0;k<FRAG_N;k++){
    const prev=k===0?systems[0].pos:systems[out[k-1]].pos;
    let best=null,bs=1e9;
    for(const s of systems){
      if(used.has(s.i))continue;
      const r=Math.hypot(s.pos.x,s.pos.z),dp=s.pos.distanceTo(prev);
      const score=Math.abs(r-bands[k])+(dp<90*K?200:0)+(dp>450*K?dp-450*K:0)+R.uni(0,25*K);
      if(score<bs){bs=score;best=s}
    }
    used.add(best.i);out.push(best.i);
  }
  return out;
}
export const fragKind=k=>k%2===0?'planet':'beacon';
