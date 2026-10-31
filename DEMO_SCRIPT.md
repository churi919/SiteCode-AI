# SiteCode AI · 90-second demonstration / 90 秒演示

Choose one language for delivery; the paired lines express the same points.

现场选择一种语言讲述，以下提供对应表达。

**0–10 s · Open the model / 展示模型**

This is Canopy Garden Residences, a fictional 20-storey Rhino residential case. SiteCode AI connects model geometry, source-based review and mapped surroundings.

这是提供的 Rhino 模型 Canopy Garden Residences：一个虚构的 20 层住宅案例。SiteCode AI 连接模型几何、有来源的审查与周边地图环境。

**10–30 s · Choose the site and read its surroundings / 选址与读取周边**

Pan or zoom the map, search “National University of Singapore”, and click a site. Draw the parcel, place and rotate the building, then read nearby roads, buildings, greenery, water and facilities. Real OSM data comes through Overpass or the OpenFreeMap fallback, without a map API key.

自由平移缩放地图，搜索“National University of Singapore”并点选场地。绘制地块、放置及旋转建筑，再读取周边道路、建筑、绿地、水体及设施。真实 OSM 数据通过 Overpass 或 OpenFreeMap 后备获取，无需地图 API 密钥。

**30–45 s · Three findings and one review / 三项问题与一项待核查**

Three selected criteria flag widths and clearance of 2.8, 3 and 3 metres against thresholds of 4, 4.5 and 7 metres. The pool's 128-square-metre overlap with a manual review envelope remains a separate review candidate.

三项所选指标被标记：通道净宽 2.8 米、廊架净空 3 米、作业通道宽度 3 米，对应阈值为 4、4.5 和 7 米。泳池与人工指定审查范围的 128 平方米重叠，单独列为待核查候选问题。

**45–60 s · Search and locate / 检索与定位**

Search the local library of 38 PDFs and 3,590 pages by keyword or clause. Open the PDF page, then select a marker to highlight the source-model object. Missing evidence stays visible.

本地来源库包含 38 份 PDF、3,590 页。检索关键词或条款号，打开实际 PDF 页面，再点击标记定位对应的原始模型对象。证据不足的额外条款仍列为待核查候选项。

**60–78 s · Ask the assistant / 询问助手**

With your own OpenAI key, ask: “Why is this pergola flagged?” Click the answer's issue card to locate it. Then ask how the entrance relates to nearby roads and greenery. AI receives code evidence and mapped context separately. Export includes the review and surroundings.

接入自己的 OpenAI 密钥后，在右下角询问“为什么这个廊架被标记？”，点击回答中的问题卡定位。再问“入口应如何联系周围道路和绿地？”。AI 分别读取规范依据和地图环境，提供中英回答；导出记录也包含周边关系。

**78–90 s · Define the scope / 说明范围**

Use, height and the pool envelope are declared inputs. Recommendations do not modify geometry. OSM relationships are approximate, with source, time and coverage warnings; they do not establish regulatory compliance.

用途、高度及泳池审查范围属于声明输入，建议不会自动修改几何。OSM 关系为近似判断，保留来源、时间与覆盖警示，不作为规范合规结论。

## Before presenting / 演示前

- Open the site and read surroundings once before the talk. Requests are cached for ten minutes; if Overpass is unavailable, the real OpenFreeMap fallback can take longer on the first read. Keep the source, data/fetch times and truncation warnings visible. / 开讲前先选好位置并读取一次周边；请求缓存十分钟。Overpass 不可用时，首次使用真实 OpenFreeMap 后备可能需要稍等；保留来源、数据及获取时间与截断警示。
- Without any API key, demonstrate mapping, place search, parcel/rotation controls, surrounding relationships, local code search, issue highlighting, the rule-based brief and export. Live chat and AI briefs need the presenter's own OpenAI API configuration. / 无密钥时，可展示自由地图、地名搜索、地块与朝向、周边关系、本地规范检索、问题高亮、规则生成建议和导出。实时对话及 AI 建议需要演示者接入自己的 OpenAI API。
- Mapping/search need internet access. OSM coverage can be incomplete and vector features may be capped, clipped or split. Unknown road widths, actual heights, access rights and cadastral boundaries are not inferred. A failed request should be retried rather than presented as an empty real-world site. / 地图与搜索需要联网。OSM 可能不完整，矢量要素可能因数量上限而截断、裁切或分割；不推断未知道路宽度、真实建筑高度、通行权和地籍。请求失败应重试，不应解释为现场不存在相关要素。
