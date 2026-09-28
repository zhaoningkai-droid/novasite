import { saveWorkspaceArticle } from '@/platform/workspace-article-save'

type Context = { params: Promise<{ company: string; postID?: string[] }> }
async function save(request: Request, context: Context, creating: boolean) {
  const { company, postID = [] } = await context.params
  return saveWorkspaceArticle(request, company, postID[0], 'blog', creating)
}
export const POST = (request: Request, context: Context) => save(request, context, true)
export const PATCH = (request: Request, context: Context) => save(request, context, false)
