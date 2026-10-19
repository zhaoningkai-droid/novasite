import { GeoError } from './keywords'

/** Compare against the public admin URL: behind the proxy, request.url can be internal HTTP. */
export function assertGeoRequestOrigin(request: Request) {
  const origin = request.headers.get('origin')
  const expected = new URL(process.env.NEXT_PUBLIC_SERVER_URL || request.url).origin
  if (
    request.headers.get('sec-fetch-site') === 'cross-site' ||
    (origin && origin !== expected)
  )
    throw new GeoError('INVALID_ORIGIN', '请求来源无效，请在当前后台重试。', 403)
}
