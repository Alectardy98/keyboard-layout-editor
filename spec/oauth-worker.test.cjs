const {test}=require('node:test');
const assert=require('node:assert/strict');
const worker=import('../hosting/github-oauth-worker.mjs').then(m=>m.default);
const env={EDITOR_URL:'https://owner.github.io/editor/',GITHUB_CLIENT_ID:'test-client',GITHUB_CLIENT_SECRET:'test-secret'};
const valid={code:'temporary-code',redirect_uri:'https://owner.github.io/editor/oauth.html'};
const request=(data,origin='https://owner.github.io')=>new Request('https://exchange.example/token',{
 method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(data)
});
test('OAuth exchange only accepts the configured origin, callback and bounded JSON',async()=>{
 const w=await worker;
 assert.equal((await w.fetch(request(valid,'https://attacker.example'),env)).status,403);
 assert.equal((await w.fetch(request({...valid,redirect_uri:'https://owner.github.io/other/oauth.html'}),env)).status,400);
 assert.equal((await w.fetch(request({code:'x'.repeat(5000)}),env)).status,413);
 assert.equal((await w.fetch(request(valid),{})).status,503);
});
test('OAuth worker exchanges codes server-side without exposing client secrets',async t=>{
 const w=await worker;
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  assert.equal(url,'https://github.com/login/oauth/access_token');
  assert.deepEqual(JSON.parse(options.body),{client_id:env.GITHUB_CLIENT_ID,client_secret:env.GITHUB_CLIENT_SECRET,...valid});
  return Response.json({access_token:'test-access-token'});
 });
 const response=await w.fetch(request(valid),env);
 assert.equal(response.status,200);
 assert.equal(response.headers.get('Cache-Control'),'no-store');
 assert.deepEqual(await response.json(),{token:'test-access-token'});
});
test('OAuth worker handles GitHub errors and CORS preflights',async t=>{
 const w=await worker;
 t.mock.method(globalThis,'fetch',async()=>Response.json({error:'bad_verification_code'}));
 const response=await w.fetch(request(valid),env);
 assert.equal(response.status,400);assert.deepEqual(await response.json(),{error:'bad_verification_code'});
 const preflight=await w.fetch(new Request('https://exchange.example/token',{method:'OPTIONS',headers:{Origin:'https://owner.github.io'}}),env);
 assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),'https://owner.github.io');
});
