import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..', 'dist', 'vendor');
const files = [
 ['three.module.js','https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js'],
 ['three.core.js','https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.core.js'],
 ['addons/controls/OrbitControls.js','https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/controls/OrbitControls.js'],
 ['addons/loaders/GLTFLoader.js','https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/loaders/GLTFLoader.js'],
 ['addons/loaders/3DMLoader.js','https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/loaders/3DMLoader.js'],
 ['addons/loaders/EXRLoader.js','https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/loaders/EXRLoader.js'],
 ['addons/libs/fflate.module.js','https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/libs/fflate.module.js'],
 ['addons/utils/BufferGeometryUtils.js','https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/utils/BufferGeometryUtils.js'],
 ['rhino/rhino3dm.js','https://cdn.jsdelivr.net/npm/rhino3dm@8.17.0/rhino3dm.js'],
 ['rhino/rhino3dm.wasm','https://cdn.jsdelivr.net/npm/rhino3dm@8.17.0/rhino3dm.wasm'],
 ['THREE-LICENSE.txt','https://cdn.jsdelivr.net/npm/three@0.180.0/LICENSE'],
 ['RHINO-LICENSE.txt','https://raw.githubusercontent.com/mcneel/rhino3dm/main/LICENSE']
];
await Promise.all(files.map(async ([name,url]) => {const r=await fetch(url);if(!r.ok)throw Error(name+': '+r.status);const target=resolve(root,name);await mkdir(dirname(target),{recursive:true});const bytes=new Uint8Array(await r.arrayBuffer());await writeFile(target,bytes);console.log(name,bytes.length);}));
