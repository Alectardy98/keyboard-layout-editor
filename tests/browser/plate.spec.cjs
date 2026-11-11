const {test,expect}=require('@playwright/test');const fs=require('node:fs');
const D=require('../../plate/dxf'),R=require('../../plate/recognize');const {makeFixture}=require('../../spec/plate-fixture.cjs');
async function open(page,source=makeFixture()) {
 await page.goto('plate.html');await expect(page.getByRole('heading',{name:'Plate editor',exact:true})).toBeVisible();
 const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Open DXF plate',exact:true}).click();
 await(await chooser).setFiles({name:'synthetic.dxf',mimeType:'application/dxf',buffer:Buffer.from(source)});
 await expect(page.locator('#keyboard .keycap')).toHaveCount(4);
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
 await open(page);await page.getByLabel('Switch profile',{exact:true}).selectOption('alps');await page.getByLabel('Stabilizer style',{exact:true}).selectOption('mx');
 await page.getByRole('button',{name:'North',exact:true}).click();await page.getByRole('button',{name:'PCB mount',exact:true}).click();
 expect(await scopeRead(page,()=>Object.values(angular.element(document.body).scope().plate.model.settings).some(c=>c.profile))).toBe(false);
 await page.getByRole('button',{name:'Apply to all editable keys',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'Applied to 4 keys'})).toBeVisible();
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download edited DXF'}).click();const output=D.parse(fs.readFileSync(await(await pending).path()),'result.dxf');
 expect(R.analyze(output).counts.alps).toBe(4);expect(output.source).toContain('MOUNTS');
 await page.getByRole('button',{name:/Undo$/}).click();expect(await scopeRead(page,()=>Object.values(angular.element(document.body).scope().plate.model.settings).some(c=>c.profile))).toBe(false);
 await page.getByRole('button',{name:/Redo$/}).click();expect(await scopeRead(page,()=>Object.values(angular.element(document.body).scope().plate.model.settings).every(c=>c.profile))).toBe(true);
 await page.getByLabel('Stabilizer style',{exact:true}).selectOption('alps');await expect(page.getByLabel('Alps keycap family')).toBeVisible();
 await page.getByLabel('Stabilizer style',{exact:true}).selectOption('costar');await expect(page.getByRole('button',{name:'South',exact:true})).toBeVisible();
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
 await expect(page.getByRole('button',{name:'Add MX Keys',exact:true})).toBeDisabled();
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
