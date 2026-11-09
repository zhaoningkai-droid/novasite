import type { PayloadRequest, TextField, TextareaField } from 'payload'
import { text, textarea } from 'payload/shared'
import type { SiteLocale } from '../site-locales'

type Scope = {
  tenantID: number
  locale: SiteLocale
  resource: 'homepage' | 'about' | 'settings'
}

const authorizedWrites = new WeakMap<PayloadRequest, Scope>()

// Only the worker calls this after checking the tenant, actor, source fingerprint and row lease.
export async function withTenantTranslationWrite<T>(
  req: PayloadRequest,
  scope: Scope,
  write: () => Promise<T>,
): Promise<T> {
  authorizedWrites.set(req, scope)
  try {
    return await write()
  } finally {
    authorizedWrites.delete(req)
  }
}

const missing = (value: unknown) => value == null || value === ''

export function localizedTenantTextValidation(
  resource: Scope['resource'],
): NonNullable<Extract<TextField, { hasMany?: false }>['validate']> {
  return (value, options) => {
    const scope = authorizedWrites.get(options.req)
    if (scope && scope.resource !== resource && options.operation === 'update'
      && options.id === scope.tenantID && options.req.locale === scope.locale
      && missing(value) && missing(options.previousValue)) return true
    return text(value, options)
  }
}

export const localizedAboutDescriptionValidation: NonNullable<TextareaField['validate']> =
  (value, options) => {
    const scope = authorizedWrites.get(options.req)
    if (scope && scope.resource !== 'about' && options.operation === 'update'
      && options.id === scope.tenantID && options.req.locale === scope.locale
      && missing(value) && missing(options.previousValue)) return true
    return textarea(value, options)
  }
