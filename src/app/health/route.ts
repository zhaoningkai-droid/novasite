import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@payload-config'

export const dynamic = 'force-dynamic'

function describeError(error: unknown) {
  if (error instanceof Error) {
    const candidate = error as Error & { code?: unknown }
    return { name: candidate.name, code: candidate.code, message: candidate.message }
  }
  return { message: String(error) }
}

export async function GET() {
  try {
    const payload = await getPayload({ config })
    await payload.count({ collection: 'tenants', overrideAccess: true })
    return NextResponse.json({ database: 'ok', status: 'ok', timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('[health] Payload check failed', describeError(error))
    return NextResponse.json({ database: 'unavailable', status: 'error' }, { status: 503 })
  }
}
