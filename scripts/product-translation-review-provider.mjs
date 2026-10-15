// Loaded only by the isolated QA launch script, never by normal application startup.
if (process.env.PRODUCT_TRANSLATION_REVIEW_PROVIDER === 'true') {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    if (!String(input).startsWith('https://api.deepseek.com/')) return originalFetch(input, init)
    const body = JSON.parse(init.body)
    const request = JSON.parse(body.messages[1].content)
    await new Promise((resolve) => setTimeout(resolve, 700))
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({translations:Object.fromEntries(Object.entries(request.fields).map(([key,value])=>[key,`${request.targetLanguage}: ${value}`]))})}}]})
  }
}
