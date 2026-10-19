// Read-only Node data inspection does not render CSS. Real styling is tested in Chromium.
import { register } from 'node:module'
// Use the asynchronous loader chain shared with tsx. Node 22's synchronous
// registerHooks chain can encounter an undefined source supplied by another
// loader, while Node 25 happens to accept the same worker startup sequence.
// The inline module avoids an extra runtime file dependency in worker images.
register('data:text/javascript,' + encodeURIComponent(`
  export async function load(url, context, nextLoad) {
    if (/\\.(css|scss)(\\?|$)/.test(url))
      return { format: 'module', source: 'export default {};', shortCircuit: true };
    return nextLoad(url, context);
  }
`), import.meta.url)
