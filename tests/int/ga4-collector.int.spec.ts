// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://admin.example.com/s/approved/zh"}
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement as h } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ pathname: '/s/approved/zh', scripts: vi.fn() }))
vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }))
vi.mock('next/script', () => ({ default: (props: { src: string }) => { state.scripts(props.src); return null } }))
import { Ga4Collector } from '../../src/platform/analytics/Ga4Collector'
import { trackGa4Inquiry } from '../../src/platform/analytics/ga4-browser'
import { useInquirySubmission } from '../../src/platform/inquiry/useInquirySubmission'
import { renderHook, act } from '@testing-library/react'

const target = { slug: 'approved', origin: 'https://admin.example.com', mode: 'test_preview' as const, measurementId: 'G-EXAMPLE1', pathPrefix: '/s/approved/' }
const events = () => (window.dataLayer || []).map((item) => Array.from(item as ArrayLike<unknown>)).filter((command) => command[0] === 'event').map((command) => command[1])
beforeEach(() => {
  // Node 25 also exposes a separate experimental localStorage; use the browser's storage.
  vi.stubGlobal('localStorage', window.localStorage)
  vi.stubGlobal('sessionStorage', window.sessionStorage)
  localStorage.clear(); sessionStorage.clear(); window.dataLayer = []; state.scripts.mockReset()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

// User-selected event ownership and test-site boundary, plus consent and persisted-inquiry semantics.
// Next Script is mocked: no requests are sent to Google or a database.
describe('GA4 visitor/event flow', () => {
  it('counts the scoped realtime view once per page alongside the standard page_view', async () => {
    render(h(Ga4Collector, { target: { ...target, realtimeEventName: 'ns_pv_alpha' }, locale: 'zh' }))
    fireEvent.click(await screen.findByRole('button', { name: '允许统计' }))
    await waitFor(() => expect(events()).toEqual(['page_view', 'ns_pv_alpha']))
  })
  it('loads no Google tag before consent; deduplicates page/inquiry events and revokes tracking', async () => {
    const page = render(h(Ga4Collector, { target, locale: 'zh' }))
    await screen.findByRole('button', { name: '允许统计' })
    expect(state.scripts).not.toHaveBeenCalled()
    expect(events()).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: '允许统计' }))
    await waitFor(() => expect(state.scripts).toHaveBeenCalled())
    expect(events()).toEqual(['page_view'])
    page.rerender(h(Ga4Collector, { target, locale: 'zh' }))
    expect(events()).toEqual(['page_view'])
    act(() => { trackGa4Inquiry('other', 'id-1'); trackGa4Inquiry('approved', 'id-1'); trackGa4Inquiry('approved', 'id-1') })
    expect(events()).toEqual(['page_view', 'generate_lead'])
    const anchor = document.createElement('a'); anchor.href = 'https://wa.me/000000000'
    anchor.addEventListener('click', (event) => event.preventDefault()); document.body.append(anchor)
    fireEvent.click(anchor); anchor.remove()
    expect(events()).toContain('whatsapp_click')
    fireEvent.click(screen.getByRole('button', { name: '访问统计设置' }))
    fireEvent.click(screen.getByRole('button', { name: '拒绝' }))
    act(() => trackGa4Inquiry('approved', 'id-2'))
    expect(events().filter((event) => event === 'generate_lead')).toHaveLength(1)
  })
  it.each([200, 201, 400])('records conversions only for newly persisted HTTP 201 (response %i)', async (status) => {
    const lead = vi.fn(); window.novasiteGa4 = { slug: 'approved', lead }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: status < 400 }), { status })))
    const form = document.createElement('form')
    const hook = renderHook(() => useInquirySubmission())
    if (status === 400) await expect(hook.result.current(form, 'approved')).rejects.toThrow()
    else await hook.result.current(form, 'approved')
    expect(lead).toHaveBeenCalledTimes(status === 201 ? 1 : 0)
    delete window.novasiteGa4
  })
})
