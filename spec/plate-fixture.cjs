// Synthetic dimensional fixture; no user plate files are bundled with the site.
const G=require('../plate/geometry.js'),P=require('../plate/profiles.js');
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
function makePcbFixture(block=false){
 const rect=(w,h,x,y)=>G.rectangle(w,h,{x,y}),rings=[];
 const cx=250,cy=100;
 rings.push(rect(25.90625,14,cx+5.953125,cy));
 rings.push(rect(11.75625,16,cx-47.621875,cy+1),rect(7,16,cx+50,cy+1));
 rings.push(...P.rings(P.union([P.polygon(rect(14,14,cx+71.4375,cy)),P.polygon(rect(7,3,cx+71.4375-2.38125,cy+7.5))])));
 for(const n of [3.75,5,6.25])rings.push(rect(16.38125,14,cx-n*19.05+1.190625,cy));
 for(const n of [5,6.25,7.5])rings.push(rect(16.38125,14,cx+n*19.05-1.190625,cy));
 rings.push(rect(30,10,cx-25,cy+2)); // fixed relief, never a support
 if(block)rings.push(rect(14,14,cx,cy+15)); // cap above overlaps proposed space
 const text='0\nSECTION\n2\nENTITIES\n'+rings.map((p,i)=>'0\nLWPOLYLINE\n5\n'+(i+16).toString(16)+'\n8\nCUT\n90\n'+p.length+'\n70\n1\n'+p.map(q=>'10\n'+q.x+'\n20\n'+q.y+'\n').join('')).join('')+'0\nENDSEC\n0\nEOF\n';
 return text;
}
module.exports={makeFixture,makePcbFixture};
