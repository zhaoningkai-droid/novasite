// Stable keys and IDs stay unchanged when display names are updated.
export const legacyTemplates = [
  { key: 'power-engineering-v1', name: '深蓝工业 · 经典', tone: 'industrial',
    description: '深蓝导航、宽幅工业首屏与橙色行动按钮，适合工厂实力与产品展示。' },
  { key: 'precision-light-v1', name: '明亮科技 · 精密', tone: 'technical',
    description: '浅色背景、清晰技术信息与轻盈产品卡片，适合精密制造和技术型企业。' },
  { key: 'executive-industrial-pro-v1', name: '商务工业 · 专业', tone: 'executive',
    description: '强视觉首屏、能力信息面板与资质展示，适合专业外贸 B2B 官网。' },
  { key: 'atelier-industry-v1', name: '极简画册 · 工业', tone: 'atelier',
    description: '大幅留白、编号式章节与画册产品展示，适合强调设计和品牌质感的企业。' },
] as const
export const getLegacyTemplate = (key: string) => legacyTemplates.find((item) => item.key === key)
