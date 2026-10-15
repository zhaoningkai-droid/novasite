// Read-only Node data inspection does not render CSS. Real styling is tested in Chromium.
import { registerHooks } from 'node:module'
registerHooks({
  load(url, context, nextLoad) {
    if (/\.(css|scss)(\?|$)/.test(url))
      return { format: 'module', source: 'export default {};', shortCircuit: true }
    return nextLoad(url, context)
  },
})
