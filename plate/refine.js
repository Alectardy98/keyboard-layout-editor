// Evidence-based refinement after all cutouts have been assembled. Geometry,
// stabilizer ownership and cap layout are separate decisions. Source entities
// are never regenerated here. Unresolved evidence is returned for review.
(function(root,factory){
    if(typeof module==='object'&&module.exports)module.exports=factory(require('./geometry'),require('./profiles'),require('./switch-families'));
    else root.PlateRefine=factory(root.PlateGeometry,root.PlateProfiles,root.PlateSwitchFamilies);
}(typeof globalThis!=='undefined'?globalThis:this,function(G,P,Families){
    'use strict';
    var pitch=19.05;
    function local(points,center,angle){return points.map(function(p){return G.rotate({x:p.x-center.x,y:p.y-center.y},-angle);});}
    function near(a,b,t){return Math.abs(a-b)<(t || .08);}
    function rectangleLike(points,w,h){
        var b=G.bounds(points),area=Math.abs(G.area(points));
        return near(b.width,w,.25)&&near(b.height,h,.25)&&area/(b.width*b.height)>.97;
    }
    function chamfered(points,wide){
        var b=G.bounds(points),w=b.width,h=b.height;
        if(!(wide?w>=31.8&&w<=32.8:w>=14.4&&w<=14.85)||h<13.8||h>14.3)return false;
        // A convex housing with four long flat sides; corner relief may be
        // chamfered or rounded. Not arbitrary similarly-sized rectangles.
        var p=G.simplifyRing(points,.02),sign=0;
        for(var i=0;i<p.length;i++){var a=p[i],c=p[(i+1)%p.length],d=p[(i+2)%p.length],cross=(c.x-a.x)*(d.y-c.y)-(c.y-a.y)*(d.x-c.x);
            if(Math.abs(cross)>.001){if(sign&&Math.sign(cross)!==sign)return false;sign=Math.sign(cross);}}
        if(p.length<6||p.length>80)return false;
        var coverage=[0,0,0,0];p.forEach(function(a,i){var c=p[(i+1)%p.length];
            if(near(a.x,c.x,.02)){if(near(a.x,b.minX,.02))coverage[0]+=Math.abs(c.y-a.y);if(near(a.x,b.maxX,.02))coverage[1]+=Math.abs(c.y-a.y);}
            if(near(a.y,c.y,.02)){if(near(a.y,b.minY,.02))coverage[2]+=Math.abs(c.x-a.x);if(near(a.y,b.maxY,.02))coverage[3]+=Math.abs(c.x-a.x);}
        });
        return coverage[0]>h-4.5&&coverage[1]>h-4.5&&coverage[2]>w-7&&coverage[3]>w-7;
    }
    function capPolygons(k){
        var rects=[{width:k.width,height:k.height,x2:0,y2:0}],shape=k.capShape;
        if(shape)rects.push({width:shape.width2,height:shape.height2,x2:shape.x2||0,y2:shape.y2||0});
        return rects.map(function(r){var offset=G.rotate({x:(r.x2+(r.width-k.width)/2)*pitch,y:-(r.y2+(r.height-k.height)/2)*pitch},k.capAngle);
            return G.rectangle(r.width*pitch-.08,r.height*pitch-.08,{x:k.center.x+offset.x,y:k.center.y+offset.y},k.capAngle);});
    }
    function intersects(a,b){
        return [a,b].every(function(poly){return poly.every(function(p,i){var q=poly[(i+1)%poly.length],axis={x:p.y-q.y,y:q.x-p.x};
            var aa=a.map(function(v){return v.x*axis.x+v.y*axis.y;}),bb=b.map(function(v){return v.x*axis.x+v.y*axis.y;});
            return Math.min(...aa)<Math.max(...bb)-1e-6&&Math.min(...bb)<Math.max(...aa)-1e-6;});});
    }
    function incompleteMxCandidate(k) {
        if(k.type!=='unknown'||k.recovered||k.family||k.contours.length!==1)return false;
        var c=k.contours[0],b=G.minimumBox(c.points);
        return Math.min(b.width,b.height)<13||Math.abs(G.area(c.points))/(b.width*b.height)<.65;
    }
    function run(document,keys,options){
        var issues=[],next=1,boxes=new Map(),bounds=new Map();keys.forEach(function(k){next=Math.max(next,Number(k.id?.slice(4) || 0)+1);});
        function issue(kind,message,key,contour){issues.push({kind:kind,message:message,key:key?.id,contour:contour?.id});}
        function boxFor(c){if(!boxes.has(c))boxes.set(c,G.minimumBox(c.points));return boxes.get(c);}
        function extent(c){if(!bounds.has(c))bounds.set(c,G.bounds(c.points));var b=bounds.get(c);return Math.max(b.width,b.height);}
        function allowed(c){return !options.layer||c.parts.every(function(p){return p.layer===options.layer;});}
        function owners(c){return keys.filter(function(k){return k.contours.includes(c)||k.stabilizers.includes(c);});}
        function add(c,center,type,width,angle){var k={id:'key-'+String(next++).padStart(3,'0'),center:center,type:type,width:width,height:1,capAngle:angle||0,holeAngle:angle||0,
            contours:[c],stabilizers:[],editable:c.editable,core:{width:type==='topre'?14.6:14,height:14}};keys.push(k);return k;}
        function neighbours(k,side){var a=k.capAngle;
            return keys.filter(function(n){var p=G.rotate({x:n.center.x-k.center.x,y:n.center.y-k.center.y},-a);return n!==k&&n.height===1&&near(n.capAngle,a,.001)&&Math.abs(p.y)<.1&&p.x*side>0;})
                .sort(function(a,b){return G.distance(k.center,a.center)-G.distance(k.center,b.center);});}
        // Learn a repeated Topre housing family from several complete cutouts,
        // not the drawing name or a single switch-sized mounting hole.
        var housings=[];
        document.contours.filter(allowed).forEach(function(c){
            if(extent(c)>48)return;
            var box=boxFor(c),a=box.angle;[a,a+Math.PI/2].some(function(angle){var pts=local(c.points,box.center,angle);
                if(!chamfered(pts,false))return false;housings.push({c:c,center:box.center,angle:angle});return true;});
        });
        var topography=housings.length>=4;
        if(topography){
            housings.forEach(function(h){var own=owners(h.c);if(own.length>1||own.some(function(k){return k.recovered||k.stabilizers.includes(h.c);}))return;
                var k=own[0]||add(h.c,h.center,'topre',1,0);k.type='topre';k.evidence='Repeated chamfered Topre housings';
            });
            document.contours.filter(allowed).forEach(function(c){if(owners(c).length||extent(c)>48)return;
                var box=boxFor(c);[box.angle,box.angle+Math.PI/2].some(function(a){if(!chamfered(local(c.points,box.center,a),true))return false;
                    // Orient the cap with the housing's long axis, normalized
                    // to the surrounding rows. Preserve the housing centre.
                    a=((a+Math.PI/2)%Math.PI+Math.PI)%Math.PI-Math.PI/2;
                    var k=add(c,box.center,'topre',2,a);k.label='Topre modifier';k.evidence='Chamfered wide housing plus repeated Topre switches';return true;});
            });
            keys.filter(function(k){return k.type==='topre'&&!k.stabilizers.length&&k.width<2;}).forEach(function(k){
                var supports=document.contours.filter(function(c){return allowed(c)&&!owners(c).length;}).map(function(c){var p=local(c.points,k.center,k.capAngle),b=G.bounds(p);return {c:c,b:b,rect:rectangleLike(p,13.7,14)};})
                    .filter(function(s){return s.rect&&Math.abs(s.b.cy)<.1&&near(Math.abs(s.b.cx),47.625,.15);});
                var left=supports.find(function(s){return s.b.cx<0;}),right=supports.find(function(s){return s.b.cx>0;});if(!left||!right)return;
                var sides=[-1,1].map(function(side){return neighbours(k,side).filter(function(n){return n.type==='topre';}).slice(0,2);});
                var sizes=sides.map(function(row){if(row.length<2)return null;var width=G.distance(row[0].center,row[1].center)/pitch;
                    if(![1,1.25,1.5,1.75].some(function(w){return near(w,width,.005);}))return null;
                    return {size:2*G.distance(k.center,row[0].center)/pitch-width,width:width,row:row};});
                if(sizes.some(function(s){return !s;})||!near(sizes[0].size,sizes[1].size,.01)||![6.25,7].some(function(w){return near(w,sizes[0].size,.01);})){
                    issue('stabilizers','Topre support pair found, but 6.25u versus 7u cap/stem alignment needs human review.',k);return;}
                k.width=Math.round(sizes[0].size*4)/4;k.stabilizers=[left.c,right.c];k.label='Topre '+k.width+'u';
                sizes.forEach(function(s){s.row.forEach(function(n){n.width=Math.round(s.width*4)/4;});});
                k.evidence='Topre housings, symmetric supports and matching modifier pitch on both sides';
            });
        }
        // A complete multi-part footprint can tolerate small CAD clearance
        // and fillet differences. Keep the strict recognizer's first choices;
        // only investigate unassigned/unknown assemblies here. Try the actual
        // drawing orientation, not just the four cardinal rotations.
        if(keys.filter(function(k){return k.type==='mx';}).length>=4){
            var footprints=Families.filter(function(f){return f.type==='mx'&&!f.legacy&&!f.presetOnly&&f.parts.length>1&&f.width>=5.5;});
            document.contours.filter(allowed).forEach(function(c){if(extent(c)>60)return;var own=owners(c);if(own.length>1||own.some(function(k){return k.type!=='unknown'||k.recovered;}))return;
                var box=boxFor(c);if(Math.min(box.width,box.height)<13||Math.max(box.width,box.height)>40)return;
                var candidates=[];
                footprints.forEach(function(f){[box.angle,box.angle+Math.PI/2,box.angle+Math.PI,box.angle+3*Math.PI/2].forEach(function(angle){
                    var b=G.bounds(c.points.map(function(p){return G.rotate(p,-angle);})),t=G.bounds(f.parts[0]);
                    if(!near(b.width,t.width,.28)||!near(b.height,t.height,.28))return;
                    var center=G.rotate({x:b.cx-t.cx,y:b.cy-t.cy},angle);
                    if(!options.matches(c.points,f.parts[0],center,angle,.28))return;
                    var supports=f.parts.slice(1).map(function(pattern){return document.contours.find(function(q){return q!==c&&allowed(q)&&!owners(q).length&&options.matches(q.points,pattern,center,angle,.28);});});
                    if(supports.some(function(q){return !q;})||new Set(supports).size!==supports.length)return;
                    candidates.push({f:f,center:center,angle:angle,supports:supports});
                });});
                if(!candidates.length)return;
                var unique=candidates.filter(function(v,i){return !candidates.slice(0,i).some(function(p){return G.distance(p.center,v.center)<.15&&p.f.width===v.f.width;});});
                if(unique.length>1){issue('stem-position','Several complete spacebar assemblies fit, with different stem positions. Research does not resolve the intended alternate layout.',own[0],c);return;}
                var v=unique[0],k=own[0]||add(c,v.center,'mx',v.f.width,v.angle);
                Object.assign(k,{center:v.center,type:'mx',width:v.f.width,height:v.f.height,capAngle:v.angle,holeAngle:v.angle,family:v.f.id,label:v.f.label,stabilizers:v.supports,evidence:'Complete assembly with bounded clearance/fillet variation'});
            });
        }
        // Standard clip housings are recognized by the complete generated
        // cut, allowing a measured extended switch band and corner fillets.
        // This covers wire spans rather than a catalogue entry for each size.
        document.contours.filter(allowed).forEach(function(c){if(extent(c)>220)return;var own=owners(c);if(own.some(function(k){return k.recovered||k.family||k.stabilizers.includes(c);})||own.length>1)return;
            var box=boxFor(c);if(Math.max(box.width,box.height)<40||Math.min(box.width,box.height)>16)return;
            [box.angle,box.angle+Math.PI/2,box.angle+Math.PI,box.angle+3*Math.PI/2].some(function(a){
                var pts=c.points.map(function(p){return G.rotate(p,-a);}),b=G.bounds(pts),span=b.width-8.4;
                var size=[3,4,4.5,5.5,6,6.25,7,8].find(function(w){return near(P.spacing('mx',w),span,.18);});if(!size||b.height<14.5||b.height>15.3)return false;
                var cy=b.maxY-7,cx=b.cx,top=pts.filter(function(p){return near(p.y,b.maxY,.02);});
                var lo=Math.min(...top.map(function(p){return p.x;})),hi=Math.max(...top.map(function(p){return p.x;}));
                var width=[14,23.525,25.90625].find(function(w){return near(hi-lo,w,.12);});if(!width)return false;
                var center=G.rotate({x:cx,y:cy},a),band=P.polygon(G.rectangle(width,14,{x:(lo+hi)/2-cx,y:0}));
                var profile={switch:'mx',stabilizer:'mx',mount:'plate',mxPattern:'legacy',spacing:P.spacing('mx',size)};
                var rings=P.rings(P.union(P.generate(profile,{width:size,height:1}).concat([band])));
                if(rings.length!==1||!options.matches(c.points,rings[0],center,a,.27))return false;
                var k=own[0]||add(c,center,'mx',size,a);Object.assign(k,{center:center,type:'mx',width:size,height:1,holeAngle:a,capAngle:a,label:size+'u plate mount stabilizer',
                    detectedStabilizer:{family:'mx-plate',spacing:P.spacing('mx',size),vertical:false},evidence:'Complete clip-housing and wire-channel model'});
                return true;
            });
        });
        // Resolve an L-shaped ANSI/ISO compatibility opening from two rows,
        // a real upper switch core and the occupied lower-left arm. Both row
        // neighbours must corroborate the cap instead of using its bbox.
        keys.filter(function(k){return k.type==='mx'&&!k.recovered&&!k.capShape&&k.contours.length===1;}).forEach(function(k){
            var c=k.contours[0],pts=local(c.points,k.center,0),b=G.bounds(pts);
            var upper=keys.some(function(n){return n!==k&&n.width===1&&near(n.center.x,k.center.x-23.8125)&&near(n.center.y,k.center.y);});
            var lower=keys.some(function(n){return n!==k&&n.width===1&&near(n.center.x,k.center.x-38.1)&&near(n.center.y,k.center.y-19.05);});
            if(b.width<33||b.width>40||b.height<32||b.height>36||!upper||!lower)return;
            if(![-5,0,5].every(function(x){return [-5,0,5].every(function(y){return G.contains(pts,{x:x,y:y})&&G.contains(pts,{x:x-7.14375,y:y-19.05});});})||G.contains(pts,{x:-19.05,y:0}))return;
            k.width=1.5;k.height=1;k.capAngle=0;k.capShape={width2:2.25,height2:1,x2:-.75,y2:1};k.label='PCB mount ANSI-ISO';k.evidence='Upper switch core, lower clearance arm and two matching rows';
        });
        // ISO and numpad Enter share a vertical wire. Distinguish them using
        // the half-row stagger to the left, including combined clip cutouts.
        keys.filter(function(k){return k.type==='mx'&&!k.capShape&&k.detectedStabilizer?.vertical&&k.height===2;}).forEach(function(k){
            if(!keys.some(function(n){return n!==k&&n.width===1&&near(n.center.x,k.center.x-21.43125)&&near(n.center.y,k.center.y-9.525);}))return;
            k.width=1.25;k.capAngle=0;k.capShape={width2:1.5,height2:1,x2:-.25,y2:0};k.label=k.detectedStabilizer.family==='mx-pcb'?'ISO PCB mount':'ISO plate mount';k.evidence='Vertical stabilizer and ISO row stagger';
        });
        // Run cap inference after every new footprint is known. Short wires
        // and Topre modifier housings support several cap widths.
        keys.filter(function(k){return !k.capShape&&k.height===1&&k.width>=2&&k.width<=2.75;}).forEach(function(k){
            var candidates=[-1,1].flatMap(function(side){var n=neighbours(k,side)[0];if(!n||n.width!==1)return [];var w=2*G.distance(n.center,k.center)/pitch-1;
                return [2,2.25,2.75].filter(function(size){return near(size,w,.01);});});
            if(new Set(candidates).size>1)issue('cap-size','Left and right neighbours imply different cap widths; the original estimate is retained for human review.',k);
            else if(candidates.length){k.width=candidates[0];if(k.type==='topre')k.label='Topre '+k.width+'u';}
            else if(!k.family&&(k.type==='topre'||k.detectedStabilizer))issue('cap-size','This short stabilizer/housing supports several cap widths; row spacing does not resolve which one.',k);
        });
        // Repetition alone is not switch evidence. On an otherwise identified
        // MX plate, narrow relief slots and triangular web cutouts cannot hold
        // a complete MX switch. Keep these outlines selectable for review,
        // rather than inserting fictitious keys between real switches.
        if(keys.filter(function(k){return k.type==='mx';}).length>=4){
            keys.slice().filter(incompleteMxCandidate).forEach(function(k){
                var c=k.contours[0];
                keys.splice(keys.indexOf(k),1);
                issue('unsupported-candidate','Repeated opening is too narrow or incomplete for the surrounding MX switches. Kept as unassigned geometry; review whether it is clearance or a different switch.',null,c);
            });
        }
        // Review is an explicit result, not a silently guessed profile.
        // References establish the supported families; they cannot determine
        // a designer's intended alternate layout from a clearance window alone.
        keys.filter(function(k){return k.type==='unknown';}).forEach(function(k){issue('switch-family','Repeated opening remains outside the researched MX, Alps and Topre families. Verify its switch type and stem centre.',k);});
        var caps=keys.map(function(k){return {k:k,polys:capPolygons(k)};});
        caps.forEach(function(a,i){caps.slice(i+1).forEach(function(b){
            if(G.distance(a.k.center,b.k.center)>(a.k.width+a.k.height+b.k.width+b.k.height)*pitch/2)return;
            if(a.polys.some(function(p){return b.polys.some(function(q){return intersects(p,q);});}))
                issue('cap-overlap','Inferred caps '+a.k.id+' and '+b.k.id+' overlap. Check cap size, orientation or alternate-layout ownership.',a.k);
        });});
        document.contours.filter(allowed).forEach(function(c){if(extent(c)>220)return;
            if(issues.some(function(i){return i.contour===c.id;})||owners(c).length||c.parts.every(function(p){return p.type==='CIRCLE';}))return;
            var box=boxFor(c),small=Math.min(box.width,box.height),large=Math.max(box.width,box.height);
            if(small<10||small>35||large>180||Math.abs(G.area(c.points))/(box.width*box.height)<.25)return;
            if(keys.filter(function(k){return G.contains(c.points,k.center);}).length>=2)return;
            if(!keys.some(function(k){return Math.abs(k.center.y-box.center.y)<10&&Math.abs(k.center.x-box.center.x)<large/2+3*pitch;}))return;
            issue('unmatched-opening','Opening does not match a complete researched footprint/assembly. It may be a switch, shared clearance or fixed feature; review ownership.',null,c);
        });
        return issues;
    }
    return {run:run,incompleteMxCandidate:incompleteMxCandidate,chamfered:chamfered,capPolygons:capPolygons,intersects:intersects};
}));
