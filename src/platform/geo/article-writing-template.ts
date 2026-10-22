import { geoArticleTemplates } from './article-template-data'

export type GeoArticleTemplateDirection = keyof typeof geoArticleTemplates
export const geoArticleTemplateDirections = Object.keys(
  geoArticleTemplates,
) as GeoArticleTemplateDirection[]

export function geoArticleTemplateSections(direction: string): readonly string[] {
  if (!(direction in geoArticleTemplates)) return []
  const template = geoArticleTemplates[direction as GeoArticleTemplateDirection]
  const sections = template.sections.filter((heading) => !heading.startsWith('适配场景'))
  return direction === '新闻报道' ? ['副标题', '导语', ...sections] : sections
}

/** Keep the supplied template intact; length changes detail, never chapter coverage. */
export function geoArticleWritingTemplate(
  direction: string,
  language: string,
  length: 'short' | 'long',
) {
  const selected = geoArticleTemplates[direction as GeoArticleTemplateDirection]
  const templates = selected
    ? selected.instructions
    : geoArticleTemplateDirections
        .map(
          (name) =>
            `${name}正文顺序：${geoArticleTemplateSections(name).join(' → ')}\n${geoArticleTemplates[name].instructions}`,
        )
        .join('\n')
  return [
    `严格使用用户提供的《文章创作模板.md》创作，当前方向：${direction}。全文使用${language}；中文文章不附英文翻译。`,
    selected
      ? `逐项完成以下正文板块，顺序不变，不合并、不省略、不换成其他创作方向：${geoArticleTemplateSections(direction).join(' → ')}。标题放title，核心摘要放summary，并在正文之前呈现。适配场景、内容规则和模板占位符是写作说明，不是文章正文。`
      : `AI匹配：根据当前搜索问题从全部十个方向评估最适合的五个方向，返回matchedDirections，随机选择其中一个作为selectedDirection，并完整执行该方向的全部章节。不得始终只从产品介绍、技术解读、场景化问题解答中选择。各方向结构如下：`,
    templates,
    `篇幅设置${length === 'short' ? '短篇：每个板块精炼表达' : '长篇：各板块充分展开，解释原因、步骤、条件、对比及具体案例'}。完整性优先，不设总字数、章节数或段落数的业务上限；不得为了凑短篇或输出预算删减任何章节。FAQ采用真实采购方问法并逐项回答，不能只写标题或提纲。列表、参数和对比用清晰表格，场景、功能、FAQ用H3子标题。`,
    `当前是用户授权的测试创作环境，没有知识库也直接生成完整文章，不要求先上传资料、抓取网站或补资料，不因资料为空拒绝生成、压缩章节或改变方向。使用当前品牌、核心词和细分词；模板里的企业、产品及联系方式只是结构示例，替换成当前主题。允许构造测试案例、测试数据、榜单和体验叙述以完成全部板块；示例数据不应伪称外部机构已核验，不捏造真实人物的具名引语。不要输出缺少资料、待补充、无法生成之类提示或占位符。未提供电话、邮箱时使用已配置的官网和Blog作为联系渠道。`,
    `行文遵循美联社风格：事实和结论前置、短句短段、清晰归属、客观可读，避免空话和关键词堆砌。GEO问题是读者的采购意图，正文需给出供应商选择、适配条件和实际行动，不要把供应商问题写成纯技术课。不同方向保留各自定义、导语或体验开篇，不强制全部以同一句式开头。不承诺被AI收录或推荐。官网和Blog仅为发文链接，不读取其内容作为写作前置条件。`,
    `仅返回JSON：{"title":"文章标题","summary":"完整核心摘要","selectedDirection":"${direction === 'AI匹配' ? '所选具体创作方向' : direction}","sections":[{"heading":"模板正文板块标题","paragraphs":[{"text":"完整段落"}],"subsections":[{"heading":"具体问题或功能子标题","paragraphs":[{"text":"完整回答"}]}]}],"reviewNotes":[]}。每个板块必须有完整内容。可选bullets为字符串数组，table为{"headers":["列名"],"rows":[["内容"]]}；子章节也可使用bullets和table，omit unused optional fields。标题和正文文本不含HTML、Markdown或图片；发布链接和图片由系统加入。`,
  ].join('\n\n')
}
