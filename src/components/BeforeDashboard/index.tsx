import React from 'react'
import Link from 'next/link'

import './index.scss'

const BeforeDashboard = () => {
  return (
    <section className="ops-dashboard">
      <div className="ops-dashboard__hero">
        <div>
          <span className="ops-dashboard__kicker">NOVASITE · 客户独立站运营平台</span>
          <h1>请选择需要管理的公司</h1>
          <p>公司专属工作台会以网址和顶部名称绑定当前客户，避免不同客户的数据混在同一编辑上下文中。</p>
        </div>
        <Link className="ops-dashboard__select-link" href="/workspace/companies">选择公司</Link>
      </div>
    </section>
  )
}

export default BeforeDashboard
