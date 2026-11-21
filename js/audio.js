// 简单的合成音效（无需音频文件）
let actx;
export function beep(f=660,d=.12,type='sine',v=.05,delay=0){
  try{actx??=new AudioContext();const o=actx.createOscillator(),g=actx.createGain(),t=actx.currentTime+delay;
    o.type=type;o.frequency.value=f;g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.0001,t+d);
    o.connect(g);g.connect(actx.destination);o.start(t);o.stop(t+d)}catch{}}

// 带起音的单音（比 beep 更柔和，避免开头“啪”一声），供多音合成的音效使用
function tone(f,d,{type='triangle',v=.05,delay=0,attack=.012,detune=0}={}){
  try{actx??=new AudioContext();if(actx.state==='suspended')actx.resume();
    const t=actx.currentTime+delay,o=actx.createOscillator(),g=actx.createGain();
    o.type=type;o.frequency.value=f;o.detune.value=detune;
    g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(v,t+attack);g.gain.exponentialRampToValueAtTime(.0001,t+d);
    o.connect(g);g.connect(actx.destination);o.start(t);o.stop(t+d+.02)}catch{}}

// 晋升号角（恭喜的感觉）：上行琶音 → 明亮的 C 大调和弦（带低音和轻微失谐的厚度）→ 高音“闪光”点缀
// level = 新军衔序号（1 起）：军衔越高，琶音越长、闪光越多，仪式感逐级加强
export function fanfare(level=1){
  const n=Math.min(2,Math.max(0,level-1)),step=.085;
  const run=[523.25,659.25,783.99,1046.5,1318.5,1568].slice(0,4+n);        // C5 E5 G5 C6 (+E6 +G6)
  run.forEach((f,i)=>{tone(f,.3,{v:.05,delay:i*step});tone(f*2,.2,{type:'sine',v:.014,delay:i*step})});
  const t0=run.length*step+.03,hold=1.2+.15*n;
  [523.25,659.25,783.99,1046.5,1318.5].forEach((f,i)=>{                    // 和弦：两层略微失谐，听起来更饱满
    tone(f,hold,{v:.032,delay:t0,detune:-5,attack:.02});
    tone(f,hold,{type:'sine',v:.026,delay:t0,detune:5,attack:.02})});
  tone(261.63,hold+.2,{type:'sine',v:.06,delay:t0,attack:.02});            // 低音 C4，托住整个和弦
  [2093,2637,3136,2637,3520].slice(0,3+n).forEach((f,i)=>tone(f,.28,{type:'sine',v:.013,delay:t0+.12+i*.09}))}   // 闪光
