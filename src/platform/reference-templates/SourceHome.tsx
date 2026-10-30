import { ReferencePage } from './Page'
import type { IndustryPageModel } from '@/platform/industry-templates/model'
import type { ReferenceKey } from './keys'
export function SourceHome({
  model,
  templateKey,
}: {
  model: IndustryPageModel
  templateKey: ReferenceKey
}) {
  return <ReferencePage model={model} templateKey={templateKey} />
}
