import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'

import { settingsEditorRoles, workspaceSettingsScope } from '@/platform/workspace-settings-api'
import {
  fingerprintFromProductTranslationMarker,
  productTranslationFingerprint,
  productTranslationMarker,
} from '@/platform/product-translation'
import { isSiteLocale, companyTranslationTargets, type SiteLocale } from '@/platform/site-locales'

import {
  sourceFrom,
  mergeHTML,
  localizedProductData,
  localizedSpecificationData,
  type TranslationContent,
} from '@/platform/product-translation/content'
import { translateProductContent as translateContent } from '@/platform/product-translation/provider'
import {
  queueProductTranslations,
  translationQueueEnabled,
} from '@/platform/product-translation/jobs'
import { translationBudgetEnabled } from '@/platform/translation-usage/budget'

type Context = { params: Promise<{ company: string; productID: string }> }
export const maxDuration = 240

export async function POST(_request: Request, { params }: Context) {
  const { company: slug, productID: rawProductID } = await params
  const productID = Number(rawProductID)
  if (!Number.isSafeInteger(productID) || productID < 1)
    return NextResponse.json({ message: '产品编号无效。' }, { status: 400 })
  const scope = await workspaceSettingsScope(slug, settingsEditorRoles)
  if ('error' in scope) return scope.error
  const { company: workspaceCompany, payload, user } = scope
  const company = await payload.findByID({
    collection: 'tenants',
    id: workspaceCompany.id,
    depth: 0,
    overrideAccess: false,
    user,
  })
  if (translationQueueEnabled()) {
    return queueProductTranslations({ company, payload, user, productIDs: [productID] })
  }
  if (translationBudgetEnabled()) return NextResponse.json({ message: '已启用翻译用量保护，请先启用持久翻译任务；旧请求内翻译入口不再直接调用 AI。' }, { status: 503 })
  const sourceLocale = company.defaultLocale
  const targetLocales = companyTranslationTargets(company)
  if (!isSiteLocale(sourceLocale))
    return NextResponse.json(
      { message: '站点默认语言无效，请先在站点设置中修正。' },
      { status: 422 },
    )
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey)
    return NextResponse.json(
      { message: 'AI 翻译暂不可用，请联系管理员配置服务。' },
      { status: 503 },
    )
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-flash'

  const sourceProductResult = await payload.find({
    collection: 'products',
    depth: 1,
    draft: true,
    fallbackLocale: false,
    limit: 1,
    locale: sourceLocale,
    overrideAccess: false,
    user,
    where: { and: [{ id: { equals: productID } }, { tenant: { equals: company.id } }] },
  })
  const sourceProduct = sourceProductResult.docs[0] as unknown as
    Record<string, unknown> | undefined
  if (!sourceProduct)
    return NextResponse.json({ message: '未找到当前公司的产品。' }, { status: 404 })
  const sourceSpecificationResult = await payload.find({
    collection: 'product-specifications',
    depth: 0,
    limit: 1,
    overrideAccess: false,
    user,
    where: {
      and: [
        { product: { equals: productID } },
        { tenant: { equals: company.id } },
        { localeCode: { equals: sourceLocale } },
      ],
    },
  })
  const sourceSpecification = sourceSpecificationResult.docs[0] as unknown as
    Record<string, unknown> | undefined
  const source = sourceFrom(sourceProduct, sourceSpecification || null)
  const fingerprint = productTranslationFingerprint(sourceLocale, source.fingerprintSource)
  const markerPrefix = `product-translation:v1:${company.id}:${sourceLocale}:`
  const previousTranslation = await payload.find({
    collection: 'audit-logs',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    sort: '-createdAt',
    where: {
      and: [
        { collection: { equals: 'products' } },
        { documentId: { equals: String(productID) } },
        { summary: { contains: markerPrefix } },
      ],
    },
  })
  if (
    fingerprintFromProductTranslationMarker(previousTranslation.docs[0]?.summary) === fingerprint &&
    targetLocales.every((locale) =>
      (
        previousTranslation.docs[0]?.metadata as { targets?: string[] } | undefined
      )?.targets?.includes(locale),
    )
  )
    return NextResponse.json(
      { message: '源内容没有变化，已完成过翻译。修改源语言内容并保存后，才能再次翻译。' },
      { status: 409 },
    )

  if (!targetLocales.length)
    return NextResponse.json({ message: '默认语言已包含全部目标语言，无需翻译。' }, { status: 422 })
  let translations: Array<{ locale: SiteLocale; content: TranslationContent }>
  try {
    translations = []
    for (const locale of targetLocales) {
      translations.push({
        locale,
        content: await translateContent(source.content, sourceLocale, locale, apiKey, model),
      })
    }
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'TimeoutError'
        ? 'AI 翻译响应超时，产品内容没有更改，请重试。'
        : error instanceof Error
          ? error.message
          : 'AI 翻译失败，产品内容没有更改，请重试。'
    return NextResponse.json({ message }, { status: 502 })
  }

  const transactionID = await payload.db.beginTransaction()
  if (transactionID === null)
    return NextResponse.json(
      { message: '翻译结果已生成，但保存事务暂不可用；产品内容没有更改，请稍后重试。' },
      { status: 503 },
    )
  try {
    const transaction = payload.db.sessions?.[String(transactionID)]?.db as
      Pick<PostgresAdapter['drizzle'], 'execute'> | undefined
    if (!transaction) throw new Error('翻译保存事务尚未就绪。')
    await transaction.execute(
      sql`SELECT id FROM products WHERE id = ${productID} AND tenant_id = ${company.id} FOR UPDATE`,
    )
    const req = { transactionID, user }
    const lockedSource = await payload.find({
      collection: 'products',
      depth: 1,
      draft: true,
      fallbackLocale: false,
      limit: 1,
      locale: sourceLocale,
      overrideAccess: false,
      user,
      req,
      where: { and: [{ id: { equals: productID } }, { tenant: { equals: company.id } }] },
    })
    const lockedProduct = lockedSource.docs[0] as unknown as Record<string, unknown> | undefined
    if (!lockedProduct) throw new Error('产品已删除或已移出当前公司，请刷新后重试。')
    const lockedSpecResult = await payload.find({
      collection: 'product-specifications',
      depth: 0,
      limit: 1,
      overrideAccess: false,
      user,
      req,
      where: {
        and: [
          { product: { equals: productID } },
          { tenant: { equals: company.id } },
          { localeCode: { equals: sourceLocale } },
        ],
      },
    })
    const lockedSpecification = lockedSpecResult.docs[0] as unknown as
      Record<string, unknown> | undefined
    const lockedSourceData = sourceFrom(lockedProduct, lockedSpecification || null)
    const lockedFingerprint = productTranslationFingerprint(
      sourceLocale,
      lockedSourceData.fingerprintSource,
    )
    if (lockedFingerprint !== fingerprint)
      throw new Error('翻译期间源内容发生变化，本次结果未保存。请刷新后重新翻译。')
    const lockedPreviousTranslation = await payload.find({
      collection: 'audit-logs',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      sort: '-createdAt',
      user,
      req,
      where: {
        and: [
          { collection: { equals: 'products' } },
          { documentId: { equals: String(productID) } },
          { summary: { contains: markerPrefix } },
        ],
      },
    })
    if (
      fingerprintFromProductTranslationMarker(lockedPreviousTranslation.docs[0]?.summary) ===
        fingerprint &&
      targetLocales.every((locale) =>
        (
          lockedPreviousTranslation.docs[0]?.metadata as { targets?: string[] } | undefined
        )?.targets?.includes(locale),
      )
    )
      throw new Error('另一项翻译已先完成，源内容没有变化；本次没有覆盖译文。')

    const existingTargetSpecifications = await payload.find({
      collection: 'product-specifications',
      depth: 0,
      limit: 0,
      overrideAccess: false,
      pagination: false,
      user,
      req,
      where: {
        and: [
          { product: { equals: productID } },
          { tenant: { equals: company.id } },
          { localeCode: { in: targetLocales } },
        ],
      },
    })
    const existingSpecificationByLocale = new Map<string, Record<string, unknown>>()
    for (const specification of existingTargetSpecifications.docs) {
      const item = specification as unknown as Record<string, unknown>
      if (
        typeof item.localeCode === 'string' &&
        !existingSpecificationByLocale.has(item.localeCode)
      )
        existingSpecificationByLocale.set(item.localeCode, item)
    }

    await transaction.execute(sql`SELECT id FROM tenants WHERE id = ${company.id} FOR UPDATE`)
    const currentTenant = await payload.findByID({
      collection: 'tenants',
      depth: 0,
      id: company.id,
      overrideAccess: true,
      user,
      req,
    })
    if (currentTenant.defaultLocale !== sourceLocale)
      throw new Error('翻译期间站点默认语言已更改，本次结果未保存。请刷新后重新翻译。')
    const enabledLocales = Array.isArray(currentTenant.enabledLocales)
      ? currentTenant.enabledLocales.filter(isSiteLocale)
      : []
    const nextEnabledLocales = [...new Set(enabledLocales)]

    const keepAsDraft = lockedProduct._status !== 'published'
    for (const { locale, content } of translations) {
      const translatedHTML = mergeHTML(source.html.parts, source.html.edges, content.detailSegments)
      await payload.update({
        collection: 'products',
        context: { workspaceProductTranslation: true },
        data: localizedProductData(lockedProduct, content, translatedHTML),
        draft: keepAsDraft,
        id: productID,
        locale,
        overrideAccess: false,
        user,
        req,
      })
      if (sourceSpecification && content.specificationSet) {
        const existingTarget = existingSpecificationByLocale.get(locale) || null
        const data = localizedSpecificationData(
          existingTarget,
          content.specificationSet,
          productID,
          company.id,
          locale,
        )
        if (existingTarget?.id) {
          await payload.update({
            collection: 'product-specifications',
            data,
            id: Number(existingTarget.id),
            overrideAccess: false,
            user,
            req,
          })
        } else {
          await payload.create({
            collection: 'product-specifications',
            data,
            overrideAccess: false,
            user,
            req,
          })
        }
      }
    }
    if (nextEnabledLocales.length !== enabledLocales.length) {
      await payload.update({
        collection: 'tenants',
        context: { workspaceProductTranslationEnableLocales: true },
        data: { enabledLocales: nextEnabledLocales },
        id: company.id,
        overrideAccess: true,
        user,
        req,
      })
    }
    await payload.create({
      collection: 'audit-logs',
      data: {
        action: 'update',
        collection: 'products',
        documentId: String(productID),
        ...(user.email ? { actorEmail: user.email } : {}),
        summary: productTranslationMarker(company.id, sourceLocale, fingerprint),
        metadata: {
          companyID: company.id,
          enabledLocales: nextEnabledLocales,
          sourceLocale,
          targets: targetLocales,
        },
      },
      overrideAccess: true,
      user,
      req,
    })
    await payload.db.commitTransaction(transactionID)
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID)
    const status =
      error instanceof Error && /发生变化|已更改|先完成|没有变化|已删除/.test(error.message)
        ? 409
        : 500
    const message = error instanceof Error ? error.message : '翻译结果没有保存，请重试。'
    return NextResponse.json({ message }, { status })
  }

  revalidatePath(`/workspace/${slug}/website/content`)
  revalidatePath(`/workspace/${slug}/website/sites`)
  for (const locale of new Set([...targetLocales, sourceLocale]))
    revalidatePath(`/s/${slug}/${locale}`, 'layout')
  return NextResponse.json({
    message: `已覆盖并保存 ${targetLocales.length} 种语言的产品内容，已同步到当前公司启用的语言站点。已发布产品立即上线，草稿仍保持草稿。`,
    targets: targetLocales,
  })
}
