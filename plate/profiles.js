// Physical dimensions in mm. Keep data separate from the editor and recognizer.
// Drawing references and preset limitations are recorded in docs/plate-editor.md.
(function(root,factory) {
    if(typeof module==='object' && module.exports) module.exports=factory(require('polygon-clipping'),require('./geometry.js'),require('./measured.js'));
    else root.PlateProfiles=factory(root.polygonClipping,root.PlateGeometry,root.PlateMeasured);
}(typeof globalThis!=='undefined'?globalThis:this,function(clip,G,Measured) {
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
        var style=options.stabilizer || 'original';
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
        if(style==='alps-default' && size===5.5 && !options.spacing) {
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
    function switchShape(options) {
        if(options.switch==='mx-dual275')return polygon(Measured.mxDual275[0]);
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
        {id:'alps-55',label:'5.5u — complete spacebar supports',width:5.5,stabs:true}
    ];
    // Explicit sizes rather than rounding unknown spacebars to a nearby wire.
    var mxPresets=[1,1.25,1.5,1.75].map(function(size){return {id:'mx-'+size,label:size+'u',width:size};});
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
    function preset(id) {
        if(id==='alps-625-all')id='alps-7-all';
        var mx=id.startsWith('mx-'),p=(mx?mxPresets:presets).find(function(p){return p.id===id;});
        if(id==='ec11')p={label:'EC11',width:1};
        if(!p)throw Error('Unknown key preset.');
        return {key:{width:p.width,width2:p.iso?1.5:p.z150?2:p.bae?1.5:p.zkb2?1:p.full || p.width,height:p.height || 1,height2:p.iso?1:p.z150?1:(p.zkb2 || p.bae)?2:p.height || 1,
            x2:p.iso?-.25:p.z150?-1:p.bae?.75:p.zkb2?1.25:p.left?p.width-p.full:0,y2:p.z150?1:(p.zkb2 || p.bae)?-1:0,stepped:!!p.full,labels:[p.label]},
            options:mx?{switch:id==='mx-dual275'?'mx-dual275':id==='mx-multistep'?'mx-multistep':'mx',switchRotation:p.height===2?90:0,
                stabilizer:id==='mx-dual275'?'mx-dual275':p.stabs?'mx':'none',mount:p.mount || 'plate',mxPattern:'cherry',direction:'south',stemOffset:p.offset || 0}: {switch:id==='ec11'?'ec11':id==='alps-multistep'?'alps-multistep':'alps',switchRotation:p.height===2?90:0,stabilizer:p.canon || (p.barrels?'alps-barrel625':p.bae?'alps-bae':p.zkb2?'alps-zkb2':p.stabs?'alps-default':'none'),direction:'south'}};
    }
    return {presets:presets,mxPresets:mxPresets,preset:preset,switches:switches,spacing:spacing,stabilizers:stabilizers,switchShape:switchShape,generate:generate,
        polygon:polygon,rings:rings,union:union,place:place,clip:clip};
}));
