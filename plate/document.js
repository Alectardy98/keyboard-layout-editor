// A plate keeps its imported coordinate frame for its entire editing session.
// KLE uses Y-down key units; the source DXF uses Y-up millimetres. Only this
// module crosses that boundary. Source geometry is never mutated in place.
(function(root,factory) {
    if(typeof module==='object' && module.exports) module.exports=factory(require('./geometry.js'),require('./profiles.js'),require('./dxf.js'),require('./overlaps.js'));
    else root.PlateDocument=factory(root.PlateGeometry,root.PlateProfiles,root.PlateDxf,root.PlateOverlaps);
}(typeof globalThis!=='undefined'?globalThis:this,function(G,P,D,O) {
    'use strict';
    var PITCH=19.05,EPS=1e-7;
    function copy(value){return JSON.parse(JSON.stringify(value));}
    function degrees(angle){return angle*180/Math.PI;}
    function keyCenter(key) {
        return G.rotate({x:key.x+key.width/2,y:key.y+key.height/2},
            (key.rotation_angle || 0)*Math.PI/180,{x:key.rotation_x || 0,y:key.rotation_y || 0});
    }
    function physical(key,frame) {
        var center=keyCenter(key);
        return {center:G.point(frame.x+center.x*PITCH,frame.y-center.y*PITCH),angle:-(key.rotation_angle || 0)*Math.PI/180};
    }
    function position(key,center,angle,frame) {
        var point={x:(center.x-frame.x)/PITCH,y:(frame.y-center.y)/PITCH};
        key.rotation_angle=-degrees(angle);key.rotation_x=point.x;key.rotation_y=point.y;
        key.x=Math.round((point.x-key.width/2)*1e9)/1e9;key.y=Math.round((point.y-key.height/2)*1e9)/1e9;
    }
    function records(contours) {
        return [...new Map(contours.flatMap(function(c){return c.parts;}).filter(function(p){return p.raw;})
            .map(function(p){return [p.raw.id,p.raw];})).values()];
    }
    function sourcePolygons(key) {
        return P.union(key.contours.map(function(c){return P.polygon(c.points);}));
    }
    function create(document,recognized) {
        var keys=recognized.keys,margin=PITCH/2;
        // An immutable margin permits wider caps without negative KLE
        // coordinates. It does not translate or resize the actual DXF drawing.
        var frame={x:document.bounds.minX-margin,y:document.bounds.maxY+margin,pitch:PITCH};
        // Derive the display origin from a key, not arbitrary drawing margins.
        // Only the coordinate transform changes: physical DXF centres stay exact.
        if(keys.length && keys.every(function(k){return Math.abs(k.capAngle)<EPS;})) {
            var ref=keys[0],left=ref.center.x-ref.width*PITCH/2,top=ref.center.y+ref.height*PITCH/2;
            var minLeft=Math.min(...keys.map(function(k){return k.center.x-k.width*PITCH/2+Math.min(0,k.capShape?.x2 || 0)*PITCH;}));
            var maxTop=Math.max(...keys.map(function(k){return k.center.y+k.height*PITCH/2-Math.min(0,k.capShape?.y2 || 0)*PITCH;}));
            frame.x=left-(Math.ceil(Math.max(0,left-minLeft)/PITCH*4)/4+.5)*PITCH;
            frame.y=top+(Math.ceil(Math.max(0,maxTop-top)/PITCH*4)/4+.5)*PITCH;
        }
        var original=Object.create(null),settings=Object.create(null),next=1;
        var groups=[];
        keys.filter(function(k){return k.recovered;}).forEach(function(k){
            if(groups.some(function(g){return g.loop===k.sharedLoop;}))return;
            groups.push(O.create(k.sharedLoop,keys.filter(function(q){return q.sharedLoop===k.sharedLoop;}),!!k.sharedMaterial));
        });
        keys.forEach(function(key){original[key.id]=key;settings[key.id]={anchor:null,profile:null};});
        if(keys.length) settings[keys[0].id].anchor={center:copy(keys[0].center),angle:keys[0].capAngle};
        var assemblies=[];
        keys.filter(function(k){return k.assembly;}).forEach(function(k){if(!assemblies.some(function(a){return a.name===k.assembly;}))assemblies.push({name:k.assembly,ids:keys.filter(function(n){return n.assembly===k.assembly;}).map(function(n){return n.id;})});});
        function id(){var name;do{name='new-'+next++;}while(settings[name]);return name;}
        function makeKeys(defaultKey) {
            return keys.map(function(source,index) {
                var key=defaultKey();key.width=key.width2=source.width;key.height=key.height2=source.height;
                if(source.capShape)Object.assign(key,source.capShape);
                key.labels=[source.label || (source.recovered?'Probable '+source.type:source.type==='ec11'?'EC11':'Key '+(index+1))];key._plateId=source.id;
                position(key,source.center,source.capAngle,frame);return key;
            });
        }
        function ensure(key,seen) {
            if(!key._plateId || seen.has(key._plateId) || !settings[key._plateId]) {
                key._plateId=id();settings[key._plateId]={anchor:null,profile:null};
            }
            seen.add(key._plateId);return settings[key._plateId];
        }
        function reconcile(before,after,options) {
            options=options || {};
            if(after.length>2000) throw Error('A plate may have at most 2,000 keys.');
            var old=new Map(before.map(function(k){return [k._plateId,k];})),seen=new Set(),blocked=0;
            after.forEach(function(key) {
                var config=ensure(key,seen),previous=old.get(key._plateId),source=original[key._plateId];
                if(previous) {
                    // Plate cap dimensions use quarter-key units, never quarter
                    // millimetres. Do not quantize the measured switch position.
                    ['width','height','width2','height2'].forEach(function(field){
                        if(key[field]!==previous[field] && Number.isFinite(key[field]))key[field]=Math.round(key[field]*4)/4;
                    });
                    if(options.keepStemOnResize!==false) {
                        key.x-=(key.width-previous.width)/2;key.y-=(key.height-previous.height)/2;
                    }
                    var fixed=config.anchor || (source && (!source.editable || (source.recovered && !config.confirmed))?{center:source.center,angle:source.capAngle}:null);
                    if(fixed) {
                        var current=physical(key,frame);
                        if(G.distance(current.center,fixed.center)>EPS || Math.abs(current.angle-fixed.angle)>EPS) blocked++;
                        position(key,fixed.center,fixed.angle,frame);
                    }
                }
            });
            before.forEach(function(key) {
                var config=settings[key._plateId],source=original[key._plateId];
                if(config && !config.excluded && (config.anchor || (source && (!source.editable || (source.recovered && !config.confirmed)))) && !seen.has(key._plateId)) {after.push(key);blocked++;}
            });
            // Multi-layout spacebar pairs are two caps but one rigid cutout
            // assembly. Moving either cap moves the other; resizing retains
            // both stems. A partial deletion removes the pair unless anchored.
            assemblies.forEach(function(group){
                var previous=group.ids.map(function(id){return old.get(id);});if(previous.some(function(k){return !k;}))return;
                var current=group.ids.map(function(id){return after.find(function(k){return k._plateId===id;});});
                var fixed=group.ids.some(function(id){return settings[id].anchor||settings[id].excluded;});
                if(current.some(function(k){return !k;})){
                    if(fixed){previous.forEach(function(k,i){if(!current[i])after.push(copy(k));});blocked++;}
                    else for(var i=after.length-1;i>=0;i--)if(group.ids.includes(after[i]._plateId))after.splice(i,1);
                    return;
                }
                var from=previous.map(function(k){return physical(k,frame);}),to=current.map(function(k){return physical(k,frame);});
                var changed=to.map(function(p,i){return G.distance(p.center,from[i].center)>EPS||Math.abs(p.angle-from[i].angle)>EPS;});
                var first=changed.indexOf(true);if(first<0)return;
                var delta=to[first].angle-from[first].angle;
                var target=from.map(function(p){var q=G.rotate(p.center,delta,from[first].center);return {center:{x:q.x+to[first].center.x-from[first].center.x,y:q.y+to[first].center.y-from[first].center.y},angle:p.angle+delta};});
                var conflict=fixed||target.some(function(p,i){return changed[i]&&(G.distance(p.center,to[i].center)>.001||Math.abs(p.angle-to[i].angle)>EPS);});
                current.forEach(function(k,i){var p=conflict?from[i]:target[i];position(k,p.center,p.angle,frame);});if(conflict)blocked++;
            });
            return blocked;
        }
        function setAnchors(selected,enabled) {
            selected.forEach(function(key) {
                var config=settings[key._plateId];if(config) config.anchor=enabled?physical(key,frame):null;
            });
        }
        function exclude(selected) {
            selected.forEach(function(key) {
                if(!original[key._plateId])throw Error('Only imported openings can be marked as fixed drawing geometry.');
            });
            selected.forEach(function(key){settings[key._plateId]={anchor:null,profile:null,excluded:true};});
        }
        function apply(selected,options) {
            if(!selected.length) throw Error('Select at least one key in the plate preview or KLE layout.');
            var staged=[];
            selected.forEach(function(key) {
                var source=original[key._plateId];
                if(source && !source.editable) throw Error('This key has a block, overlapping entity, unsupported plane or nonzero polyline width/thickness. Resolve it in CAD before editing.');
                if(source && source.recovered && !settings[key._plateId].confirmed)throw Error('Confirm the recovered geometry before editing this probable key.');
                var profile=copy(options);
                // Validate the complete batch before changing any settings.
                if(profile.switch!=='original') P.switchShape(profile);
                if(profile.stabilizer!=='original') P.stabilizers(profile,key);
                if(!source && profile.switch==='original') throw Error('A new key needs an explicit switch profile.');
                staged.push({key:key,profile:profile.switch==='original' && profile.stabilizer==='original'?null:
                    {options:profile,size:{width:key.width,height:key.height}}});
            });
            staged.forEach(function(item){settings[item.key._plateId].profile=item.profile;});
        }
        function shape(source,profile) {
            var options=profile.options,base;
            if(!source) return P.generate(options,profile.size);
            // Work in the key's original local frame. The switch centre comes
            // from its straight core edges, not the bounding box of its stabs.
            var local=P.place(sourcePolygons(source),{x:-source.center.x,y:-source.center.y},0);
            local=P.place(local,{x:0,y:0},-source.capAngle);
            var core=P.polygon(G.rectangle(source.core.width,source.core.height,{x:0,y:0},source.holeAngle-source.capAngle));
            base=options.switch==='original'?P.clip.intersection(local,core):[P.switchShape(options)];
            if(options.stabilizer==='original') {
                if(options.switch==='original') return local;
                // Retain the original compound stabs around the old core. A
                // deliberate profile replacement is the only tessellated path.
                return P.clip.union(base,P.clip.difference(local,core));
            }
            return P.clip.union(base,...P.stabilizers(options,profile.size));
        }
        function confirm(selected){
            selected.forEach(function(k){if(original[k._plateId]?.recovered)settings[k._plateId].confirmed=true;});
        }
        var contoursById=new Map(document.contours.map(function(c){return [c.id,c];}));
        function supportOwners(){
            var owners=new Map();
            Object.values(original).forEach(function(k){k.contours.concat(k.stabilizers).forEach(function(c){owners.set(c.id,k.id);});});
            Object.keys(settings).forEach(function(id){
                var extra=settings[id].supports || [];
                if(!Array.isArray(extra) || extra.length>64)throw Error('Invalid extra stabilizer list.');
                extra.forEach(function(cid){
                    var c=contoursById.get(cid);
                    if(!original[id] || !c || !c.editable || owners.has(cid))throw Error('An extra stabilizer is unsupported or already owned by a key.');
                    owners.set(cid,id);
                });
            });
            Object.keys(settings).forEach(function(id){
                var bindings=settings[id].bindings || [];
                if(!Array.isArray(bindings) || bindings.length>64)throw Error('Invalid shape bindings.');
                bindings.forEach(function(binding){
                    var c=contoursById.get(binding.contour);
                    if(!c || !c.editable || owners.has(c.id) || !Number.isFinite(binding.angle) || (!original[id] && !settings[id].profile) || Object.values(original).some(function(k){return G.contains(c.points,k.center);}))throw Error('Invalid or already owned bound shape.');
                    G.point(binding.center?.x,binding.center?.y);owners.set(c.id,id);
                });
            });
            var deleted=settings['shape-deletions']?.deletedContours || [];
            if(!Array.isArray(deleted) || deleted.length>document.contours.length)throw Error('Invalid deleted shape list.');
            deleted.forEach(function(cid){var c=contoursById.get(cid);
                if(!c || !c.editable || owners.has(cid) || Object.values(original).some(function(k){return G.contains(c.points,k.center);}))throw Error('Invalid deleted shape.');
                owners.set(cid,'shape-deletions');
            });
            return owners;
        }
        function withSupports(source){
            return Object.assign({},source,{stabilizers:source.stabilizers.concat((settings[source.id]?.supports || []).map(function(id){return contoursById.get(id);}))});
        }
        function nearbySupports(key){
            var source=original[key?._plateId];if(!source || !source.editable || settings[source.id]?.excluded)return [];
            var owners=supportOwners(),included=settings[source.id].supports || [];
            return document.contours.filter(function(c){
                if(included.includes(c.id))return true;
                if(!c.editable || owners.has(c.id))return false;
                var b=G.bounds(c.points),local=G.rotate({x:b.cx-source.center.x,y:b.cy-source.center.y},-source.capAngle);
                return b.width<=20 && b.height<=20 && Math.min(b.width,b.height)>=.5 &&
                    Math.abs(local.x)<=Math.max(key.width,key.width2 || 0)*PITCH/2+10 &&
                    Math.abs(local.y)<=Math.max(key.height,key.height2 || 0)*PITCH/2+10;
            }).map(function(c){var b=G.bounds(c.points);return {id:c.id,width:b.width,height:b.height,included:included.includes(c.id),
                dx:b.cx-source.center.x,dy:b.cy-source.center.y};}).sort(function(a,b){return Number(b.included)-Number(a.included)||Math.hypot(a.dx,a.dy)-Math.hypot(b.dx,b.dy);});
        }
        function setSupport(key,cid,include){
            var source=original[key?._plateId],config=settings[key?._plateId];
            if(!source || !source.editable || config.excluded)throw Error('Select an editable imported key.');
            if(include){
                var at=physical(key,frame);
                if(G.distance(at.center,source.center)>EPS || Math.abs(at.angle-source.capAngle)>EPS)
                    throw Error('Include nearby supports before moving this key. Undo its move first.');
                if(config.profile && optionsReplacesStabs(config.profile))throw Error('Choose Keep imported stabilizers and apply before including source openings.');
                if(!nearbySupports(key).some(function(c){return c.id===cid && !c.included;}))throw Error('This opening is not an available nearby support.');
                config.supports=(config.supports || []).concat([cid]);
            }else config.supports=(config.supports || []).filter(function(id){return id!==cid;});
            supportOwners();
        }
        function selectableContours(){
            var owners=supportOwners();
            return document.contours.filter(function(c){return c.editable && !owners.has(c.id) &&
                !Object.values(original).some(function(k){return G.contains(c.points,k.center);});
            }).map(function(c){return c.id;});
        }
        function validateShapeSelection(ids){
            var available=selectableContours();
            if(!Array.isArray(ids) || !ids.length || ids.length>64 || new Set(ids).size!==ids.length || !ids.every(function(id){return available.includes(id);}))throw Error('Select between one and 64 unassigned editable shapes.');
        }
        function deleteShapes(ids){
            validateShapeSelection(ids);
            var previous=settings['shape-deletions']?.deletedContours || [];
            settings['shape-deletions']={deletedContours:previous.concat(ids)};
        }
        function bindShapes(ids,key){
            validateShapeSelection(ids);
            var config=settings[key?._plateId],source=original[key?._plateId];
            if(!config || config.excluded || key.decal || (source && (!source.editable || (source.recovered && !config.confirmed))))throw Error('Select an editable key; confirm recovered geometry first if needed.');
            if(!source && !config.profile)throw Error('Apply a switch profile to this key first.');
            var previous=config.bindings || [],at=physical(key,frame);
            if(previous.length+ids.length>64)throw Error('A key can bind at most 64 additional shapes.');
            config.bindings=previous.concat(ids.map(function(cid){return {contour:cid,center:copy(at.center),angle:at.angle};}));
        }
        function manualSource(name,ids){
            if(!Array.isArray(ids)||!ids.length||ids.length>64||new Set(ids).size!==ids.length)throw Error('Select between one and 64 separate openings.');
            var contours=ids.map(function(cid){var c=contoursById.get(cid);
                if(!c || !c.editable || Object.values(original).some(function(k){return k.contours.concat(k.stabilizers).some(function(p){return p.id===cid;}) || G.contains(c.points,k.center);}))
                    throw Error('Selected geometry is unsupported, is a plate outline, or already belongs to a key.');
                return c;
            }),b=G.bounds(contours[0].points);
            return {id:name,manual:true,center:{x:b.cx,y:b.cy},capAngle:0,holeAngle:0,type:'unknown',
                core:{width:b.width,height:b.height},contours:contours,stabilizers:[],editable:true,width:1,height:1};
        }
        function addFromContours(ids,defaultKey,width,height,label){
            if(![width,height].every(function(n){return Number.isFinite(n)&&n>=.5&&n<=24&&Math.abs(n*4-Math.round(n*4))<1e-8;}))throw Error('Key sizes must be 0.5–24u in quarter-unit steps.');
            if(typeof label!=='string'||label.length>80)throw Error('Use a key name of at most 80 characters.');
            var available=selectableContours();if(!ids.every(function(cid){return available.includes(cid);}))throw Error('Select unassigned editable openings.');
            var name=id(),source=manualSource(name,ids),key=defaultKey();
            key._plateId=name;key.width=key.width2=width;key.height=key.height2=height;key.labels=[label || 'Custom key'];
            position(key,source.center,0,frame);original[name]=source;
            settings[name]={anchor:null,profile:null,sourceContours:ids.slice()};return key;
        }
        function plan(layout) {
            supportOwners();
            var edits=[],additions=[],preview=[],owners=new Map(),warnings=[];
            var current=new Map(layout.filter(function(k){return !k.decal;}).map(function(k){return [k._plateId,k];}));
            assemblies.forEach(function(group){
                var members=group.ids.map(function(id){return current.get(id);}),excluded=group.ids.filter(function(id){return settings[id]?.excluded;});
                if(excluded.length&&excluded.length!==group.ids.length)throw Error('Mark both compatibility-assembly keys as fixed together.');
                if(excluded.length||members.every(function(k){return !k;}))return;
                if(members.some(function(k){return !k;}))throw Error('Remove both compatibility-assembly keys together.');
                var a=original[group.ids[0]],b=original[group.ids[1]],pa=physical(members[0],frame),pb=physical(members[1],frame),delta=pa.angle-a.capAngle;
                var expected=G.rotate(b.center,delta,a.center);expected={x:expected.x+pa.center.x-a.center.x,y:expected.y+pa.center.y-a.center.y};
                if(G.distance(expected,pb.center)>.001||Math.abs(pb.angle-b.capAngle-delta)>EPS)throw Error('Compatibility-assembly keys must keep their relative positions.');
            });
            function claim(record,key) {
                if(owners.has(record.id) && owners.get(record.id)!==key) throw Error('Two keys share a DXF entity. Resolve the overlapping source geometry in CAD first.');
                owners.set(record.id,key);
            }
            Object.keys(original).forEach(function(name) {
                var source=withSupports(original[name]),key=current.get(name),config=settings[name] || {},profile=config.profile;
                if(source.recovered)return;
                if(source.cornerRecovery && !warnings.some(function(w){return w.startsWith('Some source corner joins');}))warnings.push('Some source corner joins needed recovery. Import and movement retain the original records; replacing an opening regenerates its contour.');
                var all=source.contours.concat(source.stabilizers),raw=records(all);
                if(config.excluded) {
                    all.forEach(function(c){preview.push({key:null,points:c.points,closed:true});});return;
                }
                if(!key) {
                    if(!source.editable) throw Error('An unsupported source key cannot be removed safely.');
                    raw.forEach(function(record){claim(record,name);edits.push({record:record});});return;
                }
                var at=physical(key,frame),motion={from:source.center,to:at.center,angle:at.angle-source.capAngle};
                var moved=G.distance(at.center,source.center)>EPS || Math.abs(motion.angle)>EPS;
                if((moved || profile) && !source.editable) throw Error('Unsupported key geometry must remain unchanged.');
                if(!profile) {
                    if(moved) raw.forEach(function(record){claim(record,name);edits.push({record:record,motion:motion});});
                    all.forEach(function(contour) {
                        if(contour.displayParts){
                            contour.displayParts.forEach(function(p){preview.push({key:name,closed:p.closed,points:p.points.map(function(v){
                                var q=G.rotate(v,motion.angle,source.center);return {x:q.x+at.center.x-source.center.x,y:q.y+at.center.y-source.center.y};
                            })});});
                        }
                        preview.push({key:name,hitOnly:!!contour.displayParts,points:contour.points.map(function(p){var q=G.rotate(p,motion.angle,source.center);return {x:q.x+at.center.x-source.center.x,y:q.y+at.center.y-source.center.y};}),closed:true});
                    });return;
                }
                var replace=optionsReplacesStabs(profile)?all:source.contours;
                var replaceRecords=records(replace),placed=P.place(shape(source,profile),at.center,at.angle);
                var contours=P.rings(placed);
                replaceRecords.forEach(function(record,index){claim(record,name);edits.push({record:record,rings:index===0?contours:[]});});
                contours.forEach(function(points){preview.push({key:name,points:points,closed:true});});
                if(!optionsReplacesStabs(profile)) {
                    records(source.stabilizers).forEach(function(record){if(moved){claim(record,name);edits.push({record:record,motion:motion});}});
                    source.stabilizers.forEach(function(contour){preview.push({key:name,closed:true,points:contour.points.map(function(p){var q=G.rotate(p,motion.angle,source.center);return {x:q.x+at.center.x-source.center.x,y:q.y+at.center.y-source.center.y};})});});
                }
                if(profile.size.width!==key.width || profile.size.height!==key.height)
                    warnings.push(name+': keycap size changed; applied stabilizer spacing is retained. Reapply the pattern to change it.');
            });
            groups.forEach(function(group){
                var changed=false,shapes=[],supportShapes=[];
                group.keys.forEach(function(originalSource,index){
                    var source=withSupports(originalSource);
                    var key=current.get(source.id),config=settings[source.id] || {},excluded=config.excluded;
                    var at=key?physical(key,frame):{center:source.center,angle:source.capAngle};
                    var moved=G.distance(at.center,source.center)>EPS || Math.abs(at.angle-source.capAngle)>EPS;
                    var edited=!excluded && (!key || moved || !!config.profile);
                    if(edited && !config.confirmed)throw Error('Confirm the recovered geometry before editing this probable key.');
                    changed=changed||edited;
                    var portion=group.portions[index],shape=portion;
                    if(!key && !excluded)shape=[];
                    else if(!excluded && config.profile){
                        var opts=config.profile.options;
                        if(opts.switch!=='original')shape=P.place([P.switchShape(opts)],source.center,source.capAngle);
                        // Keep the shared remainder fixed; stabilizer edits own
                        // only the separately associated support openings.
                        if(opts.stabilizer!=='original')supportShapes.push(...P.place(P.stabilizers(opts,config.profile.size),at.center,at.angle));
                    }
                    if(!excluded && key){
                        shape=P.place(P.place(shape,{x:-source.center.x,y:-source.center.y},0),{x:0,y:0},at.angle-source.capAngle);
                        shape=P.place(shape,at.center,0);
                    }
                    shapes.push(shape);
                    var removeStabs=!excluded && (!key || (config.profile && optionsReplacesStabs(config.profile)));
                    records(source.stabilizers).forEach(function(record){
                        if(removeStabs){claim(record,source.id);edits.push({record:record});}
                        else if(moved && !excluded){claim(record,source.id);edits.push({record:record,motion:{from:source.center,to:at.center,angle:at.angle-source.capAngle}});}
                    });
                    if(!removeStabs)source.stabilizers.forEach(function(c){preview.push({key:source.id,closed:true,points:c.points.map(function(p){
                        if(excluded || !key)return p;var q=G.rotate(p,at.angle-source.capAngle,source.center);return {x:q.x+at.center.x-source.center.x,y:q.y+at.center.y-source.center.y};
                    })});});
                    // Filled hit areas are not cut lines. Fixed mounting openings take
                    // priority over both the key highlight and its selection area.
                    group.selectable(shape).forEach(function(polygon){
                        var rings=P.rings([polygon]);
                        preview.push({key:source.id,points:rings[0],holes:rings.slice(1),closed:true,hitOnly:true});
                    });
                });
                var raw=records([group.loop]);
                if(changed){
                    var composed=group.compose(shapes.concat(supportShapes.map(function(p){return [p];}))),rings=P.rings(composed);
                    raw.forEach(function(record,index){claim(record,'shared-'+group.loop.id);edits.push({record:record,rings:index===0?rings:[]});});
                    rings.forEach(function(points){preview.push({key:null,points:points,closed:true});});
                }else preview.push({key:null,points:group.loop.points,closed:true});
            });
            current.forEach(function(key,name) {
                if(original[name])return;
                var profile=settings[name]?.profile;
                if(!profile) {warnings.push(name+': choose and apply a switch profile before exporting this new key.');return;}
                var at=physical(key,frame);
                P.rings(P.place(shape(null,profile),at.center,at.angle)).forEach(function(points){
                    additions.push({points:points});preview.push({key:name,points:points,closed:true});
                });
            });
            // Source outline, mounting holes, annotations and unrecognized
            // entities are rendered and exported exactly where they were.
            var used=new Set(Object.values(original).map(withSupports).flatMap(function(k){return k.contours.concat(k.stabilizers).flatMap(function(c){return c.parts.map(function(p){return p.id;});});}));
            // Explicit bindings are independent of switch/stabilizer profiles.
            // Their reference is the key pose at binding time, so attaching to
            // an already moved or rotated key does not make the shape jump.
            Object.keys(settings).forEach(function(name){
                (settings[name].bindings || []).forEach(function(binding){
                    var c=contoursById.get(binding.contour),key=current.get(name),at=key?physical(key,frame):null;
                    c.parts.forEach(function(p){used.add(p.id);});
                    var moved=at && (G.distance(at.center,binding.center)>EPS || Math.abs(at.angle-binding.angle)>EPS);
                    records([c]).forEach(function(record){
                        if(!key || moved){claim(record,name);edits.push({record:record,...(key?{motion:{from:binding.center,to:at.center,angle:at.angle-binding.angle}}:{})});}
                    });
                    if(key)preview.push({key:name,closed:true,points:c.points.map(function(p){var q=G.rotate(p,at.angle-binding.angle,binding.center);return {x:q.x+at.center.x-binding.center.x,y:q.y+at.center.y-binding.center.y};})});
                });
            });
            (settings['shape-deletions']?.deletedContours || []).forEach(function(cid){var c=contoursById.get(cid);
                c.parts.forEach(function(p){used.add(p.id);});
                records([c]).forEach(function(record){claim(record,'shape-deletions');edits.push({record:record});});
            });
            // Joined source LINE/ARC contours need one closed hit region.
            // Per-primitive paths leave their interiors unclickable even though
            // the complete unrecognized opening is safely selectable.
            var drawn=new Set();
            document.contours.forEach(function(c){
                if(c.parts.every(function(p){return !used.has(p.id);})){
                    preview.push({key:null,contour:c.id,points:c.points,closed:true});
                    c.parts.forEach(function(p){drawn.add(p.id);});
                }
            });
            var contourForPart=new Map();document.contours.forEach(function(c){c.parts.forEach(function(p){contourForPart.set(p.id,c.id);});});
            document.primitives.forEach(function(p){if(!used.has(p.id) && !drawn.has(p.id)) preview.push({key:null,contour:contourForPart.get(p.id),points:p.points,closed:p.closed});});
            return {edits:edits,additions:additions,paths:preview,warnings:warnings};
        }
        function optionsReplacesStabs(profile){return profile.options.stabilizer!=='original';}
        function exportFile(layout) {
            var result=plan(layout);
            if(result.warnings.some(function(w){return w.includes('before exporting');})) throw Error(result.warnings.find(function(w){return w.includes('before exporting');}));
            return D.exportBytes(document,result.edits,result.additions);
        }
        return {document:document,recognition:recognized,frame:frame,original:original,settings:settings,
            selectableContours:selectableContours,deleteShapes:deleteShapes,bindShapes:bindShapes,addFromContours:addFromContours,nearbySupports:nearbySupports,setSupport:setSupport,makeKeys:makeKeys,reconcile:reconcile,confirm:confirm,groups:groups,setAnchors:setAnchors,exclude:exclude,apply:apply,plan:plan,exportFile:exportFile,
            physical:function(key){return physical(key,frame);},position:function(key,center,angle){position(key,center,angle,frame);},
            snapshot:function(){return copy(settings);},restore:function(snapshot){
                settings=copy(snapshot);
                Object.keys(original).forEach(function(id){if(original[id].manual)delete original[id];});
                Object.keys(settings).forEach(function(id){if(settings[id].sourceContours){
                    if(!/^new-\d+$/.test(id))throw Error('Invalid manually identified key.');
                    original[id]=manualSource(id,settings[id].sourceContours);
                }});
                supportOwners();
                // Older projects did not recognize every miscellaneous opening.
                // Missing references stay fixed, rather than becoming deletions.
                Object.keys(original).forEach(function(id){if(!settings[id])settings[id]={anchor:null,profile:null,excluded:true};});
                this.settings=settings;
            }};
    }
    // Rigidly align an incoming layout to one or more explicit anchor pairs.
    // Distances must agree; scaling a plate to make mismatched anchors fit would
    // also move mounting holes relative to the switches and is never allowed.
    function alignment(pairs) {
        if(!pairs.length) throw Error('Choose at least one anchor correspondence.');
        var angle=0;
        if(pairs.length>1) {
            var a=pairs[0],b=pairs[1],incoming=G.distance(a.from,b.from),target=G.distance(a.to,b.to);
            if(incoming<0.1 || Math.abs(incoming-target)>0.1) throw Error('Anchor distances differ. The layout cannot be aligned without scaling.');
            angle=Math.atan2(b.to.y-a.to.y,b.to.x-a.to.x)-Math.atan2(b.from.y-a.from.y,b.from.x-a.from.x);
        }
        var rotated=G.rotate(pairs[0].from,angle),offset={x:pairs[0].to.x-rotated.x,y:pairs[0].to.y-rotated.y};
        function move(p){var q=G.rotate(p,angle);return {x:q.x+offset.x,y:q.y+offset.y};}
        if(pairs.some(function(pair){return G.distance(move(pair.from),pair.to)>0.1;})) throw Error('The selected anchors do not agree under a rigid alignment.');
        return {angle:angle,move:move};
    }
    return {create:create,physical:physical,keyCenter:keyCenter,position:position,alignment:alignment,PITCH:PITCH};
}));
