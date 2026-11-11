// Millimetre geometry shared by plate recognition, preview and export tests.
(function(root, factory) {
    if(typeof module === 'object' && module.exports) module.exports = factory();
    else root.PlateGeometry = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    'use strict';
    var TAU = Math.PI * 2;
    function point(x, y) {
        if(!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1e9 || Math.abs(y) > 1e9)
            throw Error('The DXF contains a non-finite or unsupported coordinate.');
        return {x:x, y:y};
    }
    function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
    function rotate(p, angle, center) {
        center = center || {x:0, y:0};
        var c = Math.cos(angle), s = Math.sin(angle), x = p.x - center.x, y = p.y - center.y;
        return point(center.x + x*c - y*s, center.y + x*s + y*c);
    }
    function transform(p, m) { return point(m[0]*p.x + m[2]*p.y + m[4], m[1]*p.x + m[3]*p.y + m[5]); }
    function multiply(a, b) {
        return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1],
            a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3],
            a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
    }
    function bounds(points) {
        if(!points.length) return {minX:0, minY:0, maxX:0, maxY:0, width:0, height:0, cx:0, cy:0};
        var minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
        points.forEach(function(p) { minX=Math.min(minX,p.x); minY=Math.min(minY,p.y); maxX=Math.max(maxX,p.x); maxY=Math.max(maxY,p.y); });
        return {minX:minX, minY:minY, maxX:maxX, maxY:maxY, width:maxX-minX, height:maxY-minY, cx:(minX+maxX)/2, cy:(minY+maxY)/2};
    }
    function area(points) {
        var result=0;
        points.forEach(function(p,i) { var q=points[(i+1)%points.length]; result+=p.x*q.y-q.x*p.y; });
        return result/2;
    }
    function rectangle(width, height, center, angle) {
        center=center || {x:0,y:0}; angle=angle || 0;
        return [[-1,-1],[1,-1],[1,1],[-1,1]].map(function(sign) {
            return rotate(point(center.x+sign[0]*width/2,center.y+sign[1]*height/2),angle,center);
        });
    }
    function arc(center, radius, start, sweep, tolerance) {
        tolerance=tolerance || 0.005;
        if(!Number.isFinite(radius) || radius<=0 || !Number.isFinite(start) || !Number.isFinite(sweep))
            throw Error('The DXF contains an invalid arc.');
        var step=2*Math.acos(Math.max(-1,Math.min(1,1-tolerance/radius)));
        var count=Math.max(2,Math.min(4096,Math.ceil(Math.abs(sweep)/Math.max(step,1e-6))));
        var result=[];
        for(var i=0;i<=count;i++) result.push(point(center.x+radius*Math.cos(start+sweep*i/count),center.y+radius*Math.sin(start+sweep*i/count)));
        return result;
    }
    function bulge(a, b, value, tolerance) {
        if(!value || distance(a,b)<1e-10) return [point(a.x,a.y),point(b.x,b.y)];
        var chord=distance(a,b), offset=chord*(1-value*value)/(4*value);
        var center=point((a.x+b.x)/2-(b.y-a.y)*offset/chord,(a.y+b.y)/2+(b.x-a.x)*offset/chord);
        var result=arc(center,chord*(1+value*value)/(4*Math.abs(value)),Math.atan2(a.y-center.y,a.x-center.x),4*Math.atan(value),tolerance);
        result[0]=point(a.x,a.y); result[result.length-1]=point(b.x,b.y);
        return result;
    }
    function polyline(vertices, closed, tolerance) {
        if(!vertices.length) return [];
        var result=[], count=closed ? vertices.length : vertices.length-1;
        for(var i=0;i<count;i++) {
            var segment=bulge(vertices[i],vertices[(i+1)%vertices.length],vertices[i].bulge || 0,tolerance);
            result=result.concat(segment.slice(0,-1));
        }
        result.push(point(vertices[closed ? 0 : vertices.length-1].x,vertices[closed ? 0 : vertices.length-1].y));
        return result;
    }
    function segmentDistance(p, a, b) {
        var dx=b.x-a.x,dy=b.y-a.y, length=dx*dx+dy*dy;
        var t=length ? Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)) : 0;
        return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
    }
    function contains(points, p) {
        var inside=false;
        for(var i=0,j=points.length-1;i<points.length;j=i++) {
            var a=points[i],b=points[j];
            if(segmentDistance(p,a,b)<1e-7) return true;
            if((a.y>p.y)!==(b.y>p.y) && p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) inside=!inside;
        }
        return inside;
    }
    function axes(points) {
        var result=[0], seen={'0':true}, edges=[];
        points.forEach(function(p,i) { var q=points[(i+1)%points.length]; edges.push({p:p,q:q,length:distance(p,q)}); });
        edges.sort(function(a,b) { return b.length-a.length; });
        edges.forEach(function(edge) {
            if(edge.length<1 || result.length>=64) return;
            var angle=Math.atan2(edge.q.y-edge.p.y,edge.q.x-edge.p.x);
            angle=((angle%(Math.PI/2))+Math.PI/2)%(Math.PI/2);
            if(angle>Math.PI/4) angle-=Math.PI/2;
            var key=angle.toFixed(5);
            if(!seen[key]) { seen[key]=true; result.push(angle); }
        });
        return result;
    }
    function minimumBox(points) {
        var best=null;
        axes(points).forEach(function(angle) {
            var local=points.map(function(p) { return rotate(p,-angle); }), box=bounds(local);
            var score=box.width*box.height;
            if(!best || score<best.score-1e-6) {
                var center=rotate(point(box.cx,box.cy),angle);
                best={angle:angle,width:box.width,height:box.height,center:center,score:score};
            }
        });
        return best;
    }
    // Join only unambiguous degree-two paths on the same layer. Intersections,
    // duplicate lines and open paths remain drawing geometry, never guessed holes.
    function contours(primitives, tolerance) {
        tolerance=tolerance || 0.02;
        var closed=[], open=[], nodes=[], buckets=Object.create(null), edges=[];
        function node(p,layer) {
            var x=Math.floor(p.x/tolerance),y=Math.floor(p.y/tolerance),closest=null,best=tolerance;
            for(var dx=-1;dx<=1;dx++) for(var dy=-1;dy<=1;dy++) {
                var list=buckets[layer+':'+(x+dx)+':'+(y+dy)] || [];
                list.forEach(function(index) { var d=distance(nodes[index].point,p); if(d<=best) {best=d;closest=index;} });
            }
            if(closest!==null) return closest;
            var index=nodes.length,key=layer+':'+x+':'+y;
            nodes.push({point:p,edges:[]}); (buckets[key] || (buckets[key]=[])).push(index);
            return index;
        }
        primitives.forEach(function(primitive) {
            if(primitive.points.length<2) { open.push(primitive); return; }
            if(primitive.closed || distance(primitive.points[0],primitive.points[primitive.points.length-1])<tolerance) {
                if(Math.abs(area(primitive.points))>1e-5)
                    closed.push({points:primitive.points,parts:[primitive],editable:primitive.editable!==false});
                else open.push(primitive);
                return;
            }
            if(!primitive.stitch) { open.push(primitive); return; }
            var a=node(primitive.points[0],primitive.layer || '0');
            var b=node(primitive.points[primitive.points.length-1],primitive.layer || '0');
            var index=edges.length; edges.push({a:a,b:b,primitive:primitive});
            nodes[a].edges.push(index); nodes[b].edges.push(index);
        });
        var seen=Object.create(null);
        edges.forEach(function(edge,index) {
            if(seen[index]) return;
            var component=[], queue=[index], degreeTwo=true;
            while(queue.length) {
                var current=queue.pop();
                if(seen[current]) continue;
                seen[current]=true; component.push(current);
                [edges[current].a,edges[current].b].forEach(function(n) {
                    if(nodes[n].edges.length!==2) degreeTwo=false;
                    nodes[n].edges.forEach(function(e) { if(!seen[e]) queue.push(e); });
                });
            }
            if(!degreeTwo) { component.forEach(function(e) { open.push(edges[e].primitive); }); return; }
            var first=edge.a,at=first,previous=-1,parts=[],points=[];
            for(var n=0;n<component.length;n++) {
                var next=nodes[at].edges.filter(function(e) { return e!==previous; })[0],item=edges[next];
                var vertices=item.a===at ? item.primitive.points : item.primitive.points.slice().reverse();
                points=points.concat(vertices.slice(0,-1)); parts.push(item.primitive);
                at=item.a===at ? item.b : item.a; previous=next;
            }
            if(at===first && Math.abs(area(points))>1e-5)
                closed.push({points:points,parts:parts,editable:parts.every(function(p) {return p.editable!==false;})});
            else parts.forEach(function(p) { open.push(p); });
        });
        return {closed:closed,open:open};
    }
    return {TAU:TAU,point:point,distance:distance,rotate:rotate,transform:transform,multiply:multiply,bounds:bounds,
        area:area,rectangle:rectangle,arc:arc,bulge:bulge,polyline:polyline,contains:contains,axes:axes,minimumBox:minimumBox,contours:contours};
}));
