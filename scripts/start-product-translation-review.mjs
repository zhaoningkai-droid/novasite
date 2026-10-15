import {readFile,writeFile} from 'node:fs/promises'
import {spawn} from 'node:child_process'
import pg from 'pg'
const fixtures=JSON.parse(await readFile('.codex-runtime/product-translation-review-fixtures.json','utf8'))
if (!/^codex_translation_review_\d+$/.test(fixtures.database)) throw new Error('Not an isolated review database')
const childEnv={...process.env,NODE_ENV:'production',DATABASE_URL:fixtures.connectionString,PRODUCT_TRANSLATION_QUEUE_ENABLED:'true',PRODUCT_TRANSLATION_REVIEW_PROVIDER:'true',DEEPSEEK_API_KEY:'isolated-fixture-key',NOVASITE_BUILD_DIR:'.next-translation-review'}
const options=['--import','./scripts/product-translation-review-provider.mjs']
const server=spawn(process.execPath,[...options,'node_modules/next/dist/bin/next','start','--port','3102'],{env:childEnv,stdio:['ignore','inherit','inherit']})
const worker=spawn(process.execPath,[...options,'--import','./scripts/verify-v1-node-style-hook.mjs','--import','tsx','scripts/run-product-translations.mts'],{env:childEnv,stdio:['ignore','inherit','inherit']})
await writeFile('.codex-runtime/product-translation-review-processes.json',JSON.stringify({server:server.pid,worker:worker.pid}))
process.on('SIGINT',()=>{server.kill('SIGTERM');worker.kill('SIGTERM')})
process.on('SIGTERM',()=>{server.kill('SIGTERM');worker.kill('SIGTERM')})
await Promise.all([new Promise(resolve=>server.on('close',resolve)),new Promise(resolve=>worker.on('close',resolve))])
