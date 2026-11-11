const {test,expect}=require('@playwright/test');
const library=require('../../layout-library.js');
const origin='http://127.0.0.1:5189';

async function setup(page,context,options={}){
 await context.addCookies([{name:'oauthToken',value:'library-test-token',url:origin}]);
 const layouts=Array.from({length:117},(_,i)=>({
  id:'layout-'+String(i+1).padStart(3,'0'),description:'Layout '+String(i+1).padStart(3,'0'),
  updated_at:'2026-11-08T12:00:00Z',owner:{login:'test-user'},html_url:'https://gist.github.com/layout-'+(i+1),
  files:{'original.kbd.json':{content:'[["Esc","A"]]'},'original.style.css':{content:'.keycap { color: red; }'},'original.notes.md':{content:'Original notes'}}
 }));
 const original=structuredClone(layouts),writes=[];
 const state={rejectWrites:!!options.rejectWrites,metadata:null,staleReadback:false,previousMetadata:null};
 if(options.document)state.metadata={id:'folder-index',owner:{login:'test-user'},public:false,
  files:{[library.file]:{content:JSON.stringify(options.document),truncated:false}}};
 const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,content-type,accept',
  'Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,OPTIONS','Access-Control-Expose-Headers':'Link'};
 await context.route('https://api.github.com/**',async route=>{
  const request=route.request(),url=new URL(request.url()),method=request.method();
  if(method==='OPTIONS')return route.fulfill({status:204,headers});
  expect(request.headers().authorization).toBe('token library-test-token');
  if(url.pathname==='/user')return route.fulfill({json:{login:'test-user'},headers});
  if((url.pathname==='/gists'||url.pathname==='/gists/starred')&&method==='GET'){
   const all=url.pathname.endsWith('/starred')?layouts.slice(30,65):[...(state.metadata?[state.metadata]:[]),...layouts,{id:'notes-only',files:{'notes.txt':{}}}];
   const number=Number(url.searchParams.get('page')||1),start=(number-1)*100;
   const responseHeaders={...headers};
   if(start+100<all.length)responseHeaders.Link='<https://api.github.com'+url.pathname+'?page='+(number+1)+'&per_page=100>; rel="next"';
   return route.fulfill({json:all.slice(start,start+100),headers:responseHeaders});
  }
  if(url.pathname==='/gists/folder-index'&&method==='GET')return route.fulfill({json:state.staleReadback&&state.previousMetadata?state.previousMetadata:state.metadata,headers});
  if((url.pathname==='/gists'&&method==='POST')||(url.pathname==='/gists/folder-index'&&method==='PATCH')){
   const payload=request.postDataJSON();writes.push({method,path:url.pathname,payload});
   expect(Object.keys(payload.files)).toEqual([library.file]);
   if(method==='POST')expect(payload.public).toBe(false);
   if(state.rejectWrites)return route.fulfill({status:503,json:{message:'Test save failure'},headers});
   state.previousMetadata=structuredClone(state.metadata);
   state.metadata={...(state.metadata||{id:'folder-index',owner:{login:'test-user'},public:false}),files:{[library.file]:{content:payload.files[library.file].content,truncated:false}}};
   return route.fulfill({status:method==='POST'?201:200,json:state.metadata,headers});
  }
  const found=layouts.find(layout=>url.pathname==='/gists/'+layout.id);
  if(found&&method==='GET')return route.fulfill({json:found,headers});
  return route.fulfill({status:404,json:{message:'Not found'},headers});
 });
 return {layouts,original,writes,state,document:()=>JSON.parse(state.metadata.files[library.file].content)};
}
async function openList(page,starred=false){
 await page.goto('./');
 await expect(page.locator('li[ng-hide="!user"] > a')).toBeVisible();
 await page.locator('li[ng-hide="!user"] > a').click();
 await page.locator('a[ng-click="showSavedLayouts('+starred+')"]').click();
 await expect(page.locator('.modal')).toBeVisible();
 await expect(page.locator('.modal p[role="status"]').filter({hasText:'Loading layouts'})).toBeHidden();
}
async function folderMenu(page,name){
 await page.getByRole('button',{name:'Folders',exact:true}).click();
 await page.getByRole('menuitem',{name}).click();
}
async function saved(page){
 await expect(page.getByText('Folder changes saved to GitHub.',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Folders',exact:true})).toBeEnabled();
}

test('arrows reach older layouts; folders persist without rewriting any stock KLE files',async({page,context})=>{
 const backend=await setup(page,context);await openList(page);
 await expect(page.locator('.modal tr[ng-repeat]')).toHaveCount(30);
 await expect(page.getByText('Page 1 of 4',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Previous layouts page'})).toBeDisabled();
 for(const size of [{width:1440,height:900},{width:1100,height:720}]){
  await page.setViewportSize(size);
  const dialog=await page.locator('.modal-dialog').boundingBox(),footer=await page.locator('.layout-library-footer').boundingBox();
  expect(dialog.x).toBeGreaterThanOrEqual(0);expect(dialog.x+dialog.width).toBeLessThanOrEqual(size.width);
  expect(footer.y+footer.height).toBeLessThanOrEqual(size.height);
 }
 await page.screenshot({path:'test-results/layout-list-30.png',animations:'disabled'});
 await page.getByRole('button',{name:'Next layouts page'}).click();
 await expect(page.getByText('Layout 031',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Next layouts page'}).click();
 await page.getByRole('button',{name:'Next layouts page'}).click();
 await expect(page.locator('.modal tr[ng-repeat]')).toHaveCount(27);
 await expect(page.getByText('91–117 of 117 layouts',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Next layouts page'})).toBeDisabled();
 expect(backend.writes).toHaveLength(0);
 await folderMenu(page,'New folder…');
 await page.getByRole('textbox',{name:'New folder name'}).fill('IBM');
 await page.getByRole('button',{name:'Create folder',exact:true}).click();await saved(page);
 const id=backend.document().folders[0].id;
 await page.getByRole('combobox',{name:'Move Layout 117 to folder',exact:true}).selectOption({label:'IBM'});await saved(page);
 expect(backend.document().layouts['layout-117']).toBe(id);
 await page.getByRole('combobox',{name:'Folder',exact:true}).selectOption(id);
 await expect(page.locator('.modal tr[ng-repeat]')).toHaveCount(1);
 await expect(page.getByText('Page 1 of 1',{exact:true})).toBeVisible();
 await page.screenshot({path:'test-results/layout-folders.png',fullPage:true,animations:'disabled'});
 await page.reload();await openList(page);
 await page.getByRole('combobox',{name:'Folder',exact:true}).selectOption(id);
 await expect(page.getByText('Layout 117',{exact:true})).toBeVisible();
 await folderMenu(page,'Rename selected folder…');
 await page.getByRole('textbox',{name:'Rename folder'}).fill('Model F');
 await page.getByRole('button',{name:'Save folder name',exact:true}).click();await saved(page);
 expect(backend.document().folders[0].name).toBe('Model F');
 await folderMenu(page,'Remove selected folder…');
 await expect(page.getByText(/No layouts will be deleted/)).toBeVisible();
 await page.getByRole('button',{name:'Remove folder',exact:true}).click();await saved(page);
 expect(backend.document().folders).toEqual([]);expect(backend.document().layouts).toEqual({});
 expect(backend.layouts).toEqual(backend.original);
 expect(backend.writes.map(write=>write.path)).toEqual(['/gists','/gists/folder-index','/gists/folder-index','/gists/folder-index']);
});

test('failed folder writes roll back the selector and never claim a successful save',async({page,context})=>{
 const document=library.apply(library.empty(),{type:'create',id:'folder-ibm',name:'IBM'});
 const backend=await setup(page,context,{document,rejectWrites:true});await openList(page);
 const select=page.getByRole('combobox',{name:'Move Layout 001 to folder',exact:true});
 await select.selectOption({label:'IBM'});
 await expect(page.getByRole('alert')).toContainText('save could not be confirmed');
 await expect(select).toHaveValue('');
 await expect(page.getByText('Folder changes saved to GitHub.',{exact:true})).toHaveCount(0);
 expect(backend.document().layouts).toEqual({});
 backend.state.rejectWrites=false;
 await select.selectOption({label:'IBM'});await saved(page);
 expect(backend.document().layouts['layout-001']).toBe('folder-ibm');
 expect(backend.layouts).toEqual(backend.original);
});

test('unsupported metadata leaves layout navigation usable and folder writes disabled',async({page,context})=>{
 const backend=await setup(page,context,{document:{...library.empty(),version:99}});await openList(page);
 await expect(page.getByRole('alert')).toContainText('version is unsupported');
 await expect(page.getByRole('button',{name:'Folders',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Next layouts page'}).click();
 await expect(page.getByText('Layout 031',{exact:true})).toBeVisible();
 expect(backend.writes).toHaveLength(0);
});

test('starred layouts share the account folders and opening or cancelling a folder draft makes no writes',async({page,context})=>{
 let document=library.apply(library.empty(),{type:'create',id:'folder-ibm',name:'IBM'});
 document=library.apply(document,{type:'move',layout:'layout-031',folder:'folder-ibm'});
 const backend=await setup(page,context,{document});await openList(page,true);
 await page.getByRole('combobox',{name:'Folder',exact:true}).selectOption('folder-ibm');
 await expect(page.locator('.modal tr[ng-repeat]')).toHaveCount(1);
 await expect(page.getByText('Layout 031',{exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:/Delete$/})).toBeHidden();
 await folderMenu(page,'New folder…');
 await page.getByRole('textbox',{name:'New folder name'}).fill('Unsaved folder');
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'New folder name'})).toHaveCount(0);
 expect(backend.writes).toHaveLength(0);
});

test('fresh metadata is merged before a move and inconsistent readback cannot report success',async({page,context})=>{
 const document=library.apply(library.empty(),{type:'create',id:'folder-ibm',name:'IBM'});
 const backend=await setup(page,context,{document});await openList(page);
 const concurrent=library.apply(document,{type:'create',id:'folder-sun',name:'Sun'});
 backend.state.metadata.files[library.file].content=library.serialize(concurrent);
 await page.getByRole('combobox',{name:'Move Layout 001 to folder',exact:true}).selectOption({label:'IBM'});await saved(page);
 expect(backend.document().folders.map(folder=>folder.name)).toEqual(['IBM','Sun']);
 backend.state.staleReadback=true;
 const second=page.getByRole('combobox',{name:'Move Layout 002 to folder',exact:true});
 await second.selectOption({label:'Sun'});
 await expect(page.getByRole('alert')).toContainText('readback differs');
 await expect(page.getByText('Folder changes saved to GitHub.',{exact:true})).toHaveCount(0);
 await expect(second).toHaveValue('');
 expect(backend.layouts).toEqual(backend.original);
});
