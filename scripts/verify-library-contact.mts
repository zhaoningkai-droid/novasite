import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import sharp from 'sharp'
import { Pool } from 'pg'
import config from '../src/payload.config'
import { legacyTemplates } from '../src/platform/legacy-template-catalog'
import { applyTemplateChange } from '../src/platform/new-templates/change-service'

// Scenarios are the user's 9 independent template cards and required contacts / image uploads.
if (process.env.NODE_ENV !== 'production') throw new Error('NODE_ENV=production required')
const payload = await getPayload({ config })
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const base = 'http://localhost:3100'
const marker = randomUUID().slice(0, 8)
const tenants: number[] = []; const users: number[] = []; const mediaIDs: number[] = []
const results: Record<string, unknown> = {}
const preservation = async () => (await pool.query(`SELECT to_jsonb(t) AS row FROM tenants t WHERE slug NOT LIKE 'contact-qa-%' ORDER BY id`)).rows
const before = await preservation()
const initialCounts = (await pool.query(`SELECT (SELECT count(*)::int FROM tenants) AS tenants, (SELECT count(*)::int FROM media) AS media, (SELECT count(*)::int FROM users) AS users, (SELECT count(*)::int FROM leads) AS leads`)).rows[0]
try {
  const createTenant = async (suffix: string) => {
    const tenant = await payload.create({ collection: 'tenants', locale: 'zh', overrideAccess: true,
      data: { name: `临时联系验收${suffix}`, slug: `contact-qa-${marker}-${suffix}`, status: 'building',
        defaultLocale: 'zh', enabledLocales: ['zh', 'en', 'ru', 'id'],
        branding: { companyName: `临时联系验收${suffix}` } } })
    tenants.push(tenant.id); return tenant
  }
  const first = await createTenant('a'); const second = await createTenant('b')
  const email = `contact-qa-${marker}@example.com`; const password = randomUUID()
  const user = await payload.create({ collection: 'users', overrideAccess: true,
    data: { email, password, name: '临时联系验收', roles: ['site-admin'], tenants: [{ tenant: first.id }] } })
  users.push(user.id)
  const login = await fetch(`${base}/api/users/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({email, password}) })
  assert.equal(login.status, 200)
  const token = (await login.json()).token
  assert.ok(token)
  const headers = { cookie: `payload-token=${token}; payload-tenant=${first.id}` }
  const patch = (data: unknown, slug = first.slug, cookie = headers.cookie) => fetch(`${base}/api/workspace/${slug}/contact`, {
    method: 'PATCH', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(data),
  })
  const contact = { address: '临时验证地址', email: 'contact@example.com', phone: '+86-12345678', whatsapp: '', title: '临时联系页', intro: '临时验证说明', showInquiryForm: false }
  for (const field of ['address', 'email', 'phone']) {
    assert.equal((await patch({...contact, [field]: '   '})).status, 422, `${field} required`)
  }
  assert.equal((await patch({...contact, email: 'invalid'})).status, 422)
  assert.equal((await patch(contact)).status, 200, 'WhatsApp optional')
  results.requiredFields = 'address/email/phone blanks rejected; invalid email rejected; empty WhatsApp accepted'
  const image = await sharp({create: {width:800, height:800, channels:3, background:'#2764e8'}}).png().toBuffer()
  const upload = async (data: Buffer, mime: string, filename: string) => {
    const form = new FormData(); form.set('file', new Blob([data], {type:mime}), filename)
    form.set('alt', '临时二维码上传验证（普通测试图片）'); form.set('productImage', 'true')
    return fetch(`${base}/api/workspace/${first.slug}/media`, {method:'POST', headers, body:form})
  }
  const qrFields = ['whatsappQRCode', 'wechatInternationalQRCode', 'wechatQRCode'] as const
  const codes: Record<string, number> = {}; const urls: string[] = []
  for (const field of qrFields) {
    const response = await upload(image, 'image/png', `contact-qa-${marker}-${field}.png`)
    assert.equal(response.status, 201)
    const item = (await response.json()).media; mediaIDs.push(item.id); codes[field] = item.id; urls.push(item.url)
  }
  assert.equal((await upload(Buffer.alloc(501*1024, 1), 'image/png', 'oversize.png')).status, 422)
  assert.equal((await upload(Buffer.from('<svg/>'), 'image/svg+xml', 'reject.svg')).status, 422)
  assert.equal((await patch({...contact, ...codes})).status, 200)
  const saved = await payload.findByID({collection:'tenants', id:first.id, locale:'zh', depth:1, overrideAccess:true})
  for (const field of qrFields) {
    const item = saved.contact?.[field]; assert.ok(item && typeof item === 'object'); assert.equal(item.id, codes[field])
  }
  const formPage = await fetch(`${base}/workspace/${first.slug}/website/contact`, {headers})
  const formHTML = await formPage.text(); assert.equal(formPage.status,200)
  for (const field of qrFields) assert.ok(formHTML.includes(codes[field].toString()))
  for (const path of ['contact-address', 'contact-email', 'contact-phone']) assert.match(formHTML, new RegExp(`id="${path}"[^>]*required|[^>]*required[^>]*id="${path}"`))
  assert.match(formHTML, /上传|替换/); assert.ok(!formHTML.includes('二维码编号'))
  results.qrUpload = 'three independent PNG uploads saved and reload as media objects; 501KB and SVG rejected'
  assert.equal((await patch({...contact, wechatQRCode: 'not-an-id'})).status,422)
  const foreign = await payload.create({collection:'media', overrideAccess:true, locale:'zh', data:{tenant:second.id, alt:'临时其他公司图片'}, file:{data:image, mimetype:'image/png', name:`contact-qa-${marker}-foreign.png`, size:image.length}})
  mediaIDs.push(foreign.id)
  assert.equal((await patch({...contact, wechatQRCode:foreign.id})).status,422)
  assert.equal((await patch(contact, second.slug, `payload-token=${token}; payload-tenant=${second.id}`)).status,403)
  assert.equal((await patch(contact, first.slug, `payload-token=${token}; payload-tenant=${second.id}`)).status,403)
  assert.equal((await patch(contact, first.slug, '')).status,401)
  results.isolation = 'foreign-company media422; inaccessible company403; stale company cookie403; anonymous401'
  const templateDocs = await payload.find({collection:'templates', depth:0, limit:20, overrideAccess:true})
  let revision=0
  for (const template of templateDocs.docs) {
    const response = await applyTemplateChange({payload, user, tenantID:first.id, input:{operation:'apply', templateId:template.id, expectedRevision:revision, idempotencyKey:randomUUID()}})
    revision=response.tenantRevision
    const rendered = await fetch(`${base}/s/${first.slug}/zh/contact`)
    assert.equal(rendered.status,200)
    const html=await rendered.text()
    for (const url of urls) assert.ok(html.includes(url), `QR image in ${template.key}`)
    for (const label of ['WhatsApp','WeChat','微信']) assert.ok(html.includes(label))
  }
  results.publicContact = 'all 9 templates display all three saved QR images'
  const library = await fetch(`${base}/workspace/${first.slug}/website/sites`, {headers})
  const html = await library.text(); assert.equal(library.status,200)
  const start = html.indexOf('<section class="site-manager__library"')
  assert.ok(start > html.indexOf('默认语言'), 'Library below language settings')
  const end = html.indexOf('</section>',start)
  const libraryHTML=html.slice(start,end)
  assert.equal((libraryHTML.match(/<article /g)||[]).length,9)
  for (const legacy of legacyTemplates) {
    assert.ok(libraryHTML.includes(legacy.name))
    const preview=await fetch(`${base}/template-preview/${first.slug}/${legacy.key}/zh`, {headers})
    assert.equal(preview.status,200,`${legacy.key} preview`)
    assert.ok((await preview.text()).includes(`data-template="${legacy.key}"`))
  }
  assert.equal((await payload.findByID({collection:'tenants',id:first.id,depth:0,overrideAccess:true,showHiddenFields:true})).templateRevision,revision) // previews never apply a template
  results.library = '9 independent cards below all site settings; all 4 original templates render authenticated homepage previews without changing selection'
  assert.equal((await patch({...contact, wechatInternationalQRCode:null})).status,200)
  const removed=await payload.findByID({collection:'tenants', id:first.id, depth:0, locale:'zh', overrideAccess:true})
  assert.equal(removed.contact?.wechatInternationalQRCode,null)
  assert.equal(removed.contact?.wechatQRCode,codes.wechatQRCode)
  assert.equal(removed.contact?.whatsappQRCode,codes.whatsappQRCode)
  results.removal='removing WeChat preserves WhatsApp and 微信'
  await payload.update({collection:'users',id:user.id,overrideAccess:true,data:{roles:['viewer']}})
  assert.equal((await patch(contact)).status,403)
  results.readOnly='viewer cannot save contacts (403)'

} finally {
  for (const id of tenants) {
    await payload.delete({collection:'site-template-changes', overrideAccess:true, where:{tenant:{equals:id}}})
  }
  for (const id of users) await payload.delete({collection:'users', id, overrideAccess:true})
  for (const id of tenants) await payload.delete({collection:'tenants', id, overrideAccess:true})
  for (const id of mediaIDs) await payload.delete({collection:'media', id, overrideAccess:true})
  // Audit records only for disposable fixtures.
  for (const [collection, ids] of [['tenants',tenants],['users',users],['media',mediaIDs]] as const) {
    await payload.delete({collection:'audit-logs',overrideAccess:true,where:{and:[
      {documentId:{in:ids.map(String)}},{collection:{equals:collection}},
    ]}})
  }
  assert.deepEqual(await preservation(), before, 'Existing tenant records preserved')
  const finalCounts=(await pool.query(`SELECT (SELECT count(*)::int FROM tenants) AS tenants, (SELECT count(*)::int FROM media) AS media, (SELECT count(*)::int FROM users) AS users, (SELECT count(*)::int FROM leads) AS leads`)).rows[0]
  assert.deepEqual(finalCounts,initialCounts)
  await writeFile('docs/evidence/template-upgrade/implementation-03/verification.json',JSON.stringify({verifiedAt:new Date().toISOString(),results,initialCounts,finalCounts,existingTenantsUnchanged:true},null,2))
  await payload.destroy()
  await Promise.race([payload.db.pool.end(),new Promise<void>((resolve)=>setTimeout(resolve,2000))])
  await pool.end()
}
console.log(JSON.stringify(results,null,2))
process.exit(0)
