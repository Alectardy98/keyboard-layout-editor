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
    function stabilizers(options,key) {
        var style=options.stabilizer || 'original';
        if(style==='original' || style==='none') return [];
        if(!['north','south'].includes(options.direction || 'south')) throw Error('Choose North or South stabilizer orientation.');
        if(style==='mx' && !['plate','pcb'].includes(options.mount || 'plate')) throw Error('Choose Plate mount or PCB mount.');
        var vertical=options.axis==='vertical' || (options.axis!=='horizontal' && key.height>key.width);
        var size=vertical?key.height:key.width,minSize=style.startsWith('alps')?1.75:2;
        if(size<minSize && !options.forceStabilizer) return [];
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
                centers.forEach(function(x){pieces.push(rectangle(7,15,x,-1.5));});
            } else {
                // Clip-in plate housing: body, outside ear and latch relief.
                centers.forEach(function(x,index) {
                    pieces.push(rectangle(6.75,12.3,x,-0.62));
                    pieces.push(rectangle(0.825,2.8,x+(index===0?-1:1)*3.7875,0.9));
                    pieces.push(rectangle(3.3,1.2,x,-7.37));
                });
                pieces.push(rectangle(distance-6.75,4.6,(centers[0]+centers[1])/2,0));
            }
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
        if(options.switch==='ec11') return polygon(Measured.ec11);
        var preset=switches[options.switch];
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
        var result=G.rectangle(preset.width+extra,preset.height+extra,{x:0,y:0},rotation*Math.PI/180);
        return polygon(result);
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
        {id:'alps-55',label:'5.5u — complete spacebar supports',width:5.5,stabs:true}
    ];
    function preset(id) {
        var p=presets.find(function(p){return p.id===id;});
        if(id==='ec11')p={label:'EC11',width:1};
        if(!p)throw Error('Unknown key preset.');
        return {key:{width:p.width,width2:p.full || p.width,height:1,height2:1,
            x2:p.left?p.width-p.full:0,stepped:!!p.full,labels:[p.label]},
            options:{switch:id==='ec11'?'ec11':'alps',stabilizer:p.stabs?'alps-default':'none',direction:'south'}};
    }
    return {presets:presets,preset:preset,switches:switches,spacing:spacing,stabilizers:stabilizers,switchShape:switchShape,generate:generate,
        polygon:polygon,rings:rings,union:union,place:place,clip:clip};
}));
