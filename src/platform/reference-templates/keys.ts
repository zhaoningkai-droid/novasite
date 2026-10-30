export const referenceKeys = ['plush-607-v1', 'plush-712-v1'] as const
export type ReferenceKey = (typeof referenceKeys)[number]
export const isReferenceKey = (key: string): key is ReferenceKey => referenceKeys.some(value => value === key)
export const referenceCode = (key: ReferenceKey) => key === 'plush-607-v1' ? 'k607' : 'k712'
