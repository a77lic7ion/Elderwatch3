// ============================================================================
// Daily check-in report (PDF) — one page per day, generated on demand
// ============================================================================
// "Checked in today?" for every resident of a home, with the status cells
// coloured green (Yes) / red (No). Built from the residents the admin panel
// already holds in state, so it needs no extra reads and works offline.
//
// Kept in lib/ (not inline in AdminPanel) so the exact same code path can be
// run and tested outside the browser.

type JsPdfDoc = InstanceType<typeof import('jspdf').jsPDF>;

export interface DailyReportResident {
  name: string;
  roomNumber?: string;
  unitNumber?: string;
  todayStatus?: string;
  isAway?: boolean;
}

export interface DailyReportOptions {
  homeName: string;
  /** SAST calendar date, YYYY-MM-DD */
  date: string;
  residents: DailyReportResident[];
  generatedAt?: Date;
}

const COLORS = {
  emerald: [21, 122, 76] as [number, number, number],
  red: [197, 48, 48] as [number, number, number],
  ink: [18, 24, 21] as [number, number, number],
  muted: [110, 120, 115] as [number, number, number],
  line: [222, 226, 224] as [number, number, number],
};

/** A resident counts as checked in only when today's status is 'ok'. */
export function isCheckedIn(status?: string): boolean {
  return status === 'ok';
}

/** Room first (every resident has one), unit appended when the record has it. */
export function unitLabel(resident: DailyReportResident): string {
  const room = (resident.roomNumber ?? '').toString().trim();
  const unit = (resident.unitNumber ?? '').toString().trim();
  if (room && unit) return `${room} / ${unit}`;
  return room || unit || '—';
}

function formatLongDate(date: string): string {
  try {
    return new Intl.DateTimeFormat('en-ZA', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${date}T00:00:00Z`));
  } catch {
    return date;
  }
}

function formatStamp(d: Date): string {
  try {
    return new Intl.DateTimeFormat('en-ZA', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Africa/Johannesburg',
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

export function dailyReportFileName(homeName: string, date: string): string {
  return `ElderWatch_Daily_${homeName.replace(/[^a-zA-Z0-9]+/g, '_')}_${date}.pdf`;
}

/** Build the PDF. Returns the jsPDF document so the caller decides how to save it. */
export async function buildDailyReportPdf(options: DailyReportOptions): Promise<JsPdfDoc> {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const { homeName, date, residents } = options;
  const generatedAt = options.generatedAt || new Date();

  const rows = [...residents].sort((a, b) =>
    String(a.roomNumber ?? '').localeCompare(String(b.roomNumber ?? ''), undefined, { numeric: true }) ||
    a.name.localeCompare(b.name)
  );

  const checkedIn = rows.filter((r) => isCheckedIn(r.todayStatus)).length;
  const notCheckedIn = rows.length - checkedIn;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Header band
  doc.setFillColor(...COLORS.emerald);
  doc.rect(0, 0, 210, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(17);
  doc.setFont('helvetica', 'bold');
  doc.text('Daily Check-In Report', 14, 13);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(homeName, 14, 20);

  // Date + summary
  doc.setTextColor(...COLORS.ink);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(formatLongDate(date), 14, 36);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.muted);
  doc.text(
    `Checked in: ${checkedIn} of ${rows.length}    •    Not checked in: ${notCheckedIn}`,
    14,
    43
  );

  const body = rows.map((r) => [r.name || '—', unitLabel(r), isCheckedIn(r.todayStatus) ? 'Yes' : 'No']);

  // Column widths as a share of the printable width, with the margins declared
  // explicitly so autotable never has to clip or warn about overflow.
  const PAGE_MARGIN = 14;
  const printable = doc.internal.pageSize.getWidth() - PAGE_MARGIN * 2;
  const colWidths = [printable * 0.46, printable * 0.27, printable * 0.27];

  (autoTable as any)(doc, {
    startY: 49,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    head: [['Name', 'Room / Unit', 'Checked in']],
    body,
    theme: 'grid',
    styles: { fontSize: 10, cellPadding: 2.4, lineColor: COLORS.line, lineWidth: 0.2, textColor: COLORS.ink },
    headStyles: { fillColor: COLORS.emerald, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'left' },
    columnStyles: {
      0: { cellWidth: colWidths[0] },
      1: { cellWidth: colWidths[1] },
      2: { cellWidth: colWidths[2], halign: 'center', fontStyle: 'bold', textColor: [255, 255, 255] },
    },
    // Colour the verdict cell itself: green = checked in, red = not.
    didParseCell: (data: any) => {
      if (data.section !== 'body' || data.column.index !== 2) return;
      data.cell.styles.fillColor = data.cell.raw === 'Yes' ? COLORS.emerald : COLORS.red;
    },
    didDrawPage: () => {
      const page = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(...COLORS.muted);
      doc.text(`Generated ${formatStamp(generatedAt)} by ElderWatch`, 14, 290);
      doc.text(`Page ${page}`, 196, 290, { align: 'right' });
    },
  });

  // Legend so a printed page explains itself
  const endY = Math.min(((doc as any).lastAutoTable?.finalY || 60) + 10, 278);
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.muted);
  doc.text('Yes = resident checked in today.    No = no check-in recorded by report time.', 14, endY);

  return doc;
}
