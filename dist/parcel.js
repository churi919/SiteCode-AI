const R=111320;
export function toLocal(point,anchor){return {x:(point.lng-anchor.lng)*R*Math.cos(anchor.lat*Math.PI/180),z:-(point.lat-anchor.lat)*R};}
export function toGeo(point,anchor){return {lat:anchor.lat-point.z/R,lng:anchor.lng+point.x/(R*Math.cos(anchor.lat*Math.PI/180))};}
const GEOMETRY_TOLERANCE = 1e-7; // Local metres; boundary contact is allowed.
const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.z);
const cross = (a,b,c) => (b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
function onSegment(p,a,b,tolerance=GEOMETRY_TOLERANCE){
  const length=Math.hypot(b.x-a.x,b.z-a.z);
  if(length<=tolerance)return Math.hypot(p.x-a.x,p.z-a.z)<=tolerance;
  return Math.abs(cross(a,b,p))<=tolerance*length&&p.x>=Math.min(a.x,b.x)-tolerance&&p.x<=Math.max(a.x,b.x)+tolerance&&p.z>=Math.min(a.z,b.z)-tolerance&&p.z<=Math.max(a.z,b.z)+tolerance;
}
function orientation(a,b,p,tolerance){const v=cross(a,b,p),limit=tolerance*Math.hypot(b.x-a.x,b.z-a.z);return v>limit?1:v<-limit?-1:0;}
function segmentsIntersect(a,b,c,d,tolerance){
  const o1=orientation(a,b,c,tolerance),o2=orientation(a,b,d,tolerance),o3=orientation(c,d,a,tolerance),o4=orientation(c,d,b,tolerance);
  return (o1*o2<0&&o3*o4<0)||(!o1&&onSegment(c,a,b,tolerance))||(!o2&&onSegment(d,a,b,tolerance))||(!o3&&onSegment(a,c,d,tolerance))||(!o4&&onSegment(b,c,d,tolerance));
}
export function inPolygon(point,polygon,tolerance=GEOMETRY_TOLERANCE){
  if(polygon.length<3)return true;
  if(!finitePoint(point)||!polygon.every(finitePoint))return false;
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if(onSegment(point,a,b,tolerance))return true;
    if(((a.z>point.z)!==(b.z>point.z))&&(point.x<(b.x-a.x)*(point.z-a.z)/(b.z-a.z)+a.x))inside=!inside;
  }
  return inside;
}
/** Unclosed local x/z vertices. Reject crossings, duplicate edges and zero area. */
export function isSimplePolygon(points,tolerance=GEOMETRY_TOLERANCE){
  if(!Array.isArray(points)||points.length<3||!points.every(finitePoint)||polygonArea(points)<=tolerance*tolerance)return false;
  const n=points.length;
  for(let i=0;i<n;i++){
    const a=points[i],b=points[(i+1)%n],c=points[(i+2)%n];
    if(Math.hypot(b.x-a.x,b.z-a.z)<=tolerance)return false;
    // Consecutive collinear edges may continue, but must not retrace each other.
    if(orientation(a,b,c,tolerance)===0&&(a.x-b.x)*(c.x-b.x)+(a.z-b.z)*(c.z-b.z)>tolerance*tolerance)return false;
    for(let j=i+1;j<n;j++){
      if(j===i+1||(i===0&&j===n-1))continue;
      if(segmentsIntersect(a,b,points[j],points[(j+1)%n],tolerance))return false;
    }
  }
  return true;
}
/** Full boundary containment, including concave parcels and boundary contact. */
export function polygonContainsPolygon(inner,outer,tolerance=GEOMETRY_TOLERANCE){
  if(!isSimplePolygon(inner,tolerance)||!isSimplePolygon(outer,tolerance))return false;
  if(!inner.every(p=>inPolygon(p,outer,tolerance)))return false;
  for(let i=0;i<inner.length;i++){
    const a=inner[i],b=inner[(i+1)%inner.length],rx=b.x-a.x,rz=b.z-a.z;
    const length=Math.hypot(rx,rz),parameterTolerance=tolerance/length,splits=[0,1];
    for(let j=0;j<outer.length;j++){
      const c=outer[j],d=outer[(j+1)%outer.length],sx=d.x-c.x,sz=d.z-c.z;
      const denominator=rx*sz-rz*sx,qx=c.x-a.x,qz=c.z-a.z;
      if(Math.abs(denominator)>tolerance*(length+Math.hypot(sx,sz))){
        const t=(qx*sz-qz*sx)/denominator,u=(qx*rz-qz*rx)/denominator;
        const outerTolerance=tolerance/Math.hypot(sx,sz);
        if(t>=-parameterTolerance&&t<=1+parameterTolerance&&u>=-outerTolerance&&u<=1+outerTolerance)splits.push(Math.max(0,Math.min(1,t)));
      }else{
        // Include overlap endpoints so tangencies and collinear edges split correctly.
        for(const p of [c,d])if(onSegment(p,a,b,tolerance))splits.push(Math.max(0,Math.min(1,((p.x-a.x)*rx+(p.z-a.z)*rz)/(length*length))));
      }
    }
    splits.sort((x,y)=>x-y);
    for(let j=1;j<splits.length;j++){
      if(splits[j]-splits[j-1]<=parameterTolerance)continue;
      const t=(splits[j]+splits[j-1])/2;
      if(!inPolygon({x:a.x+t*rx,z:a.z+t*rz},outer,tolerance))return false;
    }
  }
  return true;
}
export function footprint(position,width=38,depth=26){const a=position.rotation*Math.PI/180;return [[-width/2,-depth/2],[width/2,-depth/2],[width/2,depth/2],[-width/2,depth/2]].map(([x,z])=>({x:position.x+x*Math.cos(a)-z*Math.sin(a),z:position.z+x*Math.sin(a)+z*Math.cos(a)}));}
export function polygonArea(points){if(points.length<3)return 0;return Math.abs(points.reduce((v,p,i)=>{const q=points[(i+1)%points.length];return v+p.x*q.z-q.x*p.z;},0)/2);}
export function screenToGeo(x,y,width,height,center,zoom=19){const size=256*2**zoom;const lng=center.lng+(x-width/2)*640/width/size*360;const sin=Math.sin(center.lat*Math.PI/180);const cy=(.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*size;const py=cy+(y-height/2)*520/height;return {lat:Math.atan(Math.sinh(Math.PI*(1-2*py/size)))*180/Math.PI,lng};}
export function geoToScreen(point,center,zoom=19){const size=256*2**zoom;const py=lat=>(.5-Math.log((1+Math.sin(lat*Math.PI/180))/(1-Math.sin(lat*Math.PI/180)))/(4*Math.PI))*size;return {x:320+(point.lng-center.lng)/360*size,y:260+py(point.lat)-py(center.lat)};}
export function overlaySVG(polygon,position,anchor,center=anchor,dimensions={x:38,z:26}){const project=p=>geoToScreen(p,center);const pts=polygon.map(project);const fp=footprint(position,dimensions.x,dimensions.z).map(p=>project(toGeo(p,anchor)));const local=polygon.map(p=>toLocal(p,anchor));const fits=local.length<3||polygonContainsPolygon(footprint(position,dimensions.x,dimensions.z),local);const b=project(toGeo(position,anchor));const angle=position.rotation*Math.PI/180;const arrow=project(toGeo({x:position.x+Math.sin(angle)*20,z:position.z-Math.cos(angle)*20},anchor));return `<svg class="parcel-overlay" viewBox="0 0 640 520" preserveAspectRatio="none" aria-hidden="true">${pts.length>1?`<${pts.length>=3?'polygon':'polyline'} points="${pts.map(p=>`${p.x},${p.y}`).join(' ')}" fill="${pts.length>=3?'#e77c3a17':'none'}" stroke="#e77c3a" stroke-width="2.5" stroke-dasharray="7 5"/>`:''}${pts.map((p,i)=>`<circle cx="${p.x}" cy="${p.y}" r="5" fill="#fffdf7" stroke="#e77c3a" stroke-width="2"/><text x="${p.x+9}" y="${p.y-9}" fill="#9c4d27" font-family="sans-serif" font-size="14">${i+1}</text>`).join('')}<polygon points="${fp.map(p=>`${p.x},${p.y}`).join(' ')}" fill="${fits?'#397f70c0':'#c6634dc0'}" stroke="white" stroke-width="2.4"/><line x1="${b.x}" y1="${b.y}" x2="${arrow.x}" y2="${arrow.y}" stroke="#fff" stroke-width="3"/><circle cx="${arrow.x}" cy="${arrow.y}" r="3.6" fill="#fff"/><circle cx="${b.x}" cy="${b.y}" r="3" fill="#fff"/></svg>`;}
