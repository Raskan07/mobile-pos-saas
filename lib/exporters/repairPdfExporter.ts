/**
 * lib/exporters/repairPdfExporter.ts
 *
 * Professional PDF Exporter for Repair Service Job Cards, Estimate Quotes,
 * Warranty Certificates, and Workshop Reports using jsPDF.
 */

import { jsPDF } from "jspdf";
import { RepairTicket, FullRepairTicketDetails } from "../types/repair";

export interface RepairExportOptions {
  shopName: string;
  shopPhone?: string;
  shopAddress?: string;
  generatedBy?: {
    username: string;
    displayName?: string;
    role: string;
  };
}

const fmtCurrency = (val: number) =>
  `$${(val || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── 1. Printable Job Card / Intake Sheet ─────────────────────────────────────

export function generateJobCardPdf(
  bundle: FullRepairTicketDetails,
  options: RepairExportOptions
): jsPDF {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const { ticket } = bundle;
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // Header Banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(margin, y, contentWidth, 22, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text((options.shopName || "DEVICE REPAIR WORKSHOP").toUpperCase(), margin + 5, y + 8);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text(`Official Service Intake Job Card  •  Date: ${ticket.createdAtISO ? ticket.createdAtISO.slice(0, 10) : "Today"}`, margin + 5, y + 14);

  // Ticket badge
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(56, 189, 248); // sky-400
  doc.text(ticket.ticketNumber, pageWidth - margin - 5, y + 11, { align: "right" });

  y += 28;

  // Section 1: Customer & Device Info Grid
  doc.setFillColor(248, 250, 252); // slate-50
  doc.rect(margin, y, contentWidth, 38, "F");
  doc.setDrawColor(226, 232, 240);
  doc.rect(margin, y, contentWidth, 38, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text("CUSTOMER DETAILS", margin + 4, y + 6);
  doc.text("DEVICE SPECIFICATIONS", margin + contentWidth / 2 + 4, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);

  // Left: Customer
  doc.text(`Name: ${ticket.customerName}`, margin + 4, y + 13);
  doc.text(`Phone: ${ticket.customerPhone}`, margin + 4, y + 19);
  if (ticket.customerEmail) doc.text(`Email: ${ticket.customerEmail}`, margin + 4, y + 25);
  doc.text(`Operator: ${ticket.intakeOperator?.displayName || ticket.intakeOperator?.username || "Technician"}`, margin + 4, y + 31);

  // Right: Device
  const rightX = margin + contentWidth / 2 + 4;
  doc.text(`Device: ${ticket.brand} ${ticket.model} (${ticket.deviceType.toUpperCase()})`, rightX, y + 13);
  doc.text(`Color: ${ticket.color || "Standard"}`, rightX, y + 19);
  doc.text(`IMEI / Serial: ${ticket.imei1 || ticket.serialNumber || "N/A"}`, rightX, y + 25);
  doc.text(`Priority: ${ticket.priority.toUpperCase()}   •   Status: ${ticket.status.replace("_", " ").toUpperCase()}`, rightX, y + 31);

  y += 44;

  // Section 2: Reported Faults & Physical Condition
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text("REPORTED FAULTS & SYMPTOMS", margin, y);
  y += 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);

  (ticket.reportedFaults || []).forEach((fault: string, idx: number) => {
    doc.text(`•  ${fault}`, margin + 2, y);
    y += 4.5;
  });

  if (ticket.intakeNotes) {
    doc.text(`Intake Notes: ${ticket.intakeNotes}`, margin + 2, y);
    y += 5;
  }

  y += 3;

  // Condition Table
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text("INTAKE CONDITION ASSESSMENT", margin, y);
  y += 5;

  const cond = ticket.condition || {};
  const condLines = [
    `Screen: ${cond.screenCondition || "Inspected"}`,
    `Housing/Frame: ${cond.frameCondition || "Inspected"}`,
    `Back Glass: ${cond.backGlassCondition || "Inspected"}`,
    `Liquid Indicator: ${cond.liquidDamageIndicator || "Untriggered"}`,
    `Cameras: ${cond.cameraLenses || "Inspected"}`,
    `Buttons: ${cond.buttonsFeel || "Functional"}`,
  ];

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);

  condLines.forEach((line, idx) => {
    const colX = margin + (idx % 3) * (contentWidth / 3);
    const rowY = y + Math.floor(idx / 3) * 5;
    doc.text(`• ${line}`, colX, rowY);
  });

  y += 15;

  // Section 3: Accessories Received
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text("ACCESSORIES HANDED OVER", margin, y);
  y += 5;

  const acc = ticket.accessories || {};
  const accList = [];
  if (acc.simTray) accList.push("SIM Tray");
  if (acc.simCard) accList.push("SIM Card");
  if (acc.sdCard) accList.push("SD Card");
  if (acc.protectiveCase) accList.push("Case/Cover");
  if (acc.chargerAdapter) accList.push("Charger");
  if (acc.chargingCable) accList.push("Cable");
  if (acc.originalBox) accList.push("Box");
  if (acc.otherItems) accList.push(acc.otherItems);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(accList.length > 0 ? accList.join("  •  ") : "Device only (No external accessories)", margin, y);

  y += 12;

  // Section 4: Financial Overview (Estimate & Deposit)
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y, contentWidth, 18, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.text(`Estimated Repair Cost: ${fmtCurrency(ticket.estimatedCost)}`, margin + 6, y + 7);
  doc.text(`Intake Deposit Received: ${fmtCurrency(ticket.depositPaid)}`, margin + 6, y + 13);

  doc.setTextColor(2, 132, 199); // sky-600
  doc.text(`Estimated Balance Due at Pickup: ${fmtCurrency(ticket.balanceDue)}`, margin + contentWidth / 2, y + 10);

  y += 26;

  // Section 5: Terms & Customer Consent Signature
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text("CUSTOMER REPAIR AUTHORIZATION & CONSENT", margin, y);
  y += 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  const termsText =
    "I authorize the repair center to perform inspection, diagnostics, and repairs on this device. I acknowledge that data loss may occur during repair and I am solely responsible for backing up my device. Uncollected devices after 60 days are subject to disposal or lien. Replaced defective parts will be recycled.";
  doc.text(termsText, margin, y, { maxWidth: contentWidth });

  y += 14;

  // Signature Blocks
  doc.setDrawColor(203, 213, 225);
  doc.line(margin + 5, y + 15, margin + 70, y + 15);
  doc.line(pageWidth - margin - 75, y + 15, pageWidth - margin - 10, y + 15);

  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text("Customer Signature", margin + 5, y + 19);
  doc.text("Service Representative Signature", pageWidth - margin - 75, y + 19);

  return doc;
}

// ── 2. Warranty Certificate ──────────────────────────────────────────────────

export function generateWarrantyCertificatePdf(
  bundle: FullRepairTicketDetails,
  options: RepairExportOptions
): jsPDF {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const { ticket, warranties } = bundle;
  const warranty = warranties.length > 0 ? warranties[0] : null;

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // Decorative border
  doc.setDrawColor(56, 189, 248); // sky-400
  doc.setLineWidth(0.8);
  doc.rect(margin - 4, margin - 4, contentWidth + 8, 260, "S");

  // Header Banner
  doc.setFillColor(15, 23, 42);
  doc.rect(margin, y, contentWidth, 32, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text("CERTIFICATE OF REPAIR WARRANTY", margin + contentWidth / 2, y + 12, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(56, 189, 248);
  doc.text(options.shopName || "CERTIFIED DEVICE SERVICE CENTER", margin + contentWidth / 2, y + 20, { align: "center" });

  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(`Warranty ID: ${warranty?.warrantyCode || "WAR-ACTIVE"}   •   Job Ticket: ${ticket.ticketNumber}`, margin + contentWidth / 2, y + 26, { align: "center" });

  y += 44;

  // Device & Customer Block
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y, contentWidth, 35, "F");
  doc.setDrawColor(226, 232, 240);
  doc.rect(margin, y, contentWidth, 35, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text("WARRANTY HOLDER & DEVICE COVERED", margin + 6, y + 7);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);

  doc.text(`Customer Name: ${ticket.customerName}`, margin + 6, y + 15);
  doc.text(`Contact: ${ticket.customerPhone}`, margin + 6, y + 22);
  doc.text(`Device Model: ${ticket.brand} ${ticket.model}`, margin + 6, y + 29);

  const col2X = margin + contentWidth / 2;
  doc.text(`IMEI/Serial: ${ticket.imei1 || ticket.serialNumber || "Verified"}`, col2X, y + 15);
  doc.text(`Duration: ${warranty?.durationDays || 90} Days Guarantee`, col2X, y + 22);
  doc.text(`Valid Until: ${warranty?.expiryDate || "See Receipt"}`, col2X, y + 29);

  y += 45;

  // Terms and Inclusions
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(30, 41, 59);
  doc.text("WARRANTY TERMS & CONDITIONS", margin, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);

  const policy = [
    "1. Coverage: This warranty covers manufacturing defects in parts replaced and technician workmanship during the designated period.",
    "2. Exclusions: Damage caused by accidental drops, pressure cracks, water/liquid intrusion, unauthorized third-party disassembly or software modification voids this warranty immediately.",
    "3. Claim Procedure: The original device and this certificate or receipt number must be presented at our service center for inspection.",
    "4. Resolution: Covered defects will be repaired at zero labor and parts cost. If parts are obsolete, an equivalent replacement or credit note will be issued.",
  ];

  policy.forEach((p) => {
    doc.text(p, margin, y, { maxWidth: contentWidth });
    y += 10;
  });

  y += 15;

  // Stamp / Signatures
  doc.setDrawColor(203, 213, 225);
  doc.line(margin + 10, y + 20, margin + 70, y + 20);
  doc.line(pageWidth - margin - 70, y + 20, pageWidth - margin - 10, y + 20);

  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text("Authorized Workshop Stamp & Sign", margin + 10, y + 25);
  doc.text("Customer Signature", pageWidth - margin - 70, y + 25);

  return doc;
}
