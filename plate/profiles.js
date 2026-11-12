// Physical dimensions in mm. Keep data separate from the editor and recognizer.
// Drawing references and preset limitations are recorded in docs/plate-editor.md.
(function(root,factory) {
    if(typeof module==='object' && module.exports) module.exports=factory(require('polygon-clipping'),require('./geometry.js'),require('./measured.js'),require('./switch-families.js'));
    else root.PlateProfiles=factory(root.polygonClipping,root.PlateGeometry,root.PlateMeasured,root.PlateSwitchFamilies);
}(typeof globalThis!=='undefined'?globalThis:this,function(clip,G,Measured,Families) {
    'use strict';
    // Boolean operations on coincident edges need a common numerical grid.
    // 0.00001 mm is well below the preview arc tolerance (0.005 mm); only
    // explicitly regenerated contours use it. Original DXF records stay exact.
    var rawClip=clip;
    function snapped(value) {
        return Array.isArray(value)?value.map(snapped):Math.round(value*1e5)/1e5;
    }
    clip={};
    ['union','intersection','difference'].forEach(function(operation) {
        clip[operation]=function(){return rawClip[operation].apply(null,[...arguments].map(snapped));};
    });
    var switches={mx:{name:'MX',width:14,height:14},alps:{name:'Alps',width:15.5,height:12.8}};
    var mxSpacing={2:23.8,2.25:23.8,2.75:23.8,3:38.1,4:57.15,4.5:69.342,
        5.5:85.725,6:95.25,6.25:100,6.5:104.76,7:114.3,8:133.35,9:133.35,10:133.35};
    var aekSpacing={1.75:24,2:28,2.25:28,2.75:28,6.25:83.72,6.5:90.6};
    var at101Spacing={1.75:24,2:28,2.25:28,2.75:41,6.25:84,6.5:90.6};
    function ring(points) {
        var values=points.map(function(p){return [p.x,p.y];});
        if(values.length && (values[0][0]!==values[values.length-1][0] || values[0][1]!==values[values.length-1][1])) values.push(values[0].slice());
        return values;
    }
    function polygon(points) {return [ring(points)];}
    function rings(polygons) {
        var result=[];
        polygons.forEach(function(polygon) {
            polygon.forEach(function(ring) {result.push(ring.slice(0,-1).map(function(p){return G.point(p[0],p[1]);}));});
        });
        return result;
    }
    function rectangle(width,height,x,y) {return polygon(G.rectangle(width,height,{x:x || 0,y:y || 0}));}
    function union(polygons) {return polygons.length?clip.union.apply(null,polygons):[];}
    function spacing(style,size,custom) {
        if(custom!==undefined && custom!==null && custom!=='') {
            var distance=Number(custom);
            if(!Number.isFinite(distance) || distance<10 || distance>250) throw Error('Stabilizer spacing must be between 10 and 250 mm.');
            return distance;
        }
        var table=style==='alps-default'?aekSpacing:style==='alps-at101'?at101Spacing:style==='alps-aek'?aekSpacing:mxSpacing;
        if(table[size]!==undefined) return table[size];
        throw Error('No '+(style.startsWith('alps')?'Alps':'MX/Costar')+' spacing preset for '+size+'u. Enter the measured stabilizer spacing.');
    }
    // Empty values retain the documented template; reject invalid dimensions
    // before committing any edit to the plate document.
    function dimension(value,fallback,min,max,label) {
        var n=value===undefined || value===null || value===''?fallback:Number(value);
        if(!Number.isFinite(n) || n<min || n>max)throw Error(label+' must be between '+min+' and '+max+' mm.');
        return n;
    }
    function roundedRectangle(width,height,x,y,radius) {
        if(!radius)return rectangle(width,height,x,y);
        var points=[],steps=Math.max(2,Math.ceil(Math.PI/2/Math.acos(Math.max(-1,1-.005/radius))));
        [[1,1],[-1,1],[-1,-1],[1,-1]].forEach(function(sign,index){
            var cx=x+sign[0]*(width/2-radius),cy=y+sign[1]*(height/2-radius);
            for(var i=0;i<=steps;i++){var a=(index+i/steps)*Math.PI/2;points.push({x:cx+radius*Math.cos(a),y:cy+radius*Math.sin(a)});}
        });
        return polygon(points);
    }
    function stabilizers(options,key) {
        if(options.holeOrientation==='north')return place(stabilizers(Object.assign({},options,{holeOrientation:'south',direction:'south'}),key),{x:0,y:0},Math.PI);
        if(options.components)return stabilizers(geometryOptions(options),key);
        var style=options.stabilizer || 'original';
        var family=Families.find(function(f){return f.id===style;});
        if(family)return family.parts.slice(1).map(polygon);
        if(style==='mx-compat-2.75-split'){
            if(key.width!==2.75 || key.height!==1)throw Error('Split compatibility requires a 2.75u horizontal key.');
            return pcbCompatibility(2.75,{split:true}).slice(1);
        }
        if(style==='original' || style==='none') return [];
        if(style==='mx-dual275') {
            if(key.width!==2.75 || key.height!==1)throw Error('The dual-opening PCB pattern requires a 2.75u key.');
            return [polygon(Measured.mxDual275[1])];
        }
        if(!['north','south'].includes(options.direction || 'south')) throw Error('Choose North or South stabilizer orientation.');
        if(style==='mx' && !['plate','pcb'].includes(options.mount || 'plate')) throw Error('Choose Plate mount or PCB mount.');
        var vertical=options.axis==='vertical' || (options.axis!=='horizontal' && key.height>key.width);
        var size=vertical?key.height:key.width,minSize=style.startsWith('alps')?1.75:2;
        if(size<minSize && !options.forceStabilizer) return [];
        if(style==='alps-canon8' || style==='alps-canon-vertical2') {
            var upright=style==='alps-canon-vertical2';
            // Accept the earlier 1u saved-profile width; the cutouts are unchanged.
            if((upright?![1,1.25].includes(key.width):key.width!==8) || key.height!==(upright?2:1))throw Error('This Canon pattern requires its original key dimensions.');
            return place((upright?Measured.canonVertical2:Measured.canon8).map(polygon),{x:0,y:0},options.direction==='north'?Math.PI:0);
        }
        if(style==='alps-7-all-flex') {
            if(key.width!==7 || key.height!==1)throw Error('The all-stabs flex pattern requires a 7u key.');
            return place(Measured.space7AllFlex.map(polygon),{x:0,y:0},options.direction==='north'?Math.PI:0);
        }
        if(style==='alps-7-all' || style==='alps-625-all') {
            if((key.width!==7 && !(style==='alps-625-all' && key.width===6.25)) || key.height!==1)throw Error('The all-stabs pattern requires a 7u key.');
            return place(Measured.space625All.map(polygon),{x:0,y:0},options.direction==='north'?Math.PI:0);
        }
        if(style==='alps-multi275') {
            if(key.width!==2.75 || key.height!==1)throw Error('The multi-stab pattern requires a 2.75u key.');
            return place(Measured.multi275.map(polygon),{x:0,y:0},options.direction==='north'?Math.PI:0);
        }
        if(style==='alps-975-barrel' || style==='alps-z150') {
            var z150=style==='alps-z150';
            if(key.width!==(z150?1:9.75) || key.height!==(z150?2:1))throw Error('This pattern requires its original key dimensions.');
            return place((z150?Measured.z150Supports:Measured.space975Barrel).map(polygon),{x:0,y:0},options.direction==='north'?Math.PI:0);
        }
        if(style==='alps-barrel625') {
            if(size!==6.25)throw Error('The twin-barrel pattern requires a 6.25u key.');
            return place(Measured.space625Barrels.map(polygon),{x:0,y:0},(vertical?Math.PI/2:0)+(options.direction==='north'?Math.PI:0));
        }
        if(style==='alps-zkb2' || style==='alps-bae') {
            if(key.width!==2.25 || key.height!==1 || vertical)throw Error('5140 BAE/ZKB2 Enter uses a 2.25u lower section with an upper-right extension.');
            return place((style==='alps-bae'?Measured.baeSupports:Measured.zkb2Supports).map(polygon),{x:0,y:0},options.direction==='north'?Math.PI:0);
        }
        if(style==='alps-55' || (style==='alps-default' && size===5.5 && !options.spacing)) {
            if(size!==5.5)throw Error('This pattern requires a 5.5u key.');
            var measured=Measured.space55.map(polygon);
            return place(measured,{x:0,y:0},(vertical?Math.PI/2:0)+(options.direction==='north'?Math.PI:0));
        }
        var distance=spacing(style,size,options.spacing),offset=Number(options.stemOffset || 0);
        if(!Number.isFinite(offset) || Math.abs(offset)>distance/2-5) throw Error('The stem offset is outside the stabilizer span.');
        var centers=[-distance/2-offset,distance/2-offset],pieces=[];
        if(style==='mx') {
            if(options.mount==='pcb') {
                // Clearance around a PCB-supported housing; no plate latch.
                var cw=dimension(options.pcbWidth,7,6,10,'PCB clearance width'),
                    ch=dimension(options.pcbHeight,15,12,20,'PCB clearance height'),
                    cy=dimension(options.pcbOffset,-1.5,-5,5,'PCB clearance Y offset'),
                    cr=dimension(options.pcbRadius,0,0,1,'PCB clearance corner radius');
                centers.forEach(function(x){pieces.push(roundedRectangle(cw,ch,x,cy,cr));});
            } else if(options.mxPattern==='cherry') {
                // Cherry switch catalogue (2010), p71: nominal clip openings.
                // This template is opt-in; old saved projects keep the legacy
                // geometry below until the user explicitly changes the pattern.
                centers.forEach(function(x,index){
                    pieces.push(rectangle(6.65,12.3,x,-.62));
                    pieces.push(rectangle(.875,2.8,x+(index===0?-1:1)*3.7625,.9));
                    pieces.push(rectangle(3,1.2,x,-7.37));
                });
                var shortKey=size<3;
                pieces.push(rectangle(distance-6.65,shortKey?11:4.6,-offset,shortKey?-.77:0));
            } else if(!options.mxPattern || options.mxPattern==='legacy') {
                // Clip-in plate housing: body, outside ear and latch relief.
                centers.forEach(function(x,index) {
                    pieces.push(rectangle(6.75,12.3,x,-0.62));
                    pieces.push(rectangle(0.825,2.8,x+(index===0?-1:1)*3.7875,0.9));
                    pieces.push(rectangle(3.3,1.2,x,-7.37));
                });
                pieces.push(rectangle(distance-6.75,4.6,(centers[0]+centers[1])/2,0));
            } else throw Error('Unknown MX plate-mount pattern.');
        } else if(style==='costar') {
            centers.forEach(function(x){pieces.push(rectangle(3.3,14.2,x,-0.65));});
        } else if(style==='alps-default' || style==='alps-aek' || style==='alps-at101') {
            var width=options.slotWidth===undefined || options.slotWidth===null || options.slotWidth===''?(style==='alps-at101'?2.5:2.67):Number(options.slotWidth);
            var height=options.slotHeight===undefined || options.slotHeight===null || options.slotHeight===''?(style==='alps-at101'?4.8:5.21):Number(options.slotHeight);
            var y=options.slotOffset===undefined || options.slotOffset===null || options.slotOffset===''?(style==='alps-at101'?-6.4:-6.48):Number(options.slotOffset);
            if(!Number.isFinite(width) || !Number.isFinite(height) || width<1 || width>10 || height<1 || height>20)
                throw Error('Enter valid Alps stabilizer slot dimensions.');
            if(!Number.isFinite(y) || Math.abs(y)>30)throw Error('The Alps slot offset must be between -30 and 30 mm.');
            centers.forEach(function(x){pieces.push(rectangle(width,height,x,y));});
        } else throw Error('Choose a supported stabilizer pattern.');
        var angle=(vertical?Math.PI/2:0)+(options.direction==='north'?Math.PI:0);
        return union(pieces).map(function(polygon) {
            return polygon.map(function(path){return path.map(function(p){var q=G.rotate({x:p[0],y:p[1]},angle);return [q.x,q.y];});});
        });
    }
    // Joined PCB clearance windows used by multi-layout plates. These are
    // clearance recipes, not plate-mount stabilizer clips. Dimensions remain
    // independent of the cap outline and the physical stem stays at (0, 0).
    function pcbCompatibility(size,options) {
        options=options || {};
        if(![2,2.25,2.75].includes(size))throw Error('Unsupported PCB compatibility size.');
        var right=16.525+(size-2)*9.525;
        var parts=options.split?[rectangle(23.525,14,-4.7625,0),rectangle(14,14,right-7,0)]:
            [rectangle(right+16.525,14,(right-16.525)/2,0)];
        var height=dimension(options.height,16,15,22,'PCB compatibility height');
        var offset=dimension(options.offset,-1,-4,4,'PCB compatibility offset');
        [-1,1].forEach(function(side){parts.push(rectangle(7,height,side*11.938,offset));});
        return union(parts);
    }
    function switchShape(options) {
        if(options.holeOrientation==='north')return place([switchShape(Object.assign({},options,{holeOrientation:'south',direction:'south'}))],{x:0,y:0},Math.PI)[0];
        if(options.components)return switchShape(geometryOptions(options));
        if(options.switch==='topre')return polygon(Families.find(function(f){return f.id==='topre-1';}).parts[0]);
        var family=Families.find(function(f){return f.id===options.switch;});
        if(family)return polygon(family.parts[0]);
        if(options.switch?.startsWith('mx-compat-'))return pcbCompatibility(Number(options.switch.split('-')[2]),{split:options.switch.endsWith('-split')})[0];
        if(options.switch==='mx-dual275')return polygon(Measured.mxDual275[0]);
        if(options.switch==='mx-6-plate-compat')return rectangle(23.525,14,4.7625,0);
        if(options.switch==='mx-wide2')return polygon(Measured.mxWide2);
        if(options.switch==='mx-wide225')return polygon(Measured.mxWide225);
        if(options.switch==='mx-multistep')return polygon(Measured.mxCapsMultistep);
        if(options.switch==='alps-multistep')return polygon(Measured.capsMultistep);
        if(options.switch==='ec11') return polygon(Measured.ec11);
        var preset=options.switch==='universal'?switches.mx:switches[options.switch];
        if(options.switch==='custom') {
            var width=Number(options.customWidth),height=Number(options.customHeight);
            if(!Number.isFinite(width) || !Number.isFinite(height) || width<5 || height<5 || width>30 || height>30)
                throw Error('Custom switch openings must be between 5 and 30 mm on each side.');
            preset={width:width,height:height};
        }
        if(!preset) throw Error('Unknown switch cutouts need an explicit MX, Alps or custom profile before replacement.');
        var extra=Number(options.extraSize || 0);
        if(!Number.isFinite(extra) || extra<0 || extra>1) throw Error('Extra cutout size must be between 0 and 1 mm.');
        var rotation=Number(options.switchRotation || 0);
        if(!Number.isFinite(rotation)) throw Error('Choose a valid switch orientation.');
        var radius=dimension(options.switchRadius,0,0,.5,'Switch corner radius');
        var body=roundedRectangle(preset.width+extra,preset.height+extra,0,0,radius);
        if(options.switch==='universal')body=union([body,roundedRectangle(15.5+extra,12.8+extra,0,0,radius)])[0];
        return place([body],{x:0,y:0},rotation*Math.PI/180)[0];
    }
    function generate(options,key) {
        var body=switchShape(options),parts=stabilizers(options,key);
        return clip.union(body,...parts);
    }
    function place(polygons,center,angle) {
        return polygons.map(function(polygon) {
            return polygon.map(function(path) {return path.map(function(p) {
                var q=G.rotate({x:p[0],y:p[1]},angle);
                return [q.x+center.x,q.y+center.y];
            });});
        });
    }
    // Primary KLE rectangle is the raised area of a stepped cap: its centre
    // is the switch stem. The secondary rectangle is the full cap footprint.
    var presets=[
        {id:'alps-7-all-flex',label:'7u all stabs flex',width:7,canon:'alps-7-all-flex'},
        {id:'alps-7-all',label:'7u all stabs',width:7,canon:'alps-7-all'},
        {id:'alps-multistep',label:'Caps Multistep',width:1.75},
        {id:'alps-multi275',label:'2.75u multi stab',width:2.75,canon:'alps-multi275'},
        {id:'alps-1',label:'1u',width:1},
        {id:'alps-125',label:'1.25u',width:1.25},
        {id:'alps-15',label:'1.5u',width:1.5},
        {id:'alps-15-right',label:'1.5u stepped right',width:1,full:1.5},
        {id:'alps-15-left',label:'1.5u stepped left',width:1,full:1.5,left:true},
        {id:'alps-175-stabs',label:'1.75u — stabilizers',width:1.75,stabs:true},
        {id:'alps-175',label:'1.75u — no stabilizers',width:1.75},
        {id:'alps-175-step125',label:'1.75u stepped — 1.25u raised area',width:1.25,full:1.75},
        {id:'alps-175-step15',label:'1.75u stepped — 1.5u raised area',width:1.5,full:1.75},
        {id:'alps-2',label:'2u — stabilizers',width:2,stabs:true},
        {id:'alps-225',label:'2.25u — stabilizers',width:2.25,stabs:true},
        {id:'alps-975-barrel',label:'9.75u — barrel stabilizer',width:9.75,canon:'alps-975-barrel'},
        {id:'alps-z150',label:'Z150 Enter',width:1,height:2,z150:true,canon:'alps-z150'},
        {id:'alps-vertical2',label:'vertical 2u',width:1,height:2,canon:'alps-canon-vertical2'},
        {id:'alps-bae',label:'5140 BAE',width:2.25,bae:true,stabs:true},
        {id:'alps-zkb2',label:'ZKB2 Enter',width:2.25,zkb2:true,stabs:true},
        {id:'alps-canon8',label:'8u — Canon complete supports',width:8,canon:'alps-canon8'},
        {id:'alps-canon-vertical2',label:'cannon vertical 2u',width:1.25,height:2,canon:'alps-canon-vertical2'},
        {id:'alps-625-barrels',label:'6.25u — two barrel stabilizers',width:6.25,barrels:true,stabs:true},
        {id:'alps-55',label:'5.5u — complete spacebar supports',width:5.5,stabs:true,canon:'alps-55'}
    ];
    // Explicit sizes rather than rounding unknown spacebars to a nearby wire.
    var mxPresets=[1,1.25,1.5,1.75].map(function(size){return {id:'mx-'+size,label:size+'u',width:size};});
    [2,2.25,2.75].forEach(function(size){mxPresets.push({id:'mx-compat-'+size,label:size+'u wide PCB compatibility',width:size,mount:'pcb'});});
    mxPresets.push({id:'mx-compat-2.75-split',label:'2.75u split PCB compatibility',width:2.75,mount:'pcb'});
    mxPresets.push({id:'mx-dual275',label:'2.75u dual opening PCB mount',width:2.75,mount:'pcb'},
        {id:'mx-multistep',label:'1.75u Caps Multistep',width:1.75},
        {id:'mx-stepped',label:'1.75u stepped Caps — 1.25u raised area',width:1.25,full:1.75});
    ['plate','pcb'].forEach(function(mount){
        [2,2.25,2.75,3,6,6.25,7,8].forEach(function(size){mxPresets.push({id:'mx-'+size+'-'+mount,
            label:size+'u '+(mount==='plate'?'plate mount':'PCB mount'),width:size,mount:mount,stabs:true});});
        mxPresets.push({id:'mx-vertical-'+mount,label:'Vertical 2u — '+mount+' mount',width:1,height:2,mount:mount,stabs:true},
            {id:'mx-iso-'+mount,label:'ISO Enter — '+mount+' mount',width:1.25,height:2,iso:true,mount:mount,stabs:true},
            {id:'mx-6-offset-'+mount,label:'6u offset stem — '+mount+' mount',width:6,mount:mount,stabs:true,offset:9.525});
    });
    mxPresets.push({id:'mx-6-plate-compat',label:'6u plate mount stabilizer — alternate stem',width:6,mount:'plate',stabs:true});
    Families.filter(function(f){return f.type==='mx' && !f.legacy;}).forEach(function(f){mxPresets.push({id:f.id,label:f.label,width:f.width,mount:f.mount});});
    var toprePresets=Families.filter(function(f){return f.type==='topre';}).map(function(f){return {id:f.id,label:f.label,width:f.width};});
    function preset(id) {
        if(holeRecipes && holeRecipes[id]){
            var recipe=holeRecipes[id],base=preset(recipe.presetId);
            base.options=Object.assign(componentOptions(base.options),recipe.defaults,{stabilizer:id});
            if(recipe.style==='costar')base.options.switch='alps';
            return base;
        }
        var family=Families.find(function(f){return f.id===id;});
        if(family)return {key:Object.assign({width:family.width,height:family.height,width2:family.width,height2:family.height,labels:[family.label]},family.capShape || {}),options:{switch:id,stabilizer:family.parts.length>1?id:'none',mount:family.mount || 'pcb'}};
        if(id==='alps-625-all')id='alps-7-all';
        var mx=id.startsWith('mx-'),p=(mx?mxPresets:presets).find(function(p){return p.id===id;});
        if(id==='ec11')p={label:'EC11',width:1};
        if(!p)throw Error('Unknown key preset.');
        return {key:{width:p.width,width2:p.iso?1.5:p.z150?2:p.bae?1.5:p.zkb2?1:p.full || p.width,height:p.height || 1,height2:p.iso?1:p.z150?1:(p.zkb2 || p.bae)?2:p.height || 1,
            x2:p.iso?-.25:p.z150?-1:p.bae?.75:p.zkb2?1.25:p.left?p.width-p.full:0,y2:p.z150?1:(p.zkb2 || p.bae)?-1:0,stepped:!!p.full,labels:[p.label]},
            options:mx?{switch:id==='mx-6-plate-compat'?id:id.startsWith('mx-compat-')?id:id==='mx-dual275'?'mx-dual275':id==='mx-multistep'?'mx-multistep':'mx',switchRotation:p.height===2?90:0,
                stabilizer:id==='mx-compat-2.75-split'?id:id==='mx-dual275'?'mx-dual275':p.stabs?'mx':'none',mount:p.mount || 'plate',mxPattern:id==='mx-6-plate-compat'?'legacy':'cherry',direction:'south',stemOffset:p.offset || 0}: {switch:id==='ec11'?'ec11':id==='alps-multistep'?'alps-multistep':'alps',switchRotation:p.height===2?90:0,stabilizer:p.canon || (p.barrels?'alps-barrel625':p.bae?'alps-bae':p.zkb2?'alps-zkb2':p.stabs?'alps-default':'none'),direction:'south'}};
    }
    // Logical switch technology is independent of support/compatibility geometry.
    // Joined footprints remain whole templates: splitting their CAD outlines
    // into arbitrary rectangles would lose clips and alternate stem openings.
    var integratedPatterns={
        'mx-compat-2':{type:'mx',mount:'pcb',stabilizer:'none'},
        'mx-compat-2.25':{type:'mx',mount:'pcb',stabilizer:'none'},
        'mx-compat-2.75':{type:'mx',mount:'pcb',stabilizer:'none'},
        'mx-compat-2.75-split':{type:'mx',mount:'pcb',stabilizer:'mx-compat-2.75-split'},
        'mx-dual275':{type:'mx',mount:'pcb',stabilizer:'mx-dual275'},
        'mx-multistep':{type:'mx',mount:'pcb',stabilizer:'none'},
        'mx-wide2':{type:'mx',mount:'pcb',stabilizer:'none'},
        'mx-wide225':{type:'mx',mount:'pcb',stabilizer:'none'},
        'mx-6-plate-compat':{type:'mx',mount:'plate',stabilizer:'mx'},
        'alps-multistep':{type:'alps',stabilizer:'none'}
    };
    function family(id){return Families.find(function(f){return f.id===id;});}
    function baseTopre(id){return /^topre-(1|1\.25|1\.5|1\.75)$/.test(id);}
    function componentOptions(input){
        var o=Object.assign({axis:'auto',spacing:'',direction:'south',mount:'plate',mxPattern:input.components?'cherry':'legacy',switchRotation:0,extraSize:0,stemOffset:0},input);
        if(!o.components){
            var f=family(o.switch),p=integratedPatterns[o.switch];
            if(f){o.stabilizer=baseTopre(f.id)?'none':f.id;o.switch=f.type;o.mount=f.mount||o.mount;}
            else if(p){o.stabilizer=o.switch;o.switch=p.type;if(p.mount)o.mount=p.mount;}
        }
        o.components=true;return o;
    }
    function geometryOptions(input){
        var o=Object.assign({},input,{components:false});
        if(holeRecipes && holeRecipes[o.stabilizer])o.stabilizer=holeRecipes[o.stabilizer].style;
        var f=family(o.stabilizer),p=integratedPatterns[o.stabilizer];
        if(f||p){
            var type=f?f.type:p.type;
            if(o.switch!==type)throw Error('This compatibility pattern requires a '+type.toUpperCase()+' switch. Choose a matching stabilizer pattern.');
            o.switch=o.stabilizer;
            if(p){o.stabilizer=p.stabilizer;if(p.mount)o.mount=p.mount;}
        }
        return o;
    }
    // A deliberate menu replacement may override inferred cap dimensions.
    // Generic wire styles retain the chosen cap size; measured patterns use
    // their catalogue footprint. The editor preserves the physical stem.
    function replacement(input,key) {
        var o=componentOptions(input),id=o.stabilizer,cap=null;
        var aliases={'alps-barrel625':'alps-625-barrels','mx-wide2':'mx-compat-2','mx-wide225':'mx-compat-2.25'};
        if(!['original','none','mx','costar','alps-default','alps-aek','alps-at101'].includes(id))cap=preset(aliases[id] || id).key;
        if(o.fitStandardHole && ['mx','costar','alps-default','alps-aek','alps-at101'].includes(id))cap={width:2,height:1,width2:2,height2:1};
        var f=family(id),p=integratedPatterns[id];
        // Joined templates contain their own switch opening. Choosing one
        // explicitly converts that opening, rather than failing on the old type.
        if(f || p)o.switch=f?f.type:p.type;
        if((f && f.mount) || (p && p.mount))o.mount=(f || p).mount;
        var result=Object.assign({},key);
        if(cap){
            ['width','height','width2','height2','x2','y2','stepped'].forEach(function(field){
                result[field]=cap[field]===undefined?(field==='stepped'?false:0):cap[field];
            });
        }
        return {key:result,options:o};
    }
    function sameComponents(a,b){
        a=componentOptions(a);b=componentOptions(b);
        return [...new Set(Object.keys(a).concat(Object.keys(b)))].every(function(k){
            var x=a[k],y=b[k];return x===y||((x===undefined||x===null||x==='')&&(y===undefined||y===null||y===''));
        });
    }
    function simpleOpening(key){
        if(key.type==='ec11')return true;
        if(key.contours.length!==1)return false;
        var pts=key.contours[0].points.map(function(p){return G.rotate({x:p.x-key.center.x,y:p.y-key.center.y},-key.holeAngle);}),b=G.bounds(pts);
        var size=key.type==='alps'?[15.5,12.8]:key.type==='topre'?[14.6,14]:key.type==='universal'?[15.5,14]:[14,14];
        return Math.abs(b.cx)<.3&&Math.abs(b.cy)<.3&&Math.abs(b.width-size[0])<.4&&Math.abs(b.height-size[1])<.4&&Math.abs(G.area(pts))>.85*b.width*b.height;
    }
    function inferComponents(key){
        var o=componentOptions({components:true,switch:['mx','alps','topre','universal','ec11'].includes(key.type)?key.type:'original',stabilizer:'original'});
        var d=key.detectedStabilizer||{},pattern=key.pattern||key.family,category=null;
        if(key.assembly)pattern=key.width===6.25?'mx-space625-7':'mx-companion125-7';
        if(baseTopre(pattern||''))pattern=null;
        if(!pattern&&key.type==='topre'&&!key.stabilizers.length&&key.width>=2)pattern=family('topre-mod-plain-'+key.width)?'topre-mod-plain-'+key.width:null;
        if(pattern&&(family(pattern)||integratedPatterns[pattern]))o.stabilizer=pattern;
        else if(d.family){
            if(d.family==='mx-pcb'||d.family==='mx-plate'){o.stabilizer='mx';o.mount=d.family==='mx-pcb'?'pcb':'plate';category=d.family;}
            else o.stabilizer=d.family==='alps'?'alps-default':d.family;
            if(o.stabilizer==='alps-default'&&key.width===5.5)o.stabilizer='alps-55';
            if(d.spacing!==undefined && o.stabilizer!=='alps-55')o.spacing=d.spacing;
            o.axis=d.vertical?'vertical':'horizontal';o.direction=d.direction||'south';o.stemOffset=d.stemOffset||0;
        } else if(key.type==='topre'&&key.stabilizers.length===2&&[6.25,7].includes(key.width)){
            var a=G.bounds(key.stabilizers[0].points),b=G.bounds(key.stabilizers[1].points);
            var span=Math.hypot(a.cx-b.cx,a.cy-b.cy);
            o.stabilizer=key.width===7&&span>110?'topre-7-wide':'topre-'+key.width;
        } else if(!key.stabilizers.length&&simpleOpening(key)&&o.switch!=='original')o.stabilizer='none';
        var f=family(o.stabilizer),p=integratedPatterns[o.stabilizer];
        if(f){o.mount=f.mount||o.mount;category=f.type==='mx'?'mx-'+(f.mount||'pcb'):f.type;}
        if(p){o.mount=p.mount||o.mount;category=p.type==='mx'?'mx-'+p.mount:p.type;}
        if(!category&&o.stabilizer.startsWith('alps-'))category='alps';
        if(o.stabilizer==='costar')category='alps';
        if(!category&&key.type==='topre')category='topre';
        if(!category&&key.type==='alps')category='alps';
        o.switchRotation=(key.holeAngle-key.capAngle)*180/Math.PI||0;
        // Read measured dimensions rather than replacing them with catalogue
        // defaults when the user changes only one support parameter.
        if(o.stabilizer==='mx'&&o.mount==='pcb'&&key.stabilizers.length===2){
            var b=G.bounds(key.stabilizers[0].points.map(function(q){return G.rotate({x:q.x-key.center.x,y:q.y-key.center.y},-key.capAngle-(d.vertical?Math.PI/2:0));}));
            o.pcbWidth=b.width;o.pcbHeight=b.height;o.pcbOffset=-Math.abs(b.cy);
        }
        return {options:o,category:category,unrecognized:o.switch==='original'||o.stabilizer==='original'};
    }
    // UI categories do not change the stable profile IDs stored in projects.
    var stabilizerCategories=[
        {id:'alps',label:'Alps',patterns:[
            ['alps-default','Alps default (Zenith)'],['alps-aek','AEK / common Alps'],['alps-at101','AT101'],['costar','Costar'],['alps-multistep','Caps Multistep compatibility'],
            ['alps-55','5.5u — complete spacebar supports'],['alps-canon8','8u — Canon complete supports'],['alps-canon-vertical2','cannon vertical 2u'],
            ['alps-barrel625','6.25u — two barrel stabilizers'],['alps-975-barrel','9.75u — barrel stabilizer'],
            ['alps-z150','Z150 Enter — wire + barrel'],['alps-7-all-flex','7u all stabs flex'],['alps-7-all','7u all stabs'],
            ['alps-multi275','2.75u multi stab'],['alps-bae','5140 BAE — wire + barrel'],['alps-zkb2','ZKB2 Enter — wire + barrel']]},
        {id:'mx-pcb',label:'MX PCB Mount',patterns:[['mx','Standard housing clearance'],['mx-compat-2','2u wide PCB compatibility'],['mx-compat-2.25','2.25u wide PCB compatibility'],['mx-compat-2.75','2.75u wide PCB compatibility'],['mx-multistep','Caps Multistep compatibility'],['mx-wide2','2u PCB mount — measured opening'],['mx-wide225','2.25u PCB mount — measured opening'],['mx-compat-2.75-split','2.75u split PCB compatibility'],['mx-dual275','2.75u dual opening PCB mount']]},
        {id:'mx-plate',label:'MX Plate Mount',patterns:[['mx','Standard clip-in stabilizer'],['mx-6-plate-compat','6u alternate-stem compatibility']]},
        {id:'topre',label:'Topre',patterns:[]}
    ];
    stabilizerCategories.forEach(function(group){
        group.patterns=group.patterns.map(function(p){return {id:p[0],label:p[1]};});
        Families.filter(function(f){return !baseTopre(f.id)&&(f.type==='topre'?group.id==='topre':f.type==='mx'?group.id==='mx-'+(f.mount||'pcb'):group.id==='alps');})
            .forEach(function(f){group.patterns.push({id:f.id,label:f.label+(f.legacy?' (previous alignment)':'')});});
    });
    // One catalogue supplies both replacement holes and KLE Add menus.
    // IDs stay stable; user-facing names and numeric ordering live here.
    var holeRecipes={},holeTypes=[
        {id:'alps',label:'Alps default',category:'alps',holes:[]},
        {id:'costar',label:'Costar',category:'alps',holes:[]},
        {id:'mx-pcb',label:'PCB mount',category:'mx',holes:[]},
        {id:'mx-plate',label:'Plate mount',category:'mx',holes:[]},
        {id:'topre',label:'Topre',category:'topre',holes:[]}
    ];
    var descriptions={
        'alps-default':'standard','alps-aek':'standard','alps-at101':'standard','costar':'standard',mx:'standard',
        'alps-multistep':'Caps Multistep','mx-multistep':'Caps Multistep',
        'alps-55':'spacebar — complete supports','alps-canon8':'spacebar — Canon supports',
        'alps-canon-vertical2':'Canon vertical — 1.25u wide','alps-barrel625':'spacebar — twin barrels',
        'alps-975-barrel':'spacebar — barrel support','alps-z150':'Z150 Enter — wire and barrel',
        'alps-bae':'5140 BAE — wire and barrel','alps-zkb2':'ZKB2 Enter — wire and barrel',
        'alps-7-all':'spacebar — all stabs','alps-7-all-flex':'spacebar — all stabs and flex',
        'alps-multi275':'multi-stab','mx-ansi-iso':'ANSI–ISO compatibility',
        'mx-space625-7':'spacebar — 6.25u / 7u compatibility','mx-companion125-7':'companion — 7u mount',
        'mx-bottom125':'bottom row — previous alignment','mx-bottom125-aligned':'bottom row',
        'mx-bottom125-wide':'bottom row — wide opening','mx-bottom125-large':'bottom row — larger variant',
        'mx-plate-option2':'standard — option 2','mx-plate-vertical2-option2':'vertical — option 2',
        'mx-wide2':'measured opening','mx-wide225':'measured opening','mx-caps175-option2':'Caps Multistep — option 2',
        'mx-space625-left':'spacebar — left support (previous alignment)','mx-space625-left-aligned':'spacebar — left support',
        'topre-mod-dual':'modifier — dual hole','topre-mod-right':'modifier — right hole','topre-mod-left':'modifier — left hole',
        'topre-7':'spacebar','topre-6.25':'spacebar — paired supports','topre-7-wide':'spacebar — 114.3 mm support span'
    };
    var presetAliases={'alps-default':'alps-2','alps-aek':'alps-2','alps-at101':'alps-2','costar':'alps-2','alps-barrel625':'alps-625-barrels','mx-wide2':'mx-compat-2','mx-wide225':'mx-compat-2.25'};
    function menuEntry(id,presetId,label){
        var k=preset(presetId).key,size=Math.max(k.width,k.height,k.width2||0,k.height2||0);
        var desc=descriptions[id] || label.replace(/^Topre\s+/,'').replace(/^(?:vertical\s+)?\d+(?:\.\d+)?u\s*(?:[—–-]\s*)?/i,'').replace(/\b(?:mx |pcb mount |plate mount )/gi,'').replace(/\s+\d+(?:\.\d+)?u$/,'').trim();
        if(!desc || /^\d+(?:\.\d+)?u?$/.test(desc))desc='standard';
        return {id:id,presetId:presetId,size:size,label:size+'u '+desc};
    }
    function order(a,b){return a.size-b.size || a.label.localeCompare(b.label,undefined,{numeric:true}) || a.id.localeCompare(b.id);}
    stabilizerCategories.forEach(function(group){group.patterns.forEach(function(p){
        if(['alps-aek','alps-at101'].includes(p.id))return;
        var type=holeTypes.find(function(t){return t.id===(p.id==='costar'?'costar':group.id);});
        var pid=p.id==='mx'?'mx-2-'+group.id.slice(3):presetAliases[p.id]||p.id;
        type.holes.push(menuEntry(p.id,pid,p.label));
    });});
    function standard(type,size,pid,style,description,defaults){
        var id='hole-'+type+'-'+size+(description==='vertical'?'vertical':description==='ISO Enter'?'iso':description==='spacebar — offset stem'?'offset':'');
        holeRecipes[id]={presetId:pid,style:style,defaults:defaults||{}};
        var entry=menuEntry(id,id,size+'u '+description);entry.label=size+'u '+description;entry.size=size;
        holeTypes.find(function(t){return t.id===type;}).holes.push(entry);
    }
    // Explicit sizes backed by ai03's published generators; no nearest-size inference.
    presets.push({id:'alps-65',label:'6.5u spacebar — standard',width:6.5,stabs:true});
    for(var size of [1.75,2.25,2.75,6.25,6.5])standard('alps',size,size===1.75?'alps-175-stabs':size===6.5?'alps-65':size===6.25?'alps-625-barrels':size===2.25?'alps-225':'alps-multi275','alps-default',size>=5.5?'spacebar — standard':'standard');
    ['pcb','plate'].forEach(function(mount){
        for(var size of [2.25,2.75,3,6,6.25,7,8])standard('mx-'+mount,size,'mx-'+size+'-'+mount,'mx',size>=6?'spacebar — standard':'standard',{mount:mount});
        standard('mx-'+mount,2,'mx-vertical-'+mount,'mx','vertical',{mount:mount,switchRotation:90});
        standard('mx-'+mount,2,'mx-iso-'+mount,'mx','ISO Enter',{mount:mount,switchRotation:90});
        standard('mx-'+mount,6,'mx-6-offset-'+mount,'mx','spacebar — offset stem',{mount:mount,stemOffset:9.525});
    });
    standard('alps',2,'alps-vertical2','alps-canon-vertical2','vertical — 1u wide');
    // Costar uses the existing independent clip recipe, not a combined Cherry cutout.
    for(var size of [2.25,2.75,3,6.25,7,8])standard('costar',size,'mx-'+size+'-pcb','costar',size>=6?'spacebar — standard':'standard');
    holeTypes.forEach(function(t){t.holes.sort(order);});
    var addMenus={};
    holeTypes.forEach(function(t){addMenus[t.id]=t.holes.map(function(h){return {id:h.presetId,label:h.label,size:h.size,hole:h.id};});});
    function addBasic(type,items){
        items.forEach(function(p){
            if(addMenus[type].some(function(e){return e.id===p.id;}))return;
            var entry=menuEntry(p.id,p.id,p.label);addMenus[type].push(entry);
        });
        addMenus[type].sort(order);
    }
    addBasic('alps',presets.filter(function(p){return !p.stabs&&!p.canon&&!p.bae&&!p.zkb2&&!p.barrels;}));
    ['mx-pcb','mx-plate'].forEach(function(t){addBasic(t,mxPresets.filter(function(p){return !p.mount&&!p.stabs&&!integratedPatterns[p.id];}));});
    addBasic('topre',toprePresets.filter(function(p){return baseTopre(p.id);}));
    function holeDefaults(id,type){
        var entry=holeTypes.filter(function(t){return !type||t.id===type;}).flatMap(function(t){return t.holes;}).find(function(h){return h.id===id;});
        if(!entry)return {};
        var o=componentOptions(preset(entry.presetId).options),result={};
        ['switchRotation','stemOffset','axis','mxPattern'].forEach(function(k){result[k]=o[k];});
        return Object.assign(result,holeRecipes[id]?.defaults || {});
    }
    function menuPreset(id,hole){
        var p=preset(id);
        if(hole){var entry=holeTypes.flatMap(function(t){return t.holes;}).find(function(h){return h.id===hole&&h.presetId===id;});
            if(entry){p.options=componentOptions(p.options);p.options.stabilizer=hole;p.key.labels=[entry.label];}}
        return p;
    }
    return {holeStyle:function(id){return holeRecipes[id]?.style || id;},holeTypes:holeTypes,addMenus:addMenus,menuPreset:menuPreset,holeDefaults:holeDefaults,replacement:replacement,isIntegratedPattern:function(id){return !!family(id)||!!integratedPatterns[id];},componentOptions:componentOptions,geometryOptions:geometryOptions,sameComponents:sameComponents,inferComponents:inferComponents,stabilizerCategories:stabilizerCategories,presets:presets,mxPresets:mxPresets,toprePresets:toprePresets,preset:preset,switches:switches,spacing:spacing,stabilizers:stabilizers,switchShape:switchShape,generate:generate,
        pcbCompatibility:pcbCompatibility,polygon:polygon,rings:rings,union:union,place:place,clip:clip};
}));
