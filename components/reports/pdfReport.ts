import type { PDFDocument, PDFFont, PDFPage, RGB } from 'pdf-lib';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 42;
const TOP_MARGIN = 42;
const BOTTOM_MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

const COLORS = {
  navy: [15, 23, 42],
  blue: [37, 99, 235],
  cyan: [14, 165, 233],
  text: [30, 41, 59],
  muted: [100, 116, 139],
  border: [226, 232, 240],
  soft: [248, 250, 252],
  blueSoft: [239, 246, 255],
  white: [255, 255, 255],
} as const;

type FontWeight = 'regular' | 'bold';
type ColorName = keyof typeof COLORS;
type PdfLibModule = typeof import('pdf-lib');

type TextOptions = {
  size?: number;
  weight?: FontWeight;
  color?: ColorName;
  maxWidth?: number;
  lineHeight?: number;
  x?: number;
  gapAfter?: number;
};

type KeyValue = { label: string; value: string };

type TableColumn = {
  label: string;
  width: number;
  align?: 'left' | 'right';
};

function normalizePdfText(value: unknown) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00a0/g, ' ')
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function toRgb(pdfLib: PdfLibModule, color: ColorName): RGB {
  const [r, g, b] = COLORS[color];
  return pdfLib.rgb(r / 255, g / 255, b / 255);
}

function wrapLine(font: PDFFont, text: string, maxWidth: number, size: number) {
  const safeText = normalizePdfText(text);
  if (!safeText) return [''];
  const words = safeText.split(' ');
  const lines: string[] = [];
  let line = '';

  const pushLongWord = (word: string) => {
    let fragment = '';
    for (const character of word) {
      const candidate = fragment + character;
      if (fragment && font.widthOfTextAtSize(candidate, size) > maxWidth) {
        lines.push(fragment);
        fragment = character;
      } else {
        fragment = candidate;
      }
    }
    return fragment;
  };

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      line = word;
    } else {
      line = pushLongWord(word);
    }
  }
  if (line || lines.length === 0) lines.push(line);
  return lines;
}

function wrapText(font: PDFFont, text: string, maxWidth: number, size: number) {
  const paragraphs = String(text ?? '').split(/\r?\n/);
  const lines: string[] = [];
  paragraphs.forEach((paragraph, index) => {
    lines.push(...wrapLine(font, paragraph, maxWidth, size));
    if (index < paragraphs.length - 1) lines.push('');
  });
  return lines;
}

export class PdfReport {
  private readonly pdfDoc: PDFDocument;
  private readonly pdfLib: PdfLibModule;
  private readonly regular: PDFFont;
  private readonly bold: PDFFont;
  private page: PDFPage;
  private y = PAGE_HEIGHT - TOP_MARGIN;
  private readonly documentTitle: string;

  private constructor(
    pdfDoc: PDFDocument,
    pdfLib: PdfLibModule,
    regular: PDFFont,
    bold: PDFFont,
    title: string
  ) {
    this.pdfDoc = pdfDoc;
    this.pdfLib = pdfLib;
    this.regular = regular;
    this.bold = bold;
    this.documentTitle = normalizePdfText(title);
    this.page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  }

  static async create(title: string, subject: string) {
    const pdfLib = await import('pdf-lib');
    const pdfDoc = await pdfLib.PDFDocument.create();
    const regular = await pdfDoc.embedFont(pdfLib.StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(pdfLib.StandardFonts.HelveticaBold);
    const report = new PdfReport(pdfDoc, pdfLib, regular, bold, title);
    const now = new Date();
    pdfDoc.setTitle(normalizePdfText(title), { showInWindowTitleBar: true });
    pdfDoc.setSubject(normalizePdfText(subject));
    pdfDoc.setAuthor('FYP Portal');
    pdfDoc.setCreator('FYP Portal');
    pdfDoc.setProducer('pdf-lib');
    pdfDoc.setCreationDate(now);
    pdfDoc.setModificationDate(now);
    pdfDoc.setLanguage('en');
    return report;
  }

  private font(weight: FontWeight) {
    return weight === 'bold' ? this.bold : this.regular;
  }

  private color(name: ColorName) {
    return toRgb(this.pdfLib, name);
  }

  private addPage() {
    this.page = this.pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - TOP_MARGIN;
    this.page.drawText(this.documentTitle, {
      x: MARGIN_X,
      y: this.y,
      size: 8,
      font: this.bold,
      color: this.color('muted'),
    });
    this.y -= 22;
  }

  ensureSpace(height: number) {
    if (this.y - height < BOTTOM_MARGIN) this.addPage();
  }

  gap(points = 10) {
    this.y -= points;
  }

  hero(input: {
    eyebrow: string;
    title: string;
    subtitle: string;
    metadata: KeyValue[];
  }) {
    const heroHeight = 168;
    this.page.drawRectangle({
      x: 0,
      y: PAGE_HEIGHT - heroHeight,
      width: PAGE_WIDTH,
      height: heroHeight,
      color: this.color('navy'),
    });
    this.page.drawRectangle({
      x: 0,
      y: PAGE_HEIGHT - heroHeight,
      width: 8,
      height: heroHeight,
      color: this.color('cyan'),
    });
    this.page.drawText(normalizePdfText(input.eyebrow).toUpperCase(), {
      x: MARGIN_X,
      y: PAGE_HEIGHT - 56,
      size: 9,
      font: this.bold,
      color: this.color('cyan'),
    });
    this.page.drawText(normalizePdfText(input.title), {
      x: MARGIN_X,
      y: PAGE_HEIGHT - 84,
      size: 22,
      font: this.bold,
      color: this.color('white'),
    });
    const subtitleLines = wrapText(this.regular, input.subtitle, CONTENT_WIDTH, 9.5).slice(0, 2);
    subtitleLines.forEach((line, index) => {
      this.page.drawText(line, {
        x: MARGIN_X,
        y: PAGE_HEIGHT - 105 - index * 13,
        size: 9.5,
        font: this.regular,
        color: this.pdfLib.rgb(203 / 255, 213 / 255, 225 / 255),
      });
    });

    const metadataTop = PAGE_HEIGHT - 138;
    const columnWidth = CONTENT_WIDTH / Math.min(Math.max(input.metadata.length, 1), 4);
    input.metadata.slice(0, 4).forEach((item, index) => {
      const x = MARGIN_X + index * columnWidth;
      this.page.drawText(normalizePdfText(item.label).toUpperCase(), {
        x,
        y: metadataTop,
        size: 6.8,
        font: this.bold,
        color: this.pdfLib.rgb(148 / 255, 163 / 255, 184 / 255),
      });
      const value = wrapText(this.bold, item.value || 'N/A', columnWidth - 8, 9).slice(0, 1)[0] || 'N/A';
      this.page.drawText(value, {
        x,
        y: metadataTop - 14,
        size: 9,
        font: this.bold,
        color: this.color('white'),
      });
    });
    this.y = PAGE_HEIGHT - heroHeight - 26;
  }

  summaryCards(items: KeyValue[]) {
    if (items.length === 0) return;
    this.ensureSpace(54);
    const gap = 8;
    const width = (CONTENT_WIDTH - gap * (items.length - 1)) / items.length;
    items.forEach((item, index) => {
      const x = MARGIN_X + index * (width + gap);
      this.page.drawRectangle({
        x,
        y: this.y - 44,
        width,
        height: 44,
        color: this.color('blueSoft'),
        borderColor: this.color('border'),
        borderWidth: 0.8,
      });
      this.page.drawText(normalizePdfText(item.label).toUpperCase(), {
        x: x + 10,
        y: this.y - 16,
        size: 6.5,
        font: this.bold,
        color: this.color('muted'),
      });
      const value = wrapText(this.bold, item.value || 'N/A', width - 20, 11).slice(0, 1)[0] || 'N/A';
      this.page.drawText(value, {
        x: x + 10,
        y: this.y - 32,
        size: 11,
        font: this.bold,
        color: this.color('text'),
      });
    });
    this.y -= 56;
  }

  sectionTitle(title: string, subtitle?: string) {
    this.ensureSpace(subtitle ? 48 : 34);
    this.page.drawRectangle({
      x: MARGIN_X,
      y: this.y - 19,
      width: 4,
      height: 19,
      color: this.color('blue'),
    });
    this.page.drawText(normalizePdfText(title), {
      x: MARGIN_X + 12,
      y: this.y - 14,
      size: 13,
      font: this.bold,
      color: this.color('text'),
    });
    this.y -= 26;
    if (subtitle) {
      this.text(subtitle, { size: 8.5, color: 'muted', gapAfter: 8 });
    }
  }

  projectHeader(index: number, title: string, meta: string) {
    this.ensureSpace(74);
    this.page.drawRectangle({
      x: MARGIN_X,
      y: this.y - 58,
      width: CONTENT_WIDTH,
      height: 58,
      color: this.color('soft'),
      borderColor: this.color('border'),
      borderWidth: 0.8,
    });
    this.page.drawRectangle({
      x: MARGIN_X,
      y: this.y - 58,
      width: 5,
      height: 58,
      color: this.color('blue'),
    });
    const number = String(index).padStart(2, '0');
    this.page.drawText(number, {
      x: MARGIN_X + 15,
      y: this.y - 25,
      size: 12,
      font: this.bold,
      color: this.color('blue'),
    });
    const titleX = MARGIN_X + 50;
    const titleLines = wrapText(this.bold, title || 'Untitled Project', CONTENT_WIDTH - 66, 12.5).slice(0, 2);
    titleLines.forEach((line, lineIndex) => {
      this.page.drawText(line, {
        x: titleX,
        y: this.y - 20 - lineIndex * 14,
        size: 12.5,
        font: this.bold,
        color: this.color('text'),
      });
    });
    const metaLine = wrapText(
      this.regular,
      meta || 'N/A',
      CONTENT_WIDTH - 66,
      7.5
    ).slice(0, 1)[0] || 'N/A';
    this.page.drawText(metaLine, {
      x: titleX,
      y: this.y - 47,
      size: 7.5,
      font: this.regular,
      color: this.color('muted'),
    });
    this.y -= 70;
  }

  text(value: string, options: TextOptions = {}) {
    const size = options.size ?? 9;
    const weight = options.weight ?? 'regular';
    const color = options.color ?? 'text';
    const x = options.x ?? MARGIN_X;
    const maxWidth = options.maxWidth ?? CONTENT_WIDTH - (x - MARGIN_X);
    const lineHeight = options.lineHeight ?? size * 1.45;
    const gapAfter = options.gapAfter ?? 0;
    const font = this.font(weight);
    const lines = wrapText(font, value || 'N/A', maxWidth, size);
    for (const line of lines) {
      this.ensureSpace(lineHeight + 2);
      if (line) {
        this.page.drawText(line, {
          x,
          y: this.y - size,
          size,
          font,
          color: this.color(color),
        });
      }
      this.y -= lineHeight;
    }
    this.y -= gapAfter;
  }

  label(label: string) {
    this.ensureSpace(22);
    this.page.drawText(normalizePdfText(label).toUpperCase(), {
      x: MARGIN_X,
      y: this.y - 8,
      size: 7,
      font: this.bold,
      color: this.color('blue'),
    });
    this.y -= 17;
  }

  keyValueGrid(items: KeyValue[], columns = 2) {
    if (items.length === 0) return;
    const rows = Math.ceil(items.length / columns);
    const rowHeight = 35;
    this.ensureSpace(rows * rowHeight + 4);
    const columnWidth = CONTENT_WIDTH / columns;
    items.forEach((item, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const x = MARGIN_X + column * columnWidth;
      const y = this.y - row * rowHeight;
      this.page.drawText(normalizePdfText(item.label).toUpperCase(), {
        x,
        y: y - 8,
        size: 6.5,
        font: this.bold,
        color: this.color('muted'),
      });
      const value = wrapText(this.bold, item.value || 'N/A', columnWidth - 10, 9).slice(0, 1)[0] || 'N/A';
      this.page.drawText(value, {
        x,
        y: y - 23,
        size: 9,
        font: this.bold,
        color: this.color('text'),
      });
    });
    this.y -= rows * rowHeight + 4;
  }

  pills(values: string[]) {
    const pills = values.map(normalizePdfText).filter(Boolean);
    if (pills.length === 0) {
      this.text('N/A', { size: 8.5, color: 'muted', gapAfter: 4 });
      return;
    }
    const size = 7.5;
    const height = 20;
    let x = MARGIN_X;
    this.ensureSpace(height + 8);
    for (const value of pills) {
      const width = Math.min(this.bold.widthOfTextAtSize(value, size) + 18, CONTENT_WIDTH);
      if (x + width > MARGIN_X + CONTENT_WIDTH) {
        this.y -= height + 6;
        this.ensureSpace(height + 8);
        x = MARGIN_X;
      }
      this.page.drawRectangle({
        x,
        y: this.y - height + 3,
        width,
        height,
        color: this.color('blueSoft'),
        borderColor: this.pdfLib.rgb(191 / 255, 219 / 255, 254 / 255),
        borderWidth: 0.7,
      });
      const clipped = wrapText(this.bold, value, width - 12, size).slice(0, 1)[0] || 'N/A';
      this.page.drawText(clipped, {
        x: x + 9,
        y: this.y - 10,
        size,
        font: this.bold,
        color: this.color('blue'),
      });
      x += width + 6;
    }
    this.y -= height + 10;
  }

  table(columns: TableColumn[], rows: string[][]) {
    const totalWidth = columns.reduce((sum, column) => sum + column.width, 0);
    if (Math.abs(totalWidth - CONTENT_WIDTH) > 1) {
      throw new Error('PDF table column widths must equal the content width.');
    }
    const cellPadding = 6;
    const bodySize = 7.7;
    const headerHeight = 24;
    const drawHeader = () => {
      this.ensureSpace(headerHeight + 8);
      this.page.drawRectangle({
        x: MARGIN_X,
        y: this.y - headerHeight,
        width: CONTENT_WIDTH,
        height: headerHeight,
        color: this.color('navy'),
      });
      let x = MARGIN_X;
      columns.forEach((column) => {
        this.page.drawText(normalizePdfText(column.label).toUpperCase(), {
          x: x + cellPadding,
          y: this.y - 15,
          size: 6.5,
          font: this.bold,
          color: this.color('white'),
        });
        x += column.width;
      });
      this.y -= headerHeight;
    };

    drawHeader();
    if (rows.length === 0) {
      this.text('No matching records.', { size: 8.5, color: 'muted', x: MARGIN_X + 6, gapAfter: 6 });
      return;
    }

    rows.forEach((row, rowIndex) => {
      const wrapped = columns.map((column, columnIndex) =>
        wrapText(this.regular, row[columnIndex] || 'N/A', column.width - cellPadding * 2, bodySize)
      );
      const lineCount = Math.max(1, ...wrapped.map((lines) => lines.length));
      const rowHeight = Math.max(25, lineCount * 10 + 10);
      if (this.y - rowHeight < BOTTOM_MARGIN) {
        this.addPage();
        drawHeader();
      }
      if (rowIndex % 2 === 1) {
        this.page.drawRectangle({
          x: MARGIN_X,
          y: this.y - rowHeight,
          width: CONTENT_WIDTH,
          height: rowHeight,
          color: this.color('soft'),
        });
      }
      let x = MARGIN_X;
      columns.forEach((column, columnIndex) => {
        const lines = wrapped[columnIndex];
        lines.forEach((line, lineIndex) => {
          const textWidth = this.regular.widthOfTextAtSize(line, bodySize);
          const textX = column.align === 'right'
            ? x + column.width - cellPadding - textWidth
            : x + cellPadding;
          this.page.drawText(line, {
            x: textX,
            y: this.y - 15 - lineIndex * 10,
            size: bodySize,
            font: this.regular,
            color: this.color('text'),
          });
        });
        x += column.width;
      });
      this.page.drawLine({
        start: { x: MARGIN_X, y: this.y - rowHeight },
        end: { x: MARGIN_X + CONTENT_WIDTH, y: this.y - rowHeight },
        thickness: 0.6,
        color: this.color('border'),
      });
      this.y -= rowHeight;
    });
    this.y -= 8;
  }

  divider() {
    this.ensureSpace(18);
    this.page.drawLine({
      start: { x: MARGIN_X, y: this.y - 4 },
      end: { x: MARGIN_X + CONTENT_WIDTH, y: this.y - 4 },
      thickness: 0.8,
      color: this.color('border'),
    });
    this.y -= 18;
  }

  async toBlob() {
    const pages = this.pdfDoc.getPages();
    pages.forEach((page, index) => {
      page.drawLine({
        start: { x: MARGIN_X, y: 33 },
        end: { x: PAGE_WIDTH - MARGIN_X, y: 33 },
        thickness: 0.6,
        color: this.color('border'),
      });
      page.drawText('FYP Portal - generated locally in your browser', {
        x: MARGIN_X,
        y: 19,
        size: 6.5,
        font: this.regular,
        color: this.color('muted'),
      });
      const pageLabel = `Page ${index + 1} of ${pages.length}`;
      const labelWidth = this.regular.widthOfTextAtSize(pageLabel, 6.5);
      page.drawText(pageLabel, {
        x: PAGE_WIDTH - MARGIN_X - labelWidth,
        y: 19,
        size: 6.5,
        font: this.regular,
        color: this.color('muted'),
      });
    });
    const bytes = await this.pdfDoc.save({ useObjectStreams: true });
    const copy = new Uint8Array(bytes.length);
    copy.set(bytes);
    return new Blob([copy.buffer], { type: 'application/pdf' });
  }
}

export const PDF_CONTENT_WIDTH = CONTENT_WIDTH;
