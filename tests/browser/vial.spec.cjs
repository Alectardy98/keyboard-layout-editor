const {test,expect}=require('@playwright/test');
const fs=require('node:fs');const path=require('node:path');
const fixture=name=>path.resolve(__dirname,'../../spec/fixtures/'+name+'-vial.json');
async function openFile(page,file){
 const chooser=page.waitForEvent('filechooser');
 await page.getByRole('button',{name:/Open KLE \/ Vial \/ VIA JSON$/}).click();
 await(await chooser).setFiles(file);
}
async function ready(page){await page.goto('./');await expect(page.locator('#keyboard .keytop').first()).toBeVisible();}
function metadata(value){value=structuredClone(value);delete value.layouts.keymap;return value;}
test('real Vial file opens, edit saves complete metadata, and reopens under a project subpath',async({page})=>{
 const errors=[],badRequests=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)badRequests.push(r.url());});
 await ready(page);await openFile(page,fixture('f50'));
 await expect(page.getByRole('status')).toContainText('Opened Vial definition');
 await expect(page.locator('#keyboard .keycap')).toHaveCount(50);
 await page.evaluate(()=>{const s=angular.element(document.body).scope();s.$apply(()=>{s.selectAll();s.moveKeys(.25,0,{preventDefault(){},stopPropagation(){}});});});
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:/Save definition JSON$/}).click();const download=await pending;
 expect(download.suggestedFilename()).toBe('vial.json');
 const result=JSON.parse(fs.readFileSync(await download.path(),'utf8')),original=JSON.parse(fs.readFileSync(fixture('f50')));
 expect(metadata(result)).toEqual(metadata(original));expect(result.layouts.keymap).not.toEqual(original.layouts.keymap);
 await openFile(page,{name:'edited-vial.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(result))});
 await expect(page.locator('#keyboard .keycap')).toHaveCount(50);
 expect(errors).toEqual([]);expect(badRequests).toEqual([]);
 await page.screenshot({path:'test-results/f50-vial.png',fullPage:true});
});
test('layout options and custom metadata survive edits, undo, and redo across document types',async({page})=>{
 await ready(page);await openFile(page,fixture('fat'));await expect(page.getByRole('status')).toContainText('Opened Vial');
 const original=JSON.parse(fs.readFileSync(fixture('fat')));
 expect(await page.evaluate(()=>angular.element(document.body).scope().vialDocument.layouts.labels)).toEqual(original.layouts.labels);
 await openFile(page,{name:'plain.json',mimeType:'application/json',buffer:Buffer.from('[["Esc","A"]]')});
 await expect(page.getByRole('button',{name:/Save\ KLE\ JSON$/})).toBeVisible();
 await page.getByRole('button',{name:/Undo$/}).click();await expect(page.getByRole('button',{name:/Save definition JSON$/})).toBeVisible();
 await page.getByRole('button',{name:/Redo$/}).click();await expect(page.getByRole('button',{name:/Save\ KLE\ JSON$/})).toBeVisible();
});
test('malformed import leaves current layout intact and invalid matrix legends block Vial export',async({page})=>{
 await ready(page);await openFile(page,fixture('f50'));await expect(page.getByRole('status')).toContainText('Opened Vial');
 await openFile(page,{name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"layouts":{}}')});
 await expect(page.getByRole('alert')).toContainText('Could not open layout');await expect(page.locator('#keyboard .keycap')).toHaveCount(50);
 await page.evaluate(()=>{const s=angular.element(document.body).scope();s.$apply(()=>{s.keyboard.keys[0].labels[0]='Esc';});});
 await page.getByRole('button',{name:/Save definition JSON$/}).click();await expect(page.getByRole('alert')).toContainText('needs a row,column');
});
test('normal KLE import and JSON export remain plain arrays',async({page})=>{
 await ready(page);await openFile(page,{name:'plain.json',mimeType:'application/json',buffer:Buffer.from('[["Esc",{"w":2},"Space"]]')});
 await expect(page.getByRole('status')).toContainText('Opened KLE layout');
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:/Save\ KLE\ JSON$/}).click();
 const result=JSON.parse(fs.readFileSync(await(await pending).path(),'utf8'));expect(Array.isArray(result)).toBeTruthy();
});
test('raw layout edits retain the definition and invalid CSS does not replace it',async({page})=>{
 await ready(page);await openFile(page,fixture('f50'));await expect(page.getByRole('status')).toContainText('Opened Vial');
 const original=JSON.parse(fs.readFileSync(fixture('f50')));
 await page.evaluate(()=>{const s=angular.element(document.body).scope();s.$apply(()=>s.deserializeAndRender([['0,0']],true));});
 expect(await page.evaluate(()=>angular.element(document.body).scope().vialDocument.name)).toBe(original.name);
 const bad=[{css:'a { color: red;'},['bad CSS']];
 await openFile(page,{name:'bad-css.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))});
 await expect(page.getByRole('alert')).toContainText('Could not open layout');
 await expect(page.locator('#keyboard .keycap')).toHaveCount(1);
 expect(await page.evaluate(()=>angular.element(document.body).scope().vialDocument.name)).toBe(original.name);
});
test('GitHub sign-in remains visible with an honest setup error when not configured',async({page})=>{
 await page.route('**/site-config.js',r=>r.fulfill({contentType:'text/javascript',body:'window.KLE_CONFIG={githubClientId:"",githubAuthEndpoint:""};'}));
 await ready(page);await page.getByRole('link',{name:/Sign in with GitHub/}).click();
 await expect(page.getByRole('alert').first()).toContainText('configures the OAuth app');
});
test('OAuth callback and Gist save/reopen retain the full Vial definition',async({page,context})=>{
 await context.route('**/site-config.js',r=>r.fulfill({contentType:'text/javascript',body:'window.KLE_CONFIG={githubClientId:"test-client",githubAuthEndpoint:"https://oauth.example.test/token"};'}));
 let authorization;
 await context.route('https://github.com/login/oauth/authorize?**',r=>{authorization=new URL(r.request().url());return r.fulfill({status:302,headers:{location:authorization.searchParams.get('redirect_uri')+'?code=fake-code&state='+authorization.searchParams.get('state')}});});
 let exchanges=0,saved,gistPages=[];
 await context.route('https://oauth.example.test/token',async r=>{
  exchanges++;
  expect(r.request().postDataJSON().redirect_uri).toBe('http://127.0.0.1:5189/keyboard-layout-editor/oauth.html');
  await r.fulfill({json:{token:'test-token'},headers:{'Access-Control-Allow-Origin':'http://127.0.0.1:5189'}});
 });
 await context.route('https://api.github.com/**',async r=>{
  const req=r.request(),url=new URL(req.url());
  const headers={'Access-Control-Allow-Origin':'http://127.0.0.1:5189','Access-Control-Allow-Headers':'authorization,content-type,accept','Access-Control-Allow-Methods':'GET,POST,PATCH,PUT,DELETE,OPTIONS','Access-Control-Expose-Headers':'Link'};
  if(req.method()==='OPTIONS')return r.fulfill({status:204,headers});
  if(url.pathname==='/user')return r.fulfill({json:{login:'test-user'},headers});
  const previous={id:'previous-gist',description:'Existing KLE layout',updated_at:'2026-11-08',
   owner:{login:'test-user'},files:{'saved.kbd.json':{content:'[["Esc","A"]]'}}};
  if(url.pathname==='/gists' && req.method()==='GET'){
   gistPages.push(url.pathname+url.search);
   if(url.searchParams.get('page')==='2')return r.fulfill({json:[previous,{...previous,id:'older-gist',description:'Older KLE layout'}],headers});
   return r.fulfill({json:[previous,{id:'not-a-layout',files:{'notes.txt':{content:'notes'}}}],headers:{...headers,Link:'<https://api.github.com/gists?page=2&per_page=100>; rel="next"'}});
  }
  if(url.pathname==='/gists/previous-gist')return r.fulfill({json:previous,headers});
  if(url.pathname==='/gists' && req.method()==='POST'){
   saved=req.postDataJSON();return r.fulfill({json:{...saved,id:'test-gist',owner:{login:'test-user'}},headers});
  }
  if(url.pathname==='/gists/test-gist')return r.fulfill({json:{...saved,id:'test-gist',owner:{login:'test-user'}},headers});
  return r.fulfill({status:404,json:{message:'Not starred'},headers});
 });
 await ready(page);
 await page.getByRole('link',{name:/Sign in with GitHub/}).click();
 await expect(page.getByText('test-user',{exact:true})).toBeVisible();expect(exchanges).toBe(1);
 expect(authorization.searchParams.get('client_id')).toBe('test-client');
 expect(authorization.searchParams.get('scope')).toBe('gist');expect(authorization.searchParams.get('state').length).toBe(64);
 await page.getByText('test-user',{exact:true}).click();
 await page.getByRole('link',{name:/My Layouts/}).click();
 await expect(page.getByText('Existing KLE layout',{exact:true})).toBeVisible();
 await expect(page.getByText('Older KLE layout',{exact:true})).toBeVisible();
 expect(gistPages).toEqual(['/gists?per_page=100','/gists?page=2&per_page=100']);
 await expect(page.locator('.modal-body tr[ng-repeat]')).toHaveCount(2);
 await page.getByRole('row').filter({hasText:'Existing KLE layout'}).getByRole('link',{name:/Load$/}).click();
 await expect(page.locator('#keyboard .keycap')).toHaveCount(2);
 await openFile(page,fixture('f50'));await expect(page.getByRole('status')).toContainText('Opened Vial');
 await page.getByRole('button',{name:/Save$/}).click();
 await expect.poll(()=>saved).toBeTruthy();
 const content=Object.entries(saved.files).find(([name])=>name.endsWith('.kbd.json'))[1].content;
 const original=JSON.parse(fs.readFileSync(fixture('f50')));expect(metadata(JSON.parse(content))).toEqual(metadata(original));
 await expect.poll(()=>page.url()).toContain('/gists/test-gist');
 await page.reload();await expect(page.getByRole('button',{name:/Save definition JSON$/})).toBeVisible();
 await expect(page.locator('#keyboard .keycap')).toHaveCount(50);
});
