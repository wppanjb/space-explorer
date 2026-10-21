// 简单的合成音效（无需音频文件）
let actx;
export function beep(f=660,d=.12,type='sine',v=.05,delay=0){
  try{actx??=new AudioContext();const o=actx.createOscillator(),g=actx.createGain(),t=actx.currentTime+delay;
    o.type=type;o.frequency.value=f;g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.0001,t+d);
    o.connect(g);g.connect(actx.destination);o.start(t);o.stop(t+d)}catch{}}
