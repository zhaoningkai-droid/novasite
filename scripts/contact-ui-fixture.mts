import { randomUUID } from 'node:crypto'
import { readFile, writeFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getPayload } from 'payload'
import sharp from 'sharp'
import config from '../src/payload.config'
import { assertSeedEnvironmentAllowsExecution } from '../src/platform/seed-security'
import { authorizeSeedScript } from './seed-script-authorization'
assertSeedEnvironmentAllowsExecution()
const databaseURL = process.env.DATABASE_URL
if (!databaseURL) throw new Error('DATABASE_URL is required.')
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(databaseURL).hostname))
  throw new Error('The contact UI fixture can only target a loopback database.')
const fixturePath = join(tmpdir(), 'novasite-contact-ui-fixture.json')
const fixtureImagePath = join(tmpdir(), 'novasite-contact-ui-fixture.png')
const payload=await getPayload({config})
try {
  await authorizeSeedScript(payload)
  if(process.argv[2]==='cleanup') {
    const fixture=JSON.parse(await readFile(fixturePath,'utf8')) as {id:number;slug:string}
    const tenant=await payload.findByID({collection:'tenants',id:fixture.id,depth:0,overrideAccess:true})
    if(tenant.slug!==fixture.slug || !tenant.slug.startsWith('contact-ui-qa-')) throw new Error('Fixture identity mismatch')
    const media=await payload.find({collection:'media',limit:100,depth:0,overrideAccess:true,where:{tenant:{equals:fixture.id}}})
    await payload.delete({collection:'tenants',id:fixture.id,overrideAccess:true})
    for(const item of media.docs) await payload.delete({collection:'media',id:item.id,overrideAccess:true})
    await payload.delete({collection:'audit-logs',overrideAccess:true,where:{and:[{collection:{equals:'tenants'}},{documentId:{equals:String(fixture.id)}}]}})
    await unlink(fixturePath)
    console.log('Temporary UI company and its uploaded images cleaned')
  } else {
    const slug=`contact-ui-qa-${randomUUID().slice(0,8)}`
    const tenant=await payload.create({collection:'tenants',locale:'zh',overrideAccess:true,data:{
      name:'临时界面验证（将清理）',slug,status:'building',defaultLocale:'zh',enabledLocales:['zh'],
      branding:{companyName:'临时界面验证'},contact:{address:'临时界面验证地址',email:'qa@example.invalid',phone:'+86 0000-0000-0000',whatsapp:''},
    }})
    await writeFile(fixturePath,JSON.stringify({id:tenant.id,slug}))
    await sharp({create:{width:800,height:800,channels:3,background:'#2864e8'}}).composite([{input:Buffer.from('<svg width="800" height="800"><rect x="100" y="100" width="600" height="600" fill="white"/><text x="400" y="430" font-size="60" text-anchor="middle" fill="#2864e8">UPLOAD TEST</text></svg>')}]).png().toFile(fixtureImagePath)
    console.log(JSON.stringify({id:tenant.id,slug}))
  }
} finally {
  await payload.destroy()
  await Promise.race([payload.db.pool.end(),new Promise<void>((resolve)=>setTimeout(resolve,2000))])
}
process.exit(0)
