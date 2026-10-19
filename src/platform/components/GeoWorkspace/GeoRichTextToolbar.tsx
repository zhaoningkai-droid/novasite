'use client'

import {
  Undo2,
  Redo2,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Link2,
  Unlink,
  Table2,
  RemoveFormatting,
} from 'lucide-react'
import { useEffect, useRef, useState, type RefObject } from 'react'

import { showWorkspaceError } from '../TransientNotice/WorkspaceFeedback'

type SourceOption = { url: string; title: string }
type ImageOption = { url: string; alt: string; label: string }

const fontSizes = [12, 13, 14, 15, 16, 18, 19, 20, 22, 24, 28, 29, 32, 36, 40, 48]
const lineHeights = ['1', '1.2', '1.5', '1.75', '2', '2.5', '3']
const escapeHTML = (value: string) =>
  value.replace(
    /[&<>"']/gu,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  )

export function GeoRichTextToolbar({
  editorRef,
  onChange,
  disabled = false,
  sources = [],
  images = [],
}: {
  editorRef: RefObject<HTMLDivElement | null>
  onChange: (html: string) => void
  disabled?: boolean
  sources?: SourceOption[]
  images?: ImageOption[]
}) {
  const selection = useRef<Range | null>(null)
  const [sourceIndex, setSourceIndex] = useState(0)
  const [imageIndex, setImageIndex] = useState(0)
  const [color, setColor] = useState('#202124')

  useEffect(() => {
    const remember = () => {
      const editor = editorRef.current
      const current = window.getSelection()
      if (
        editor &&
        current?.rangeCount &&
        editor.contains(current.anchorNode) &&
        editor.contains(current.focusNode)
      )
        selection.current = current.getRangeAt(0).cloneRange()
    }
    document.addEventListener('selectionchange', remember)
    return () => document.removeEventListener('selectionchange', remember)
  }, [editorRef])

  const restoreSelection = () => {
    const editor = editorRef.current
    if (!editor) return null
    editor.focus()
    const current = window.getSelection()
    const saved = selection.current
    if (saved && editor.contains(saved.commonAncestorContainer)) {
      current?.removeAllRanges()
      current?.addRange(saved)
    }
    const range = current?.rangeCount ? current.getRangeAt(0) : null
    return range && editor.contains(range.commonAncestorContainer) ? range : null
  }

  const update = () => {
    const editor = editorRef.current
    if (editor) {
      onChange(editor.innerHTML)
      const current = window.getSelection()
      if (current?.rangeCount) selection.current = current.getRangeAt(0).cloneRange()
    }
  }

  const command = (name: string, value?: string) => {
    if (disabled || !editorRef.current) return
    restoreSelection()
    document.execCommand(name, false, value)
    update()
  }

  const applyInlineStyle = (property: 'fontSize' | 'color', value: string) => {
    const editor = editorRef.current
    if (disabled || !editor) return
    const range = restoreSelection()
    if (!range || range.collapsed) {
      document.execCommand('styleWithCSS', false, 'true')
      document.execCommand(property === 'fontSize' ? 'fontSize' : 'foreColor', false, value)
      document.execCommand('styleWithCSS', false, 'false')
      update()
      return
    }
    const span = document.createElement('span')
    span.style[property] = value
    span.append(range.extractContents())
    range.insertNode(span)
    const next = document.createRange()
    next.selectNodeContents(span)
    const current = window.getSelection()
    current?.removeAllRanges()
    current?.addRange(next)
    selection.current = next.cloneRange()
    update()
  }

  const setLineHeight = (value: string) => {
    const editor = editorRef.current
    if (!editor || disabled) return
    const range = restoreSelection()
    const node = range?.startContainer
    const element = node instanceof Element ? node : node?.parentElement
    const block = element?.closest('p,div,h1,h2,h3,h4,h5,li,blockquote')
    if (block && editor.contains(block)) block.setAttribute('style', `line-height:${value}`)
    else if (range) {
      document.execCommand('formatBlock', false, 'p')
      const current = window.getSelection()
      const parent =
        current?.anchorNode instanceof Element
          ? current.anchorNode
          : current?.anchorNode?.parentElement
      parent?.closest('p')?.setAttribute('style', `line-height:${value}`)
    }
    update()
  }

  const insertHTML = (html: string) => {
    if (disabled || !editorRef.current) return
    restoreSelection()
    document.execCommand('insertHTML', false, html)
    update()
  }

  const source = sources[sourceIndex]
  const image = images[imageIndex]

  return (
    <div className="geo-article__toolbar" role="toolbar" aria-label="正文格式">
      <select
        aria-label="标题样式"
        defaultValue="p"
        disabled={disabled}
        onChange={(event) => command('formatBlock', event.target.value)}
      >
        <option value="p">正文</option>
        {[1, 2, 3, 4, 5].map((level) => (
          <option key={level} value={`h${level}`}>
            H{level}
          </option>
        ))}
      </select>
      <button
        type="button"
        title="撤销"
        aria-label="撤销"
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => command('undo')}
      >
        <Undo2 size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        title="重做"
        aria-label="重做"
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => command('redo')}
      >
        <Redo2 size={16} aria-hidden="true" />
      </button>
      <select
        aria-label="字体大小"
        defaultValue=""
        disabled={disabled}
        onChange={(event) => {
          if (event.target.value) applyInlineStyle('fontSize', `${event.target.value}px`)
        }}
      >
        <option value="">默认字号</option>
        {fontSizes.map((size) => (
          <option key={size} value={size}>
            {size}px
          </option>
        ))}
      </select>
      <button
        type="button"
        title="加粗"
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => command('bold')}
      >
        <strong>B</strong>
      </button>
      <button
        type="button"
        title="斜体"
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => command('italic')}
      >
        <em>I</em>
      </button>
      <button
        type="button"
        title="删除线"
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => command('strikeThrough')}
      >
        <s>S</s>
      </button>
      <button
        type="button"
        title="下划线"
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => command('underline')}
      >
        <u>U</u>
      </button>
      <label className="geo-article__color" title="文字颜色">
        <span aria-hidden="true" style={{ borderBottom: `3px solid ${color}` }}>
          A
        </span>
        <input
          aria-label="文字颜色"
          type="color"
          value={color}
          disabled={disabled}
          onChange={(event) => {
            setColor(event.target.value)
            applyInlineStyle('color', event.target.value)
          }}
        />
      </label>
      <button
        type="button"
        title="无序列表"
        aria-label="无序列表"
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => command('insertUnorderedList')}
      >
        <List size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        title="有序列表"
        aria-label="有序列表"
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => command('insertOrderedList')}
      >
        <ListOrdered size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        title="左对齐"
        aria-label="左对齐"
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => command('justifyLeft')}
      >
        <AlignLeft size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        title="居中对齐"
        aria-label="居中对齐"
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => command('justifyCenter')}
      >
        <AlignCenter size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        title="右对齐"
        aria-label="右对齐"
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => command('justifyRight')}
      >
        <AlignRight size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        title="两端对齐"
        aria-label="两端对齐"
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => command('justifyFull')}
      >
        <AlignJustify size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        title="插入链接"
        aria-label="插入链接"
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          const value = window.prompt('请输入链接地址', 'https://')
          if (!value) return
          try {
            const url = new URL(value)
            if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid URL')
            command('createLink', url.href)
          } catch {
            showWorkspaceError('请输入有效的 http 或 https 链接。')
          }
        }}
      >
        <Link2 size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        title="取消链接"
        aria-label="取消链接"
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => command('unlink')}
      >
        <Unlink size={16} aria-hidden="true" />
      </button>
      <select
        aria-label="行高"
        defaultValue=""
        disabled={disabled}
        onChange={(event) => {
          if (event.target.value) setLineHeight(event.target.value)
        }}
      >
        <option value="">默认行高</option>
        {lineHeights.map((height) => (
          <option key={height} value={height}>
            {height}
          </option>
        ))}
      </select>
      {sources.length > 0 && (
        <>
          <select
            aria-label="引用来源"
            value={sourceIndex}
            disabled={disabled}
            onChange={(event) => setSourceIndex(Number(event.target.value))}
          >
            {sources.map((option, index) => (
              <option key={option.url} value={index}>
                {option.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="geo-article__text-button"
            disabled={disabled || !source}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() =>
              source &&
              insertHTML(`<a href="${escapeHTML(source.url)}">${escapeHTML(source.title)}</a>`)
            }
          >
            插入引用
          </button>
        </>
      )}
      <button
        type="button"
        title="插入表格"
        aria-label="插入表格"
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() =>
          insertHTML(
            '<table><tbody><tr><th>项目</th><th>说明</th></tr><tr><td>产品参数</td><td>填写已核实信息</td></tr><tr><td>应用场景</td><td>填写适用场景</td></tr></tbody></table>',
          )
        }
      >
        <Table2 size={16} aria-hidden="true" />
      </button>
      {images.length > 0 && (
        <>
          <select
            aria-label="素材组图片"
            value={imageIndex}
            disabled={disabled}
            onChange={(event) => setImageIndex(Number(event.target.value))}
          >
            {images.map((option, index) => (
              <option key={`${option.url}-${index}`} value={index}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="geo-article__text-button"
            disabled={disabled || !image}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() =>
              image &&
              insertHTML(
                `<p><img src="${escapeHTML(image.url)}" alt="${escapeHTML(image.alt)}"></p>`,
              )
            }
          >
            插入组内图片
          </button>
        </>
      )}
      <button
        type="button"
        title="清除格式"
        aria-label="清除格式"
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => command('removeFormat')}
      >
        <RemoveFormatting size={16} aria-hidden="true" />
      </button>
    </div>
  )
}
