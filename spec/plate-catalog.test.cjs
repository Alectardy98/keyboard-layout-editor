const {test}=require('node:test'),assert=require('node:assert/strict');
const P=require('../plate/profiles'),G=require('../plate/geometry'),Guess=require('../plate/guess');
const area=polys=>P.rings(polys).reduce((n,p)=>n+Math.abs(G.area(p)),0);
test('hole and Add catalogues share names, numeric order and generated geometry',()=>{
 for(const t of P.holeTypes){let last=0;const names=new Set();
  for(const h of t.holes){assert.match(h.label,/^\d+(\.\d+)?u /);assert.ok(h.size>=last);last=h.size;assert.ok(!names.has(h.label),h.label);names.add(h.label);
   const add=P.addMenus[t.id].find(a=>a.hole===h.id);assert.equal(add.label,h.label);
   const p=P.menuPreset(add.id,add.hole),o={components:true,switch:P.componentOptions(p.options).switch,stabilizer:h.id,mount:t.id==='mx-pcb'?'pcb':'plate',direction:'south',mxPattern:'cherry',axis:'auto',stemOffset:0,fitStandardHole:['alps-default','mx','costar'].includes(h.id),...P.holeDefaults(h.id,t.id)};
   const replacement=P.replacement(o,{width:1,height:1,width2:1,height2:1}),a=P.generate(p.options,p.key),b=P.generate(replacement.options,replacement.key);
   assert.ok(area(P.clip.difference(a,b))+area(P.clip.difference(b,a))<.001,t.id+'/'+h.id);
  }
 }
});
test('approximate shape matches tolerate a slightly oversized MX core without changing it',()=>{
 const contour={points:G.rectangle(14.6,14.6)},before=JSON.stringify(contour),matches=Guess.find([contour]);
 assert.ok(matches.length);assert.ok(matches[0].score>.85);assert.equal(JSON.stringify(contour),before);
 assert.deepEqual(Guess.find([{points:G.rectangle(3,3)}]),[]);
});

test('accepted guesses preserve DXF records and survive project restore',()=>{
 const D=require('../plate/dxf'),R=require('../plate/recognize'),M=require('../plate/document'),S=require('../serial');
 const points=G.rectangle(14.6,14.6,{x:40,y:20});
 const text='0\nSECTION\n2\nENTITIES\n0\nLWPOLYLINE\n8\nCUT\n90\n4\n70\n1\n'+points.map(p=>'10\n'+p.x+'\n20\n'+p.y+'\n').join('')+'0\nENDSEC\n0\nEOF\n';
 const d=D.parse(text,'guess',{units:'mm'}),r=R.analyze(d),m=M.create(d,r),g=Guess.find(d.contours)[0],ids=m.selectableContours();
 const k=m.addFromContours(ids,S.defaultKeyProps,g.key.width,g.key.height,g.label,{center:g.center,angle:g.angle});
 assert.equal(Buffer.from(m.exportFile([k])).toString(),text);assert.deepEqual(m.selectableContours(),[]);
 const fresh=M.create(d,r);fresh.restore(m.snapshot());assert.deepEqual(fresh.physical(k),m.physical(k));assert.equal(Buffer.from(fresh.exportFile([k])).toString(),text);
 assert.deepEqual(Guess.find([{points:G.arc({x:0,y:0},7,0,Math.PI*2),parts:[{type:'CIRCLE'}]}]),[]);
});
