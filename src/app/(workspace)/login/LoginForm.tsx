'use client'

import { ArrowRight, Eye, EyeOff, Globe2, LockKeyhole } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

type Props = { error?: string; redirectTo: string }
export function LoginForm({ error, redirectTo }: Props) {
  const [visible, setVisible] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  return <main className="novasite-login">
    <section className="novasite-login__brand" aria-label="NovaSite 平台介绍">
      <Link className="novasite-login__logo" href="/login" aria-label="NovaSite 登录">
        <span aria-hidden="true"><Globe2 size={28} /></span><strong>NOVA<span>SITE</span></strong>
      </Link>
      <div className="novasite-login__intro">
        <p>独立站运营工作台</p><h1>每一个客户网站，都有清晰的工作空间。</h1>
        <span>从产品与文章到多语言和网站设置，在同一个后台完成日常维护。</span>
        <ul><li>公司独立管理</li><li>九套行业模板</li><li>四语内容维护</li><li>网站即时预览</li></ul>
      </div>
    </section>
    <section className="novasite-login__panel">
      <form action="/api/login" className="novasite-login__card" method="post"
        onSubmit={(event) => { if (submitting) event.preventDefault(); else setSubmitting(true) }}>
        <span className="novasite-login__lock" aria-hidden="true"><LockKeyhole size={25} /></span>
        <h2>欢迎回来</h2><p>登录后选择你要管理的客户公司。</p>
        <input name="redirect" type="hidden" value={redirectTo} />
        <label>用户名或邮箱<input autoComplete="username" name="email" required /></label>
        <label>密码<div className="novasite-login__password">
          <input autoComplete="current-password" name="password" required
            type={visible ? 'text' : 'password'} />
          <button aria-label={visible ? '隐藏密码' : '显示密码'} aria-pressed={visible}
            className="novasite-login__password-toggle" onClick={() => setVisible(!visible)}
            type="button">{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>
        </div></label>
        {error && <p className="novasite-login__error" role="alert">{error}</p>}
        <button disabled={submitting} type="submit">
          {submitting ? '正在登录…' : '登录工作台'}<ArrowRight size={17} aria-hidden="true" />
        </button>
        <small>仅限已获授权的运营人员</small>
      </form>
    </section>
  </main>
}
