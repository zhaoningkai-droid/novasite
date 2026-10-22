export type KnowledgeBase = {
  id: string
  name: string
  intro: string
  enabled: boolean
  version: number
  documents: number
  chunks: number
  bytes: number
}
export type KnowledgeDocument = {
  id: string
  title: string
  filename: string
  mime_type: string
  bytes: number
  status: 'processing' | 'ready' | 'failed'
  error: string | null
  enabled: boolean
  archived: boolean
  version: number
  created_at: string
  updated_at: string
  chunks: number
}
export type KnowledgeChunk = {
  id: string
  document_id: string
  ordinal: number
  heading: string
  content: string
  context: string
  document_version: number
  title: string
  filename: string
}
export type KnowledgeHit = KnowledgeChunk & { score: number; reason?: string }
export type KnowledgeEvidence = {
  id: string
  title: string
  text: string
  documentID?: string
  chunkID?: string
  documentVersion?: number
  heading?: string
  score?: number
  filename?: string
}
