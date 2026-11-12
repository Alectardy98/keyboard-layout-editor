// PCB compatibility openings: recognize the switch band and support slots
// independently of cap size. Original contours, including rounded corners,
// remain the export source; only explicit profile replacement regenerates cuts.
(function(root,factory){
    if(typeof module==='object'&&module.exports)module.exports=factory(require('./geometry'),require('./profiles'),require('./refine'));
    else root.PlatePcbRefine=factory(root.PlateGeometry,root.PlateProfiles,root.PlateRefine);
}(typeof globalThis!=='undefined'?globalThis:this,function(G,P,F){
    'use strict';
    var pitch=19.05;
    function run(doc,keys,options){
        var next=1;keys.forEach(function(k){next=Math.max(next,Number(k.id.slice(4))+1);});
        var bounds=new Map(doc.contours.map(function(c){return [c,G.bounds(c.points)];}));
        function near(a,b,t){return Math.abs(a-b)<(t||.12);}
        function owned(c){return keys.filter(function(k){return k.contours.includes(c)||k.stabilizers.includes(c);});}
        function free(c){return c.editable&&(!options.layer||c.parts.every(function(p){return p.layer===options.layer;}))&&owned(c).every(function(k){return k.type==='unknown'&&!k.recovered;});}
        function rect(w,h,x,y){return P.polygon(G.rectangle(w,h,{x:x,y:y}));}
        function fit(c,ring){return options.matches(c.points,ring,{x:0,y:0},0,.53);}
        function claim(c,center,width,label,stabilizers){
            var k=owned(c)[0];if(!k){k={id:'key-'+String(next++).padStart(3,'0')};keys.push(k);}
            Object.assign(k,{center:center,type:'mx',width:width,height:1,capAngle:0,holeAngle:0,core:{width:14,height:14},contours:[c],stabilizers:stabilizers||[],editable:c.editable,label:label,compound:true,evidence:'PCB switch band and complete clearance geometry'});return k;
        }
        function implied(cx,cy){var sizes=[];
            for(const side of [-1,1]){var row=keys.filter(function(k){return k.type==='mx'&&k.width===1&&k.height===1&&near(k.center.y,cy)&&Math.abs(k.capAngle)<.002&&(k.center.x-cx)*side>0;}).sort(function(a,b){return Math.abs(a.center.x-cx)-Math.abs(b.center.x-cx);});
                if(row[0]){var w=2*Math.abs(row[0].center.x-cx)/pitch-1;[2,2.25,2.75].forEach(function(n){if(near(n,w,.015))sizes.push(n);});}}
            return new Set(sizes).size===1?sizes[0]:null;
        }
        if(!options.legacyRoundedPcb){
            // Rounded spline corners may fragment the straight-edge detector.
            // Match the complete 14mm boundary before treating them as MX.
            keys.forEach(function(k){
                if(k.type!=='unknown'||k.recovered||k.contours.length!==1)return;
                var c=k.contours[0],b=bounds.get(c);
                if(near(b.width,14,.08)&&near(b.height,14,.08)&&fit(c,G.rectangle(14,14,{x:b.cx,y:b.cy}))){
                    k.type='mx';k.center={x:b.cx,y:b.cy};k.capAngle=k.holeAngle=0;
                }
            });
            // A row-leading modifier must agree with the alpha pitch and the
            // left edge established by several other rows. Cuts remain fixed.
            var mx=keys.filter(function(k){return k.type==='mx'&&k.width===1&&k.height===1;});
            mx.forEach(function(k){
                var row=mx.filter(function(n){return near(n.center.y,k.center.y,.15);}).sort(function(a,b){return a.center.x-b.center.x;});
                if(row[0]!==k||row.length<4)return;
                var w=2*(row[1].center.x-k.center.x)/pitch-1;
                var size=[1.25,1.5,1.75].find(function(n){return near(n,w,.015);});if(!size)return;
                var edge=k.center.x-size*pitch/2;
                if(keys.filter(function(n){return n.type==='mx'&&n.height===1&&!near(n.center.y,k.center.y,.15)&&near(n.center.x-n.width*pitch/2,edge,.2);}).length<2)return;
                k.width=size;
            });
        }
        // Horizontal windows share a 14mm band and two PCB slots. Fit the
        // complete union, including fillet allowance, not merely its bounds.
        doc.contours.forEach(function(c){var b=bounds.get(c);if(!free(c)||b.width<30||b.width>49||b.height<15||b.height>22)return;
            var candidates=[];
            [b.minY+7,b.maxY-7].forEach(function(cy){
                [0,-1.190625,1.190625,-2.38125,2.38125,-3.571875,3.571875,-4.7625,4.7625,-5.953125,5.953125,-7.14375,7.14375].forEach(function(dx){
                    var cx=b.cx+dx,size=implied(cx,cy);
                    if(!size)return; // Reject unsupported positions before polygon unions.
                    [7,7.4,7.8,8,8.2,8.5,9].some(function(sw){var rings=P.rings(P.union([rect(b.width,14,b.cx,cy),rect(sw,b.height,cx-11.938,b.cy),rect(sw,b.height,cx+11.938,b.cy)]));
                        if(rings.length!==1||!fit(c,rings[0])){
                            var left=cx-11.938+sw/2,right=cx+11.938-sw/2;
                            rings=P.rings(P.union([rect(b.width,14,b.cx,cy),rect(left-b.minX,b.height,(left+b.minX)/2,b.cy),rect(b.maxX-right,b.height,(right+b.maxX)/2,b.cy)]));
                            if(rings.length!==1||!fit(c,rings[0]))return false;
                        }
                        candidates.push({cx:cx,cy:cy,size:size});return true;});
                });
            });
            var supported=candidates.filter(function(v){return v.size;});
            var unique=supported.filter(function(v,i){return !supported.slice(0,i).some(function(q){return near(q.cx,v.cx)&&near(q.cy,v.cy)&&q.size===v.size;});});
            if(unique.length!==1)return;var v=unique[0],k=claim(c,{x:v.cx,y:v.cy},v.size,v.size+'u PCB mount');
            k.detectedStabilizer={family:'mx-pcb',spacing:23.876,vertical:false};
        });
        // Split right Shift: both openings must fit the same two-slot model.
        doc.contours.forEach(function(c){var b=bounds.get(c);if(!free(c)||!near(b.width,23.525,.15)||b.height<15||b.height>20)return;
            [b.minY+7,b.maxY-7].some(function(cy){var cx=b.minX+16.525;
                return [7,7.4,7.8,8,8.2,8.5,9].some(function(sw){var rings=P.rings(P.union([rect(23.525,14,cx-4.7625,cy),rect(14,14,cx+16.66875,cy),rect(cx-11.938+sw/2-b.minX,b.height,(cx-11.938+sw/2+b.minX)/2,b.cy),rect(sw,b.height,cx+11.938,b.cy)]));
                    if(rings.length!==2)return false;var first=rings.find(function(r){return fit(c,r);});if(!first)return false;
                    var other=rings.find(function(r){return r!==first;}),second=doc.contours.find(function(q){return q!==c&&free(q)&&fit(q,other);});
                    if(!second)return false;claim(c,{x:cx,y:cy},2.75,'2.75u split PCB mount',[second]);return true;});
            });
        });
        // ANSI/ISO compatibility: the upper 14mm core, lower 14mm band,
        // empty upper-left corner and both adjacent rows must all agree.
        doc.contours.forEach(function(c){var b=bounds.get(c);if(!free(c)||b.width<34.8||b.width>36||b.height<32.8||b.height>35.5)return;
            var upper=keys.filter(function(k){return k.type==='mx'&&k.width===1&&near(k.center.x,b.minX+26.05-23.8125,.18)&&near(k.center.y,b.maxY-7,.18);});
            if(upper.length!==1)return;var center={x:upper[0].center.x+23.8125,y:upper[0].center.y};
            if(!keys.some(function(k){return k.type==='mx'&&k.width===1&&near(k.center.x,center.x-38.1,.18)&&near(k.center.y,center.y-19.05,.18);}))return;
            var pts=c.points.map(function(p){return {x:p.x-center.x,y:p.y-center.y};});
            if(![-6,0,6].every(function(x){return [-6,0,6].every(function(y){return G.contains(pts,{x:x,y:y});});}))return;
            if(![-24,-17,-10,-3,6].every(function(x){return [-25,-19.05,-13].every(function(y){return G.contains(pts,{x:x,y:y});});}))return;
            if(G.contains(pts,{x:-12,y:0})||G.contains(pts,{x:-20,y:0}))return;
            var k=claim(c,center,1.5,'PCB mount ANSI-ISO');k.capShape={width2:2.25,height2:1,x2:-.75,y2:1};
        });
        // Multistep Caps uses an extended horizontal switch window. Its
        // neighbouring alpha key establishes the unstepped cap's stem.
        doc.contours.forEach(function(c){var b=bounds.get(c);if(!free(c)||b.width<18.7||b.width>19.3||!near(b.height,14,.1))return;
            var right=keys.filter(function(k){return k.type==='mx'&&k.width===1&&near(k.center.y,b.cy)&&near(k.center.x,b.maxX-7+26.19375,.2);});
            if(right.length!==1||!fit(c,G.rectangle(b.width,14,{x:b.cx,y:b.cy})))return;
            claim(c,{x:right[0].center.x-26.19375,y:right[0].center.y},1.75,'Caps Multistep');
        });
        // Repeated alternate-stem bottom-row openings. Neighbouring centres
        // choose the 1.25u cap position; the imported opening never moves.
        keys.slice().forEach(function(k){if(k.recovered||k.stabilizers.length||k.contours.length!==1)return;
            var c=k.contours[0],b=bounds.get(c);if(!near(b.width,16.38125,.12)||!near(b.height,14,.12)||!fit(c,G.rectangle(b.width,b.height,{x:b.cx,y:b.cy})))return;
            var choices=[b.cx-1.190625,b.cx+1.190625].map(function(cx){return {cx:cx,score:keys.filter(function(n){return n!==k&&near(n.center.y,b.cy)&&n.width===1.25&&near(Math.abs(n.center.x-cx),23.8125,.12);}).length};}).sort(function(a,b){return b.score-a.score;});
            if(!choices[0].score||choices[0].score===choices[1].score)return;
            Object.assign(k,{type:'mx',center:{x:choices[0].cx,y:b.cy},width:1.25,capAngle:0,holeAngle:0,label:'mx bottom row 1.25'});
        });
        // 6.25/7u multi-layout bottom row: three tall/central rectangles plus
        // the adjacent switch with its extra 7u support notch. Long thin relief
        // windows are not part of the assembly. Both modifier runs must agree.
        doc.contours.forEach(function(c){var b=bounds.get(c);if(!free(c)||!near(b.width,25.90625,.15)||!near(b.height,14,.15)||!fit(c,G.rectangle(b.width,b.height,{x:b.cx,y:b.cy})))return;
            var cx=b.minX+7,cy=b.cy;
            function run(side){var expected=[3.75,5,6.25].map(function(n){return cx+side*n*pitch;});
                // On the right, the first key is the compatibility companion.
                return expected.map(function(x){return keys.find(function(k){if(k.contours.length!==1||k.recovered||!near(k.center.y,cy,.15))return false;
                    var q=bounds.get(k.contours[0]);return near(q.width,16.38125,.15)&&near(q.height,14,.15)&&near(q.cx+(side<0?-1.190625:1.190625),x,.15)&&fit(k.contours[0],G.rectangle(q.width,q.height,{x:q.cx,y:q.cy}));});});}
            var left=run(-1),right;
            // The first right position is the special notched companion;
            // the other three 1.25u windows start one key further to its right.
            right=[1,2,3].map(function(n){var x=cx+(3.75+n*1.25)*pitch;return keys.find(function(k){if(k.contours.length!==1||k.recovered)return false;var q=bounds.get(k.contours[0]);return near(q.width,16.38125,.15)&&near(q.height,14,.15)&&near(q.cy,cy,.15)&&near(q.cx+1.190625,x,.15)&&fit(k.contours[0],G.rectangle(q.width,q.height,{x:q.cx,y:q.cy}));});});
            if(left.some(function(k){return !k;})||right.some(function(k){return !k;}))return;
            var supports=[{x:cx-47.621875,w:11.75625},{x:cx+50,w:7}].map(function(v){return doc.contours.find(function(q){var z=bounds.get(q);return q!==c&&free(q)&&near(z.cx,v.x,.25)&&near(z.width,v.w,.45)&&z.height>=14.8&&z.height<=18&&Math.abs(z.cy-cy)<=2&&fit(q,G.rectangle(z.width,z.height,{x:z.cx,y:z.cy}));});});
            if(supports.some(function(q){return !q;}))return;
            var sx=cx+71.4375,companion=keys.find(function(k){if(k.contours.length!==1||k.recovered||k.stabilizers.length)return false;var q=bounds.get(k.contours[0]);return near(q.cx,sx,.18)&&near(q.width,14,.15)&&q.height>=15&&q.height<=18&&near(q.minY,cy-7,.15);});
            if(!companion)return;
            var q=bounds.get(companion.contours[0]),extra=q.height-14;
            var combined=P.rings(P.union([rect(14,14,sx,cy),rect(7,extra+1,sx-2.38125,cy+7+(extra-1)/2)]));
            if(combined.length!==1||!fit(companion.contours[0],combined[0]))return;
            // The cutout assembly is valid only if its two visible caps and
            // modifier runs fit the inferred layout. Never force neighbours
            // aside to accommodate extra compatibility geometry.
            var replaced=[companion].concat(left,right,owned(c));
            var proposed=[{center:{x:cx,y:cy},width:6.25},{center:{x:sx,y:cy},width:1.25}];
            left.forEach(function(k){proposed.push({center:{x:bounds.get(k.contours[0]).cx-1.190625,y:cy},width:1.25});});
            right.forEach(function(k){proposed.push({center:{x:bounds.get(k.contours[0]).cx+1.190625,y:cy},width:1.25});});
            proposed.forEach(function(k){k.height=1;k.capAngle=0;});
            var remaining=keys.filter(function(k){return !replaced.includes(k)&&!F.incompleteMxCandidate(k);});
            if(proposed.some(function(k,i){return remaining.concat(proposed.slice(i+1)).some(function(n){return F.capPolygons(k).some(function(a){return F.capPolygons(n).some(function(b){return F.intersects(a,b);});});});}))return;
            var space=claim(c,{x:cx,y:cy},6.25,'PCB mount 6.25u and 7u',supports),group='pcb-space-'+space.id;
            space.assembly=group;companion.assembly=group;companion.width=1.25;companion.type='mx';companion.center={x:sx,y:cy};companion.capAngle=companion.holeAngle=0;companion.label='1.25u / 7u support';
            left.forEach(function(k){var z=bounds.get(k.contours[0]);Object.assign(k,{type:'mx',width:1.25,center:{x:z.cx-1.190625,y:cy},capAngle:0,holeAngle:0,label:'mx bottom row 1.25'});});
            right.forEach(function(k){var z=bounds.get(k.contours[0]);Object.assign(k,{type:'mx',width:1.25,center:{x:z.cx+1.190625,y:cy},capAngle:0,holeAngle:0,label:'mx bottom row 1.25'});});
        });
        if(!options.legacyRoundedPcb){
            // A previously recognized 6.25u assembly can have only one right
            // modifier rather than a full three-key run. Its notched companion
            // supplies the alternate 7u support; do not require it to have
            // already passed the plain-switch detector.
            keys.slice().filter(function(k){return k.type==='mx'&&k.width===6.25&&!k.assembly&&k.contours.length===1&&k.stabilizers.length===2;}).forEach(function(space){
                var b=bounds.get(space.contours[0]),cx=space.center.x,cy=space.center.y;
                if(!near(b.width,25.90625,.15)||!near(b.height,14,.15))return;
                var sx=cx+3.75*pitch;
                var candidates=doc.contours.filter(function(c){var q=bounds.get(c);return owned(c).length===0&&(!options.layer||c.parts.every(function(p){return p.layer===options.layer;}))&&near(q.cx,sx,.25)&&near(q.width,14,.08)&&q.height>=15&&q.height<=18&&near(q.minY,cy-7,.08);});
                candidates=candidates.filter(function(c){var q=bounds.get(c),extra=q.height-14,rings=P.rings(P.union([rect(14,14,q.cx,cy),rect(7,extra+1,q.cx-2.38125,cy+7+(extra-1)/2)]));return rings.length===1&&fit(c,rings[0]);});
                if(candidates.length!==1)return;
                var neighbours=[-6.25,-5,-3.75,5].map(function(n){return keys.find(function(k){
                    if(k===space||k.contours.length!==1||k.recovered)return false;var q=bounds.get(k.contours[0]);
                    return near(q.width,16.38125,.15)&&near(q.height,14,.15)&&near(q.cy,cy,.08)&&near(q.cx+(n<0?-1.190625:1.190625),cx+n*pitch,.4)&&fit(k.contours[0],G.rectangle(q.width,q.height,{x:q.cx,y:q.cy}));
                });});
                if(neighbours.some(function(k){return !k;}))return;
                var positions=[-6.25,-5,-3.75,5].map(function(n){return {x:cx+n*pitch,y:cy};});
                var proposed=neighbours.map(function(k,i){return Object.assign({},k,{width:1.25,center:positions[i]});});
                proposed.push(Object.assign({},space),{width:1.25,height:1,capAngle:0,center:{x:sx,y:cy}});
                var remaining=keys.filter(function(k){return k!==space&&!neighbours.includes(k)&&!F.incompleteMxCandidate(k);});
                if(proposed.some(function(k,i){return remaining.concat(proposed.slice(i+1)).some(function(n){return F.capPolygons(k).some(function(a){return F.capPolygons(n).some(function(b){return F.intersects(a,b);});});});}))return;
                var companion=claim(candidates[0],{x:sx,y:cy},1.25,'1.25u / 7u support');
                space.assembly=companion.assembly='pcb-space-'+space.id;space.label='PCB mount 6.25u and 7u';
                neighbours.forEach(function(k,i){k.width=1.25;k.center=positions[i];});
            });
        }
        // Ordinary 7u spacebar: tall support slots at the standard wire span.
        // Wide decorative/flex windows between them are never claimed.
        keys.slice().filter(function(k){return k.type==='mx'&&k.width===1&&k.height===1&&!k.stabilizers.length&&!k.family;}).forEach(function(k){
            var supports=[-1,1].map(function(side){return doc.contours.find(function(c){var b=bounds.get(c);return free(c)&&b.width>=6.8&&b.width<=9.2&&b.height>=14.8&&b.height<=18.2&&near(b.cx,k.center.x+side*57.15,.15)&&Math.abs(b.cy-k.center.y)<=2&&fit(c,G.rectangle(b.width,b.height,{x:b.cx,y:b.cy}));});});
            if(supports.some(function(c){return !c;}))return;
            var neighbours=[-1,1].map(function(side){return keys.find(function(n){return n!==k&&near(n.center.y,k.center.y)&&near(n.center.x,k.center.x+side*4.25*pitch,.15);});});
            if(neighbours.some(function(n){return !n;}))return;
            k.width=7;k.label='7u PCB mount';k.stabilizers=supports;k.detectedStabilizer={family:'mx-pcb',spacing:114.3,vertical:false};
            neighbours.forEach(function(n){n.width=1.5;});
        });
    }
    return {run:run};
}));
