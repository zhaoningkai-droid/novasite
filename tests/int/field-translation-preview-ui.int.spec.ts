import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AITranslateField } from '../../src/platform/components/WorkspaceTranslations/AITranslateField'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('recovers a preview after leaving and applies it only to the same source on request', async () => {
  const id = '00000000-0000-4000-8000-000000000001'
  let status: 'queued' | 'succeeded' | undefined
  const submit = vi.fn(async (_url: string, options: RequestInit) => {
    const input = JSON.parse(String(options.body))
    if (input.action === 'generate') status = 'queued'
    return Response.json({
      preview: status ? {
        id, status, matchesSource: input.text === '原名称',
        original: input.text !== '原名称' ? '原名称' : undefined,
        translation: status === 'succeeded' ? 'Original name' : null,
      } : null,
    })
  })
  vi.stubGlobal('fetch', submit)
  const onApply = vi.fn()
  const props = {
    companySlug: 'fixture', productID: 42, field: 'title' as const, defaultSourceLocale: 'zh' as const,
    sources: [{ code: 'zh' as const, label: '简体中文', value: '原名称' }],
    targetLocale: 'en' as const, targetValue: '', onApply,
  }
  const open = () => fireEvent.click(screen.getByRole('button', { name: 'AI 翻译' }))
  const initial = render(createElement(AITranslateField, props))
  open()
  const generate = await screen.findByRole('button', { name: '生成译文' }) as HTMLButtonElement
  await waitFor(() => expect(generate.disabled).toBe(false))
  fireEvent.click(generate)
  await screen.findByText('已排队，可以离开页面。')
  expect(onApply).not.toHaveBeenCalled()
  initial.unmount()

  status = 'succeeded'
  const resumed = render(createElement(AITranslateField, props))
  open()
  const field = await screen.findByRole('textbox', { name: '译文预览' }) as HTMLTextAreaElement
  expect(field.value).toBe('Original name')
  expect(onApply).not.toHaveBeenCalled()
  const apply = () => screen.getByRole('button', { name: '填入此字段' }) as HTMLButtonElement

  resumed.rerender(createElement(AITranslateField, { ...props, sources: [{ ...props.sources[0], value: '新名称' }] }))
  await screen.findByText('这是另一份原文的预览。请核对旧原文，或基于当前内容重新生成。')
  expect(apply().disabled).toBe(true)
  resumed.rerender(createElement(AITranslateField, props))
  await screen.findByRole('textbox', { name: '译文预览' })
  fireEvent.click(apply())
  expect(onApply).toHaveBeenCalledExactlyOnceWith('Original name')
  expect(submit.mock.calls.filter(([, options]) => JSON.parse(String(options.body)).action === 'generate')).toHaveLength(1)
})

it('requires explicit confirmation before retrying an unknown result', async () => {
  const id = '00000000-0000-4000-8000-000000000001'
  let status = 'unknown'
  const submit = vi.fn(async (_url: string, options: RequestInit) => {
    const input = JSON.parse(String(options.body))
    if (input.action === 'retry-unknown') status = 'queued'
    return Response.json({ preview: { id, status, matchesSource: true, translation: null } })
  })
  vi.stubGlobal('fetch', submit)
  const onApply = vi.fn()
  render(createElement(AITranslateField, {
    companySlug: 'fixture', productID: 42, field: 'title',
    sources: [{ code: 'zh', label: '简体中文', value: '原名称' }],
    targetLocale: 'en', targetValue: '', onApply,
  }))
  fireEvent.click(screen.getByRole('button', { name: 'AI 翻译' }))
  const retry = await screen.findByRole('button', { name: '确认后重试' }) as HTMLButtonElement
  expect(retry.disabled).toBe(true)
  fireEvent.click(retry)
  expect(submit).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('checkbox', { name: '我确认重试，可能再次调用 AI' }))
  fireEvent.click(retry)
  await screen.findByText('已排队，可以离开页面。')
  const writes = submit.mock.calls.map(([, options]) => JSON.parse(String(options.body)))
    .filter(({ action }) => action !== 'find')
  expect(writes).toEqual([{
    action: 'retry-unknown', acknowledged: true, previousID: id, productID: 42,
    field: 'title', sourceLocale: 'zh', targetLocale: 'en', text: '原名称',
  }])
  expect(onApply).not.toHaveBeenCalled()
})
