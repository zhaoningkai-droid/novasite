import { s3Storage } from '@payloadcms/storage-s3'
import type { Plugin } from 'payload'

export function createStoragePlugin(): Plugin {
  const enabled = process.env.S3_ENABLED === 'true'
  const endpoint = process.env.S3_ENDPOINT
  const accessKeyId = process.env.S3_ACCESS_KEY
  const secretAccessKey = process.env.S3_SECRET_KEY

  if (enabled && (!process.env.S3_BUCKET || !accessKeyId || !secretAccessKey)) {
    throw new Error('S3_BUCKET, S3_ACCESS_KEY and S3_SECRET_KEY are required when S3_ENABLED=true.')
  }

  return s3Storage({
    alwaysInsertFields: true,
    bucket: process.env.S3_BUCKET || 'novasite-media',
    clientUploads: process.env.S3_CLIENT_UPLOADS === 'true',
    collections: { media: { prefix: 'media' } },
    config: {
      credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
      endpoint,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      region: process.env.S3_REGION || 'us-east-1',
    },
    enabled,
  })
}
