// Thin Angular/KLE adapter. Recognition, dimensions and DXF rewriting are kept
// in independent modules so a UI change cannot silently change plate geometry.
(function(root) {
    'use strict';
    var G=root.PlateGeometry,D=root.PlateDxf,R=root.PlateRecognize,M=root.PlateDocument;
    function attach(scope,hooks) {
        var workspace=!!root.KLE_PLATE_WORKSPACE;
        var ui=scope.plate={workspace:workspace,model:null,error:'',notice:'',busy:false,paths:[],warnings:[],
            units:'mm',layer:'',layers:[],options:{switch:'original',stabilizer:'original',direction:'south',mount:'plate',mxPattern:'cherry',
                axis:'auto',switchRotation:0,extraSize:0,spacing:'',stemOffset:0},
            stabChoice:'original',pending:null,mappingShapes:false,pickedShapes:[],shapeKey:{name:'Custom key',width:1,height:1}};
        function guarded(fn) {
            try {ui.error='';fn();}catch(error){ui.error=error.message || String(error);}
        }
        function refresh() {
            if(!ui.model)return;
            guarded(function() {
                var result=ui.model.plan(scope.keys());ui.warnings=result.warnings;
                ui.selectableShapes=ui.model.selectableContours();
                ui.pickedShapes=ui.pickedShapes.filter(function(id){return ui.selectableShapes.includes(id);});
                ui.paths=result.paths.map(function(path,index) {
                    return {id:index,key:path.key,contour:path.contour,hitOnly:!!path.hitOnly,d:[path.points].concat(path.holes || []).map(function(ring){return ring.map(function(p,i){return (i?'L':'M')+p.x.toFixed(5)+' '+(-p.y).toFixed(5);}).join(' ')+(path.closed?' Z':'');}).join(' ')};
                });
                ui.recoveredCount=Object.values(ui.model.original).filter(function(k){return k.recovered;}).length;
                ui.pendingRecovery=scope.selectedKeys.some(function(k){return ui.model.original[k._plateId]?.recovered && !ui.model.settings[k._plateId]?.confirmed;});
                ui.keyCount=scope.keys().filter(function(k){return !k.decal;}).length;
                ui.editableCount=scope.keys().filter(function(k){return !k.decal && (!ui.model.original[k._plateId] || ui.model.original[k._plateId].editable);}).length;
                ui.anchorCount=Object.values(ui.model.settings).filter(function(c){return !!c.anchor;}).length;
                selectedInfo();
            });
        }
        function select(id,event) {
            if(event){event.preventDefault();event.stopPropagation();}
            var key=scope.keys().find(function(k){return k._plateId===id;});if(!key)return;
            if(!event || !event.shiftKey)scope.unselectAll();
            if(!scope.selectedKeys.includes(key))scope.selectedKeys.push(key);
            scope.multi=angular.copy(key);
        }
        function load(source,name,options) {
            var document=D.parse(source,name,options),recognized=R.analyze(document,options),model=M.create(document,recognized);
            var keyboard={meta:$serial.defaultMetaData(),keys:model.makeKeys($serial.defaultKeyProps)};
            keyboard.meta.name=name.replace(/\.dxf$/i,'')+' — inferred layout';
            ui.model=model;ui.document=document;ui.recognized=recognized;ui.layers=[...new Set(document.primitives.map(function(p){return p.layer;}))].sort();
            ui.pickedShapes=[];ui.mappingShapes=false;
            ui.layer=ui.importLayer=options?.layer || '';ui.pending=null;
            ui.units=document.units.override || (document.units.declaredFactor?'header':document.factor===25.4?'in':document.factor===10?'cm':'mm');
            var b=document.bounds,margin=5;
            ui.viewBox=[b.minX-margin,-b.maxY-margin,Math.max(20,b.width+margin*2),Math.max(20,b.height+margin*2)].join(' ');
            keyboard.keys.forEach(hooks.renderKey);
            hooks.applyDocument({keyboard:keyboard,rows:$serial.serialize(angular.copy(keyboard)),document:null});
            hooks.setGist(null);hooks.resetUndoStack();hooks.updateSerialized();
            ui.notice=recognized.keys.length?'Detected '+recognized.keys.length+' switch openings. Review inferred key sizes and stabilizer associations before export.':
                'No reliable switch openings were found. The drawing is preserved; check units/layer or explode and flatten it in CAD.';
            refresh();
        }
        function read(file,callback,confirmed) {
            if(!file)return;
            if(!confirmed && ui.model && scope.dirty && !root.confirm('Discard the unsaved plate edits in this tab and open another file?'))return;
            if(file.size>32*1024*1024){ui.error='Plate files must be 16 MiB or smaller (projects: 32 MiB).';return;}
            ui.busy=true;ui.error='';
            var reader=new FileReader();
            reader.onload=function(event){scope.$apply(function(){guarded(function(){callback(event.target.result);});ui.busy=false;});};
            reader.onerror=function(){scope.$apply(function(){ui.busy=false;ui.error='The file could not be read. The current drawing is unchanged.';});};
            reader.readAsArrayBuffer(file);
        }
        ui.open=function(files) {
            if(!files || !files[0])return;
            var file=files[0];
            if(!workspace) {
                // The transfer is limited to this window, this origin and the
                // actual child window. No DXF is uploaded to a server.
                var child=root.open('plate.html','_blank');
                if(!child){ui.error='Allow this site to open the plate editor, or open Plate editor from the menu.';return;}
                var timer;
                function transfer(event) {
                    if(event.source!==child || event.origin!==root.location.origin || event.data?.type!=='kle-plate-ready')return;
                    root.removeEventListener('message',transfer);root.clearTimeout(timer);
                    child.postMessage({type:'kle-plate-file',file:file},root.location.origin);
                }
                root.addEventListener('message',transfer);
                timer=root.setTimeout(function(){root.removeEventListener('message',transfer);},60000);
            } else if(ui.model && scope.dirty){
                ui.pendingOpen=file;
                root.setTimeout(function(){root.document.getElementById('plate-open-cancel')?.focus();},0);
            } else read(file,function(source){load(source,file.name,{});},true);
        };
        ui.cancelOpen=function(){ui.pendingOpen=null;};
        ui.confirmOpen=function(){
            var file=ui.pendingOpen;ui.pendingOpen=null;
            if(file)read(file,function(source){load(source,file.name,{});},true);
        };
        ui.openDialogKey=function(event){
            if(event.key==='Escape'){event.preventDefault();ui.cancelOpen();}
            if(event.key==='Tab'){
                event.preventDefault();
                root.document.getElementById(event.target.id==='plate-open-cancel'?'plate-open-confirm':'plate-open-cancel')?.focus();
            }
        };
        ui.reinterpret=function() {
            if(!ui.model)return;
            if(scope.dirty && !root.confirm('Re-read the original DXF with these units/layer? This discards plate edits in this tab.'))return;
            guarded(function(){var d=ui.model.document;load(D.exportBytes(d),d.name,{units:ui.units,layer:ui.layer});});
        };
        ui.stabCategories=root.PlateProfiles?.stabilizerCategories || [];
        ui.stabCategory='alps';ui.stabFamily='alps';ui.stabAction='original';
        var holeTypes=root.PlateProfiles?.holeTypes || [];
        var stabTypeLists={alps:holeTypes.filter(function(t){return t.category==='alps';}),mx:holeTypes.filter(function(t){return t.category==='mx';}),topre:holeTypes.filter(function(t){return t.category==='topre';})};
        ui.stabTypes=function(){return stabTypeLists[ui.stabFamily];};
        ui.changeStabFamily=function(){ui.stabCategory=ui.stabTypes()[0].id;ui.changeStabCategory();};
        ui.flipHole=function(direction){ui.options.holeOrientation=direction;ui.options.direction='south';};
        ui.holeDirection=function(){return ui.options.holeOrientation || ui.options.direction || 'south';};
        var legacyAlpsHoles={'alps-aek':{id:'alps-aek',label:'2u standard'},'alps-at101':{id:'alps-at101',label:'2u standard'}};
        ui.stabPatterns=function(){
            var list=holeTypes.find(function(t){return t.id===ui.stabCategory;}).holes;
            return ui.stabCategory==='alps' && legacyAlpsHoles[ui.stabChoice]?list.map(function(p){return p.id==='alps-default'?legacyAlpsHoles[ui.stabChoice]:p;}):list;
        };
        ui.changeStabCategory=function(){
            root.document.querySelector('.plate-stab-advanced')?.removeAttribute('open');
            ui.stabFamily=ui.stabCategory.indexOf('mx-')===0?'mx':ui.stabCategory==='costar'?'alps':ui.stabCategory;
            ui.stabAction='replace';ui.stabChoice='';ui.stabChoice=(ui.stabPatterns().find(function(p){return p.label==='2u standard';})||ui.stabPatterns()[0]).id;ui.options.components=true;
            if(ui.stabCategory.indexOf('mx-')===0)ui.options.mount=ui.stabCategory==='mx-pcb'?'pcb':'plate';
            ui.changeStabPattern();
        };
        ui.changeStabPattern=function(){
            ui.patternChanged=true;ui.error='';
            // Measured values belong to the previous pattern, not the next one.
            ['spacing','slotWidth','slotHeight','slotOffset','pcbWidth','pcbHeight','pcbOffset','pcbRadius'].forEach(function(k){delete ui.options[k];});
            ui.options.axis='auto';ui.options.stemOffset=0;ui.options.forceStabilizer=false;
            ui.options.mxPattern='cherry';
            ui.options.fitStandardHole=['mx','costar','alps-default','alps-aek','alps-at101'].includes(ui.stabChoice);
            Object.assign(ui.options,root.PlateProfiles.holeDefaults(ui.stabChoice,ui.stabCategory));
        };
        ui.changeStabAction=function(){if(ui.stabAction==='replace')ui.changeStabCategory();else ui.stabChoice=ui.stabAction;};
        function syncStabCategory(){
            ui.stabAction=['original','none'].includes(ui.stabChoice)?ui.stabChoice:'replace';
            if(ui.stabAction!=='replace'){if(ui.detectedInfo?.category)ui.stabCategory=ui.detectedInfo.category;ui.stabFamily=ui.stabCategory.indexOf('mx-')===0?'mx':ui.stabCategory==='costar'?'alps':ui.stabCategory;return;}
            var group=ui.stabChoice==='mx'?holeTypes.find(function(g){return g.id==='mx-'+(ui.options.mount||'plate');}):
                holeTypes.find(function(g){return g.holes.some(function(p){return p.id===ui.stabChoice;});});
            if(['alps-aek','alps-at101'].includes(ui.stabChoice))group=holeTypes[0];
            if(group)ui.stabCategory=group.id;
            ui.stabFamily=ui.stabCategory.indexOf('mx-')===0?'mx':ui.stabCategory==='costar'?'alps':ui.stabCategory;
        }
        ui.stabStyle=function(){return root.PlateProfiles?.holeStyle(ui.stabChoice);};
        ui.isIntegratedPattern=function(id){return !!root.PlateProfiles?.isIntegratedPattern(id);};
        ui.presets=root.PlateProfiles?.addMenus?.alps || [];
        ui.costarPresets=root.PlateProfiles?.addMenus?.costar || [];
        ui.mxPresets=root.PlateProfiles?.mxPresets || [];
        ui.mxPlatePresets=root.PlateProfiles?.addMenus?.['mx-plate'] || [];
        ui.mxPcbPresets=root.PlateProfiles?.addMenus?.['mx-pcb'] || [];
        ui.toprePresets=root.PlateProfiles?.addMenus?.topre || [];
        ui.mxSpacings=[{value:'',label:'From key size'},{value:23.8,label:'2–2.75u: Cherry 23.8 mm'},
            {value:23.876,label:'2–2.75u: 0.94 inch / 23.876 mm'},{value:38.1,label:'3u: 38.1 mm'},
            {value:95.25,label:'6u: 95.25 mm'},{value:100,label:'6.25u: 100 mm'},
            {value:114.3,label:'7u: 114.3 mm'},{value:133.35,label:'8u: 133.35 mm'}];
        ui.addPreset=function(id,hole){guarded(function(){
            if(!ui.model)throw Error('Open a DXF first.');
            var preset=root.PlateProfiles.menuPreset(id,hole);
            // One transaction includes the key and its geometry, so Undo never
            // leaves an unprofiled key behind.
            hooks.transaction('plate-add',function(){
                var key=$serial.defaultKeyProps(),last=scope.selectedKeys[scope.selectedKeys.length-1];
                Object.assign(key,preset.key);
                var existing=scope.keys(),origin=existing[0] || {x:.5,y:.5};
                function snap(value,base){return base+Math.round((value-base)*4)/4;}
                var right=last?Math.max(last.x+last.width,last.x+(last.x2 || 0)+(last.width2 || last.width)):origin.x;
                key.x=snap(right-Math.min(0,key.x2 || 0),origin.x);
                key.y=snap((last?last.y:Math.max(origin.y,...existing.map(function(k){return Math.max(k.y+k.height,k.y+(k.y2 || 0)+(k.height2 || k.height));})))-Math.min(0,key.y2 || 0),origin.y);
                scope.keys().push(key);ui.model.reconcile([],scope.keys());
                ui.model.apply([key],preset.options);hooks.renderKey(key);
                scope.unselectAll();scope.selectedKeys.push(key);scope.multi=angular.copy(key);
            });
            scope.calcKbHeight();ui.notice='Added '+preset.key.labels[0]+'. The raised area is centred on the stem; move the new key into position.';
        });};
        ui.reviewItem=function(item){
            ui.mappingShapes=false;
            if(item.key){ui.pickedShapes=[];select(item.key);}
            else if(item.contour&&ui.selectableShapes.includes(item.contour)){scope.unselectAll();ui.pickedShapes=[item.contour];}
            ui.notice=item.message;
        };
        ui.selectPath=function(path,event){
            if(ui.mappingShapes && path.key){select(path.key,event);return;}
            if(!ui.selectableShapes.includes(path.contour)){ui.pickedShapes=[];select(path.key,event);return;}
            event.preventDefault();event.stopPropagation();
            if(!path.contour || !ui.selectableShapes.includes(path.contour))return;
            ui.mappingShapes=false;scope.unselectAll();ui.highlightSupport=null;
            if(!event.shiftKey){ui.pickedShapes=[path.contour];return;}
            var index=ui.pickedShapes.indexOf(path.contour);
            if(index<0)ui.pickedShapes.push(path.contour);else ui.pickedShapes.splice(index,1);
        };
        ui.guessMatches=[];ui.guessIndex=0;
        scope.$watchCollection(function(){return ui.pickedShapes;},function(){ui.guessMatches=[];ui.guessSearched=false;});
        ui.findBestGuess=function(){guarded(function(){
            if(!ui.pickedShapes.length)throw Error('Select an orange unmatched opening first. Shift-click to include its supports.');
            var selected=new Set(ui.pickedShapes);
            ui.guessMatches=root.PlateGuess.find(ui.model.document.contours.filter(function(c){return selected.has(c.id);}));
            ui.guessIndex=0;ui.guessSearched=true;
        });};
        ui.applyBestGuess=function(){guarded(function(){
            var match=ui.guessMatches[ui.guessIndex];if(!match)throw Error('Find a matching hole first.');
            hooks.transaction('plate-best-guess',function(){
                var key=ui.model.addFromContours(ui.pickedShapes,$serial.defaultKeyProps,match.key.width,match.key.height,match.label,{center:match.center,angle:match.angle});
                ['width2','height2','x2','y2','stepped'].forEach(function(field){if(match.key[field]!==undefined)key[field]=match.key[field];});
                scope.keys().push(key);hooks.renderKey(key);scope.unselectAll();scope.selectedKeys.push(key);scope.multi=angular.copy(key);
            });
            ui.pickedShapes=[];scope.calcKbHeight();ui.notice='Approximate match added to KLE. Imported cutouts are unchanged; review its size and switch centre. Undo removes the assignment.';
        });};
        ui.deleteSelectedShapes=function(){guarded(function(){
            hooks.transaction('plate-delete-shapes',function(){ui.model.deleteShapes(ui.pickedShapes);});
            ui.pickedShapes=[];ui.mappingShapes=false;ui.notice='Selected shapes deleted. Undo restores them.';
        });};
        ui.mapToExisting=function(){ui.mappingShapes=true;scope.unselectAll();ui.notice='Click the destination key in the plate drawing or KLE layout. Cancel stops mapping.';};
        ui.cancelShapeMapping=function(){ui.mappingShapes=false;ui.notice='Shape mapping cancelled.';};
        function bindToKey(key){guarded(function(){
            hooks.transaction('plate-bind-shapes',function(){ui.model.bindShapes(ui.pickedShapes,key);});
            ui.mappingShapes=false;ui.pickedShapes=[];ui.notice='Shapes mapped to the key. Moving or deleting that key now includes them.';
        });}
        ui.addSelectedShapes=function(){guarded(function(){
            if(!ui.pickedShapes.length)throw Error('Select the switch opening first, then its additional supports.');
            hooks.transaction('plate-identify-key',function(){
                var key=ui.model.addFromContours(ui.pickedShapes,$serial.defaultKeyProps,Number(ui.shapeKey.width),Number(ui.shapeKey.height),ui.shapeKey.name);
                scope.keys().push(key);hooks.renderKey(key);scope.unselectAll();scope.selectedKeys.push(key);scope.multi=angular.copy(key);
            });
            ui.pickedShapes=[];scope.calcKbHeight();
            ui.notice='Added key from the selected source openings. The first opening defines its centre; original cut geometry is preserved.';
        });};
        ui.includeSupport=function(candidate,include){guarded(function(){
            if(scope.selectedKeys.length!==1)throw Error('Select one key first.');
            hooks.transaction('plate-support',function(){ui.model.setSupport(scope.selectedKeys[0],candidate.id,include);});
            ui.notice=include?'Opening included. It now moves and deletes with this key.':'Opening returned to fixed drawing geometry.';
        });};
        ui.confirmRecovered=function(){guarded(function(){hooks.transaction('plate-confirm',function(){ui.model.confirm(scope.selectedKeys);});
            ui.notice='Recovered geometry confirmed for the selected keys. Fixed shared cuts remain in place.';
        });};
        ui.select=select;
        ui.isSelected=function(id){return scope.selectedKeys.some(function(k){return k._plateId===id;});};
        ui.isAnchor=function(id){return !!ui.model?.settings[id]?.anchor;};
        ui.anchor=function(enabled){guarded(function(){hooks.transaction('plate-anchor',function(){ui.model.setAnchors(scope.selectedKeys,enabled);});});};
        ui.exclude=function(){guarded(function(){
            hooks.transaction('plate-exclude',function(){
                ui.model.exclude(scope.selectedKeys);var ids=new Set(scope.selectedKeys.map(function(k){return k._plateId;}));
                scope.keyboard.keys=scope.keys().filter(function(k){return !ids.has(k._plateId);});scope.unselectAll();
            });
            ui.notice='Selected openings are now fixed drawing geometry. Their original DXF records are preserved.';
        });};
        ui.restoreExcluded=function(){guarded(function(){hooks.transaction('plate-restore-excluded',function(){
            ui.model.makeKeys($serial.defaultKeyProps).forEach(function(key){
                var setting=ui.model.settings[key._plateId];
                if(setting.excluded){setting.excluded=false;scope.keys().push(key);}
            });
        });});};
        ui.apply=function(all) {
            guarded(function() {
                if(!ui.model)throw Error('Open a DXF first.');
                var targets=all?scope.keys().filter(function(k){return !k.decal && (!ui.model.original[k._plateId] || ui.model.original[k._plateId].editable);}):scope.selectedKeys;
                var options=angular.copy(ui.options);options.stabilizer=ui.stabChoice;
                var prepared=targets.map(function(key){return ui.patternChanged && ui.stabAction==='replace'?root.PlateProfiles.replacement(options,key):{key:angular.copy(key),options:options};});
                if(!prepared.length)throw Error('Select at least one key in the plate preview or KLE layout.');
                hooks.transaction('plate-profile',function(){
                    // apply validates the entire batch before committing profiles.
                    ui.model.apply(prepared.map(function(p){return p.key;}),prepared[0].options);
                    targets.forEach(function(key,i){
                        ['width','height','width2','height2','x2','y2','stepped'].forEach(function(field){key[field]=prepared[i].key[field];});
                    });
                });
                ui.options=angular.copy(prepared[0].options);
                ui.notice='Applied to '+targets.length+' key'+(targets.length===1?'':'s')+'. Switch centres, anchors and fixed drawing geometry are preserved.';
            });
        };
        ui.download=function() {
            guarded(function() {
                if(!ui.model)throw Error('Open a DXF first.');
                var bytes=ui.model.exportFile(scope.keys());
                saveAs(new Blob([bytes],{type:'application/dxf'}),ui.document.name.replace(/\.dxf$/i,'')+'-edited.dxf');
                ui.notice='DXF downloaded in its original coordinate frame. Check the CAD drawing before manufacturing.';
            });
        };
        ui.saveProject=function() {
            guarded(function() {
                var fields=Object.keys($serial.defaultKeyProps()).concat('_plateId');
                var data={format:'keebal-plate-project',version:1,coordinateVersion:ui.document.coordinateVersion,recognitionVersion:ui.document.recognitionVersion,source:ui.document.source,encoding:ui.document.encoding,
                    name:ui.document.name,unitOverride:ui.document.units.override,
                    layer:ui.importLayer,frame:ui.model.frame,settings:ui.model.snapshot(),
                    meta:scope.keyboard.meta,keys:scope.keys().map(function(key){var item={};fields.forEach(function(f){item[f]=key[f];});return item;})};
                saveAs(new Blob([JSON.stringify(data)],{type:'application/json'}),ui.document.name.replace(/\.dxf$/i,'')+'.plate.json');
            });
        };
        ui.openProject=function(files) {
            read(files?.[0],function(bytes) {
                var data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
                if(data.format!=='keebal-plate-project' || data.version!==1 || typeof data.name!=='string' || !Array.isArray(data.keys) || data.keys.length>2000 ||
                    typeof data.source!=='string' || !data.settings || !data.frame)throw Error('Not a supported Keebal plate project.');
                var source=data.source;
                if(data.encoding==='bytes')source=Uint8Array.from(source,function(c){return c.charCodeAt(0);});
                // Prepare/validate before replacing the open plate.
                var fields=Object.keys($serial.defaultKeyProps()).concat('_plateId'),keys=data.keys.map(function(item) {
                    var key=$serial.defaultKeyProps();
                    fields.forEach(function(f){if(Object.prototype.hasOwnProperty.call(item,f))key[f]=item[f];});
                    ['x','y','width','height','rotation_angle','rotation_x','rotation_y'].forEach(function(f){if(!Number.isFinite(key[f]) || Math.abs(key[f])>10000)throw Error('The project has invalid key geometry.');});
                    if(key.width<0.5 || key.height<0.5 || key.width>24 || key.height>24 || !Array.isArray(key.labels) || key.labels.length>12 || key.labels.some(function(x){return typeof x!=='string';}))throw Error('The project has invalid key properties.');
                    hooks.renderKey(key);return key;
                });
                ['x','y'].forEach(function(f){if(!Number.isFinite(data.frame[f]))throw Error('The project has an invalid coordinate frame.');});
                if(data.unitOverride!==null && !['mm','in','cm'].includes(data.unitOverride))throw Error('The project has an unsupported unit selection.');
                var document=D.parse(source,data.name,{units:data.unitOverride,legacyExtrusion:data.coordinateVersion!==2,legacyFamilies:!(data.recognitionVersion>=3),legacyAlignment:!(data.recognitionVersion>=4),legacyAssembly:!(data.recognitionVersion>=5),legacyRuns:!(data.recognitionVersion>=6),legacyRefine:!(data.recognitionVersion>=7),legacyPcb:!(data.recognitionVersion>=8),legacyRoundedPcb:!(data.recognitionVersion>=9),legacyWidePcb:!(data.recognitionVersion>=10),legacyReadOnlyPcb:!(data.recognitionVersion>=11)}),recognized=R.analyze(document,{layer:data.layer,legacyFamilies:!(data.recognitionVersion>=3),legacyAlignment:!(data.recognitionVersion>=4),legacyAssembly:!(data.recognitionVersion>=5),legacyRuns:!(data.recognitionVersion>=6),legacyRefine:!(data.recognitionVersion>=7),legacyPcb:!(data.recognitionVersion>=8),legacyRoundedPcb:!(data.recognitionVersion>=9),legacyWidePcb:!(data.recognitionVersion>=10),legacyReadOnlyPcb:!(data.recognitionVersion>=11)}),candidate=M.create(document,recognized);
                var ids=new Set();
                keys.forEach(function(key){if(typeof key._plateId!=='string' || ids.has(key._plateId) || !data.settings[key._plateId])throw Error('The project has missing or duplicate key references.');ids.add(key._plateId);});
                Object.keys(data.settings).forEach(function(id){
                    if(!/^(key|new)-\d+$/.test(id))throw Error('The project has an invalid key reference.');
                    var c=data.settings[id];
                    if(!c || typeof c!=='object')throw Error('The project has invalid key settings.');
                    if(c.anchor){G.point(c.anchor.center?.x,c.anchor.center?.y);if(!Number.isFinite(c.anchor.angle))throw Error('Invalid anchor.');}
                    if(c.profile){if(!c.profile.size || ![c.profile.size.width,c.profile.size.height].every(function(n){return Number.isFinite(n) && n>=0.5 && n<=24;}))throw Error('The project has invalid applied key sizes.');if(c.profile.options.switch!=='original')root.PlateProfiles.switchShape(c.profile.options);root.PlateProfiles.stabilizers(c.profile.options,c.profile.size);}
                });
                candidate.frame.x=data.frame.x;candidate.frame.y=data.frame.y;candidate.restore(data.settings);candidate.plan(keys);
                var prepared=hooks.prepareDocument($serial.serialize({keys:angular.copy(keys),meta:data.meta || $serial.defaultMetaData()}));
                prepared.keyboard.keys=keys;
                load(source,data.name,{units:data.unitOverride,layer:data.layer,legacyExtrusion:data.coordinateVersion!==2,legacyFamilies:!(data.recognitionVersion>=3),legacyAlignment:!(data.recognitionVersion>=4),legacyAssembly:!(data.recognitionVersion>=5),legacyRuns:!(data.recognitionVersion>=6),legacyRefine:!(data.recognitionVersion>=7),legacyPcb:!(data.recognitionVersion>=8),legacyRoundedPcb:!(data.recognitionVersion>=9),legacyWidePcb:!(data.recognitionVersion>=10),legacyReadOnlyPcb:!(data.recognitionVersion>=11)});
                ui.model=candidate;hooks.applyDocument(prepared);hooks.updateSerialized();hooks.resetUndoStack();refresh();ui.notice='Plate project restored, including anchors and applied cutout profiles.';
            });
        };
        // Importing a second KLE is explicit: the user pairs it with the fixed
        // anchors. No auto-fit, scaling or recentering of the plate is allowed.
        ui.offerLayout=function(prepared) {
            if(!ui.model)return false;
            var anchors=scope.keys().filter(function(k){return ui.isAnchor(k._plateId);});
            if(!anchors.length)throw Error('Lock at least one reference key before aligning another KLE layout.');
            ui.pending={prepared:prepared,anchors:anchors.map(function(k){return {key:k,index:'',label:(k.labels[0] || k._plateId)};}),
                choices:prepared.keyboard.keys.map(function(k,i){return {index:i,label:(i+1)+': '+(k.labels[0] || 'Unlabelled key')};})};
            ui.notice='Choose the matching key for each anchor above, then align the incoming KLE layout.';return true;
        };
        ui.alignLayout=function() {
            guarded(function() {
                var pending=ui.pending,keys=angular.copy(pending.prepared.keyboard.keys),chosen=new Set();
                var pairs=pending.anchors.map(function(a) {
                    if(a.index==='' || a.index===null || a.index===undefined || chosen.has(a.index) || !keys[a.index])throw Error('Choose a different incoming key for every anchor.');
                    chosen.add(a.index);return {from:ui.model.physical(keys[a.index]).center,to:ui.model.physical(a.key).center};
                });
                var transform=M.alignment(pairs),old=scope.keys();
                keys.forEach(function(key) {
                    var at=ui.model.physical(key);ui.model.position(key,transform.move(at.center),at.angle+transform.angle);
                    var match=old.find(function(k){return G.distance(ui.model.physical(k).center,ui.model.physical(key).center)<0.15;});
                    if(match)key._plateId=match._plateId;else delete key._plateId;
                });
                hooks.transaction('plate-align',function(){scope.keyboard.keys=keys;scope.unselectAll();});
                ui.pending=null;ui.notice='KLE aligned rigidly to the anchors. New switch positions need an applied cutout profile; fixed plate features did not move.';
            });
        };
        ui.cancelAlignment=function(){ui.pending=null;hooks.updateSerialized();};
        function selectedInfo() {
            var key=scope.selectedKeys[0];ui.selectedInfo='';
            ui.supportCandidates=ui.model && scope.selectedKeys.length===1?ui.model.nearbySupports(key):[];
            ui.highlightSupport=null;
            ui.pendingRecovery=!!ui.model && scope.selectedKeys.some(function(k){return ui.model.original[k._plateId]?.recovered && !ui.model.settings[k._plateId]?.confirmed;});
            if(key && ui.model){var p=ui.model.physical(key);ui.selectedInfo='Centre '+p.center.x.toFixed(3)+', '+p.center.y.toFixed(3)+' mm';}
            ui.selectedReadOnly=!!ui.model && scope.selectedKeys.some(function(k){return ui.model.original[k._plateId] && !ui.model.original[k._plateId].editable;});
        }
        scope.$watchCollection(function(){return scope.selectedKeys.map(function(k){return k._plateId;});},function(){
            if(ui.mappingShapes && scope.selectedKeys.length===1)bindToKey(scope.selectedKeys[0]);
            ui.patternChanged=false;
            ui.selectedCount=scope.selectedKeys.length;
            selectedInfo();
            if(ui.model && scope.selectedKeys.length) {
                var profiles=scope.selectedKeys.map(function(key){
                    var applied=ui.model.settings[key._plateId]?.profile?.options;
                    return applied?root.PlateProfiles.componentOptions(applied):ui.model.original[key._plateId]?root.PlateProfiles.inferComponents(ui.model.original[key._plateId]).options:root.PlateProfiles.componentOptions({switch:'original',stabilizer:'original'});
                });
                ui.mixedProfiles=profiles.some(function(p){return !root.PlateProfiles.sameComponents(p,profiles[0]);});
                ui.options=angular.copy(profiles[0]);ui.stabChoice=ui.options.stabilizer;
                var source=ui.model.original[scope.selectedKeys[0]._plateId];
                ui.detectedInfo=source?root.PlateProfiles.inferComponents(source):null;
            } else {ui.mixedProfiles=false;ui.detectedInfo=null;}
            syncStabCategory();
        });
        if(workspace) {
            document.title='DXF Plate Editor — Keebal KLE';
            scope.keyboard.keys=[];scope.keyboard.meta=$serial.defaultMetaData();scope.serializedObjects=[];scope.serialized='';
            function receive(event) {
                if(event.source!==root.opener || event.origin!==root.location.origin || event.data?.type!=='kle-plate-file' || !(event.data.file instanceof File))return;
                root.removeEventListener('message',receive);scope.$apply(function(){ui.open([event.data.file]);});
            }
            root.addEventListener('message',receive);
            if(root.opener)root.opener.postMessage({type:'kle-plate-ready'},root.location.origin);
        }
        return {refresh:refresh,load:load};
    }
    root.PlateEditor={attach:attach};
}(window));
