import path from 'node:path'
import { mediaAccessControlEnabled } from './access-mode'

export function localMediaDirectory(root = process.cwd()) {
  const publicDirectory = path.resolve(root, 'public')
  if (!mediaAccessControlEnabled()) return path.join(publicDirectory, 'media')
  const configured = process.env.MEDIA_PRIVATE_DIRECTORY
  if (configured && (!path.isAbsolute(configured) || /[\u0000-\u001f\u007f]/.test(configured)))
    throw new Error('MEDIA_PRIVATE_DIRECTORY must be an absolute private directory.')
  const directory = path.resolve(configured || path.join(root, '.private/media'))
  if (directory === publicDirectory || directory.startsWith(`${publicDirectory}${path.sep}`) ||
      publicDirectory.startsWith(`${directory}${path.sep}`))
    throw new Error('Private media must be outside public and cannot contain public.')
  return directory
}
