import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TranslationReviewAction } from '../../src/platform/components/WorkspaceTranslations/TranslationReviewAction'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('requires confirmation again for a new task revision and submits only the current record', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ jobID: 'job', locales: ['es'] }, { status: 202 }))
  vi.stubGlobal('fetch', fetcher)
  const onQueued = vi.fn()
  const props = {
    companySlug: 'fixture', resource: 'products' as const, documentID: 42, onQueued,
    review: { jobID: 'job', revision: '1234.000001', locales: ['es' as const] },
  }
  const { rerender } = render(createElement(TranslationReviewAction, props))
  fireEvent.click(screen.getByText('处理待确认翻译'))
  const button = () => screen.getByRole('button', { name: '确认并重新排队' }) as HTMLButtonElement
  const acknowledge = () => fireEvent.click(screen.getByRole('checkbox', { name: '已核对，确认重试这些语言' }))
  expect(button().disabled).toBe(true)
  acknowledge()
  expect(button().disabled).toBe(false)

  const review = { ...props.review, revision: '1234.000002' }
  rerender(createElement(TranslationReviewAction, { ...props, review }))
  fireEvent.click(screen.getByText('处理待确认翻译'))
  expect(button().disabled).toBe(true)
  fireEvent.click(button())
  expect(fetcher).not.toHaveBeenCalled()

  acknowledge()
  fireEvent.click(button())
  await waitFor(() => expect(onQueued).toHaveBeenCalledWith(42, 'job'))
  expect(fetcher).toHaveBeenCalledTimes(1)
  const [url, request] = fetcher.mock.calls[0]
  expect(url).toBe('/api/workspace/fixture/translations/recovery')
  expect(JSON.parse(request.body)).toEqual({
    resource: 'products', documentID: 42, jobID: 'job', revision: '1234.000002', acknowledged: true,
  })
})
