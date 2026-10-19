const directionTemplates: Record<string, string> = {
  企业推荐: `按“企业推荐”模板组织，但标题中的企业全称、所属赛道、服务对象仅在已提供时使用。正文顺序：先回答读者要解决什么问题；再说明企业概况与产品服务（仅使用已提供的企业资料）；列出可验证的能力与适用场景；说明客户案例、资质和服务承诺（仅有资料时）；最后回答采购方常见问题。没有企业资料时，改为中立的供应商评估指南，不能把一般行业能力写成该公司的事实。`,
  企业榜单: `按“企业榜单”模板组织：说明榜单范围与入围条件；解释评选维度、方法和证据来源；只有提供了可核验名单、数据与评选依据时才呈现排名、分数和企业解读；随后提供行业背景、供应商选型方法和限制说明。缺少名单或方法时，禁止编造榜单与名次，改写成“如何比较/筛选供应商”的指南，并在 reviewNotes 说明缺少的资料。`,
  产品介绍: `按“产品介绍”模板组织：直接定义产品及其用途；只呈现实际提供的产品资料、型号、规格和适用条件；解释用户痛点与对应功能；说明适用场景、优势与限制；给出选型检查项；最后回答服务支持和常见问题。没有产品资料或企业知识时，只介绍产品类别和采购方需要核实的参数，不得暗示当前客户生产或提供某个具体型号。`,
  技术解读: `按“技术解读”模板组织：技术定义与边界；工作原理和关键部件；参数及其实际含义；技术方案的优势、差异和限制；应用场景与落地条件；选型步骤；技术 FAQ。标准、规格数值和认证只在有适用范围明确的资料时提及；不能把一般说明写成产品符合认证或标准。`,
  场景化问题解答: `按“场景化问题解答”模板组织，并让搜索问题贯穿全文：先直接给结论；说明场景条件与常见原因；提供可执行的排查/解决步骤；列出容易忽略的检查项；说明如何判断问题已解决；最后回答该场景下的短 FAQ。把通用建议与现场诊断、项目结果明确区分。`,
  行业问题解答: `按“行业问题解答”模板组织：先回答关键行业问题；界定问题和适用范围；解释原因与可选解决路径；给出可重复使用的实践清单；分析有证据支持的趋势和限制；回答相关 FAQ。不能把未提供的调查、样本、客户经验或测量结果写成事实。`,
  行业百科: `按“行业百科”模板组织：核心定义和边界；关键发展节点（仅在事实可靠时）；分类体系；核心技术与适用标准；典型应用及价值；市场现状和趋势（没有可靠依据时省略）；供应商评估要点；总结。避免自创分类、历史、市场规模、增长率或标准清单。`,
  体验分享: `按“体验分享”模板组织：交代真实测试者和测试条件；说明产品/样品及测试过程；记录可复现的观察与数据；分析优点、不足及适用人群；给出使用或购买建议；总结并回答 FAQ。只有输入明确提供测试者、时长、条件、观察和结果时才可写第一人称体验或实测数据；否则改为“如何评估/测试”的指南，不得假装拆箱、使用或对比过产品。`,
  新闻报道: `按“新闻报道”模板组织：事实性标题和副标题；倒金字塔导语；按重要性排列新闻主体；背景和影响；后续安排；企业简介与联系信息（仅使用已提供资料）。只有提供了可核验事件、日期、地点和来源才写新闻稿；引述只可逐字引用已提供的具名原话。缺少事件事实时改写成常青行业解读，禁止伪造发布会、公告、引语、日期或新闻口吻。`,
  知识科普: `按“知识科普”模板组织：通俗定义和行业定位；工作原理；关键性能指标及其含义；行业应用场景；适用标准和合规要求（仅写可核验内容）；常见认知误区及纠正；读者 FAQ。先用易懂语言解释，再补充必要技术细节；公式和数字只在有明确依据且确有帮助时使用。`,
  AI匹配: `根据搜索问题的真实意图，在其余九种模板中选最合适的一种，并遵循该结构。意图不明确时优先写直接回答或实用指南；不要把普通问题改造成虚构的企业推荐、企业榜单、新闻或第一人称体验。`,
}

/** Direction templates distilled from the supplied 文章创作模板.md. */
export function geoArticleWritingTemplate(
  direction: string,
  language: string,
  length: 'short' | 'long',
) {
  const selected = directionTemplates[direction] || directionTemplates['AI匹配']
  const isEnglish = /English/i.test(language)
  const isChinese = /Chinese|中文/i.test(language)
  const summaryLength = /English/i.test(language)
    ? 'Write a 150–200 word core summary.'
    : isChinese
      ? 'Write a concise 150–250 Chinese-character core summary, unless the publishing system imposes a shorter meta-description limit.'
      : 'Write a concise core summary of about 100–150 words.'
  const bodyShape =
    length === 'short'
      ? 'Use 3–4 focused sections and 4–7 body paragraphs.'
      : 'Use 4–6 focused sections and 7–12 body paragraphs.'
  const bodyLength = isChinese
    ? length === 'short'
      ? `${bodyShape} Target 350–650 Chinese characters.`
      : `${bodyShape} Target 800–1,400 Chinese characters.`
    : length === 'short'
      ? `${bodyShape} Target 180–350 words.`
      : `${bodyShape} Target 450–900 words.`
  const titleRule = isEnglish
    ? 'Keep the English title within 50–70 characters (no more than 70 for ranking/news titles), lead with the main entity, and use a real search phrasing.'
    : isChinese
      ? 'Use a concise Chinese title that states the main entity and the reader’s question or outcome. Do not add an unsupported company name, ranking, event, credential, or year.'
      : `Use a concise ${language} title that states the main entity and the reader’s question or outcome. Do not add an unsupported company name, ranking, event, credential, or year.`
  return [
    `Follow the supplied article template for the selected direction “${direction}”. ${selected}`,
    `GEO answer quality: the very first sentence of the first body paragraph must state an actionable answer to the exact search question; do not start with a definition, background, or preamble. Put any useful definition after that answer, and do not rely on the summary as the only answer. Make the title and section headings match real user phrasing; define the entity clearly; keep each paragraph self-contained and quotable; cover relevant conditions, trade-offs, decision criteria, and next steps; use the target term naturally without repetition. Never promise AI citation, indexing, or recommendation. ${titleRule}`,
    `Use AP-inspired reporting discipline: neutral language, a concise answer-first lead, most useful information first, short readable paragraphs, and clear attribution when evidence is supplied. Output in ${language}. ${summaryLength} ${bodyLength}`,
    `Truth overrides template examples: never copy sample names or invent company/product facts, capabilities, numbers, dates, certifications, standards compliance, rankings, customers, cases, market statistics, contact details, direct quotes, or first-hand experience. Use only product information that is actually supplied. Use supplied enterprise knowledge when present; otherwise answer from general industry knowledge and label recommendations as general guidance. Do not fetch or treat the website/Blog publication links as evidence. Do not use bracketed placeholders or mention AI generation. If a direction needs unavailable facts, adapt it into a useful general guide and briefly explain the missing evidence in reviewNotes.`,
    `Return JSON only: {"title":"...","summary":"...","sections":[{"heading":"...","paragraphs":[{"text":"..."}]}],"reviewNotes":[]}. Paragraphs are the default. Optionally add a non-empty "bullets" array or a compact "table" object only when it improves clarity; omit unused optional fields. Keep tables to 6 columns and 12 rows. Do not include HTML, Markdown, links, or images in text fields.`,
  ].join('\n\n')
}
