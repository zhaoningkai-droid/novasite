'use client'

import { ContentEntryEditor, ContentEntryInitial } from '../WorkspaceEditor/ContentEntryEditor'

export function CaseWorkspaceEditor({
  categories,
  companySlug,
  initial = {},
}: {
  categories: { id: number; name: string }[]
  companySlug: string
  initial?: ContentEntryInitial
}) {
  return (
    <ContentEntryEditor
      categories={categories}
      companySlug={companySlug}
      initial={initial}
      kind="cases"
      key={`${companySlug}:${initial.id || 'new'}`}
    />
  )
}
