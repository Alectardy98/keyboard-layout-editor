// Boolean ownership for keys sharing a cut contour or a plate-edge notch.
// Source records remain byte-exact until a confirmed candidate is edited.
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./geometry'),require('./profiles'));
 else root.PlateOverlaps=factory(root.PlateGeometry,root.PlateProfiles);
}(typeof globalThis!=='undefined'?globalThis:this,function(G,P){
 'use strict';
 const polygon=p=>[P.polygon(p)];
 function circle(a,b,c){
  const ax=b.x-a.x,ay=b.y-a.y,bx=c.x-a.x,by=c.y-a.y,den=2*(ax*by-ay*bx);
  if(Math.abs(den)<1e-8)return null;
  const aa=ax*ax+ay*ay,bb=bx*bx+by*by;
  const center={x:a.x+(by*aa-ay*bb)/den,y:a.y+(ax*bb-bx*aa)/den};
  return {center,radius:G.distance(center,a)};
 }
 function material(loop,keys){return keys.filter(k=>G.contains(loop.points,k.center)).length>=3;}
 function create(loop,keys,isMaterial){
  const source=polygon(loop.points),boxes=keys.map(k=>polygon(G.rectangle(k.core.width,k.core.height,k.center,k.holeAngle)));
  const portions=boxes.map(box=>isMaterial?P.clip.difference(box,source):P.clip.intersection(box,source));
  const fixedCircles=[],points=loop.points;
  // Surviving circular arcs can reveal a mounting hole crossing a switch.
  // Reject switch corner fillets (their centres lie inside a core), short arcs,
  // poor fits and circles not intersecting a core. No filename/profile table.
  for(let i=0;i<points.length;i++)for(const count of [13,9,7,4]){
   const run=Array.from({length:count},(_,j)=>points[(i+j)%points.length]);
   const c=circle(run[0],run[Math.floor(count/2)],run[count-1]);if(!c||c.radius<.7||c.radius>10)continue;
   if(run.some(p=>Math.abs(G.distance(c.center,p)-c.radius)>.025))continue;
   let sweep=0;for(let j=1;j<run.length;j++)sweep+=2*Math.asin(Math.min(1,G.distance(run[j-1],run[j])/(2*c.radius)));
   if(sweep<.7||sweep>Math.PI*1.8)continue;
   if(boxes.some(box=>G.contains(box[0][0].slice(0,-1).map(p=>({x:p[0],y:p[1]})),c.center)))continue;
   const error=Math.max(...run.map(p=>Math.abs(G.distance(c.center,p)-c.radius)));
   const previous=fixedCircles.findIndex(q=>G.distance(q.center,c.center)<.1&&Math.abs(q.radius-c.radius)<.1);
   if(previous>=0 && fixedCircles[previous].error<=error)continue;
   const shape=polygon(G.arc(c.center,c.radius,0,G.TAU));
   if(!boxes.some(box=>P.clip.intersection(box,shape).length))continue;
   if(previous>=0)fixedCircles[previous]={...c,shape,error};else fixedCircles.push({...c,shape,error});
  }
  // Parallel edges of a narrow channel remain fixed through a switch.
  // Extend only observed edge pairs adjacent to a core, and clip to the
  // original opening below. This also covers straight flex slots at an edge.
  const fixedChannels=[];
  for(const key of keys)for(const turn of [0,Math.PI/2]){
   const angle=key.holeAngle+turn,local=points.map(p=>G.rotate(p,-angle,key.center));
   const edges=[];
   local.forEach((a,i)=>{const b=local[(i+1)%local.length];
    if(Math.abs(a.y-b.y)<.015 && Math.abs(a.x-b.x)>=1)
     edges.push({y:(a.y+b.y)/2,lo:Math.min(a.x,b.x),hi:Math.max(a.x,b.x)});
   });
   const width=turn?key.core.height:key.core.width,height=turn?key.core.width:key.core.height;
   for(let i=0;i<edges.length;i++)for(let j=i+1;j<edges.length;j++){
    const a=edges[i],b=edges[j],h=Math.abs(a.y-b.y),lo=Math.max(a.lo,b.lo),hi=Math.min(a.hi,b.hi);
    if(h<.3||h>height/2||hi-lo<1)continue;
    const y=(a.y+b.y)/2;
    if(Math.abs(y-key.center.y)+h/2>=height/2)continue;
    const left=key.center.x-width/2,right=key.center.x+width/2;
    // Evidence must be outside the core and touch its boundary.
    if(!((hi<=left+.06&&hi>=left-.06)||(lo>=right-.06&&lo<=right+.06)))continue;
    const x1=Math.min(lo,left),x2=Math.max(hi,right);
    const shape=polygon(G.rectangle(x2-x1,h,{x:(x1+x2)/2,y}).map(p=>G.rotate(p,angle,key.center)));
    fixedChannels.push({shape});
   }
  }
  let fixed=isMaterial?P.clip.union(source,...portions):P.clip.difference(source,...boxes);
  for(const c of fixedCircles.concat(fixedChannels)){
   // Never invent opening area outside the observed source geometry.
   const cut=isMaterial?P.clip.difference(c.shape,source):P.clip.intersection(c.shape,source);
   fixed=isMaterial?P.clip.difference(fixed,cut):P.clip.union(fixed,cut);
  }
  return {loop,keys,isMaterial,source,portions,fixed,fixedCircles,fixedChannels,
   compose:function(shapes){return isMaterial?P.clip.difference(fixed,...shapes):P.clip.union(fixed,...shapes);}};
 }
 return {create,material};
}));
