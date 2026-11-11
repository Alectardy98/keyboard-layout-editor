// A plate keeps its imported coordinate frame for its entire editing session.
// KLE uses Y-down key units; the source DXF uses Y-up millimetres. Only this
// module crosses that boundary. Source geometry is never mutated in place.
(function(root,factory) {
    if(typeof module==='object' && module.exports) module.exports=factory(require('./geometry.js'),require('./profiles.js'),require('./dxf.js'));
    else root.PlateDocument=factory(root.PlateGeometry,root.PlateProfiles,root.PlateDxf);
}(typeof globalThis!=='undefined'?globalThis:this,function(G,P,D) {
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
        key.x=point.x-key.width/2;key.y=point.y-key.height/2;
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
        var original=Object.create(null),settings=Object.create(null),next=1;
        keys.forEach(function(key){original[key.id]=key;settings[key.id]={anchor:null,profile:null};});
        if(keys.length) settings[keys[0].id].anchor={center:copy(keys[0].center),angle:keys[0].capAngle};
        function id(){var name;do{name='new-'+next++;}while(settings[name]);return name;}
        function makeKeys(defaultKey) {
            return keys.map(function(source,index) {
                var key=defaultKey();key.width=key.width2=source.width;key.height=key.height2=source.height;
                key.labels=['Key '+(index+1)];key._plateId=source.id;
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
                    if(options.keepStemOnResize!==false) {
                        key.x-=(key.width-previous.width)/2;key.y-=(key.height-previous.height)/2;
                    }
                    var fixed=config.anchor || (source && !source.editable?{center:source.center,angle:source.capAngle}:null);
                    if(fixed) {
                        var current=physical(key,frame);
                        if(G.distance(current.center,fixed.center)>EPS || Math.abs(current.angle-fixed.angle)>EPS) blocked++;
                        position(key,fixed.center,fixed.angle,frame);
                    }
                }
            });
            before.forEach(function(key) {
                var config=settings[key._plateId],source=original[key._plateId];
                if(config && !config.excluded && (config.anchor || (source && !source.editable)) && !seen.has(key._plateId)) {after.push(key);blocked++;}
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
        function plan(layout) {
            var edits=[],additions=[],preview=[],owners=new Map(),warnings=[];
            var current=new Map(layout.filter(function(k){return !k.decal;}).map(function(k){return [k._plateId,k];}));
            function claim(record,key) {
                if(owners.has(record.id) && owners.get(record.id)!==key) throw Error('Two keys share a DXF entity. Resolve the overlapping source geometry in CAD first.');
                owners.set(record.id,key);
            }
            Object.keys(original).forEach(function(name) {
                var source=original[name],key=current.get(name),config=settings[name] || {},profile=config.profile;
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
                        preview.push({key:name,points:contour.points.map(function(p){var q=G.rotate(p,motion.angle,source.center);return {x:q.x+at.center.x-source.center.x,y:q.y+at.center.y-source.center.y};}),closed:true});
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
            var used=new Set(Object.values(original).flatMap(function(k){return k.contours.concat(k.stabilizers).flatMap(function(c){return c.parts.map(function(p){return p.id;});});}));
            document.primitives.forEach(function(p){if(!used.has(p.id)) preview.push({key:null,points:p.points,closed:p.closed});});
            return {edits:edits,additions:additions,paths:preview,warnings:warnings};
        }
        function optionsReplacesStabs(profile){return profile.options.stabilizer!=='original';}
        function exportFile(layout) {
            var result=plan(layout);
            if(result.warnings.some(function(w){return w.includes('before exporting');})) throw Error(result.warnings.find(function(w){return w.includes('before exporting');}));
            return D.exportBytes(document,result.edits,result.additions);
        }
        return {document:document,recognition:recognized,frame:frame,original:original,settings:settings,
            makeKeys:makeKeys,reconcile:reconcile,setAnchors:setAnchors,exclude:exclude,apply:apply,plan:plan,exportFile:exportFile,
            physical:function(key){return physical(key,frame);},position:function(key,center,angle){position(key,center,angle,frame);},
            snapshot:function(){return copy(settings);},restore:function(snapshot){
                settings=copy(snapshot);this.settings=settings;
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
