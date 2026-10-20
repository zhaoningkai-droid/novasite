// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAnalyticsRefresh } from '../../src/platform/components/WorkspaceAnalytics/useAnalyticsRefresh'

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('analytics automatic updates', () => {
  it('refreshes every minute and cleans up on leaving the page', () => {
    const refresh = vi.fn()
    const hook = renderHook(() => useAnalyticsRefresh(refresh, false, 'alpha:30'))
    act(() => vi.advanceTimersByTime(59_999))
    expect(refresh).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(refresh).toHaveBeenCalledTimes(1)
    hook.unmount()
    act(() => vi.advanceTimersByTime(120_000))
    expect(refresh).toHaveBeenCalledTimes(1)
  })
  it('pauses hidden/offline requests and refreshes when returning online', () => {
    const refresh = vi.fn()
    renderHook(() => useAnalyticsRefresh(refresh, false, 'alpha:30'))
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => vi.advanceTimersByTime(60_000))
    expect(refresh).not.toHaveBeenCalled()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(refresh).not.toHaveBeenCalled()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    act(() => window.dispatchEvent(new Event('online')))
    expect(refresh).toHaveBeenCalledTimes(1)
  })
  it('does not overlap pending requests or retain an old company timer', () => {
    const refresh = vi.fn()
    const hook = renderHook(({ scope, pending }) => useAnalyticsRefresh(
      refresh, pending, scope,
    ), { initialProps: { scope: 'alpha:30', pending: true } })
    act(() => vi.advanceTimersByTime(60_000))
    expect(refresh).not.toHaveBeenCalled()
    hook.rerender({ scope: 'beta:7', pending: false })
    act(() => vi.advanceTimersByTime(60_000))
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
