import { jsPDF } from 'jspdf';
import type { Block } from './report';
import { DEJAVU_BOLD, DEJAVU_REGULAR } from './fonts/dejavu';

const HEBREW = /[֐-׿יִ-ﭏ]/;
const HEB_ALL = /[֐-׿יִ-ﭏ]/g;
const LATIN_ALL = /[A-Za-z]/g;
const isRtlDominant = (s: string) => (s.match(HEB_ALL)?.length ?? 0) > (s.match(LATIN_ALL)?.length ?? 0);

/** Renders report blocks into an A4 PDF. Returns the bytes. */
export function renderPdf(blocks: Block[], title = 'Behavioral Pattern Summary'): ArrayBuffer {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  doc.addFileToVFS('DejaVuSans.ttf', DEJAVU_REGULAR);
  doc.addFont('DejaVuSans.ttf', 'DejaVu', 'normal');
  doc.addFileToVFS('DejaVuSans-Bold.ttf', DEJAVU_BOLD);
  doc.addFont('DejaVuSans-Bold.ttf', 'DejaVu', 'bold');
  doc.setProperties({ title, creator: 'Pattern — local behavior tracker' });

  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;
  const CW = W - M * 2;
  const BOTTOM = H - 48;
  let y = M;

  const ink = (g: number) => doc.setTextColor(g, g, g);
  const font = (style: 'normal' | 'bold', size: number) => {
    doc.setFont('DejaVu', style);
    doc.setFontSize(size);
  };
  const lh = (size: number) => size * 1.38;
  const ensure = (h: number) => {
    if (y + h > BOTTOM) {
      doc.addPage();
      y = M;
    }
  };

  /** Draw one already-wrapped line, handling right-to-left text. */
  const drawLine = (line: string, x: number, yy: number, width: number) => {
    if (HEBREW.test(line)) {
      const rtl = isRtlDominant(line);
      const opts = { isInputVisual: false, isOutputVisual: true, isInputRtl: rtl, isOutputRtl: false } as Record<string, unknown>;
      if (rtl) doc.text(line, x + width, yy, { ...opts, align: 'right' } as never);
      else doc.text(line, x, yy, opts as never);
    } else doc.text(line, x, yy);
  };

  const wrap = (text: string, width: number): string[] =>
    text.split(/\r?\n/).flatMap((para) => (para ? (doc.splitTextToSize(para, width) as string[]) : ['']));

  const para = (text: string, size: number, style: 'normal' | 'bold' = 'normal', indent = 0, gray = 30) => {
    font(style, size);
    ink(gray);
    for (const line of wrap(text, CW - indent)) {
      ensure(lh(size));
      drawLine(line, M + indent, y + size, CW - indent);
      y += lh(size);
    }
  };

  for (const b of blocks) {
    switch (b.t) {
      case 'h1':
        para(b.text, 20, 'bold', 0, 15);
        y += 6;
        break;
      case 'h2':
        y += 12;
        ensure(60);
        para(b.text, 13.5, 'bold', 0, 15);
        doc.setDrawColor(210);
        doc.setLineWidth(0.6);
        doc.line(M, y + 2, M + CW, y + 2);
        y += 10;
        break;
      case 'h3':
        y += 8;
        ensure(48);
        para(b.text, 11.5, 'bold', 0, 25);
        y += 2;
        break;
      case 'p':
        para(b.text, 9.5);
        y += 5;
        break;
      case 'note': {
        font('normal', 8.5);
        const lines = wrap(b.text, CW - 20);
        const h = lines.length * lh(8.5) + 12;
        ensure(h);
        doc.setFillColor(244, 244, 242);
        doc.roundedRect(M, y, CW, h, 4, 4, 'F');
        ink(70);
        let yy = y + 6;
        for (const l of lines) {
          drawLine(l, M + 10, yy + 8.5, CW - 20);
          yy += lh(8.5);
        }
        y += h + 8;
        break;
      }
      case 'kv':
        ensure(30);
        para(b.label, 8, 'bold', 0, 100);
        para(b.value, 9.5, 'normal', 0, 25);
        y += 6;
        break;
      case 'bullets':
        for (const item of b.items) {
          font('normal', 9.5);
          const lines = wrap(item, CW - 14);
          lines.forEach((l, i) => {
            ensure(lh(9.5));
            ink(30);
            if (i === 0) doc.text('•', M + 2, y + 9.5);
            drawLine(l, M + 14, y + 9.5, CW - 14);
            y += lh(9.5);
          });
          y += 2;
        }
        y += 4;
        break;
      case 'table':
        drawTable(b.head, b.rows);
        y += 8;
        break;
      case 'hr':
        doc.setDrawColor(220);
        doc.line(M, y, M + CW, y);
        y += 10;
        break;
    }
  }

  function drawTable(head: string[], rows: string[][]) {
    const size = 8;
    const pad = 4;
    // Each column gets at least its longest word; the rest is shared by content length.
    font('bold', size);
    const minW = head.map((h, c) => {
      const words = [h, ...rows.map((r) => r[c] ?? '')].flatMap((x) => x.split(/\s+/));
      return Math.min(CW * 0.35, Math.max(...words.map((w) => doc.getTextWidth(w))) + pad * 2 + 1);
    });
    const want = head.map((h, c) => Math.max(h.length, ...rows.map((r) => Math.min(80, (r[c] ?? '').length))));
    const spare = Math.max(0, CW - minW.reduce((a, b) => a + b, 0));
    const wantTotal = want.reduce((a, b) => a + b, 0) || 1;
    let widths = minW.map((m, i) => m + (spare * want[i]) / wantTotal);
    const sum = widths.reduce((a, b) => a + b, 0);
    if (sum > CW) widths = widths.map((w) => (w / sum) * CW);
    const measure = (cells: string[], style: 'normal' | 'bold') => {
      font(style, size);
      const wrapped = cells.map((c, i) => wrap(c ?? '', widths[i] - pad * 2));
      const h = Math.max(...wrapped.map((w) => w.length)) * lh(size) + pad * 2;
      return { wrapped, h };
    };
    const drawRow = (cells: string[], style: 'normal' | 'bold', fill?: [number, number, number]) => {
      const { wrapped, h } = measure(cells, style);
      if (y + h > BOTTOM) {
        doc.addPage();
        y = M;
        if (style === 'normal') drawRow(head, 'bold', [240, 240, 237]);
      }
      if (fill) {
        doc.setFillColor(...fill);
        doc.rect(M, y, CW, h, 'F');
      }
      font(style, size);
      ink(style === 'bold' ? 40 : 35);
      let x = M;
      wrapped.forEach((lines, i) => {
        lines.forEach((l, j) => drawLine(l, x + pad, y + pad + size + j * lh(size), widths[i] - pad * 2));
        x += widths[i];
      });
      doc.setDrawColor(225);
      doc.setLineWidth(0.4);
      doc.line(M, y + h, M + CW, y + h);
      y += h;
    };
    ensure(40);
    drawRow(head, 'bold', [240, 240, 237]);
    rows.forEach((r) => drawRow(r, 'normal'));
  }

  // Footer with page numbers.
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    font('normal', 7.5);
    ink(140);
    doc.text('Self-tracked data · not a clinical assessment', M, H - 24);
    doc.text(`${p} / ${pages}`, W - M, H - 24, { align: 'right' });
  }
  return doc.output('arraybuffer');
}
