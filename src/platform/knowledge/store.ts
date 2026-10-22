import { createHash, randomUUID } from 'node:crypto'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { GeoError } from '../geo/keywords'
import { chunkKnowledge, knowledgeTokens, normalizeKnowledgeText } from './text'
import { parseKnowledgeFile } from './parser'
import type { KnowledgeBase, KnowledgeDocument, KnowledgeChunk } from './types'
export type KnowledgePool = Pick<PostgresAdapter['pool'], 'query' | 'connect'>
const selectedDocument =
  'd.id,d.title,d.filename,d.mime_type,d.bytes,d.status,d.error,d.enabled,d.archived,d.version,d.created_at,d.updated_at'
export function createKnowledgeStore(pool: KnowledgePool, tenantID: number, actorID: number) {
  const findDocument = async (id: string) => {
    const doc = (
      await pool.query(
        `SELECT ${selectedDocument},d.text_content,(SELECT count(*)::int FROM platform_knowledge.chunks c WHERE c.tenant_id=d.tenant_id AND c.document_id=d.id) AS chunks FROM platform_knowledge.documents d WHERE d.tenant_id=$1 AND d.id=$2::uuid`,
        [tenantID, id],
      )
    ).rows[0]
    if (!doc) throw new GeoError('NOT_FOUND', '未找到当前客户的资料。', 404)
    return doc as KnowledgeDocument & { text_content: string }
  }
  const index = async (id: string, text: string, expectedVersion: number) => {
    text = normalizeKnowledgeText(text)
    if (!text) throw new GeoError('EMPTY_DOCUMENT', '资料内容不能为空。')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const doc = (
        await client.query(
          `SELECT title,version FROM platform_knowledge.documents WHERE tenant_id=$1 AND id=$2::uuid FOR UPDATE`,
          [tenantID, id],
        )
      ).rows[0]
      if (!doc || doc.version !== expectedVersion)
        throw new GeoError('VERSION_CONFLICT', '资料已更新，请刷新后重试。', 409)
      const version = expectedVersion + 1
      const parts = chunkKnowledge(text, doc.title)
      await client.query(
        'DELETE FROM platform_knowledge.chunks WHERE tenant_id=$1 AND document_id=$2::uuid',
        [tenantID, id],
      )
      for (const part of parts)
        await client.query(
          `INSERT INTO platform_knowledge.chunks(id,tenant_id,document_id,ordinal,heading,content,context,search_text,document_version) VALUES($1::uuid,$2,$3::uuid,$4,$5,$6,$7,$8,$9)`,
          [
            randomUUID(),
            tenantID,
            id,
            part.ordinal,
            part.heading,
            part.content,
            part.context,
            part.searchText,
            version,
          ],
        )
      await client.query(
        `UPDATE platform_knowledge.documents SET text_content=$3,status='ready',error=NULL,version=$4,updated_by=$5,updated_at=now() WHERE tenant_id=$1 AND id=$2::uuid`,
        [tenantID, id, text, version, actorID],
      )
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    } finally {
      client.release()
    }
    return findDocument(id)
  }
  return {
    async base(): Promise<KnowledgeBase | null> {
      return (
        (
          await pool.query(
            `SELECT b.*,(SELECT count(*)::int FROM platform_knowledge.documents d WHERE d.tenant_id=b.tenant_id AND NOT d.archived) AS documents,(SELECT count(*)::int FROM platform_knowledge.chunks c JOIN platform_knowledge.documents d ON d.id=c.document_id AND d.tenant_id=c.tenant_id WHERE c.tenant_id=b.tenant_id AND NOT d.archived) AS chunks,(SELECT coalesce(sum(bytes),0)::bigint FROM platform_knowledge.documents d WHERE d.tenant_id=b.tenant_id AND NOT d.archived) AS bytes FROM platform_knowledge.bases b WHERE b.tenant_id=$1`,
            [tenantID],
          )
        ).rows[0] || null
      )
    },
    async saveBase(input: { name: string; intro: string; enabled: boolean; version?: number }) {
      const r = await pool.query(
        `INSERT INTO platform_knowledge.bases(tenant_id,id,name,intro,enabled,updated_by) VALUES($1,$2::uuid,$3,$4,$5,$6) ON CONFLICT(tenant_id) DO UPDATE SET name=excluded.name,intro=excluded.intro,enabled=excluded.enabled,version=bases.version+1,updated_by=excluded.updated_by,updated_at=now() WHERE bases.version=$7 RETURNING id`,
        [
          tenantID,
          randomUUID(),
          input.name,
          input.intro,
          input.enabled,
          actorID,
          input.version ?? 0,
        ],
      )
      if (!r.rows[0]) throw new GeoError('VERSION_CONFLICT', '知识库已被更新，请刷新后重试。', 409)
    },
    async documents(search = '', archived = false) {
      return (
        await pool.query(
          `SELECT ${selectedDocument},(SELECT count(*)::int FROM platform_knowledge.chunks c WHERE c.tenant_id=d.tenant_id AND c.document_id=d.id) AS chunks FROM platform_knowledge.documents d WHERE d.tenant_id=$1 AND d.archived=$2 AND ($3='' OR d.title ILIKE $4 OR d.filename ILIKE $4) ORDER BY d.updated_at DESC,d.id`,
          [tenantID, archived, search, `%${search.replace(/[\\%_]/g, '\\$&')}%`],
        )
      ).rows as KnowledgeDocument[]
    },
    findDocument,
    async chunks(id: string) {
      await findDocument(id)
      return (
        await pool.query(
          `SELECT c.id,c.document_id,c.ordinal,c.heading,c.content,c.context,c.document_version,d.title,d.filename FROM platform_knowledge.chunks c JOIN platform_knowledge.documents d ON d.tenant_id=c.tenant_id AND d.id=c.document_id WHERE c.tenant_id=$1 AND c.document_id=$2::uuid ORDER BY c.ordinal`,
          [tenantID, id],
        )
      ).rows as KnowledgeChunk[]
    },
    async upload(filename: string, mime: string, buffer: Buffer) {
      const id = randomUUID(),
        digest = createHash('sha256').update(buffer).digest('hex')
      const inserted = await pool.query(
        `INSERT INTO platform_knowledge.documents(id,tenant_id,title,filename,mime_type,bytes,digest,original,status,updated_by) SELECT $1::uuid,$2,$3,$4,$5,$6,$7,$8,'processing',$9 FROM platform_knowledge.bases WHERE tenant_id=$2 ON CONFLICT(tenant_id,digest) DO NOTHING RETURNING id`,
        [
          id,
          tenantID,
          filename.replace(/\.[^.]+$/, ''),
          filename,
          mime || 'application/octet-stream',
          buffer.length,
          digest,
          buffer,
          actorID,
        ],
      )
      if (!inserted.rows[0]) {
        const duplicate = (
          await pool.query(
            'SELECT id,archived FROM platform_knowledge.documents WHERE tenant_id=$1 AND digest=$2',
            [tenantID, digest],
          )
        ).rows[0]
        if (!duplicate) throw new GeoError('BASE_REQUIRED', '请先创建当前客户的知识库。', 409)
        if (duplicate.archived)
          await pool.query(
            'UPDATE platform_knowledge.documents SET archived=false,updated_at=now() WHERE tenant_id=$1 AND id=$2::uuid',
            [tenantID, duplicate.id],
          )
        return { document: await findDocument(duplicate.id), duplicate: true }
      }
      try {
        const text = await parseKnowledgeFile(filename, buffer)
        return { document: await index(id, text, 1), duplicate: false }
      } catch (error) {
        await pool.query(
          `UPDATE platform_knowledge.documents SET status='failed',error=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2::uuid`,
          [tenantID, id, error instanceof GeoError ? error.message : '文件解析失败，请重试。'],
        )
        throw error
      }
    },
    async retry(id: string) {
      const file = (
        await pool.query(
          'SELECT filename,original,version FROM platform_knowledge.documents WHERE tenant_id=$1 AND id=$2::uuid',
          [tenantID, id],
        )
      ).rows[0]
      if (!file) throw new GeoError('NOT_FOUND', '未找到当前客户的资料。', 404)
      const text = await parseKnowledgeFile(file.filename, file.original)
      return index(id, text, file.version)
    },
    index,
    async update(id: string, version: number, changes: { enabled?: boolean; archived?: boolean }) {
      const r = await pool.query(
        `UPDATE platform_knowledge.documents SET enabled=coalesce($4,enabled),archived=coalesce($5,archived),version=version+1,updated_by=$6,updated_at=now() WHERE tenant_id=$1 AND id=$2::uuid AND version=$3 RETURNING id`,
        [tenantID, id, version, changes.enabled ?? null, changes.archived ?? null, actorID],
      )
      if (!r.rows[0])
        throw new GeoError('VERSION_CONFLICT', '资料已更新或不属于当前客户，请刷新。', 409)
    },
    async original(id: string) {
      const r = (
        await pool.query(
          'SELECT filename,mime_type,original FROM platform_knowledge.documents WHERE tenant_id=$1 AND id=$2::uuid',
          [tenantID, id],
        )
      ).rows[0]
      if (!r) throw new GeoError('NOT_FOUND', '未找到当前客户的文件。', 404)
      return r as { filename: string; mime_type: string; original: Buffer }
    },
  }
}
/** Tenant, base and document status filters are applied BEFORE text retrieval. */
export async function knowledgeCandidates(
  pool: Pick<KnowledgePool, 'query'>,
  tenantID: number,
  query: string,
): Promise<KnowledgeChunk[]> {
  const tokens = [...new Set(knowledgeTokens(query))]
  if (!tokens.length) return []
  try {
    return (
      await pool.query(
        `SELECT c.id,c.document_id,c.ordinal,c.heading,c.content,c.context,c.document_version,d.title,d.filename,ts_rank_cd(c.search_vector,q.query) AS retrieval_score FROM platform_knowledge.chunks c JOIN platform_knowledge.documents d ON d.tenant_id=c.tenant_id AND d.id=c.document_id JOIN platform_knowledge.bases b ON b.tenant_id=c.tenant_id CROSS JOIN to_tsquery('simple',$2) AS q(query) WHERE c.tenant_id=$1 AND b.enabled AND d.enabled AND NOT d.archived AND d.status='ready' AND c.search_vector @@ q.query ORDER BY retrieval_score DESC,c.id LIMIT 100`,
        [tenantID, tokens.map((t) => `'${t.replace(/'/g, "''")}'`).join(' | ')],
      )
    ).rows as KnowledgeChunk[]
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      ['42P01', '3F000'].includes(String(error.code))
    )
      return []
    throw error
  }
}
