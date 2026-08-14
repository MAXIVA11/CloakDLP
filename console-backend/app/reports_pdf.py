"""Branded PDF incident report generation, kept separate from routers/reports.py so the
reportlab layout code (verbose by nature) doesn't crowd the routing/query logic.
"""
import sys
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT

from app.models import Incident

# Brand palette, matched to the console's logo and CSS theme (console-frontend/src/app/globals.css).
NAVY = colors.HexColor("#0f2b45")
TEAL = colors.HexColor("#1e9c90")
TEAL_LIGHT = colors.HexColor("#e4f5f3")
ROW_ALT = colors.HexColor("#f7f8fa")
INK = colors.HexColor("#12151a")
MUTED = colors.HexColor("#5b6472")
BORDER = colors.HexColor("#e2e5ea")
DANGER = colors.HexColor("#c0392b")

# In a onefile PyInstaller build, this module's own bytecode lives inside the zipped PYZ
# archive - only files declared as `datas` in the spec are extracted to real paths on disk, at
# sys._MEIPASS, so the logo can't be found relative to __file__ the way it can in dev.
if getattr(sys, "frozen", False):
    LOGO_PATH = Path(sys._MEIPASS) / "assets" / "logo.png"
else:
    LOGO_PATH = Path(__file__).resolve().parent / "assets" / "logo.png"
PAGE_W, PAGE_H = letter
MARGIN = 18 * mm


def _status_label(status: str) -> str:
    return {"open": "Open", "false_positive": "False positive", "resolved": "Resolved"}.get(status, status)


def _channel_label(channel: str) -> str:
    return {"file": "File", "clipboard": "Clipboard", "print": "Print", "network": "Network"}.get(
        channel, channel.title()
    )


def _wrap_slug(slug: str, max_len: int = 13) -> str:
    """Breaks a long hyphenated rule-id slug into <br/> separated lines at hyphen boundaries,
    so reportlab's Paragraph wraps it cleanly instead of slicing mid-syllable (its default
    behavior for a single "word" with no spaces that overflows the column).
    """
    parts = slug.split("-")
    lines: list[str] = []
    current = ""
    for part in parts:
        candidate = f"{current}-{part}" if current else part
        if len(candidate) > max_len and current:
            lines.append(current + "-")
            current = part
        else:
            current = candidate
    if current:
        lines.append(current)
    return "<br/>".join(lines)


class _ReportCanvas(canvas.Canvas):
    """Adds the navy header band, footer, and page numbers to every page of the document."""

    def __init__(self, *args, generated_at: str, total: int, **kwargs):
        super().__init__(*args, **kwargs)
        self._pages = []
        self._generated_at = generated_at
        self._total = total

    def showPage(self):
        self._pages.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        page_count = len(self._pages)
        for i, state in enumerate(self._pages):
            self.__dict__.update(state)
            self._draw_chrome(i + 1, page_count)
            super().showPage()
        super().save()

    def _draw_chrome(self, page_num: int, page_count: int):
        # Header band
        self.setFillColor(NAVY)
        self.rect(0, PAGE_H - 26 * mm, PAGE_W, 26 * mm, fill=1, stroke=0)
        self.setFillColor(TEAL)
        self.rect(0, PAGE_H - 26.8 * mm, PAGE_W, 0.8 * mm, fill=1, stroke=0)

        if LOGO_PATH.is_file():
            try:
                img = ImageReader(str(LOGO_PATH))
                size = 14 * mm
                self.drawImage(
                    img, MARGIN, PAGE_H - 20 * mm, width=size, height=size,
                    mask="auto", preserveAspectRatio=True,
                )
                text_x = MARGIN + size + 5 * mm
            except Exception:
                text_x = MARGIN
        else:
            text_x = MARGIN

        self.setFillColor(colors.white)
        self.setFont("Helvetica-Bold", 16)
        self.drawString(text_x, PAGE_H - 13.5 * mm, "CloakDLP")
        self.setFont("Helvetica", 9.5)
        self.setFillColor(colors.HexColor("#bcd8d4"))
        self.drawString(text_x, PAGE_H - 19 * mm, "Incident Report")

        self.setFont("Helvetica", 8.5)
        self.drawRightString(PAGE_W - MARGIN, PAGE_H - 13 * mm, f"Generated {self._generated_at}")
        self.drawRightString(PAGE_W - MARGIN, PAGE_H - 18 * mm, f"{self._total} incident{'s' if self._total != 1 else ''}")

        # Footer
        self.setStrokeColor(BORDER)
        self.setLineWidth(0.5)
        self.line(MARGIN, 14 * mm, PAGE_W - MARGIN, 14 * mm)
        self.setFont("Helvetica", 7.5)
        self.setFillColor(MUTED)
        self.drawString(MARGIN, 9.5 * mm, "CloakDLP - confidential, generated locally. Not for external distribution.")
        self.drawRightString(PAGE_W - MARGIN, 9.5 * mm, f"Page {page_num} of {page_count}")


def _summary_table(incidents: list[Incident]) -> Table:
    total = len(incidents)
    blocked = sum(1 for i in incidents if i.blocked)
    logged = total - blocked
    open_count = sum(1 for i in incidents if i.status.value == "open")

    cells = [
        ("TOTAL INCIDENTS", str(total), NAVY),
        ("BLOCKED", str(blocked), DANGER),
        ("LOGGED", str(logged), TEAL),
        ("OPEN", str(open_count), MUTED),
    ]
    style = ParagraphStyle("value", fontName="Helvetica-Bold", fontSize=20, textColor=INK, leading=24)
    label_style = ParagraphStyle("label", fontName="Helvetica-Bold", fontSize=7.5, textColor=MUTED, leading=10)

    row = []
    for label, value, accent in cells:
        cell = Table(
            [[Paragraph(label, label_style)], [Paragraph(value, style)]],
            colWidths=[38 * mm],
        )
        cell.setStyle(TableStyle([
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("LINEBEFORE", (0, 0), (0, -1), 2.2, accent),
            ("BACKGROUND", (0, 0), (-1, -1), colors.white),
            ("BOX", (0, 0), (-1, -1), 0.75, BORDER),
        ]))
        row.append(cell)

    wrapper = Table([row], colWidths=[40 * mm] * 4, spaceBefore=0)
    wrapper.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 3)]))
    return wrapper


def build_incident_report_pdf(incidents: list[Incident], policy_names: dict[str, str]) -> bytes:
    buffer = BytesIO()
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    doc = SimpleDocTemplate(
        buffer, pagesize=letter,
        topMargin=32 * mm, bottomMargin=20 * mm, leftMargin=MARGIN, rightMargin=MARGIN,
        title="CloakDLP Incident Report",
    )

    section_style = ParagraphStyle("section", fontName="Helvetica-Bold", fontSize=11, textColor=NAVY, spaceAfter=6)
    cell_style = ParagraphStyle("cell", fontName="Helvetica", fontSize=8, textColor=INK, leading=10, alignment=TA_LEFT)
    mono_style = ParagraphStyle("mono", fontName="Courier", fontSize=7.5, textColor=MUTED, leading=9)

    elements = [
        Paragraph("Summary", section_style),
        _summary_table(incidents),
        Spacer(1, 9 * mm),
        Paragraph("Incidents", section_style),
    ]

    if not incidents:
        elements.append(Paragraph("No incidents match the current filters.", cell_style))
    else:
        header = ["Timestamp", "Policy", "Channel", "Action", "Rule", "Details", "Status"]
        data = [header]
        for inc in incidents:
            rule_wrappable = _wrap_slug(inc.rule_id)
            data.append([
                Paragraph(inc.timestamp.strftime("%Y-%m-%d %H:%M"), mono_style),
                Paragraph(policy_names.get(inc.policy_id, "Unknown policy"), cell_style),
                Paragraph(_channel_label(inc.channel.value), cell_style),
                Paragraph("Blocked" if inc.blocked else "Logged", cell_style),
                Paragraph(rule_wrappable, mono_style),
                Paragraph(inc.redacted_snippet or "-", cell_style),
                Paragraph(_status_label(inc.status.value), cell_style),
            ])

        col_widths = [22 * mm, 24 * mm, 16 * mm, 15 * mm, 28 * mm, 45 * mm, 20 * mm]
        table = Table(data, colWidths=col_widths, repeatRows=1)

        style = [
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 8),
            ("TOPPADDING", (0, 0), (-1, 0), 6),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
            ("TOPPADDING", (0, 1), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 1), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]
        for row_idx, inc in enumerate(incidents, start=1):
            if row_idx % 2 == 0:
                style.append(("BACKGROUND", (0, row_idx), (-1, row_idx), ROW_ALT))
            if inc.blocked:
                style.append(("TEXTCOLOR", (3, row_idx), (3, row_idx), DANGER))
                style.append(("FONTNAME", (3, row_idx), (3, row_idx), "Helvetica-Bold"))
            else:
                style.append(("TEXTCOLOR", (3, row_idx), (3, row_idx), TEAL))
        table.setStyle(TableStyle(style))
        elements.append(table)

    def make_canvas(*args, **kwargs):
        return _ReportCanvas(*args, generated_at=generated_at, total=len(incidents), **kwargs)

    doc.build(elements, canvasmaker=make_canvas)
    return buffer.getvalue()
