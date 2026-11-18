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
  `LKR ${(val || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

// ── 3. Customer Final Billing Receipt / Invoice PDF (Customer-Safe) ──────────

export function generateFinalBillingPdf(
  bundle: FullRepairTicketDetails,
  options: RepairExportOptions
): jsPDF {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const { ticket, estimates, partsUsage, payments, warranties } = bundle;
  const warranty = warranties.length > 0 ? warranties[0] : null;
  const latestEstimate = estimates[0] || null;

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // Header Banner
  doc.setFillColor(15, 23, 42);
  doc.rect(margin, y, contentWidth, 24, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text((options.shopName || "DEVICE REPAIR WORKSHOP").toUpperCase(), margin + 5, y + 9);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(148, 163, 184);
  const contactLine = [options.shopAddress, options.shopPhone ? `Tel: ${options.shopPhone}` : ""]
    .filter(Boolean)
    .join("  •  ");
  doc.text(
    contactLine || `FINAL REPAIR BILLING RECEIPT  •  Date: ${new Date().toISOString().slice(0, 10)}`,
    margin + 5,
    y + 15
  );
  doc.text(
    `Invoice #: ${ticket.finalInvoiceNumber || `INV-${ticket.ticketNumber.slice(4)}`}  •  Ticket #: ${ticket.ticketNumber}`,
    margin + 5,
    y + 20
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(52, 211, 153); // emerald-400
  doc.text("FINAL BILLING RECEIPT", pageWidth - margin - 5, y + 13, { align: "right" });

  y += 30;

  // Customer & Device Info
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y, contentWidth, 30, "F");
  doc.setDrawColor(226, 232, 240);
  doc.rect(margin, y, contentWidth, 30, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.text("BILLED TO (CUSTOMER)", margin + 4, y + 6);
  doc.text("REPAIRED DEVICE", margin + contentWidth / 2 + 4, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(`Customer: ${ticket.customerName}`, margin + 4, y + 13);
  doc.text(`Phone: ${ticket.customerPhone}`, margin + 4, y + 19);
  if (ticket.customerEmail) doc.text(`Email: ${ticket.customerEmail}`, margin + 4, y + 25);

  const rightX = margin + contentWidth / 2 + 4;
  doc.text(`Device: ${ticket.brand} ${ticket.model}`, rightX, y + 13);
  doc.text(`IMEI / Serial: ${ticket.imei1 || ticket.serialNumber || "N/A"}`, rightX, y + 19);
  doc.text(`Status: ${ticket.status.replace(/_/g, " ").toUpperCase()}`, rightX, y + 25);

  y += 37;

  // Itemized Charges (Strictly Selling Prices & Service Charges only — NO internal costs)
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y, contentWidth, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text("DESCRIPTION (REPLACEMENT COMPONENTS & SERVICE CHARGES)", margin + 3, y + 5.5);
  doc.text("QTY", pageWidth - margin - 45, y + 5.5, { align: "right" });
  doc.text("AMOUNT (LKR)", pageWidth - margin - 3, y + 5.5, { align: "right" });

  y += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);

  const customerLines: { desc: string; qty: number; total: number }[] = [];
  const sourceItems =
    latestEstimate && latestEstimate.items.length > 0
      ? latestEstimate.items
      : ticket.intakeLineItems || [];
  const hasServiceFeeInSource = sourceItems.some((it) => it.type === "service_fee");

  if (sourceItems.length > 0) {
    sourceItems.forEach((it) => {
      customerLines.push({
        desc: `${it.description} (${it.type === "part" ? "Replacement Component" : "Service / Labour Charge"})`,
        qty: it.quantity || 1,
        total: it.totalPrice,
      });
    });

    partsUsage
      .filter((p) => p.status !== "returned_to_stock")
      .forEach((p) => {
        const alreadyListed = customerLines.some((c) =>
          c.desc.toLowerCase().includes(p.productName.toLowerCase())
        );
        if (!alreadyListed) {
          customerLines.push({
            desc: `${p.productName} (Replacement Component)`,
            qty: p.quantity,
            total: p.unitSellingPrice * p.quantity,
          });
        }
      });
  } else if (partsUsage.filter((p) => p.status !== "returned_to_stock").length > 0) {
    partsUsage
      .filter((p) => p.status !== "returned_to_stock")
      .forEach((p) => {
        const lineTotal = p.unitSellingPrice * p.quantity;
        customerLines.push({
          desc: `${p.productName} (Replacement Component)`,
          qty: p.quantity,
          total: lineTotal,
        });
      });
  } else if ((ticket.estimatedCost || 0) > 0) {
    customerLines.push({
      desc: `Repair Service & Components: ${(ticket.reportedFaults || []).join(", ") || `${ticket.brand} ${ticket.model}`}`,
      qty: 1,
      total: (ticket.estimatedCost || 0) + (ticket.discountAmount || 0),
    });
  }

  const alreadyHasServiceCharge =
    hasServiceFeeInSource ||
    customerLines.some(
      (l) =>
        Math.abs(l.total - (ticket.serviceChargeAmount || 0)) < 0.01 ||
        l.desc.toLowerCase().includes("labor") ||
        l.desc.toLowerCase().includes("labour") ||
        l.desc.toLowerCase().includes("service fee") ||
        l.desc.toLowerCase().includes("service charge")
    );

  if (ticket.serviceChargeAmount && ticket.serviceChargeAmount > 0 && !alreadyHasServiceCharge) {
    customerLines.push({
      desc: "Service / Labour Charge",
      qty: 1,
      total: ticket.serviceChargeAmount,
    });
  }

  if (ticket.additionalCharges && ticket.additionalCharges > 0) {
    customerLines.push({
      desc: "Additional Service / Express Workshop Charges",
      qty: 1,
      total: ticket.additionalCharges,
    });
  }

  const discount = ticket.discountAmount || latestEstimate?.discountAmount || 0;

  customerLines.forEach((line) => {
    doc.text(line.desc.slice(0, 82), margin + 3, y);
    doc.text(String(line.qty), pageWidth - margin - 45, y, { align: "right" });
    doc.text(fmtCurrency(line.total), pageWidth - margin - 3, y, { align: "right" });
    doc.setDrawColor(241, 245, 249);
    doc.line(margin, y + 2, pageWidth - margin, y + 2);
    y += 7;
  });

  y += 4;

  // Totals Summary Box
  const rawSub = customerLines.reduce((s, l) => s + l.total, 0);
  const finalPayable = Math.max(0, rawSub - discount);
  const amountPaid = ticket.totalPaid || 0;
  const balanceDue = Math.max(0, finalPayable - amountPaid);
  const lastPayMethod = payments.length > 0 ? payments[0].paymentMethod.toUpperCase() : "CASH";

  doc.setFillColor(248, 250, 252);
  doc.rect(margin + contentWidth / 2 - 10, y, contentWidth / 2 + 10, 38, "F");
  doc.setDrawColor(226, 232, 240);
  doc.rect(margin + contentWidth / 2 - 10, y, contentWidth / 2 + 10, 38, "S");

  const labelX = margin + contentWidth / 2 - 5;
  const valX = pageWidth - margin - 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text("Subtotal:", labelX, y + 6);
  doc.text(fmtCurrency(rawSub), valX, y + 6, { align: "right" });

  doc.text("Discounts:", labelX, y + 12);
  doc.text(`- ${fmtCurrency(discount)}`, valX, y + 12, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text("Final Payable Amount:", labelX, y + 19);
  doc.text(fmtCurrency(finalPayable), valX, y + 19, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(16, 185, 129);
  doc.text(`Amount Paid (${lastPayMethod}):`, labelX, y + 26);
  doc.text(fmtCurrency(amountPaid), valX, y + 26, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setTextColor(balanceDue > 0 ? 217 : 15, balanceDue > 0 ? 119 : 23, balanceDue > 0 ? 6 : 42);
  doc.text("Outstanding Balance:", labelX, y + 33);
  doc.text(fmtCurrency(balanceDue), valX, y + 33, { align: "right" });

  y += 46;

  // Warranty Information & Terms
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.text("WARRANTY INFORMATION & TERMS", margin, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  if (warranty) {
    doc.text(
      `Warranty Code: ${warranty.warrantyCode}  •  Coverage: ${warranty.durationDays} Days (Valid ${warranty.startDate} to ${warranty.expiryDate})`,
      margin,
      y
    );
    y += 4.5;
    doc.text(warranty.terms, margin, y, { maxWidth: contentWidth });
    y += 9;
  } else {
    doc.text(
      "Standard 90-Day Service & Replacement Component Warranty applies from date of collection. Excludes physical drop or liquid damage.",
      margin,
      y,
      { maxWidth: contentWidth }
    );
    y += 7;
  }

  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(
    "Thank you for choosing our workshop! Please retain this receipt for warranty verification.",
    margin,
    y + 4
  );

  return doc;
}
