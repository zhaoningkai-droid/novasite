import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@payload-config'

const defaultRedirect = '/workspace/companies'

function safeRedirect(value: FormDataEntryValue | null): string {
  const destination = typeof value === 'string' ? value : ''
  return destination.startsWith('/') && !destination.startsWith('//')
    ? destination
    : defaultRedirect
}

function redirect(location: string): NextResponse {
  // The tunnel forwards requests to localhost. A relative Location preserves the
  // public hostname instead of sending the browser to localhost after login.
  return new NextResponse(null, { headers: { Location: location }, status: 303 })
}

function loginPath(error: 'invalid' | 'missing', redirectTo: string): string {
  return `/login?error=${error}&redirect=${encodeURIComponent(redirectTo)}`
}

export async function POST(request: Request) {
  const form = await request.formData()
  const email = String(form.get('email') || '').trim()
  const password = String(form.get('password') || '')
  const redirectTo = safeRedirect(form.get('redirect'))

  if (!email || !password) {
    return redirect(loginPath('missing', redirectTo))
  }

  try {
    const payload = await getPayload({ config })
    const result = await payload.login({
      collection: 'users',
      data: { email, password },
      overrideAccess: false,
    })

    if (!result.token) {
      return redirect(loginPath('invalid', redirectTo))
    }

    const expiresAt = (result.user as { expiresAt?: string | null } | undefined)?.expiresAt
    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
      return redirect(loginPath('invalid', redirectTo))
    }

    const response = redirect(redirectTo)
    response.cookies.set('payload-token', result.token, {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
    })
    return response
  } catch {
    return redirect(loginPath('invalid', redirectTo))
  }
}
