import { createHash } from 'node:crypto'
import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import type { SiteTemplateChange, Tenant, User } from '@/payload-types'
import { getNewTemplate } from './registry'

type ChangeRequest = {
  operation: 'apply' | 'rollback'
  expectedRevision: number
  idempotencyKey: string
  templateId?: number | null
  changeId?: number
}

type TemplateState = {
  selectedTemplate: number | null
  templateVersion: string | null
  templateAppliedAt: string | null
  templateSettings: unknown
}

export class TemplateChangeError extends Error {
  status: number

  constructor(message: string, status = 409) {
    super(message)
    this.name = 'TemplateChangeError'
    this.status = status
  }
}

const oldTemplateKeys = new Set([
  'power-engineering-v1',
  'precision-light-v1',
  'executive-industrial-pro-v1',
  'atelier-industry-v1',
])

const relationID = (value: number | { id: number } | null | undefined) =>
  typeof value === 'number' ? value : value?.id ?? null

const currentState = (tenant: Tenant): TemplateState => ({
  selectedTemplate: relationID(tenant.selectedTemplate),
  templateVersion: tenant.templateVersion || null,
  templateAppliedAt: tenant.templateAppliedAt || null,
  templateSettings: tenant.templateSettings ?? {},
})

const restoreState = (value: unknown): TemplateState | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const state = value as Partial<TemplateState>
  if (state.selectedTemplate !== null && !Number.isInteger(state.selectedTemplate)) return null
  if (state.templateVersion !== null && typeof state.templateVersion !== 'string') return null
  if (state.templateAppliedAt !== null && typeof state.templateAppliedAt !== 'string') return null
  return {
    selectedTemplate: state.selectedTemplate ?? null,
    templateVersion: state.templateVersion ?? null,
    templateAppliedAt: state.templateAppliedAt ?? null,
    templateSettings: state.templateSettings ?? {},
  }
}

const hashRequest = (input: ChangeRequest, tenantID: number) =>
  createHash('sha256').update(JSON.stringify({
    operation: input.operation,
    tenantID,
    expectedRevision: input.expectedRevision,
    templateId: input.templateId ?? null,
    changeId: input.changeId ?? null,
  })).digest('hex')

const validateInput = (input: ChangeRequest) => {
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) {
    throw new TemplateChangeError('页面版本已过期，请刷新后重试。', 422)
  }
  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(input.idempotencyKey)) {
    throw new TemplateChangeError('本次操作编号无效，请重新保存。', 422)
  }
  if (input.operation === 'apply' && input.templateId != null && !Number.isInteger(input.templateId)) {
    throw new TemplateChangeError('所选模板无效，请重新选择。', 422)
  }
  if (input.operation === 'rollback' && (!Number.isInteger(input.changeId) || (input.changeId ?? 0) < 1)) {
    throw new TemplateChangeError('要恢复的记录不存在。', 422)
  }
}

const readIdempotent = async (
  payload: Payload,
  tenantID: number,
  idempotencyKey: string,
  requestHash: string,
  transactionID?: number | string,
) => {
  const result = await payload.find({
    collection: 'site-template-changes',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    req: transactionID ? { transactionID } : undefined,
    where: {
      and: [
        { tenant: { equals: tenantID } },
        { idempotencyKey: { equals: idempotencyKey } },
      ],
    },
  })
  const change = result.docs[0]
  if (!change) return null
  if (change.requestHash !== requestHash) {
    throw new TemplateChangeError('本次操作编号已用于另一项修改，请刷新后重新操作。', 409)
  }
  return change
}

const replayResult = async (payload: Payload, tenantID: number, user: User, change: SiteTemplateChange) => {
  const tenant = await payload.findByID({
    collection: 'tenants',
    id: tenantID,
    depth: 0,
    overrideAccess: false,
    showHiddenFields: true,
    user,
  })
  return {
    change,
    tenantRevision: tenant.templateRevision ?? 0,
    selectedTemplateId: relationID(tenant.selectedTemplate),
    idempotent: true,
  }
}

const assertTemplateSupported = async (payload: Payload, templateID: number, user: User) => {
  const template = await payload.findByID({
    collection: 'templates',
    id: templateID,
    depth: 0,
    overrideAccess: false,
    showHiddenFields: true,
    user,
  })
  if (template.status !== 'published') {
    throw new TemplateChangeError('该模板当前不可使用，请选择模板库中已发布的模板。', 422)
  }
  const definition = getNewTemplate(template.key)
  if (!definition && !oldTemplateKeys.has(template.key)) {
    throw new TemplateChangeError('该模板暂未接入网站页面，请联系管理员。', 422)
  }
  if (definition && (template.version !== definition.version || template.schemaVersion !== definition.schemaVersion)) {
    throw new TemplateChangeError('该模板版本尚未安装，请刷新模板库或联系管理员。', 409)
  }
  return template
}

const audit = async (
  payload: Payload,
  user: User,
  tenantID: number,
  change: SiteTemplateChange,
  transactionID: number | string,
) => payload.create({
  collection: 'audit-logs',
  data: {
    action: change.operation === 'rollback' ? 'rollback' : 'update',
    actorEmail: user.email,
    collection: 'tenants',
    documentId: String(tenantID),
    summary: change.operation === 'rollback' ? '恢复网站模板版本' : '应用网站模板',
    metadata: {
      templateChangeId: change.id,
      fromRevision: change.fromRevision,
      toRevision: change.toRevision,
    },
  },
  overrideAccess: true,
  req: { transactionID, user },
})

export async function applyTemplateChange(args: {
  payload: Payload
  tenantID: number
  user: User
  input: ChangeRequest
}): Promise<{ change: SiteTemplateChange; tenantRevision: number; selectedTemplateId: number | null; idempotent: boolean }> {
  const { payload, tenantID, user, input } = args
  validateInput(input)
  const requestHash = hashRequest(input, tenantID)
  const existing = await readIdempotent(payload, tenantID, input.idempotencyKey, requestHash)
  if (existing) {
    return replayResult(payload, tenantID, user, existing)
  }

  const tenant = await payload.findByID({
    collection: 'tenants',
    id: tenantID,
    depth: 0,
    overrideAccess: false,
    showHiddenFields: true,
    user,
  })
  const currentRevision = tenant.templateRevision ?? 0
  if (currentRevision !== input.expectedRevision) {
    throw new TemplateChangeError('模板已在其他窗口更新，请刷新后再操作。', 409)
  }

  const before = currentState(tenant)
  let after: TemplateState
  let targetTemplateID: number | null
  let sourceChange: SiteTemplateChange | null = null

  if (input.operation === 'apply') {
    targetTemplateID = input.templateId ?? null
    const template = targetTemplateID
      ? await assertTemplateSupported(payload, targetTemplateID, user)
      : null
    after = {
      selectedTemplate: targetTemplateID,
      templateVersion: template?.version ?? null,
      templateAppliedAt: template ? new Date().toISOString() : null,
      templateSettings: before.templateSettings,
    }
  } else {
    const changes = await payload.find({
      collection: 'site-template-changes',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: {
        and: [
          { id: { equals: input.changeId! } },
          { tenant: { equals: tenantID } },
        ],
      },
    })
    sourceChange = changes.docs[0] || null
    if (!sourceChange || sourceChange.toRevision !== currentRevision) {
      throw new TemplateChangeError('只能恢复当前版本对应的最近一次模板变更。', 409)
    }
    after = restoreState(sourceChange.beforeSettings) as TemplateState
    if (!after) throw new TemplateChangeError('这条历史记录缺少可恢复的模板设置。', 409)
    targetTemplateID = after.selectedTemplate
    if (targetTemplateID) await assertTemplateSupported(payload, targetTemplateID, user)
  }

  const transactionID = await payload.db.beginTransaction()
  if (transactionID === null) {
    throw new TemplateChangeError('当前数据库不支持安全保存模板记录，请稍后重试。', 503)
  }

  try {
    const transaction = payload.db.sessions?.[String(transactionID)]?.db as Pick<PostgresAdapter['drizzle'], 'execute'> | undefined
    if (!transaction) throw new TemplateChangeError('模板保存事务尚未就绪，请稍后重试。', 503)
    // Payload bulk updates read matches before writing. Serialize the complete
    // selection + history operation on this tenant row before checking revision.
    await transaction.execute(sql`SELECT id FROM tenants WHERE id = ${tenantID} FOR UPDATE`)
    const concurrentReplay = await readIdempotent(payload, tenantID, input.idempotencyKey, requestHash, transactionID)
    if (concurrentReplay) {
      await payload.db.commitTransaction(transactionID)
      return replayResult(payload, tenantID, user, concurrentReplay)
    }
    const lockedTenant = await payload.findByID({
      collection: 'tenants', id: tenantID, depth: 0, overrideAccess: false,
      showHiddenFields: true, user, req: { transactionID, user },
    })
    if ((lockedTenant.templateRevision ?? 0) !== currentRevision) {
      throw new TemplateChangeError('模板已在其他窗口更新，请刷新后再操作。', 409)
    }
    const nextRevision = currentRevision + 1
    const updated = await payload.update({
      collection: 'tenants',
      where: {
        and: [
          { id: { equals: tenantID } },
          { templateRevision: { equals: currentRevision } },
        ],
      },
      limit: 1,
      data: {
        selectedTemplate: after.selectedTemplate,
        templateVersion: after.templateVersion,
        templateAppliedAt: after.templateAppliedAt,
        templateSettings: after.templateSettings as Tenant['templateSettings'],
        templateRevision: nextRevision,
      },
      depth: 0,
      locale: tenant.defaultLocale,
      overrideAccess: false,
      user,
      context: { templateChangeService: true },
      req: { transactionID, user },
    })
    if ('errors' in updated && updated.errors.length > 0) {
      throw new TemplateChangeError('站点信息未通过校验，请先补齐必填项后再应用模板。', 422)
    }
    if (!('docs' in updated) || updated.docs.length !== 1) {
      throw new TemplateChangeError('模板已在其他窗口更新，请刷新后再操作。', 409)
    }

    const change = await payload.create({
      collection: 'site-template-changes',
      data: {
        tenant: tenantID,
        operation: input.operation,
        fromTemplate: before.selectedTemplate,
        toTemplate: after.selectedTemplate,
        fromVersion: before.templateVersion,
        toVersion: after.templateVersion,
        fromRevision: currentRevision,
        toRevision: nextRevision,
        beforeSettings: before as SiteTemplateChange['beforeSettings'],
        afterSettings: after as SiteTemplateChange['afterSettings'],
        revertsChange: sourceChange?.id ?? null,
        actor: user.id,
        actorEmail: user.email,
        idempotencyKey: input.idempotencyKey,
        requestHash,
      },
      depth: 0,
      overrideAccess: true,
      req: { transactionID, user },
    })
    await audit(payload, user, tenantID, change, transactionID)
    await payload.db.commitTransaction(transactionID)
    return { change, tenantRevision: nextRevision, selectedTemplateId: after.selectedTemplate, idempotent: false }
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID)
    if (error instanceof TemplateChangeError) throw error
    const duplicate = await readIdempotent(payload, tenantID, input.idempotencyKey, requestHash)
    if (duplicate) {
      return replayResult(payload, tenantID, user, duplicate)
    }
    throw error
  }
}
