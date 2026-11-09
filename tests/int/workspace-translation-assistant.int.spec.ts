import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { WorkspaceTranslationAssistant } from '../../src/platform/components/WorkspaceShell/WorkspaceTranslationAssistant'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('finds the completed translation after closing and remounting the assistant', async () => {
  const preview = {
    id: 'sample-task', text: '示例文字', sourceLocale: 'zh', targetLocale: 'en',
    status: 'queued', translation: null as string | null,
  }
  let submitted = false
  const api = vi.fn(async (_url: string, init: RequestInit) => {
    const input = JSON.parse(String(init.body))
    expect(input.field).toBe('assistant')
    if (input.action === 'generate') submitted = true
    return Response.json({ preview: submitted ? preview : null })
  })
  vi.stubGlobal('fetch', api)

  const open = () => fireEvent.click(screen.getByRole('button', { name: 'AI 翻译', exact: true }))
  const page = render(createElement(WorkspaceTranslationAssistant, { companySlug: 'fixture' }))
  open()
  const source = screen.getByRole('textbox', { name: /需要翻译的内容/ }) as HTMLTextAreaElement
  await waitFor(() => expect(source.disabled).toBe(false))
  fireEvent.change(source, { target: { value: preview.text } })
  fireEvent.click(screen.getByRole('button', { name: '生成译文' }))
  await screen.findByText('已排队，可以离开页面。')
  fireEvent.click(screen.getByRole('button', { name: '关闭 AI 翻译' }))
  page.unmount()

  preview.status = 'succeeded'
  preview.translation = 'Sample text'
  render(createElement(WorkspaceTranslationAssistant, { companySlug: 'fixture' }))
  open()
  const result = await screen.findByRole('textbox', { name: '译文预览' }) as HTMLTextAreaElement
  expect(result.value).toBe('Sample text')
  expect((screen.getByRole('textbox', { name: /需要翻译的内容/ }) as HTMLTextAreaElement).value).toBe(preview.text)
  expect(api.mock.calls.map(([, init]) => JSON.parse(String(init.body)).action)).toEqual(['latest', 'generate', 'latest'])
})
