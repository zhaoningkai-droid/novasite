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
  const account = String(form.get('email') || '').trim()
  const password = String(form.get('password') || '')
  const redirectTo = safeRedirect(form.get('redirect'))

  if (!account || !password) {
    return redirect(loginPath('missing', redirectTo))
  }

  try {
    const payload = await getPayload({ config })
    let email = account
    if (!account.includes('@')) {
      // Resolve only the login identity; password verification and account locks
      // remain in Payload. Never expose the lookup result or accept ambiguous names.
      const matchingUsers = await payload.find({
        collection: 'users',
        depth: 0,
        limit: 2,
        overrideAccess: true,
        select: { email: true },
        where: { name: { equals: account } },
      })
      if (matchingUsers.totalDocs !== 1 || !matchingUsers.docs[0]?.email) {
        return redirect(loginPath('invalid', redirectTo))
      }
      email = matchingUsers.docs[0].email
    }
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
      secure: process.env.NODE_ENV === 'production',
    })
    return response
  } catch (error) {
    const candidate = error instanceof Error ? error as Error & { code?: unknown } : undefined
    console.error('[login] Authentication operation failed', candidate
      ? { name: candidate.name, code: candidate.code, message: candidate.message }
      : { message: String(error) })
    return redirect(loginPath('invalid', redirectTo))
  }
}
