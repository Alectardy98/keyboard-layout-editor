// Recognition proposes switch centres from closed geometry, not filenames.
// Ambiguous contours and unmatched drawing features remain unchanged.
(function(root,factory) {
    if(typeof module==='object' && module.exports) module.exports=factory(require('./geometry.js'),require('./measured.js'),require('./overlaps.js'));
    else root.PlateRecognize=factory(root.PlateGeometry,root.PlateMeasured,root.PlateOverlaps);
}(typeof globalThis!=='undefined'?globalThis:this,function(G,Measured,O) {
    'use strict';
    function unique(values,tolerance) {
        var result=[];
        values.sort(function(a,b){return a-b;}).forEach(function(value) {
            if(!result.length || Math.abs(value-result[result.length-1])>tolerance) result.push(value);
        });
        return result;
    }
    function pairs(values,size) {
        var result=[];
        for(var i=0;i<values.length;i++) for(var j=i+1;j<values.length;j++) {
            var distance=values[j]-values[i];
            if(Math.abs(distance-size)<0.26) result.push({low:values[i],high:values[j],center:(values[i]+values[j])/2});
        }
        return result.slice(0,64);
    }
    function coverage(edges,axis,at,low,high) {
        var total=0;
        edges.forEach(function(edge) {
            if(edge.axis===axis && Math.abs(edge.at-at)<0.06)
                total+=Math.max(0,Math.min(high,edge.high)-Math.max(low,edge.low));
        });
        return Math.min(1,total/(high-low));
    }
    function cores(loop,exterior) {
        var initial=G.minimumBox(loop.points);
        if(!exterior && Math.min(initial.width,initial.height)<10) return [];
        var result=[];
        G.axes(loop.points).forEach(function(base) {
            [base,base+Math.PI/2].forEach(function(angle) {
                var points=loop.points.map(function(p){return G.rotate(p,-angle);}),edges=[];
                points.forEach(function(p,i) {
                    var q=points[(i+1)%points.length];
                    if(G.distance(p,q)<0.75) return;
                    if(Math.abs(p.x-q.x)<0.015) edges.push({axis:'x',at:(p.x+q.x)/2,low:Math.min(p.y,q.y),high:Math.max(p.y,q.y)});
                    if(Math.abs(p.y-q.y)<0.015) edges.push({axis:'y',at:(p.y+q.y)/2,low:Math.min(p.x,q.x),high:Math.max(p.x,q.x)});
                });
                var xs=unique(edges.filter(function(e){return e.axis==='x';}).map(function(e){return e.at;}),0.03);
                var ys=unique(edges.filter(function(e){return e.axis==='y';}).map(function(e){return e.at;}),0.03);
                [{type:'mx',width:14,height:14},{type:'alps',width:15.5,height:12.8}].forEach(function(profile) {
                    pairs(xs,profile.width).forEach(function(x) {
                        pairs(ys,profile.height).forEach(function(y) {
                            var center={x:x.center,y:y.center},valid=true;
                            [-1,0,1].forEach(function(sx) {[-1,0,1].forEach(function(sy) {
                                if(G.contains(points,{x:center.x+sx*(profile.width/2-0.6),y:center.y+sy*(profile.height/2-0.6)})===!!exterior) valid=false;
                            });});
                            if(!valid) return;
                            var sides=[coverage(edges,'x',x.low,y.low,y.high),coverage(edges,'x',x.high,y.low,y.high),
                                coverage(edges,'y',y.low,x.low,x.high),coverage(edges,'y',y.high,x.low,x.high)];
                            var score=sides.reduce(function(a,b){return a+b;},0)/4;
                            if(score<0.42 || Math.min(...sides)<0.10) return;
                            var world=G.rotate(center,angle),candidate={type:profile.type,center:world,angle:angle,
                                width:x.high-x.low,height:y.high-y.low,score:score};
                            var found=result.find(function(c){return c.type===candidate.type && G.distance(c.center,world)<0.15;});
                            if(!found) result.push(candidate);
                            else if(score>found.score) Object.assign(found,candidate);
                        });
                    });
                });
            });
        });
        return result;
    }
    function normalizedAngle(angle) {
        var result=((angle%(Math.PI/2))+Math.PI/2)%(Math.PI/2);
        if(result>Math.PI/4) result-=Math.PI/2;
        return Math.abs(result)<1e-8?0:result;
    }
    function unknownCandidate(loop) {
        if(loop.parts.every(function(p){return p.type==='CIRCLE';})) return null;
        var box=G.minimumBox(loop.points),area=Math.abs(G.area(loop.points)),perimeter=0;
        loop.points.forEach(function(p,i){perimeter+=G.distance(p,loop.points[(i+1)%loop.points.length]);});
        var roundness=perimeter?4*Math.PI*area/(perimeter*perimeter):1;
        if(Math.min(box.width,box.height)<10 || Math.max(box.width,box.height)>23.5 ||
            area<80 || area/(box.width*box.height)<0.5 || roundness>0.93) return null;
        return {type:'unknown',center:box.center,angle:box.angle,width:box.width,height:box.height,score:0};
    }
    // Match actual contours rather than bounding boxes alone. Never claim a
    // mounting hole just because it happens to be near a spacebar.
    function matches(points,pattern,center,angle,tolerance) {
        tolerance=tolerance || 0.03;
        var local=points.map(function(p){return G.rotate({x:p.x-center.x,y:p.y-center.y},-(angle || 0));});
        var a=G.bounds(local),b=G.bounds(pattern);
        if(['minX','maxX','minY','maxY'].some(function(k){return Math.abs(a[k]-b[k])>tolerance;}))return false;
        function onEdges(p,ring){return ring.some(function(a,i){var b=ring[(i+1)%ring.length],dx=b.x-a.x,dy=b.y-a.y;
            var t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy || 1)));
            return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)<tolerance;});}
        return local.every(function(p){return onEdges(p,pattern);}) && pattern.every(function(p){return onEdges(p,local);});
    }
    function analyze(document,options) {
        options=options || {};
        var keys=[],unknown=[],ambiguous=[],duplicate=[],counts={mx:0,alps:0,universal:0,unknown:0};
        document.contours.forEach(function(loop,index) {
            if(keys.length+unknown.length>2000)throw Error('More than 2,000 possible keys. Choose a smaller drawing or isolate the plate in CAD.');
            loop.id='contour-'+index;
            if(options.layer && !loop.parts.some(function(part){return part.layer===options.layer;})) return;
            var found=cores(loop),centers=[];
            found.forEach(function(core) {
                var group=centers.find(function(g){return G.distance(g[0].center,core.center)<0.2;});
                if(group) group.push(core);else centers.push([core]);
            });
            if(centers.length>1) {
                // Multiple independently supported cores share one source entity.
                centers.forEach(function(group){var best=group.sort(function(a,b){return b.score-a.score;})[0];
                    keys.push({center:best.center,holeAngle:best.angle,capAngle:normalizedAngle(best.angle),type:best.type,
                        core:best,contours:[loop],editable:loop.editable,width:1,height:1,stabilizers:[],recovered:true,sharedLoop:loop});
                });return;
            }
            if(centers.length===1) {
                var group=centers[0].sort(function(a,b){return b.score-a.score;}),best=group[0];
                var type=group.some(function(c){return c.type==='mx';}) && group.some(function(c){return c.type==='alps';})?'universal':best.type;
                keys.push({center:best.center,holeAngle:best.angle,capAngle:normalizedAngle(best.angle),type:type,
                    core:best,contours:[loop],editable:loop.editable,width:1,height:1,stabilizers:[]});
            } else {
                var candidate=unknownCandidate(loop);
                if(candidate) unknown.push({candidate:candidate,loop:loop});
            }
        });
        // Plate material surrounds the other holes. Search its concave boundary
        // for complete switch-sized edge pairs whose interiors lie outside it.
        document.contours.forEach(function(loop){
            if(!loop.editable || (options.layer && !loop.parts.some(function(p){return p.layer===options.layer;})) || !O.material(loop,keys))return;
            cores(loop,true).forEach(function(best){
                if(keys.some(function(k){return G.distance(k.center,best.center)<.2;}))return;
                keys.push({center:best.center,holeAngle:best.angle,capAngle:normalizedAngle(best.angle),type:best.type,
                    core:best,contours:[loop],editable:true,width:1,height:1,stabilizers:[],recovered:true,sharedLoop:loop,sharedMaterial:true});
            });
        });
        // Repetition suggests an unknown switch family; a lone encoder window
        // or other miscellaneous opening is not automatically turned into a key.
        unknown.forEach(function(item) {
            var a=Math.min(item.candidate.width,item.candidate.height),b=Math.max(item.candidate.width,item.candidate.height);
            var peers=unknown.filter(function(other) {
                return Math.abs(Math.min(other.candidate.width,other.candidate.height)-a)<0.15 &&
                    Math.abs(Math.max(other.candidate.width,other.candidate.height)-b)<0.15;
            });
            if(peers.length>=3) {
                var c=item.candidate;
                keys.push({center:c.center,holeAngle:c.angle,capAngle:normalizedAngle(c.angle),type:'unknown',
                    core:c,contours:[item.loop],editable:item.loop.editable,width:1,height:1,stabilizers:[]});
            }
        });
        var uniqueKeys=[];
        keys.forEach(function(key) {
            var existing=uniqueKeys.find(function(other){return G.distance(other.center,key.center)<0.15;});
            if(existing) {
                existing.editable=false;existing.contours=existing.contours.concat(key.contours);duplicate.push(key);
            } else uniqueKeys.push(key);
        });
        keys=uniqueKeys;
        var keyContours=new Set(keys.flatMap(function(key){return key.contours.map(function(c){return c.id;});}));
        var small=document.contours.filter(function(c){return !keyContours.has(c.id) && c.editable;});
        var pairCandidates=[];
        keys.forEach(function(key) {
            [key.capAngle,key.capAngle+Math.PI/2].forEach(function(angle,axis) {
                var features=small.map(function(contour) {
                    var local=contour.points.map(function(p){return G.rotate({x:p.x-key.center.x,y:p.y-key.center.y},-angle);});
                    var b=G.bounds(local),family=null;
                    if(b.width>2.2 && b.width<2.9 && b.height>4.5 && b.height<5.5 && Math.abs(Math.abs(b.cy)-6.45)<0.45) family='alps';
                    if(b.width>6.8 && b.width<7.2 && b.height>14.7 && b.height<15.9 && Math.abs(Math.abs(b.cy)-1.5)<1) family='mx-pcb';
                    if(b.width>3.1 && b.width<3.5 && b.height>13.9 && b.height<14.5 && Math.abs(Math.abs(b.cy)-0.65)<0.5) family='costar';
                    return {contour:contour,box:b,family:family};
                }).filter(function(f){return f.family && Math.abs(f.box.cx)>6 && Math.abs(f.box.cx)<85;});
                features.filter(function(f){return f.box.cx<0;}).forEach(function(left) {
                    features.filter(function(f){return f.box.cx>0;}).forEach(function(right) {
                        if(left.family!==right.family || Math.abs(left.box.cx+right.box.cx)>0.25 ||
                            Math.abs(left.box.cy-right.box.cy)>0.25 || Math.abs(left.box.width-right.box.width)>0.15 ||
                            Math.abs(left.box.height-right.box.height)>0.15) return;
                        pairCandidates.push({key:key,parts:[left.contour,right.contour],family:left.family,
                            span:right.box.cx-left.box.cx,axis:axis,offsetY:(left.box.cy+right.box.cy)/2,
                            score:right.box.cx-left.box.cx});
                    });
                });
            });
        });
        pairCandidates.sort(function(a,b){return a.score-b.score;});
        var usedStabs=new Set();
        pairCandidates.forEach(function(pair) {
            if(pair.key.stabilizers.length || pair.parts.some(function(c){return usedStabs.has(c.id);})) return;
            pair.parts.forEach(function(c){usedStabs.add(c.id);});
            pair.key.stabilizers=pair.parts;
            pair.key.detectedStabilizer={family:pair.family,spacing:pair.span,vertical:!!pair.axis,
                direction:pair.offsetY>0?'north':'south'};
            var guesses=pair.family==='alps'?[[23,1.75],[24,1.75],[28,2],[41,2.75],[83.72,6.25],[90.6,6.5]]:
                [[23.8,2],[38.1,3],[95.25,6],[100,6.25],[114.3,7],[133.35,8]];
            var nearest=guesses.slice().sort(function(a,b){return Math.abs(a[0]-pair.span)-Math.abs(b[0]-pair.span);})[0];
            var length=Math.abs(nearest[0]-pair.span)<0.6?nearest[1]:Math.max(2,Math.round((pair.span/19.05+1)*4)/4);
            if(pair.axis)pair.key.height=length;else pair.key.width=length;
        });
        keys.forEach(function(key) {
            if(key.recovered)return;
            var box=G.minimumBox(key.contours[0].points);
            key.compound=box.width>24 || box.height>24;
            if(key.compound && key.width===1 && key.height===1) {
                var vertical=box.height>box.width,long=Math.max(box.width,box.height),short=Math.min(box.width,box.height);
                // Common MX clip-in housings extend 4.2 mm beyond each
                // stabilizer centre. Use their span for a combined opening;
                // its overall length is not the keycap width in key units.
                var presets=[[23.8,2],[38.1,3],[57.15,4],[69.342,4.5],[85.725,5.5],[95.25,6],
                    [100,6.25],[104.76,6.5],[114.3,7],[133.35,8]];
                var match=short>12.5 && short<15.5?presets.find(function(p){return Math.abs(long-8.4-p[0])<0.35;}):null;
                var size=match?match[1]:Math.max(2,Math.round(long/19.05*4)/4);
                if(vertical)key.height=size;else key.width=size;
                if(match)key.detectedStabilizer={family:'mx-plate',spacing:match[0],vertical:vertical};
            }
        });
        // The Zenith 5.5u includes both pairs of wire slots plus three pole
        // support openings. Accept the assembly only when every contour matches.
        keys.filter(function(k){return k.type==='alps';}).forEach(function(key){
            [0,Math.PI].some(function(turn){
                var parts=Measured.space55.map(function(pattern){return small.find(function(c){
                    return matches(c.points,pattern,key.center,key.capAngle+turn);
                });});
                if(parts.some(function(c){return !c;}))return false;
                if(parts.some(function(c){return keys.some(function(other){return other!==key && other.stabilizers.includes(c);});}))return false;
                key.stabilizers=parts;key.width=5.5;
                key.detectedStabilizer={family:'alps-default',spacing:76.9,vertical:false,direction:turn?'north':'south'};
                return true;
            });
        });
        // Canon assemblies require every measured slot and barrel opening.
        // Relief slots and plate mounting holes are deliberately not claimed.
        [{pattern:Measured.canon8,width:8,height:1,label:'8u',family:'alps-canon8'},
         {pattern:Measured.canonVertical2,width:1.25,height:2,label:'cannon vertical 2u',family:'alps-canon-vertical2'}].forEach(function(preset){
            keys.filter(function(k){return k.type==='alps';}).forEach(function(key){
                var parts=preset.pattern.map(function(pattern){return small.find(function(c){
                    return matches(c.points,pattern,key.center,key.capAngle);
                });});
                if(parts.some(function(c){return !c || keys.some(function(other){return other!==key && other.stabilizers.includes(c);});}))return;
                key.stabilizers=parts;key.width=preset.width;key.height=preset.height;key.label=preset.label;
                key.detectedStabilizer={family:preset.family,vertical:preset.height>preset.width};
            });
        });
        // The same four vertical slots accept different cap widths. Use
        // neighbouring key footprints to reject a 1.25u cap that would overlap.
        keys.filter(function(k){return k.detectedStabilizer?.family==='alps-canon-vertical2';}).forEach(function(key){
            var clearance=keys.filter(function(other){return other!==key &&
                Math.abs(other.center.y-key.center.y)<(key.height+other.height)*19.05/2-.03;
            }).map(function(other){return 2*Math.abs(other.center.x-key.center.x)/19.05-other.width;});
            var available=Math.min(...clearance);
            if(available>=.998 && available<1.248){key.width=1;key.label='vertical 2u';}
        });
        // Complete DC2014 patterns: wire slots plus the barrel and its two
        // square supports. Match geometry, never the filename or key number.
        [{pattern:Measured.space7AllFlex,width:7,height:1,label:'7u all stabs flex',family:'alps-7-all-flex'},
         {pattern:Measured.space625All,width:7,height:1,label:'7u all stabs',family:'alps-7-all'},
         {pattern:Measured.multi275,width:2.75,height:1,label:'2.75u multi stab',family:'alps-multi275'},
         {pattern:Measured.space975Barrel,width:9.75,height:1,label:'9.75u',family:'alps-975-barrel'},
         {pattern:Measured.z150Supports,width:1,height:2,label:'Z150 Enter',family:'alps-z150',
          capShape:{width2:2,height2:1,x2:-1,y2:1}}].forEach(function(preset){
            keys.filter(function(k){return k.type==='alps';}).forEach(function(key){
                var parts=preset.pattern.map(function(pattern){return small.find(function(c){
                    return matches(c.points,pattern,key.center,key.capAngle);
                });});
                if(parts.some(function(c){return !c || keys.some(function(other){return other!==key && other.stabilizers.includes(c);});}))return;
                key.stabilizers=parts;key.width=preset.width;key.height=preset.height;key.label=preset.label;
                if(preset.capShape)key.capShape=Object.assign({},preset.capShape);
                key.detectedStabilizer={family:preset.family,vertical:preset.height>preset.width};
            });
        });
        // FC660M 6.25u: two complete barrel assemblies plus the wire slots.
        // Match the whole pattern; do not absorb isolated mounting circles.
        keys.filter(function(k){return k.type==='alps';}).forEach(function(key){
            [0,Math.PI].some(function(turn){
                var parts=Measured.space625Barrels.map(function(pattern){return small.find(function(c){
                    return matches(c.points,pattern,key.center,key.capAngle+turn);
                });});
                if(parts.some(function(c){return !c || keys.some(function(other){return other!==key && other.stabilizers.includes(c);});}))return false;
                key.stabilizers=parts;key.width=6.25;key.height=1;key.label='6.25u';
                key.detectedStabilizer={family:'alps-barrel625',spacing:83.7181,vertical:false,direction:turn?'north':'south'};
                return true;
            });
        });
        // Big-ass Enter variants: require both wire slots and the complete
        // upper-right barrel assembly. A nearby mounting circle is not owned.
        [{pattern:Measured.zkb2Supports,label:'ZKB2 Enter',family:'alps-zkb2',upperWidth:1},
         {pattern:Measured.baeSupports,label:'5140 BAE',family:'alps-bae',upperWidth:1.5}].forEach(function(preset){
            keys.filter(function(k){return k.type==='alps';}).forEach(function(key){
                var parts=preset.pattern.map(function(pattern){return small.find(function(c){
                    return matches(c.points,pattern,key.center,key.capAngle);
                });});
                if(parts.some(function(c){return !c || keys.some(function(other){return other!==key && other.stabilizers.includes(c);});}))return;
                key.stabilizers=parts;key.width=2.25;key.height=1;key.label=preset.label;
                // Keep the primary lower rectangle centred on the real stem.
                key.capShape={width2:preset.upperWidth,height2:2,x2:2.25-preset.upperWidth,y2:-1};
                key.detectedStabilizer={family:preset.family,spacing:28,vertical:false,direction:'south'};
            });
        });
        keys.sort(function(a,b){return b.center.y-a.center.y || a.center.x-b.center.x;});
        var rows=[];
        keys.forEach(function(key) {
            var row=rows.find(function(row){return Math.abs(row.y-key.center.y)<0.25;});
            if(!row) {row={y:key.center.y,keys:[]};rows.push(row);}
            row.keys.push(key);
        });
        // A surrounding closed contour supplies an outer cap boundary. Do not
        // treat mounting windows or gaps between keys as available cap space.
        var outlines=document.contours.filter(function(c){return keys.length>=3 &&
            keys.every(function(k){return G.contains(c.points,k.center);});});
        function capFits(key,width){
            return outlines.every(function(c){
                var corners=G.rectangle(width*19.05-1.2,key.height*19.05-1.2,key.center);
                return corners.every(function(a,i){var b=corners[(i+1)%corners.length],steps=Math.ceil(G.distance(a,b));
                    for(var j=0;j<=steps;j++)if(!G.contains(c.points,{x:a.x+(b.x-a.x)*j/steps,y:a.y+(b.y-a.y)*j/steps}))return false;
                    return true;
                });
            });
        }
        function rowSpanFits(key,width){
            // Plate corner reliefs need not follow the cap silhouette. When
            // row alignment and neighbouring caps independently agree, check
            // the actual horizontal row span rather than its lower corners.
            var half=(width*19.05-1.2)/2,steps=Math.ceil(half*2);
            return outlines.every(function(c){
                for(var i=0;i<=steps;i++)if(!G.contains(c.points,{x:key.center.x-half+2*half*i/steps,y:key.center.y}))return false;
                return true;
            });
        }
        // Establish shared row edges from ordinary 1u runs or supported end
        // caps. KLE cells include spacing: the plate need not contain the full
        // nominal cell rectangle. The small inset above permits that clearance.
        rows.forEach(function(row){row.keys.sort(function(a,b){return a.center.x-b.center.x;});});
        var leftEdges=[],rightEdges=[];
        rows.forEach(function(row){
            var list=row.keys;
            [0,list.length-1].forEach(function(i){
                var k=list[i],n=list[i===0?1:i-1];
                if(!k || !n || k.height!==1 || Math.abs(k.capAngle)>1e-6)return;
                var unitRun=k.width===1 && n.width===1 && Math.abs(Math.abs(n.center.x-k.center.x)-19.05)<.03;
                if(!unitRun && !(k.stabilizers.length && k.width<=2.75))return;
                (i===0?leftEdges:rightEdges).push(k.center.x+(i===0?-1:1)*k.width*19.05/2);
            });
        });
        var leftEdge=leftEdges.length?Math.min(...leftEdges):null,rightEdge=rightEdges.length?Math.max(...rightEdges):null;
        rows.forEach(function(row){
            var list=row.keys,trusted=new Set(list.filter(function(k,i){
                return k.width>1 || [list[i-1],list[i+1]].some(function(n){return n && Math.abs(Math.abs(n.center.x-k.center.x)-19.05)<0.03;});
            }));
            function edgeWidth(k,i){
                var edge=i===0?leftEdge:i===list.length-1?rightEdge:null;
                if(edge===null)return null;
                var w=2*Math.abs(k.center.x-edge)/19.05;
                return w>=1 && w<=2.75 && Math.abs(w*4-Math.round(w*4))<.006?Math.round(w*4)/4:null;
            }
            for(var pass=0;pass<list.length;pass++){
                var changed=false;
                list.forEach(function(k,i){
                    if(k.height!==1 || Math.abs(k.capAngle)>1e-6)return;
                    var limit=k.width>=5?12:2.75;
                    var neighbours=[list[i-1],list[i+1]].filter(Boolean),edge=edgeWidth(k,i);
                    var proposals=neighbours.filter(function(n){return trusted.has(n);}).map(function(n){
                        return 2*Math.abs(n.center.x-k.center.x)/19.05-n.width;
                    }).filter(function(w){return w>=k.width-0.002 && w<=limit && Math.abs(w*4-Math.round(w*4))<0.006;});
                    var edgeAgrees=edge!==null && proposals.some(function(w){return Math.abs(w-edge)<.002;});
                    if(edge!==null && edge>=k.width-.002)proposals.push(edge);
                    if(!proposals.length)return;
                    var width=Math.round(Math.min(...proposals)*4)/4;
                    if(neighbours.some(function(n){return (width+n.width)*19.05/2>Math.abs(n.center.x-k.center.x)+0.03;}))return;
                    if(width>k.width+0.01){if(!capFits(k,width) && !(edgeAgrees && Math.abs(width-edge)<.002 && rowSpanFits(k,width)))return;k.width=width;changed=true;}
                    if(!trusted.has(k)){trusted.add(k);changed=true;}
                });
                if(!changed)break;
            }
        });
        // Common winkeyless bottom row: 1.5, gap 1, 1.5, 7, 1.5, gap 1, 1.5.
        // Require all four measured centre offsets; do not close the two gaps.
        var bottom=rows.reduce(function(a,b){return !a || b.y<a.y?b:a;},null);
        if(bottom)bottom.keys.filter(function(k){return k.width>=5 && k.height===1;}).forEach(function(space){
            var modifiers=[-6.75,-4.25,4.25,6.75].map(function(offset){return bottom.keys.find(function(k){
                return k!==space && k.height===1 && Math.abs(k.center.x-space.center.x-offset*19.05)<.04;
            });});
            if(modifiers.some(function(k){return !k;}))return;
            var assembly=[modifiers[0],modifiers[1],space,modifiers[2],modifiers[3]];
            if(bottom.keys.some(function(k){return !assembly.includes(k) && Math.abs(k.center.x-space.center.x)<7.5*19.05;}))return;
            space.width=7;modifiers.forEach(function(k){k.width=1.5;});
        });
        keys=[];
        rows.forEach(function(row) {
            row.keys.sort(function(a,b){return a.center.x-b.center.x;});
            row.keys.forEach(function(key){keys.push(key);});
        });
        keys=keys.filter(function(k){return !k.recovered;}).concat(keys.filter(function(k){return k.recovered;}));
        keys.forEach(function(key,index) {key.id='key-'+String(index+1).padStart(3,'0');counts[key.type]++;});
        // Append miscellaneous controls after switches to keep historical
        // switch IDs stable when opening a saved plate project.
        document.contours.forEach(function(c){
            if(options.layer && !c.parts.some(function(p){return p.layer===options.layer;}))return;
            if(keys.some(function(k){return k.contours.includes(c)||k.stabilizers.includes(c);}))return;
            var b=G.bounds(c.points),t=G.bounds(Measured.ec11),center={x:b.cx-t.cx,y:b.cy-t.cy};
            if(!matches(c.points,Measured.ec11,center,0))return;
            keys.push({id:'key-'+String(keys.length+1).padStart(3,'0'),center:center,holeAngle:0,capAngle:0,
                type:'ec11',core:{width:15.5,height:14.101933},contours:[c],stabilizers:[],editable:c.editable,width:1,height:1});
            counts.ec11=(counts.ec11 || 0)+1;
        });
        // The elongated opening permits several stem positions. Use its
        // rightmost Alps stem centre for the 1.75u cap; keep the full cutout.
        document.contours.forEach(function(c){
            if(options.layer && !c.parts.some(function(p){return p.layer===options.layer;}))return;
            if(keys.some(function(k){return k.contours.includes(c)||k.stabilizers.includes(c);}))return;
            var b=G.bounds(c.points),t=G.bounds(Measured.capsMultistep),center={x:b.cx-t.cx,y:b.cy-t.cy};
            if(!matches(c.points,Measured.capsMultistep,center,0,0.18))return;
            center={x:b.maxX-7.75,y:b.cy};
            keys.push({id:'key-'+String(keys.length+1).padStart(3,'0'),center:center,holeAngle:0,capAngle:0,
                label:'Caps Multistep',type:'alps',core:{width:15.5,height:b.height},contours:[c],stabilizers:[],editable:c.editable,width:1.75,height:1});
            counts.alps++;
        });
        // Broad MX compatibility windows lose the 14 mm vertical core edges.
        // Match the complete contour, not a large rectangle's bounding box.
        // Append new discoveries so existing saved-project IDs stay unchanged.
        [{pattern:Measured.mxWide2,width:2,label:'2u PCB mount'},
         {pattern:Measured.mxWide225,width:2.25,label:'2.25u PCB mount'},
         {pattern:Measured.mxCapsMultistep,width:1.75,label:'Caps Multistep',caps:true}].forEach(function(preset){
            document.contours.forEach(function(c){
                if(options.layer && !c.parts.some(function(p){return p.layer===options.layer;}))return;
                if(keys.some(function(k){return k.contours.includes(c)||k.stabilizers.includes(c);}))return;
                [0,Math.PI/2,Math.PI,3*Math.PI/2].some(function(angle){
                    var local=c.points.map(function(p){return G.rotate(p,-angle);}),b=G.bounds(local),t=G.bounds(preset.pattern);
                    var center=G.rotate({x:b.cx-t.cx,y:b.cy-t.cy},angle);
                    if(!matches(c.points,preset.pattern,center,angle,preset.caps?.25:.04))return false;
                    // A multi-position modifier slot is not always Caps Lock.
                    // Require the neighbouring 1u key at the 1.75u row pitch.
                    if(preset.caps && !keys.some(function(k){var n=G.rotate({x:k.center.x-center.x,y:k.center.y-center.y},-angle);
                        return k.width===1 && Math.abs(n.y)<.1 && Math.abs(n.x-1.375*19.05)<.1;}))return false;
                    keys.push({id:'key-'+String(keys.length+1).padStart(3,'0'),center:center,holeAngle:angle,capAngle:angle,
                        label:preset.label,type:'mx',core:{width:14,height:14},contours:[c],stabilizers:[],editable:c.editable,
                        width:preset.width,height:1,compound:!preset.caps});counts.mx++;return true;
                });
            });
        });
        // Clearance slots vary by vendor. Associate only a symmetric pair at
        // a known wire spacing and verify rectangular area, not just bounds.
        keys.filter(function(k){return k.type==='mx' && !k.recovered && !k.compound;}).forEach(function(key){
            if(!key.stabilizers.length){
                [key.capAngle,key.capAngle+Math.PI/2].some(function(angle,axis){
                    var candidates=document.contours.filter(function(c){return c.editable &&
                        (!options.layer || c.parts.some(function(p){return p.layer===options.layer;})) &&
                        !keys.some(function(k){return k.contours.includes(c)||k.stabilizers.includes(c);});}).map(function(c){
                        var points=c.points.map(function(p){return G.rotate({x:p.x-key.center.x,y:p.y-key.center.y},-angle);}),b=G.bounds(points);
                        return {c:c,b:b,area:Math.abs(G.area(points))};
                    }).filter(function(v){return v.b.width>=6.7 && v.b.width<=7.2 && v.b.height>=13.9 && v.b.height<=16.1 &&
                        Math.abs(v.b.cy)<=2 && v.area/(v.b.width*v.b.height)>.985;});
                    var pair=null;
                    candidates.filter(function(v){return v.b.cx<0;}).some(function(a){return candidates.some(function(b){
                        var span=b.b.cx-a.b.cx;
                        var asymmetry=a.b.cx+b.b.cx;
                        var offset6=Math.abs(span-95.25)<.15 && Math.abs(Math.abs(asymmetry)-19.05)<.15;
                        if(b.b.cx<=0 || (!offset6 && Math.abs(asymmetry)>.15) || Math.abs(a.b.cy-b.b.cy)>.1 ||
                           Math.abs(a.b.width-b.b.width)>.1 || Math.abs(a.b.height-b.b.height)>.1 ||
                           ![23.8,23.876,38.1,95.25,100,114.3,133.35].some(function(n){return Math.abs(n-span)<.15;}))return false;
                        pair=[a,b];return true;
                    });});
                    if(!pair)return false;
                    var span=pair[1].b.cx-pair[0].b.cx;
                    key.stabilizers=pair.map(function(v){return v.c;});
                    key.detectedStabilizer={family:'mx-pcb',spacing:span,vertical:!!axis,stemOffset:-(pair[0].b.cx+pair[1].b.cx)/2,direction:pair[0].b.cy>0?'north':'south'};
                    var size=span<24?2:span<39?3:span<98?6:span<105?6.25:span<120?7:8;
                    if(axis)key.height=size;else key.width=size;return true;
                });
            }
            // ISO has the 2u vertical pair and a neighbouring main typing row
            // half a pitch below its stem. A numpad 2u stays rectangular.
            if(key.detectedStabilizer?.vertical && key.height===2 && keys.some(function(k){
                return k!==key && k.width===1 && Math.abs(k.center.y-(key.center.y-9.525))<.15 &&
                    Math.abs(k.center.x-(key.center.x-21.43125))<.15;
            })){
                key.width=1.25;key.label=key.detectedStabilizer.family==='mx-pcb'?'ISO PCB mount':'ISO Enter';
                key.capShape={width2:1.5,height2:1,x2:-.25,y2:0};
            }
        });
        var types=Object.keys(counts).filter(function(type){return counts[type]>0;});
        return {keys:keys,counts:counts,type:types.length===1?types[0]:types.length?'mixed':'unknown',
            ambiguous:ambiguous,duplicates:duplicate,unassigned:document.contours.filter(function(c) {
                return !keys.some(function(k){return k.contours.includes(c) || k.stabilizers.includes(c);});
            })};
    }
    return {analyze:analyze,cores:cores,normalizedAngle:normalizedAngle};
}));
