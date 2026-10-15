'use client'

import Image from 'next/image'
import { CirclePlus, ImageUp, Trash2 } from 'lucide-react'

export type ExecutiveEditorImage = {
  alt?: string
  caption?: string
  imageID?: number
  imageURL?: string
  label?: string
  name?: string
  sortOrder: number
}

export type ExecutiveEditorSettings = {
  advantages?: Array<{ description: string; icon: string; sortOrder: number; title: string }>
  advantagesEnabled?: boolean
  advantagesTitle?: string
  marks?: ExecutiveEditorImage[]
  marksEnabled?: boolean
  certificates?: ExecutiveEditorImage[]
  certificatesEnabled?: boolean
  certificatesTitle?: string
  introBackgroundMediaID?: number
  introBackgroundURL?: string
  introOverlay?: number
  introButtonLabel?: string
  videoPosterMediaID?: number
  videoPosterURL?: string
  strengthTitle?: string
  strengthGallery?: ExecutiveEditorImage[]
  casesTitle?: string
  categoriesTitle?: string
  productsTitle?: string
  newsTitle?: string
  faqEnabled?: boolean
  faqTitle?: string
  faqLimit?: number
  caseCTATitle?: string
  caseCTADescription?: string
  caseCTAButton?: string
  productCTATitle?: string
  productCTADescription?: string
  productCTAButton?: string
}

type ImageTarget = 'introBackground' | 'videoPoster' | 'footerBackground' | 'marks' | 'certificates' | 'strengthGallery'

export function ExecutiveHomePanel({ footerBackgroundURL, footerOverlay, onChange, onFooterOverlayChange, onUpload, settings }: {
  footerBackgroundURL: string
  footerOverlay: number
  onChange: (patch: Partial<ExecutiveEditorSettings>) => void
  onFooterOverlayChange: (value: number) => void
  onUpload: (file: File, target: ImageTarget, index?: number) => void
  settings: ExecutiveEditorSettings
}) {
  const advantages = settings.advantages || []
  const marks = settings.marks || []
  const certificates = settings.certificates || []
  const strengthGallery = settings.strengthGallery || []
  const changeImageItem = (key: 'marks' | 'certificates' | 'strengthGallery', index: number, patch: Partial<ExecutiveEditorImage>) => {
    const current = key === 'marks' ? marks : key === 'certificates' ? certificates : strengthGallery
    onChange({ [key]: current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) })
  }
  const addImageItem = (key: 'marks' | 'certificates' | 'strengthGallery') => {
    const current = key === 'marks' ? marks : key === 'certificates' ? certificates : strengthGallery
    onChange({ [key]: [...current, { sortOrder: current.length + 1 }] })
  }
  const removeImageItem = (key: 'marks' | 'certificates' | 'strengthGallery', index: number) => {
    const current = key === 'marks' ? marks : key === 'certificates' ? certificates : strengthGallery
    onChange({ [key]: current.filter((_, itemIndex) => itemIndex !== index).map((item, itemIndex) => ({ ...item, sortOrder: itemIndex + 1 })) })
  }

  return <div className="homepage-executive-editor">
    <p className="homepage-banner-editor__helper">这里仅维护当前公司的首页展示设置。图片通过当前公司的媒体库上传；空字段不会从模板演示页补内容。</p>

    <section className="homepage-executive-editor__section">
      <div className="homepage-executive-editor__heading"><div><h3>优势与资质</h3><p>首页顺序：首屏 → 优势 → 资质标志 → 证书。</p></div></div>
      <Toggle checked={settings.advantagesEnabled} label="显示优势卡片" onChange={(value) => onChange({ advantagesEnabled: value })} />
      <Field label="优势区标题" onChange={(value) => onChange({ advantagesTitle: value })} value={settings.advantagesTitle} />
      <div className="homepage-executive-editor__rows">
        {advantages.map((item, index) => <article className="homepage-executive-editor__row" key={`advantage-${index}`}>
          <div className="homepage-executive-editor__row-heading"><strong>优势 {index + 1}</strong><button aria-label={`删除优势 ${index + 1}`} onClick={() => onChange({ advantages: advantages.filter((_, itemIndex) => itemIndex !== index).map((entry, itemIndex) => ({ ...entry, sortOrder: itemIndex + 1 })) })} type="button"><Trash2 size={16} /></button></div>
          <Field label="标题" onChange={(value) => onChange({ advantages: advantages.map((entry, itemIndex) => itemIndex === index ? { ...entry, title: value } : entry) })} value={item.title} />
          <Field label="说明" multiline onChange={(value) => onChange({ advantages: advantages.map((entry, itemIndex) => itemIndex === index ? { ...entry, description: value } : entry) })} value={item.description} />
        </article>)}
        <button className="homepage-banner-editor__outline-button" onClick={() => onChange({ advantages: [...advantages, { description: '', icon: '', sortOrder: advantages.length + 1, title: '' }] })} type="button"><CirclePlus size={18} />添加优势</button>
      </div>
      <Toggle checked={settings.marksEnabled} label="显示资质标志" onChange={(value) => onChange({ marksEnabled: value })} />
      <ImageList items={marks} label="资质标志" onAdd={() => addImageItem('marks')} onChange={(index, patch) => changeImageItem('marks', index, patch)} onRemove={(index) => removeImageItem('marks', index)} onUpload={(file, index) => onUpload(file, 'marks', index)} />
      <Toggle checked={settings.certificatesEnabled} label="显示证书图片" onChange={(value) => onChange({ certificatesEnabled: value })} />
      <Field label="证书区标题" onChange={(value) => onChange({ certificatesTitle: value })} value={settings.certificatesTitle} />
      <ImageList items={certificates} label="证书图片" onAdd={() => addImageItem('certificates')} onChange={(index, patch) => changeImageItem('certificates', index, patch)} onRemove={(index) => removeImageItem('certificates', index)} onUpload={(file, index) => onUpload(file, 'certificates', index)} />
    </section>

    <section className="homepage-executive-editor__section">
      <div className="homepage-executive-editor__heading"><div><h3>公司简介与视频</h3><p>简介文字沿用“关于我们”资料；本区域只设置背景与视频封面。</p></div></div>
      <MediaPicker label="简介背景图" onUpload={(file) => onUpload(file, 'introBackground')} url={settings.introBackgroundURL} />
      <label className="homepage-banner-editor__field"><span>背景压暗程度 · {Math.round((settings.introOverlay ?? 0.62) * 100)}%</span><input max="0.85" min="0" onChange={(event) => onChange({ introOverlay: Number(event.target.value) })} step="0.05" type="range" value={settings.introOverlay ?? 0.62} /></label>
      <Field label="简介按钮文字" onChange={(value) => onChange({ introButtonLabel: value })} value={settings.introButtonLabel} />
      <MediaPicker label="视频封面图" onUpload={(file) => onUpload(file, 'videoPoster')} url={settings.videoPosterURL} />
    </section>

    <section className="homepage-executive-editor__section">
      <div className="homepage-executive-editor__heading"><div><h3>公司实力</h3><p>优先保留客户现有实力数据图片；下面可以继续添加首页展示图片。</p></div></div>
      <Field label="公司实力标题" onChange={(value) => onChange({ strengthTitle: value })} value={settings.strengthTitle} />
      <ImageList items={strengthGallery} label="实力展示图片" onAdd={() => addImageItem('strengthGallery')} onChange={(index, patch) => changeImageItem('strengthGallery', index, patch)} onRemove={(index) => removeImageItem('strengthGallery', index)} onUpload={(file, index) => onUpload(file, 'strengthGallery', index)} />
    </section>

    <section className="homepage-executive-editor__section homepage-executive-editor__section--grid">
      <div className="homepage-executive-editor__heading"><div><h3>首页模块标题</h3><p>内容卡片直接读取产品、案例、新闻管理中的当前公司已发布资料。</p></div></div>
      <Field label="案例区标题" onChange={(value) => onChange({ casesTitle: value })} value={settings.casesTitle} />
      <Field label="产品分类区标题" onChange={(value) => onChange({ categoriesTitle: value })} value={settings.categoriesTitle} />
      <Field label="产品区标题" onChange={(value) => onChange({ productsTitle: value })} value={settings.productsTitle} />
      <Field label="新闻区标题" onChange={(value) => onChange({ newsTitle: value })} value={settings.newsTitle} />
      <Field label="案例咨询标题" onChange={(value) => onChange({ caseCTATitle: value })} value={settings.caseCTATitle} />
      <Field label="案例咨询说明" multiline onChange={(value) => onChange({ caseCTADescription: value })} value={settings.caseCTADescription} />
      <Field label="案例咨询按钮" onChange={(value) => onChange({ caseCTAButton: value })} value={settings.caseCTAButton} />
      <Field label="产品咨询标题" onChange={(value) => onChange({ productCTATitle: value })} value={settings.productCTATitle} />
      <Field label="产品咨询说明" multiline onChange={(value) => onChange({ productCTADescription: value })} value={settings.productCTADescription} />
      <Field label="产品咨询按钮" onChange={(value) => onChange({ productCTAButton: value })} value={settings.productCTAButton} />
    </section>

    <section className="homepage-executive-editor__section homepage-executive-editor__section--grid">
      <div className="homepage-executive-editor__heading"><div><h3>常见问题与页脚</h3><p>常见问题读取内容管理里的已启用问答，页脚背景只使用本公司媒体库图片。</p></div></div>
      <Toggle checked={settings.faqEnabled} label="显示常见问题" onChange={(value) => onChange({ faqEnabled: value })} />
      <Field label="常见问题标题" onChange={(value) => onChange({ faqTitle: value })} value={settings.faqTitle} />
      <label className="homepage-banner-editor__field"><span>首页显示问题数</span><input max="12" min="1" onChange={(event) => onChange({ faqLimit: Number(event.target.value) || 6 })} type="number" value={settings.faqLimit || 6} /></label>
      <MediaPicker label="页脚背景图" onUpload={(file) => onUpload(file, 'footerBackground')} url={footerBackgroundURL} />
      <label className="homepage-banner-editor__field"><span>页脚背景压暗程度 · {Math.round(footerOverlay * 100)}%</span><input max="0.85" min="0" onChange={(event) => onFooterOverlayChange(Number(event.target.value))} step="0.05" type="range" value={footerOverlay} /></label>
    </section>
  </div>
}

function Toggle({ checked, label, onChange }: { checked?: boolean; label: string; onChange: (checked: boolean) => void }) {
  return <label className="homepage-banner-editor__switch"><input checked={checked === true} onChange={(event) => onChange(event.target.checked)} type="checkbox" />{label}</label>
}

function Field({ label, multiline, onChange, value }: { label: string; multiline?: boolean; onChange: (value: string) => void; value?: string }) {
  return <label className="homepage-banner-editor__field"><span>{label}</span>{multiline
    ? <textarea onChange={(event) => onChange(event.target.value)} value={value || ''} />
    : <input onChange={(event) => onChange(event.target.value)} value={value || ''} />}</label>
}

function ImageList({ items, label, onAdd, onChange, onRemove, onUpload }: {
  items: ExecutiveEditorImage[]
  label: string
  onAdd: () => void
  onChange: (index: number, patch: Partial<ExecutiveEditorImage>) => void
  onRemove: (index: number) => void
  onUpload: (file: File, index: number) => void
}) {
  return <div className="homepage-executive-editor__imagelist"><h4>{label}</h4>
    {items.map((item, index) => <article className="homepage-executive-editor__image-row" key={`${label}-${index}`}>
      <div className="homepage-executive-editor__image-preview">{item.imageURL ? <Image alt={item.alt || item.name || item.label || label} fill sizes="120px" src={item.imageURL} unoptimized /> : <ImageUp size={24} />}
        <label><span>{item.imageURL ? '更换图片' : '上传图片'}</span><input accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file, index); event.target.value = '' }} type="file" /></label>
      </div>
      <div className="homepage-executive-editor__image-fields">
        {label === '资质标志' ? <Field label="说明" onChange={(value) => onChange(index, { label: value })} value={item.label} /> : null}
        {label === '证书图片' ? <><Field label="证书名称" onChange={(value) => onChange(index, { name: value })} value={item.name} /><Field label="图片说明" onChange={(value) => onChange(index, { alt: value })} value={item.alt} /></> : null}
        {label === '实力展示图片' ? <><Field label="图片说明" onChange={(value) => onChange(index, { caption: value })} value={item.caption} /><Field label="替代文字" onChange={(value) => onChange(index, { alt: value })} value={item.alt} /></> : null}
      </div>
      <button aria-label={`删除${label}${index + 1}`} className="homepage-executive-editor__delete" onClick={() => onRemove(index)} type="button"><Trash2 size={17} /></button>
    </article>)}
    <button className="homepage-banner-editor__outline-button" onClick={onAdd} type="button"><CirclePlus size={18} />添加{label}</button>
  </div>
}

function MediaPicker({ label, onUpload, url }: { label: string; onUpload: (file: File) => void; url?: string }) {
  return <div className="homepage-executive-editor__media"><strong>{label}</strong>{url ? <div className="homepage-executive-editor__media-preview"><Image alt={label} fill sizes="360px" src={url} unoptimized /></div> : <div className="homepage-executive-editor__media-empty"><ImageUp size={24} />尚未上传</div>}
    <label className="homepage-banner-editor__outline-button">{url ? '更换图片' : '上传图片'}<input accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); event.target.value = '' }} type="file" /></label>
  </div>
}
