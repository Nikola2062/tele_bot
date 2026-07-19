"""Render a set of papers + summaries into a polished, magazine-style PDF.

Pure-Python (fpdf2, no system deps) so it runs identically on the dev Mac and
the Linux box. One cover page, then one full-bleed "card" page per paper:
title, authors, upvote badge, links, and the three-tier summary.

Design notes (kept deliberately flat/editorial so it renders crisply at any
zoom): a dark hero band, a single warm accent (Hugging Face yellow-orange),
generous whitespace, uppercase section labels, and a tinted "professor" block.
"""
from __future__ import annotations

import logging
from pathlib import Path

from fpdf import FPDF
from fpdf.enums import XPos, YPos

from .fetcher import Paper
from .summarizer import Summary

log = logging.getLogger(__name__)

# --- Palette -----------------------------------------------------------------
INK = (26, 32, 44)        # near-black slate for body text
SUBTLE = (113, 128, 150)  # muted grey for authors / meta
HAIRLINE = (226, 232, 240)
HERO_BG = (26, 32, 44)    # dark cover band
HERO_SUB = (160, 174, 192)
ACCENT = (237, 137, 54)   # warm HF-ish orange
ACCENT_DEEP = (192, 86, 33)
LINK = (49, 130, 206)     # blue for hyperlinks
PROF_TINT = (255, 247, 237)  # warm paper tint for the professor block
PROF_INK = (124, 45, 18)

# --- Geometry (A4, mm) -------------------------------------------------------
PAGE_W, PAGE_H = 210.0, 297.0
MARGIN = 18.0
CONTENT_W = PAGE_W - 2 * MARGIN

FONT = "Helvetica"

# Latin-1 substitutions for typography the core font can't encode.
_SUBST = {
    "‘": "'", "’": "'", "“": '"', "”": '"',
    "–": "-", "—": "-", "−": "-", "…": "...",
    "•": "-", " ": " ", " ": " ", "​": "",
    "→": "->", "←": "<-", "×": "x",
}


def _safe(text: str) -> str:
    """Make text safe for the latin-1 core fonts: substitute smart punctuation,
    drop anything else (e.g. emoji, CJK) that can't be encoded."""
    if not text:
        return ""
    out = []
    for ch in text:
        if ch in _SUBST:
            out.append(_SUBST[ch])
        elif ch == "\n" or 32 <= ord(ch) <= 255:
            out.append(ch)
        else:
            try:
                ch.encode("latin-1")
                out.append(ch)
            except UnicodeEncodeError:
                out.append("")
    return "".join(out)


class _Digest(FPDF):
    def __init__(self, issue_date: str) -> None:
        super().__init__(format="A4", unit="mm")
        self.issue_date = issue_date
        self.set_auto_page_break(auto=True, margin=22)
        self.set_title("Hugging Face - Daily Papers")
        self.set_creator("hugging_papers")
        self.cover = False

    # Footer on every non-cover page: hairline + brand + page number.
    # Page 1 is always the cover, which gets no footer.
    def footer(self) -> None:
        if self.page_no() == 1:
            return
        self.set_y(-16)
        self.set_draw_color(*HAIRLINE)
        self.set_line_width(0.3)
        self.line(MARGIN, self.get_y(), PAGE_W - MARGIN, self.get_y())
        self.set_y(-13)
        self.set_font(FONT, "", 8)
        self.set_text_color(*SUBTLE)
        self.cell(0, 6, _safe("Hugging Face - Daily Papers"), align="L")
        self.cell(0, 6, _safe(f"{self.page_no() - 1}"), align="R")


def _section_label(pdf: _Digest, text: str) -> None:
    pdf.set_font(FONT, "B", 9)
    pdf.set_text_color(*ACCENT_DEEP)
    # Fake letter-spacing for an editorial feel.
    pdf.cell(0, 5, _safe(" ".join(text.upper())), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(1.5)


def _body(pdf: _Digest, text: str, *, size: float = 10.5, color=INK, lh: float = 5.4) -> None:
    pdf.set_font(FONT, "", size)
    pdf.set_text_color(*color)
    pdf.multi_cell(CONTENT_W, lh, _safe(text), new_x=XPos.LMARGIN, new_y=YPos.NEXT)


def _bullets(pdf: _Digest, raw: str) -> None:
    pdf.set_font(FONT, "", 10.5)
    for line in raw.splitlines():
        item = line.strip().lstrip("-•*").strip()
        if not item:
            continue
        y = pdf.get_y()
        # Accent square as the bullet marker.
        pdf.set_fill_color(*ACCENT)
        pdf.rect(MARGIN + 0.5, y + 1.7, 1.8, 1.8, style="F")
        pdf.set_xy(MARGIN + 6, y)
        pdf.set_text_color(*INK)
        pdf.multi_cell(CONTENT_W - 6, 5.4, _safe(item), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.ln(1.2)


def _cover(pdf: _Digest, count: int) -> None:
    pdf.cover = True
    pdf.add_page()
    # Dark hero band across the top third.
    band_h = 120.0
    pdf.set_fill_color(*HERO_BG)
    pdf.rect(0, 0, PAGE_W, band_h, style="F")
    # Accent rule near the bottom of the band.
    pdf.set_fill_color(*ACCENT)
    pdf.rect(MARGIN, band_h - 26, 34, 2.4, style="F")

    pdf.set_xy(MARGIN, 34)
    pdf.set_font(FONT, "B", 13)
    pdf.set_text_color(*ACCENT)
    pdf.cell(0, 8, _safe("H U G G I N G   F A C E"), new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.set_x(MARGIN)
    pdf.set_font(FONT, "B", 40)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(0, 20, _safe("Daily Papers"), new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.set_x(MARGIN)
    pdf.set_font(FONT, "", 12)
    pdf.set_text_color(*HERO_SUB)
    pdf.cell(0, 8, _safe("A curated digest of trending research"), new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    # Meta line below the band.
    pdf.set_xy(MARGIN, band_h + 16)
    pdf.set_font(FONT, "B", 11)
    pdf.set_text_color(*INK)
    pdf.cell(0, 7, _safe(pdf.issue_date.upper()), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_x(MARGIN)
    pdf.set_font(FONT, "", 11)
    pdf.set_text_color(*SUBTLE)
    noun = "paper" if count == 1 else "papers"
    pdf.cell(0, 7, _safe(f"{count} {noun} in this issue"), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.cover = False


def _paper_page(pdf: _Digest, idx: int, paper: Paper, summary: Summary) -> None:
    pdf.add_page()
    top = pdf.get_y()

    # Number chip (accent square with the issue index).
    chip = 11.0
    pdf.set_fill_color(*ACCENT)
    pdf.rect(MARGIN, top, chip, chip, style="F")
    pdf.set_xy(MARGIN, top + 1.5)
    pdf.set_font(FONT, "B", 13)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(chip, 8, f"{idx:02d}", align="C")

    # Upvote badge on the right: tinted pill + drawn up-triangle + count.
    num = str(paper.upvotes)
    pdf.set_font(FONT, "B", 10)
    tri = 2.6  # triangle size (mm)
    gap = 2.0
    pad = 5.0
    num_w = pdf.get_string_width(num)
    bw = pad + tri + gap + num_w + pad
    bx = PAGE_W - MARGIN - bw
    pdf.set_fill_color(255, 247, 237)
    pdf.rect(bx, top, bw, chip, style="F")
    tx = bx + pad
    ty = top + (chip - tri) / 2
    pdf.set_fill_color(*ACCENT_DEEP)
    pdf.polygon([(tx, ty + tri), (tx + tri / 2, ty), (tx + tri, ty + tri)], style="F")
    pdf.set_xy(tx + tri + gap, top + 1.7)
    pdf.set_text_color(*ACCENT_DEEP)
    pdf.cell(num_w, 7, _safe(num))

    # Title.
    pdf.set_xy(MARGIN, top + chip + 6)
    pdf.set_font(FONT, "B", 17)
    pdf.set_text_color(*INK)
    pdf.multi_cell(CONTENT_W, 7.6, _safe(paper.title), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(1)

    # Authors.
    if paper.authors:
        shown = ", ".join(paper.authors[:6]) + (" et al." if len(paper.authors) > 6 else "")
        pdf.set_font(FONT, "I", 9.5)
        pdf.set_text_color(*SUBTLE)
        pdf.multi_cell(CONTENT_W, 5, _safe(shown), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(1.5)

    # Link row.
    pdf.set_font(FONT, "B", 9.5)
    pdf.set_text_color(*LINK)
    pdf.cell(pdf.get_string_width("arXiv") + 2, 5, "arXiv", link=paper.arxiv_url)
    pdf.set_text_color(*SUBTLE)
    pdf.cell(6, 5, _safe("  /  "))
    pdf.set_text_color(*LINK)
    pdf.cell(pdf.get_string_width("Hugging Face") + 2, 5, "Hugging Face",
             link=paper.hf_url, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(3)

    # Divider.
    pdf.set_draw_color(*HAIRLINE)
    pdf.set_line_width(0.3)
    pdf.line(MARGIN, pdf.get_y(), PAGE_W - MARGIN, pdf.get_y())
    pdf.ln(5)

    if summary.short_intro:
        _section_label(pdf, "Short intro")
        _body(pdf, summary.short_intro)
        pdf.ln(4)

    if summary.detailed_summary:
        _section_label(pdf, "Key points")
        _bullets(pdf, summary.detailed_summary)
        pdf.ln(2)

    if summary.professor_explanation:
        _professor_block(pdf, summary.professor_explanation)


def _professor_block(pdf: _Digest, text: str) -> None:
    _section_label(pdf, "Professor's take")
    # Estimate height to draw a tinted panel behind the text.
    pdf.set_font(FONT, "", 10)
    pad = 5.0
    inner_w = CONTENT_W - 2 * pad
    # Render once invisibly to learn the height, then draw the panel + real text.
    start = pdf.get_y()
    lines = pdf.multi_cell(inner_w, 5.2, _safe(text), dry_run=True, output="LINES")
    height = len(lines) * 5.2 + 2 * pad
    # Page-break guard: if it won't fit, push to a new page.
    if start + height > PAGE_H - 24:
        pdf.add_page()
        start = pdf.get_y()
    pdf.set_fill_color(*PROF_TINT)
    pdf.rect(MARGIN, start, CONTENT_W, height, style="F")
    # Accent spine on the left edge of the panel.
    pdf.set_fill_color(*ACCENT)
    pdf.rect(MARGIN, start, 1.8, height, style="F")
    pdf.set_xy(MARGIN + pad, start + pad)
    pdf.set_font(FONT, "", 10)
    pdf.set_text_color(*PROF_INK)
    pdf.multi_cell(inner_w, 5.2, _safe(text), new_x=XPos.LMARGIN, new_y=YPos.NEXT)


def build_digest_pdf(
    items: list[tuple[Paper, Summary]],
    out_path: str | Path,
    *,
    issue_date: str,
) -> Path:
    """Render `items` into a PDF at `out_path` and return the path."""
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    pdf = _Digest(issue_date)
    _cover(pdf, len(items))
    for i, (paper, summary) in enumerate(items, start=1):
        _paper_page(pdf, i, paper, summary)

    pdf.output(str(out_path))
    log.info("built digest PDF with %d papers -> %s", len(items), out_path)
    return out_path
