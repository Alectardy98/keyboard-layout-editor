// Explicit, approximate matching for user-selected unassigned contours.
// Never runs during import; accepting a guess retains the original CAD records.
(function(root,factory){
    if(typeof module==='object'&&module.exports)module.exports=factory(require('./geometry'),require('./profiles'));
    else root.PlateGuess=factory(root.PlateGeometry,root.PlateProfiles);
}(typeof globalThis!=='undefined'?globalThis:this,function(G,P){
    'use strict';
    var templates;
    function area(polys){return polys.reduce(function(n,p){return n+p.reduce(function(a,r,i){var v=Math.abs(G.area(r.map(function(q){return {x:q[0],y:q[1]};})));return a+(i?-v:v);},0);},0);}
    function bounds(polys){return G.bounds(P.rings(polys).flat());}
    function catalogue(){
        if(templates)return templates;
        templates=[];var seen=new Set();
        Object.entries(P.addMenus).flatMap(function(pair){return pair[1].map(function(e){return Object.assign({group:pair[0]},e);});}).forEach(function(entry){
            var p=P.menuPreset(entry.id,entry.hole),polys=P.generate(p.options,p.key),signature=JSON.stringify(polys);
            if(seen.has(signature))return;seen.add(signature);
            var type=P.holeTypes.find(function(t){return t.id===entry.group;});
            templates.push({label:(type.category==='mx'?'MX '+type.label:type.label)+' · '+entry.label,key:p.key,polys:polys});
        });
        return templates;
    }
    function find(contours){
        if(!contours.length||contours.length>64 || contours.every(function(c){return c.parts?.every(function(p){return p.type==='CIRCLE'||p.type==='ELLIPSE';});}))return [];
        var actual=P.union(contours.map(function(c){return P.polygon(c.points);})),box=bounds(actual),aa=area(actual),matches=[];
        if(aa<60||box.width>210||box.height>210)return [];
        catalogue().forEach(function(t){
            [0,Math.PI/2,Math.PI,Math.PI*1.5].forEach(function(angle){
                var rotated=P.place(t.polys,{x:0,y:0},angle),b=bounds(rotated);
                if(Math.abs(b.width-box.width)>Math.max(1.5,b.width*.16)||Math.abs(b.height-box.height)>Math.max(1.5,b.height*.16))return;
                var center={x:box.cx-b.cx,y:box.cy-b.cy};
                var placed=P.place(rotated,center,0),intersection=area(P.clip.intersection(actual,placed)),score=intersection/(aa+area(placed)-intersection);
                if(score<(b.width<18 && b.height<18?.86:.72))return;
                matches.push({label:t.label,key:JSON.parse(JSON.stringify(t.key)),center:center,angle:angle,score:score});
            });
        });
        // Equivalent rotated matches do not hide other plausible families.
        matches.sort(function(a,b){return b.score-a.score||a.label.localeCompare(b.label);});
        var labels=new Set();return matches.filter(function(m){if(labels.has(m.label))return false;labels.add(m.label);return true;}).slice(0,5);
    }
    return {find:find};
}));
