import type { ArticleContext } from '../geo/articles'
import { retrieveKnowledge } from './retrieval'
import type { KnowledgePool } from './store'
export async function attachArticleKnowledge(
  pool: Pick<KnowledgePool, 'query'>,
  tenantID: number,
  context: ArticleContext,
  options: Parameters<typeof retrieveKnowledge>[3] = {},
): Promise<ArticleContext> {
  const result = await retrieveKnowledge(
    pool,
    tenantID,
    {
      question:
        context.settings.questionSource === 'original' || context.settings.locale === 'zh'
          ? context.question.original
          : context.question.translated || context.question.original,
      core: context.optimization.core,
      term: context.question.term,
      brand: context.optimization.brand,
      direction: context.direction,
    },
    options,
  )
  return {
    ...context,
    knowledge: result.evidence,
    writingMode: result.evidence.length ? 'knowledge' : 'keyword',
    knowledgeRetrieval: {
      strategy: result.strategy,
      queries: result.queries,
      retrievedAt: new Date().toISOString(),
    },
  }
}
