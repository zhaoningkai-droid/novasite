export const isGeoWorkspace = (pathname: string) =>
  /^\/workspace\/[^/]+\/geo(?:\/|$)/.test(pathname)

export const isKnowledgeWorkspace = (pathname: string) =>
  /^\/workspace\/[^/]+\/knowledge(?:\/|$)/.test(pathname)

export const geoKeywordPath = (companySlug: string) =>
  `/workspace/${encodeURIComponent(companySlug)}/geo/keywords`

export const workspaceModuleDestination = (companySlug: string, pathname: string) =>
  isKnowledgeWorkspace(pathname)
    ? `/workspace/${encodeURIComponent(companySlug)}/knowledge`
    : isGeoWorkspace(pathname)
      ? geoKeywordPath(companySlug)
      : `/workspace/${encodeURIComponent(companySlug)}/website/analytics`
