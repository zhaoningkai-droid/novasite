'use client'

import { ContentEntryEditor, ContentEntryInitial } from '../WorkspaceEditor/ContentEntryEditor'

export function BlogWorkspaceEditor({
  categories,
  companySlug,
  initial = {},
}: {
  categories: { id: number; title: string }[]
  companySlug: string
  initial?: ContentEntryInitial
}) {
  return (
    <ContentEntryEditor
      categories={categories.map((item) => ({ id: item.id, name: item.title }))}
      companySlug={companySlug}
      initial={initial}
      kind="blog"
      key={`${companySlug}:${initial.id || 'new'}`}
    />
  )
}
