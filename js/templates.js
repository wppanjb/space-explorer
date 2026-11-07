// =====================================================================
// templates.js —— 界面里所有 HTML 片段（面板、弹窗、教学框、示意图……）
// 想调整「结构」（比如多加一行、换个标签）改这里；
// 想改文字内容 → text.js；想改外观（颜色、间距、字号）→ css/components.css。
// 这里的函数只负责「把数据拼成 HTML」，不读取游戏状态，数据都由 main.js 传进来。
// =====================================================================
import { T } from './text.js';

// ---------- 小零件 ----------
/** 把文字里的 {Tab} 渲染成键帽样式 */
export const kbd = s => s.replace(/\{([^{}]+)\}/g, '<span class="k">$1</span>');
/** 教学里的小标签：完成 = 高亮打勾，未完成 = 半透明 */
export const chip = (done, txt) => done ? `<span class="k c-nw">✔ ${txt}</span>` : `<span class="c-todo c-nw">${txt}</span>`;
const para = msg => `<p>${msg}</p>`;

// ---------- 知识介绍：双星 / 三星示意图（SVG） ----------
const figStar2 = L => `<svg class="kfig" viewBox="0 0 360 150" preserveAspectRatio="xMidYMid slice">
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
  <text x="180" y="108" fill="#9fb4d6" font-size="9" text-anchor="middle">${L.center}</text>
  <text x="350" y="138" fill="#7fd4ff" font-size="10" text-anchor="end">${L.band}</text>
</svg>`;
const figStar3 = L => `<svg class="kfig" viewBox="0 0 360 150" preserveAspectRatio="xMidYMid slice">
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
  <text x="310" y="108" fill="#ffb59a" font-size="9" text-anchor="middle">${L.far}</text>
  <text x="110" y="140" fill="#9fb4d6" font-size="9" text-anchor="middle">${L.pair}</text>
  <text x="168" y="22" fill="#7fd4ff" font-size="10">${L.zone}</text>
</svg>`;
const figRedDwarf = L => `<svg class="kfig" viewBox="0 0 360 150" preserveAspectRatio="xMidYMid slice">
  <defs><radialGradient id="gS"><stop offset="0" stop-color="#fffbe8"/><stop offset=".6" stop-color="#ffd27a"/><stop offset="1" stop-color="#ffb04a"/></radialGradient></defs>
  <circle cx="105" cy="68" r="46" fill="url(#gS)"/>
  <circle cx="255" cy="68" r="26" fill="#ff6a4a" opacity=".18"/><circle cx="255" cy="68" r="15" fill="#ff6a4a"/>
  <text x="105" y="136" fill="#9fb4d6" font-size="10" text-anchor="middle">${L.sun}</text><text x="255" y="136" fill="#ff9a86" font-size="10" text-anchor="middle">${L.rd}</text></svg>`;
const figRedGiant = L => `<svg class="kfig" viewBox="0 0 360 150" preserveAspectRatio="xMidYMid slice">
  <defs><radialGradient id="gG"><stop offset="0" stop-color="#ffd8a0"/><stop offset=".55" stop-color="#ff9a52"/><stop offset="1" stop-color="#d9482a"/></radialGradient></defs>
  <circle cx="82" cy="68" r="9" fill="#ffd27a"/>
  <circle cx="240" cy="68" r="66" fill="#ff7a3a" opacity=".16"/><circle cx="240" cy="68" r="58" fill="url(#gG)"/>
  <text x="82" y="136" fill="#9fb4d6" font-size="10" text-anchor="middle">${L.sun}</text><text x="240" y="142" fill="#ffae86" font-size="10" text-anchor="middle">${L.rg}</text></svg>`;
const figCompact = L => `<svg class="kfig" viewBox="0 0 360 150" preserveAspectRatio="xMidYMid slice">
  <circle cx="30" cy="75" r="26" fill="#ffd27a" opacity=".2"/><circle cx="30" cy="75" r="12" fill="#ffd27a"/>
  <line x1="238" y1="30" x2="238" y2="120" stroke="#7fd4ff" stroke-opacity=".5" stroke-dasharray="3 4"/>
  <line x1="40" y1="75" x2="350" y2="75" stroke="#7fd4ff" stroke-opacity=".14"/>
  ${[0, 1, 2, 3, 4, 5, 6].map(i => `<circle cx="${68 + i * 24}" cy="75" r="${3 + (i * 7 % 5) * .7}" fill="${['#c9a074', '#6fb6e8', '#9aa7bd', '#c9a074', '#6fb6e8', '#d8b27a', '#9aa7bd'][i]}"/>`).join('')}
  <text x="238" y="24" fill="#7fd4ff" font-size="9" text-anchor="middle">${L.mercury}</text><text x="130" y="112" fill="#9fb4d6" font-size="9.5" text-anchor="middle">${L.band}</text></svg>`;

// ---------- 知识库示意图：行星类别 / A 型星（SVG，不含文字的部分写死，文字来自 T.know.figs） ----------
const svgOpen = '<svg class="kfig" viewBox="0 0 360 150" preserveAspectRatio="xMidYMid slice">';
const lab = (x, y, t, c = '#9fb4d6', a = 'middle') => `<text x="${x}" y="${y}" fill="${c}" font-size="9.5" text-anchor="${a}">${t}</text>`;
const figBlue = L => svgOpen + `<defs><radialGradient id="gAs"><stop offset="0" stop-color="#ffffff"/><stop offset=".4" stop-color="#bcd6ff"/><stop offset="1" stop-color="#7fb0ff" stop-opacity="0"/></radialGradient></defs>
  <circle cx="86" cy="68" r="22" fill="#ffb04a" opacity=".35"/><circle cx="86" cy="68" r="11" fill="#ffd27a"/>
  <circle cx="246" cy="68" r="62" fill="url(#gAs)"/><circle cx="246" cy="68" r="27" fill="#e4efff"/>
  ${lab(86, 124, L.sun)}${lab(246, 124, L.a, '#bcd6ff')}${lab(86, 138, L.sunT, '#7f8fae')}${lab(246, 138, L.aT, '#7f9fd0')}</svg>`;
const figRock = L => svgOpen + `<defs><radialGradient id="rE"><stop offset="0" stop-color="#5aa0e8"/><stop offset="1" stop-color="#1f4a8a"/></radialGradient></defs>
  <circle cx="70" cy="66" r="13" fill="#9a948c"/><circle cx="66" cy="62" r="2.4" fill="#7c766f"/><circle cx="75" cy="70" r="1.8" fill="#7c766f"/>
  <circle cx="180" cy="66" r="26" fill="url(#rE)"/><path d="M170 58c6-4 12-2 14 4s-4 8-10 6-8-6-4-10zM188 72c5-2 9 1 8 5s-6 4-9 2z" fill="#58a868"/>
  <circle cx="288" cy="66" r="17" fill="#c9623a"/><circle cx="283" cy="61" r="2.6" fill="#a24a2a"/><circle cx="293" cy="71" r="2" fill="#a24a2a"/>
  ${lab(70, 118, L.l1)}${lab(180, 118, L.l2)}${lab(288, 118, L.l3)}</svg>`;
const figGas = L => svgOpen + `<defs><clipPath id="cJ"><circle cx="110" cy="70" r="46"/></clipPath></defs>
  <circle cx="110" cy="70" r="46" fill="#d9b48a"/><g clip-path="url(#cJ)">${[[40,10,'#b9895e'],[56,8,'#f0dcc0'],[72,12,'#b9895e'],[90,9,'#ecd2ae']].map(([y,h,c]) => `<rect x="60" y="${y}" width="100" height="${h}" fill="${c}" opacity=".85"/>`).join('')}</g>
  <ellipse cx="116" cy="82" rx="9" ry="5.5" fill="#c4553a" opacity=".85"/>
  <circle cx="262" cy="70" r="30" fill="#ead9a8"/><ellipse cx="262" cy="70" rx="56" ry="13" fill="none" stroke="#d8c690" stroke-width="5" opacity=".8" transform="rotate(-14 262 70)"/>
  ${lab(110, 134, L.l1)}${lab(262, 134, L.l2)}</svg>`;
const figIce = L => svgOpen + `<circle cx="100" cy="70" r="34" fill="#82d6dd"/><circle cx="100" cy="70" r="22" fill="none" stroke="#fff" stroke-opacity=".35" stroke-dasharray="2 3"/><circle cx="100" cy="70" r="10" fill="none" stroke="#fff" stroke-opacity=".35" stroke-dasharray="2 3"/>
  <circle cx="240" cy="70" r="33" fill="#4a6fe0"/><ellipse cx="240" cy="62" rx="30" ry="3" fill="#fff" opacity=".25"/>
  ${lab(100, 124, L.l1)}${lab(240, 124, L.l2)}${lab(170, 22, L.layers, '#9fe0e8')}</svg>`;
const figHotJ = L => svgOpen + `<defs><radialGradient id="gHs"><stop offset="0" stop-color="#fff2c8"/><stop offset=".45" stop-color="#ffb04a"/><stop offset="1" stop-color="#ff8a3a" stop-opacity="0"/></radialGradient><radialGradient id="gHp"><stop offset="0" stop-color="#ffd8a0"/><stop offset="1" stop-color="#c9682a"/></radialGradient></defs>
  <circle cx="10" cy="68" r="62" fill="url(#gHs)"/><circle cx="10" cy="68" r="26" fill="#ffd27a"/>
  <circle cx="10" cy="68" r="86" fill="none" stroke="#7fd4ff" stroke-opacity=".3" stroke-dasharray="3 5"/>
  <circle cx="96" cy="68" r="19" fill="#ff7a3a" opacity=".25"/><circle cx="96" cy="68" r="14" fill="url(#gHp)"/>
  <line x1="318" y1="30" x2="318" y2="112" stroke="#7fd4ff" stroke-opacity=".5" stroke-dasharray="3 4"/>
  ${lab(96, 108, L.hj, '#ffb59a')}${lab(318, 24, L.mercury, '#7fd4ff')}${lab(200, 138, L.arrow, '#9fb4d6')}</svg>`;
const figLava = L => svgOpen + `<defs><radialGradient id="gLv"><stop offset="0" stop-color="#5a3a32"/><stop offset="1" stop-color="#1e1412"/></radialGradient><filter id="fLv" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
  <circle cx="180" cy="68" r="62" fill="#ff5a2a" opacity=".12"/><circle cx="180" cy="68" r="50" fill="url(#gLv)"/>
  <g fill="none" stroke="#ff7a2a" stroke-width="2.2" stroke-linecap="round" filter="url(#fLv)"><path d="M150 52l12 8-4 12 14 6"/><path d="M176 40l6 14 16 4-2 16 12 8"/><path d="M160 90l14-6 6 12"/><path d="M204 52l10-4"/></g>
  ${lab(180, 136, L.l1, '#ffae86')}</svg>`;
const figOcean = L => svgOpen + `<defs><radialGradient id="gOc"><stop offset="0" stop-color="#6ab8ff"/><stop offset="1" stop-color="#173f86"/></radialGradient></defs>
  <circle cx="150" cy="68" r="50" fill="url(#gOc)"/>
  <g fill="none" stroke="#d8efff" stroke-opacity=".55" stroke-linecap="round"><path d="M118 54q8-5 16 0t16 0 16 0"/><path d="M112 72q8-5 16 0t16 0 16 0 16 0"/><path d="M122 90q8-5 16 0t16 0 16 0"/></g>
  <rect x="246" y="26" width="26" height="84" rx="3" fill="url(#gOc)" opacity=".9"/><rect x="246" y="26" width="26" height="8" fill="#d8efff" opacity=".55"/>
  ${lab(150, 136, L.l1, '#9fd0ff')}${lab(259, 124, L.depth, '#9fd0ff')}</svg>`;
const figSuper = L => svgOpen + `<circle cx="60" cy="74" r="14" fill="#3f7fcf"/><circle cx="150" cy="74" r="24" fill="#c98a5a"/><circle cx="268" cy="74" r="50" fill="#4a6fe0" opacity=".9"/>
  ${lab(60, 124, L.l1)}${lab(150, 124, L.l2, '#e6b88c')}${lab(268, 138, L.l3, '#9fb4ff')}</svg>`;

/** 恒星类型示意图：左边一颗该类型的恒星，右边是 M K G F A 的温度色带，当前类型高亮 */
const SPEC = [['M', '#ff9a6a'], ['K', '#ffb866'], ['G', '#ffe08a'], ['F', '#fff3cf'], ['A', '#cfe2ff']];
const figSpec = (cls, col, r) => L => svgOpen + `<defs><radialGradient id="gSp${cls}"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="${col}"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient></defs>
  <circle cx="66" cy="66" r="${r * 2.3}" fill="url(#gSp${cls})"/><circle cx="66" cy="66" r="${r}" fill="${col}"/>
  ${SPEC.map(([c, cc], i) => `<rect x="${140 + i * 42}" y="${c === cls ? 50 : 56}" width="38" height="${c === cls ? 32 : 20}" rx="3" fill="${cc}" opacity="${c === cls ? 1 : .45}"/><text x="${159 + i * 42}" y="${c === cls ? 71 : 70}" fill="#1a1f2e" font-size="12" font-weight="bold" text-anchor="middle">${c}</text>`).join('')}
  ${lab(66, 118, L.cur, col)}${lab(250, 104, L.range, '#9fb4d6')}${lab(160, 40, L.cool, '#7f8fae', 'start')}${lab(340, 40, L.hot, '#7f8fae', 'end')}</svg>`;

// ---------- 现象类示意图：小行星带 / 行星环与卫星 / 恒星耀斑 / 黑洞 ----------
const figBelt = L => svgOpen + `<ellipse cx="180" cy="76" rx="150" ry="52" fill="none" stroke="#7fd4ff" stroke-opacity=".2"/><ellipse cx="180" cy="76" rx="68" ry="24" fill="none" stroke="#7fd4ff" stroke-opacity=".2"/>
  ${Array.from({ length: 150 }, (_, i) => { const a = i * 2.399, r = 96 + ((i * 37) % 22) - 3; return `<rect x="${(180 + Math.cos(a) * r).toFixed(1)}" y="${(76 + Math.sin(a) * r * .36).toFixed(1)}" width="${i % 7 ? 1.6 : 2.6}" height="${i % 7 ? 1.6 : 2.6}" fill="#c2b8a6" opacity="${(.35 + (i % 5) * .13).toFixed(2)}"/>` }).join('')}
  <circle cx="180" cy="76" r="9" fill="#ffd27a"/><circle cx="180" cy="76" r="18" fill="#ffd27a" opacity=".2"/>
  <circle cx="248" cy="76" r="4" fill="#c9623a"/><circle cx="318" cy="76" r="9" fill="#d9b48a"/>
  ${lab(248, 62, L.mars, '#c9623a')}${lab(180, 144, L.belt, '#c2b8a6')}${lab(318, 62, L.jup, '#d9b48a')}</svg>`;
const figRing = L => svgOpen + `<circle cx="130" cy="74" r="28" fill="#ead9a8"/><ellipse cx="130" cy="74" rx="78" ry="16" fill="none" stroke="#d8c690" stroke-width="7" opacity=".8" transform="rotate(-12 130 74)"/><ellipse cx="130" cy="74" rx="62" ry="12" fill="none" stroke="#bda878" stroke-width="3" opacity=".7" transform="rotate(-12 130 74)"/>
  <circle cx="258" cy="46" r="6" fill="#d9c9a0"/><circle cx="296" cy="84" r="4" fill="#b9b2a4"/><circle cx="238" cy="104" r="3" fill="#9aa7bd"/><circle cx="322" cy="52" r="2.4" fill="#9aa7bd"/>
  ${lab(130, 128, L.ring, '#d8c690')}${lab(280, 128, L.moons, '#b9c4d8')}</svg>`;
const figFlare = L => svgOpen + `<defs><radialGradient id="gFl"><stop offset="0" stop-color="#fff2c8"/><stop offset=".5" stop-color="#ffb04a"/><stop offset="1" stop-color="#ff7a2a"/></radialGradient><radialGradient id="gFb"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#ff8a3a" stop-opacity="0"/></radialGradient></defs>
  <circle cx="110" cy="150" r="96" fill="url(#gFl)"/><g fill="none" stroke="#ff8a3a" stroke-width="3" stroke-linecap="round"><path d="M70 70q-14-38 22-44" /><path d="M130 58q10-40 46-34"/></g>
  <path d="M96 56Q150 -10 240 24" fill="none" stroke="#ffc86a" stroke-width="5" stroke-linecap="round" opacity=".9"/><circle cx="240" cy="24" r="18" fill="url(#gFb)"/>
  <circle cx="312" cy="96" r="6" fill="#4a8ae0"/><path d="M240 24L300 90" stroke="#ffd27a" stroke-opacity=".5" stroke-dasharray="3 5"/>
  ${lab(200, 138, L.star, '#ffb04a')}${lab(312, 118, L.ship, '#9fd0ff')}</svg>`;
const figBH = L => svgOpen + `<defs><radialGradient id="gBd" cx=".5" cy=".5" r=".5"><stop offset=".25" stop-color="#fff2c8"/><stop offset=".55" stop-color="#ff9a3a"/><stop offset="1" stop-color="#ff5a2a" stop-opacity="0"/></radialGradient></defs>
  <ellipse cx="180" cy="76" rx="120" ry="26" fill="url(#gBd)" opacity=".85"/><circle cx="180" cy="76" r="26" fill="none" stroke="#ffd9a0" stroke-opacity=".35" stroke-width="3"/><circle cx="180" cy="76" r="20" fill="#000"/>
  <path d="M60 76a120 26 0 0 1 240 0" fill="none" stroke="#ffb04a" stroke-opacity=".5" stroke-width="2"/>
  ${lab(180, 126, L.horizon, '#c9d6ee')}${lab(70, 40, L.disk, '#ffb04a')}${lab(180, 20, L.tide, '#ff9a8a')}</svg>`;
const FIGS = { star2: figStar2, star3: figStar3, cat_redDwarf: figRedDwarf, cat_redGiant: figRedGiant, cat_compact: figCompact, star_blue: figBlue, star_G: figSpec('G', '#ffd27a', 14), star_F: figSpec('F', '#fff2c8', 16), star_K: figSpec('K', '#ffae6a', 11), kind_rock: figRock, kind_gas: figGas, kind_ice: figIce, cat_hotJupiter: figHotJ, cat_lava: figLava, cat_ocean: figOcean, cat_superEarth: figSuper, belt: figBelt, ringMoon: figRing, flare: figFlare, blackhole: figBH };

// ---------- 知识介绍弹窗 ----------
/** 双星 / 三星：带示意图的排版 */
const SC = ['#ffd27a', '#fff2c8', '#ffae6a', '#bcd6ff', '#ff7a5a'];   // 示意图里恒星的颜色（对应 STAR_COLS 的序号）
/** 真实星系的轨道示意图：恒星在左，行星按轨道远近（对数比例）排开，绿色带是估算的宜居带。f = { star, star2, planets: [{ l, au, re, t, padded }] } */
export function orbitFig(f) {
  const L = T.know.figs.sys, W = 360, H = 150, cy = 78, st = f.star, lum = st.r ** 2 * (st.teff / 5772) ** 4, hzIn = .95 * Math.sqrt(lum), hzOut = 1.67 * Math.sqrt(lum);
  const aus = f.planets.map(p => p.au), lo = Math.log10(Math.min(...aus, hzIn) * .6), hi = Math.log10(Math.max(...aus, hzOut) * 1.4), X = a => 78 + (Math.log10(a) - lo) / (hi - lo) * (W - 96);
  const rs = Math.min(14, 5 + 4 * Math.sqrt(st.r)), col = SC[st.col] || SC[0];
  let s = `<svg class="kfig" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">` +
    `<rect x="${X(hzIn).toFixed(1)}" y="26" width="${Math.max(3, X(hzOut) - X(hzIn)).toFixed(1)}" height="${H - 52}" fill="rgba(127,224,160,.13)" stroke="rgba(127,224,160,.4)" stroke-dasharray="3 3"/>` +
    `<text x="${((X(hzIn) + X(hzOut)) / 2).toFixed(1)}" y="20" fill="#7fe0a0" font-size="9" text-anchor="middle">${L.hz}</text><line x1="0" y1="${cy}" x2="${W}" y2="${cy}" stroke="rgba(127,212,255,.15)"/>` +
    `<circle cx="22" cy="${cy}" r="${rs * 2.1}" fill="${col}" opacity=".22"/><circle cx="22" cy="${cy}" r="${rs}" fill="${col}"/>`;
  if (f.star2) s += `<circle cx="${22 + rs + 8}" cy="${cy - 12}" r="${Math.min(10, 4 + 4 * Math.sqrt(f.star2.r))}" fill="${SC[f.star2.col]}"/>`;
  for (const p of f.planets) {
    const cx = X(p.au), r = Math.min(12, 2.6 + Math.sqrt(p.re) * 1.7), c = p.re > 6 ? '#d8b27a' : p.t > 900 ? '#ff7a3a' : p.t > 330 ? '#c9a074' : p.t > 200 ? '#6fb6e8' : '#9aa7bd';
    s += p.padded ? `<circle cx="${cx.toFixed(1)}" cy="${cy}" r="${r.toFixed(1)}" fill="none" stroke="${c}" stroke-dasharray="2 2"/>` : `<circle cx="${cx.toFixed(1)}" cy="${cy}" r="${r.toFixed(1)}" fill="${c}"/>`;
    s += `<text x="${cx.toFixed(1)}" y="${(cy + r + 12).toFixed(1)}" fill="#b8c7e0" font-size="10" text-anchor="middle">${p.l}</text>`;
  }
  return s + `<text x="${W - 6}" y="${H - 6}" fill="#6f7f9c" font-size="8.5" text-anchor="end">${L.note}</text></svg>`;
}
/** 弹窗里的「系统补充块」：放在通用介绍的第一节后面。K = 系统条目（含 chips、short） */
export const sysBlock = K => `<div class="c-sysblock"><div class="ktag">${T.know.sysUi.tag}</div><h3>${T.know.sysUi.head(K.title)}</h3><div class="kchips">${K.chips.map(c => `<span class="kchip">${c}</span>`).join('')}</div><p>${K.short}</p><div class="hint">${T.know.sysUi.more}</div></div>`;
export function knowRich(K, lib = false, sup = '') {
  const secs = K.sec.map(([ico, h, p, cls]) => `<div class="ksec ${cls || ''}"><div class="kico">${ico}</div><div><h4>${h}</h4><p>${p}</p></div></div>`);
  if (sup) secs.splice(1, 0, sup);   // 补充块放在第一节（"这是什么"）后面
  return (K.figHtml ?? FIGS[K.fig](T.know.figs[K.fig])) + `<div class="kbody"><h2>📖 ${K.title}</h2><div class="ktag">${K.tag}</div>
    <div class="kchips">${K.chips.map(c => `<span class="kchip">${c}</span>`).join('')}</div>` +
    secs.join('') + (K.src ? `<div class="c-ksrc">${T.know.sysUi.srcHead}${K.src}</div>` : '') +
    (lib ? '' : `<div class="kfoot"><span class="hint">${T.ui.closeHint}</span><button id="knowOk2">${T.ui.gotIt}</button></div>`) + '</div>';
}
/** 知识库里的详情：和弹窗同样的排版，但没有「知道了」按钮 */
export const knowDetail = K => K.sec ? knowRich(K, true) : `${K.fig ? FIGS[K.fig](T.know.figs[K.fig]) : ''}<div class="kbody"><h2>📖 ${K.title}</h2>${K.body}</div>`;
/** 知识库面板。d = { groups: [{ name, items: [{ key, title, isNew }] }], cur, detail, count } */
export const libHtml = d => `<div class="c-lib"><div class="c-lib-list"><div class="c-lib-count">${T.lib.title} · ${T.lib.count(d.count)}</div>` +
  d.groups.map(g => `<h3>${g.name}</h3>` + g.items.map(i => `<div class="c-lib-it${i.key === d.cur ? ' on' : ''}" data-key="${i.key}"><span>${i.title}</span>${i.isNew ? `<b class="c-lib-new">${T.lib.newTag}</b>` : ''}</div>`).join('')).join('') +
  `</div><div class="c-lib-detail">${d.count ? d.detail : `<p class="c-lib-empty">${T.lib.empty}</p>`}</div></div><p class="hint c-lib-hint">${T.lib.hint}</p>`;
/** 没有示意图的简单排版 */
export const knowPlain = K => `<h2>📖 ${K.title}</h2>${K.body}<div class="row c-mt12"><button id="knowOk">${T.ui.gotIt}</button></div><p class="hint">${T.ui.closeHint}</p>`;
/** 第一次扫描某类行星时，叠在卡片图片下方的介绍（「知道了」按钮放在最后一段末尾） */
export const kindNoteHtml = K => `<div class="kinfo"><b>${K.title}</b>${K.body.replace(/<\/p>\s*$/, `<button id="cardOk">${T.ui.gotIt}</button></p>`)}</div>`;

// ---------- 晋升通知 ----------
const BADGE_COL = ['', '#d6945a', '#c9d3e6', '#ffd27a', '#7fe0ff', '#fff0b8'];   // 初级铜、中级银、高级金、资深青、特级亮金
/** HUD 军衔旁的星星：初级 1 颗 … 特级 5 颗，实习生没有 */
export const rankStars = r => r > 0 ? `<span class="c-stars" style="color:${BADGE_COL[r]}">${'★'.repeat(r)}</span> ` : '';
const starPts = (cx, cy, R) => Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? R * .42 : R; return (cx + Math.cos(a) * rr).toFixed(1) + ',' + (cy + Math.sin(a) * rr).toFixed(1) }).join(' ');
/** n 颗星徽章：初级 1、中级 2、高级 3、资深 4、特级 5 */
function badgesSvg(n) {
  const col = BADGE_COL[n], gap = 50, x0 = 180 - (n - 1) * gap / 2;
  const stars = Array.from({ length: n }, (_, i) => `<g class="pbadge" style="animation-delay:${(.15 + i * .18).toFixed(2)}s"><polygon points="${starPts(x0 + i * gap, 58, 22)}" fill="${col}" stroke="#fff" stroke-opacity=".7" stroke-width="1.2" stroke-linejoin="round" filter="url(#pglow)"/></g>`).join('');
  return `<svg class="kfig" viewBox="0 0 360 116" preserveAspectRatio="xMidYMid slice"><defs>
    <radialGradient id="pbg" cx="50%" cy="55%" r="60%"><stop offset="0" stop-color="${col}" stop-opacity=".32"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient>
    <filter id="pglow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <rect width="360" height="116" fill="url(#pbg)"/>
    <path d="M24 96 H336" stroke="${col}" stroke-opacity=".35"/><path d="M60 102 H300" stroke="${col}" stroke-opacity=".2"/>${stars}</svg>`;
}
/** d = { rank, rankName, nextName, xp, need（下一级所需累计经验，最高级为 0）, lo（本级起点经验）, sysXp } */
export function promoHtml(d) {
  const r = d.rank, col = BADGE_COL[r], pct = d.need ? Math.min(100, d.xp / d.need * 100) : 100;
  const ico = (l, i) => /须知|通告/.test(l) ? '⚠️' : i === 0 ? '🎖️' : '📡';
  return badgesSvg(r) + `<div class="kbody c-promo" style="--col:${col};--col-glow:${col}66;--col-fill:${col}99">
    <div class="ktag c-promo-tag">${T.promo.title}</div>
    <h2 class="c-promo-rank">${d.rankName}</h2>
    <div class="c-promo-xp"><span>${T.promo.xpLine(d.xp, d.need)}</span><span>${d.need ? T.promo.nextRank(d.nextName) : T.promo.maxRank}</span></div>
    <div class="c-promo-bar"><i style="width:${pct.toFixed(0)}%"></i></div>
    ${T.promo.paras[r].map((l, i) => `<div class="ksec"><div class="kico">${ico(l, i)}</div><div><p>${l}</p></div></div>`).join('')}
    <div class="ksec tip"><div class="kico">📈</div><div><h4>${T.promo.howTitle(d.need, d.nextName)}</h4><p>${T.promo.howBody(d.sysXp)}</p></div></div>
    <div class="kfoot"><span class="hint">${T.ui.closeHint}</span><button>${T.ui.cont}</button></div></div>`;
}

// ---------- 卡片 / 信号碎片弹窗（屏幕中央） ----------
/** 行星卡片图 + （可选）介绍 + 奖励行 */
export const cardPop = (src, note, footer) => `<div class="cardpop"><img src="${src}">${note}</div>${footer}`;
/** 信号碎片：标题 + 奖励 + 正文 */
export const fragPop = (title, reward, text) => `<div class="fragpop"><h3>${title}</h3><span class="v">${reward}</span><br><br>${text}</div>`;
/** 碎片和卡片同时出现时，两者之间的分隔线 */
export const popSep = '<hr class="c-sep">';
export const cardReward = (value, fuel) => `<span class="v">${T.cards.reward(value, fuel)}</span>`;

// ---------- 行星收藏 ----------
export const optionHtml = (value, label) => `<option value="${value}">${label}</option>`;
export const cardImgHtml = (src, alt) => `<img src="${src}" alt="${alt}">`;
export const emptyHtml = para;

// ---------- 新手教学 ----------
export const tutBox = (stageName, i, n, body) => `<small>${T.tut.title} · ${stageName}${n > 1 ? T.tut.stepOf(i, n) : ''}</small><br>${body}`;
export const tutFinished = () => kbd(T.tut.finished);
/** 第 1 阶段：moveDone 与 T.tut.moves 一一对应 */
export function tutMoves(lookDone, moveDone) {
  const c = T.tut.moves.map(([n, k], i) => chip(moveDone[i], `${n} ${k}`));
  return `${T.tut.tryAll}<br>${[chip(lookDone, T.tut.look), ...c.slice(0, 4)].join(' · ')}<br>${c.slice(4).join(' · ')}`;
}
/** 第 2 阶段：done 与 T.tut.scanChips 一一对应 */
export const tutScan = done => `${T.tut.tryAll}<br>${T.tut.scanChips.map(([, txt], i) => chip(done[i], txt)).join(' · ')}`;
/** 第 3 阶段：done 与 T.tut.galaxyActs 一一对应 */
/** 第 3 阶段：done 与 T.tut.galaxyActs 一一对应 */
export function tutGalaxy(done) {
  const c = T.tut.galaxyActs.map(([, txt], i) => chip(done[i], txt));
  return `${T.tut.galaxyIntro}<br>${T.tut.galaxyTry}<br>${c.slice(0, 3).join(' · ')}<br>${c.slice(3).join(' · ')}<br><small class="c-note">${T.tut.galaxyNote}</small>`;
}
export const tutUpgrade = () => kbd(T.tut.upgrade);
/** 第 5 阶段：四类信标的对照表 */
export function tutBeacon() {
  const B = T.tut.beacon;
  return `${B.intro}
    <table class="c-btbl">
      <tr class="head"><td>${B.head[0]}</td><td>${B.head[1]}</td></tr>
      ${B.rows.map(([type, name, reward]) => `<tr><td class="c-sig-${type}">${name}</td><td>${reward}</td></tr>`).join('')}
    </table>
    ${B.outro}<br>
    ${kbd(B.cont)}`;
}

// ---------- 日志 ----------
/** d = { locked, frags, total, bhDone, fragTexts（已解锁的碎片文字）, planets, visited, systems, beacons, value } */
export function journalHtml(d) {
  const J = T.journal;
  const story = d.locked
    ? `<h3 class="c-h3">${J.storyLockedTitle}</h3><p>${J.storyLocked}</p>`
    : `<h3 class="c-h3">${J.storyTitle(d.frags, d.total, d.bhDone)}</h3>` + (d.frags ? `<ol class="c-list">${d.fragTexts.map(t => `<li>${t}</li>`).join('')}</ol>` : `<p>${J.storyNone}</p>`);
  const rows = d.planets.map(p => `<tr><td>${p.name}${p.real && !p.home ? ` <span class="c-real${p.padded ? ' c-guess' : ''}">${p.padded ? J.guess : J.real}</span>` : ''}</td><td>${J.kinds[p.kind]}</td><td>${p.info.atm}</td><td>${p.info.temp}°C</td><td>${p.info.res}</td><td>${p.info.life}</td><td>${p.info.value}</td></tr>`).join('');
  const vis = d.reals.filter(r => r.visited);
  const real = d.reals.length ? `<h3 class="c-h3">${J.realTitle(vis.length, d.reals.length)}</h3><p class="c-dim7">${J.tagLegend}</p>` +
    (vis.length ? `<table><tr>${J.realHead.map(h => `<th>${h}</th>`).join('')}</tr>${vis.map(r => `<tr><td>${r.name}</td><td>${J.ly(r.ly)}</td><td>${r.spec}</td><td>${r.cat}</td><td>${r.found}/${r.total}</td></tr>`).join('')}</table>` : `<p>${J.realNone}</p>`) : '';
  return story + `<p>${J.summary(d.planets.length, d.visited, d.systems, d.beacons, d.bhDone, d.value)}</p>
   ${d.planets.length ? `<table><tr>${J.head.map(h => `<th>${h}</th>`).join('')}</tr>${rows}</table>` : `<p>${J.empty}</p>`}` + real;
}

// ---------- 货舱 / 升级 ----------
/** rows = [{ name, n, label（可使用时的按钮文字，否则 null）, disabled, price }] */
export const cargoHtml = rows => rows.length ? '<table>' + rows.map(r =>
  `<tr><td>${r.name}</td><td>×${r.n}</td><td>${r.label ? `<button data-u="${r.name}" ${r.disabled ? 'disabled' : ''}>${r.label}</button>` : `<span class="c-dim">${T.cargo.sellOnly}</span>`}</td>
      <td><button data-r="${r.name}">${T.cargo.sell(r.price)}</button></td></tr>`).join('') + '</table>' : para(T.cargo.empty);
/** rows = [{ k, name, level, max, descNow, descNext, mat, have, need, cargoFull, can, cost }] */
export const upgHtml = rows => '<table>' + rows.map(r =>
  `<tr><td>${r.name}</td><td class="pips">${'■'.repeat(r.level) + '□'.repeat(5 - r.level)}</td><td>${r.descNow}${r.max ? '' : ` → ${r.descNext}`}</td>
      <td>${r.max ? '' : `<span class="${r.have >= r.need ? 'c-ok' : 'c-bad'}">${r.mat} ${r.have}/${r.need}</span>${r.have < r.need && r.cargoFull ? ` <span class="c-dim7">${T.upg.cargoFull}</span>` : ''}`}</td>
      <td><button data-k="${r.k}" ${r.max || !r.can ? 'disabled' : ''}>${r.max ? T.upg.maxed : T.upg.buy(r.cost)}</button></td></tr>`).join('') + '</table>';
