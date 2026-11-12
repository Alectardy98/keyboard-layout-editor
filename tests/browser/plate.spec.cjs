const {test,expect}=require('@playwright/test');const fs=require('node:fs');
const D=require('../../plate/dxf'),R=require('../../plate/recognize');const {makeFixture}=require('../../spec/plate-fixture.cjs');
async function open(page,source=makeFixture()) {
 await page.goto('plate.html');await expect(page.getByRole('heading',{name:'Plate editor',exact:true})).toBeVisible();
 const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Open DXF plate',exact:true}).click();
 await(await chooser).setFiles({name:'synthetic.dxf',mimeType:'application/dxf',buffer:Buffer.from(source)});
 await expect(page.locator('#keyboard .keycap')).toHaveCount(4);
}
async function selectStab(page,group){
 await page.getByLabel('Stabilizer category',{exact:true}).selectOption(group.startsWith('mx-')?'mx':group);
 if(group.startsWith('mx-'))await page.getByLabel('Stabilizer type',{exact:true}).selectOption({label:group==='mx-pcb'?'PCB mount':'Plate mount'});
}
const scopeRead=(page,fn)=>page.evaluate(fn);
test('dedicated plate page displays DXF above its editable KLE and does not upload drawings',async({page})=>{
 const errors=[],unexpected=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:5189/')&&!r.url().startsWith('data:'))unexpected.push(r.url());});
 await page.setViewportSize({width:1400,height:1000});await open(page);
 await expect(page.locator('.plate-path.plate-switch')).toHaveCount(6);
 expect(await page.locator('.plate-svg').evaluate(e=>e.viewBox.baseVal.width)).toBe(115);
 const drawing=await page.locator('.plate-svg').boundingBox(),keyboard=await page.locator('#keyboard').boundingBox();expect(drawing.y).toBeLessThan(keyboard.y);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download edited DXF'}).click();
 expect(fs.readFileSync(await(await pending).path(),'utf8')).toBe(makeFixture());
 expect(errors).toEqual([]);expect(unexpected).toEqual([]);
 await page.screenshot({path:'test-results/plate-desktop.png',fullPage:true,animations:'disabled'});
});
test('MX/Alps controls affect DXF only on Apply and support undo/redo without moving fixed features',async({page})=>{
 await open(page);await page.getByLabel('Switch profile',{exact:true}).selectOption('alps');await selectStab(page,'mx-pcb');
 await page.getByRole('button',{name:'North',exact:true}).click();
 expect(await scopeRead(page,()=>Object.values(angular.element(document.body).scope().plate.model.settings).some(c=>c.profile))).toBe(false);
 await page.getByRole('button',{name:'Apply to all editable keys',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'Applied to 4 keys'})).toBeVisible();
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download edited DXF'}).click();const output=D.parse(fs.readFileSync(await(await pending).path()),'result.dxf');
 expect(R.analyze(output).counts.alps).toBe(4);expect(output.source).toContain('MOUNTS');
 await page.getByRole('button',{name:/Undo$/}).click();expect(await scopeRead(page,()=>Object.values(angular.element(document.body).scope().plate.model.settings).some(c=>c.profile))).toBe(false);
 await page.getByRole('button',{name:/Redo$/}).click();expect(await scopeRead(page,()=>Object.values(angular.element(document.body).scope().plate.model.settings).every(c=>c.profile))).toBe(true);
 await selectStab(page,'alps');await expect(page.getByLabel('Stabilizer hole')).toBeVisible();
 await page.getByLabel('Stabilizer hole',{exact:true}).selectOption({label:'Costar'});await expect(page.getByRole('button',{name:'South',exact:true})).toBeVisible();
});
test('cutout selection, anchor locking and repeated KLE resizing preserve the stem centre',async({page})=>{
 await open(page);await page.locator('.plate-switch').nth(1).click();await expect(page.getByText(/1 selected · 1 anchors/)).toBeVisible();
 const result=await page.evaluate(()=>{const s=angular.element(document.body).scope();return s.$apply(()=>{
  const key=s.selectedKeys[0],start=s.plate.model.physical(key).center,event={preventDefault(){},stopPropagation(){}};
  s.sizeKeys(.25,0,event);s.sizeKeys(.25,0,event);const resized=s.plate.model.physical(key).center;
  s.plate.anchor(true);s.moveKeys(.25,0,event);const moved=s.plate.model.physical(key).center;
  return {start,resized,moved};
 });});
 expect(result.start.x).toBeCloseTo(result.resized.x,6);expect(result.start.x).toBeCloseTo(result.moved.x,6);
 await page.getByRole('button',{name:'Unlock selected',exact:true}).click();
});
test('plate project restores anchors and profiles while KLE JSON stays stock compatible',async({page})=>{
 await open(page);await page.getByLabel('Switch profile',{exact:true}).selectOption('alps');await page.getByRole('button',{name:'Apply to all editable keys'}).click();
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Save plate project'}).click();const bytes=fs.readFileSync(await(await pending).path());
 const project=JSON.parse(bytes);expect(project.format).toBe('keebal-plate-project');expect(project.keys).toHaveLength(4);
 await page.reload();const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Open plate project',exact:true}).click();await(await chooser).setFiles({name:'example.plate.json',mimeType:'application/json',buffer:bytes});
 await expect(page.locator('#keyboard .keycap')).toHaveCount(4);await expect(page.getByRole('status').filter({hasText:'Plate project restored'})).toBeVisible();
 const json=page.waitForEvent('download');await page.getByRole('button',{name:/Save KLE JSON$/}).click();const kle=JSON.parse(fs.readFileSync(await(await json).path(),'utf8'));
 expect(Array.isArray(kle)).toBe(true);expect(JSON.stringify(kle)).not.toContain('_plateId');
});
test('unitless edited export is blocked until confirmation and mobile controls stay in view',async({page})=>{
 await page.setViewportSize({width:720,height:900});await open(page,makeFixture({units:0}));
 await page.getByLabel('Switch profile',{exact:true}).selectOption('alps');await page.getByRole('button',{name:'Apply to all editable keys'}).click();await page.getByRole('button',{name:'Download edited DXF'}).click();
 await expect(page.getByRole('alert').filter({hasText:'Confirm the drawing units'})).toBeVisible();
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Confirm / re-read'}).click();
 await expect(page.getByRole('alert').filter({hasText:'Confirm the drawing units'})).toHaveCount(0);
 expect(await page.locator('.plate-controls').evaluate(el=>el.getBoundingClientRect().right<=innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/plate-narrow.png',fullPage:true,animations:'disabled'});
});
test('Open plate DXF from normal KLE opens the workspace without replacing the current layout',async({page,context})=>{
 await page.goto('./');await expect(page.locator('#keyboard .keytop').first()).toBeVisible();const original=await page.locator('#keyboard .keycap').count();
 const popup=context.waitForEvent('page'),chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Open plate DXF',exact:true}).click();await(await chooser).setFiles({name:'synthetic.dxf',mimeType:'application/dxf',buffer:Buffer.from(makeFixture())});
 const child=await popup;await expect(child.locator('#keyboard .keycap')).toHaveCount(4);expect(await page.locator('#keyboard .keycap').count()).toBe(original);
});
test('an incoming KLE aligns to explicit anchors without scaling the DXF or replacing fixed geometry',async({page})=>{
 await open(page);
 await page.evaluate(()=>{const s=angular.element(document.body).scope();s.$apply(()=>{s.selectedKeys=[s.keys().find(k=>k.width===2)];s.plate.anchor(true);});});
 const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:/Open KLE \/ Vial \/ VIA JSON$/}).click();
 await(await chooser).setFiles({name:'layout.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify([['A',{w:1.25,x:-.125},'B',{w:2,x:-.125},'C'],['D']]))});
 await expect(page.getByRole('group',{name:'Align incoming KLE to anchors'})).toBeVisible();
 const controls=page.locator('.plate-alignment select');await controls.nth(0).selectOption({label:'1: A'});await controls.nth(1).selectOption({label:'3: C'});
 await page.getByRole('button',{name:'Align layout to anchors',exact:true}).click();
 const data=await page.evaluate(()=>{const s=angular.element(document.body).scope();return s.keys().map(k=>({id:k._plateId,position:s.plate.model.physical(k).center,label:k.labels[0]}));});
 expect(data).toHaveLength(4);expect(data.find(k=>k.label==='A').position.x).toBeCloseTo(0,6);expect(data.find(k=>k.label==='C').position.x).toBeCloseTo(47.625,6);
 expect(data.find(k=>k.label==='B').position.x).toBeCloseTo(19.05,6);
 expect(data.every(k=>k.id.startsWith('key-'))).toBe(true);
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download edited DXF'}).click();expect(fs.readFileSync(await(await pending).path(),'utf8')).toBe(makeFixture());
});
test('excluding a false detection preserves its original cutout and can be undone',async({page})=>{
 await open(page);await page.locator('.plate-switch').first().click();await page.getByRole('button',{name:'Mark as fixed geometry',exact:true}).click();
 await expect(page.locator('#keyboard .keycap')).toHaveCount(3);
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download edited DXF'}).click();expect(fs.readFileSync(await(await pending).path(),'utf8')).toBe(makeFixture());
 await page.getByRole('button',{name:/Undo$/}).click();await expect(page.locator('#keyboard .keycap')).toHaveCount(4);
});

test('plate preset menus create complete Alps and EC11 geometry in one undo step',async({page})=>{
 await open(page);
 await expect(page.getByRole('button',{name:'Add Key',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Add MX Plate Mount',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Add Alps Keys',exact:true}).click();
 await page.getByRole('link',{name:'5.5u — complete spacebar supports',exact:true}).click();
 await expect(page.locator('#keyboard .keycap')).toHaveCount(5);
 let result=await scopeRead(page,()=>{let s=angular.element(document.body).scope();return {error:s.plate.error,added:s.plate.model.plan(s.keys()).additions.length};});
 expect(result.error).toBe('');expect(result.added).toBe(8);
 await page.getByRole('button',{name:/Undo$/}).click();await expect(page.locator('#keyboard .keycap')).toHaveCount(4);
 await page.getByRole('button',{name:'Add Other',exact:true}).click();await page.getByRole('link',{name:'EC11 — Zenith opening',exact:true}).click();
 result=await scopeRead(page,()=>{let s=angular.element(document.body).scope();return {error:s.plate.error,added:s.plate.model.plan(s.keys()).additions.length};});
 expect(result.error).toBe('');expect(result.added).toBe(1);
});
test('probable shared keys require selectable confirmation and support undo',async({page})=>{
 await open(page);
 await page.evaluate(()=>{const s=angular.element(document.body).scope(),G=PlateGeometry,P=PlateProfiles;
  const rect=(x)=>[P.polygon(G.rectangle(14,14,{x,y:0}))];
  const holes=P.clip.union(rect(0),rect(19.05),[P.polygon(G.rectangle(19.05,2,{x:9.525,y:0}))]);
  const points=P.rings(holes)[0],text='0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nLWPOLYLINE\n90\n'+points.length+'\n70\n1\n'+points.map(p=>'10\n'+p.x+'\n20\n'+p.y+'\n').join('')+'0\nENDSEC\n0\nEOF\n';
  // Load through the same input flow below, rather than mutating the model.
  window.testSharedSource=text;
 });
 const source=await page.evaluate(()=>window.testSharedSource);
 const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Open DXF plate',exact:true}).click();
 await(await chooser).setFiles({name:'shared.dxf',mimeType:'application/dxf',buffer:Buffer.from(source)});
 await expect(page.locator('#keyboard .keycap')).toHaveCount(2);
 const confirm=page.getByRole('button',{name:'Confirm recovered geometry',exact:true});
 await expect(confirm).toBeDisabled();await page.locator('.plate-switch').first().click();await expect(confirm).toBeEnabled();
 await expect(page.locator('.plate-hit-area').first()).toHaveCSS('stroke','none');
 await expect(page.locator('.plate-hit-area').first()).toHaveCSS('fill-rule','evenodd');
 await confirm.click();await expect(confirm).toBeDisabled();
 expect(await page.evaluate(()=>{const s=angular.element(document.body).scope();return s.plate.model.settings[s.selectedKeys[0]._plateId].confirmed;})).toBe(true);
 await page.getByRole('button',{name:/Undo$/}).click();
 expect(await page.evaluate(()=>Object.values(angular.element(document.body).scope().plate.model.settings).some(s=>s.confirmed))).toBe(false);
});
test('plate KLE is centred and new keys follow its quarter-unit origin',async({page})=>{
 await page.setViewportSize({width:1400,height:1000});await open(page);
 const box=await page.locator('#keyboard').boundingBox();expect(Math.abs(box.x+box.width/2-700)).toBeLessThan(20);
 const result=await page.evaluate(()=>{const s=angular.element(document.body).scope();return s.$apply(()=>{
  const before=s.keys().map(k=>({id:k._plateId,p:s.plate.model.physical(k).center})),origin=s.keys()[0];s.unselectAll();s.plate.addPreset('alps-1');
  const added=s.selectedKeys[0];return {x:(added.x-origin.x)*4,y:(added.y-origin.y)*4,unchanged:before.every(k=>{const p=s.plate.model.physical(s.keys().find(q=>q._plateId===k.id)).center;return Math.hypot(p.x-k.p.x,p.y-k.p.y)<1e-7;})};
 });});
 expect(Math.abs(result.x-Math.round(result.x))).toBeLessThan(1e-6);expect(Math.abs(result.y-Math.round(result.y))).toBeLessThan(1e-6);expect(result.unchanged).toBe(true);
});
test('nearby opening inclusion highlights, supports undo and persists in projects',async({page})=>{
 const base=D.parse(makeFixture(),'base'),G=require('../../plate/geometry');
 const source=Buffer.from(D.exportBytes(base,[],[{points:G.rectangle(2.4,3,{x:19.05,y:10})}])).toString();
 await open(page,source);await page.locator('.plate-switch').nth(1).click();
 const row=page.locator('.plate-support-list>div').filter({hasText:'2.40 × 3.00'});await expect(row).toBeVisible();await row.hover();await expect(page.locator('.plate-support-candidate')).toHaveCount(1);
 await row.getByRole('button',{name:'Include',exact:true}).click();await expect(row.getByRole('button',{name:'Remove',exact:true})).toBeVisible();
 const saved=page.waitForEvent('download');await page.getByRole('button',{name:'Save plate project',exact:true}).click();const project=JSON.parse(fs.readFileSync(await(await saved).path(),'utf8'));expect(Object.values(project.settings).some(c=>c.supports?.length===1)).toBe(true);
 await page.getByRole('button',{name:/Undo$/}).click();
 expect(await page.evaluate(()=>Object.values(angular.element(document.body).scope().plate.model.settings).some(c=>c.supports?.length))).toBe(false);
 await page.locator('.plate-switch').nth(1).click();await expect(row.getByRole('button',{name:'Include',exact:true})).toBeVisible();
});
test('selecting unidentified shapes adds a key, supports undo and reloads from a project',async({page})=>{
 const G=require('../../plate/geometry'),base=D.parse(makeFixture(),'base');
 const source=Buffer.from(D.exportBytes(base,[],[{points:G.rectangle(12,10,{x:145,y:-80})}])).toString();await open(page,source);
 await expect(page.getByRole('button',{name:'Map to new key',exact:true})).toHaveCount(0);
 await page.locator('.plate-switch').nth(1).click();
 await expect(page.locator('.plate-selected')).toHaveCount(1);
 // The isolated unknown opening is selectable; the plate outline is not.
 const target=await page.evaluate(()=>{const s=angular.element(document.body).scope();return s.plate.document.contours.find(c=>PlateGeometry.bounds(c.points).cx>130).id;});
 const pathIndex=await page.evaluate(id=>angular.element(document.body).scope().plate.paths.findIndex(p=>p.contour===id),target);
 await expect(page.locator('.plate-svg .plate-path').nth(pathIndex)).toHaveCSS('stroke','rgb(212, 119, 0)');
 await page.locator('.plate-svg .plate-path').nth(pathIndex).click();
 await expect(page.locator('.plate-shape-picked')).toHaveCount(1);
 await page.mouse.move(0,0);
 await expect(page.locator('.plate-shape-picked')).toHaveCSS('stroke','rgb(212, 119, 0)');
 await expect(page.locator('.plate-selected')).toHaveCount(0);
 expect(await page.evaluate(()=>angular.element(document.body).scope().selectedKeys.length)).toBe(0);
 await page.getByLabel('Name',{exact:true}).fill('Unrecognized key');await page.getByRole('button',{name:'Map to new key',exact:true}).click();await expect(page.locator('#keyboard .keycap')).toHaveCount(5);
 const saved=page.waitForEvent('download');await page.getByRole('button',{name:'Save plate project',exact:true}).click();const savedPath=await(await saved).path();const project=JSON.parse(fs.readFileSync(savedPath,'utf8'));expect(Object.values(project.settings).some(c=>c.sourceContours?.length===1)).toBe(true);
 await page.getByRole('button',{name:/Undo$/}).click();await expect(page.locator('#keyboard .keycap')).toHaveCount(4);
 page.on('dialog',d=>d.accept());const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Open plate project',exact:true}).click();await(await chooser).setFiles(savedPath);await expect(page.locator('#keyboard .keycap')).toHaveCount(5);
 const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Download edited DXF',exact:true}).click();expect(fs.readFileSync(await(await downloaded).path(),'utf8')).toBe(source);
});
test('unidentified shape delete and map-to-existing actions support undo and KLE selection',async({page})=>{
 const G=require('../../plate/geometry'),base=D.parse(makeFixture(),'base');
 const source=Buffer.from(D.exportBytes(base,[],[{points:G.rectangle(12,10,{x:145,y:-80})}])).toString();await open(page,source);
 const target=await page.evaluate(()=>{const s=angular.element(document.body).scope();return s.plate.document.contours.find(c=>PlateGeometry.bounds(c.points).cx>130).id;});
 async function pick(){const index=await page.evaluate(id=>angular.element(document.body).scope().plate.paths.findIndex(p=>p.contour===id),target);await page.locator('.plate-svg .plate-path').nth(index).click();}
 await pick();await page.getByRole('button',{name:'Delete',exact:true}).click();await expect(page.locator('.plate-shape-picked')).toHaveCount(0);
 expect(await page.evaluate(id=>angular.element(document.body).scope().plate.model.selectableContours().includes(id),target)).toBe(false);
 await page.getByRole('button',{name:/Undo$/}).click();await pick();await page.getByRole('button',{name:'Map to existing',exact:true}).click();
 const keyIndex=await page.evaluate(()=>angular.element(document.body).scope().keys().findIndex(k=>k._plateId==='key-002'));
 await page.locator('#keyboard .key').nth(keyIndex).getByText('Key 2',{exact:true}).click();
 expect(await page.evaluate(()=>angular.element(document.body).scope().plate.model.snapshot()['key-002'].bindings.length)).toBe(1);
 await expect(page.getByRole('button',{name:'Cancel',exact:true})).toHaveCount(0);
 const saved=page.waitForEvent('download');await page.getByRole('button',{name:'Save plate project',exact:true}).click();const savedPath=await(await saved).path();
 await page.getByRole('button',{name:/Undo$/}).click();await pick();await page.getByRole('button',{name:'Map to existing',exact:true}).click();await page.locator('.plate-switch').nth(2).click();
 expect(await page.evaluate(()=>Object.values(angular.element(document.body).scope().plate.model.snapshot()).filter(c=>c.bindings?.length).length)).toBe(1);
 page.on('dialog',d=>d.accept());const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Open plate project',exact:true}).click();await(await chooser).setFiles(savedPath);
 await expect(page.getByRole('status').filter({hasText:'Plate project restored'})).toBeVisible();
 expect(await page.evaluate(()=>angular.element(document.body).scope().plate.model.snapshot()['key-002'].bindings.length)).toBe(1);
});
test('opening a DXF can discard edits, reopen the same file, or cancel safely',async({page})=>{
 await open(page);const source=makeFixture();
 async function choose(text=source,name='synthetic.dxf'){
  const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Open DXF plate',exact:true}).click();
  await(await chooser).setFiles({name,mimeType:'application/dxf',buffer:Buffer.from(text)});
 }
 async function edit(){await page.evaluate(()=>{const s=angular.element(document.body).scope();s.selectedKeys=[s.keys()[0]];s.$apply(()=>s.sizeKeys(.25,0,{preventDefault(){},stopPropagation(){}}));});}
 await edit();await choose();const dialog=page.getByRole('alertdialog');await expect(dialog).toBeVisible();
 await dialog.getByRole('button',{name:'Cancel',exact:true}).click();expect(await page.evaluate(()=>angular.element(document.body).scope().keys()[0].width)).toBe(1.25);
 await choose();await dialog.getByRole('button',{name:'Discard changes and open',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>angular.element(document.body).scope().keys()[0].width)).toBe(1);
 expect(await page.evaluate(()=>angular.element(document.body).scope().dirty)).toBe(false);
 await edit();await choose('not a DXF','invalid.dxf');await dialog.getByRole('button',{name:'Discard changes and open',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();
 expect(await page.evaluate(()=>angular.element(document.body).scope().keys()[0].width)).toBe(1.25);
 await choose();await dialog.getByRole('button',{name:'Discard changes and open',exact:true}).click();await expect.poll(()=>page.evaluate(()=>angular.element(document.body).scope().dirty)).toBe(false);
 await choose(makeFixture({unknown:true}),'different.dxf');await expect(page.locator('.plate-file-info strong')).toHaveText('different.dxf');await expect(dialog).toHaveCount(0);
});

test('MX menu supplies plate/PCB ISO presets and hides Caps Multistep in switch profiles',async({page})=>{
 await open(page);await expect(page.getByLabel('Switch profile').locator('option[value="alps-multistep"]')).toHaveCount(0);
 await page.getByRole('button',{name:'Add MX Plate Mount',exact:true}).click();
 await page.getByRole('link',{name:'ISO Enter — plate mount',exact:true}).click();
 await expect(page.locator('#keyboard .keycap')).toHaveCount(5);
 const added=await page.evaluate(()=>{const s=angular.element(document.body).scope(),k=s.selectedKeys[0];return {w:k.width,h:k.height,w2:k.width2,x2:k.x2,profile:s.plate.model.settings[k._plateId].profile.options};});
 expect([added.w,added.h,added.w2,added.x2]).toEqual([1.25,2,1.5,-.25]);expect(added.profile.mount).toBe('plate');expect(added.profile.mxPattern).toBe('cherry');
 await page.getByRole('button',{name:/Undo$/}).click();await expect(page.locator('#keyboard .keycap')).toHaveCount(4);
});
test('PCB clearance customization stays unapplied until Apply and survives project save',async({page})=>{
 await open(page);await page.locator('#keyboard').getByText('Key 3',{exact:true}).click();
 await selectStab(page,'mx-pcb');
 await page.locator('.plate-stab-advanced summary').click();
 await page.getByLabel('Housing clearance height (mm)').fill('16');await page.getByLabel('Corner radius (mm)',{exact:true}).fill('0.5');
 expect(await page.evaluate(()=>Object.values(angular.element(document.body).scope().plate.model.settings).some(c=>c.profile))).toBe(false);
 await page.getByRole('button',{name:'Apply to selected keys',exact:true}).click();
 expect(await page.evaluate(()=>{const s=angular.element(document.body).scope();return s.plate.model.settings[s.selectedKeys[0]._plateId].profile.options.pcbHeight;})).toBe(16);
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Save plate project',exact:true}).click();
 const saved=JSON.parse(fs.readFileSync(await(await pending).path(),'utf8'));expect(JSON.stringify(saved)).toContain('"pcbHeight":16');
});
test('PCB compatibility presets add complete assemblies and preserve them in project reload',async({page})=>{
 await open(page);
 await page.getByRole('button',{name:'Add MX PCB Mount',exact:true}).click();
 await page.getByRole('link',{name:'2.75u split PCB compatibility',exact:true}).click();
 await expect(page.locator('#keyboard .keycap')).toHaveCount(5);
 const value=await page.evaluate(()=>{const s=angular.element(document.body).scope(),k=s.selectedKeys[0];return {width:k.width,options:s.plate.model.settings[k._plateId].profile.options};});
 expect(value.width).toBe(2.75);expect(value.options.stabilizer).toBe('mx-compat-2.75-split');
 await expect(page.getByLabel('Extra size (mm)')).not.toBeVisible();
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download edited DXF'}).click();
 const r=R.analyze(D.parse(fs.readFileSync(await(await pending).path()),'compatibility.dxf'));
 expect(r.keys.some(k=>k.label==='2.75u split PCB compatibility'&&k.stabilizers.length===1)).toBe(true);
 const save=page.waitForEvent('download');await page.getByRole('button',{name:'Save plate project',exact:true}).click();
 const data=fs.readFileSync(await(await save).path());expect(data.toString()).toContain('mx-compat-2.75-split');
 await page.getByRole('button',{name:/Undo$/}).click();await expect(page.locator('#keyboard .keycap')).toHaveCount(4);
 await page.reload();const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Open plate project',exact:true}).click();
 await(await chooser).setFiles({name:'compat.plate.json',mimeType:'application/json',buffer:data});
 await expect(page.locator('#keyboard .keycap')).toHaveCount(5);
 expect(await page.evaluate(()=>angular.element(document.body).scope().plate.document.coordinateVersion)).toBe(2);

});

test('separate MX menus and Topre presets retain complete geometry through project reload',async({page})=>{
 await open(page);await page.getByRole('button',{name:'Add MX Plate Mount',exact:true}).click();
 await expect(page.getByRole('link',{name:'PCB mount ANSI-ISO',exact:true})).not.toBeVisible();
 await expect(page.getByRole('link',{name:'6.25u with Left stab',exact:true})).not.toBeVisible();
 await page.getByRole('button',{name:'Add MX PCB Mount',exact:true}).click();
 await expect(page.getByRole('link',{name:'6.25u with Left stab',exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'PCB mount ANSI-ISO',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Add Topre Keys',exact:true}).click();
 await page.getByRole('link',{name:'Topre 7u',exact:true}).click();
 await expect(page.locator('#keyboard .keycap')).toHaveCount(5);
 const state=await page.evaluate(()=>{const s=angular.element(document.body).scope(),k=s.selectedKeys[0];return {width:k.width,profile:s.plate.model.settings[k._plateId].profile.options};});
 expect(state.width).toBe(7);expect(state.profile.switch).toBe('topre-7');
 await expect(page.getByLabel('Switch profile',{exact:true})).toHaveValue('topre');
 await expect(page.getByLabel('Stabilizer hole',{exact:true}).locator('option:checked')).toHaveText('Topre 7u');
 const save=page.waitForEvent('download');await page.getByRole('button',{name:'Save plate project',exact:true}).click();const file=await(await save).path(),data=fs.readFileSync(file);
 expect(JSON.parse(data).recognitionVersion).toBe(11);
 await page.reload();const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Open plate project',exact:true}).click();await(await chooser).setFiles({name:'topre.plate.json',mimeType:'application/json',buffer:data});
 await expect(page.locator('#keyboard .keycap')).toHaveCount(5);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download edited DXF'}).click();
 const key=R.analyze(D.parse(fs.readFileSync(await(await download).path()))).keys.find(k=>k.family==='topre-7');expect(key.stabilizers).toHaveLength(2);
});
test('unrecognized joined LINE shapes can be selected through their interior',async({page})=>{
 const lines=[[130,-70,150,-70],[150,-70,150,-60],[150,-60,130,-60],[130,-60,130,-70]].map(([a,b,c,d])=>`0\nLINE\n8\nCUT\n10\n${a}\n20\n${b}\n11\n${c}\n21\n${d}\n`).join('');
 await open(page,makeFixture().replace('0\nENDSEC\n0\nEOF\n',lines+'0\nENDSEC\n0\nEOF\n'));
 const index=await page.evaluate(()=>{const p=angular.element(document.body).scope().plate,c=p.document.contours.find(c=>PlateGeometry.bounds(c.points).cx===140);return p.paths.findIndex(p=>p.contour===c.id);});
 const target=page.locator('.plate-svg .plate-path').nth(index);await target.click();
 await expect(target).toHaveClass(/plate-shape-picked/);await expect(page.getByRole('button',{name:'Map to new key',exact:true})).toBeVisible();
 await page.mouse.move(0,0);await expect(target).toHaveCSS('stroke','rgb(212, 119, 0)');
});
test('ambiguous geometry remains selectable without the global review banner',async({page})=>{
 const G=require('../../plate/geometry');
 const rings=[];for(let i=0;i<3;i++)rings.push(G.rectangle(10.575,14,{x:150+i*19.05,y:130}));
 const source=D.exportBytes(D.parse(makeFixture()),[],rings.map(points=>({points})));
 await page.goto('plate.html');const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Open DXF plate',exact:true}).click();await(await chooser).setFiles({name:'review.dxf',mimeType:'application/dxf',buffer:Buffer.from(source)});
 await expect(page.locator('.plate-file-info')).toBeVisible();
 await expect(page.locator('.plate-review-summary')).toHaveCount(0);
 const item=await page.evaluate(()=>angular.element(document.body).scope().plate.recognized.review[0]);
 const index=await page.evaluate(item=>angular.element(document.body).scope().plate.paths.findIndex(p=>item.key?p.key===item.key:p.contour===item.contour),item);
 await page.locator('.plate-svg .plate-path').nth(index).click();
 await expect(page.locator('.plate-reference').getByText(item.message,{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>{const s=angular.element(document.body).scope();return s.selectedKeys.length+s.plate.pickedShapes.length;})).toBeGreaterThan(0);
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download edited DXF'}).click();expect(fs.readFileSync(await(await pending).path())).toEqual(Buffer.from(source));
});
test('two-cap compatibility assembly survives project reload and moves together in KLE',async({page})=>{
 const {makePcbFixture}=require('../../spec/plate-fixture.cjs');
 await page.goto('plate.html');const choose=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Open DXF plate',exact:true}).click();await(await choose).setFiles({name:'pair.dxf',mimeType:'application/dxf',buffer:Buffer.from(makePcbFixture())});
 await expect(page.locator('#keyboard .keycap')).toHaveCount(8);
 const saved=page.waitForEvent('download');await page.getByRole('button',{name:'Save plate project',exact:true}).click();const bytes=fs.readFileSync(await(await saved).path());
 await page.reload();const reload=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Open plate project',exact:true}).click();await(await reload).setFiles({name:'pair.plate.json',mimeType:'application/json',buffer:bytes});
 await expect(page.locator('#keyboard .keycap')).toHaveCount(8);
 const moved=await page.evaluate(()=>{const s=angular.element(document.body).scope();return s.$apply(()=>{
  const ids=s.plate.recognized.keys.filter(k=>k.assembly).map(k=>k.id),pair=s.keys().filter(k=>ids.includes(k._plateId));
  s.plate.model.setAnchors(pair,false);s.selectedKeys=[pair[0]];const before=pair.map(k=>k.x);
  s.moveKeys(.25,0,{preventDefault(){},stopPropagation(){}});
  return {widths:pair.map(k=>k.width).sort((a,b)=>a-b),delta:pair.map((k,i)=>k.x-before[i]),error:s.plate.error};
 });});
 expect(moved.widths).toEqual([1.25,6.25]);for(const delta of moved.delta)expect(delta).toBeCloseTo(.25,6);expect(moved.error).toBe('');
});
test('PCB menu adds the large bottom modifier and both L-shaped compatibility caps',async({page})=>{
 await open(page);
 for(const [name,w,h,x2]of [['1.25u bottom row larger variant',1.25,1,0],['2u vertical horizontal',1,2,0],['2u reversed vertical horizontal',1,2,-1]]){
  await page.getByRole('button',{name:'Add MX PCB Mount',exact:true}).click();await page.getByRole('link',{name,exact:true}).click();
  const key=await page.evaluate(()=>{const k=angular.element(document.body).scope().selectedKeys[0];return {w:k.width,h:k.height,x2:k.x2};});
  expect(key).toEqual({w,h,x2});
 }
});

test('stabilizers have three categories and separate mount types and every pattern can be selected without changing source',async({page})=>{
 await open(page);
 const category=page.getByLabel('Stabilizer category',{exact:true});
 await expect(category.locator('option')).toHaveText(['Alps','MX','Topre']);
 await page.getByLabel('Stabilizer action').selectOption('replace');
 for(const id of ['alps','mx-pcb','mx-plate','topre']){
  await selectStab(page,id);
  const patterns=page.getByLabel('Stabilizer hole',{exact:true});
  await expect(patterns).toBeVisible();
  const values=await scopeRead(page,()=>angular.element(document.body).scope().plate.stabPatterns());
  expect(values.length).toBeGreaterThan(0);
  for(const value of values){await patterns.selectOption({label:value.label});expect(await scopeRead(page,()=>angular.element(document.body).scope().plate.stabChoice)).toBe(value.id);await expect(patterns.locator('option:checked')).toHaveText(value.label);}
 }
 expect(await scopeRead(page,()=>Object.values(angular.element(document.body).scope().plate.model.settings).some(c=>c.profile))).toBe(false);
 await page.getByLabel('Stabilizer action').selectOption('none');
 expect(await scopeRead(page,()=>angular.element(document.body).scope().plate.stabChoice)).toBe('none');
 await page.getByLabel('Stabilizer action').selectOption('original');
 expect(await scopeRead(page,()=>angular.element(document.body).scope().plate.stabChoice)).toBe('original');
 await expect(page.getByLabel('Stabilizer hole',{exact:true})).toHaveCount(0);
});

test('selecting recognized keys populates independent switch and support controls without edits',async({page})=>{
 await open(page);
 await page.locator('#keyboard').getByText('Key 3',{exact:true}).click();
 await expect(page.getByLabel('Switch profile',{exact:true})).toHaveValue('mx');
 await expect(page.getByLabel('Stabilizer type',{exact:true}).locator('option:checked')).toHaveText('PCB mount');
 await expect(page.getByLabel('Stabilizer hole',{exact:true}).locator('option:checked')).toHaveText('PCB mount 2u');
 expect(await scopeRead(page,()=>Object.values(angular.element(document.body).scope().plate.model.settings).some(c=>c.profile))).toBe(false);
 await page.getByRole('button',{name:'Apply to selected keys',exact:true}).click();
 expect(await scopeRead(page,()=>Object.values(angular.element(document.body).scope().plate.model.settings).some(c=>c.profile))).toBe(false);
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download edited DXF'}).click();
 expect(fs.readFileSync(await(await pending).path()).equals(Buffer.from(makeFixture()))).toBe(true);
 await page.locator('#keyboard').getByText('Key 4',{exact:true}).click();
 await expect(page.getByLabel('Switch profile',{exact:true})).toHaveValue('alps');
 await expect(page.getByLabel('Stabilizer action')).toHaveValue('none');
 await expect(page.getByLabel('Switch profile',{exact:true}).locator('option')).not.toContainText(['PCB mount ANSI-ISO']);
});

test('every stabilizer menu pattern applies, resizes when needed and exports through the UI',async({page})=>{
 test.setTimeout(120000);await open(page);
 await page.locator('#keyboard').getByText('Key 3',{exact:true}).click();
 const groups=await page.evaluate(()=>window.PlateProfiles.stabilizerCategories);
 for(const group of groups){
  await selectStab(page,group.id);
  const holes=await page.evaluate(()=>angular.element(document.body).scope().plate.stabPatterns());
  for(const pattern of holes){
   // Generic wires work from a compatible cap size; named patterns must fit themselves.
   await page.evaluate(()=>{const s=angular.element(document.body).scope();s.$apply(()=>{s.selectedKeys[0].width=s.selectedKeys[0].width2=2;});});
   await page.getByLabel('Stabilizer hole',{exact:true}).selectOption({label:pattern.label});
   await page.getByRole('button',{name:'Apply to selected keys',exact:true}).click();
   const state=await page.evaluate(()=>{const s=angular.element(document.body).scope(),k=s.selectedKeys[0];return {error:s.plate.error,profile:s.plate.model.settings[k._plateId].profile,bytes:s.plate.model.exportFile(s.keys()).length,width:k.width};});
   expect(state.error,group.id+'/'+pattern.id).toBeFalsy();expect(state.profile.options.stabilizer).toBe(pattern.id);expect(state.bytes).toBeGreaterThan(0);
   if(pattern.id==='alps-7-all')expect(state.width).toBe(7);
  }
 }
});

test('manual 7u replacement keeps its centre and undo restores cap and cutouts',async({page})=>{
 await open(page);await page.locator('#keyboard').getByText('Key 3',{exact:true}).click();
 const before=await page.evaluate(()=>{const s=angular.element(document.body).scope();return {key:JSON.parse(JSON.stringify(s.selectedKeys[0])),center:s.plate.model.physical(s.selectedKeys[0]),settings:s.plate.model.snapshot()};});
 await selectStab(page,'alps');
 await page.getByLabel('Stabilizer hole',{exact:true}).selectOption({label:'7u all stabs'});
 await page.getByRole('button',{name:'Apply to selected keys',exact:true}).click();
 const after=await page.evaluate(()=>{const s=angular.element(document.body).scope();return {width:s.selectedKeys[0].width,center:s.plate.model.physical(s.selectedKeys[0]),error:s.plate.error};});
 expect(after.error).toBeFalsy();expect(after.width).toBe(7);expect(after.center.center.x).toBeCloseTo(before.center.center.x,6);expect(after.center.center.y).toBeCloseTo(before.center.center.y,6);
 await page.evaluate(()=>{const s=angular.element(document.body).scope();s.$apply(()=>s.undo());});
 const restored=await page.evaluate(()=>{const s=angular.element(document.body).scope();return {width:s.keys().find(k=>k._plateId==='key-003')?.width,settings:s.plate.model.snapshot()};});
 expect(restored.settings).toEqual(before.settings);
 expect(await page.evaluate(id=>angular.element(document.body).scope().keys().find(k=>k._plateId===id).width,before.key._plateId)).toBe(before.key.width);
});

test('choosing another pattern discards inherited measurements without editing the plate',async({page})=>{
 await open(page);await page.locator('#keyboard').getByText('Key 3',{exact:true}).click();
 await page.evaluate(()=>{const s=angular.element(document.body).scope();s.$apply(()=>Object.assign(s.plate.options,{spacing:114.3,pcbWidth:9,slotWidth:5,axis:'vertical',forceStabilizer:true,stemOffset:12}));});
 await selectStab(page,'alps');
 const state=await page.evaluate(()=>{const s=angular.element(document.body).scope();return {options:s.plate.options,settings:s.plate.model.snapshot()};});
 expect(state.options.spacing).toBeUndefined();expect(state.options.pcbWidth).toBeUndefined();expect(state.options.slotWidth).toBeUndefined();expect(state.options.axis).toBe('auto');expect(state.options.stemOffset).toBe(0);expect(state.options.forceStabilizer).toBe(false);
 expect(Object.values(state.settings).some(s=>s.profile)).toBe(false);
});

test('Category Type Hole and collapsed Advanced keep orientation accessible for every family',async({page})=>{
 await open(page);await page.locator('#keyboard').getByText('Key 3',{exact:true}).click();
 await selectStab(page,'alps');
 await expect(page.getByLabel('Stabilizer type').locator('option')).toHaveText(['Alps default']);
 const holes=page.getByLabel('Stabilizer hole').locator('option');
 await expect(holes).toContainText(['2u']);await expect(holes).not.toContainText(['AEK / common Alps','AT101']);
 await expect(page.getByLabel('Slot width (mm)')).not.toBeVisible();
 await expect(page.getByRole('button',{name:'North',exact:true})).toBeVisible();
 await page.locator('.plate-stab-advanced summary').click();await expect(page.getByLabel('Slot width (mm)')).toBeVisible();
 await page.getByLabel('Stabilizer hole').selectOption({label:'7u all stabs'});
 await expect(page.getByRole('button',{name:'North',exact:true})).toBeVisible();
 await selectStab(page,'mx-pcb');await expect(page.getByLabel('Stabilizer type').locator('option')).toHaveText(['PCB mount','Plate mount']);
 await expect(page.getByLabel('Housing clearance width (mm)')).not.toBeVisible();
 await selectStab(page,'topre');await expect(page.getByLabel('Stabilizer type').locator('option')).toHaveText(['Topre']);
 await expect(page.getByRole('button',{name:'North',exact:true})).toBeVisible();
});
