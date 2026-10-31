# SiteCode AI · 建筑规范设计助手

A bilingual design-review demonstration using the supplied **garden_condo_before_v01.3dm**: Canopy Garden Residences, a fictional, intentionally deficient residential case. The browser displays a lightweight GLB derived from the Rhino model's cached meshes, with findings linked to actual source-object UUIDs.

中英双语设计审查演示，使用提供的 **garden_condo_before_v01.3dm**。Canopy Garden Residences 为虚构、刻意设置问题的住宅案例；浏览器显示由 Rhino 缓存网格转换的轻量 GLB，检查标记关联原始模型对象 UUID。

![Design workspace with the Rhino model and real OSM surroundings / Rhino 模型与真实 OSM 周边设计工作台](docs/demo-preview.jpg)

## Authors & co-creators · 作者与共创者

Co-created by [@churi919](https://github.com/churi919), [@Jacksonwang0913](https://github.com/Jacksonwang0913), and [@LilineLIN](https://github.com/LilineLIN).

由 [@churi919](https://github.com/churi919)、[@Jacksonwang0913](https://github.com/Jacksonwang0913) 与 [@LilineLIN](https://github.com/LilineLIN) 共同创作。

Author list / 作者名单：[AUTHORS.md](AUTHORS.md).

## Start · 启动

Right-click **Start-Demo.ps1 → Run with PowerShell**. It starts the local server and opens `http://127.0.0.1:4173`. If scripts are blocked, run the following in this folder, then open that address:

右键 **Start-Demo.ps1 → 使用 PowerShell 运行**，即可启动服务并打开浏览器。如脚本被限制，在此文件夹运行以下命令，再打开上述地址：

```powershell
node server/local.mjs
```

Node.js 20 or later and a browser with WebGL are required; no dependency installation is needed for the local demo. On Windows, the launcher looks for Node.js on your PATH and optionally a local Codex runtime. On macOS/Linux, run the command above from a terminal.

需要 Node.js 20 或以上，以及支持 WebGL 的浏览器；本地演示无需安装项目依赖。Windows 启动器会优先查找系统 Node.js，也可识别本机的 Codex 运行环境。macOS/Linux 用户可在终端中运行上述命令。

The repository does **not** include an OpenAI key or a shared AI account. To enable live AI, configure **your own API key** as described below. Model review, local code search, the freely navigable map, place search and mapped surrounding relationships work without API keys. Map services require an internet connection.

仓库**不附带 OpenAI 密钥或共享 AI 账号**。如需启用实时 AI，请按下文接入**自己的 API 密钥**。模型审查、本地规范检索、自由浏览地图、地名搜索及周边关系分析均无需 API 密钥；地图服务需要联网。

## Features · 功能

- **Refined workspace:** a [Vercel-inspired](https://vercel.com/design.md) black-and-white interface with local Geist typography, system light/dark themes, keyboard focus and responsive layouts. SiteCode AI keeps its own identity. / **设计工作台：**参考 Vercel 的黑白视觉、本地 Geist 字体、系统浅深色适配、键盘焦点及响应式布局，保留 SiteCode AI 自有品牌。
- **3D model review:** orbit, zoom, plan view, issue markers, source-object highlighting, and import of `.3dm` / `.glb` geometry. / **三维模型审查：**旋转、缩放、平面视图、问题标记、原始对象高亮，以及 `.3dm` / `.glb` 几何导入。
- **Site and orientation:** pan and zoom the Leaflet map, search a place or address with Photon, click a site or use the map centre, draw a parcel, move the building and change its direction. No Google key is required. / **场地与朝向：**在 Leaflet 地图自由平移缩放，通过 Photon 搜索地名或地址，点选场地或使用地图中心，绘制地块、移动建筑并调整方向，无需 Google 密钥。
- **Mapped surroundings:** read nearby OSM roads, buildings, green/open spaces, water and facilities; compare approximate distances and directions with the declared building footprint and orientation. Overpass is tried first, with real OSM-derived OpenFreeMap vector tiles as a fallback. Relationship observations and design suggestions appear in the review, local brief, AI context and exported record. / **周边地图分析：**读取 OSM 道路、建筑、绿地与开放空间、水体及设施，结合建筑声明轮廓与朝向比较近似距离和方向。优先请求 Overpass，失败时使用真实 OSM 派生的 OpenFreeMap 矢量瓦片。关系观察和设计建议进入审查、本地建议、AI 上下文与导出记录。
- **Code evidence:** local keyword/clause search, document and PDF-page references, selected excerpts, and source-linked rule summaries. / **规范依据：**本地关键词与条款检索、文件及 PDF 页码引用、选中摘录，以及带来源的规则摘要。
- **Source-grounded bilingual AI:** ask different code/design/site questions, inspect the evidence supplied to the model, keep follow-up context or start a new conversation. The assistant receives retrieved code excerpts and mapped geographic context separately. / **依据来源的双语 AI：**询问不同规范、设计及场地问题、查看传给模型的依据、连续追问或开始新对话；检索条款和周边地理环境分别提供给助手。
- **AI-to-model actions:** click a known `FEA-01`–`FEA-04` issue in an answer or its action card to fly to and highlight the exact model object, with current/target values and specific modification advice. Return to the chat without losing the answer. / **回答与模型联动：**点击回答中的已知 `FEA-01`–`FEA-04` 问题编号或问题卡片，自动定位并高亮精确模型对象，显示当前值、目标值及具体修改建议；返回聊天时保留原回答。
- **Presentation outputs:** view a rule-based local improvement brief without a key, generate an AI improvement brief when configured, and export the review with mapped context for discussion. / **展示输出：**无需密钥即可查看规则生成的本地建议，配置后可生成 AI 改进建议，并可导出包含周边地图环境的检查记录供讨论。

## Presentation flow · 展示流程

1. **Inspect the supplied model / 查看提供的模型** — Orbit the 20-storey garden condominium or switch to Plan. The model declares PG II residential use and a synthetic habitable height of approximately 61.145 m. / 旋转查看 20 层花园公寓，或切换平面视图。模型声明为用途组别 II 住宅，模拟居住高度约 61.145 米。
2. **Choose a real site / 自由选择场地** — Open the site map, search “National University of Singapore” or another address, then click the desired site. Pan/zoom to refine it, draw a parcel and place/rotate the building. Read the surroundings and inspect mapped relationships; move or rotate the model to update the analysis. / 打开场地地图，搜索“National University of Singapore”或其他地址，再点选所需位置。平移缩放细化选址，绘制地块、放置及旋转建筑。读取周边后查看地图关系；移动或转动模型可更新分析。
3. **Select a finding / 点击检查项** — Three selected criteria are flagged: access road **2.8 m vs 4 m**, pergola clearance **3.0 m vs 4.5 m**, and accessway width **3.0 m vs 7 m**. Select each marker to locate the corresponding model object and inspect the source. / 三项所选指标被标记：消防通道净宽 **2.8 米对 4 米**、廊架净空 **3.0 米对 4.5 米**、作业通道宽度 **3.0 米对 7 米**。点击标记定位相应模型对象并查看依据。
4. **Distinguish review evidence / 区分待核查证据** — The pool overlaps a manually nominated review envelope by **128 m²**. This is a review candidate, not an automatic compliance failure or a derived compliant route. / 泳池与人工指定的审查范围重叠 **128 平方米**。此项为待核查候选问题，不是自动判定的违规或推导出的合规路线。
5. **Search and locate a source / 检索与定位来源** — Search the local corpus of **38 PDFs and 3,590 pages**, or browse the curated source-linked clauses. Search by keyword or clause number, open the PDF page, and mark a relevant model location where evidence is available. / 检索包含 **38 份 PDF、3,590 页**的本地资料库，或浏览精选条款。按关键词或条款号查询，打开对应 PDF 页，并在有位置证据时定位模型。
6. **Discuss and locate / 与 AI 讨论并定位** — After configuring your own OpenAI key, open the floating chat entry at the **bottom right** and ask “Which clauses does our model fail?” Click an `FEA` issue number or action card in the answer: the camera moves to the corresponding object and a bilingual action panel appears. For example, `FEA-02` shows **3.0 → 4.5 m clearance, +1.5 m**, with a recommended pergola underside of **Z=4.655 m** at the demo paving datum. After reading the surroundings, also ask “How should our entrance relate to nearby roads and greenery?” The answer can discuss mapped relationships while keeping code evidence separate. / 接入自己的 OpenAI 密钥后，点击**右下角悬浮聊天入口**询问“我们不符合的具体条款是哪些？”点击回答中的 `FEA` 编号或问题卡片，镜头将定位相应对象并显示双语修改建议。例如 `FEA-02` 显示净空 **3.0 → 4.5 米，增加 1.5 米**，并按演示路面基准建议将廊架底面抬至 **Z=4.655 米**。读取周边后，还可问“入口应如何联系周围道路和绿地？”，助手会结合地图关系讨论，并区分规范依据。

Use [DEMO_SCRIPT.md](DEMO_SCRIPT.md) for a 90-second paired English–Chinese presentation.

90 秒中英对照讲稿见 [DEMO_SCRIPT.md](DEMO_SCRIPT.md)。

## Evidence and scope · 依据与范围

- **Model evidence:** dimensions and object identities come from explicit embedded metadata and native geometric bounds. PG II use, height datum and building applicability remain declared or synthetic assumptions requiring project review. / 尺寸与对象标识来自模型内嵌元数据和原生几何包围盒；用途组别、高度基准和建筑适用条件仍为申报或模拟假设，须结合项目核实。
- **Review scope:** the three selected criterion findings and one pool review candidate do not form a complete Fire Code assessment or approval. Improvement briefs contain recommendations; the demonstration does not generate revised building geometry. / 三项所选指标问题与一项泳池候选问题，不构成完整消防规范评估或审批。改进说明提供设计建议，演示不会自动生成修改后的建筑几何。
- **Sources:** keyword retrieval searches locally indexed PDF text; it is not a live whole-internet search. Preserve document ID, PDF page, version notes and effective dates when interpreting a result. Indexed documents are not independently verified as the current applicable versions. / 关键词检索针对本地索引的 PDF 原文，不是实时全网搜索。解释结果时须保留文档编号、PDF 页码、版本说明及生效日期；入库文件未经独立确认均为当前适用版本。
- **Location:** known source UUIDs support the active case's markers. Unknown hydrant positions or unmapped imported geometry need location evidence. / 当前案例依据已知原始 UUID 定位；未知消火栓位置或尚未关联的导入几何，须补充位置证据。
- **Site context:** OpenStreetMap provides geographic observations, not building regulations. Distances, directions and overlaps use mapped geometry and a declared model footprint. Map outlines, unknown-height 3D extrusions and user-drawn parcels do not establish surveyed dimensions, ownership, access rights, cadastral boundaries, setbacks or compliance. Optional Google imagery/place/road proxies remain separate services. / OpenStreetMap 提供地理观察，不是建筑规范。距离、方向和重叠关系依据地图几何与建筑声明轮廓近似计算；地图轮廓、未知高度的三维拉伸及手绘地块不代表实测尺寸、产权、通行权、法定地籍、退界或合规结论。可选 Google 影像、地点及道路代理仍为独立服务。
- **Map coverage and time:** keep the displayed source, attribution, request radius, fetch time, data time and warnings with each analysis. Overpass data and OpenFreeMap tiles may be incomplete; the tile date is its build date. Returned features are capped, tile geometry can be clipped/split, and some complex polygons are omitted. An empty result does not prove a feature is absent. Changing the site invalidates old relationships; a failed map request is reported and can be retried. / 每次分析应保留显示的来源、署名、读取半径、获取时间、数据时间与警示。Overpass 和 OpenFreeMap 均可能不完整，瓦片时间为构建时间；返回要素设有上限，瓦片几何可能裁切或分割，部分复杂多边形会略过。空结果不代表实际不存在。更换场地会使旧关系失效；读取失败会明确提示，可重新尝试。

## Use your own APIs · 接入自己的 API

Create a local `.env` from `.env.example` **only if you do not already have one**, then fill in your own credentials. `.env` is ignored by Git. Keep keys in the server environment; do not paste them into browser code or commit them.

如本地尚无 `.env`，复制 `.env.example` 为 `.env`，再填入自己的密钥。Git 已忽略 `.env`。密钥仅配置在服务器环境中，不要写进浏览器代码或提交到仓库。

```dotenv
OPENAI_API_KEY=your_own_openai_api_key
OPENAI_MODEL=gpt-6.1-sol
GOOGLE_MAPS_API_KEY=your_own_google_maps_api_key
# Optional service overrides; the defaults need no key.
# PHOTON_URL=https://photon.komoot.io/api/
# OVERPASS_API_URL=https://overpass-api.de/api/interpreter
```

| Variable / 变量 | Purpose / 用途 |
| --- | --- |
| `OPENAI_API_KEY` | Your own OpenAI API key for live chat and improvement briefs. A key with access to the selected model is required. / 用于实时对话和改进建议的个人 OpenAI API 密钥，须具有所选模型的调用权限。 |
| `OPENAI_MODEL` | Model identifier sent to the OpenAI Responses API; defaults to `gpt-6.1-sol`. Change it to a compatible model available to your account if needed. / 发送给 OpenAI Responses API 的模型标识，默认 `gpt-6.1-sol`；如有需要，可改为自己账号可用且兼容的模型。 |
| `GOOGLE_MAPS_API_KEY` | Optional Google key for the separate Maps Static API, Places API (New) and Roads API proxies. It is not required for the Leaflet map, Photon search or OSM surrounding analysis. / 可选个人 Google 密钥，用于独立的 Maps Static API、Places API（新版）及 Roads API 代理；Leaflet 地图、Photon 搜索和 OSM 周边分析无需此项。 |
| `PHOTON_URL` | Optional Photon-compatible geocoding endpoint; defaults to `https://photon.komoot.io/api/`. Searches run only on submission, at most one upstream request per second, with caching. / 可选兼容 Photon 的地名搜索地址，默认 `https://photon.komoot.io/api/`；仅提交时搜索，上游每秒最多一次并缓存结果。 |
| `OVERPASS_API_URL` | Optional Overpass endpoint; defaults to `https://overpass-api.de/api/interpreter`. A failed/timed-out query uses the public OpenFreeMap vector-tile fallback; no map key is required. / 可选 Overpass 地址，默认 `https://overpass-api.de/api/interpreter`；请求失败或超时会使用公开 OpenFreeMap 矢量瓦片后备，无需地图密钥。 |
| `PORT` | Optional local port; defaults to `4173`. The PowerShell launcher opens the default port. / 可选本地端口，默认 `4173`；PowerShell 启动器打开默认端口。 |

Restart the local server after editing `.env`. OpenAI and optional Google services can be configured independently. AI requests go from the server to OpenAI's Responses API with the relevant question, conversation context, retrieved evidence and current mapped relationships; numerical findings remain deterministic. Google requests also use server-side proxies. Map/search requests send the submitted place or coordinates to the relevant public map service, without an OpenAI key. Surrounding requests are cached for ten minutes by centre and radius.

修改 `.env` 后重启本地服务。OpenAI 与可选 Google 服务可分别配置。AI 由服务器将相关问题、对话上下文、检索依据和当前周边地图关系发送至 OpenAI Responses API；数值检查仍由确定性逻辑完成。Google 请求同样通过服务器代理。地图与搜索会将提交的地名或坐标发给相应公共地图服务，不携带 OpenAI 密钥；周边请求按中心与半径缓存十分钟。

**Without API keys:** model viewing/import, freely navigable mapping, place search, parcel drawing and direction controls, mapped surrounding analysis, existing screening findings and local recommendations, local code search, issue selection/highlighting and review export remain available. Map tiles, place search, surrounding data and external PDF links require network access. Live AI replies/briefs require your own OpenAI key; optional Google proxy requests require your Google key. The local brief is labelled rule-based, and the app does not substitute canned AI answers for missing credentials.

**未配置 API 时：**仍可使用模型查看与导入、自由地图与地名搜索、地块绘制及朝向调整、周边地图分析、已有筛查结果与本地建议、本地规范检索、问题选择与高亮，以及检查记录导出。地图瓦片、地名搜索、周边数据和外部 PDF 链接需要联网。实时 AI 回答及建议说明需接入自己的 OpenAI 密钥；可选 Google 代理请求需接入自己的 Google 密钥。本地建议明确标注为规则生成，应用不会用固定模板冒充实时 AI 回答。

## Models and development · 模型与开发

The included case's `FEA` actions use the UUIDs and evidence in `dist/assets/garden-condo-review.json`. Importing another model displays its geometry, but does not automatically produce a validated code assessment or map old findings to the new model. Add measured project inputs and verified object/evidence mappings before linking new issues. AI suggestions do not modify geometry automatically.

内置案例的 `FEA` 联动使用 `dist/assets/garden-condo-review.json` 中的 UUID 与证据。导入其他模型可显示几何，但不会自动生成已验证的规范审查，也不会把旧问题强行关联到新模型。关联新问题前，需要补充实测项目参数及可靠的对象与证据映射。AI 建议不会自动修改几何。

```sh
npm start
npm test
```

`dist/` contains the browser application and bundled local assets, including Leaflet; `server/` contains the local server, API proxies and bounded vector-tile decoder; `tests/` covers code-context routing, evidence-based issue actions, map geometry/relationships, provider fallbacks, caching and source separation. Local running does not require `npm run build`; the build command generates the optional Worker deployment artifact.

`dist/` 包含浏览器应用、本地资源及 Leaflet；`server/` 包含本地服务器、API 代理和有界矢量瓦片解析器；`tests/` 检查规范问题路由、依据联动、地图几何与关系、数据源后备、缓存及来源区分。本地启动无需运行 `npm run build`；该命令用于生成可选的 Worker 部署产物。

Map sources: [OpenStreetMap contributors / copyright and ODbL](https://www.openstreetmap.org/copyright), [Photon](https://github.com/komoot/photon), [OpenFreeMap](https://openfreemap.org/) and [OpenMapTiles](https://openmaptiles.org/). Keep their displayed attribution when presenting or sharing map output. / 地图来源见上述链接，展示或分享地图输出时请保留界面中的来源署名。

Primary fire-access reference: [SCDF Fire Code 2023 §4.2](https://www.scdf.gov.sg/fire-safety-services-listing/fire-code-2023/table-of-content/chapter-4-site-planning-external-firefighting-provision/clause-4.2-provision-for-external-access-to-building-for-firefighting-and-accessibility-of-site-to-firefighting-appliances).
