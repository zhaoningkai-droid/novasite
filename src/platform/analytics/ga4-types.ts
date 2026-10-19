export type Ga4Traffic = {
  status: 'ready' | 'not_configured' | 'missing_credentials' | 'permission_denied' | 'unavailable'
  message: string
  mode?: 'production' | 'test_preview'
  timeZone?: string
  fetchedAt?: string
  views: number | null
  users: number | null
  totalViews: number | null
  conversions: number | null
  whatsappClicks: number | null
  daily: { date: string; views: number; users: number }[]
  sources: { label: string; sessions: number }[]
  pages: { path: string; views: number }[]
}

export const ga4Unavailable = (status: Ga4Traffic['status'], message: string): Ga4Traffic => ({
  status, message, views: null, users: null, totalViews: null,
  conversions: null, whatsappClicks: null, daily: [], sources: [], pages: [],
})
