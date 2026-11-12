// Read ASCII DXF for recognition/preview. Export edits only selected entity
// records; unrelated records, layers, blocks and drawing coordinates stay intact.
(function(root,factory) {
    if(typeof module==='object' && module.exports) module.exports=factory(require('dxf-parser'),require('./geometry.js'));
    else root.PlateDxf=factory(root.DxfParser,root.PlateGeometry);
}(typeof globalThis!=='undefined'?globalThis:this,function(DxfParser,G) {
    'use strict';
    var IDENTITY=[1,0,0,1,0,0];
    function number(record,code,fallback) {
        var pair=record.pairs.find(function(p){return p.code===code;});
        return pair ? Number(pair.value) : fallback;
    }
    function value(record,code,fallback) {
        var pair=record.pairs.find(function(p){return p.code===code;});
        return pair ? pair.value : fallback;
    }
    function tokenize(source) {
        if(typeof source!=='string' || source.indexOf('AutoCAD Binary DXF')===0)
            throw Error('Use an ASCII DXF file. Binary DXF must first be saved as ASCII in your CAD tool.');
        if(source.length>16*1024*1024) throw Error('DXF files must be 16 MiB or smaller.');
        var pattern=/[^\r\n]*(?:\r\n|\r|\n|$)/g,lines=[],match;
        while((match=pattern.exec(source)) && match[0].length) {
            lines.push({text:match[0].replace(/[\r\n]+$/,''),start:match.index,end:pattern.lastIndex});
        }
        if(lines.length%2) throw Error('The DXF has an incomplete group-code/value pair.');
        var pairs=[];
        for(var i=0;i<lines.length;i+=2) {
            var codeText=lines[i].text.replace(/^\uFEFF/,'').trim();
            if(!/^\d+$/.test(codeText)) throw Error('The DXF contains an invalid group code near line '+(i+1)+'.');
            pairs.push({code:Number(codeText),value:lines[i+1].text.trim(),start:lines[i].start,
                valueStart:lines[i+1].start,valueEnd:lines[i+1].start+lines[i+1].text.length,end:lines[i+1].end});
        }
        var records=[],section='',current=null;
        pairs.forEach(function(pair) {
            if(pair.code===0) {
                if(current) {current.end=pair.start; records.push(current);}
                current={type:pair.value,pairs:[pair],start:pair.start,section:section};
            } else if(current) current.pairs.push(pair);
        });
        if(current) {current.end=source.length; records.push(current);}
        records.forEach(function(record) {
            if(record.type==='SECTION') section=value(record,2,'');
            record.section=section;
            if(record.type==='ENDSEC') section='';
        });
        var entities=[],end=null;
        records.forEach(function(record,index) {
            record.id='record-'+index;
            record.handle=value(record,5,null);
            if(record.section!=='ENTITIES') return;
            if(record.type==='ENDSEC') {end=record.start;return;}
            if(record.type==='SECTION') return;
            if(record.type==='VERTEX' || record.type==='SEQEND') {
                var parent=entities[entities.length-1];
                if(parent && parent.type==='POLYLINE') {parent.pairs=parent.pairs.concat(record.pairs); parent.end=record.end;}
                return;
            }
            entities.push({...record,pairs:record.pairs.slice()});
        });
        if(end===null) throw Error('The DXF has no complete ENTITIES section.');
        return {pairs:pairs,records:records,entities:entities,end:end,eol:source.includes('\r\n')?'\r\n':'\n'};
    }
    function splinePoints(entity) {
        var control=entity.controlPoints || [],degree=entity.degreeOfSplineCurve,knots=entity.knotValues || [];
        if(!Number.isInteger(degree) || degree<1 || control.length<degree+1 || knots.length!==control.length+degree+1)
            return (entity.fitPoints || control).map(function(p){return G.point(p.x,p.y);});
        var start=knots[degree],end=knots[control.length],result=[];
        for(var step=0;step<=100;step++) {
            var t=step===100 ? end : start+(end-start)*step/100,span=control.length-1;
            if(step!==100) for(var k=degree;k<control.length;k++) if(knots[k]<=t && t<knots[k+1]) {span=k;break;}
            var d=[];
            for(var j=0;j<=degree;j++) d[j]={x:control[span-degree+j].x,y:control[span-degree+j].y};
            for(var r=1;r<=degree;r++) for(var j=degree;j>=r;j--) {
                var left=knots[span-degree+j],right=knots[span+1+j-r],alpha=right===left?0:(t-left)/(right-left);
                d[j]={x:(1-alpha)*d[j-1].x+alpha*d[j].x,y:(1-alpha)*d[j-1].y+alpha*d[j].y};
            }
            result.push(G.point(d[degree].x,d[degree].y));
        }
        return result;
    }
    function parse(source,name,options) {
        options=options || {};
        var encoding='utf-8';
        if(typeof source!=='string') {
            var bytes=source instanceof Uint8Array?source:new Uint8Array(source);
            if(bytes.byteLength>16*1024*1024) throw Error('DXF files must be 16 MiB or smaller.');
            try {source=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}
            catch(error) {
                // Legacy ASCII DXF often has code-page text. Treat the bytes as
                // opaque single-byte characters so untouched records round-trip.
                encoding='bytes';source='';
                for(var offset=0;offset<bytes.length;offset+=8192)
                    source+=String.fromCharCode.apply(null,bytes.subarray(offset,offset+8192));
            }
        }
        var raw=tokenize(source),parsed;
        try {parsed=new DxfParser().parseSync(source.replace(/^\uFEFF/,''));}
        catch(error) {throw Error('Could not parse this DXF: '+error.message);}
        if(!parsed || !Array.isArray(parsed.entities)) throw Error('The DXF has no readable entities.');
        if(parsed.entities.length>100000) throw Error('This drawing has too many entities for the plate editor.');
        parsed.header=parsed.header || {};
        var unitFactors={1:25.4,2:304.8,4:1,5:10,6:1000,8:0.0000254,9:0.0254,13:0.001,14:100};
        var code=parsed.header.$INSUNITS,factor=unitFactors[code],confirmed=!!factor,inferred=false;
        if(options.units==='mm') {factor=1;confirmed=true;}
        else if(options.units==='in') {factor=25.4;confirmed=true;}
        else if(options.units==='cm') {factor=10;confirmed=true;}
        var curveTolerance=0.005/(factor || 1);
        var byHandle=Object.create(null),used=Object.create(null),primitives=[],unsupported=Object.create(null),sequence=0,totalPoints=0;
        raw.entities.forEach(function(record){if(record.handle) {
            var key=record.handle.toUpperCase();
            if(byHandle[key])throw Error('The DXF has duplicate entity handles. Repair the drawing in CAD before editing it.');
            byHandle[key]=record;
        }});
        function recordFor(entity) {
            var found=entity.handle && byHandle[String(entity.handle).toUpperCase()];
            if(!found) found=raw.entities.find(function(r){return !used[r.id] && r.type===entity.type;});
            if(found) used[found.id]=true;
            return found;
        }
        // dxf-parser omits extrusion on some entity classes (notably CIRCLE).
        // Read those values from the original records, including block children.
        var blockRecords=new WeakMap(),blockName=null,blockCursor=0;
        raw.records.forEach(function(r){
            if(r.section!=='BLOCKS')return;
            if(r.type==='BLOCK'){blockName=value(r,2,'');blockCursor=0;return;}
            if(r.type==='ENDBLK'){blockName=null;return;}
            var children=parsed.blocks?.[blockName]?.entities;
            if(children && children[blockCursor]?.type===r.type)blockRecords.set(children[blockCursor++],r);
        });
        function collect(entity,matrix,record,inBlock,depth) {
            if(depth>12) {unsupported['Nested blocks']=1;return;}
            var type=entity.type,points=[],closed=false,stitch=false,editable=!inBlock;
            // Autodesk OCS: with normal (0,0,-1), X is reversed and Y
            // is unchanged. Lines remain in WCS. Tilted planes stay untouched.
            var extrusion=entity.extrusionDirection || {x:entity.extrusionDirectionX || 0,y:entity.extrusionDirectionY || 0,z:entity.extrusionDirectionZ===undefined?1:entity.extrusionDirectionZ};
            var sourceRecord=inBlock?blockRecords.get(entity):record;
            if(sourceRecord && !options.legacyExtrusion)extrusion={x:number(sourceRecord,210,0),y:number(sourceRecord,220,0),z:number(sourceRecord,230,1)};
            if(options.legacyExtrusion && type==='INSERT')extrusion={x:0,y:0,z:1};
            var negative=Math.abs(extrusion.z+1)<1e-8;
            var ocs=['ARC','CIRCLE','LWPOLYLINE','INSERT'].includes(type) || (type==='POLYLINE' && !entity.is3dPolyline && !entity.isPolyfaceMesh);
            if(Math.abs(extrusion.x)>1e-8 || Math.abs(extrusion.y)>1e-8 ||
               (Math.abs(extrusion.z-1)>1e-8 && (!negative || options.legacyExtrusion || (!ocs && type!=='LINE')))){
                unsupported['Non-XY extrusion (not previewed)']=(unsupported['Non-XY extrusion (not previewed)'] || 0)+1;return;
            }
            var mirrored=negative && ocs;
            if(type==='INSERT') {
                var block=parsed.blocks && parsed.blocks[entity.name];
                if(!block) {unsupported['Missing block']=1;return;}
                var angle=(entity.rotation || 0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
                var sx=entity.xScale===undefined?1:entity.xScale,sy=entity.yScale===undefined?1:entity.yScale;
                var at=entity.position || {x:0,y:0},base=block.position || {x:0,y:0};
                var local=[c*sx,s*sx,-s*sy,c*sy,at.x-c*sx*base.x+s*sy*base.y,at.y-s*sx*base.x-c*sy*base.y];
                if(mirrored)local=G.multiply([-1,0,0,1,0,0],local);
                (block.entities || []).forEach(function(child){collect(child,G.multiply(matrix,local),record,true,depth+1);});
                return;
            }
            if(type==='LINE') {points=entity.vertices.map(function(p){return G.point(p.x,p.y);});stitch=true;}
            else if(type==='LWPOLYLINE' || type==='POLYLINE') {
                if(entity.isPolyfaceMesh || entity.is3dPolyline) editable=false;
                closed=!!entity.shape; points=G.polyline(entity.vertices || [],closed,curveTolerance);stitch=true;
            } else if(type==='ARC' || type==='CIRCLE') {
                var start=type==='CIRCLE'?0:entity.startAngle,sweep=type==='CIRCLE'?G.TAU:entity.endAngle-start;
                while(sweep<=0) sweep+=G.TAU;
                points=G.arc(entity.center,entity.radius,start,sweep,curveTolerance);closed=type==='CIRCLE';stitch=type==='ARC';
            } else if(type==='SPLINE') {
                points=splinePoints(entity);closed=!!entity.closed;
                // Stitch supported planar, non-rational splines without flattening
                // their source records. Rigid edits transform control points.
                var control=entity.controlPoints || [],knots=entity.knotValues || [],degree=entity.degreeOfSplineCurve;
                stitch=Number.isInteger(degree) && degree>=1 && degree<=3 && control.length>=degree+1 &&
                    knots.length===control.length+degree+1 && knots.every(function(n,i){return Number.isFinite(n) && (!i || n>=knots[i-1]);}) &&
                    knots[control.length]>knots[degree] && !entity.rational &&
                    !(record && record.pairs.some(function(p){return p.code===41 && Number(p.value)!==1;}));
                editable=editable && stitch;
            } else if(type==='ELLIPSE') {
                var major=entity.majorAxisEndPoint,radius=Math.hypot(major.x,major.y),rotation=Math.atan2(major.y,major.x);
                var start=entity.startAngle || 0,end=entity.endAngle===undefined?G.TAU:entity.endAngle;
                while(end<=start) end+=G.TAU;
                points=G.arc({x:0,y:0},radius,start,end-start,curveTolerance).map(function(p) {
                    var q=G.rotate({x:p.x,y:p.y*entity.axisRatio},rotation);
                    return G.point(q.x+entity.center.x,q.y+entity.center.y);
                });closed=Math.abs(end-start-G.TAU)<1e-6;editable=false;
            } else {
                unsupported[type]=(unsupported[type] || 0)+1;
                return;
            }
            if(!points.length) return;
            totalPoints+=points.length;
            if(totalPoints>250000) throw Error('This drawing is too detailed for the browser preview. Simplify it in CAD first.');
            if(mirrored)points=points.map(function(p){return G.point(-p.x,p.y);});
            // This editor operates on an XY plate at Z=0. Preserve 3D/offset
            // geometry rather than regenerating its cutouts in the wrong plane.
            if(record && record.pairs.some(function(p){return p.code>=30 && p.code<=38 && Math.abs(Number(p.value))>1e-8;})) editable=false;
            if(entity.thickness || ((type==='LWPOLYLINE' || type==='POLYLINE') && record && record.pairs.some(function(p) {
                return [40,41,43].includes(p.code) && Math.abs(Number(p.value))>1e-8;
            }))) editable=false;
            primitives.push({id:'path-'+(++sequence),raw:record,entity:entity,type:type,
                layer:entity.layer || '0',points:points.map(function(p){return G.transform(p,matrix);}),
                closed:closed,stitch:stitch,editable:editable && !!record,inBlock:!!inBlock});
        }
        parsed.entities.forEach(function(entity){collect(entity,IDENTITY,recordFor(entity),false,0);});
        if(!factor) {
            var best={factor:1,score:0};
            [1,25.4,10,0.1,1000].forEach(function(scale) {
                var score=0;
                var loops=G.contours(primitives.map(function(p) {
                    return {...p,points:p.points.map(function(v){return G.point(v.x*scale,v.y*scale);})};
                })).closed;
                loops.forEach(function(loop) {
                    var box=G.minimumBox(loop.points),a=box.width,b=box.height;
                    if((Math.abs(a-14)<0.3 && Math.abs(b-14)<0.3) ||
                        (Math.abs(Math.max(a,b)-15.5)<0.3 && Math.abs(Math.min(a,b)-12.8)<0.3)) score++;
                });
                if(score>best.score) best={factor:scale,score:score};
            });
            factor=best.factor;inferred=best.score>0;confirmed=false;
            if(factor>1) {
                // Inference happens in physical units. Resample raw-unit arcs
                // after it so an inch drawing does not get 25.4× coarser curves.
                curveTolerance=0.005/factor;primitives=[];unsupported=Object.create(null);used=Object.create(null);sequence=0;totalPoints=0;
                parsed.entities.forEach(function(entity){collect(entity,IDENTITY,recordFor(entity),false,0);});
            }
        }
        primitives.forEach(function(primitive) {
            primitive.points=primitive.points.map(function(p){return G.point(p.x*factor,p.y*factor);});
        });
        var paths=G.contours(primitives),allPoints=[];
        if(!options.legacyRefine)G.joinRedundantContours(paths);
        if(!options.legacyAssembly)G.joinCrossLayerContours(paths);
        if(!options.legacyFamilies)G.recoverSwitchCorners(paths,0,0,options.legacyAlignment);
        primitives.forEach(function(p){allPoints=allPoints.concat(p.points);});
        return {recognitionVersion:options.legacyFamilies?2:options.legacyAlignment?3:options.legacyAssembly?4:options.legacyRuns?5:options.legacyRefine?6:options.legacyPcb?7:options.legacyRoundedPcb?8:options.legacyWidePcb?9:options.legacyReadOnlyPcb?10:11,coordinateVersion:options.legacyExtrusion?1:2,source:source,encoding:encoding,name:name || 'plate.dxf',raw:raw,parsed:parsed,primitives:primitives,
            contours:paths.closed,open:paths.open,bounds:G.bounds(allPoints),factor:factor,
            units:{code:code,factor:factor,declaredFactor:unitFactors[code] || null,
                override:['mm','in','cm'].includes(options.units)?options.units:null,
                confirmed:confirmed,inferred:inferred},unsupported:unsupported};
    }
    function format(n) {
        if(!Number.isFinite(n) || Math.abs(n)>1e9) throw Error('Cannot export an invalid DXF coordinate.');
        return String(Math.abs(n)<1e-9?0:Number(n.toFixed(8)));
    }
    function exportEdits(document,edits,additions) {
        edits=edits || [];additions=additions || [];
        if(!edits.length && !additions.length) return document.source;
        if(!document.units.confirmed) throw Error('Confirm the drawing units before exporting geometry changes.');
        var source=document.source,eol=document.raw.eol,patches=[],seen=Object.create(null),seed=1n;
        var version=document.parsed.header.$ACADVER || 'AC1009';
        // Some legacy CAD exports omit every handle and even the HEADER. New
        // low-numbered handles would collide with handles assigned by a CAD
        // reader to those original records. Keep such R12 output handle-free.
        var emitHandles=Number(version.slice(2))>=1014 || document.raw.entities.every(function(record){return !!record.handle;});
        document.raw.pairs.forEach(function(pair) {
            if((pair.code===5 || pair.code===105 || (pair.code>=320 && pair.code<=369)) && /^[0-9a-f]+$/i.test(pair.value)) {
                var n=BigInt('0x'+pair.value);if(n>=seed) seed=n+1n;
            }
        });
        function handle(){return (seed++).toString(16).toUpperCase();}
        function tags(values){return values.map(function(v){return String(v);}).join(eol)+eol;}
        function ringText(ring,layer,owner) {
            var points=ring.slice();if(points.length>1 && G.distance(points[0],points[points.length-1])<1e-8) points.pop();
            if(points.length<3 || Math.abs(G.area(points))<1e-8) return '';
            var modern=Number(version.slice(2))>=1014;
            if(modern) {
                var values=[0,'LWPOLYLINE'];if(emitHandles)values.push(5,handle());
                if(owner) values.push(330,owner);
                values.push(100,'AcDbEntity',8,layer || '0',100,'AcDbPolyline',90,points.length,70,1);
                points.forEach(function(p){values.push(10,format(p.x/document.factor),20,format(p.y/document.factor));});
                return tags(values);
            }
            var result='';
            points.forEach(function(p,i) {
                var q=points[(i+1)%points.length],values=[0,'LINE'];if(emitHandles)values.push(5,handle());
                if(Number(version.slice(2))>=1012) {
                    if(owner)values.push(330,owner);
                    values.push(100,'AcDbEntity');
                }
                values.push(8,layer || '0');
                if(Number(version.slice(2))>=1012)values.push(100,'AcDbLine');
                values.push(10,format(p.x/document.factor),20,format(p.y/document.factor),30,0,
                    11,format(q.x/document.factor),21,format(q.y/document.factor),31,0);
                result+=tags(values);
            });
            return result;
        }
        function transformRecord(record,motion) {
            var local=[],pairs=record.pairs,angle=motion.angle || 0,inVertex=record.type!=='POLYLINE';
            var mirrored=document.coordinateVersion!==1 && ['ARC','CIRCLE','LWPOLYLINE','POLYLINE'].includes(record.type) && number(record,230,1)===-1;
            function move(x,y,direction) {
                var p=G.point((mirrored?-x:x)*document.factor,y*document.factor);
                if(direction) return G.rotate(p,angle);
                p=G.rotate(p,angle,motion.from);
                p=G.point(p.x+motion.to.x-motion.from.x,p.y+motion.to.y-motion.from.y);
                return mirrored?G.point(-p.x,p.y):p;
            }
            pairs.forEach(function(pair,i) {
                if(record.type==='POLYLINE' && pair.code===0) inVertex=pair.value==='VERTEX';
                if(inVertex && pair.code>=10 && pair.code<=13) {
                    var following=pairs[i+1];
                    if(!following || following.code!==pair.code+10) throw Error('This DXF point record cannot be safely transformed.');
                    var p=move(Number(pair.value),Number(following.value),record.type==='SPLINE' && pair.code>=12);
                    local.push({start:pair.valueStart,end:pair.valueEnd,text:format(p.x/document.factor)});
                    local.push({start:following.valueStart,end:following.valueEnd,text:format(p.y/document.factor)});
                } else if(record.type==='ARC' && (pair.code===50 || pair.code===51)) {
                    var degrees=((Number(pair.value)+(mirrored?-angle:angle)*180/Math.PI)%360+360)%360;
                    local.push({start:pair.valueStart,end:pair.valueEnd,text:format(degrees)});
                }
            });
            local.sort(function(a,b){return b.start-a.start;});
            var text=source.slice(record.start,record.end);
            local.forEach(function(p){text=text.slice(0,p.start-record.start)+p.text+text.slice(p.end-record.start);});
            return text;
        }
        edits.forEach(function(edit) {
            var record=edit.record;
            if(!record || seen[record.id]) throw Error('Several switch edits share the same DXF entity. Resolve that geometry before exporting.');
            seen[record.id]=true;
            var text='';
            if(edit.motion) {
                if(!['LINE','ARC','CIRCLE','LWPOLYLINE','POLYLINE','SPLINE'].includes(record.type))
                    throw Error('This entity type must be exploded in CAD before moving it.');
                text=transformRecord(record,edit.motion);
            }
            (edit.rings || []).forEach(function(ring){text+=ringText(ring,edit.layer || value(record,8,'0'),value(record,330,null));});
            patches.push({start:record.start,end:record.end,text:text});
        });
        var owner=document.raw.entities.map(function(r){return value(r,330,null);}).find(Boolean),extra='';
        additions.forEach(function(item){extra+=ringText(item.points,item.layer || '0',owner);});
        if(extra) patches.push({start:document.raw.end,end:document.raw.end,text:extra});
        var seedPair=null;
        document.raw.pairs.forEach(function(pair,i,list){if(pair.code===9 && pair.value==='$HANDSEED' && list[i+1]?.code===5) seedPair=list[i+1];});
        if(seedPair) patches.push({start:seedPair.valueStart,end:seedPair.valueEnd,text:seed.toString(16).toUpperCase()});
        patches.sort(function(a,b){return b.start-a.start;});
        var last=source.length+1;
        patches.forEach(function(p) {
            if(p.end>last) throw Error('DXF edits overlap; no file was generated.');
            source=source.slice(0,p.start)+p.text+source.slice(p.end);last=p.start;
        });
        return source;
    }
    function exportBytes(document,edits,additions) {
        var text=exportEdits(document,edits,additions);
        if(document.encoding!=='bytes') return new TextEncoder().encode(text);
        var bytes=new Uint8Array(text.length);
        for(var i=0;i<text.length;i++) {
            if(text.charCodeAt(i)>255) throw Error('A legacy DXF record cannot be encoded without changing its original bytes.');
            bytes[i]=text.charCodeAt(i);
        }
        return bytes;
    }
    return {parse:parse,exportEdits:exportEdits,exportBytes:exportBytes,tokenize:tokenize,splinePoints:splinePoints};
}));
