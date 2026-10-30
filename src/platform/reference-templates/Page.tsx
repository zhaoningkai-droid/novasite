import type { IndustryPageModel } from '@/platform/industry-templates/model'
import type { ReferenceKey } from './keys'
import { K607Page } from './K607Page'
import { K712Page } from './K712Page'
export function ReferencePage({
  model,
  templateKey,
}: {
  model: IndustryPageModel
  templateKey: ReferenceKey
}) {
  return templateKey === 'plush-607-v1' ? <K607Page model={model} /> : <K712Page model={model} />
}
