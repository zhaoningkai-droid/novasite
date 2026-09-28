import { type CollectionConfig, type CollectionBeforeChangeHook } from 'payload'

import { assignedTenants, siteAdmins, superAdmins } from '../access/roles'

const guardTemplateSelection: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  if (req.context?.templateChangeService || !originalDoc || !Object.hasOwn(data, 'selectedTemplate')) {
    return data
  }
  const oldTemplate = typeof originalDoc.selectedTemplate === 'number'
    ? originalDoc.selectedTemplate
    : originalDoc.selectedTemplate?.id ?? null
  const nextTemplate = typeof data.selectedTemplate === 'number'
    ? data.selectedTemplate
    : data.selectedTemplate?.id ?? null
  if (oldTemplate !== nextTemplate) {
    throw new Error('模板请选择站点管理中的模板库进行应用，以便保留版本记录。')
  }
  return data
}

export const Tenants: CollectionConfig = {
  slug: 'tenants',
  labels: { singular: '站点', plural: '站点管理' },
  access: {
    create: superAdmins,
    delete: superAdmins,
    read: assignedTenants,
    update: siteAdmins,
  },
  admin: {
    group: '建站与发布',
    defaultColumns: ['name', 'primaryDomain', 'status', 'workspace', 'updatedAt'],
    useAsTitle: 'name',
  },
  hooks: { beforeChange: [guardTemplateSelection] },
  fields: [
    { name: 'name', label: '站点名称', type: 'text', required: true },
    {
      name: 'workspace',
      label: '工作台',
      type: 'ui',
      admin: {
        disableListColumn: false,
        components: {
          Cell: '@/components/Workspace/EnterWorkspaceCell#EnterWorkspaceCell',
        },
      },
    },
    { name: 'slug', label: '站点标识', type: 'text', required: true, unique: true, index: true },
    {
      name: 'status',
      label: '站点状态',
      type: 'select',
      defaultValue: 'building',
      required: true,
      options: [
        { label: '搭建中', value: 'building' },
        { label: '已发布', value: 'published' },
        { label: '已暂停', value: 'suspended' },
      ],
    },
    {
      name: 'primaryDomain',
      label: '主域名',
      type: 'text',
      admin: { description: '不含协议，例如 www.volttrans.com。未绑定域名时可留空。' },
    },
    {
      name: 'previewDomain',
      label: '临时预览域名',
      type: 'text',
      admin: { description: '平台自动分配的预览地址。' },
    },
    {
      name: 'defaultLocale',
      label: '默认语言',
      type: 'select',
      defaultValue: 'en',
      required: true,
      options: [
        { label: '英语', value: 'en' },
        { label: '简体中文', value: 'zh' },
        { label: '俄语', value: 'ru' },
        { label: '印尼语', value: 'id' },
      ],
    },
    {
      name: 'selectedTemplate',
      label: '当前模板',
      type: 'relationship',
      relationTo: 'templates',
      filterOptions: { status: { equals: 'published' } },
      admin: {
        description: '只读展示当前模板；请在站点管理的模板库中预览、应用或恢复版本。',
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'templateVersion',
      label: '模板版本',
      type: 'text',
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'templateAppliedAt',
      label: '模板应用时间',
      type: 'date',
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'templateRevision',
      label: '模板修订号',
      type: 'number',
      defaultValue: 0,
      admin: { hidden: true },
    },
    {
      name: 'templateSettings',
      label: '模板展示设置',
      type: 'json',
      defaultValue: {},
      admin: { hidden: true, description: '受模板注册表校验的展示覆盖，不存储客户内容。' },
    },
    {
      name: 'enabledLocales',
      label: '启用语言',
      type: 'select',
      hasMany: true,
      defaultValue: ['en', 'zh', 'ru', 'id'],
      required: true,
      options: [
        { label: '英语', value: 'en' },
        { label: '简体中文', value: 'zh' },
        { label: '俄语', value: 'ru' },
        { label: '印尼语', value: 'id' },
      ],
    },
    {
      name: 'branding',
      label: '品牌信息',
      type: 'group',
      fields: [
        { name: 'companyName', label: '公司名称', type: 'text', localized: true, required: true },
        { name: 'tagline', label: '品牌标语', type: 'text', localized: true },
        { name: 'logo', label: '网站 Logo', type: 'upload', relationTo: 'media' },
        {
          name: 'favicon',
          label: '浏览器图标（Favicon）',
          type: 'upload',
          relationTo: 'media',
          admin: { description: '显示在浏览器标签页的小图标。建议上传正方形 PNG 或 ICO 文件。' },
        },
        { name: 'primaryColor', label: '品牌主色', type: 'text', defaultValue: '#0B3B60' },
        { name: 'accentColor', label: '强调色', type: 'text', defaultValue: '#F97316' },
        {
          name: 'heroImageURL',
          label: '首页主视觉 URL',
          type: 'text',
          defaultValue: 'https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&w=2000&q=85',
        },
        { name: 'mobileHeroImageURL', label: '移动端 Banner URL', type: 'text' },
        { name: 'navigationBannerURL', label: '导航 Banner URL', type: 'text' },
      ],
    },
    {
      name: 'contact',
      label: '询盘与联系方式',
      type: 'group',
      fields: [
        { name: 'email', label: '接收询盘邮箱', type: 'email' },
        { name: 'phone', label: '联系电话', type: 'text' },
        { name: 'whatsapp', label: 'WhatsApp', type: 'text' },
        { name: 'wechatInternationalQRCode', label: 'WeChat 二维码', type: 'upload', relationTo: 'media' },
        { name: 'wechatQRCode', label: '微信二维码', type: 'upload', relationTo: 'media' },
        { name: 'whatsappQRCode', label: 'WhatsApp 二维码', type: 'upload', relationTo: 'media' },
        { name: 'address', label: '公司地址', type: 'textarea', localized: true },
        { name: 'linkedin', label: 'LinkedIn', type: 'text' },
      ],
    },
    {
      name: 'seo',
      label: '全局 Google SEO',
      type: 'group',
      fields: [
        { name: 'titleSuffix', label: '标题后缀', type: 'text', localized: true },
        { name: 'defaultDescription', label: '默认描述', type: 'textarea', localized: true },
        { name: 'googleSiteVerification', label: 'Google Search Console 验证码', type: 'text' },
        { name: 'googleAnalyticsId', label: 'Google Analytics ID', type: 'text' },
        { name: 'indexingEnabled', label: '允许搜索引擎收录', type: 'checkbox', defaultValue: false },
      ],
    },
    {
      name: 'siteNavigation',
      label: '网站导航',
      type: 'array',
      admin: {
        hidden: true,
        description: '旧版导航字段，已由“网站导航”统一管理，保留历史数据但不再编辑。',
      },
      fields: [
        { name: 'label', label: '菜单名称', type: 'text', localized: true },
        { name: 'href', label: '链接地址', type: 'text', required: true, admin: { description: '站内链接以 / 开头，例如 /products。' } },
        {
          name: 'children', label: '二级菜单', type: 'array', fields: [
            { name: 'label', label: '二级菜单名称', type: 'text', localized: true },
            { name: 'href', label: '二级菜单链接', type: 'text', required: true },
          ],
        },
      ],
    },
    {
      name: 'fixedPages',
      label: '固定页面编辑',
      type: 'group',
      fields: [
        {
          name: 'homepage', label: '首页模块', type: 'group', fields: [
            { name: 'heroEyebrow', label: '首屏眉题', type: 'text', localized: true },
            { name: 'heroTitle', label: '首屏主标题', type: 'text', localized: true },
            { name: 'heroDescription', label: '首屏说明', type: 'textarea', localized: true },
            { name: 'banners', label: '首页 Banner 列表', type: 'json', admin: { hidden: true } },
            { name: 'showCompanyIntro', label: '显示企业介绍', type: 'checkbox', defaultValue: true },
            { name: 'companyIntroTitle', label: '企业介绍标题', type: 'text', localized: true },
            { name: 'companyIntro', label: '企业介绍正文', type: 'textarea', localized: true },
            { name: 'showStrength', label: '显示企业实力数字', type: 'checkbox', defaultValue: true },
            { name: 'showFeaturedProducts', label: '显示推荐产品', type: 'checkbox', defaultValue: true },
            { name: 'showVideo', label: '显示宣传视频', type: 'checkbox', defaultValue: false },
            { name: 'videoTitle', label: '宣传视频标题', type: 'text', localized: true },
            { name: 'videoDescription', label: '宣传视频说明', type: 'textarea', localized: true },
            { name: 'videoURL', label: '宣传视频嵌入链接', type: 'text', admin: { description: '填写公开 HTTPS 视频链接。' } },
            { name: 'videoSource', label: '视频来源', type: 'select', defaultValue: 'external', options: [{ label: '第三方链接', value: 'external' }, { label: '本地视频', value: 'local' }], admin: { hidden: true } },
            { name: 'videoMedia', label: '本地宣传视频', type: 'upload', relationTo: 'media', admin: { hidden: true } },
            { name: 'featuredNewsCategory', label: '首页推荐新闻分类', type: 'relationship', relationTo: 'news-categories', admin: { hidden: true } },
            { name: 'introImage', label: '首页企业介绍主图', type: 'upload', relationTo: 'media', admin: { hidden: true } },
            {
              name: 'strengthItems', label: '企业实力数字', type: 'array', fields: [
                { name: 'image', label: '展示图片', type: 'upload', relationTo: 'media' },
                { name: 'value', label: '数字', type: 'text', required: true },
                { name: 'unit', label: '单位', type: 'text' },
                { name: 'label', label: '说明', type: 'text', localized: true, required: true },
                { name: 'sortOrder', label: '排序', type: 'number', defaultValue: 0 },
              ],
            },
            { name: 'showInquiryForm', label: '显示首页询盘表单', type: 'checkbox', defaultValue: true },
            { name: 'inquiryTitle', label: '首页询盘标题', type: 'text', localized: true },
            { name: 'inquiryDescription', label: '首页询盘说明', type: 'textarea', localized: true },
            { name: 'inquiryRequiredFields', label: '首页询盘必填项', type: 'json', admin: { hidden: true } },
            { name: 'showNews', label: '显示推荐新闻', type: 'checkbox', defaultValue: true },
            { name: 'showCases', label: '显示推荐案例', type: 'checkbox', defaultValue: true },
          ],
        },
        {
          name: 'about', label: '关于我们页面', type: 'group', fields: [
            { name: 'title', label: '页面标题', type: 'text', localized: true },
            { name: 'intro', label: '企业简介', type: 'textarea', localized: true },
            { name: 'certificates', label: '证书资质说明', type: 'textarea', localized: true },
            {
              name: 'modules', label: '企业介绍模块', type: 'array', fields: [
                { name: 'image', label: '模块图片', type: 'upload', relationTo: 'media' },
                { name: 'title', label: '模块名称', type: 'text', localized: true, required: true },
                { name: 'description', label: '模块描述', type: 'textarea', localized: true, required: true },
                { name: 'sortOrder', label: '排序', type: 'number', defaultValue: 0 },
              ],
            },
            { name: 'showStrength', label: '显示企业实力数字', type: 'checkbox', defaultValue: true },
          ],
        },
        {
          name: 'contactPage', label: '联系我们页面', type: 'group', fields: [
            { name: 'title', label: '页面标题', type: 'text', localized: true },
            { name: 'intro', label: '联系说明', type: 'textarea', localized: true },
            { name: 'showInquiryForm', label: '显示询盘表单', type: 'checkbox', defaultValue: true },
          ],
        },
        {
          name: 'footer', label: '网站页脚', type: 'group', admin: { hidden: true }, fields: [
            { name: 'intro', label: '公司简介', type: 'textarea', localized: true },
            { name: 'socialLinks', label: '社媒链接', type: 'json', admin: { hidden: true } },
            {
              name: 'quickLinks', label: '快速导航', type: 'array', fields: [
                { name: 'label', label: '链接名称', type: 'text', localized: true },
                { name: 'href', label: '链接地址', type: 'text', required: true },
              ],
            },
          ],
        },
      ],
    },
  ],
  timestamps: true,
}
