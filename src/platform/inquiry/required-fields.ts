/** Keep the live executive template aligned with its optional-phone inquiry form. */
export function inquiryRequiredFields(
  configured: Record<string, boolean> = {},
  templateKey?: string,
) {
  return {
    phone: true,
    company: false,
    ...configured,
    ...(templateKey === 'executive-industrial-pro-v1' ? { phone: false } : {}),
    name: true,
    email: true,
    message: true,
  }
}

/** Shared client/server limits; form controls must not promise longer inputs. */
export const inquiryTextLimits = {
  site: 80,
  name: 120,
  email: 200,
  phone: 80,
  company: 180,
  address: 300,
  message: 4000,
  product: 160,
  country: 100,
  capacity: 80,
  sourcePage: 500,
  utmSource: 120,
  utmCampaign: 120,
} as const
