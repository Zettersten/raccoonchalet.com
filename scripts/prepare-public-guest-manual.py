"""Make the host's November 2026 rulebook safe to offer as a public PDF.

Usage: python scripts/prepare-public-guest-manual.py SOURCE.pdf

The source is deliberately kept outside this repository because it includes a
Wi-Fi password. This script removes that password, corrects known outdated
instructions, and adds a Raccoon Chalet cover before writing the public copy.
Requires PyMuPDF and ReportLab.
"""

from __future__ import annotations

import argparse
from io import BytesIO
from pathlib import Path

import pymupdf
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "raccoon-chalet-guest-manual.pdf"


def find_line(page: pymupdf.Page, needle: str) -> dict:
    matches = [
        line
        for block in page.get_text("dict")["blocks"]
        if "lines" in block
        for line in block["lines"]
        if needle.lower() in "".join(span["text"] for span in line["spans"]).lower()
    ]
    if len(matches) != 1:
        raise ValueError(f"Expected one occurrence of {needle!r}, found {len(matches)}")
    return matches[0]


def redact_and_replace(page: pymupdf.Page, replacements: list[tuple[str, str, float, str]]) -> None:
    pending = []
    for needle, new_text, x, bullet in replacements:
        line = find_line(page, needle)
        rect = pymupdf.Rect(line["bbox"])
        rect.x0 -= 1
        rect.x1 = max(rect.x1 + 1, 540)
        page.add_redact_annot(rect, fill=(1, 1, 1))
        pending.append((new_text, x, line["spans"][0]["origin"][1], bullet))

    page.apply_redactions()
    for new_text, x, baseline, bullet in pending:
        if bullet:
            center = pymupdf.Point(x - 13, baseline - 3.5)
            page.draw_circle(
                center,
                2.5,
                color=(0, 0, 0),
                fill=(0, 0, 0) if bullet == "filled" else None,
                width=0.8,
            )
        page.insert_text((x, baseline), new_text, fontname="helv", fontsize=11, color=(0, 0, 0))


def cover_pdf() -> bytes:
    stream = BytesIO()
    page_width, page_height = 612, 792
    pdf = canvas.Canvas(stream, pagesize=(page_width, page_height), pageCompression=1)
    forest = HexColor("#101d19")
    cream = HexColor("#fffaf0")
    muted = HexColor("#c5d0bf")
    pdf.setFillColor(forest)
    pdf.rect(0, 0, page_width, page_height, stroke=0, fill=1)

    photo = ImageReader(str(ROOT / "assets" / "deck-view-02.jpg"))
    image_width, image_height = photo.getSize()
    frame_y, frame_height = 342, 450
    scale = max(page_width / image_width, frame_height / image_height)
    draw_width, draw_height = image_width * scale, image_height * scale
    pdf.saveState()
    clip = pdf.beginPath()
    clip.rect(0, frame_y, page_width, frame_height)
    pdf.clipPath(clip, stroke=0)
    pdf.drawImage(
        photo,
        (page_width - draw_width) / 2,
        frame_y + (frame_height - draw_height) / 2,
        width=draw_width,
        height=draw_height,
    )
    pdf.restoreState()

    pdf.setFillColor(cream)
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(48, 305, "RACCOON CHALET")
    pdf.setFont("Times-Roman", 52)
    pdf.drawString(45, 233, "Guest manual")
    pdf.setFont("Helvetica", 13)
    pdf.setFillColor(muted)
    pdf.drawString(48, 201, "The full stay rules, from arrival to checkout.")

    pdf.setStrokeColor(HexColor("#6b7a6c"))
    pdf.line(48, 170, page_width - 48, 170)
    pdf.setFont("Helvetica", 9.5)
    pdf.setFillColor(cream)
    pdf.drawString(48, 147, "Blue Maple provides your personal door code and Wi-Fi password privately.")
    pdf.drawString(48, 132, "Local business hours and resort offerings may change; please check before visiting.")
    pdf.setFillColor(muted)
    pdf.drawString(48, 68, "PUBLIC GUEST COPY  |  NOVEMBER 2026")
    pdf.setFillColor(cream)
    pdf.drawString(48, 48, "raccoonchalet.com/guest-manual.html")
    pdf.linkURL(
        "https://raccoonchalet.com/guest-manual.html",
        (48, 44, 305, 59),
        relative=0,
    )
    pdf.showPage()
    pdf.save()
    return stream.getvalue()


def build(source: Path) -> None:
    if source.resolve() == OUTPUT.resolve():
        raise ValueError("Source and public output must be different files")
    original = pymupdf.open(source)
    if len(original) != 20:
        raise ValueError(f"Expected the 20-page November rulebook; found {len(original)} pages")

    password_line = find_line(original[2], "Password:")
    secret_line = "".join(span["text"] for span in password_line["spans"])
    secret = secret_line.split("Password:", 1)[1].replace("\u200b", "").strip()
    if len(secret) < 5:
        raise ValueError("Could not identify the Wi-Fi password for redaction verification")

    redact_and_replace(
        original[2],
        [
            ("Take out trash and recycling", "Bag trash. Before Monday, leave it in the kitchen; otherwise use the lidded cans.", 144, "open"),
            ("Return the key to the lockbox", "Check the smart lock; return any physical key if one was supplied.", 144, "open"),
            ("The driveway can easily accommodate", "Park up to two vehicles in designated driveway spaces. Ask Blue Maple", 108, "filled"),
            ("the end of Raccoon road", "before bringing another. Do not park on the road.", 108, ""),
            ("Password:", "Wi-Fi password: Ask Blue Maple for current access.", 144, "open"),
        ],
    )
    redact_and_replace(
        original[13],
        [("[Your Phone Number]", "For help, call or text Blue Maple at (540) 517-6820.", 108, "filled")],
    )
    redact_and_replace(
        original[14],
        [("WV mountain creatures", "refund for the presence of these typical VA mountain creatures!", 108, "")],
    )

    public = pymupdf.open(stream=cover_pdf(), filetype="pdf")
    public.insert_pdf(original)
    public.set_metadata(
        {
            "title": "Raccoon Chalet Guest Manual",
            "author": "Raccoon Chalet",
            "subject": "Public guest copy of the full stay rules, November 2026",
            "keywords": "Raccoon Chalet, guest manual, Basye, Virginia",
        }
    )
    public.save(OUTPUT, garbage=4, clean=True, deflate=True)
    public.close()
    original.close()

    check = pymupdf.open(OUTPUT)
    all_text = "\n".join(page.get_text() for page in check)
    if len(check) != 21 or secret in all_text:
        raise ValueError("Public PDF failed the page-count or password-removal check")
    for stale_text in (
        "Return the key to the lockbox",
        "Take out trash and recycling to the trash cans",
        "The driveway can easily accommodate 3 vehicles",
        "[Your Phone Number]",
        "WV mountain creatures",
    ):
        if stale_text in all_text:
            raise ValueError(f"Outdated text remains in public PDF: {stale_text}")
    check.close()
    print(f"Created {OUTPUT} (21 pages; access password removed)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Path to the private 20-page source PDF")
    build(parser.parse_args().source)
