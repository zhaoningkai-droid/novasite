import { saveWorkspaceArticle } from '@/platform/workspace-article-save'

type Context = { params: Promise<{ company: string; caseID?: string[] }> }
async function save(request: Request, context: Context, creating: boolean) {
  const { company, caseID = [] } = await context.params
  return saveWorkspaceArticle(request, company, caseID[0], 'cases', creating)
}
export const POST = (request: Request, context: Context) => save(request, context, true)
export const PATCH = (request: Request, context: Context) => save(request, context, false)
