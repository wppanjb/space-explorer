// =====================================================================
// text.js —— 游戏里所有会显示给玩家的文字（提示、教学、任务、知识介绍、晋升通知……）
// 只想改文案？改这个文件就够了，不用碰 main.js。
//
// 写法说明：
//   · 固定文字：直接写字符串。
//   · 带数据的文字：写成函数，参数就是要填进去的数据，例如 (name, d) => `目标：${name} · ${d} u`。
//     改文案时只动中文部分，别动 ${...} 里的内容；没必要的参数也可以不用。
//   · {W} 这种花括号会被渲染成键帽样式（如  按 {Tab} 切换 → 按 [Tab] 切换）。
//   · <b>…</b>、<br> 可以直接用；排版（样式）在 css/components.css 里改。
// 资源名称（金属矿、氢气……）、行星大气/生命类型等是在 universe.js 里生成的数据，不在这里。
// 剧情碎片的文字（FRAG_TEXT）在 constants.js。
// =====================================================================

export const T = {

  // ---------- 通用按钮 / 提示 ----------
  ui: {
    gotIt: '知道了',
    cont: '继续',
    closeHint: 'Enter / Space / Esc 关闭',
    pointerLock: '点击画面以控制飞船',
    scooping: '恒星采集中 · 燃料补充',
  },

  // ---------- 开始界面 / 版本 ----------
  start: {
    saveFound: (n, cr, seed) => `检测到存档：${n} 颗行星 · ${cr} 信用点 · seed ${seed}`,
    seedOnly: seed => `seed ${seed}`,
    btnContinue: '继续探险',
    btnNew: '开始探险',
  },

  // ---------- 军衔 ----------
  rankNames: ['太空探索实习生', '初级探索员', '中级探索员', '高级探索员', '资深探索员', '特级资深探索员'],
  rank: {
    hud: (name, xp, need) => `${name} · 经验 ${xp}${need ? '/' + need : ''}`,
    welcome: sysName => `欢迎加入，实习生。先完成训练：扫描 ${sysName} 的全部行星`,
    demoted: (from, to, xp) => `军衔下降：${from} → ${to} · 经验降至 ${xp}`,
    xpDropped: xp => `经验降至 ${xp}`,
  },

  // ---------- 晋升通知（弹窗） ----------
  // 下标 = 晋升后的军衔：1 初级、2 中级、3 高级、4 资深、5 特级。每一项是若干段文字。
  // 含「须知」「通告」的段落会显示 ⚠️ 图标
  promo: {
    title: '任命通知',
    maxRank: '最高军衔',
    nextRank: name => `下一级：${name}`,
    xpLine: (xp, need) => `经验 ${xp}${need ? ' / ' + need : ''}`,
    howTitle: (need, nextName) => need ? `晋升考核：累计 ${need} 经验，可晋升「${nextName}」` : '你已是最高军衔',
    howBody: sysXp => `首次扫描行星 +10 · 拾取信标 +5 · 完成星系 +${sysXp} · 收集碎片 +50`,
    paras: [null,
      ['训练评定：合格。你正式成为探索员。', '<b>首项任务</b>：先驱者的信号碎片散落在银河各处。第一块的坐标已发送到你的星图（★），前往查明它的来源。', '<b>外勤须知</b>：正式外勤不再有训练保护。恒星耀斑、小行星带与高速撞击都会损伤船体，请时刻留意船体状态。'],
      ['外勤记录获得认可，你晋升为中级探索员。', '<b>新指令</b>：第二处先驱者信号已解析，坐标已更新到你的星图，请继续追踪。'],
      ['你已证明自己可以独当一面，晋升为高级探索员。', '<b>新指令</b>：第三、第四处信号的坐标已解析。线索开始指向银河深处，请依次追踪。'],
      ['你的名字已列入资深探索员名册。', '<b>新指令</b>：最后三处信号（第五至第七）的坐标已全部解析，它们都将引向银河中心。请完成追踪。'],
      ['你获得最高军衔：特级资深探索员。', '<b>最终指令</b>：七块碎片拼合出的坐标，指向银心奇点。前往那里，扫描它。', '<b>风险通告</b>：奇点附近的引力潮汐会持续撕扯船体。出发前请补满船体和燃料。'],
    ],
  },

  // ---------- 主线任务（HUD 左上角那一行） ----------
  quest: {
    training: (sysName, n, total) => `【训练】扫描 ${sysName} 的全部行星（${n}/${total}），完成后正式授衔`,
    done: '【任务完成】你解读了先驱者的信号 · 星海任你探索',
    standbyFinal: (rankName, xp, need) => `【待命】七块碎片已汇合，银心的坐标已解出。晋升「${rankName}」后授权前往（经验 ${xp}/${need}）`,
    standbyNext: (n, rankName, xp, need) => `【待命】第 ${n} 条先驱者信号尚未解密。晋升「${rankName}」后授权追踪（经验 ${xp}/${need}）`,
    final: (d, range) => `【最终任务】前往银心奇点（${d} u），进入 ${range} u 内扫描它。小心潮汐，速战速决`,
    tag: (n, total) => `【任务 ${n}/${total}】`,
    planetHere: (tag, pn) => `${tag}锁定 ${pn}，瞄准并扫描它的先驱者信号`,
    planetFar: (tag, sysName, d, pn) => `${tag}前往 ${sysName}（${d} u），调查 ${pn} 上的先驱者信号`,
    beaconHere: (tag, d) => `${tag}信号源就在附近，飞向青色信标 ◈（${d} u）`,
    beaconFar: (tag, sysName, d) => `${tag}前往 ${sysName}（${d} u），搜寻先驱者留下的信号信标`,
  },

  // ---------- 信号碎片 / 结局 ----------
  fragment: {
    title: (n, total) => `信号碎片 ${n}/${total}`,
    reward: '+200 信用点 · 船体与燃料完全恢复 · 信号发现距离 +10%',
    toastAll: '七块碎片已集齐 —— 信号指向银心奇点',
    toastAllLocked: rankName => `七块碎片已集齐 —— 晋升为「${rankName}」后解锁最终任务`,
    toastNext: (n, total) => `信号碎片 ${n}/${total} · +50 经验 · 下一处信号坐标已标记`,
    toastLocked: (n, total) => `信号碎片 ${n}/${total} · +50 经验 · 晋升后解锁下一条信号`,
  },
  ending: {
    stats: (m, s, visited, total, found, beacons) => `用时 ${m} 分 ${s} 秒 · 到访 ${visited}/${total} 个恒星系 · 发现 ${found} 颗行星 · 信标 ${beacons} 个<br>奖励 +5000 信用点`,
  },

  // ---------- 提示条（屏幕上方弹出的小提示） ----------
  toast: {
    enterSystem: (name, first, n, total) => `进入 ${name} 星系 · ${first ? '首次到访 · ' : ''}已发现 ${n}/${total}`,
    bloom: on => '辉光：' + (on ? '开' : '关'),
    target: (name, d) => `目标：${name} · ${d} u`,
    targetSet: name => '目标：' + name,
    warpNoTarget: '先按 Tab 或在星图中选择目标恒星',
    warpNear: '已在目标附近',
    warpNoFuel: (cost, fuel) => `燃料不足：需要 ${cost}，当前 ${fuel}。靠近恒星或扫描气态巨行星可补充`,
    warpStart: (name, cost) => `曲速启动 → ${name}（-${cost} 燃料）`,
    warpArrive: name => `抵达 ${name}`,
    probeNoTarget: '请先选择一颗恒星作为目标（Tab 或星图）',
    probeKnown: name => `${name}：情报已掌握`,
    probeNoFuel: (cost, fuel) => `燃料不足：远程探测需要 ${cost}，当前 ${fuel}`,
    probeDone: (name, short) => `探测完成 ${name}：${short}`,
    crash: (d, hull, max) => `撞击！船体 -${d}（${hull}/${max}）`,
    hurt: (why, d, hull, max) => `${why}！船体 -${d}（${hull}/${max}）`,
    hurtFlare: '恒星耀斑',
    hurtBelt: '小行星撞击',
    cargoFull: '货舱已满，无法采样（按 I 查看）',
    sampled: (res, n, partial) => `采样：${res} ×${n}${partial ? '（货舱已满，只装下一部分）' : ''}`,
    useItem: (name, label) => `${name}：${label}`,
    tutRestart: '教学已重新开始',
    flareWarn: '⚠ 耀斑预警：4 秒后爆发，快远离恒星！',
    flareAvoided: '耀斑已避开',
    beltEnter: '进入小行星带：减速到 12 u/s 以下可安全通过',
    decoyDetected: '⚠ 检测到干扰信号：这是陷阱，别靠近',
    tideEnter: range => `⚠ 进入奇点潮汐区：船体持续受损。进入 ${range} u 内才能扫描`,
    hullCritical: (hull, max) => `⚠ 船体危急（${hull}/${max}）：再受损将被应急信标送回家园`,
    wreck: '船体失效！应急信标把你送回家园恒星：货舱物资损失一半，信用点 -10%',
    bhRecorded: '银心奇点：数据已记录',
    bhEcho: (n, total) => `奇点深处传来微弱的回响……（信号碎片 ${n}/${total}）`,
    bhRank: rankName => `军衔不足：需要「${rankName}」才能解读奇点`,
    discovered: (name, value) => `发现 ${name} · +${value} 信用点 · +10 经验`,
    sysComplete: (name, gain) => `${name} 星系已完成探索 · +${gain} 经验 · 即将打开收藏`,
  },

  // ---------- 信标（四类信号） ----------
  sig: {
    cache: '补给信标', distress: '求救信号', ruins: '遗迹信号', decoy: '干扰信号',
    trainingShield: '训练期间干扰已被屏蔽',
    packLost: '货舱已满，物资丢失',
    relicLost: '货舱已满，遗物丢失',
    fuelPlus: f => `+${f} 燃料`,
    item: (res, n) => `${res} ×${n}`,
    decoyHit: (f, h) => `燃料 -${f} · 船体 -${h}`,
    got: (name, bars, cr, parts) => `${name} ${bars}：${cr ? `+${cr} 信用点 · ` : ''}${parts.join(' · ')} · +5 经验`,
    // 屏幕上的信标标签
    labelStory: '◈ 信号碎片',
    labelUnknown: '◈ 未知信号',
    labelKnown: (name, decoy) => `◈ ${name}${decoy ? ' ⚠' : ''}`,
    markerStory: d => `信号碎片 ${d}u`,
  },

  // ---------- 资源用途 / 升级 ----------
  use: {
    氢气: '加注燃料 +15', '氦-3': '加注燃料 +40', 甲烷冰: '加注燃料 +25',
    金属矿: '修补船体 +20', 硅酸盐: '修补船体 +10',
  },
  upg: {
    engine: { name: '引擎', desc: l => `巡航速度 ${30 + 10 * l} u/s` },
    tank: { name: '燃料舱', desc: l => `燃料上限 ${100 + 40 * l}` },
    scanner: { name: '扫描仪', desc: l => `扫描距离 ${90 + 30 * l} u · 耗时 ${Math.max(1, 3 - .4 * l).toFixed(1)} s` },
    cargo: { name: '货舱', desc: l => `容量 ${20 + 10 * l}` },
    boost: { name: '推进器', desc: l => `能量上限 ${100 + 30 * l} · 恢复更快` },
    maxed: '已满级',
    buy: cost => '升级 ' + cost,
    cargoFull: '货舱已满，按 I 腾位',
  },
  cargo: {
    empty: '货舱是空的。扫描行星时会自动采样。',
    sellOnly: '仅可出售',
    sell: price => `出售 ${price}/个`,
  },

  // ---------- HUD ----------
  hud: {
    hullDamaged: (h, max) => `受损 ${h}/${max}`,
    boostHot: '过热',
    warpSuffix: ' · 曲速',
    deepSpace: '深空',
    sysName: (name, nStars) => name + ' 星系' + ['', '（双星）', '（三星）'][nStars - 1],
    nearest: (name, d) => `最近恒星：${name} · ${d} u`,
    target: (name, d, cost) => `目标：${name} · ${d} u · 曲速 -${cost} 燃料`,
    targetNone: '目标：无（Tab 选择）',
    probeKnown: short => '情报：' + short,
    probeUnknown: cost => `情报：未知 · 按 R 远程探测（-${cost} 燃料）`,
    promptWarp: name => `曲速航行中 → ${name}　{S} / {G} 取消`,
    promptScan: (name, d, known) => `${name}　${d} u${known ? '（已记录）' : ''}<br>按住 {鼠标左键} / {F} 扫描`,
    // 行星标签
    planetKnown: (name, d) => `${name}<br>${d} u`,
    planetUnknown: d => `未知天体<br>${d} u`,
    planetSignal: '<br>◇ 异常信号',
    companion: (letter, d) => `伴星 ${letter}<br>${d} u`,
    markerTarget: (name, d) => `${name} ${d}u`,
  },

  // ---------- 行星收藏 / 卡片 ----------
  cards: {
    all: n => `全部（${n}）`,
    current: sysName => `当前星系${sysName ? '：' + sysName : '（不在星系内）'}`,
    system: (name, n, total) => `${name}（${n}/${total}）`,
    emptyAll: '还没有收藏。扫描行星后，它的卡片会出现在这里。',
    emptyNoSys: '飞船当前不在任何星系内。',
    emptySys: '这个星系还没有收藏的卡片。',
    reward: (value, fuel) => `+${value} 信用点 · +${fuel} 燃料 · 已收藏`,
    collected: '已收藏',
    index: (i, n) => `${i} / ${n}`,
  },

  // ---------- 日志 ----------
  journal: {
    kinds: { rock: '岩石', gas: '气态', ice: '冰巨' },
    storyTitle: (n, total, done) => `主线 · 银心信号 ${n}/${total}${done ? ' · 已完成' : ''}`,
    storyLocked: '完成新手训练（扫描完家园星系的全部行星）后解锁。',
    storyNone: '尚未获得信号碎片。',
    storyLockedTitle: '主线 · 银心信号',
    summary: (found, visited, total, beacons, bhDone, value) => `已发现行星 <b>${found}</b> 颗 · 到访恒星系 <b>${visited}/${total}</b> · 信标 <b>${beacons}</b> · 银心奇点 ${bhDone ? '✔' : '未扫描'} · 累计样本价值 <b class="c-accent">${value}</b>`,
    head: ['名称', '类型', '大气', '温度', '资源', '生命', '价值'],
    empty: '还没有发现。飞近行星、瞄准并按住鼠标左键扫描。',
  },

  // ---------- 星图 ----------
  map: {
    bh: '银心奇点',
    home: 'H',
    quest: '★',
    barNone: '点击恒星设为目标',
    barBh: '目标：银心奇点',
    btnProbe: '远程探测 (R)',
    btnKnown: '情报已掌握',
    btnProbeCost: cost => `远程探测 R（-${cost} 燃料）`,
    barKnown: (name, d, text) => `${name} · ${d} u · ${text}`,
    barUnknown: (name, d) => `${name} · ${d} u · 情报未知`,
    tipUnknown: '未知 · 选中后可远程探测',
    tipVisited: ' · 已到访',
    tipProbed: ' · 已探测',
    tipHead: (name, mark, d, cost) => `<b>${name}</b>${mark}<br>距离 ${d} u · 曲速 -${cost} 燃料`,
    tipInfo: (type, n, total, gas, life, best, value, bc, quest) => `${type}<br>行星 ${n}/${total} 已发现 · 气态 ${gas} · 生命迹象 ${life}${best ? `（${best}）` : ''}<br>可获得约 ${value} 信用点 · 信标 ${bc}${quest ? '<br>★ 检测到先驱者信号' : ''}`,
  },
  // 系统情报摘要
  sys: {
    starTypes: ['G 型黄矮星', 'F 型黄白星', 'K 型橙矮星', 'A 型蓝白星', 'M 型红矮星'],
    multi: ['', '（双星系统）', '（三星系统）'],
    short: (type, n, gas, life, bc, quest) => `${type} · 行星${n} 气态${gas} 生命${life} 信标${bc}${quest ? ' · ★先驱者信号' : ''}`,
    text: (type, n, gas, life, best, value, bc, quest) => `${type} · 行星 ${n}（气态 ${gas}）· 生命迹象 ${life}${best ? `（最高：${best}）` : ''} · 可获得约 ${value} 信用点 · 信标 ${bc}${quest ? ' · 检测到先驱者信号' : ''}`,
  },

  // ---------- 新手教学 ----------
  tut: {
    title: '新手教学',
    stageNames: ['游戏开始', '完成第一次扫描', '完成一个星系', '升级', '第一次收集信标'],
    tryAll: '把每个动作都试一遍：',
    done: '✔ 完成',
    finished: '<b>教学完成</b> · 按 {H} 随时查看全部操作与游戏说明',
    stepOf: (i, n) => ` · ${i}/${n}`,
    // 第 1 阶段：移动
    look: '转动视角 鼠标/方向键',
    moves: [['前进', 'W'], ['后退', 'S'], ['左移', 'A'], ['右移', 'D'], ['上升', 'Z'], ['下降', 'C'], ['左滚', 'Q'], ['右滚', 'E']],
    // 第 2 阶段：收藏与货舱
    scanChips: [['KeyK', 'K 查看收藏的行星卡片'], ['KeyI', 'I 打开货舱'], ['KeyJ', 'J 打开日志']],
    // 第 3 阶段：完成一个星系
    galaxyIntro: '这个星系的行星都发现了！该去下一个了。',
    galaxyTry: '把以下每个动作都试一遍：',
    galaxyActs: [
      [['ShiftLeft', 'ShiftRight'], 'Shift 加速'],
      [['Tab'], 'Tab 切换目标'],
      [['KeyR'], 'R 远程探测'],
      [['KeyM'], 'M 打开星图'],
      [['KeyG'], 'G 启动曲速'],
    ],
    galaxyNote: 'Shift 消耗能量 · R、G 消耗燃料 · 点击星图里的恒星也能设为目标',
    // 第 4 阶段：升级
    upgrade: '信用点和材料够升级一次了！按 {U} 打开升级。',
    // 第 5 阶段：信标
    beacon: {
      intro: '你收集到了第一个信标！太空里的信标（◈ 标记）有四类：',
      head: ['类型', '奖励'],
      rows: [['cache', '补给', '资源'], ['distress', '求救', '燃料 + 信用点'], ['ruins', '遗迹', '稀有资源 + 大量信用点'], ['decoy', '干扰 ⚠', '陷阱，别靠近']],
      outro: '▮▮▮ 表示强度，越强越远就能发现，奖励也越多。走近到一定距离才能识别类型。',
      cont: '按 {Space} 继续',
    },
  },

  // ---------- 游戏知识（第一次遇到时弹出） ----------
  know: {
    // 示意图里的小字
    figs: {
      star2: { center: '质心', band: '行星轨道 ≥ 2.5 × 两星间距' },
      star3: { far: '远处的第三颗', pair: '内侧双星', zone: '稳定区（窄带）' },
    },
    // sec: [图标, 小标题, 正文, 样式]（样式 'tip' = 黄色提示框）
    star2: {
      title: '双星系统', fig: 'star2',
      tag: '两颗恒星，一个共同的质心',
      chips: ['恒星 ×2', '行星轨道 ≥ 2.5× 两星间距'],
      sec: [
        ['🌌', '这是什么', '两颗恒星并不是一颗绕着另一颗转，而是<b>一起围绕共同的质心</b>公转。质量越接近，就越像互相追逐。银河里大约有<b>一半</b>的类太阳恒星都有伴星，单星反而没那么"普通"。'],
        ['🪐', '行星在哪里', '太近的轨道会被两颗恒星轮流拉扯而失稳，所以行星只能待在<b>离它们足够远</b>的地方，整体绕着质心转，游戏里是两星间距约 2.5 倍以外。现实中这类"环双星行星"已被发现，天空中会同时挂着<b>两个太阳</b>。'],
        ['✨', '特别之处', '两颗恒星的类型可能不同，一颗橙黄、一颗蓝白，行星表面会有<b>两种颜色的光和影</b>。两颗星的相对位置不断变化，白天和黑夜也比单星复杂。'],
        ['🚀', '游戏提示', '每颗恒星都可以靠近补充燃料，也都可能爆发<b>耀斑</b>。飞近任何一颗之前，先留意耀斑预警。', 'tip'],
      ],
    },
    star3: {
      title: '三星系统', fig: 'star3',
      tag: '一对紧密的恒星，和一颗遥远的伴星',
      chips: ['恒星 ×3', '行星只能待在两条界线之间'],
      sec: [
        ['🌌', '这是什么', '稳定的三星系统几乎都是<b>层级式</b>的：两颗恒星紧紧相伴，第三颗在远处绕着这一对公转。三颗星地位平等地互相绕转极不稳定，往往很快就有一颗被抛出系统。半人马座 α 就是一个例子。'],
        ['🪐', '一条窄带', '行星被夹在两条界线之间：<b>内侧</b>是紧密双星的搅动（太近会失稳），<b>外侧</b>是第三颗恒星的引力（太远会被扯走）。所以这里的行星往往挤在一条<b>较窄的轨道带</b>里。'],
        ['✨', '特别之处', '天空中最多可以同时有三个"太阳"，亮度和颜色各不相同。远处那颗伴星看起来更像一颗特别亮的星，而不是太阳。'],
        ['🚀', '游戏提示', '每颗恒星都可以靠近采集燃料，但也都可能爆发<b>耀斑</b>。这里有三颗恒星，可以挑离耀斑最远、最安全的那一颗靠近。行星彼此靠得近，常常可以一口气扫描完。', 'tip'],
      ],
    },
    // 第一次扫描某类行星时，显示在卡片上的介绍（body 的最后一个 </p> 前面会自动加上「知道了」按钮）
    kind_rock: {
      title: '岩石行星',
      body: `<p>有固体表面的类地行星，离恒星较近的行星大多是这一类。</p>
    <p>主要由金属和硅酸盐构成，采样可得到<b>固体材料</b>（具体看卡片上的"资源"一栏）。有些还有大气，甚至生命，<b>样本价值越高</b>，奖励越多。</p>
    <p>扫描岩石行星可补充 <b>10</b> 点燃料。</p>`,
    },
    kind_gas: {
      title: '气态巨行星',
      body: `<p>主要由氢和氦组成，<b>没有固体表面</b>，体积大、质量大，常带有行星环和较多卫星。</p>
    <p>它们是良好的燃料来源：扫描气态巨行星可补充 <b>25</b> 点燃料，比岩石行星多得多。</p>`,
    },
    kind_ice: {
      title: '冰巨行星',
      body: `<p>类似天王星、海王星：厚厚的氢氦外层下面，是大量的<b>水、氨、甲烷</b>等"冰"。因为距离恒星很远，温度极低。</p>
    <p>采样常得到<b>水冰、氨、甲烷冰</b>这类材料。扫描可补充 <b>10</b> 点燃料。</p>`,
    },
  },
};
