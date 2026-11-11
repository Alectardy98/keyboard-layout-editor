const {test}=require('node:test');
const assert=require('node:assert/strict');
const library=require('../layout-library.js');
const create=(document,id,name)=>library.apply(document,{type:'create',id,name});

test('30-item navigation reaches every saved layout and clamps after filtering',()=>{
 const layouts=Array.from({length:117},(_,i)=>({id:String(i),description:'Layout '+String(i+1).padStart(3,'0')}));
 const document=library.empty();
 assert.equal(library.view(layouts,document,'all','',1,30).items.length,30);
 const last=library.view(layouts,document,'all','',99,30);
 assert.equal(last.page,4);assert.equal(last.pages,4);assert.equal(last.first,91);assert.equal(last.last,117);
 assert.equal(last.items.length,27);
 const searched=library.view(layouts,document,'all','LAYOUT 117',4,30);
 assert.equal(searched.page,1);assert.equal(searched.total,1);assert.equal(searched.items[0].id,'116');
 assert.equal(library.view([],document,'all','',1,30).first,0);
});

test('folder creation, rename, movement and removal preserve the input and layout IDs',()=>{
 const original=library.empty(), before=library.serialize(original);
 let document=create(original,'folder-ibm',' IBM ');
 document=library.apply(document,{type:'move',layout:'layout-42',folder:'folder-ibm'});
 assert.equal(document.layouts['layout-42'],'folder-ibm');
 document=library.apply(document,{type:'rename',id:'folder-ibm',name:'Model F'});
 assert.equal(document.folders[0].name,'Model F');assert.equal(document.layouts['layout-42'],'folder-ibm');
 const items=[{id:'layout-42',description:'F AT'},{id:'layout-99',description:'Another'}];
 assert.equal(library.view(items,document,'folder-ibm','',1,30).total,1);
 assert.equal(library.view(items,document,'unfiled','',1,30).items[0].id,'layout-99');
 const unfiled=library.apply(document,{type:'move',layout:'layout-42',folder:''});
 assert.deepEqual(Object.keys(unfiled.layouts),[]);
 document=library.apply(document,{type:'remove',id:'folder-ibm'});
 assert.deepEqual(document.folders,[]);assert.deepEqual(Object.keys(document.layouts),[]);
 assert.equal(library.serialize(original),before);
});

test('invalid names and unknown folders are rejected before writing metadata',()=>{
 let document=create(library.empty(),'folder-a','IBM');
 for(const name of ['', '   ', 'iBm', 'x'.repeat(65),'bad\nname'])
  assert.throws(()=>create(document,'folder-b',name));
 assert.doesNotThrow(()=>create(document,'folder-b','x'.repeat(64)));
 assert.throws(()=>library.apply(document,{type:'move',layout:'123',folder:'folder-missing'}));
 assert.throws(()=>library.apply(document,{type:'rename',id:'folder-missing',name:'New'}));
 document=create(document,'folder-accent','Café');
 assert.throws(()=>create(document,'folder-accent-2','Cafe\u0301'));
});

test('unsupported, corrupt, oversized and inconsistent metadata is never reinterpreted',()=>{
 for(const content of ['', '{', '{}', JSON.stringify({...library.empty(),version:2}),
  JSON.stringify({...library.empty(),layouts:{abc:'folder-missing'}}), ' '.repeat(262145)])
  assert.throws(()=>library.parse(content));
 const valid=create(library.empty(),'folder-a','IBM');
 assert.equal(library.serialize(library.parse(library.serialize(valid))),library.serialize(valid));
 assert.throws(()=>library.parse(JSON.stringify({...valid,folders:[...valid.folders,...valid.folders]})));
});

test('special property names cannot affect the Object prototype or overwrite layouts',()=>{
 let document=create(library.empty(),'folder-a','__proto__');
 document=library.apply(document,{type:'move',layout:'__proto__',folder:'folder-a'});
 const restored=library.parse(library.serialize(document));
 assert.equal(restored.layouts.__proto__,'folder-a');assert.equal(Object.getPrototypeOf(restored.layouts),null);
 assert.equal({}.polluted,undefined);
 assert.equal(library.file.endsWith('.kbd.json'),false);
});
