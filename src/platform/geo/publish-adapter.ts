import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload, RequiredDataFromCollectionSlug } from 'payload'
import type { User } from '@/payload-types'
import { GeoError } from './keywords'
import type { GeoPublishRecord } from './publishing'
import { geoPublishSlug, geoPublishURL } from './publishing'
import { loadGeoPublishTarget, sameGeoPublishTarget } from './publish-target'
import { geoArticleToLexical } from './publish-lexical'
import { decodeSourceText } from './source-policy'
import type { GeoArticle } from './articles'
export const geoPublishSummary = (article: GeoArticle) => {
  const summary =
    article.summary.trim() ||
    decodeSourceText(article.html.replace(/<[^>]*>/gu, ' '))
      .replace(/\s+/gu, ' ')
      .trim()
  const chars = Array.from(summary)
  return chars.length > 180 ? `${chars.slice(0, 179).join('').trimEnd()}…` : summary
}
/** CMS create + result ledger share ONE Payload/Postgres transaction. This adapter never updates old content. */
export async function commitGeoPublication(
  payload: Payload,
  user: User,
  item: GeoPublishRecord,
  article: GeoArticle,
) {
  const content = geoArticleToLexical(article),
    transactionID = await payload.db.beginTransaction()
  if (transactionID === null)
    throw new GeoError('TRANSACTION_UNAVAILABLE', '当前数据库无法安全发布，尚未写入站点。', 503)
  let committing = false
  try {
    const db = payload.db.sessions?.[String(transactionID)]?.db as
      Pick<PostgresAdapter['drizzle'], 'execute'> | undefined
    if (!db) throw new GeoError('TRANSACTION_UNAVAILABLE', '发布事务尚未就绪。', 503)
    const req = { transactionID, user, context: { disableRevalidate: true } }
    await db.execute(sql`SELECT pg_advisory_xact_lock(57311,${item.tenant_id})`)
    const claim =
      await db.execute(sql`SELECT id FROM platform_geo.publish_intents WHERE tenant_id=${item.tenant_id}
      AND id=${item.id}::uuid AND state='running' AND lease_owner=${item.lease_owner}::uuid AND lease_until>clock_timestamp() FOR UPDATE`)
    if (!(claim as unknown as { rows: unknown[] }).rows[0])
      throw new GeoError('LEASE_LOST', '该发布记录执行权已失效，未写入站点。', 409)
    const latest =
      await db.execute(sql`SELECT version,status,html,title,summary FROM platform_geo.articles
      WHERE tenant_id=${item.tenant_id} AND id=${item.article_id}::uuid FOR SHARE`)
    const current = (
      latest as unknown as {
        rows: { version: number; status: string; html: string; title: string; summary: string }[]
      }
    ).rows[0]
    if (
      !current ||
      current.version !== item.article_version ||
      current.status !== 'ready' ||
      current.html !== item.snapshot.html ||
      current.title !== item.snapshot.title ||
      current.summary !== item.snapshot.summary
    )
      throw new GeoError('ARTICLE_CHANGED', '文章修订已改变或撤销核查，未发布旧稿。', 409)
    const target = await loadGeoPublishTarget(
      payload,
      user,
      item.tenant_id,
      item.target.collection,
      item.target.categoryID,
      item.target.locale,
      req,
    )
    if (!sameGeoPublishTarget(item.target, target))
      throw new GeoError('TARGET_CHANGED', '站点域名、语言或分类已变化，请重新确认目标。', 409)
    const images = article.context.materialGroup.images,
      ids = images.map((i) => i.id)
    const media = images.length
      ? await db.execute(sql`SELECT m.id,m.url FROM public.media m JOIN platform_geo.material_items i ON i.media_id=m.id AND i.tenant_id=m.tenant_id
      JOIN platform_geo.material_groups g ON g.id=i.group_id AND g.tenant_id=i.tenant_id WHERE m.tenant_id=${item.tenant_id}
      AND g.id=${article.context.materialGroup.id}::uuid AND g.entry_type='group'
      AND NOT g.archived
      AND m.id=ANY(${`{${ids.join(',')}}`}::int[]) AND m.mime_type IN ('image/jpeg','image/png','image/webp') AND coalesce(m.filesize,0)<=512000 FOR SHARE OF m,g,i`)
      : { rows: [] }
    const available = (media as unknown as { rows: { id: number; url: string }[] }).rows
    if (
      available.length !== images.length ||
      images.some((i) => !available.some((m) => m.id === i.id && m.url === i.url))
    )
      throw new GeoError('MEDIA_CHANGED', '配图或素材组已变化，未写入站点。')
    const slug = geoPublishSlug(item.article_id, item.article_version, target.locale)
    const prior = await payload.find({
      collection: target.collection,
      depth: 0,
      limit: 1,
      draft: true,
      locale: article.context.settings.locale,
      fallbackLocale: false,
      user,
      overrideAccess: false,
      req,
      where: { and: [{ tenant: { equals: item.tenant_id } }, { slug: { equals: slug } }] },
    })
    if (prior.docs.length)
      throw new GeoError(
        'TARGET_CONFLICT',
        '目标地址已有内容。未覆盖、未另造重复文章，请核对原记录。',
        409,
      )
    const summary = geoPublishSummary(article),
      cover = images[0]?.id
    const data = {
      tenant: item.tenant_id,
      title: article.title,
      content,
      slug,
      _status: 'published' as const,
      publishedAt: new Date().toISOString(),
      ...(target.collection === 'news'
        ? {
            category: target.categoryID,
            summary,
            cover,
            featured: false,
            sortOrder: 0,
            meta: { title: article.title, description: summary },
          }
        : {
            categories: [target.categoryID],
            heroImage: cover,
            meta: { title: article.title, description: summary, image: cover },
          }),
    }
    const created = await payload.create({
      collection: target.collection,
      data: data as RequiredDataFromCollectionSlug<'news' | 'posts'>,
      locale: article.context.settings.locale,
      draft: false,
      user,
      overrideAccess: false,
      req,
      context: { disableRevalidate: true },
    })
    if (
      created._status !== 'published' ||
      created.slug !== slug ||
      !Number.isSafeInteger(created.id)
    )
      throw new GeoError(
        'TARGET_NOT_PUBLISHED',
        '目标未返回确定的已发布内容编号，事务已停止。',
        503,
      )
    const proof = await payload.findByID({
      collection: target.collection,
      id: created.id,
      depth: 0,
      locale: article.context.settings.locale,
      fallbackLocale: false,
      draft: false,
      user,
      overrideAccess: false,
      req,
    })
    if (
      proof._status !== 'published' ||
      proof.slug !== slug ||
      proof.title !== article.title ||
      Number(typeof proof.tenant === 'object' ? proof.tenant?.id : proof.tenant) !== item.tenant_id
    )
      throw new GeoError('TARGET_READBACK_FAILED', '目标回读未通过，事务已停止。', 503)
    const url = geoPublishURL(target, item.article_id, item.article_version)
    const recorded =
      await db.execute(sql`UPDATE platform_geo.publish_intents SET state='published',target_id=${created.id},target_url=${url},
      message='已写入本站已发布内容；公网访问未检测。',error_code=NULL,lease_owner=NULL,lease_until=NULL,updated_at=now()
      WHERE tenant_id=${item.tenant_id} AND id=${item.id}::uuid AND lease_owner=${item.lease_owner}::uuid AND lease_until>clock_timestamp() RETURNING id`)
    if (!(recorded as unknown as { rows: unknown[] }).rows[0])
      throw new GeoError('LEASE_LOST', '发布执行权已失效，事务已停止。', 409)
    const details = JSON.stringify({
      collection: target.collection,
      id: created.id,
      url,
      status: proof._status,
    })
    await db.execute(sql`INSERT INTO platform_geo.publish_events(tenant_id,intent_id,event,actor_id,details)
      VALUES(${item.tenant_id},${item.id}::uuid,'published',${user.id},${details}::jsonb)`)
    await db.execute(sql`UPDATE platform_geo.publish_plan_items SET state='published',message='站点已发布。',updated_at=now()
      WHERE tenant_id=${item.tenant_id} AND intent_id=${item.id}::uuid AND state='queued'`)
    await db.execute(sql`WITH target AS (SELECT run_id FROM platform_geo.publish_plan_items
        WHERE tenant_id=${item.tenant_id} AND intent_id=${item.id}::uuid), stats AS (
        SELECT i.run_id,count(*)::int AS total,count(*) FILTER(WHERE state='awaiting_review')::int AS review,
          count(*) FILTER(WHERE state='queued')::int AS queued,count(*) FILTER(WHERE state='published')::int AS published,
          count(*) FILTER(WHERE state IN ('failed','unknown'))::int AS failed,count(*) FILTER(WHERE state='cancelled')::int AS cancelled,
          count(*) FILTER(WHERE state='skipped')::int AS skipped FROM platform_geo.publish_plan_items i
        JOIN target t ON t.run_id=i.run_id WHERE i.tenant_id=${item.tenant_id} GROUP BY i.run_id)
      UPDATE platform_geo.publish_plan_runs r SET state=CASE WHEN s.review>0 THEN 'awaiting_review' WHEN s.queued>0 THEN 'queued'
        WHEN s.published=s.total THEN 'completed' WHEN s.published>0 AND (s.failed>0 OR s.skipped>0 OR s.cancelled>0) THEN 'partial'
        WHEN s.published>0 THEN 'completed' WHEN s.failed>0 THEN 'failed' WHEN s.cancelled=s.total THEN 'cancelled' ELSE 'empty' END,
        message=CASE WHEN s.published=s.total THEN '所有发布项均已完成。' WHEN s.published>0 THEN '部分发布项已完成；请检查其他记录。'
          WHEN s.failed>0 THEN '发布项失败或结果待核对，请查看发布记录。' ELSE r.message END,updated_at=now()
      FROM stats s WHERE r.tenant_id=${item.tenant_id} AND r.id=s.run_id`)
    committing = true
    await payload.db.commitTransaction(transactionID)
    return { id: created.id, url }
  } catch (error) {
    try {
      await payload.db.rollbackTransaction(transactionID)
    } catch {
      throw new Error('PUBLICATION_COMMIT_UNCONFIRMED')
    }
    if (committing) throw new Error('PUBLICATION_COMMIT_UNCONFIRMED')
    if (error instanceof GeoError) throw error
    throw Object.assign(
      new GeoError('TARGET_WRITE_FAILED', '站点写入未完成，事务已回滚；原内容未被覆盖。', 503),
      { cause: error },
    )
  }
}
