import { deleteWorkspaceContent } from '@/platform/workspace-bulk-delete'
type Context = { params: Promise<{ company: string }> }
export async function DELETE(request: Request, { params }: Context) {
  const { company } = await params
  return deleteWorkspaceContent(request, company, 'cases')
}
