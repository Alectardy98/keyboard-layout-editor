const {test}=require('node:test'),assert=require('node:assert/strict');
const P=require('../plate/profiles'),D=require('../plate/dxf'),R=require('../plate/recognize'),M=require('../plate/document'),S=require('../serial');
const {makeFixture}=require('./plate-fixture.cjs');

test('legacy presets normalize to a base switch and pattern without changing generated geometry',()=>{
 for(const preset of [...P.presets,...P.mxPresets,...P.toprePresets]){
  const p=P.preset(preset.id),o=P.componentOptions(p.options);
  assert.ok(['mx','alps','topre','ec11'].includes(o.switch),preset.id);
  assert.deepEqual(P.generate(o,p.key),P.generate(p.options,p.key),preset.id);
 }
});
test('all recognized imported components apply unchanged with byte-exact export',()=>{
 const bytes=makeFixture(),d=D.parse(bytes,'components',{units:'mm'}),r=R.analyze(d),m=M.create(d,r),keys=m.makeKeys(S.defaultKeyProps);
 for(const k of keys){const source=m.original[k._plateId],c=P.inferComponents(source);assert.notEqual(c.options.switch,'original');m.apply([k],c.options);assert.equal(m.settings[k._plateId].profile,null);}
 assert.deepEqual(Buffer.from(m.exportFile(keys)),Buffer.from(bytes));
});
test('an unknown opening remains imported and plain MX does not invent a mount type',()=>{
 const key={type:'unknown',width:1,height:1,contours:[],stabilizers:[],holeAngle:0,capAngle:0};
 assert.equal(P.inferComponents(key).options.switch,'original');assert.equal(P.inferComponents(key).options.stabilizer,'original');
 key.type='mx';key.center={x:0,y:0};key.contours=[{points:require('../plate/geometry').rectangle(14,14)}];const c=P.inferComponents(key);assert.equal(c.options.switch,'mx');assert.equal(c.options.stabilizer,'none');assert.equal(c.category,null);
});
test('integrated support patterns reject mismatched switch technology',()=>{
 for(const type of ['alps','original'])assert.throws(()=>P.generate({components:true,switch:type,stabilizer:'mx-ansi-iso'},{width:1.5,height:1}),/requires a MX switch/);
});
test('old saved profiles remain untouched when their normalized controls are reapplied',()=>{
 const d=D.parse(makeFixture(),'old',{units:'mm'}),m=M.create(d,R.analyze(d)),keys=m.makeKeys(S.defaultKeyProps),key=keys[0];
 m.apply([key],{switch:'mx',stabilizer:'mx',mount:'plate'});const before=JSON.stringify(m.settings[key._plateId].profile),bytes=m.exportFile(keys);
 m.apply([key],P.componentOptions(m.settings[key._plateId].profile.options));assert.equal(JSON.stringify(m.settings[key._plateId].profile),before);assert.deepEqual(m.exportFile(keys),bytes);
});

test('a recognized switch with an unexplained extension keeps imported support geometry',()=>{
 const G=require('../plate/geometry'),key={type:'mx',width:1,height:1,center:{x:0,y:0},holeAngle:0,capAngle:0,contours:[{points:G.rectangle(20,14)}],stabilizers:[]};
 const c=P.inferComponents(key);assert.equal(c.options.switch,'mx');assert.equal(c.options.stabilizer,'original');assert.equal(c.unrecognized,true);
});

test('rotated Topre support pairs retain the wide-span classification',()=>{
 const G=require('../plate/geometry');
 for(const angle of [0,Math.PI/2,.3]){
  const key={type:'topre',width:7,height:1,center:{x:0,y:0},holeAngle:angle,capAngle:angle,contours:[],stabilizers:[-1,1].map(side=>({points:G.rectangle(13.6,13.9,{x:side*57.15,y:0}).map(p=>G.rotate(p,angle))}))};
  assert.equal(P.inferComponents(key).options.stabilizer,'topre-7-wide');
 }
});

test('every menu pattern replaces imported geometry at each key rotation and exports',()=>{
 let count=0;
 for(const group of P.stabilizerCategories)for(const pattern of group.patterns)for(const rotation of [0,90,27])for(const type of ['mx','alps','topre']){
  const d=D.parse(makeFixture(),'replace',{units:'mm'}),m=M.create(d,R.analyze(d)),keys=m.makeKeys(S.defaultKeyProps),key=keys[1];
  if(['mx','costar','alps-default','alps-aek','alps-at101'].includes(pattern.id))key.width=key.width2=2;
  key.rotation_angle=rotation;const start=m.physical(key),before=structuredClone(keys);
  // A small imported cap must not prevent a deliberate size-specific replacement.
  const pending=P.replacement({components:true,switch:type,stabilizer:pattern.id,mount:group.id==='mx-pcb'?'pcb':'plate'},key);
  if(['mx','costar','alps-default','alps-aek','alps-at101'].includes(pattern.id))pending.key.width=pending.key.width2=2;
  m.apply([pending.key],pending.options);
  for(const field of ['width','height','width2','height2','x2','y2','stepped'])key[field]=pending.key[field];
  m.reconcile(before,keys);
  const end=m.physical(key);assert.ok(Math.hypot(end.center.x-start.center.x,end.center.y-start.center.y)<1e-6,pattern.id);
  const plan=m.plan(keys);assert.ok(plan.paths.some(p=>p.key===key._plateId),pattern.id);
  const exported=m.exportFile(keys);assert.ok(exported.length>0,pattern.id);
  const profile=m.settings[key._plateId].profile;assert.equal(profile.options.stabilizer,pattern.id);
  const again=m.exportFile(keys);assert.deepEqual(again,exported);count++;
 }
 assert.equal(count,P.stabilizerCategories.reduce((n,g)=>n+g.patterns.length,0)*9);
});

test('7u manual override changes the cap footprint but not the independent switch technology',()=>{
 const p=P.replacement({components:true,switch:'topre',stabilizer:'alps-7-all'},{width:2.25,height:1,width2:2.25,height2:1,x2:0,y2:0});
 assert.equal(p.key.width,7);assert.equal(p.key.width2,7);assert.equal(p.options.switch,'topre');
 assert.ok(P.generate(p.options,p.key).length);
});
