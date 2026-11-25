import {test} from 'node:test';
import assert from 'node:assert/strict';
import {proxyRequest} from '../worker/index.js';
const site='https://demo.example.workers.dev';
const upstream='https://praktikum-review-vhyg.onrender.com';
const env={PUBLIC_SITE_ORIGIN:site};
const req=(path='/',init={})=>new Request(site+path,init);
test('exact site configuration and mutating Origin are required before any upstream call',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return new Response('ok');};
 for(const origin of [undefined,'https://evil.example','null',site+'/']){
 const headers=origin?{Origin:origin}:{};
 assert.equal((await proxyRequest(req('/login',{method:'POST',headers,body:'x'}),env,fetcher)).status,403);
 }
 assert.equal((await proxyRequest(new Request('https://evil.example/login'),env,fetcher)).status,421);
 assert.equal((await proxyRequest(req('/',{headers:{Host:'evil.example'}}),env,fetcher)).status,421);
 assert.equal((await proxyRequest(req(),{},fetcher)).status,502);
 assert.equal((await proxyRequest(req(),{PUBLIC_SITE_ORIGIN:site+'/'},fetcher)).status,502);
 assert.equal(calls,0);
});
test('fixed target preserves body/method, BasicAuth/cookies and rewrites only validated Origin',async()=>{
 let seen;
 const auth='Basic dGVzdDpub3QtYS1zZWNyZXQ=';
 const response=await proxyRequest(req('/api/materials/upload?x=1',{method:'POST',headers:{Origin:site,Authorization:auth,Cookie:'praktikum_session=test',Host:new URL(site).host,'Content-Type':'text/plain','Forwarded':'host=evil.example;proto=http','X-Forwarded-Host':'evil.example','X-Forwarded-Proto':'http','CF-Connecting-IP':'1.2.3.4','Proxy-Authorization':'bad'},body:'upload-bytes'}),env,async(url,init)=>{seen={url,...init,body:await new Response(init.body).text()};return new Response('rsc-stream',{headers:{'Content-Type':'text/x-component','Cache-Control':'public,max-age=1000'}});});
 assert.equal(seen.url,upstream+'/api/materials/upload?x=1');assert.equal(seen.method,'POST');assert.equal(seen.body,'upload-bytes');assert.equal(seen.redirect,'manual');
 assert.equal(seen.headers.get('authorization'),auth);assert.equal(seen.headers.get('cookie'),'praktikum_session=test');assert.equal(seen.headers.get('origin'),upstream);
 assert.equal(seen.headers.get('host'),new URL(upstream).host);assert.equal(seen.headers.get('x-forwarded-host'),new URL(upstream).host);assert.equal(seen.headers.get('x-forwarded-proto'),'https');
 for(const name of ['forwarded','cf-connecting-ip','proxy-authorization'])assert.equal(seen.headers.get(name),null);
 assert.equal(response.headers.get('content-type'),'text/x-component');assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(await response.text(),'rsc-stream');
});
test('URL network-path and encoded slashes never change the fixed upstream authority',async()=>{
 for(const path of ['//evil.example/path','/%2f%2fevil.example/path?target=https://evil.example','/\\evil.example/path']){
  let target;await proxyRequest(req(path),env,async(url)=>{target=url;return new Response('ok');});
  assert.equal(new URL(target).origin,upstream);
 }
});
test('GET BasicAuth challenge/status and multiple Secure HttpOnly host-only cookies pass without caching',async()=>{
 const challenge=await proxyRequest(req('/login'),env,async()=>new Response('Private',{status:401,headers:{'WWW-Authenticate':'Basic realm="review"'}}));
 assert.equal(challenge.status,401);assert.match(challenge.headers.get('www-authenticate'),/^Basic/);
 const headers=new Headers();headers.append('Set-Cookie','praktikum_session=test; Path=/; Secure; HttpOnly; SameSite=Lax');headers.append('Set-Cookie','praktikum_session=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Domain=praktikum-review-vhyg.onrender.com; Path=/; Secure');
 const response=await proxyRequest(req('/login'),env,async()=>new Response(null,{status:303,headers:{...Object.fromEntries(headers),location:upstream+'/dashboard?ok=1'}}));
 assert.equal(response.status,303);assert.equal(response.headers.get('location'),site+'/dashboard?ok=1');
 // Use a second response preserving actual separate headers, never split at date commas.
 const result=await proxyRequest(req(),env,async()=>new Response('ok',{headers}));const values=result.headers.getSetCookie();assert.equal(values.length,2);assert.match(values[0],/Secure; HttpOnly; SameSite=Lax/);assert.ok(values.every(x=>!x.includes('Domain=')));assert.match(values[1],/Thu, 01 Jan/);
});
test('foreign redirects/cookie domains and upstream failures fail generically without forwarding credentials elsewhere',async()=>{
 let calls=0;
 for(const response of [new Response(null,{status:302,headers:{Location:'https://evil.example/'}}),new Response('bad',{headers:{'Set-Cookie':'praktikum_session=test; Domain=evil.example'}})]){
 const result=await proxyRequest(req(),env,async()=>{calls++;return response;});assert.equal(result.status,502);assert.equal(await result.text(),'Demo service temporarily unavailable');
 }
 const error=await proxyRequest(req(),env,async()=>{throw new Error('sensitive-internal-diagnostic');});assert.equal(error.status,502);assert.equal((await error.text()).includes('sensitive'),false);assert.equal(calls,2);
});
test('declared and streamed oversized requests are bounded without buffering the full body',async()=>{
 let calls=0;
 const declared=await proxyRequest(req('/upload',{method:'POST',headers:{Origin:site,'Content-Length':String(6*1024*1024+1)},body:'x'}),env,async()=>{calls++;return new Response('unexpected');});assert.equal(declared.status,413);assert.equal(calls,0);
 let pulls=0;const body=new ReadableStream({pull(c){pulls++;c.enqueue(new Uint8Array(1024*1024));if(pulls===10)c.close();}});
 const streamed=await proxyRequest(req('/upload',{method:'POST',headers:{Origin:site},body,duplex:'half'}),env,async(_url,init)=>{await new Response(init.body).arrayBuffer();return new Response('unexpected');});assert.equal(streamed.status,413);assert.ok(pulls<10);
});

test('platform identities and unrelated cookies never reach Render; only app response cookie is relayed',async()=>{
 let received;
 const headers={Origin:site,Authorization:'Basic dGVzdDpub3QtYS1zZWNyZXQ=',Cookie:'cloudflare=private; praktikum_session=app-session; other=platform-token',
 'OAI-Sites-Authorization':'platform-jwt','OAI-Identity':'visitor-email','CF-Access-Jwt-Assertion':'access-jwt','X-User-Email':'private-email','X-Identity-Token':'private-token','X-Forwarded-User':'visitor','Next-Action':'valid-action','RSC':'1'};
 const response=await proxyRequest(req('/dashboard',{method:'POST',headers,body:'form'}),env,async(_url,init)=>{
 received=init.headers;const h=new Headers();h.append('Set-Cookie','platform_private=token; Path=/; Secure');h.append('Set-Cookie','praktikum_session=app; Domain=praktikum-review-vhyg.onrender.com; Path=/; Secure; HttpOnly; SameSite=Lax');return new Response('ok',{headers:h});});
 assert.equal(received.get('cookie'),'praktikum_session=app-session');assert.match(received.get('authorization'),/^Basic /);
 assert.equal(received.get('next-action'),'valid-action');assert.equal(received.get('rsc'),'1');
 for(const key of ['oai-sites-authorization','oai-identity','cf-access-jwt-assertion','x-user-email','x-identity-token','x-forwarded-user'])assert.equal(received.get(key),null);
 assert.deepEqual(response.headers.getSetCookie(),['praktikum_session=app; Path=/; Secure; HttpOnly; SameSite=Lax']);
 for(const authorization of ['Bearer platform-jwt','token other']){
 await proxyRequest(req('/dashboard',{headers:{Authorization:authorization}}),env,async(_url,init)=>{assert.equal(init.headers.get('authorization'),null);return new Response('ok');});
 }
});
