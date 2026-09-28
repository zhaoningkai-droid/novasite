import { randomUUID } from 'node:crypto'
import type { Endpoint } from 'payload'

import type { Tenant, User } from '@/payload-types'
import { applyTemplateChange, TemplateChangeError } from '@/platform/new-templates/change-service'

const canManageSite = (user: User | null, tenantID: number): boolean => {
  if (!user) return false
  if (user.roles?.includes('super-admin')) return true
  if (!user.roles?.includes('site-admin')) return false
  return Boolean(user.tenants?.some(({ tenant }) =>
    typeof tenant === 'number' ? tenant === tenantID : tenant.id === tenantID,
  ))
}

export const applyTemplateEndpoint: Endpoint = {
  path: '/apply-template',
  method: 'post',
  handler: async (req) => {
    if (!req.user) return Response.json({ error: 'Authentication required.' }, { status: 401 })
    const body = (await req.json?.()) as { tenantId?: number; templateId?: number } | null
    const tenantID = Number(body?.tenantId)
    const templateID = Number(body?.templateId)
    const user = req.user as User

    if (!Number.isInteger(tenantID) || !Number.isInteger(templateID)) {
      return Response.json({ error: 'tenantId and templateId are required.' }, { status: 400 })
    }
    if (!canManageSite(user, tenantID)) {
      return Response.json({ error: 'You cannot manage this site.' }, { status: 403 })
    }

    const tenant = await req.payload.findByID({
      collection: 'tenants', id: tenantID, depth: 0, overrideAccess: false, showHiddenFields: true, user,
    })
    try {
      const result = await applyTemplateChange({
        payload: req.payload,
        tenantID,
        user,
        input: {
          operation: 'apply',
          templateId: templateID,
          expectedRevision: (tenant as Tenant).templateRevision ?? 0,
          idempotencyKey: randomUUID(),
        },
      })
      return Response.json({
        message: 'Template applied.',
        revision: result.tenantRevision,
        templateId: result.selectedTemplateId,
      })
    } catch (error) {
      if (error instanceof TemplateChangeError) {
        return Response.json({ error: error.message }, { status: error.status })
      }
      return Response.json({ error: 'Unable to apply template.' }, { status: 500 })
    }
  },
}
