'use client'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { WorkspaceCompany } from '@/platform/workspace'
import type { GeoMaterialGroup } from '@/platform/geo/materials'
import './geo-workspace.scss'

type FolderItem = { id: string; name: string; updatedAt: string }
type GroupItem = Pick<
  GeoMaterialGroup,
  'id' | 'name' | 'description' | 'version' | 'archived' | 'updatedAt' | 'parentGroupID'
> & { count: number }
type TreeResult = { folders: FolderItem[]; groups: GroupItem[] }
type CreateKind = 'folder' | 'group'
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const extensionTypes: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}
const maxImageSize = 512_000

async function readJSON(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: 'no-store', ...init })
  const result = await response.json()
  if (!response.ok) throw new Error(result.message || '操作失败，请稍后重试。')
  return result
}

export function GeoMaterials({
  company,
  recordId,
}: {
  company: WorkspaceCompany
  recordId?: string
}) {
  const router = useRouter()
  const base = `/workspace/${encodeURIComponent(company.slug)}/geo/materials`
  const endpoint = `/api/workspace/${encodeURIComponent(company.slug)}/geo/materials`
  const [tree, setTree] = useState<TreeResult>({ folders: [], groups: [] })
  const [selectedFolderID, setSelectedFolderID] = useState<string | null>(null)
  const [selectedGroupID, setSelectedGroupID] = useState(recordId || '')
  const [group, setGroup] = useState<GeoMaterialGroup | null>(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingGroup, setLoadingGroup] = useState(false)
  const [reload, setReload] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [createKind, setCreateKind] = useState<CreateKind | null>(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ total: number; completed: number } | null>(
    null,
  )
  const [uploadError, setUploadError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setSelectedGroupID(recordId || '')
  }, [recordId])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    void readJSON(`${endpoint}?tree=true`, { signal: controller.signal })
      .then((result: TreeResult) => {
        if (!controller.signal.aborted) setTree(result)
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : '素材组读取失败。')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [endpoint, reload])
  useEffect(() => {
    if (!createKind) {
      if (dialog.current?.open) dialog.current.close()
      return
    }
    setNewName('')
    if (!dialog.current?.open) dialog.current?.showModal()
  }, [createKind])
  useEffect(() => {
    if (!selectedGroupID) {
      setGroup(null)
      setLoadingGroup(false)
      return
    }
    const controller = new AbortController()
    setLoadingGroup(true)
    setGroup(null)
    setError('')
    void readJSON(`${endpoint}/${selectedGroupID}`, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return
        setGroup(result.item)
        setSelectedFolderID(result.item.parentGroupID || null)
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : '图片读取失败。')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingGroup(false)
      })
    return () => controller.abort()
  }, [endpoint, selectedGroupID, reload])

  const folderNames = useMemo(
    () => new Map(tree.folders.map((folder) => [folder.id, folder.name])),
    [tree.folders],
  )
  const queryText = query.trim().toLocaleLowerCase()
  const visibleFolders = tree.folders.filter(
    (folder) => !queryText || folder.name.toLocaleLowerCase().includes(queryText),
  )
  const visibleGroups = tree.groups.filter((item) => {
    const matchesFolder =
      queryText ||
      (selectedFolderID ? item.parentGroupID === selectedFolderID : item.parentGroupID === null)
    return matchesFolder && (!queryText || item.name.toLocaleLowerCase().includes(queryText))
  })
  const activeFolder = selectedFolderID ? folderNames.get(selectedFolderID) || '' : ''

  const chooseRoot = () => {
    setSelectedGroupID('')
    setSelectedFolderID(null)
    setNotice('')
    router.push(base)
  }
  const chooseFolder = (id: string) => {
    setSelectedGroupID('')
    setSelectedFolderID(id)
    setNotice('')
    router.push(base)
  }
  const chooseGroup = (item: GroupItem) => {
    setSelectedGroupID(item.id)
    setSelectedFolderID(item.parentGroupID)
    setNotice('')
    router.push(`${base}/${encodeURIComponent(item.id)}`)
  }

  const createEntry = async (event: FormEvent) => {
    event.preventDefault()
    if (!createKind || creating) return
    setCreating(true)
    setError('')
    try {
      const requestId = crypto.randomUUID()
      const body =
        createKind === 'folder'
          ? { kind: 'folder', requestId, name: newName }
          : {
              kind: 'group',
              requestId,
              name: newName,
              description: '',
              mediaIds: [],
              parentGroupID: selectedFolderID,
            }
      const result = await readJSON(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      setCreateKind(null)
      setNotice(createKind === 'folder' ? '目录已创建。' : '素材组已创建。')
      if (createKind === 'folder') {
        setSelectedGroupID('')
        setSelectedFolderID(result.item.id)
      } else {
        setSelectedGroupID(result.item.id)
        setSelectedFolderID(result.item.parentGroupID || null)
        router.push(`${base}/${encodeURIComponent(result.item.id)}`)
      }
      setReload((value) => value + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建失败，请重试。')
    } finally {
      setCreating(false)
    }
  }

  const selectFiles = (picked: FileList | null) => {
    if (!picked) return
    const next = Array.from(picked)
    const invalid = next.find((file) => {
      const extension = file.name.split('.').pop()?.toLowerCase() || ''
      const mime = file.type || extensionTypes[extension]
      return (
        !imageTypes.has(mime || '') ||
        extensionTypes[extension] !== mime ||
        file.size === 0 ||
        file.size > maxImageSize
      )
    })
    if (invalid) {
      const extension = invalid.name.split('.').pop()?.toLowerCase() || ''
      const mime = invalid.type || extensionTypes[extension]
      setUploadError(
        !imageTypes.has(mime || '') || extensionTypes[extension] !== mime
          ? '仅支持 JPG、PNG 或 WebP 图片。'
          : `“${invalid.name}”超过单张500KB限制或文件为空。`,
      )
      setFiles([])
      return
    }
    setUploadError('')
    setFiles(next)
  }

  const uploadFiles = async () => {
    if (!group || !files.length || uploading) return
    setUploading(true)
    setUploadError('')
    const selected = files
    let currentGroup = group
    let uploaded = 0
    let completed = 0
    const remaining: File[] = []
    setUploadProgress({ total: selected.length, completed: 0 })
    try {
      for (let offset = 0; offset < selected.length; offset += 20) {
        const batch = selected.slice(offset, offset + 20)
        const body = new FormData()
        body.append('version', String(currentGroup.version))
        for (const file of batch) body.append('files', file, file.name)
        try {
          const result = await readJSON(`${endpoint}/${currentGroup.id}/upload`, {
            method: 'POST',
            body,
          })
          currentGroup = result.item
          uploaded += Number(result.uploaded || 0)
          setGroup(currentGroup)
          const failed = new Set<number>(result.failedIndexes || [])
          batch.forEach((file, index) => {
            if (failed.has(index)) remaining.push(file)
          })
          completed += batch.length
          setUploadProgress({ total: selected.length, completed })
        } catch (cause) {
          remaining.push(...selected.slice(offset))
          setUploadError(cause instanceof Error ? cause.message : '上传失败，请重试。')
          break
        }
      }
      setFiles(remaining)
      if (uploaded) setNotice(`已上传${uploaded}张图片到「${group.name}」。`)
      if (remaining.length)
        setUploadError(
          (current) =>
            current || `${uploaded}张已加入素材组；${remaining.length}张未上传，请检查后重试。`,
        )
      else {
        setUploadError('')
        setUploadOpen(false)
      }
      setReload((value) => value + 1)
    } finally {
      setUploading(false)
      setUploadProgress(null)
    }
  }

  return (
    <section className="geo-workspace geo-material-library" aria-label="当前客户GEO素材库">
      <header className="geo-workspace__heading">
        <div>
          <h1>素材库</h1>
        </div>
        <div className="geo-material-library__heading-actions">
          <button
            type="button"
            className="geo-workspace__button is-primary"
            disabled={!group || group.archived || loadingGroup}
            onClick={() => {
              setFiles([])
              setUploadError('')
              setUploadOpen(true)
            }}
          >
            上传素材
          </button>
        </div>
      </header>
      {notice && (
        <p role="status" className="geo-workspace__notice">
          {notice}
        </p>
      )}
      {error && (
        <div role="alert" className="geo-workspace__error">
          {error}
          <button
            className="geo-workspace__link"
            type="button"
            onClick={() => setReload((value) => value + 1)}
          >
            重新读取
          </button>
        </div>
      )}
      <div className="geo-workspace__panel geo-material-library__layout">
        <aside className="geo-material-library__sidebar" aria-label="素材目录">
          <div className="geo-material-library__sidebar-heading">
            <strong>我的素材</strong>
            <button
              type="button"
              className="geo-workspace__button"
              onClick={() => setCreateKind('group')}
            >
              创建
            </button>
          </div>
          <button
            type="button"
            className={`geo-material-library__tree-row${!selectedGroupID && !selectedFolderID ? ' is-selected' : ''}`}
            onClick={chooseRoot}
          >
            <span aria-hidden="true">▦</span>
            <span>全部</span>
          </button>
          {visibleFolders.map((folder) => (
            <div className="geo-material-library__folder" key={folder.id}>
              <button
                type="button"
                className={`geo-material-library__tree-row${selectedFolderID === folder.id && !selectedGroupID ? ' is-selected' : ''}`}
                onClick={() => chooseFolder(folder.id)}
              >
                <span aria-hidden="true">▰</span>
                <span>{folder.name}</span>
                <small>
                  {tree.groups.filter((item) => item.parentGroupID === folder.id).length}
                </small>
              </button>
              <div className="geo-material-library__children">
                {tree.groups
                  .filter((item) => item.parentGroupID === folder.id)
                  .map((item) => (
                    <button
                      type="button"
                      className={`geo-material-library__tree-row${selectedGroupID === item.id ? ' is-selected' : ''}`}
                      key={item.id}
                      onClick={() => chooseGroup(item)}
                      title={item.name}
                    >
                      <span aria-hidden="true">▧</span>
                      <span>{item.name}</span>
                      <small>{item.count}</small>
                    </button>
                  ))}
              </div>
            </div>
          ))}
          {tree.groups
            .filter((item) => item.parentGroupID === null)
            .map((item) => (
              <button
                type="button"
                className={`geo-material-library__tree-row${selectedGroupID === item.id ? ' is-selected' : ''}`}
                key={item.id}
                onClick={() => chooseGroup(item)}
                title={item.name}
              >
                <span aria-hidden="true">▧</span>
                <span>{item.name}</span>
                <small>{item.count}</small>
              </button>
            ))}
        </aside>
        <main className="geo-material-library__content">
          {selectedGroupID && group ? (
            <>
              <div className="geo-material-library__content-heading">
                <div>
                  <p className="geo-material-library__breadcrumb">
                    我的素材{activeFolder ? ` / ${activeFolder}` : ''}
                  </p>
                  <h2>素材</h2>
                  <span>
                    {group.name} · {group.images.length} 张图片
                    {group.archived ? ' · 已归档' : ''}
                  </span>
                </div>
              </div>
              {loadingGroup ? (
                <p role="status" className="geo-workspace__empty">
                  正在读取素材图片…
                </p>
              ) : group.images.length ? (
                <div className="geo-material-library__grid">
                  {group.images.map((image) => (
                    <article className="geo-material-library__image-card" key={image.id}>
                      <div className="geo-material-library__image">
                        {image.available && (image.thumbnailURL || image.url) ? (
                          <Image
                            src={image.thumbnailURL || image.url}
                            alt={image.alt || image.filename || '素材图片'}
                            fill
                            sizes="210px"
                            unoptimized
                          />
                        ) : (
                          <span>图片不可用</span>
                        )}
                      </div>
                      <strong title={image.filename}>
                        {image.filename || image.alt || '素材图片'}
                      </strong>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="geo-workspace__empty">
                  <strong>这个素材组还没有图片</strong>
                  <p>直接从电脑选择图片，上传后会保存在当前素材组。</p>
                  {!group.archived && (
                    <button
                      type="button"
                      className="geo-workspace__button is-primary"
                      onClick={() => {
                        setFiles([])
                        setUploadError('')
                        setUploadOpen(true)
                      }}
                    >
                      上传素材
                    </button>
                  )}
                </div>
              )}
            </>
          ) : selectedGroupID ? (
            loadingGroup ? (
              <p role="status" className="geo-workspace__empty">
                正在读取素材组…
              </p>
            ) : null
          ) : (
            <>
              <div className="geo-material-library__content-heading">
                <div>
                  <p className="geo-material-library__breadcrumb">
                    我的素材{activeFolder ? ` / ${activeFolder}` : ''}
                  </p>
                  <h2>素材</h2>
                  <span>{visibleGroups.length} 个素材组</span>
                </div>
                <input
                  aria-label="搜索目录或素材组"
                  className="geo-material-library__search"
                  type="search"
                  placeholder="搜索目录或素材组"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              {loading ? (
                <p role="status" className="geo-workspace__empty">
                  正在读取素材目录…
                </p>
              ) : visibleGroups.length ? (
                <div className="geo-material-library__group-grid">
                  {visibleGroups.map((item) => (
                    <button
                      type="button"
                      className="geo-material-library__group-card"
                      key={item.id}
                      onClick={() => chooseGroup(item)}
                    >
                      <span aria-hidden="true">▧</span>
                      <strong>{item.name}</strong>
                      <small>
                        {item.count} 张图片{item.archived ? ' · 已归档' : ''}
                      </small>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="geo-workspace__empty">
                  <strong>这里还没有素材组</strong>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      <dialog
        ref={dialog}
        className="geo-workspace__dialog geo-material-library__dialog"
        onClose={() => {
          setCreateKind(null)
          setNewName('')
        }}
      >
        <header>
          <h2>{createKind === 'folder' ? '新建目录' : '创建素材组'}</h2>
          <button
            type="button"
            aria-label="关闭"
            onClick={() => {
              dialog.current?.close()
              setCreateKind(null)
            }}
          >
            ×
          </button>
        </header>
        <form onSubmit={(event) => void createEntry(event)}>
          <label className="geo-material-library__name-label" htmlFor="geo-material-name">
            {createKind === 'folder' ? '目录名称' : '素材组名称'}
          </label>
          <div className="geo-workspace__counter">
            <input
              id="geo-material-name"
              autoFocus
              required
              maxLength={15}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder={createKind === 'folder' ? '请输入目录名称' : '请输入素材组名称'}
            />
            <span>{newName.length} / 15</span>
          </div>
          <footer>
            <button
              type="button"
              className="geo-workspace__button"
              disabled={creating}
              onClick={() => {
                dialog.current?.close()
                setCreateKind(null)
              }}
            >
              取消
            </button>
            <button
              type="submit"
              className="geo-workspace__button is-primary"
              disabled={creating || !newName.trim()}
            >
              {creating ? '创建中…' : '确定'}
            </button>
          </footer>
        </form>
      </dialog>

      {uploadOpen && group && (
        <div
          className="geo-material-library__backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !uploading) setUploadOpen(false)
          }}
        >
          <aside
            className="geo-material-library__drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="geo-upload-title"
          >
            <header>
              <div>
                <h2 id="geo-upload-title">上传素材</h2>
                <p>
                  保存到：{activeFolder ? `${activeFolder} / ` : ''}
                  {group.name}
                </p>
              </div>
              <button
                type="button"
                aria-label="关闭"
                disabled={uploading}
                onClick={() => setUploadOpen(false)}
              >
                ×
              </button>
            </header>
            <div className="geo-material-library__dropzone">
              <span aria-hidden="true">↑</span>
              <strong>选择电脑上的图片</strong>
              <p>仅支持 JPG、PNG、WebP；单张不超过500KB</p>
              <button
                type="button"
                className="geo-workspace__button"
                disabled={uploading}
                onClick={() => input.current?.click()}
              >
                选择图片
              </button>
              <input
                ref={input}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                aria-label="从电脑选择图片"
                onChange={(event) => {
                  selectFiles(event.currentTarget.files)
                  event.currentTarget.value = ''
                }}
              />
            </div>
            <div className="geo-material-library__selected-files">
              <strong>已选择 {files.length} 张，素材组图片数量不限</strong>
              {files.slice(0, 12).map((file) => (
                <div key={`${file.name}-${file.lastModified}-${file.size}`}>
                  <span>{file.name}</span>
                  <small>{(file.size / 1024).toFixed(0)}KB</small>
                </div>
              ))}
              {files.length > 12 && <p>另有 {files.length - 12} 张图片</p>}
            </div>
            {uploadProgress && (
              <p className="geo-material-library__upload-progress" role="status">
                已处理 {uploadProgress.completed} / {uploadProgress.total} 张
              </p>
            )}
            {uploadError && (
              <p role="alert" className="geo-workspace__error">
                {uploadError}
              </p>
            )}
            <footer>
              <button
                type="button"
                className="geo-workspace__button"
                disabled={uploading}
                onClick={() => setUploadOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="geo-workspace__button is-primary"
                disabled={uploading || !files.length}
                onClick={() => void uploadFiles()}
              >
                {uploading ? '上传中…' : '上传并加入素材组'}
              </button>
            </footer>
          </aside>
        </div>
      )}
    </section>
  )
}
