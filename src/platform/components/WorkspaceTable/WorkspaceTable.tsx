'use client'

import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Trash2,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'

import { WorkspaceRowActions } from './WorkspaceRowActions'
import './workspace-table.scss'

export type WorkspaceTableColumn = { key: string; label: string; width?: string }
export type WorkspaceTableRow = {
  cells: ReactNode[]
  details?: Array<{ label: string; value: ReactNode }>
  id: number
  label: string
}

type Props = {
  ariaLabel?: string
  bulkDeleteURL?: string
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
  totalDocs: number
  totalPages: number
}
type TableModal =
  { kind: 'details'; row: WorkspaceTableRow } | { kind: 'delete'; rows: WorkspaceTableRow[] }

export function WorkspaceTable({
  ariaLabel = '内容列表',
  bulkDeleteURL,
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
  totalDocs,
  totalPages,
}: Props) {
  const router = useRouter()
  const checkboxRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const requestInProgress = useRef(false)
  const [selectedIDs, setSelectedIDs] = useState<number[]>([])
  const [modal, setModal] = useState<TableModal | null>(null)
  const [batchMessage, setBatchMessage] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const pageIDs = useMemo(() => rows.map((row) => row.id), [rows])
  const allPageRowsSelected = pageIDs.length > 0 && pageIDs.every((id) => selectedIDs.includes(id))

  useEffect(() => {
    setSelectedIDs((previous) => previous.filter((id) => pageIDs.includes(id)))
  }, [pageIDs])

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
  const toggleAll = () => setSelectedIDs(allPageRowsSelected ? [] : pageIDs)

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
      {selectedIDs.length > 0 && (
        <div className="workspace-table__selection" role="status">
          <strong>已选择 {selectedIDs.length} 项</strong>
          <span>仅限当前页；翻页或变更筛选会清除选择。</span>
          <div>
            {bulkDeleteURL && (
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
              {bulkDeleteURL && <col style={{ width: '44px' }} />}
              {columns.map((column) => (
                <col key={column.key} style={{ width: column.width }} />
              ))}
              <col style={{ width: actionWidth }} />
            </colgroup>
            <thead>
              <tr>
                {bulkDeleteURL && (
                  <th className="workspace-table__checkbox" scope="col">
                    <input
                      aria-label="选择本页全部内容"
                      checked={allPageRowsSelected}
                      disabled={deleting}
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
                  className={
                    selectedIDs.includes(row.id) ? 'workspace-table__row--selected' : undefined
                  }
                  key={row.id}
                >
                  {bulkDeleteURL && (
                    <td className="workspace-table__checkbox">
                      <input
                        aria-label={'选择 ' + row.label}
                        checked={selectedIDs.includes(row.id)}
                        disabled={deleting}
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
                        title={typeof cell === 'string' ? cell : undefined}
                      >
                        {cell ?? '—'}
                      </div>
                    </td>
                  ))}
                  <td className="workspace-table__action-cell">
                    <WorkspaceRowActions
                      disabled={deleting || selectedIDs.length > 0}
                      editHref={editBaseHref ? editBaseHref + '/' + row.id + '/edit' : undefined}
                      label={row.label}
                      onDelete={
                        bulkDeleteURL ? () => openModal({ kind: 'delete', rows: [row] }) : undefined
                      }
                      onDetails={() => openModal({ kind: 'details', row })}
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
                    <dd>{detail.value ?? '—'}</dd>
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
