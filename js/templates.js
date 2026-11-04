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
const FIGS = { star2: figStar2, star3: figStar3 };

// ---------- 知识介绍弹窗 ----------
/** 双星 / 三星：带示意图的排版 */
export function knowRich(K) {
  return FIGS[K.fig](T.know.figs[K.fig]) + `<div class="kbody"><h2>📖 ${K.title}</h2><div class="ktag">${K.tag}</div>
    <div class="kchips">${K.chips.map(c => `<span class="kchip">${c}</span>`).join('')}</div>` +
    K.sec.map(([ico, h, p, cls]) => `<div class="ksec ${cls || ''}"><div class="kico">${ico}</div><div><h4>${h}</h4><p>${p}</p></div></div>`).join('') +
    `<div class="kfoot"><span class="hint">${T.ui.closeHint}</span><button id="knowOk2">${T.ui.gotIt}</button></div></div>`;
}
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
  const rows = d.planets.map(p => `<tr><td>${p.name}</td><td>${J.kinds[p.kind]}</td><td>${p.info.atm}</td><td>${p.info.temp}°C</td><td>${p.info.res}</td><td>${p.info.life}</td><td>${p.info.value}</td></tr>`).join('');
  return story + `<p>${J.summary(d.planets.length, d.visited, d.systems, d.beacons, d.bhDone, d.value)}</p>
   ${d.planets.length ? `<table><tr>${J.head.map(h => `<th>${h}</th>`).join('')}</tr>${rows}</table>` : `<p>${J.empty}</p>`}`;
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
