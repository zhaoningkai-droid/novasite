import { createElement as h } from 'react'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  WorkspaceFeedback,
  showWorkspaceError,
} from '../../src/platform/components/TransientNotice/WorkspaceFeedback'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
const settle = async () =>
  act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })

describe('User-requested workspace error messages', () => {
  it.each(['geo-workspace__error', 'ws-entry-editor__feedback is-error'])(
    'shows %s as a two-second popup instead of a banner',
    async (className) => {
      const view = render(
        h('div', null, h(WorkspaceFeedback), h('p', { role: 'alert', className }, '保存未完成')),
      )
      await settle()
      expect(view.container.querySelector('p')?.dataset.workspaceErrorSource).toBe('true')
      expect(document.querySelector('[data-workspace-toast]')?.textContent).toContain('保存未完成')
      await act(() => vi.advanceTimersByTimeAsync(1999))
      expect(document.querySelector('[data-workspace-toast]')).not.toBeNull()
      await act(() => vi.advanceTimersByTimeAsync(1))
      expect(document.querySelector('[data-workspace-toast]')).toBeNull()
    },
  )
  it('can display the same validation error again after the previous popup expired', async () => {
    render(h(WorkspaceFeedback))
    act(() => showWorkspaceError('请输入有效链接'))
    await act(() => vi.advanceTimersByTimeAsync(2000))
    expect(document.querySelector('[data-workspace-toast]')).toBeNull()
    act(() => showWorkspaceError('请输入有效链接'))
    expect(document.querySelector('[data-workspace-toast]')?.textContent).toContain(
      '请输入有效链接',
    )
  })
  it('replaces browser validation bubbles without submitting the form', async () => {
    const submit = vi.fn()
    const view = render(
      h(
        'div',
        null,
        h(WorkspaceFeedback),
        h('form', { onSubmit: submit }, h('input', { required: true })),
      ),
    )
    const input = view.container.querySelector('input')!
    const invalid = new Event('invalid', { cancelable: true })
    input.dispatchEvent(invalid)
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(invalid.defaultPrevented).toBe(true)
    expect(document.querySelector('[data-workspace-toast]')).not.toBeNull()
    expect(submit).not.toHaveBeenCalled()
  })
  it('shows an unchanged form error again when the user retries saving', async () => {
    const view = render(
      h(
        'div',
        null,
        h(WorkspaceFeedback),
        h('p', { role: 'alert' }, '保存失败'),
        h('button', null, '保存'),
      ),
    )
    await settle()
    await act(() => vi.advanceTimersByTimeAsync(2000))
    fireEvent.click(view.getByRole('button', { name: '保存' }))
    await settle()
    expect(document.querySelector('[data-workspace-toast]')?.textContent).toContain('保存失败')
  })
  it('restores a reused feedback element when it changes from error to success', async () => {
    const content = (error: boolean) =>
      h(
        'div',
        null,
        h(WorkspaceFeedback),
        h('p', { role: error ? 'alert' : 'status' }, error ? '保存失败' : '保存成功'),
      )
    const view = render(content(true))
    await settle()
    view.rerender(content(false))
    await settle()
    expect(view.container.querySelector('p')?.hasAttribute('data-workspace-error-source')).toBe(
      false,
    )
    expect(view.getByRole('status').textContent).toBe('保存成功')
  })
})
