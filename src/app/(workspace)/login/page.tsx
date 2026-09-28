import { LoginForm } from './LoginForm'

type Props = {
  searchParams: Promise<{ error?: string | string[]; redirect?: string | string[] }>
}

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams
  const redirectTo = typeof params.redirect === 'string' && params.redirect.startsWith('/') && !params.redirect.startsWith('//')
    ? params.redirect
    : '/workspace/companies'

  const error = params.error === 'invalid'
    ? '账号或密码不正确，请重试。'
    : params.error === 'missing'
      ? '请输入账号和密码。'
      : undefined

  return <LoginForm error={error} redirectTo={redirectTo} />
}
