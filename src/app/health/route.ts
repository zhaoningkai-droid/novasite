import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@payload-config'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const payload = await getPayload({ config })
    await payload.count({ collection: 'tenants', overrideAccess: true })
    return NextResponse.json({ database: 'ok', status: 'ok', timestamp: new Date().toISOString() })
  } catch {
    return NextResponse.json({ database: 'unavailable', status: 'error' }, { status: 503 })
  }
}
