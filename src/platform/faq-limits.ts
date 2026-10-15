import { APIError } from 'payload'
import { TENANT_FAQ_LIMIT, TENANT_FAQ_LIMIT_MESSAGE } from './faq-config'

export { TENANT_FAQ_LIMIT, TENANT_FAQ_LIMIT_MESSAGE } from './faq-config'

export function assertTenantFAQCapacity(count: number) {
  if (count >= TENANT_FAQ_LIMIT) {
    throw new APIError(TENANT_FAQ_LIMIT_MESSAGE, 422)
  }
}
