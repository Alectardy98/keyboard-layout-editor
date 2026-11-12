// Synthetic dimensional fixture; no user plate files are bundled with the site.
const G=require('../plate/geometry.js');
function makeFixture({units=4,version='AC1015',z=0,unknown=false,outlineWidth=105}={}) {
 let next=16;const tag=pairs=>pairs.flat().join('\n')+'\n';
 const rect=(w,h,x,y,layer='CUT',angle=0)=>tag([0,'LWPOLYLINE',5,(next++).toString(16),100,'AcDbEntity',8,layer,100,'AcDbPolyline',90,4,70,1,38,z,
  ...G.rectangle(w,h,{x,y},angle).flatMap(p=>[10,p.x,20,p.y])]);
 let entities=rect(outlineWidth,70,30,-15,'OUTLINE')+
  tag([0,'CIRCLE',5,(next++).toString(16),8,'MOUNTS',10,-15,20,12,30,0,40,1.5]);
 const width=unknown?13.5:14;
 entities+=rect(width,width,0,0)+rect(width,width,19.05,0)+rect(width,width,47.625,0)+rect(15.5,12.8,0,-19.05);
 entities+=rect(7,15,47.625-11.9,-1.5)+rect(7,15,47.625+11.9,-1.5);
 return tag([0,'SECTION',2,'HEADER',9,'$ACADVER',1,version,9,'$INSUNITS',70,units,9,'$HANDSEED',5,'100',0,'ENDSEC',0,'SECTION',2,'ENTITIES'])+entities+tag([0,'ENDSEC',0,'EOF']);
}
module.exports={makeFixture};
