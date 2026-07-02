import argparse
import json
import re
import struct
import zlib
from pathlib import Path


def png_info(path: Path):
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"Not a PNG: {path}")
    pos = 8
    width = height = bit_depth = color_type = None
    idat = bytearray()
    while pos < len(data):
        length = struct.unpack(">I", data[pos:pos + 4])[0]
        kind = data[pos + 4:pos + 8]
        chunk = data[pos + 8:pos + 8 + length]
        pos += length + 12
        if kind == b"IHDR":
            width, height, bit_depth, color_type, compression, filter_method, interlace = struct.unpack(">IIBBBBB", chunk)
            if compression or filter_method or interlace:
                raise ValueError(f"Unsupported PNG format: {path}")
        elif kind == b"IDAT":
            idat.extend(chunk)
        elif kind == b"IEND":
            break
    if width is None:
        raise ValueError(f"Missing PNG header: {path}")
    return width, height, bit_depth, color_type, bytes(idat)


class Pdf:
    def __init__(self):
        self.objects = []

    def add(self, body: bytes) -> int:
        self.objects.append(body)
        return len(self.objects)

    def stream(self, head: bytes, data: bytes) -> bytes:
        return head + f"\n/Length {len(data)}\n>>\nstream\n".encode() + data + b"\nendstream"

    def write(self, path: Path, root_id: int):
        out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        offsets = [0]
        for i, body in enumerate(self.objects, 1):
            offsets.append(len(out))
            out.extend(f"{i} 0 obj\n".encode())
            out.extend(body)
            out.extend(b"\nendobj\n")
        xref = len(out)
        out.extend(f"xref\n0 {len(self.objects) + 1}\n".encode())
        out.extend(b"0000000000 65535 f \n")
        for offset in offsets[1:]:
            out.extend(f"{offset:010d} 00000 n \n".encode())
        out.extend(f"trailer\n<< /Size {len(self.objects) + 1} /Root {root_id} 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
        path.write_bytes(out)


def pdf_text(text: str) -> bytes:
    return b"<" + (b"\xfe\xff" + text.encode("utf-16-be")).hex().encode() + b">"


def make_pdf(manifest: dict, out: Path):
    pdf = Pdf()
    page_ids, image_ids, content_ids = [], [], []
    starts = []

    for section in manifest["sections"]:
        starts.append(len(page_ids))
        for image in section["images"]:
            image_path = Path(image["path"])
            width, height, bit_depth, color_type, idat = png_info(image_path)
            if bit_depth != 8 or color_type not in (2, 6):
                raise ValueError(f"Unsupported PNG color type {color_type}: {image_path}")
            colors = 3
            image_data = idat
            if color_type == 6:
                raw = zlib.decompress(idat)
                stride = width * 4
                rgb = bytearray()
                for row in range(height):
                    start = row * (stride + 1)
                    rgb.append(raw[start])
                    pixels = raw[start + 1:start + 1 + stride]
                    for i in range(0, len(pixels), 4):
                        rgb.extend(pixels[i:i + 3])
                image_data = zlib.compress(bytes(rgb), 6)
            image_id = pdf.add(pdf.stream(
                f"<< /Type /XObject /Subtype /Image /Width {width} /Height {height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors {colors} /BitsPerComponent 8 /Columns {width} >>".encode(),
                image_data,
            ))
            content_id = pdf.add(pdf.stream(b"<<", b"q\n960 0 0 540 0 0 cm\n/Im0 Do\nQ\n"))
            image_ids.append(image_id)
            content_ids.append(content_id)
            page_ids.append(None)

    pages_id = len(pdf.objects) + len(page_ids) + 1
    for i in range(len(page_ids)):
        page_ids[i] = pdf.add(
            f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 960 540] /Resources << /XObject << /Im0 {image_ids[i]} 0 R >> >> /Contents {content_ids[i]} 0 R >>".encode()
        )
    kids = " ".join(f"{page_id} 0 R" for page_id in page_ids)
    actual_pages_id = pdf.add(f"<< /Type /Pages /Kids [{kids}] /Count {len(page_ids)} >>".encode())
    assert actual_pages_id == pages_id

    outline_ids = []
    outlines_id = len(pdf.objects) + len(manifest["sections"]) + 1
    for _ in manifest["sections"]:
        outline_ids.append(len(pdf.objects) + len(outline_ids) + 1)
    for i, section in enumerate(manifest["sections"]):
        prev_ref = f"/Prev {outline_ids[i - 1]} 0 R " if i else ""
        next_ref = f"/Next {outline_ids[i + 1]} 0 R " if i < len(outline_ids) - 1 else ""
        page_ref = page_ids[starts[i]]
        title = pdf_text(section["label"])
        pdf.add(b"<< /Title " + title + f" /Parent {outlines_id} 0 R {prev_ref}{next_ref}/Dest [{page_ref} 0 R /Fit] >>".encode())
    actual_outlines_id = pdf.add(f"<< /Type /Outlines /First {outline_ids[0]} 0 R /Last {outline_ids[-1]} 0 R /Count {len(outline_ids)} >>".encode())
    assert actual_outlines_id == outlines_id
    catalog_id = pdf.add(f"<< /Type /Catalog /Pages {pages_id} 0 R /Outlines {outlines_id} 0 R /PageMode /UseOutlines >>".encode())
    out.parent.mkdir(parents=True, exist_ok=True)
    pdf.write(out, catalog_id)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    make_pdf(manifest, Path(args.out))
    print(f"created {args.out} sections={len(manifest['sections'])} pages={sum(len(s['images']) for s in manifest['sections'])}")


if __name__ == "__main__":
    main()
