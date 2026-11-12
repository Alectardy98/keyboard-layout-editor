const {test}=require('node:test'),assert=require('node:assert/strict');
const P=require('../plate/profiles'),D=require('../plate/dxf'),R=require('../plate/recognize'),M=require('../plate/document'),G=require('../plate/geometry'),S=require('../serial');
const families=require('../plate/switch-families'),{makeFixture}=require('./plate-fixture.cjs');
const at=(shapes,x,y,angle=0)=>P.rings(P.place(shapes,{x,y},angle));
const from=(rings)=>D.parse(D.exportBytes(D.parse(makeFixture()),[],rings.map(points=>({points}))),'families.dxf');
const near=(a,b)=>assert.ok(Math.abs(a-b)<.001,`${a} != ${b}`);
function assembly(f,x=250,y=100,angle=0){
 const rings=at(f.parts.map(P.polygon),x,y,angle);
 if(f.rowPitch)rings.push(...at(f.parts.map(P.polygon),x+Math.cos(angle)*f.rowPitch,y+Math.sin(angle)*f.rowPitch,angle));
 if(f.neighbourPitch)for(const pitch of [f.neighbourPitch,f.neighbourPitch+19.05])rings.push(...at(P.generate({switch:'mx',stabilizer:'none'},{width:1,height:1}),x+Math.cos(angle)*pitch,y+Math.sin(angle)*pitch,angle));
 return rings;
}
test('measured MX and Topre families recognize complete assemblies at cardinal rotations',()=>{
 for(const f of families.filter(f=>!f.legacy&&!f.presetOnly))for(const angle of [0,Math.PI/2,Math.PI,3*Math.PI/2]){
  const d=from(assembly(f,250,100,angle)),r=R.analyze(d),k=r.keys.find(k=>k.family===f.id&&G.distance(k.center,{x:250,y:100})<6);
  assert.ok(k,`${f.id} at ${angle}`);assert.equal(k.type,f.type);assert.equal(k.stabilizers.length,f.parts.length-1);
  const m=M.create(d,r),keys=m.makeKeys(S.defaultKeyProps);assert.deepEqual(Buffer.from(m.exportFile(keys)),Buffer.from(D.exportBytes(d)));
  const p=P.preset(f.id);assert.equal(p.key.width,f.width);assert.equal(p.key.height,f.height);assert.equal(P.generate(p.options,p.key).length,f.parts.length);
 }
});
test('Topre modifiers infer cap width independently of the shared cutout',()=>{
 const f=families.find(f=>f.id==='topre-mod-dual'),one=families.find(f=>f.id==='topre-1');
 for(const width of [2,2.25,2.75,3,5.25]){
  const d=from([...assembly(f),...at(one.parts.map(P.polygon),250-(width+1)*19.05/2,100)]),k=R.analyze(d).keys.find(k=>k.family===f.id);
  assert.equal(k.width,width);
 }
});
test('Topre seven-unit row retains both square supports and its 1.5u modifiers',()=>{
 const f=families.find(f=>f.id==='topre-7'),one=families.find(f=>f.id==='topre-1'),offsets=[-6.75,-5.5,-4.25,4.25,5.5,6.75];
 const rings=assembly(f);offsets.forEach(n=>rings.push(...at(one.parts.map(P.polygon),250+n*19.05,100)));
 // Nearby round mounting hole is not part of the spacebar.
 rings.push(...at([P.polygon(G.arc({x:0,y:0},1.5,0,Math.PI*2))],240,110));
 const d=from(rings),r=R.analyze(d),space=r.keys.find(k=>k.family===f.id);
 assert.equal(space.width,7);assert.equal(space.stabilizers.length,2);
 offsets.forEach((n,i)=>assert.equal(r.keys.find(k=>Math.abs(k.center.x-250-n*19.05)<.001).width,i===1||i===4?1:1.5));
 const m=M.create(d,r),keys=m.makeKeys(S.defaultKeyProps),key=keys.find(k=>k._plateId===space.id),before=structuredClone(keys);
 key.x+=.25;m.reconcile(before,keys);
 const moved=R.analyze(D.parse(m.exportFile(keys))).keys.find(k=>k.family===f.id);near(moved.center.x,250+19.05/4);assert.equal(moved.stabilizers.length,2);
 assert.equal(D.parse(m.exportFile(keys.filter(k=>k!==key))).contours.length,d.contours.length-3);
});
test('reviewed MX families leave adjacent flex and mounting openings unassigned',()=>{
 const f=families.find(f=>f.id==='mx-space625-left-aligned');
 const d=from([...assembly(f),...at([P.polygon(G.rectangle(20,1))],250,113),...at([P.polygon(G.rectangle(3,2))],180,100)]),r=R.analyze(d),k=r.keys.find(k=>k.family===f.id);
 assert.equal(k.stabilizers.length,2);assert.ok(r.unassigned.some(c=>Math.abs(G.bounds(c.points).cy-113)<.001));
 const l=P.preset('mx-ansi-iso').key;assert.deepEqual([l.width,l.height,l.width2,l.height2,l.x2,l.y2],[1.5,1,2.25,1,-.75,1]);
 const isolated=from(assembly(families.find(f=>f.id==='mx-pcb225-option2')).slice(0,3));
 assert.equal(R.analyze(isolated).keys.some(k=>k.family==='mx-pcb225-option2'),false);
});
test('old plate projects retain the pre-family interpretation',()=>{
 const d=from(assembly(families.find(f=>f.id==='topre-1')));
 assert.equal(R.analyze(d).keys.find(k=>Math.abs(k.center.x-250)<.001).type,'topre');
 assert.notEqual(R.analyze(d,{legacyFamilies:true}).keys.find(k=>Math.abs(k.center.x-250)<.001)?.type,'topre');
 assert.equal(d.recognitionVersion,6);assert.equal(D.parse(d.source,'old',{legacyFamilies:true}).recognitionVersion,2);
});
// Four straight sides plus overlong corner arcs, as found in CAD exports.
function overrunCornerDXF(){
 const entity=(type,values)=>[0,type,8,'CUT',...values].join('\n')+'\n';
 let source='0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n';
 for(const [x,y,a,b]of [[-7,-6.5,-7,6.5],[7,-6.5,7,6.5],[-6.5,-7,6.5,-7],[-6.5,7,6.5,7]])source+=entity('LINE',[10,x,20,y,11,a,21,b]);
 for(const [x,y,start,end]of [[-6.5,-6.5,180,360],[6.5,-6.5,270,450],[6.5,6.5,0,180],[-6.5,6.5,90,270]])source+=entity('ARC',[10,x,20,y,40,.5,50,start,51,end]);
 return source+'0\nENDSEC\n0\nEOF\n';
}
module.exports={overrunCornerDXF};
test('overshooting corner joins recover a switch without rewriting original arcs',()=>{
 const source=overrunCornerDXF(),d=D.parse(source),r=R.analyze(d),m=M.create(d,r),keys=m.makeKeys(S.defaultKeyProps);
 assert.equal(r.keys.length,1);assert.equal(r.keys[0].cornerRecovery,true);assert.equal(Buffer.from(m.exportFile(keys)).toString(),source);
 assert.equal(m.plan(keys).paths.filter(p=>p.key&&!p.hitOnly).length,8);
 assert.equal(D.parse(source,'old',{legacyFamilies:true}).contours.length,0);
 assert.equal(R.analyze(D.parse(source.replace('11\n7\n','11\n8\n'))).keys.length,0);
 m.setAnchors(keys,false);const before=structuredClone(keys);keys[0].x+=1;m.reconcile(before,keys);
 const moved=D.parse(m.exportFile(keys));assert.equal(moved.primitives.filter(p=>p.type==='ARC').length,4);near(R.analyze(moved).keys[0].center.x,19.05);
});
test('joined unrecognized outlines supply a closed interior hit path',()=>{
 // Use ordinary LINE entities for a valid unknown rectangle.
 const rect='0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n'+[[0,0,30,0],[30,0,30,10],[30,10,0,10],[0,10,0,0]].map(([a,b,c,e])=>`0\nLINE\n8\nCUT\n10\n${a}\n20\n${b}\n11\n${c}\n21\n${e}\n`).join('')+'0\nENDSEC\n0\nEOF\n';
 const doc=D.parse(rect,'joined',{units:'mm'}),model=M.create(doc,R.analyze(doc)),preview=model.plan(model.makeKeys(S.defaultKeyProps)).paths;
 assert.equal(preview.length,1);assert.equal(preview[0].closed,true);assert.ok(preview[0].contour);
});
test('coincident Topre side records remain attached to a recovered complete opening',()=>{
 // Separate LINE segments approximate the measured footprint; one side occurs
 // three times. Degree-two joining alone must not guess through this branch.
 const line=(a,b)=>`0\nLINE\n8\nCUT\n10\n${a.x}\n20\n${a.y}\n11\n${b.x}\n21\n${b.y}\n`;
 // Use real arc/line geometry with 14.6 mm width and duplicated vertical side.
 let source=overrunCornerDXF().replaceAll('10\n7\n','10\n7.6\n').replaceAll('11\n7\n','11\n7.6\n').replaceAll('10\n6.5\n','10\n7.1\n').replaceAll('11\n6.5\n','11\n7.1\n');
 const duplicate=line({x:7.6,y:-6.5},{x:7.6,y:6.5});source=source.replace('0\nENDSEC\n0\nEOF\n',duplicate+duplicate+'0\nENDSEC\n0\nEOF\n');
 const d=D.parse(source),r=R.analyze(d),m=M.create(d,r),keys=m.makeKeys(S.defaultKeyProps);assert.equal(r.keys.length,1);assert.equal(r.keys[0].type,'topre');assert.equal(r.keys[0].contours[0].parts.length,10);
 assert.equal(Buffer.from(m.exportFile(keys)).toString(),source);m.setAnchors(keys,false);const before=structuredClone(keys);keys[0].x+=1;m.reconcile(before,keys);
 const moved=D.parse(m.exportFile(keys));assert.equal(moved.primitives.length,10);near(R.analyze(moved).keys[0].center.x,19.35);
});
test('alternate-stem bottom row aligns without gaps or overlaps and keeps legacy profiles',()=>{
 const bottom=families.find(f=>f.id==='mx-bottom125-aligned'),space=families.find(f=>f.id==='mx-space625-left-aligned');
 const rings=assembly(space);
 for(const offset of [-3.75,-5,-6.25])rings.push(...at(bottom.parts.map(P.polygon),250+offset*19.05,100));
 rings.push(...at(P.generate({switch:'mx',stabilizer:'none'},{width:1,height:1}),250+3.75*19.05,100));
 rings.push(...at(bottom.parts.map(P.polygon),250+5*19.05-2.38125,100));
 const d=from(rings),r=R.analyze(d),row=r.keys.filter(k=>Math.abs(k.center.y-100)<.001).sort((a,b)=>a.center.x-b.center.x);
 assert.deepEqual(row.map(k=>k.width),[1.25,1.25,1.25,6.25,1.25,1.25]);
 for(let i=1;i<row.length;i++)near(row[i-1].center.x+row[i-1].width*19.05/2,row[i].center.x-row[i].width*19.05/2);
 const m=M.create(d,r);assert.deepEqual(Buffer.from(m.exportFile(m.makeKeys(S.defaultKeyProps))),Buffer.from(D.exportBytes(d)));
 const legacy=R.analyze(d,{legacyAlignment:true}).keys.find(k=>k.family==='mx-space625-left');near(legacy.center.x,252.38125);
 const original=P.preset('mx-space625-left');assert.equal(original.options.switch,'mx-space625-left');
 assert.equal(D.parse(d.source,'old',{legacyAlignment:true}).recognitionVersion,3);
});
test('combined 2u PCB openings recognize at split-keyboard angles and move intact',()=>{
 const f=families.find(f=>f.id==='mx-pcb2-combined');
 for(const degrees of [-12,12,33]){
  const d=from(assembly(f,250,100,degrees*Math.PI/180)),r=R.analyze(d),key=r.keys.find(k=>k.family===f.id);assert.ok(key);near(key.center.x,250);near(key.center.y,100);assert.equal(key.width,2);
  const m=M.create(d,r),keys=m.makeKeys(S.defaultKeyProps),cap=keys.find(k=>k._plateId===key.id),before=structuredClone(keys);cap.x+=.25;m.reconcile(before,keys);
  const moved=R.analyze(D.parse(m.exportFile(keys))).keys.find(k=>k.family===f.id);near(G.distance(moved.center,m.physical(cap).center),0);
 }
});
test('broken 7 by 15 stabilizer joins recover as supports, not extra switches',()=>{
 const source=overrunCornerDXF().replace(/(10|11|20|21)\n(-?[\d.]+)\n/g,(full,code,value)=>{
  let v=Number(value);if(code==='10'||code==='11'){if(v>0)v-=7;v+=3.5;}else{if(v>0)v+=1;v-=.5;}return `${code}\n${v}\n`;
 });
 const raw=D.parse(source),rings=[...at([P.polygon(families.find(f=>f.id==='mx-pcb225-option2').parts[1])],-11.938,1.5),...at(P.generate({switch:'mx',stabilizer:'none'},{width:1,height:1}),-11.938,1.5)];
 for(const x of [-11.938-30.95625,-11.938-30.95625-19.05])rings.push(...at(P.generate({switch:'mx',stabilizer:'none'},{width:1,height:1}),x,1.5));
 const d=D.parse(D.exportBytes(raw,[],rings.map(points=>({points})))),r=R.analyze(d),key=r.keys.find(k=>Math.abs(k.center.x+11.938)<.001);assert.ok(key);assert.ok(key.width>=2);assert.equal(key.stabilizers.length,2);assert.ok(key.stabilizers.some(c=>c.cornerRecovery));
 const m=M.create(d,r);assert.deepEqual(Buffer.from(m.exportFile(m.makeKeys(S.defaultKeyProps))),Buffer.from(D.exportBytes(d)));
});
test('wide bottom-row openings detect as 1.25u on both rotated halves',()=>{
 const f=families.find(f=>f.id==='mx-bottom125-wide');
 for(const degrees of [-12,12]){
  const d=from(assembly(f,250,100,degrees*Math.PI/180)),r=R.analyze(d),key=r.keys.find(k=>k.family===f.id);
  assert.ok(key);assert.equal(key.width,1.25);assert.equal(key.height,1);assert.equal(key.label,'bottom row 1.25u');near(key.center.x,250);near(key.center.y,100);
  const m=M.create(d,r),keys=m.makeKeys(S.defaultKeyProps);assert.deepEqual(Buffer.from(m.exportFile(keys)),Buffer.from(D.exportBytes(d)));
 }
});
test('end-of-row inference accepts a 1.25u neighbour when another row confirms the edge',()=>{
 const unit=P.generate({switch:'mx',stabilizer:'none'},{width:1,height:1}),rings=[];
 for(const x of [250,273.8125,297.625])rings.push(...at(families.find(f=>f.id==='mx-bottom125-wide').parts.map(P.polygon),x,100));
 rings.push(...at(unit,321.4375,100));
 const f=families.find(f=>f.id==='mx-pcb2-combined');rings.push(...assembly(f,314.29375,138.1));
 const r=R.analyze(from(rings)),key=r.keys.find(k=>Math.abs(k.center.x-321.4375)<.001&&Math.abs(k.center.y-100)<.001);
 assert.equal(key.width,1.25);near(key.center.x+key.width*19.05/2,314.29375+19.05);
});
