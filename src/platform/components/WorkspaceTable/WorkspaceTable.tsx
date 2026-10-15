'use client'

import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Languages,
  Loader2,
  Trash2,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'

import {
  translationViewLabel,
  type ProductTranslationView,
} from '../../product-translation/job-view'
import { WorkspaceRowActions } from './WorkspaceRowActions'
import './workspace-table.scss'

export type WorkspaceTableColumn = { key: string; label: string; width?: string }
export type WorkspaceTableRow = {
  canTranslate?: boolean
  translation?: ProductTranslationView
  cells: ReactNode[]
  details?: Array<{ label: string; value: ReactNode }>
  id: number
  label: string
}

type Props = {
  ariaLabel?: string
  bulkDeleteURL?: string
  bulkTranslateURL?: string
  asyncTranslation?: boolean
  columns: WorkspaceTableColumn[]
  editBaseHref?: string
  translationBaseHref?: string
  emptyAction?: { href: string; label: string }
  emptyDescription: string
  emptyTitle: string
  nextHref?: string
  page: number
  pageSize?: number
  previousHref?: string
  rows: WorkspaceTableRow[]
  showDetailsAction?: boolean
  totalDocs: number
  totalPages: number
  selectionEnabled?: boolean
  toolbarActionContent?: ReactNode
  toolbarContent?: ReactNode
}
type TableModal =
  { kind: 'details'; row: WorkspaceTableRow } | { kind: 'delete'; rows: WorkspaceTableRow[] }

export function WorkspaceTable({
  ariaLabel = '内容列表',
  bulkDeleteURL,
  bulkTranslateURL,
  asyncTranslation = false,
  columns,
  editBaseHref,
  translationBaseHref,
  emptyAction,
  emptyDescription,
  emptyTitle,
  nextHref,
  page,
  pageSize = 10,
  previousHref,
  rows,
  showDetailsAction = true,
  totalDocs,
  totalPages,
  selectionEnabled = false,
  toolbarActionContent,
  toolbarContent,
}: Props) {
  const router = useRouter()
  const checkboxRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const requestInProgress = useRef(false)
  const [jobViews, setJobViews] = useState<Record<number, ProductTranslationView>>({})
  const [progressReadError, setProgressReadError] = useState('')
  const productIDs = rows.map((row) => row.id).join(',')
  const translationFor = (row: WorkspaceTableRow) => jobViews[row.id] || row.translation
  const rowBusy = (row: WorkspaceTableRow) => Boolean(translationFor(row)?.locked)
  const [selectedIDs, setSelectedIDs] = useState<number[]>([])
  const [modal, setModal] = useState<TableModal | null>(null)
  const [batchMessage, setBatchMessage] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [translating, setTranslating] = useState(false)
  const [translationMessage, setTranslationMessage] = useState('')
  const [translationError, setTranslationError] = useState(false)
  const pageIDs = useMemo(() => rows.map((row) => row.id), [rows])
  const selectableIDs = rows.filter((row) => !rowBusy(row)).map((row) => row.id)
  const allPageRowsSelected =
    selectableIDs.length > 0 && selectableIDs.every((id) => selectedIDs.includes(id))
  const canSelect = Boolean(selectionEnabled || bulkDeleteURL || bulkTranslateURL)
  const selectedTranslatableRows = rows.filter(
    (row) =>
      selectedIDs.includes(row.id) &&
      !rowBusy(row) &&
      (translationFor(row)?.canTranslate ?? row.canTranslate) !== false,
  )

  useEffect(() => {
    setSelectedIDs((previous) => previous.filter((id) => pageIDs.includes(id)))
  }, [pageIDs])

  useEffect(() => {
    // A save/refresh supplies a new source snapshot; discard cached completion states.
    setJobViews({})
  }, [rows])

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = selectedIDs.length > 0 && !allPageRowsSelected
    }
  }, [allPageRowsSelected, selectedIDs.length])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!modal || !dialog) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    dialog.querySelector<HTMLElement>('[data-initial-focus]')?.focus()
    return () => {
      dialog.close()
      document.body.style.overflow = previousOverflow
      if (openerRef.current?.isConnected) openerRef.current.focus()
    }
  }, [modal])

  const openModal = (value: TableModal) => {
    openerRef.current = document.activeElement as HTMLElement | null
    setDeleteError('')
    setModal(value)
  }
  const closeModal = () => {
    if (requestInProgress.current) return
    setModal(null)
    if (deleteError) router.refresh()
  }
  const toggleRow = (id: number) =>
    setSelectedIDs((previous) =>
      previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id],
    )
  const toggleAll = () =>
    setSelectedIDs(
      allPageRowsSelected ? [] : rows.filter((row) => !rowBusy(row)).map((row) => row.id),
    )
  useEffect(() => {
    if (!asyncTranslation || !bulkTranslateURL || !productIDs) return
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    const read = async () => {
      let count = 0
      try {
        const response = await fetch(`${bulkTranslateURL}?ids=${productIDs}`, { cache: 'no-store' })
        if (!response.ok) throw new Error('进度暂时无法读取；后台任务仍会继续，请稍后刷新。')
        const result = (await response.json()) as {
          views: ProductTranslationView[]
          activeCount: number
        }
        if (disposed) return
        setJobViews(Object.fromEntries(result.views.map((view) => [view.productID, view])))
        count = result.activeCount
        setProgressReadError('')
      } catch (error) {
        if (!disposed)
          setProgressReadError(error instanceof Error ? error.message : '进度读取失败。')
      } finally {
        if (!disposed) timer = setTimeout(() => void read(), count ? 3000 : 12000)
      }
    }
    void read()
    return () => {
      disposed = true
      clearTimeout(timer)
    }
  }, [asyncTranslation, bulkTranslateURL, productIDs, translating])

  const translateSelected = async () => {
    if (!bulkTranslateURL || translating || selectedTranslatableRows.length === 0) return
    const selectedRows = selectedTranslatableRows
    const completedIDs: number[] = []
    const failed: string[] = []
    setTranslating(true)
    setTranslationMessage('')
    setTranslationError(false)
    if (asyncTranslation) {
      try {
        const response = await fetch(bulkTranslateURL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ids: selectedRows.map((row) => row.id) }),
          signal: AbortSignal.timeout(20_000),
        })
        const result = (await response.json()) as {
          message?: string
          accepted?: Array<{ productID: number; jobID: string }>
        }
        if (!response.ok) throw new Error(result.message || '任务提交失败。')
        setJobViews((previous) => {
          const next = { ...previous }
          for (const accepted of result.accepted || []) {
            const row = rows.find((row) => row.id === accepted.productID)
            const existing = next[accepted.productID] || row?.translation
            next[accepted.productID] = {
              ...existing,
              productID: accepted.productID,
              jobID: accepted.jobID,
              locked: true,
              canTranslate: false,
              status: 'queued',
              completed: existing?.completed || 0,
              total: existing?.total || 0,
              languages: existing?.languages || [],
            }
          }
          return next
        })
        setSelectedIDs([])
        router.refresh()
      } catch (error) {
        setTranslationError(true)
        setTranslationMessage(
          error instanceof Error && error.name === 'TimeoutError'
            ? '提交响应超时，请刷新确认产品任务状态，避免重复提交。'
            : error instanceof Error
              ? error.message
              : '任务提交失败。',
        )
      } finally {
        setTranslating(false)
      }
      return
    }
    try {
      for (const row of selectedRows) {
        try {
          const response = await fetch(`${bulkTranslateURL}/${row.id}`, {
            body: JSON.stringify({}),
            headers: { 'content-type': 'application/json' },
            method: 'POST',
            signal: AbortSignal.timeout(210_000),
          })
          const result = (await response.json().catch(() => null)) as { message?: string } | null
          if (!response.ok) throw new Error(result?.message || '翻译失败。')
          completedIDs.push(row.id)
        } catch (error) {
          failed.push(`${row.label}：${error instanceof Error ? error.message : '翻译失败'}`)
        }
      }
      setSelectedIDs((current) => current.filter((id) => !completedIDs.includes(id)))
      setTranslationError(failed.length > 0)
      setTranslationMessage(failed.slice(0, 2).join('；'))
      if (completedIDs.length) router.refresh()
    } finally {
      setTranslating(false)
    }
  }

  const deleteSelected = async () => {
    if (!bulkDeleteURL || modal?.kind !== 'delete' || requestInProgress.current) return
    const requestedIDs = modal.rows.map((row) => row.id)
    if (!requestedIDs.length) return
    requestInProgress.current = true
    setDeleting(true)
    setDeleteError('')
    setBatchMessage('')
    try {
      const response = await fetch(bulkDeleteURL, {
        body: JSON.stringify({ ids: requestedIDs }),
        headers: { 'content-type': 'application/json' },
        method: 'DELETE',
        signal: AbortSignal.timeout(15_000),
      })
      const result = (await response.json().catch(() => null)) as { message?: string } | null
      if (!response.ok) {
        setDeleteError(result?.message || '删除失败，请取消并刷新列表确认后重试。')
        return
      }
      setBatchMessage(result?.message || '所选内容已删除。')
      setSelectedIDs((current) => current.filter((id) => !requestedIDs.includes(id)))
      setModal(null)
      router.refresh()
    } catch {
      setDeleteError('连接中断或请求超时，请取消并刷新列表确认删除结果后重试。')
    } finally {
      requestInProgress.current = false
      setDeleting(false)
    }
  }

  const firstShown = rows.length ? (page - 1) * pageSize + 1 : 0
  const lastShown = rows.length ? firstShown + rows.length - 1 : 0
  const actionWidth = translationBaseHref ? '156px' : bulkDeleteURL ? '156px' : '124px'

  return (
    <section aria-label={ariaLabel} className="workspace-table">
      {(toolbarContent || bulkTranslateURL || selectionEnabled || toolbarActionContent) && (
        <div className="workspace-table__toolbar">
          {toolbarContent && (
            <div className="workspace-table__toolbar-content">{toolbarContent}</div>
          )}
          {(bulkDeleteURL || bulkTranslateURL) && (
            <div aria-label="所选内容操作" className="workspace-table__toolbar-actions">
              {bulkDeleteURL && (
                <button
                  className="workspace-table__toolbar-delete"
                  disabled={
                    selectedIDs.length === 0 ||
                    deleting ||
                    translating ||
                    rows.some((row) => selectedIDs.includes(row.id) && rowBusy(row))
                  }
                  onClick={() =>
                    openModal({
                      kind: 'delete',
                      rows: rows.filter((row) => selectedIDs.includes(row.id)),
                    })
                  }
                  type="button"
                >
                  <Trash2 aria-hidden="true" size={16} />
                  删除
                </button>
              )}
              {bulkTranslateURL && (
                <button
                  className="workspace-table__toolbar-translate"
                  disabled={selectedTranslatableRows.length === 0 || deleting || translating}
                  onClick={() => void translateSelected()}
                  type="button"
                >
                  {translating ? (
                    <Loader2 aria-hidden="true" className="workspace-table__spinner" size={16} />
                  ) : (
                    <Languages aria-hidden="true" size={16} />
                  )}
                  {translating ? '翻译中…' : '翻译'}
                </button>
              )}
              {toolbarActionContent}
            </div>
          )}
        </div>
      )}
      {progressReadError && (
        <p className="workspace-table__batch-message is-error" role="status">
          {progressReadError}
        </p>
      )}
      {translationMessage && (
        <p
          className={`workspace-table__batch-message${translationError ? ' is-error' : ''}`}
          role={translationError ? 'alert' : 'status'}
        >
          {translationMessage}
        </p>
      )}
      {selectedIDs.length > 0 && (
        <div className="workspace-table__selection" role="status">
          <strong>已选择 {selectedIDs.length} 项</strong>
          <span>仅限当前页；翻页或变更筛选会清除选择。</span>
          <div>
            {bulkDeleteURL && !selectionEnabled && (
              <button
                className="workspace-table__selection-delete"
                disabled={deleting}
                onClick={() =>
                  openModal({
                    kind: 'delete',
                    rows: rows.filter((row) => selectedIDs.includes(row.id)),
                  })
                }
                type="button"
              >
                <Trash2 aria-hidden="true" size={15} />
                批量删除
              </button>
            )}
            <button disabled={deleting} onClick={() => setSelectedIDs([])} type="button">
              取消选择
            </button>
          </div>
        </div>
      )}
      {batchMessage && (
        <p className="workspace-table__batch-message" role="status">
          <CheckCircle2 aria-hidden="true" size={16} />
          {batchMessage}
        </p>
      )}
      {rows.length > 0 ? (
        <div
          aria-label={ariaLabel + '，可横向滚动'}
          className="workspace-table__wrap"
          role="region"
          tabIndex={0}
        >
          <table>
            <caption className="workspace-table__sr-only">{ariaLabel}</caption>
            <colgroup>
              {canSelect && <col style={{ width: '44px' }} />}
              {columns.map((column) => (
                <col key={column.key} style={{ width: column.width }} />
              ))}
              <col style={{ width: actionWidth }} />
            </colgroup>
            <thead>
              <tr>
                {canSelect && (
                  <th className="workspace-table__checkbox" scope="col">
                    <input
                      aria-label="选择本页全部内容"
                      checked={allPageRowsSelected}
                      disabled={deleting || translating}
                      onChange={toggleAll}
                      ref={checkboxRef}
                      type="checkbox"
                    />
                  </th>
                )}
                {columns.map((column) => (
                  <th key={column.key} scope="col">
                    {column.label}
                  </th>
                ))}
                <th className="workspace-table__action-heading" scope="col">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  aria-busy={rowBusy(row) || undefined}
                  className={
                    selectedIDs.includes(row.id) ? 'workspace-table__row--selected' : undefined
                  }
                  key={row.id}
                >
                  {canSelect && (
                    <td className="workspace-table__checkbox">
                      <input
                        aria-label={'选择 ' + row.label}
                        checked={selectedIDs.includes(row.id)}
                        disabled={deleting || rowBusy(row)}
                        onChange={() => toggleRow(row.id)}
                        type="checkbox"
                      />
                    </td>
                  )}
                  {row.cells.map((cell, index) => (
                    <td key={row.id + '-' + (columns[index]?.key || index)}>
                      <div
                        className={
                          index === 0
                            ? 'workspace-table__cell workspace-table__cell--title'
                            : 'workspace-table__cell'
                        }
                        title={
                          columns[index]?.key !== 'translation' && typeof cell === 'string'
                            ? cell
                            : undefined
                        }
                      >
                        {columns[index]?.key === 'translation' ? (
                          <span>{translationViewLabel(translationFor(row), cell)}</span>
                        ) : columns[index]?.key === 'featured' ? (
                          <fieldset
                            className="workspace-table__locked-control"
                            disabled={rowBusy(row)}
                          >
                            {cell ?? '—'}
                          </fieldset>
                        ) : (
                          (cell ?? '—')
                        )}
                      </div>
                    </td>
                  ))}
                  <td className="workspace-table__action-cell">
                    <WorkspaceRowActions
                      disabled={deleting || rowBusy(row) || selectedIDs.includes(row.id)}
                      editHref={editBaseHref ? editBaseHref + '/' + row.id + '/edit' : undefined}
                      label={row.label}
                      onDelete={
                        bulkDeleteURL ? () => openModal({ kind: 'delete', rows: [row] }) : undefined
                      }
                      onDetails={() => openModal({ kind: 'details', row })}
                      showDetailsAction={showDetailsAction}
                      translationHref={
                        translationBaseHref
                          ? translationBaseHref + '/' + row.id + '/translations'
                          : undefined
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="workspace-table__empty">
          <span aria-hidden="true">
            <Inbox size={28} strokeWidth={1.5} />
          </span>
          <h2>{emptyTitle}</h2>
          <p>{emptyDescription}</p>
          {emptyAction && <Link href={emptyAction.href}>{emptyAction.label}</Link>}
        </div>
      )}
      <footer className="workspace-table__footer">
        <div>
          <strong>共 {totalDocs} 条</strong>
          <span>
            显示 {firstShown}–{lastShown} 条
          </span>
        </div>
        <nav aria-label="列表分页">
          <span>
            第 {page} / {Math.max(totalPages, 1)} 页
          </span>
          {previousHref ? (
            <Link aria-label="上一页" className="workspace-table__page" href={previousHref}>
              <ChevronLeft aria-hidden="true" size={15} />
              上一页
            </Link>
          ) : (
            <button className="workspace-table__page" disabled type="button">
              <ChevronLeft aria-hidden="true" size={15} />
              上一页
            </button>
          )}
          {nextHref ? (
            <Link aria-label="下一页" className="workspace-table__page" href={nextHref}>
              下一页
              <ChevronRight aria-hidden="true" size={15} />
            </Link>
          ) : (
            <button className="workspace-table__page" disabled type="button">
              下一页
              <ChevronRight aria-hidden="true" size={15} />
            </button>
          )}
        </nav>
      </footer>
      {modal && (
        <dialog
          aria-busy={deleting || undefined}
          aria-label={modal.kind === 'details' ? '完整内容' : '确认删除内容'}
          className={
            'workspace-table__dialog' +
            (modal.kind === 'delete' ? ' workspace-table__dialog--delete' : '')
          }
          onCancel={(event) => {
            event.preventDefault()
            closeModal()
          }}
          onClick={(event) => {
            if (event.target !== event.currentTarget) return
            const bounds = event.currentTarget.getBoundingClientRect()
            if (
              event.clientX < bounds.left ||
              event.clientX > bounds.right ||
              event.clientY < bounds.top ||
              event.clientY > bounds.bottom
            )
              closeModal()
          }}
          ref={dialogRef}
        >
          <button
            aria-label={modal.kind === 'details' ? '关闭完整内容' : '取消删除'}
            className="workspace-table__dialog-close"
            disabled={deleting}
            onClick={closeModal}
            type="button"
          >
            <X aria-hidden="true" size={20} />
          </button>
          {modal.kind === 'details' ? (
            <>
              <p className="workspace-table__dialog-eyebrow">内容详情 · 只读查看</p>
              <h2>{modal.row.label}</h2>
              <dl>
                {(
                  modal.row.details ||
                  columns.map((column, index) => ({
                    label: column.label,
                    value: modal.row.cells[index],
                  }))
                ).map((detail, index) => (
                  <div key={detail.label + index}>
                    <dt>{detail.label}</dt>
                    <dd>{
                      detail.label === '翻译状态' ||
                      detail.label === '翻译进度' ||
                      columns.some((column) => column.key === 'translation' && column.label === detail.label)
                        ? translationViewLabel(translationFor(modal.row), detail.value)
                        : detail.value ?? '—'
                    }</dd>
                  </div>
                ))}
              </dl>
              <footer>
                <button data-initial-focus onClick={closeModal} type="button">
                  关闭
                </button>
              </footer>
            </>
          ) : (
            <>
              <span aria-hidden="true" className="workspace-table__delete-icon">
                <AlertTriangle size={24} />
              </span>
              <h2>删除这 {modal.rows.length} 项内容？</h2>
              <p className="workspace-table__delete-description">
                删除后无法恢复。请确认以下内容属于你要删除的记录。
              </p>
              <ul className="workspace-table__delete-list">
                {modal.rows.map((row) => (
                  <li key={row.id}>{row.label}</li>
                ))}
              </ul>
              {deleteError && (
                <p className="workspace-table__delete-error" role="alert">
                  {deleteError}
                </p>
              )}
              <footer>
                <button data-initial-focus disabled={deleting} onClick={closeModal} type="button">
                  取消
                </button>
                <button
                  className="workspace-table__confirm-delete"
                  disabled={deleting}
                  onClick={() => void deleteSelected()}
                  type="button"
                >
                  {deleting ? '删除中…' : '确认删除'}
                </button>
              </footer>
            </>
          )}
        </dialog>
      )}
    </section>
  )
}
