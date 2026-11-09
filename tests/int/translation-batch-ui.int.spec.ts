import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useContentTranslation } from '../../src/platform/components/WorkspaceTranslations/useContentTranslation'

const mocks = vi.hoisted(() => ({ router: { refresh: vi.fn() } }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))

const ids = Array.from({ length: 51 }, (_, index) => index + 1)
const view = (productID: number, locked = false) => ({
  productID, locked, canTranslate: !locked, status: locked ? 'queued' : 'pending',
  jobID: locked ? `job-${productID}` : undefined, total: 1, completed: 0, languages: [],
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('translation batch receipts and missing responses', () => {
  it('sends all 51 IDs before it can say the user can leave', async () => {
    let finish!: (response: Response) => void
    const post = new Promise<Response>((resolve) => { finish = resolve })
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      if (init.method === 'POST') return post
      const readIDs = new URL(url, 'http://localhost').searchParams.get('ids')!.split(',').map(Number)
      return Response.json({ enabled: true, views: readIDs.map((id) => view(id)) })
    })
    vi.stubGlobal('fetch', fetch)
    const { result } = renderHook(() => useContentTranslation('sample', 'product-categories', ids))
    await waitFor(() => expect(result.current.ready).toBe(true))
    let submitted!: Promise<boolean>
    act(() => { submitted = result.current.translate(ids) })
    const calls = fetch.mock.calls.filter(([, init]) => init.method === 'POST')
    expect(calls).toHaveLength(1)
    expect(JSON.parse(String(calls[0][1].body)).ids).toEqual(ids)
    expect(result.current.submitting).toBe(true)
    expect(result.current.notice).toBe('')
    await act(async () => {
      finish(Response.json({
        accepted: ids.slice(0, 49).map((productID) => ({ productID, jobID: `job-${productID}` })),
        skipped: [50, 51], skipReasons: { 50: 'completed', 51: 'no_source' },
      }))
      expect(await submitted).toBe(true)
    })
    expect(result.current.notice).toBe('已提交 49 项，1 项已翻译，1 项无可翻译的源内容。现在可以离开页面。')
  })

  it('reads durable state when the response is lost without sending another POST', async () => {
    let received = false
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      if (init.method === 'POST') { received = true; throw new TypeError('connection lost') }
      return Response.json({ enabled: true, views: [view(1, received)] })
    })
    vi.stubGlobal('fetch', fetch)
    const { result } = renderHook(() => useContentTranslation('sample', 'product-categories', [1]))
    await waitFor(() => expect(result.current.ready).toBe(true))
    await act(async () => { expect(await result.current.translate([1])).toBe(false) })
    await waitFor(() => expect(result.current.views[1]?.jobID).toBe('job-1'))
    expect(result.current.notice).toBe('')
    expect(result.current.error).toContain('未收到整批提交确认')
    expect(fetch.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(1)
  })

  it('ignores the previous company response after switching companies', async () => {
    let finish!: (response: Response) => void
    const post = new Promise<Response>((resolve) => { finish = resolve })
    const fetch = vi.fn(async (url: string, init: RequestInit) =>
      init.method === 'POST' ? post : Response.json({ enabled: true, views: [view(url.includes('/new/') ? 2 : 1)] }))
    vi.stubGlobal('fetch', fetch)
    const { result, rerender } = renderHook(({ company, id }) => useContentTranslation(company, 'product-categories', [id]),
      { initialProps: { company: 'old', id: 1 } })
    await waitFor(() => expect(result.current.ready).toBe(true))
    let submitted!: Promise<boolean>
    act(() => { submitted = result.current.translate([1]) })
    rerender({ company: 'new', id: 2 })
    expect(fetch.mock.calls.find(([, init]) => init.method === 'POST')?.[1].signal?.aborted).toBe(true)
    await act(async () => {
      finish(Response.json({ accepted: [{ productID: 1, jobID: 'old-job' }], skipped: [] }))
      expect(await submitted).toBe(false)
    })
    expect(result.current.notice).toBe('')
    expect(result.current.views[1]).toBeUndefined()
    expect(result.current.views[2]?.canTranslate).toBe(true)
  })
})
