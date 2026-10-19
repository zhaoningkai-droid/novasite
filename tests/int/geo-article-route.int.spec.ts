// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
const handle = vi.hoisted(() => vi.fn(async () => Response.json({ item: { id: 'saved' } })))
vi.mock('../../src/platform/geo/article-api', () => ({ handleGeoArticles: handle }))
import { POST } from '../../src/app/(workspace)/api/workspace/[company]/geo/articles/route'

describe('GEO direct article HTTP entry', () => {
  it('routes POST to authenticated article creation with the URL company', async () => {
    const request = new Request('http://localhost:3100/api/workspace/1/geo/articles', {
      method: 'POST',
    })
    const result = await POST(request, { params: Promise.resolve({ company: '1' }) })
    expect(handle).toHaveBeenCalledWith(request, '1')
    expect(await result.json()).toEqual({ item: { id: 'saved' } })
  })
})
