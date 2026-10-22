import type { ArticleContext } from '@/platform/geo/articles'
import Link from 'next/link'
export function KnowledgeEvidence({
  context,
  companySlug,
}: {
  context: ArticleContext
  companySlug: string
}) {
  if (!context.knowledge?.length) return null
  return (
    <details className="geo-article__knowledge">
      <summary>本次检索的企业资料（{context.knowledge.length}）</summary>
      {context.knowledge.map((item) => (
        <article key={item.id} className="geo-article__source">
          <strong>
            {item.documentID ? (
              <Link
                href={`/workspace/${encodeURIComponent(companySlug)}/knowledge?document=${encodeURIComponent(item.documentID)}`}
              >
                {item.filename || item.title}
              </Link>
            ) : (
              item.title
            )}
          </strong>
          {item.documentVersion && <small> · 版本 {item.documentVersion}</small>}
          <p style={{ whiteSpace: 'pre-wrap' }}>{item.text}</p>
        </article>
      ))}
    </details>
  )
}
