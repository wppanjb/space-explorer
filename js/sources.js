// =====================================================================
// sources.js —— 游戏里真实天文数据的出处清单（知识库里「下载数据出处」按钮导出的就是这份）
// 查证日期：2026-11-25。改了 real.js / realsystems.js 里的数据，记得同步改这里。
// =====================================================================

// 知识库底部显示的几个常用链接：[名称, 地址]
export const SOURCE_LINKS = [
  ['NASA 行星资料表', 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/index.html'],
  ['Exoplanet Archive', 'https://exoplanetarchive.ipac.caltech.edu/'],
  ['卫星数量', 'https://spaceplace.nasa.gov/how-many-moons'],
];

export const SOURCES_MD = `# Deep Space Explorer · 真实天文数据出处

查证日期：2026-11-25

## 怎么读这份清单

游戏里的行星卡片把每个数据标成三种：

- **实测**：来自天文观测的数值（半长轴、偏心率、半径、质量、恒星参数）。
- **推测**：由观测值估算的，或者各来源互相矛盾、或者只是假设的值（例如：假设为圆轨道的偏心率、由半径估算的质量、平衡温度、重力）。
- **生成**：游戏自己设定的（大气、生命、资源、样本价值、地表示意图、压缩后的轨道距离和大小）。

游戏里的距离和大小是压缩过的示意比例，不是真实比例。
同一个量不同论文常有不同的值：下面写明游戏采用的是哪一篇；其他来源的值在「注」里。
视向速度法得到的质量是最小质量（下限）。

## 太阳系

出处：
- NASA 行星资料表 https://nssdc.gsfc.nasa.gov/planetary/factsheet/index.html
- 以地球为 1 的比值表 https://nssdc.gsfc.nasa.gov/planetary/factsheet//planet_table_ratio.html
- 资料表说明（2021-12 更新）https://nssdc.gsfc.nasa.gov/planetary//factsheet/planetfact_notes.html
- 卫星数量：NASA Space Place https://spaceplace.nasa.gov/how-many-moons （木星 115 个，2026-04；土星 293 个，2026-06；天王星 29 个，2026-07 更新；NASA 资料表上的旧数字分别是 95 / 274 / 28）。卫星数量只有这一个 NASA 页面支持，可再对照 JPL 卫星发现表 https://ssd.jpl.nasa.gov/sats/discovery.html
- 太阳光谱型 G2V：https://www.britannica.com/science/G2-V-star

采用的数据：半长轴、偏心率、轨道倾角、自转轴倾角、半径、质量、公转周期、卫星数、表面（巨行星为 1 bar 处）温度和重力。
环：资料表显示木星、土星、天王星、海王星都有环；木星、天王星、海王星的环很暗很淡，游戏里画得更淡。

注：巨行星的公转周期游戏用恒星周期（木星 4332.6 天等），资料表列的是 4331 / 10,747 / 30,589 / 59,800 天，定义不同。

## 系外行星系统

通用出处：NASA Exoplanet Archive 各系统页面 https://exoplanetarchive.ipac.caltech.edu/ （页面里 Overview 列出各来源论文）。

### Proxima Centauri（距离 4.25 ly）
- 恒星 M5.5Ve：Teff 2900 K、半径 0.141 R☉ 取自 Suárez Mascareño 2025 https://arxiv.org/pdf/2507.21751 ；质量 0.1221 M☉（Mann 2015）。维基百科上是 2992 K / 0.1542 R☉。
- d、b：半长轴、周期、最小质量取自 Suárez Mascareño 2025。偏心率 0 是该文采用的假设（推测）。d 的半径 0.81 R☉ 是由质量推算的预测值（Faria 2022；NASA 页面写 0.692），推测。https://science.nasa.gov/exoplanet-catalog/proxima-centauri-d
- c（候选行星）：Damasso 2020 的 1.48 AU、5.8 M⊕、1900 天；偏心率、质量各来源矛盾（推测）。2022 和 2025 年的分析都没能复现这个信号。https://en.wikipedia.org/wiki/Proxima_Centauri_c

### TRAPPIST-1（40.66 ly）
- 全部来自 Agol et al. 2021 https://exoplanetarchive.ipac.caltech.edu/overview/Trappist1 ；偏心率 Grimm 2018，平衡温度 Ducrot 2020（均见 https://en.wikipedia.org/wiki/TRAPPIST-1 的引用）。
- d、h 的半径采用 Agol 2021 的 0.788、0.755（Grimm 2018 为 0.77、0.775）。主星 Teff 各来源在 2325～2566 K 之间。

### 51 Pegasi（50.43 ly）
- 恒星：Teff 5761 K、半径 1.19 R☉、质量 1.07 M☉，Rosenthal 2021 / Cont et al. 2026。 https://exoplanetarchive.ipac.caltech.edu/overview/51Peg
- 51 Peg b：不凌星，没有测得的半径，1.2 R_Jup 只是估计（推测）。0.61 M_Jup 是 Cont 2026 的新解 https://arxiv.org/pdf/2605.23582 ，与传统最小质量 0.464 M_Jup（Rosenthal 2021）矛盾（推测）。

### HD 209458（157 ly）
- 恒星：del Burgo & Allende Prieto 2016（6071 K、1.203 R☉）；质量 1.148 M☉ 是维基百科值，各来源在 1.10～1.23 之间。
- HD 209458 b：半径 1.39 R_Jup、质量 0.73 M_Jup，Stassun 2017（NASA Exoplanet Archive 默认值）；半长轴 Bonomo 2017。 https://science.nasa.gov/exoplanet-catalog/hd-209458-b/

### 55 Cancri（41.05 ly）
- 恒星：G8V、5198 K、0.98 R☉、1.015 M☉，Moutou 2026（NASA Exoplanet Archive）。 https://exoplanetarchive.ipac.caltech.edu/overview/55%20Cnc
- 55 Cnc e：半径 1.875 R⊕、质量 7.99 M⊕，Bourrier 2018 https://www.aanda.org/articles/aa/full_html/2018/11/aa33154-18/T4.html
- b、c、f、d：Moutou 2026。c 的偏心率误差比数值还大、d 各解的偏心率在 0.019～0.139 之间，均显示为推测。
- 绕主星 5 颗行星；整个系统共 7 颗（另 2 颗绕伴星 55 Cnc B），游戏里只放绕主星的。

### Kepler-16（245.4 ly，环双星）
- Doyle et al. 2011 https://arxiv.org/pdf/1109.3432 （恒星半径、行星参数）；恒星质量和双星距离 Sebastian et al. 2025 https://arxiv.org/html/2505.19718v1 。
- 注：Triaud 2022 给出 a 0.688 AU、质量 0.313 M_Jup，属不同发表。光谱型 K7V 只在维基百科看到。

### Kepler-90（2790 ly，8 颗行星）
- 恒星：维基百科值（6080 K、1.2 R☉、1.2 M☉）；Archive 为 6103 K / 1.02 R☉，Shallue & Vanderburg 2018 为 6015 K / 1.29 R☉。光谱型 F9IV/V 未在一手文献找到。
- 半径：Weiss 2024（Archive）；周期：Shallue & Vanderburg 2018 https://arxiv.org/pdf/1712.05044 。i 的半长轴 0.1201 AU 取自 Weiss 2024。
- g、h 的质量：凌星计时（TTV）测得，Liang 2021 https://arxiv.org/abs/2011.08515 、Shaw 2025 https://arxiv.org/pdf/2507.13588 ；偏心率 Shaw 2025。
- b～f 的偏心率是假设的 0（推测）；b～f 的质量由半径估算（推测）。

### Kepler-186（579 ly，5 颗行星）
- Quintana et al. 2014 https://arxiv.org/pdf/1404.5667 ；f 的参数来自 Torres 2015。
- 恒星 M1V、3755 K、0.523 R☉、0.544 M☉ 来自另一套数据（Quintana 2014 为 3788 K、0.472 R☉、0.478 M☉）。
- 所有行星没有质量测量，游戏里由半径估算（推测）；偏心率是假设的 0（推测）。
- c 的半长轴：Archive 写 0.0451 AU，论文表格摘录像是 0.0520 AU，数据矛盾，显示为推测。

### TOI-700（101.6 ly，4 颗行星）
- Gilbert et al. 2023 https://arxiv.org/pdf/2301.03617 ：恒星 M2.5V、3459 K、0.421 R☉、0.415 M☉；行星半径、偏心率；d、e 的半长轴。
- c、d 的质量（2.5、2.4 M⊕）来自 2025 年会议摘要（ESPRESSO 径向速度，未经同行评审），显示为推测。偏心率误差比数值还大，显示为推测。
- https://exoplanetarchive.ipac.caltech.edu/overview/TOI-700

### LHS 1140（48.9 ly）
- Cadieux et al. 2024 https://arxiv.org/pdf/2403.13265.pdf （恒星和两颗行星参数）。
- b 是否被海洋覆盖：Damiano et al. 2024 https://arxiv.org/html/2406.15136v1 （JWST）倾向于「高平均分子量大气 + 富水内部」（水占 9～19%），液态海洋未确认；游戏把它当作海洋世界，是「可能」，不是结论。
- 偏心率为假设的 0（Cadieux 2024 给出 e < 0.05 / 0.043 的上限）。

### Kepler-452（1810 ly）
- 恒星：Jenkins et al. 2015 https://www.arxiv.org/pdf/1507.06723 （5757 K、1.11 R☉、1.037 M☉）；平衡温度 265 K 是假设反照率 0.3 的估算。
- Kepler-452 b：半径 1.511 R⊕ 取自 Berger 2018（Gaia 修订） https://arxiv.org/abs/1805.00231 （发现论文为 1.63）；没有测得质量（NASA 目录写 3.29 M⊕，游戏由半径估算）；偏心率假设为 0。NASA Exoplanet Archive 目前把它标为「有争议」。

## 游戏自己设定的（不是观测）

行星的大气、生命、资源、样本价值、燃料补给、地表和云带图案、行星环的大小（示意）、压缩后的轨道距离和行星大小、恒星大小、小行星带、信标、耀斑和高温区的范围。
`;
