export const ALLY_TEMPLATE_KEY = 'allynav-v1' as const
export const isAllyKey = (key?: string | null): key is typeof ALLY_TEMPLATE_KEY =>
  key === ALLY_TEMPLATE_KEY
