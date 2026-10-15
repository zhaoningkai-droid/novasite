import type { Lead } from '@/payload-types'

export const inquiryStatuses = [
  { value: 'new', label: '新询盘' },
  { value: 'contacted', label: '跟进中' },
  { value: 'quoted', label: '已报价' },
  { value: 'won', label: '已成交' },
  { value: 'invalid', label: '无效' },
] as const
export type InquiryStatus = Lead['status']
export const isInquiryStatus = (value: unknown): value is InquiryStatus =>
  inquiryStatuses.some((item) => item.value === value)
export const inquiryStatusLabel = (value: InquiryStatus) =>
  inquiryStatuses.find((item) => item.value === value)?.label || '状态未知'

export type InquiryRow = Pick<Lead,
  'id' | 'name' | 'email' | 'phone' | 'company' | 'country' | 'status' | 'createdAt' | 'updatedAt'> & {
  summary: string
}
export type InquiryDetail = InquiryRow & Pick<Lead,
  'address' | 'capacity' | 'message' | 'sourcePage' | 'utmSource' | 'utmCampaign' | 'internalNotes'> & {
  product: { id: number; title: string } | null
}
export type InquiryNotification = {
  enabled: boolean
  status: 'pending' | 'sending' | 'retry' | 'accepted' | 'failed' | 'ambiguous'
    | 'disabled' | 'unavailable'
  attempts?: number
  nextAttemptAt?: string | null
  acceptedAt?: string | null
}
export const inquiryNotificationLabel = (status: InquiryNotification['status']) => ({
  pending: '待发送', sending: '发送中', retry: '等待重试', accepted: '邮件服务已接收',
  failed: '通知失败', ambiguous: '发送结果待确认', disabled: '未启用通知',
  unavailable: '通知状态暂不可用',
})[status]

export function inquiryDateLabel(value?: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return '—'
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value))
  const part = (key: string) => parts.find((item) => item.type === key)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`
}

/** Visitor-provided URLs are displayed, never embedded or treated as trusted HTML. */
export function inquirySourceURL(value?: string | null) {
  try {
    const url = new URL(value || '')
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      ? url.href : undefined
  } catch { return undefined }
}
