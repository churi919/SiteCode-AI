"""Export the source model's cached render meshes to a self-contained GLB.

No generated substitute geometry is used. Rhino object UUIDs and layer names
remain on GLB nodes, and source bounding boxes remain in the metadata JSON.

Usage: python scripts/inspect-user-model.py <source.3dm> [--output <directory>]
The original residential Rhino file is not bundled; provide your own source.
The browser demo already includes its derived lightweight model.
"""
from pathlib import Path
import argparse, array, collections, json, math, struct

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path, help='Path to the source Rhino .3dm file')
parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'dist' / 'assets')
args = parser.parse_args()
if not args.source.is_file():
    parser.error('Source Rhino file does not exist. Supply your own .3dm file; the original is not bundled.')
import rhino3dm as r

SOURCE = args.source.resolve()
DEST = args.output.resolve()
DEST.mkdir(parents=True, exist_ok=True)
model = r.File3dm.Read(str(SOURCE))
if model is None:
    parser.error('Rhino model could not be opened.')
metadata = {}
for key, value in model.Strings:
    if key.endswith('project_metadata'):
        metadata = json.loads(value)
metadata.pop('source_model_preserved', None)

gltf = {'asset': {'version': '2.0', 'generator': 'FireSite cached Rhino render mesh export'},
        'scene': 0, 'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [],
        'materials': [], 'accessors': [], 'bufferViews': [], 'buffers': []}
data = bytearray()
materials = {}
records = []
skipped = collections.Counter()

def buffer_accessor(values, component_type, kind, target, bounds=None):
    while len(data) % 4:
        data.append(0)
    offset = len(data)
    raw = values.tobytes()
    data.extend(raw)
    view = len(gltf['bufferViews'])
    gltf['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(raw), 'target': target})
    dimensions = {'SCALAR': 1, 'VEC3': 3}[kind]
    accessor = {'bufferView': view, 'componentType': component_type,
                'count': len(values) // dimensions, 'type': kind}
    if bounds:
        accessor.update(min=bounds[0], max=bounds[1])
    index = len(gltf['accessors'])
    gltf['accessors'].append(accessor)
    return index

for obj in model.Objects:
    geo, attr = obj.Geometry, obj.Attributes
    layer = model.Layers[attr.LayerIndex]
    try:
        bbox = geo.GetBoundingBox()
    except TypeError:
        skipped[type(geo).__name__] += 1
        records.append({'id':str(attr.Id),'name':attr.Name,'layer':layer.Name,'type':type(geo).__name__})
        continue
    record = {'id': str(attr.Id), 'name': attr.Name, 'layer': layer.Name,
              'type': type(geo).__name__,
              'boundsRhino': {'min': [bbox.Min.X, bbox.Min.Y, bbox.Min.Z],
                              'max': [bbox.Max.X, bbox.Max.Y, bbox.Max.Z]}}
    records.append(record)
    if not attr.Visible or not layer.Visible:
        skipped['hidden'] += 1
        continue
    if isinstance(geo, r.Mesh):
        meshes = [geo]
    elif isinstance(geo, r.Brep):
        meshes = [face.GetMesh(r.MeshType.Render) or face.GetMesh(r.MeshType.Any) for face in geo.Faces]
    else:
        skipped[type(geo).__name__] += 1
        continue
    positions, normals, indices = array.array('f'), array.array('f'), array.array('I')
    for mesh in meshes:
        if mesh is None:
            continue
        if len(mesh.Normals) != len(mesh.Vertices):
            mesh.Normals.ComputeNormals()
        start = len(positions) // 3
        for v in mesh.Vertices:
            positions.extend((v.X, v.Z, -v.Y))  # Rhino Z-up to glTF Y-up.
        for n in mesh.Normals:
            normals.extend((n.X, n.Z, -n.Y))
        for face in mesh.Faces:
            a, b, c, d = face
            indices.extend((start+a, start+b, start+c))
            if c != d:
                indices.extend((start+a, start+c, start+d))
    if not positions or not indices:
        skipped['missing_cached_mesh'] += 1
        continue
    if attr.Name == 'tree_canopy':
        # Foliage only: cluster the original cached vertices into 0.30 m cells.
        # Architectural and fire-access meshes remain untouched. Source review
        # measurements always use the original B-rep bounds, not this display LOD.
        cell=.30
        groups={}; mapping=[]
        for i in range(len(positions)//3):
            p=positions[i*3:i*3+3];n=normals[i*3:i*3+3]
            key=tuple(math.floor(v/cell) for v in p)
            if key not in groups:groups[key]=[len(groups),[0.,0.,0.],[0.,0.,0.],0]
            group=groups[key];mapping.append(group[0]);group[3]+=1
            for j in range(3):group[1][j]+=p[j];group[2][j]+=n[j]
        reduced_positions=array.array('f');reduced_normals=array.array('f');reduced_indices=array.array('I')
        for _,p,n,count in groups.values():
            reduced_positions.extend(v/count for v in p)
            magnitude=math.sqrt(sum(v*v for v in n)) or 1
            reduced_normals.extend(v/magnitude for v in n)
        faces=set()
        for i in range(0,len(indices),3):
            face=tuple(mapping[indices[i+j]] for j in range(3))
            if len(set(face))<3 or tuple(sorted(face)) in faces:continue
            faces.add(tuple(sorted(face)));reduced_indices.extend(face)
        positions,normals,indices=reduced_positions,reduced_normals,reduced_indices
        record['displaySimplification']='Foliage-only 0.30 m vertex clustering; original bounds preserved'
    color = layer.Color if attr.ColorSource == r.ObjectColorSource.ColorFromLayer else attr.ObjectColor
    rgba = tuple(color)
    if rgba not in materials:
        materials[rgba] = len(gltf['materials'])
        # Source alpha is preserved; double-sided rendering avoids missing B-rep faces.
        gltf['materials'].append({'name': 'Rhino color '+str(rgba), 'doubleSided': True,
           'pbrMetallicRoughness': {'baseColorFactor': [x/255 for x in rgba], 'metallicFactor': 0,
                                  'roughnessFactor': .82},
           **({'alphaMode': 'BLEND'} if rgba[3] < 255 else {})})
    mins = [min(positions[i::3]) for i in range(3)]
    maxs = [max(positions[i::3]) for i in range(3)]
    pa = buffer_accessor(positions, 5126, 'VEC3', 34962, (mins, maxs))
    na = buffer_accessor(normals, 5126, 'VEC3', 34962)
    ia = buffer_accessor(indices, 5125, 'SCALAR', 34963)
    mesh_index = len(gltf['meshes'])
    gltf['meshes'].append({'name': attr.Name, 'primitives': [{'attributes': {'POSITION': pa, 'NORMAL': na},
                          'indices': ia, 'material': materials[rgba]}]})
    node_index = len(gltf['nodes'])
    gltf['nodes'].append({'name': attr.Name, 'mesh': mesh_index,
         'extras': {'sourceObjectId': str(attr.Id), 'rhinoId': str(attr.Id),
                    'sourceLayer': layer.Name, 'sourceName': attr.Name, 'sourceUnits': 'm'}})
    gltf['scenes'][0]['nodes'].append(node_index)
    record['exported'] = True
    record['triangles'] = len(indices) // 3
    record['anchorRhino'] = [(bbox.Min.X+bbox.Max.X)/2, (bbox.Min.Y+bbox.Max.Y)/2, (bbox.Min.Z+bbox.Max.Z)/2]

while len(data) % 4:
    data.append(0)
gltf['buffers'] = [{'byteLength': len(data)}]
json_bytes = json.dumps(gltf, separators=(',', ':'), ensure_ascii=False).encode()
json_bytes += b' ' * ((-len(json_bytes)) % 4)
total = 12 + 8 + len(json_bytes) + 8 + len(data)
glb = struct.pack('<4sII', b'glTF', 2, total) + struct.pack('<I4s', len(json_bytes), b'JSON') + json_bytes + struct.pack('<I4s', len(data), b'BIN\x00') + data
(DEST/'garden-condo.glb').write_bytes(glb)
output = {'sourceFile': SOURCE.name, 'units': str(model.Settings.ModelUnitSystem),
          'geometrySource': 'Original cached architectural/fire-access render meshes; tree foliage display LOD uses0.30m vertex clustering. Review measurements use original native Brep bounds.',
          'project': metadata, 'sourceObjectCount': len(model.Objects),
          'exportedObjectCount': len(gltf['nodes']), 'skipped': dict(skipped),
          'glbBytes': len(glb), 'objects': records,
          'coordinateSystem': {'source': 'Rhino Z-up metres', 'glb': 'Y-up metres', 'mapping': '[x,z,-y]'}}
(DEST/'garden-condo-model.json').write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'exported':len(gltf['nodes']), 'sourceObjects':len(model.Objects), 'bytes':len(glb), 'skipped':dict(skipped)}))
for rec in records:
    if rec['name'] in ('intended_fire_approach_2p8m','entry_pergola_3m_clearance','intended_fire_accessway_3m','pool_32x12m'):
        print(json.dumps(rec))
