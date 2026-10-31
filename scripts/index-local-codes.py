"""Index supplied public-code PDFs for local browser search; does not copy PDFs.

Usage: python scripts/index-local-codes.py --source <extracted bundle directory>
The metadata is preserved from the supplied manifest and is not a fresh legal
version or project-applicability verification. Page numbers are PDF page numbers.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timedelta, timezone
import gzip
import hashlib
import json
from pathlib import Path
import re
import sys

try:
    import pymupdf as fitz
except ImportError:
    fitz = None


def normalize_text(text: str) -> str:
    text = text.replace("\x00", "").replace("\r\n", "\n").replace("\r", "\n").replace("\u00ad", "")
    text = re.sub(r"[^\S\n]+", " ", text)
    text = "\n".join(line.strip() for line in text.split("\n"))
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "dist" / "assets")
    parser.add_argument("--max-page-chars", type=int, default=30000)
    args = parser.parse_args()
    if args.max_page_chars < 1000:
        parser.error("--max-page-chars must be at least 1000")
    source = args.source.resolve(strict=True)
    metadata_path = source / "manifest.json"
    supplied = json.loads(metadata_path.read_text(encoding="utf-8-sig")) if metadata_path.exists() else {}
    records = supplied.get("records", [])
    by_file = {Path(record.get("local_file", "")).name.casefold(): record for record in records if record.get("local_file")}
    pdf_paths = sorted((source / "01_Official_PDFs").rglob("*.pdf"))
    if not pdf_paths:
        raise SystemExit("No PDFs found in 01_Official_PDFs")
    if fitz:
        fitz.TOOLS.mupdf_display_errors(False)
        fitz.TOOLS.mupdf_display_warnings(False)
    else:
        from pypdf import PdfReader

    documents, pages, errors = [], [], []
    total_pdf_bytes = 0
    for path in pdf_paths:
        record = by_file.get(path.name.casefold(), {})
        doc_id = record.get("id") or (re.match(r"SG-\d+", path.stem).group() if re.match(r"SG-\d+", path.stem) else path.stem)
        total_pdf_bytes += path.stat().st_size
        document = {
            "id": doc_id,
            "title": record.get("title") or re.sub(r"^SG-\d+_", "", path.stem).replace("_", " "),
            "fileName": path.relative_to(source).as_posix(),
            "agency": record.get("agency") or path.parent.name,
            "officialUrl": record.get("source_url"),
            "pdfUrl": record.get("resolved_url") or record.get("download_url"),
            "versionNote": " · ".join(value for value in [record.get("version"), record.get("notes")] if value),
            "sourceChecked": record.get("checked_on") or supplied.get("checked_on"),
            "metadataSource": "supplied-manifest" if record else "file-name",
            "pages": 0, "textPages": 0, "emptyPages": 0, "shortTextPages": 0, "limitedPages": 0,
        }
        try:
            reader = fitz.open(path) if fitz else PdfReader(path)
            page_count = len(reader) if fitz else len(reader.pages)
            document["pages"] = page_count
            for page_index in range(page_count):
                try:
                    if fitz:
                        raw = reader[page_index].get_text("text", sort=True, flags=fitz.TEXTFLAGS_TEXT | fitz.TEXT_DEHYPHENATE)
                    else:
                        raw = reader.pages[page_index].extract_text() or ""
                    text = normalize_text(raw)
                    if len(text) > args.max_page_chars:
                        text = text[:args.max_page_chars]
                        document["limitedPages"] += 1
                    if text:
                        document["textPages"] += 1
                    else:
                        document["emptyPages"] += 1
                    if len(text) < 40:
                        document["shortTextPages"] += 1
                    pages.append({"docId": doc_id, "page": page_index + 1, "text": text})
                except Exception as exc:
                    document["emptyPages"] += 1
                    pages.append({"docId": doc_id, "page": page_index + 1, "text": ""})
                    errors.append({"docId": doc_id, "page": page_index + 1, "error": type(exc).__name__})
            if fitz:
                reader.close()
        except Exception as exc:
            errors.append({"docId": doc_id, "error": type(exc).__name__})
        documents.append(document)
        print(f"{doc_id}: {document['pages']} pages, {document['textPages']} with text", flush=True)

    indexed_on = datetime.now(timezone(timedelta(hours=8))).isoformat(timespec="seconds")
    summary = {
        "documents": len(documents), "pages": len(pages),
        "textPages": sum(doc["textPages"] for doc in documents),
        "emptyPages": sum(doc["emptyPages"] for doc in documents),
        "shortTextPages": sum(doc["shortTextPages"] for doc in documents),
        "limitedPages": sum(doc["limitedPages"] for doc in documents),
        "textCharacters": sum(len(page["text"]) for page in pages),
        "sourcePdfBytes": total_pdf_bytes,
        "agencies": dict(sorted(Counter(doc["agency"] for doc in documents).items())),
        "extractionErrors": len(errors),
    }
    notes = {
        "en": "Local text index of supplied PDFs, not all Singapore codes. PDF page numbers. Figures, scanned pages and table structure may be missing; no OCR. Version notes are supplied metadata. Check source and applicability before use.",
        "zh": "仅检索所提供 PDF 的文字，并非全部新加坡法规；页码为 PDF 页码。图像、扫描页及表格结构可能缺失；未做 OCR。版本备注来自资料包，使用前须核对来源及适用性。",
    }
    payload = {"schemaVersion": 1, "indexedOn": indexed_on, "summary": summary, "notes": notes, "documents": documents, "pages": pages}
    raw_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    compressed = gzip.compress(raw_json, compresslevel=9, mtime=0)
    args.output.mkdir(parents=True, exist_ok=True)
    asset_path = args.output / "local-codes.json.gz"
    asset_path.write_bytes(compressed)
    manifest = {"schemaVersion": 1, "indexedOn": indexed_on, "summary": summary, "notes": notes, "documents": documents, "asset": {"fileName": "local-codes.json.gz", "gzipBytes": len(compressed), "jsonBytes": len(raw_json), "sha256": hashlib.sha256(compressed).hexdigest()}, "errors": errors}
    (args.output / "local-codes-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"summary": summary, "gzipBytes": len(compressed), "jsonBytes": len(raw_json)}, ensure_ascii=True), flush=True)
    if errors:
        print("Some pages could not be extracted; see manifest errors.", file=sys.stderr)


if __name__ == "__main__":
    main()
