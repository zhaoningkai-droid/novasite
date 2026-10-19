'use client'

import { useEffect, useRef, useState } from 'react'
import './workspace-feedback.scss'

export const showWorkspaceError = (message: string) => {
  window.dispatchEvent(new CustomEvent('workspace-error', { detail: message }))
}

/** Present existing form errors consistently across the workspace. */
export function WorkspaceFeedback() {
  const [message, setMessage] = useState('')
  const popup = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const seen = new WeakMap<Element, string>()
    let timer: ReturnType<typeof setTimeout> | undefined
    const show = (text: string) => {
      clearTimeout(timer)
      setMessage(text)
      timer = setTimeout(() => setMessage(''), 2000)
    }
    const selector = '[role="alert"], .geo-workspace__error, [class*="__feedback"].is-error'
    const scan = () => {
      const messages: string[] = []
      document.querySelectorAll<HTMLElement>('[data-workspace-error-source]').forEach((element) => {
        if (!element.matches(selector)) {
          delete element.dataset.workspaceErrorSource
          seen.delete(element)
        }
      })
      document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
        if (element.closest('[data-workspace-toast]')) return
        if (element.parentElement?.closest(selector)) return
        const text = element.textContent?.replace(/\s+/gu, ' ').trim() || ''
        element.dataset.workspaceErrorSource = 'true'
        if (!text) {
          seen.delete(element)
          return
        }
        if (seen.get(element) === text) return
        seen.set(element, text)
        messages.push(text)
      })
      if (messages.length) show([...new Set(messages)].join('；'))
    }
    const observer = new MutationObserver(scan)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['role', 'class'],
    })
    const onError = (event: Event) => show(String((event as CustomEvent).detail || '操作失败'))
    const onAction = (event: Event) => {
      const button = event.target instanceof Element ? event.target.closest('button') : null
      if (!button || !/保存|提交|确认|翻译|上传|生成/u.test(button.textContent || '')) return
      document.querySelectorAll(selector).forEach((element) => seen.delete(element))
      queueMicrotask(scan)
    }
    let invalidQueued = false
    const onInvalid = (event: Event) => {
      event.preventDefault()
      if (invalidQueued) return
      invalidQueued = true
      const input = event.target as HTMLInputElement
      queueMicrotask(() => {
        invalidQueued = false
        show(input.validationMessage || '请检查必填内容。')
        input.focus()
      })
    }
    window.addEventListener('workspace-error', onError)
    document.addEventListener('invalid', onInvalid, true)
    document.addEventListener('click', onAction, true)
    scan()
    return () => {
      observer.disconnect()
      clearTimeout(timer)
      window.removeEventListener('workspace-error', onError)
      document.removeEventListener('invalid', onInvalid, true)
      document.removeEventListener('click', onAction, true)
    }
  }, [])
  useEffect(() => {
    if (!message) return
    popup.current?.showPopover?.()
  }, [message])
  if (!message) return null
  return (
    <div
      ref={popup}
      popover="manual"
      className="workspace-feedback"
      data-workspace-toast
      role="alert"
    >
      <span aria-hidden="true">!</span>
      {message}
    </div>
  )
}
