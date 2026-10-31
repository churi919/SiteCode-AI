import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const C = { ground:0xe8ece7, base:0xf5f5ed, road:0x65716f, curb:0xd6dcd4, white:0xf7f5e9, glass:0x638d8b, frame:0xe9e8dd, wood:0xb78a63, orange:0xe48e54, green:0x76967d, darkgreen:0x436c5f, shadow:0x283e38 };
const positions = { width:[-6,0.4,24],path:[21,1,-9],turning:[34,0.4,24],gradient:[-32,0.4,7],clearance:[-27,6.6,24] };
const names = {width:['01','Width · 净宽'],path:['02','Outdoor path · 室外路径'],turning:['03','Dead-end segment · 尽端路段'],gradient:['04','Slope · 坡度'],clearance:['05','Clearance · 净空']};

/** Architectural context is an illustrative sample, never a surveyed site model. */
export async function createScene(container, { onSelectIssue=()=>{},onPlacementChange=()=>{} }={}) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xeef0e8);
  scene.fog = new THREE.Fog(0xeef0e8,180,360);
  const renderer = new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.7));
  renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.25;
  renderer.domElement.style.cssText='display:block;width:100%;height:100%;touch-action:none';
  renderer.domElement.setAttribute('aria-label','Interactive 3D building model · 可交互三维建筑模型');
  container.appendChild(renderer.domElement);
  if(getComputedStyle(container).position==='static') container.style.position='relative';
  const camera=new THREE.PerspectiveCamera(37,1,0.1,650); camera.position.set(92,89,108);
  const controls=new OrbitControls(camera,renderer.domElement); controls.target.set(0,0,2); controls.enableDamping=true;controls.dampingFactor=.08;
  controls.maxPolarAngle=Math.PI*.475; controls.minDistance=30; controls.maxDistance=250;
  controls.enablePan=true;controls.minPolarAngle=.03;
  const ambient=new THREE.HemisphereLight(0xffffff,0xc6d0bd,2.25);scene.add(ambient);
  const sun=new THREE.DirectionalLight(0xfff5dc,3.2);sun.position.set(-55,95,45);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048); Object.assign(sun.shadow.camera,{left:-110,right:110,top:110,bottom:-110,near:1,far:230});sun.shadow.bias=-.0006;sun.shadow.normalBias=.08;scene.add(sun);
  const fill=new THREE.DirectionalLight(0xd8e8ef,.65);fill.position.set(80,30,-70);scene.add(fill);
  const mats={};const material=(color,roughness=.85)=>mats[color]||(mats[color]=new THREE.MeshStandardMaterial({color,roughness,metalness:.02}));
  const addBox=(parent,w,h,d,x,y,z,color,shadow=true)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material(color));m.position.set(x,y,z);m.castShadow=shadow;m.receiveShadow=true;parent.add(m);return m;};
  const plane=(parent,w,d,x,z,color,y=.025)=>addBox(parent,w,.045,d,x,y,z,color,false);
  const line=(parent,points,color=0xffffff,dashed=false)=>{const geo=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p)));const mat=dashed?new THREE.LineDashedMaterial({color,dashSize:1.2,gapSize:.8}):new THREE.LineBasicMaterial({color});const l=new THREE.Line(geo,mat);if(dashed)l.computeLineDistances();parent.add(l);return l;};
  const world=new THREE.Group();scene.add(world);
  addBox(world,166,1.6,142,0,-1.0,0,0xd1d8ce,false);
  addBox(world,164,.38,140,0,-.1,0,C.ground,false);
  // Two public streets frame the demonstrator plot.
  plane(world,164,12,0,49,C.road,.12);plane(world,12,140,-57,0,C.road,.13);
  plane(world,164,1.5,0,41.8,C.curb,.17);plane(world,1.5,140,-49.8,0,C.curb,.18);
  for(let x=-77;x<80;x+=7)plane(world,3,.16,x,49,0xd9ded6,.18);
  for(let z=-62;z<65;z+=7)plane(world,.16,3,-57,z,0xd9ded6,.18);
  // Sidewalk pavers and a planted street edge, clearly schematic.
  for(let x=-44;x<72;x+=4)line(world,[[x,.18,38],[x,.18,41]],0xbec9bc);
  for(let z=-58;z<37;z+=4)line(world,[[-49,.18,z],[-46,.18,z]],0xbec9bc);
  plane(world,91,71,1,-1,C.base,.11);
  const defaultSiteBoundary=line(world,[[-44,.22,-36],[46,.22,-36],[46,.22,35],[-44,.22,35],[-44,.22,-36]],0x9dac9b,true);
  const parcelGroup=new THREE.Group();world.add(parcelGroup);
  const context=new THREE.Group();world.add(context);
  function contextBlock(x,z,w,d,h){const block=addBox(context,w,h,d,x,h/2+.2,z,0xcbd4c9);addBox(context,w+.5,.38,d+.5,x,h+.4,z,0xe5e8dd);for(let y=2.8;y<h;y+=3.3)for(let xx=-w/2+1.5;xx<w/2-1;xx+=3.1)planeWindow(context,2,1.2,.07,x+xx,y,z+d/2+.04,0x9dafa4);return block;}
  function planeWindow(parent,w,h,d,x,y,z,c){return addBox(parent,w,h,d,x,y,z,c,false);}
  contextBlock(-25,-53,24,19,16);contextBlock(9,-55,24,15,11);contextBlock(61,-17,17,25,18);contextBlock(63,18,17,16,9);contextBlock(-72,-22,10,28,13);contextBlock(-70,18,13,15,8);
  const trees=new THREE.Group();world.add(trees);
  function tree(x,z,s=1){const t=new THREE.Group();t.position.set(x,.15,z);t.scale.setScalar(s);trees.add(t);const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.16,.25,3,7),material(0x8d8a6b));trunk.position.y=1.5;t.add(trunk);trunk.castShadow=true;const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(2.35,1),material(C.green));crown.scale.set(1,1.22,1);crown.position.y=4.5;crown.castShadow=true;t.add(crown);const c2=new THREE.Mesh(new THREE.IcosahedronGeometry(1.85,1),material(0x88a48b));c2.position.set(1.1,4.3,.6);c2.castShadow=true;t.add(c2);}
  [[-42,-29,1],[-42,-14,.8],[-42,4,.9],[-42,28,1],[42,-29,1],[41,-16,.8],[43,5,.85],[41,31,.8],[-30,37,.8],[-14,37,.85],[8,37,.85],[28,37,.8],[-38,-43,1.1],[29,-43,1.1],[56,-40,1.1],[72,35,1]].forEach(p=>tree(...p));
  const environmentObjects=[...world.children];
  const modelRoot=new THREE.Group();world.add(modelRoot);const sample=new THREE.Group();modelRoot.add(sample);let external=null,isSample=true,externalSize=null,importedIncludesSite=false,siteContextActive=false,hasDrawnParcel=false;
  const designGroup=new THREE.Group();sample.add(designGroup);
  const architecture=new THREE.Group();sample.add(architecture);
  // Three-storey office: slender slabs, recessed glazing, fins and roof garden.
  addBox(architecture,38,.45,26,0,.5,0,C.white);const buildingShell=addBox(architecture,35.3,8.8,23.4,0,4.9,0,C.glass);
  addBox(architecture,11,9,23.8,-12,5,0,0xe4e4d5);
  for(const y of [.8,3.8,6.8,9.8])addBox(architecture,37.4,.3,25,0,y,0,C.white);
  for(let x=-15.8;x<18;x+=3.3){for(const z of [-12.05,12.05])addBox(architecture,.2,8.8,.32,x,5.1,z,C.frame);}
  for(let z=-9.6;z<11;z+=3.2)for(const x of [-17.75,17.75])addBox(architecture,.32,8.8,.2,x,5.1,z,C.frame);
  // Warm timber shading and concrete core distinguish the entry facade.
  for(let x=-16;x<-6;x+=1.05)addBox(architecture,.16,8.7,.65,x,5,12.35,C.wood);
  addBox(architecture,6.3,9.7,6.2,-13,5,-8,0xc5c4b2);
  addBox(architecture,8.5,2.3,5.5,-10.8,10.9,-6.7,0xc1c4b3);
  addBox(architecture,37,.32,24.6,0,10,0,C.white);
  for(const [x,z,w,d] of [[7,-6,15,7],[8,6,13,4],[-11,6,8,3]]){addBox(architecture,w,.45,d,x,10.35,z,0xc6cbb6);addBox(architecture,w-.5,.16,d-.5,x,10.66,z,0x839a7b);}
  for(let x=2;x<16;x+=2.4)addBox(architecture,.15,.15,5.7,x,12.15,-6,C.wood);
  for(const x of [1,16])for(const z of [-8.6,-3.4])addBox(architecture,.16,1.6,.16,x,11.3,z,C.wood);
  // Entrance terrace, benches and planted courts.
  const entryTerrace=plane(architecture,23,5,4,15.5,0xd3d8ca,.35);
  for(const x of [-15,14]){addBox(architecture,5,.5,2.2,x,.55,17,C.white);addBox(architecture,4.6,.2,1.8,x,.89,17,0x8fa681);}
  for(const x of [-4,8]){addBox(architecture,4,.15,1,x,.9,15.9,C.wood);for(const xx of [x-1.4,x+1.4])addBox(architecture,.12,.6,.7,xx,.55,15.9,C.darkgreen);}
  // Two miniature cars make the street scale immediately readable.
  const contextCars=[];
  function car(x,z,c,rot=0){const g=new THREE.Group();g.position.set(x,.2,z);g.rotation.y=rot;world.add(g);contextCars.push(g);addBox(g,2,1,4.4,0,.7,0,c);addBox(g,1.8,.8,2.1,0,1.6,-.2,0xa9bdb7);for(const xx of [-1.02,1.02])for(const zz of [-1.3,1.3]){const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.4,.4,.22,12),material(0x3e4b47));wheel.rotation.z=Math.PI/2;wheel.position.set(xx,.5,zz);g.add(wheel);}}
  car(38,47,0xe2ded0,Math.PI/2);car(-58,-42,0x839b8d);
  const markerLayer=document.createElement('div');markerLayer.style.cssText='position:absolute;inset:0;pointer-events:none;overflow:hidden';container.appendChild(markerLayer);
  const markers=new Map(),externalMarkers=new Map();let externalSelected=null,externalHighlight=null,cameraFlight=null;let results=[],selected=null,moveMode=false,disposed=false;let roadParts=[],canopyTop=null,pathLine=null,pathArrows=[];let codeMarkState=null,codeHighlight=null;let input={clearWidth:3.2,overheadClearance:4.1,deadEndLength:58,outdoorPath:52,gradientDenominator:10};
  const codeCallout=document.createElement('div');codeCallout.style.cssText='display:none;position:absolute;pointer-events:none;max-width:190px;padding:7px 10px;border:1px solid #5282b8;border-radius:8px;background:#f6fafff2;color:#315e8a;font:500 9px/1.4 system-ui;box-shadow:0 3px 12px #24372c18;transform:translate(-50%,12px);z-index:3';codeCallout.setAttribute('role','status');markerLayer.appendChild(codeCallout);
  for(const id of Object.keys(positions)){const b=document.createElement('button');b.type='button';b.dataset.issue=id;b.title=names[id][1];b.setAttribute('aria-label',names[id][1]);b.style.cssText='position:absolute;pointer-events:auto;border:2px solid #fff;border-radius:999px;width:29px;height:29px;background:#c95d41;color:white;font:700 11px system-ui;box-shadow:0 3px 12px #24372c30;cursor:pointer;transform:translate(-50%,-50%)';b.textContent=names[id][0];b.addEventListener('click',e=>{e.stopPropagation();selectIssue(id);onSelectIssue(id);});markerLayer.appendChild(b);markers.set(id,b);}
  const selectionRing=new THREE.Mesh(new THREE.RingGeometry(1.6,1.8,40),new THREE.MeshBasicMaterial({color:0xe1804d,side:THREE.DoubleSide,transparent:true,opacity:.75,depthWrite:false}));selectionRing.rotation.x=-Math.PI/2;selectionRing.visible=false;sample.add(selectionRing);
  function cleanGroup(group){while(group.children.length){const c=group.children.pop();c.traverse(o=>{o.geometry?.dispose();if(o.material&&!Object.values(mats).includes(o.material)){if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose();}});}}
  function setDesign(values){input={...input,...values};cleanGroup(designGroup);const w=Math.max(.6,Math.min(10,Number(input.clearWidth)||3.2));const length=Math.max(24,Math.min(65,Number(input.deadEndLength)||58));
    roadParts=[plane(designGroup,length,w,-24+length/2,24,0xd58a5b,.25),plane(designGroup,w,34,-32,8,0xd58a5b,.26),plane(designGroup,8,4,-32,32,0xd58a5b,.27)];
    for(let x=-23;x<-24+length;x+=5)plane(designGroup,2,.12,x,24,0xffe9c3,.30);
    for(let z=-7;z<23;z+=5)plane(designGroup,.12,2,-32,z,0xffe9c3,.30);
    line(designGroup,[[-24,.34,24-w/2],[-24+length,.34,24-w/2]],0xf1cda9);line(designGroup,[[-24,.34,24+w/2],[-24+length,.34,24+w/2]],0xf1cda9);
    const clearance=Math.max(2,Math.min(8,Number(input.overheadClearance)||4.1));canopyTop=addBox(designGroup,8,.55,w+2.8,-27,clearance+.55,24,0xaeb6a6);for(const z of [24-w/2-1,24+w/2+1])for(const x of [-30.5,-23.5])addBox(designGroup,.25,clearance,.25,x,clearance/2+.2,z,0xd9dacb);
    // A schematic outdoor detour with fixed endpoints for the presentation pair.
    // 52 m = 8 + 36 + 8; 41 m = 2.5 + 36 + 2.5. No route is inferred from imported geometry.
    const pathLength=Math.max(.1,Number(input.outdoorPath)||52),run=Math.min(36,pathLength),detour=(pathLength-run)/2,endZ=24-run,detourX=17+detour;
    pathLine=line(designGroup,[[17,.36,24],[detourX,.36,24],[detourX,.36,endZ],[17,.36,endZ]],0xd56b4d,true);
    pathLine.userData={declaredLength:pathLength,schematic:true};
    pathArrows=[];
    for(const z of [24-run*.3,24-run*.7]){const arrow=new THREE.Mesh(new THREE.ConeGeometry(.48,1.45,3),new THREE.MeshBasicMaterial({color:0xd56b4d}));arrow.rotation.x=-Math.PI/2;arrow.position.set(detourX,.4,z);designGroup.add(arrow);pathArrows.push(arrow);}
    for(const [x,z]of [[17,24],[17,endZ]]){const dot=new THREE.Mesh(new THREE.CircleGeometry(.45,16),new THREE.MeshBasicMaterial({color:0xd56b4d}));dot.rotation.x=-Math.PI/2;dot.position.set(x,.38,z);designGroup.add(dot);pathArrows.push(dot);}
    // This dimension applies to the declared horizontal dead-end segment, not the entire illustrative L-shaped lane.
    line(designGroup,[[-24,.36,28],[-24+length,.36,28]],0xb78a63,true);
    for(const x of [-24,-24+length])line(designGroup,[[x,.36,27.2],[x,.36,28.8]],0xb78a63);
    line(designGroup,[[-6,.37,24-w/2],[-6,.37,24+w/2]],0xfff4de);
    for(const z of [24-w/2,24+w/2])line(designGroup,[[-6.7,.37,z],[-5.3,.37,z]],0xfff4de);
    positions.turning[0]=-24+length;positions.clearance[1]=clearance+1.7;
    positions.path[0]=detourX;positions.path[2]=24-run*.5;
    applyIssueColors();
    selectIssue(selected);
    rebuildCodeMark();
  }
  function applyIssueColors(){const status=id=>results.find(r=>r.id===id)?.status;roadParts.forEach(m=>m.material=material(status('width')==='pass'?0xa2b796:status('width')==='fail'?0xda8c63:0xd58a5b));if(canopyTop)canopyTop.material=material(status('clearance')==='fail'?0xc88265:status('clearance')==='pass'?0xa0b299:0xaeb6a6);const pathColor=status('path')==='pass'?0x528069:0xd56b4d;if(pathLine)pathLine.material.color.setHex(pathColor);pathArrows.forEach(m=>m.material.color.setHex(pathColor));}
  function setIssues(next){results=Array.isArray(next)?next:[];for(const [id,b]of markers){const r=results.find(r=>r.id===id);b.style.background=r?.status==='pass'?'#457b65':r?.status==='review'?'#ac8134':'#c95d41';b.style.display=isSample?'block':'none';b.title=names[id][1]+(r?' · '+r.status:'');}applyIssueColors();selectIssue(selected);}
  function selectIssue(id){clearSiteFocus();selected=id;const displayValue=k=>{const key={width:'clearWidth',path:'outdoorPath',turning:'deadEndLength',gradient:'gradientDenominator',clearance:'overheadClearance'}[k];const n=Number(input[key]);return Number.isFinite(n)?(k==='gradient'?'1:'+n.toFixed(1).replace(/\.0$/,''):n.toFixed(1).replace(/\.0$/,'')+' m'):'—';};for(const[k,b]of markers){const active=k===id;b.style.width=active?'max-content':'29px';b.style.minWidth=active?'124px':'0';b.style.maxWidth=active?'190px':'29px';b.style.height=active?'41px':'29px';b.style.padding=active?'4px 10px':'0';b.style.borderRadius=active?'9px':'999px';b.style.whiteSpace=active?'pre':'normal';b.style.lineHeight=active?'14px':'normal';b.style.fontSize=active?'9px':'11px';b.style.zIndex=active?'2':'1';b.style.outline=active?'4px solid #e7a07138':'none';b.textContent=active?names[k][0]+'  ·  '+displayValue(k)+'  ·  Declared 声明值\n'+names[k][1]:names[k][0];b.setAttribute('aria-label',names[k][1]+' '+displayValue(k)+' · Declared value 声明值');}if(id&&positions[id]&&isSample){selectionRing.position.set(positions[id][0],.4,positions[id][2]);selectionRing.visible=true;}else selectionRing.visible=false;}
  function setTransform(t={}){if(Number.isFinite(t.x))modelRoot.position.x=t.x;if(Number.isFinite(t.z))modelRoot.position.z=t.z;if(Number.isFinite(t.rotation))modelRoot.rotation.y=-THREE.MathUtils.degToRad(t.rotation);if(Number.isFinite(t.scale)&&t.scale>0)modelRoot.scale.setScalar(t.scale);}
  function setMoveMode(v){moveMode=!!v;renderer.domElement.style.cursor=moveMode?'crosshair':'grab';controls.enableRotate=!moveMode;}
  function cancelCameraFlight(){if(cameraFlight){controls.enableDamping=cameraFlight.damping;cameraFlight=null;}}
  function resetCamera(){cancelCameraFlight();controls.minDistance=30;if(!isSample&&externalSize){const distance=Math.max(externalSize.x,externalSize.z,externalSize.y)*1.18;controls.target.set(modelRoot.position.x,externalSize.y*.27,modelRoot.position.z);camera.position.set(modelRoot.position.x+distance,externalSize.y*.27+distance*.86,modelRoot.position.z+distance*1.12);}else{camera.position.set(92,89,108);controls.target.set(modelRoot.position.x,1,modelRoot.position.z+2);}controls.update();}
  function setView(v){cancelCameraFlight();if(v==='top'){const height=!isSample&&externalSize?Math.max(142,externalSize.x*1.9,externalSize.z*1.9):142;camera.position.set(modelRoot.position.x,height,modelRoot.position.z+.1);controls.target.copy(modelRoot.position);controls.update();}else resetCamera();}
  const ray=new THREE.Raycaster(),mouse=new THREE.Vector2(),groundPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);let down=null;
  renderer.domElement.addEventListener('pointerdown',e=>{cancelCameraFlight();down={x:e.clientX,y:e.clientY};});
  renderer.domElement.addEventListener('wheel',cancelCameraFlight,{passive:true});
  controls.addEventListener('start',cancelCameraFlight);
  renderer.domElement.addEventListener('pointerup',e=>{if(!moveMode||!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)return;const r=renderer.domElement.getBoundingClientRect();mouse.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(mouse,camera);const p=new THREE.Vector3();if(ray.ray.intersectPlane(groundPlane,p)){const x=Math.max(-45,Math.min(45,p.x)),z=Math.max(-36,Math.min(35,p.z));setTransform({x,z});onPlacementChange({x,z});}});
  async function loadFile(file,{units='m'}={}){if(!file)throw new Error('Choose a model · 请选择模型');if(file.size>80*1024*1024)throw new Error('Model exceeds 80 MB · 模型超过 80 MB');const ext=file.name.split('.').pop().toLowerCase();let obj;const raw=await file.arrayBuffer();if(ext==='3dm'){const{Rhino3dmLoader}=await import('three/addons/loaders/3DMLoader.js');const loader=new Rhino3dmLoader();loader.setLibraryPath('/vendor/rhino/');loader.setWorkerLimit(2);try{obj=await new Promise((resolve,reject)=>loader.parse(raw,resolve,reject));}finally{loader.dispose();}obj.rotation.x=-Math.PI/2;}else if(ext==='glb'){const{GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');obj=(await new GLTFLoader().parseAsync(raw,'')).scene;}else throw new Error('Use .3dm or self-contained .glb · 请使用 .3dm 或独立 .glb 文件');
    const factor={m:1,cm:.01,mm:.001}[units];if(!factor)throw new Error('Unknown unit · 单位无效');obj.scale.multiplyScalar(factor);obj.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(obj),size=bounds.getSize(new THREE.Vector3());if(bounds.isEmpty()||!size.length())throw new Error('No visible geometry found · 未找到可见几何体');const center=bounds.getCenter(new THREE.Vector3());obj.position.sub(new THREE.Vector3(center.x,bounds.min.y,center.z));obj.updateMatrixWorld(true);const warnings=[];if(Math.max(size.x,size.z)>160||size.y>100)warnings.push('Model is larger than the illustrative plot; check units · 模型超出示例场地，请检查单位');if(Math.max(size.x,size.z)<.5)warnings.push('Very small model; check units · 模型过小，请检查单位');let objects=0;const layers=new Set();obj.traverse(o=>{if(o.isMesh){objects++;o.castShadow=true;o.receiveShadow=true;if(o.material){const arr=Array.isArray(o.material)?o.material:[o.material];arr.forEach(m=>{m.side=THREE.DoubleSide;});}}if(o.name)layers.add(o.name);});if(external){modelRoot.remove(external);cleanGroup(external);}external=obj;externalSize=size.clone();modelRoot.add(obj);isSample=false;sample.visible=false;clearCodeMark();setExternalIssues([]);let includesSite=false;obj.traverse(o=>{if(o.userData?.sourceLayer==='00_SITE')includesSite=true;});importedIncludesSite=includesSite;updateEnvironmentVisibility();setIssues(results);resetCamera();return{name:file.name,objects,bounds:{x:+size.x.toFixed(2),y:+size.y.toFixed(2),z:+size.z.toFixed(2)},units,layers:[...layers].slice(0,24),warnings};
  }
  function useSample(){isSample=true;sample.visible=true;if(external)external.visible=false;updateEnvironmentVisibility();setExternalIssues([]);clearCodeMark();setIssues(results);resetCamera();return{name:'Office_Courtyard_Demo',objects:architecture.children.length,units:'m'};}
  function clearExternalHighlight(){if(externalHighlight){scene.remove(externalHighlight);externalHighlight.geometry.dispose();externalHighlight.material.dispose();externalHighlight=null;}}
  /** Bind supplied evidence to actual imported UUIDs; unmatched objects never receive a guessed marker. */
  function setExternalIssues(next=[]){for(const entry of externalMarkers.values())entry.button.remove();externalMarkers.clear();clearExternalHighlight();externalSelected=null;if(!external||isSample)return{located:0,total:next.length};const index=new Map();external.traverse(o=>{const id=o.userData?.sourceObjectId||o.userData?.rhinoId;if(id)index.set(id,o);});let n=0;for(const result of next){const objectId=result.objectId||result.objectIds?.[0]||result.sourceObjectId,target=index.get(objectId);if(!target)continue;const button=document.createElement('button');button.type='button';button.dataset.externalIssue=result.id;button.setAttribute('aria-label',(result.title?.en||result.id)+' · '+(result.title?.zh||''));button.style.cssText='position:absolute;pointer-events:auto;border:2px solid #fff;border-radius:999px;width:31px;height:31px;padding:0;background:'+(result.status==='review'?'#a47718':'#c34b35')+';color:#fff;font:700 10px system-ui;box-shadow:0 3px 12px #0003;cursor:pointer;transform:translate(-50%,-50%);z-index:2';button.textContent=String(++n).padStart(2,'0');button.title=(result.title?.en||'')+' / '+(result.title?.zh||'');button.onclick=e=>{e.stopPropagation();selectExternalIssue(result.id);onSelectIssue(result.id);};markerLayer.appendChild(button);externalMarkers.set(result.id,{button,result,target,number:n});}return{located:externalMarkers.size,total:next.length};}
  function selectExternalIssue(id){clearSiteFocus();externalSelected=id;clearExternalHighlight();for(const[key,entry]of externalMarkers){const active=key===id,b=entry.button,r=entry.result;b.style.width=active?'max-content':'31px';b.style.minWidth=active?'118px':'0';b.style.height=active?'41px':'31px';b.style.padding=active?'4px 9px':'0';b.style.borderRadius=active?'7px':'999px';b.style.whiteSpace='pre';b.style.fontSize=active?'9px':'10px';b.style.lineHeight='14px';b.style.zIndex=active?'4':'2';b.textContent=active?String(entry.number).padStart(2,'0')+' · '+(r.value??'')+' '+(r.unit||'')+'\n'+(r.status==='review'?'Review / 待核实':'Model issue / 模型问题'):String(entry.number).padStart(2,'0');if(active){externalHighlight=new THREE.BoxHelper(entry.target,r.status==='review'?0xba8a22:0xc54b35);externalHighlight.material.depthTest=false;externalHighlight.material.transparent=true;externalHighlight.material.opacity=.9;externalHighlight.renderOrder=25;scene.add(externalHighlight);}}return{located:externalMarkers.has(id)};}
  /** Focus only an exact UUID-bound imported object, using its current world pose. */
  function focusExternalIssue(id,{duration=550}={}){const entry=externalMarkers.get(id);if(isSample||!entry||!external)return{located:false,objectId:null};cancelCameraFlight();selectExternalIssue(id);modelRoot.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(entry.target);if(bounds.isEmpty())return{located:false,objectId:null};const point=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());let direction=camera.position.clone().sub(controls.target).normalize();if(direction.y>.94||direction.y<.25)direction.set(.58,.56,.66).normalize();const extent=Math.max(size.y,Math.hypot(size.x,size.z)*.65/Math.max(.7,camera.aspect));const distance=THREE.MathUtils.clamp(extent/Math.tan(THREE.MathUtils.degToRad(camera.fov*.5))*.92,18,115);const destination=point.clone().addScaledVector(direction,distance),damping=controls.enableDamping;controls.minDistance=12;controls.enableDamping=false;controls.update();const milliseconds=window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:THREE.MathUtils.clamp(Number.isFinite(duration)?duration:550,0,1500);if(milliseconds===0){camera.position.copy(destination);controls.target.copy(point);controls.update();controls.enableDamping=damping;}else cameraFlight={started:performance.now(),duration:milliseconds,fromPosition:camera.position.clone(),fromTarget:controls.target.clone(),toPosition:destination,toTarget:point.clone(),damping};return{located:true,objectId:entry.target.userData?.sourceObjectId||entry.result.objectId,point:point.toArray(),bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()}};}
  function removeCodeHighlight(){if(codeHighlight){scene.remove(codeHighlight);codeHighlight.geometry.dispose();codeHighlight.material.dispose();codeHighlight=null;}}
  function clearCodeMark(){codeMarkState=null;removeCodeHighlight();codeCallout.style.display='none';}
  function resolveCodeTarget(anchor){if(isSample)return{road:roadParts[0],canopy:canopyTop,building:buildingShell,entry:entryTerrace}[anchor];if(!external)return null;const nativeIds={road:'2c5ddfa4-ffe9-48ed-b01e-bfee313882df',canopy:'ad9929a8-9d3f-45a5-b23b-2a6bf54d15c3',building:'2800ff92-4689-4479-b80c-a085acf05c04',entry:'ee64c10b-9c24-4cbb-8b71-43ba58ff082f'};let target=null;external.traverse(o=>{if(o.userData?.sourceObjectId===nativeIds[anchor])target=o;});return target;}
  function rebuildCodeMark(){removeCodeHighlight();if(!codeMarkState)return;const target=resolveCodeTarget(codeMarkState.anchor);if(!target)return;codeMarkState.target=target;modelRoot.updateMatrixWorld(true);codeHighlight=new THREE.BoxHelper(target,0x5282b8);codeHighlight.material.depthTest=false;codeHighlight.material.transparent=true;codeHighlight.material.opacity=.8;codeHighlight.renderOrder=20;scene.add(codeHighlight);}
  /** Candidate clause-region link, never an automatic noncompliance decision. */
  function markCode(code={}){clearCodeMark();if(!['road','canopy','building','entry'].includes(code.anchor))return{located:false,reason:'No corresponding model component is available · 模型缺少对应构件'};const target=resolveCodeTarget(code.anchor);if(!target)return{located:false,reason:'Imported model has no verified clause-to-object binding · 导入模型尚无已核实的条款对象绑定'};codeMarkState={id:code.id,clause:String(code.clause||'').slice(0,60),title:{en:String(code.title?.en||'Candidate clause').slice(0,100),zh:String(code.title?.zh||'候选条款').slice(0,100)},anchor:code.anchor,target};const heading=document.createElement('strong');heading.style.cssText='display:block;font-size:10px';heading.textContent='§ '+codeMarkState.clause+' · Review / 待核实';const title=document.createElement('span');title.style.display='block';title.textContent=codeMarkState.title.en+' · '+codeMarkState.title.zh;const scope=document.createElement('span');scope.style.cssText='display:block;opacity:.75;font-size:8px;margin-top:2px';scope.textContent=isSample?'Sample region · 示例关联区域':'Source object region · 原模型关联区域';codeCallout.replaceChildren(heading,title,scope);rebuildCodeMark();return{located:true,binding:isSample?'sample-conceptual-region':'source-object-region',objectId:target.userData?.sourceObjectId||null,anchor:code.anchor,reason:'Candidate clause linked to a known model component; applicability requires review · 候选条款关联至已知模型构件，适用性仍需核实'};}
  /** User-drawn parcel coordinates are local metres relative to the selected geographic anchor. */
  function setParcel(points=[]){cleanGroup(parcelGroup);const valid=Array.isArray(points)&&points.length>=3&&points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z));hasDrawnParcel=valid;updateEnvironmentVisibility();if(!valid)return{points:0,area:0};
    const loop=points.map(p=>[p.x,.42,p.z]);loop.push([...loop[0]]);line(parcelGroup,loop,0x337d70,true);
    const shape=new THREE.Shape(points.map(p=>new THREE.Vector2(p.x,-p.z)));const fill=new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshBasicMaterial({color:0x66a08d,transparent:true,opacity:.10,side:THREE.DoubleSide,depthWrite:false}));fill.rotation.x=-Math.PI/2;fill.position.y=.28;parcelGroup.add(fill);
    for(const p of points){const corner=new THREE.Mesh(new THREE.RingGeometry(.32,.49,16),new THREE.MeshBasicMaterial({color:0x337d70,side:THREE.DoubleSide,depthWrite:false}));corner.rotation.x=-Math.PI/2;corner.position.set(p.x,.44,p.z);parcelGroup.add(corner);}
    let signedArea=0;for(let i=0;i<points.length;i++){const next=points[(i+1)%points.length];signedArea+=points[i].x*next.z-next.x*points[i].z;}return{points:points.length,area:Math.abs(signedArea)/2};
  }
  const geoContext=new THREE.Group();world.add(geoContext);
  function setContext({buildings=[],roads=[]}={}){cleanGroup(geoContext);if(!buildings.length&&!roads.length){updateEnvironmentVisibility();return;}context.visible=false;for(const b of buildings){if(!Array.isArray(b.points)||b.points.length<3)continue;const shape=new THREE.Shape(b.points.map(p=>new THREE.Vector2(p[0],-p[1])));const mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:b.height||9,bevelEnabled:false}),material(0xc6d1c5));mesh.rotation.x=-Math.PI/2;mesh.castShadow=true;mesh.receiveShadow=true;geoContext.add(mesh);}for(const r of roads){if(r.points?.length>1)line(geoContext,r.points.map(p=>[p[0],.4,p[1]]),0x667e72);}updateEnvironmentVisibility();}
  // OSM geometry belongs to the site coordinate frame, not the movable model.
  const siteContextGroup=new THREE.Group();siteContextGroup.name='OpenStreetMap context';world.add(siteContextGroup);
  const siteFeatures=new Map();let siteHighlight=null,siteFocus=null;
  const siteCallout=document.createElement('div');siteCallout.style.cssText='display:none;position:absolute;pointer-events:none;max-width:220px;padding:7px 10px;border:1px solid #5282b8;border-radius:7px;background:#f6fafff2;color:#315e8a;font:500 10px/1.5 system-ui;box-shadow:0 3px 12px #24372c18;transform:translate(-50%,14px);z-index:3';siteCallout.setAttribute('role','status');markerLayer.appendChild(siteCallout);
  function clearSiteFocus(){if(siteFocus)cancelCameraFlight();siteFocus=null;siteCallout.style.display='none';if(siteHighlight){scene.remove(siteHighlight);siteHighlight.geometry.dispose();siteHighlight.material.dispose();siteHighlight=null;}}
  function updateEnvironmentVisibility(){
    const illustrative=!siteContextActive&&(isSample||!importedIncludesSite);
    for(const object of environmentObjects){object.visible=object===parcelGroup?true:object===defaultSiteBoundary?illustrative&&!hasDrawnParcel:object===context?illustrative&&!geoContext.children.length:illustrative;}
    contextCars.forEach(object=>object.visible=illustrative);geoContext.visible=!siteContextActive;
  }
  function clearSiteContext(){clearSiteFocus();cleanGroup(siteContextGroup);siteFeatures.clear();siteContextActive=false;camera.far=650;camera.updateProjectionMatrix();controls.maxDistance=250;scene.fog.near=180;scene.fog.far=360;updateEnvironmentVisibility();return{rendered:0};}
  function numericMetres(value){
    if(typeof value==='number')return Number.isFinite(value)&&value>0?value:null;
    const match=String(value??'').trim().match(/^(\d+(?:\.\d+)?)\s*(m|metres?|meters?|ft|feet|')?$/i);
    if(!match)return null;const number=Number(match[1])*(/^(?:ft|feet|')$/i.test(match[2]||'') ? 0.3048 : 1);return number>0&&Number.isFinite(number)?number:null;
  }
  function setSiteContext(data={}){
    const center=data.center;if(!center||!Number.isFinite(center.lat)||!Number.isFinite(center.lng)||Math.abs(center.lat)>85||Math.abs(center.lng)>180)return{rendered:0,featureCounts:{},error:'Invalid geographic anchor'};
    clearSiteContext();const featureCounts={road:0,building:0,green:0,water:0,poi:0},heightBasis={tagged:0,levelsEstimated:0,footprintOnly:0};let skipped=0,pointBudget=24000,maxExtent=100;
    const latitudeScale=111320,longitudeScale=111320*Math.cos(center.lat*Math.PI/180);
    const localPoint=coordinate=>{if(!Array.isArray(coordinate)||coordinate.length<2||!Number.isFinite(coordinate[0])||!Number.isFinite(coordinate[1]))return null;const point={x:(coordinate[0]-center.lng)*longitudeScale,z:-(coordinate[1]-center.lat)*latitudeScale};return Math.abs(point.x)<=3000&&Math.abs(point.z)<=3000?point:null;};
    const localLine=coordinates=>{if(!Array.isArray(coordinates)||coordinates.length<2||coordinates.length>2500||coordinates.length>pointBudget)return null;const points=coordinates.map(localPoint);if(points.some(point=>!point))return null;pointBudget-=points.length;for(const point of points)maxExtent=Math.max(maxExtent,Math.abs(point.x),Math.abs(point.z));return points;};
    const outline=(group,points,color,y=.16)=>line(group,[...points,points[0]].map(point=>[point.x,y,point.z]),color);
    const flatMaterial=(color,opacity)=>new THREE.MeshBasicMaterial({color,transparent:true,opacity,side:THREE.DoubleSide,depthWrite:false});
    for(const feature of (Array.isArray(data.features)?data.features:[]).slice(0,500)){
      if(!feature||typeof feature.id!=='string'||siteFeatures.has(feature.id)||!Object.hasOwn(featureCounts,feature.kind)){skipped++;continue;}
      const geometry=feature.geometry||{},tags=feature.tags||{},group=new THREE.Group();group.userData={osmId:feature.id,kind:feature.kind,source:'OpenStreetMap'};let heightDescription='Mapped location / 地图位置';
      if(geometry.type==='Point'){
        const point=localPoint(geometry.coordinates);if(!point||feature.kind!=='poi'){skipped++;continue;}
        const dot=new THREE.Mesh(new THREE.CircleGeometry(1.2,12),flatMaterial(0x778caa,.9));dot.rotation.x=-Math.PI/2;dot.position.set(point.x,.9,point.z);group.add(dot);maxExtent=Math.max(maxExtent,Math.abs(point.x),Math.abs(point.z));
      }else if(geometry.type==='LineString'){
        const points=localLine(geometry.coordinates);if(!points){skipped++;continue;}
        const color=feature.kind==='water'?0x73a9b5:feature.kind==='green'?0x7d9a75:/^(?:footway|path|pedestrian|steps|cycleway)$/.test(tags.highway||'')?0xa9a183:0x6c817a;
        line(group,points.map(point=>[point.x,.87,point.z]),color,/^(?:footway|path|steps)$/.test(tags.highway||''));
        const taggedWidth=numericMetres(tags.width);
        if(feature.kind==='road'&&taggedWidth&&taggedWidth<=40){
          const vertices=[];for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],length=Math.hypot(b.x-a.x,b.z-a.z);if(length<.01)continue;const x=-(b.z-a.z)/length*taggedWidth/2,z=(b.x-a.x)/length*taggedWidth/2;vertices.push(a.x+x,.12,a.z+z,b.x+x,.12,b.z+z,b.x-x,.12,b.z-z,a.x+x,.12,a.z+z,b.x-x,.12,b.z-z,a.x-x,.12,a.z-z);}
          if(vertices.length){const strip=new THREE.BufferGeometry();strip.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));group.add(new THREE.Mesh(strip,flatMaterial(color,.5)));}
        }
      }else if(geometry.type==='Polygon'){
        const raw=geometry.coordinates,rings=Array.isArray(raw?.[0]?.[0])?raw:[raw];
        const mapped=rings.length<=20?rings.map(localLine):[];
        if(!mapped.length||mapped.some(ring=>!ring||ring.length<3)){skipped++;continue;}
        const points=mapped[0],shape=new THREE.Shape(points.map(point=>new THREE.Vector2(point.x,-point.z)));
        for(const hole of mapped.slice(1))shape.holes.push(new THREE.Path(hole.map(point=>new THREE.Vector2(point.x,-point.z))));
        if(feature.kind==='building'){
          const tagged=numericMetres(tags.height),levels=Number(tags['building:levels']);let height=tagged&&tagged<=600?tagged:null;
          if(height){heightBasis.tagged++;heightDescription='OSM height tag / OSM 高度标签';}
          else if(Number.isFinite(levels)&&levels>0&&levels<=150){height=levels*3;heightBasis.levelsEstimated++;heightDescription='Height illustrated from levels × 3 m / 按标注层数 × 3 米示意';}
          else{heightBasis.footprintOnly++;heightDescription='Footprint only; height unknown / 仅轮廓，高度未标注';}
          const mesh=new THREE.Mesh(height?new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false}):new THREE.ShapeGeometry(shape),height?material(tagged?0xc5d0c9:0xd3dad4):flatMaterial(0xd4ded5,.76));mesh.rotation.x=-Math.PI/2;mesh.position.y=.14;mesh.castShadow=!!height&&Math.hypot(points[0].x,points[0].z)<170;mesh.receiveShadow=true;group.add(mesh);group.userData.heightSource=heightDescription;outline(group,points,0x93a69b,.2);
        }else{
          const color=feature.kind==='water'?0x84b9c2:feature.kind==='green'?0x95b28c:0xc7d2c4,mesh=new THREE.Mesh(new THREE.ShapeGeometry(shape),flatMaterial(color,.55));mesh.rotation.x=-Math.PI/2;mesh.position.y=.08;group.add(mesh);outline(group,points,feature.kind==='water'?0x73a9b5:0x8aa07e,.1);
        }
      }else{skipped++;continue;}
      if(!group.children.length){skipped++;continue;}siteContextGroup.add(group);siteFeatures.set(feature.id,{group,feature,heightDescription});featureCounts[feature.kind]++;
    }
    const extent=Math.max(200,Math.min(6000,maxExtent*2+80));plane(siteContextGroup,extent,extent,0,0,0xe7ece5,-.09);
    siteContextActive=true;camera.far=10000;camera.updateProjectionMatrix();controls.maxDistance=2200;scene.fog.near=500;scene.fog.far=2600;updateEnvironmentVisibility();
    return{rendered:siteFeatures.size,featureCounts,heightBasis,skipped,source:'OpenStreetMap',center:{lat:center.lat,lng:center.lng}};
  }
  function focusSiteFeature(id,{duration=550}={}){
    const entry=siteFeatures.get(id);if(!siteContextActive||!entry)return{located:false,featureId:null};cancelCameraFlight();clearSiteFocus();world.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(entry.group);if(bounds.isEmpty())return{located:false,featureId:null};const point=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());let direction=camera.position.clone().sub(controls.target).normalize();if(direction.y>.94||direction.y<.25)direction.set(.58,.56,.66).normalize();const extent=Math.max(size.y,Math.hypot(size.x,size.z)*.6/Math.max(.7,camera.aspect)),distance=THREE.MathUtils.clamp(extent/Math.tan(THREE.MathUtils.degToRad(camera.fov*.5)),30,1250),destination=point.clone().addScaledVector(direction,distance),damping=controls.enableDamping;controls.minDistance=12;controls.enableDamping=false;controls.update();const milliseconds=window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:THREE.MathUtils.clamp(Number.isFinite(duration)?duration:550,0,1500);if(milliseconds===0){camera.position.copy(destination);controls.target.copy(point);controls.update();controls.enableDamping=damping;}else cameraFlight={started:performance.now(),duration:milliseconds,fromPosition:camera.position.clone(),fromTarget:controls.target.clone(),toPosition:destination,toTarget:point.clone(),damping};
    siteHighlight=new THREE.BoxHelper(entry.group,0x4587bd);siteHighlight.material.depthTest=false;siteHighlight.material.transparent=true;siteHighlight.material.opacity=.95;siteHighlight.renderOrder=27;scene.add(siteHighlight);siteFocus={id,point};const heading=document.createElement('strong');heading.style.display='block';heading.textContent=String(entry.feature.name||entry.feature.id).slice(0,90);const detail=document.createElement('span');detail.textContent='OSM '+entry.feature.kind+' · '+entry.heightDescription;siteCallout.replaceChildren(heading,detail);return{located:true,featureId:id,source:'OpenStreetMap',point:point.toArray(),bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()}};
  }
  function resize(){const w=Math.max(container.clientWidth,1),h=Math.max(container.clientHeight,1);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
  const observer=new ResizeObserver(resize);observer.observe(container);resize();setDesign(input);
  const tmp=new THREE.Vector3();function animate(){if(disposed)return;requestAnimationFrame(animate);if(cameraFlight){const flight=cameraFlight,t=Math.min(1,(performance.now()-flight.started)/flight.duration),ease=1-Math.pow(1-t,3);camera.position.lerpVectors(flight.fromPosition,flight.toPosition,ease);controls.target.lerpVectors(flight.fromTarget,flight.toTarget,ease);if(t>=1)cancelCameraFlight();}controls.update();modelRoot.updateMatrixWorld(true);for(const[id,b]of markers){if(!isSample){b.style.display='none';continue;}tmp.set(...positions[id]);modelRoot.localToWorld(tmp);tmp.project(camera);b.style.left=((tmp.x*.5+.5)*container.clientWidth)+'px';b.style.top=((-tmp.y*.5+.5)*container.clientHeight)+'px';b.style.display=tmp.z>1||Math.abs(tmp.x)>1.2||Math.abs(tmp.y)>1.2?'none':'block';}if(codeMarkState){const anchors={road:[-8,.8,24],canopy:[-27,Number(input.overheadClearance)+1.2,24],building:[16,6,12],entry:[0,1,15.5]};if(isSample){tmp.set(...anchors[codeMarkState.anchor]);modelRoot.localToWorld(tmp);}else{new THREE.Box3().setFromObject(codeMarkState.target).getCenter(tmp);tmp.y+=1.2;}tmp.project(camera);codeCallout.style.left=((tmp.x*.5+.5)*container.clientWidth)+'px';codeCallout.style.top=((-tmp.y*.5+.5)*container.clientHeight)+'px';codeCallout.style.display=tmp.z>1||Math.abs(tmp.x)>1.1||Math.abs(tmp.y)>1.1?'none':'block';codeHighlight?.update();}for(const entry of externalMarkers.values()){const r=entry.result;if(isSample){entry.button.style.display='none';continue;}if(Array.isArray(r.anchor)&&r.anchor.length===3){tmp.set(r.anchor[0],r.anchor[2],-r.anchor[1]);external.localToWorld(tmp);}else{new THREE.Box3().setFromObject(entry.target).getCenter(tmp);}tmp.y+=1.3;tmp.project(camera);entry.button.style.left=((tmp.x*.5+.5)*container.clientWidth)+'px';entry.button.style.top=((-tmp.y*.5+.5)*container.clientHeight)+'px';entry.button.style.display=tmp.z>1||Math.abs(tmp.x)>1.1||Math.abs(tmp.y)>1.1?'none':'block';}externalHighlight?.update();if(siteFocus){tmp.copy(siteFocus.point);tmp.y+=1.5;tmp.project(camera);siteCallout.style.left=((tmp.x*.5+.5)*container.clientWidth)+'px';siteCallout.style.top=((-tmp.y*.5+.5)*container.clientHeight)+'px';siteCallout.style.display=tmp.z>1||Math.abs(tmp.x)>1.1||Math.abs(tmp.y)>1.1?'none':'block';}siteHighlight?.update();renderer.render(scene,camera);};animate();
  function dispose(){disposed=true;cancelCameraFlight();clearSiteFocus();cleanGroup(siteContextGroup);siteFeatures.clear();clearExternalHighlight();clearCodeMark();observer.disconnect();controls.dispose();scene.traverse(o=>{o.geometry?.dispose();});Object.values(mats).forEach(m=>m.dispose());renderer.dispose();renderer.domElement.remove();markerLayer.remove();}
  return{setDesign,setIssues,selectIssue,setTransform,setMoveMode,setView,resetCamera,loadFile,useSample,setParcel,setContext,markCode,clearCodeMark,setExternalIssues,selectExternalIssue,focusExternalIssue,setSiteContext,clearSiteContext,focusSiteFeature,dispose};
}
