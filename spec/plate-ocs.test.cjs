const {test}=require('node:test'),assert=require('node:assert/strict');
const D=require('../plate/dxf'),G=require('../plate/geometry'),R=require('../plate/recognize');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
const tags=a=>a.join('\n')+'\n';
const file=(entities,blocks='')=>tags([0,'SECTION',2,'HEADER',9,'$INSUNITS',70,4,0,'ENDSEC'])+blocks+tags([0,'SECTION',2,'ENTITIES'])+entities+tags([0,'ENDSEC',0,'EOF']);
const normal=[210,0,220,0,230,-1];
test('negative-Z planar entities reflect X, while LINE remains in world coordinates',()=>{
 const source=file(tags([0,'LWPOLYLINE',90,4,70,1,10,-43,20,13,10,-57,20,13,10,-57,20,27,10,-43,20,27,...normal,
  0,'LINE',10,10,20,10,11,20,21,10,...normal]));
 const d=D.parse(source),k=R.analyze(d).keys[0];near(k.center.x,50);near(k.center.y,20);
 assert.deepEqual(d.primitives[1].points,[{x:10,y:10},{x:20,y:10}]);
 assert.deepEqual(Buffer.from(D.exportBytes(d)),Buffer.from(source));
 const legacy=D.parse(source,'old',{legacyExtrusion:true});assert.equal(legacy.primitives.length,0);assert.equal(legacy.coordinateVersion,1);
});
test('negative-Z arc, circle and polyline rigid edits round-trip in physical coordinates',()=>{
 for(const entity of [tags([0,'ARC',10,-50,20,20,40,7,50,0,51,90,...normal]),tags([0,'CIRCLE',10,-50,20,20,40,7,...normal]),
  tags([0,'LWPOLYLINE',90,4,70,1,10,-43,20,13,10,-57,20,13,10,-57,20,27,10,-43,20,27,...normal])]){
  const d=D.parse(file(entity)),motion={from:{x:50,y:20},to:{x:80,y:60},angle:Math.PI/2};
  const moved=D.parse(D.exportBytes(d,[{record:d.raw.entities[0],motion}]));
  assert.equal(moved.primitives[0].points.length,d.primitives[0].points.length);
  // Circles have no angular start in DXF, so compare their bounds, not sampling order.
  if(d.primitives[0].type==='CIRCLE'){const b=G.bounds(moved.primitives[0].points);assert.ok(Math.abs(b.cx-80)<.005);assert.ok(Math.abs(b.cy-60)<.005);}
  else d.primitives[0].points.forEach((p,i)=>{const q=G.rotate(p,motion.angle,motion.from),n=moved.primitives[0].points[i];near(n.x,q.x+30);near(n.y,q.y+40);});
 }
});
test('negative-Z INSERT transforms block origin and children but remains read-only',()=>{
 const block=tags([0,'SECTION',2,'BLOCKS',0,'BLOCK',2,'hole',70,0,10,0,20,0,30,0,0,'CIRCLE',10,5,20,6,40,2,0,'ENDBLK',0,'ENDSEC']);
 const d=D.parse(file(tags([0,'INSERT',2,'hole',10,-50,20,20,...normal]),block));
 const b=G.bounds(d.primitives[0].points);assert.ok(Math.abs(b.cx-45)<.005);assert.ok(Math.abs(b.cy-26)<.005);assert.equal(d.primitives[0].editable,false);
});
test('tilted OCS geometry stays unmodified and is not projected into an editable plate',()=>{
 const d=D.parse(file(tags([0,'CIRCLE',10,50,20,20,40,7,210,0,220,1,230,0])));
 assert.equal(d.primitives.length,0);assert.equal(d.unsupported['Non-XY extrusion (not previewed)'],1);
});
