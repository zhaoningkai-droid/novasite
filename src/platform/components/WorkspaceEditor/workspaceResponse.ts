export async function readWorkspaceResponse<T extends object>(response: Response): Promise<T> {
  const raw = await response.text()
  try {
    const value: unknown = raw ? JSON.parse(raw) : null
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error()
    return value as T
  } catch {
    throw new Error(
      response.status === 401
        ? '登录已失效，请重新登录。已填写的内容已保留。'
        : '服务器返回异常，请稍后重试。已填写的内容已保留。',
    )
  }
}

export const createWorkspaceDraftKey = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replace(/-/g, '')
    : `${Date.now()}${Math.random().toString(36).slice(2, 14)}`

export const workspaceErrorMessage = (
  error: unknown,
  fallback = '网络连接失败，请重试。已填写的内容已保留。',
) =>
  error instanceof TypeError
    ? fallback
    : error instanceof Error
      ? error.message || fallback
      : fallback
