const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
require('../extensions.js');
const serial=require('../serial.js'),adapter=require('../vial-document.js');
const fixture=name=>JSON.parse(fs.readFileSync(__dirname+'/fixtures/'+name+'-vial.json'));
function metadata(doc){const value=JSON.parse(JSON.stringify(doc));delete value.layouts.keymap;return value;}
test('real board definitions import and round trip with every firmware field preserved',()=>{
 for(const name of ['fat','f104','f50','4978']){
  const original=fixture(name);original.futureSettings={bytes:[1,2,255],mode:'unknown'};
  const opened=adapter.open(original);const edited=serial.deserialize(opened.rows);
  edited.keys[0].x+=.25;
  const exported=adapter.exportDocument(opened.document,serial.serialize(edited),serial);
  assert.deepEqual(metadata(exported),metadata(original));
  assert.equal(serial.deserialize(exported.layouts.keymap).keys[0].x,edited.keys[0].x);
  assert.deepEqual(original.futureSettings,{bytes:[1,2,255],mode:'unknown'});
 }
});
test('plain KLE input remains plain KLE and is not wrapped as Vial',()=>{
 const rows=[['Esc',{x:.5,w:2},'Space']];const value=adapter.open(rows);
 assert.equal(value.document,null);assert.deepEqual(value.rows,rows);assert.notEqual(value.rows,rows);
});
test('VIA definitions preserve menus, lighting, IDs and arbitrary metadata',()=>{
 const original={name:'VIA board',vendorId:'0x1234',productId:'0x5678',matrix:{rows:1,cols:2},
  menus:[{label:'Lighting',content:['id_qmk_rgb_matrix']}],lighting:'qmk_rgblight',
  layouts:{keymap:[['0,0','0,1']]}};
 const opened=adapter.open(original),keyboard=serial.deserialize(opened.rows);
 keyboard.keys[1].width=2;
 const output=adapter.exportDocument(opened.document,serial.serialize(keyboard),serial);
 assert.deepEqual(metadata(output),metadata(original));
 assert.equal(serial.deserialize(output.layouts.keymap).keys[1].width,2);
});
test('matrix bounds, missing coordinates and bad option tags block Vial export',()=>{
 const {document,rows}=adapter.open(fixture('f50'));
 assert.doesNotThrow(()=>adapter.exportDocument(document,rows,serial));
 for(const row of [[['100,0']],[['Esc']],[['0,0\n\n\n0,1']]])assert.throws(()=>adapter.exportDocument(document,row,serial));
 for(const matrix of [null,{rows:0,cols:2},{rows:1.2,cols:2},{rows:2,cols:'3'}])assert.throws(()=>adapter.open({matrix,layouts:{keymap:[['0,0']]}}));
 assert.throws(()=>adapter.open({name:'broken',layouts:{}}),/layouts.keymap/);
});
test('encoders, decals and physical-option tags survive intact',()=>{
 const doc={matrix:{rows:1,cols:1},layouts:{labels:[['Enter','ANSI','ISO']],keymap:[['0,0\n\n\n0,0'],[{y:1},'0,0\n\n\n0,1'],[{y:1},'3,1\n\n\n\n\n\n\n\n\ne']]}};
 const opened=adapter.open(doc);const rows=serial.serialize(serial.deserialize(opened.rows));
 assert.doesNotThrow(()=>adapter.exportDocument(opened.document,rows,serial));
 const exported=adapter.exportDocument(opened.document,rows,serial);assert.deepEqual(exported.layouts.labels,doc.layouts.labels);
});
test('metadata cloning cannot pollute the Object prototype or mutate the input',()=>{
 const doc=JSON.parse('{"__proto__":{"polluted":true},"matrix":{"rows":1,"cols":1},"layouts":{"keymap":[["0,0"]]},"customKeycodes":[{"name":"TEST","title":"TEST","shortName":"TEST"}]}');
 const opened=adapter.open(doc);const result=adapter.exportDocument(opened.document,opened.rows,serial);
 assert.equal({}.polluted,undefined);assert.deepEqual(result,doc);assert.notEqual(result.customKeycodes,doc.customKeycodes);
});
