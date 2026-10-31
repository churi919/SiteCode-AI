"""Extract explicit Rhino metadata and native object bounds; never tessellate geometry."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import rhino3dm


def user_strings(value):
    try:
        return dict(value.GetUserStrings())
    except (AttributeError, TypeError):
        return {}


def bounds(geometry):
    try:
        box = geometry.GetBoundingBox()
        return {
            "min": [box.Min.X, box.Min.Y, box.Min.Z],
            "max": [box.Max.X, box.Max.Y, box.Max.Z],
            "size": [box.Max.X-box.Min.X, box.Max.Y-box.Min.Y, box.Max.Z-box.Min.Z],
        }
    except (AttributeError, TypeError):
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    model = rhino3dm.File3dm.Read(str(args.source))
    if model is None:
        raise ValueError("Rhino model could not be opened")
    raw = model.Strings["GARDEN_DEMO\\project_metadata"]
    metadata = json.loads(raw) if raw else {}
    layers = {layer.Index: layer for layer in model.Layers}
    objects = []
    for obj in model.Objects:
        attr, geo = obj.Attributes, obj.Geometry
        layer = layers.get(attr.LayerIndex)
        item = {
            "id": str(attr.Id), "name": attr.Name,
            "type": type(geo).__name__, "layerIndex": attr.LayerIndex,
            "layer": layer.FullPath if layer else None,
            "userStrings": user_strings(attr),
            "geometryUserStrings": user_strings(geo),
            "bounds": bounds(geo),
        }
        if isinstance(getattr(geo, "Text", None), str):
            item["text"] = geo.Text
        objects.append(item)
    by_id = {item["id"]: item for item in objects}
    semantic_map = metadata.get("objects", {})
    subjects = {
        "FEA-01": ["intended_fire_approach_2p8m", "measure_approach_2p8m"],
        "FEA-02": ["entry_pergola_3m_clearance", "pergola_top_slat", "pergola_column", "intended_fire_approach_2p8m"],
        "FEA-03": ["intended_fire_accessway_3m"],
        "FEA-04": ["pool_32x12m", "review_envelope_8x44m", "review_envelope_8x44m_outline"],
    }
    issue_evidence = []
    for issue in metadata.get("issues", []):
        associated = {name: semantic_map.get(name, []) for name in subjects.get(issue["id"], [])}
        issue_evidence.append({
            **issue, "evidenceSource": "explicit embedded model metadata; not an independent regulatory validation",
            "associatedObjects": associated,
            "nativeObjectBounds": {oid: by_id[oid]["bounds"] for ids in associated.values() for oid in ids if oid in by_id},
        })
    known = set(by_id)
    missing = sorted({oid for ids in semantic_map.values() for oid in ids if oid not in known})
    public_metadata = {key: value for key, value in metadata.items() if key not in {"objects", "source_model_preserved"}}
    payload = {
        "sourceFile": args.source.name,
        "sourceSha256": hashlib.sha256(args.source.read_bytes()).hexdigest(),
        "modelUnits": str(model.Settings.ModelUnitSystem),
        "objectCount": len(objects), "objectTypes": dict(Counter(item["type"] for item in objects)),
        "projectMetadata": public_metadata,
        "layers": [{"index": layer.Index, "id": str(layer.Id), "name": layer.FullPath} for layer in model.Layers],
        "semanticObjectMap": semantic_map,
        "missingMappedUUIDs": missing,
        "issueEvidence": issue_evidence,
        "objects": objects,
        "limitations": {
            "en": "The source identifies itself as a fictional, intentionally deficient BEFORE case. Purpose group, use and height applicability are model declarations or synthetic assumptions. Object bounds are geometry extents, not a complete fire-access assessment. Regulatory thresholds in embedded metadata require source review; the pool review envelope is manually nominated.",
            "zh": "源模型将自身标注为虚构、刻意设置问题的调整前案例。用途组别、功能与高度适用条件来自模型声明或模拟假设。对象包围盒为几何范围，不等于完整消防通行评估。内嵌规范阈值仍须核对官方来源；泳池审查范围由人工指定。",
        },
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "source": args.source.name, "output": str(args.output),
        "units": payload["modelUnits"], "objects": len(objects),
        "types": payload["objectTypes"], "mappedNames": len(semantic_map),
        "missingMappedUUIDs": missing,
        "project": {key: public_metadata.get(key) for key in ["project", "status", "purpose_group", "storeys", "assumed_habitable_height_m", "height_status"]},
        "issues": [{"id": row["id"], "associatedObjects": row["associatedObjects"], "bounds": row["nativeObjectBounds"]} for row in issue_evidence],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
