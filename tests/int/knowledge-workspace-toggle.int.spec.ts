import { createElement } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { KnowledgeWorkspace } from '../../src/platform/components/KnowledgeWorkspace/KnowledgeWorkspace'
import type { WorkspaceCompany } from '../../src/platform/workspace'
import { assertGeoBodyOwnership } from '../../src/platform/geo/keywords'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('can disable a loaded knowledge base without returning server-owned tenant fields', async () => {
  let base = {
    id: 'base-1',
    tenant_id: 101,
    updated_by: 7,
    name: 'Fixture knowledge',
    intro: '',
    enabled: true,
    version: 1,
    documents: 0,
    chunks: 0,
    bytes: 0,
  }
  const writes: Record<string, unknown>[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        const body = JSON.parse(String(init.body))
        writes.push(body)
        assertGeoBodyOwnership(body)
        base = { ...base, enabled: body.enabled, version: 2 }
      }
      return Response.json({ base, documents: [] })
    }),
  )
  render(
    createElement(KnowledgeWorkspace, {
      company: { id: 101, name: 'Fixture', slug: 'fixture' } as WorkspaceCompany,
    }),
  )
  fireEvent.click(await screen.findByRole('checkbox', { name: '已开启' }))
  await waitFor(() =>
    expect((screen.getByRole('checkbox', { name: '已停用' }) as HTMLInputElement).checked).toBe(
      false,
    ),
  )
  expect(writes).toEqual([{ name: 'Fixture knowledge', intro: '', version: 1, enabled: false }])
})
