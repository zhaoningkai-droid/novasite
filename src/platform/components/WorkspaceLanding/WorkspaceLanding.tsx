import type { WorkspaceCompany } from '@/platform/workspace'

import './workspace-landing.scss'

type Props = { company: WorkspaceCompany }

export function WorkspaceLanding({ company }: Props) {
  return <main className="workspace-landing">
    <section className="workspace-landing__body" aria-labelledby="workspace-summary-title">
      <p className="workspace-landing__eyebrow">独立站管理工作台</p><h1>当前工作公司：{company.name}</h1>
      <p className="workspace-landing__breadcrumb">公司工作台 / 网站数据</p>
      <h2 id="workspace-summary-title">{company.name} 的专属工作台</h2>
      <p className="workspace-landing__intro">此工作台只会显示并管理当前公司的独立站内容。页面地址和顶部名称会始终标明当前公司，避免误操作到其他客户站点。</p>
      <dl className="workspace-landing__details">
        <div><dt>网站标识</dt><dd>{company.slug}</dd></div>
        <div><dt>主域名</dt><dd>{company.primaryDomain || '暂未绑定'}</dd></div>
        <div><dt>网站状态</dt><dd>{company.status === 'published' ? '已发布' : company.status === 'suspended' ? '已暂停' : '搭建中'}</dd></div>
      </dl>
      <div className="workspace-landing__next"><h3>本工作台将包含</h3><ul><li>网站数据：流量与询盘概览</li><li>网站配置：首页、分类、内容、固定页面和导航</li><li>站点管理：语言版本、域名和发布状态</li></ul><p>这些功能会在后续步骤按确认顺序接入；本步只建立受权限保护的公司专属入口，不修改任何客户内容。</p></div>
    </section>
  </main>
}
