/**
 * lib/exporters/repairExcelExporter.ts
 *
 * Enterprise Excel (.xlsx) Exporter for Repair Tickets & Workshop Operations using SheetJS (xlsx).
 */

import * as XLSX from "xlsx";
import { RepairTicket } from "../types/repair";
import { RepairExportOptions } from "./repairPdfExporter";

export function downloadRepairExcel(
  tickets: RepairTicket[],
  options: RepairExportOptions,
  filename?: string
): void {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Repair Tickets Master Summary ──
  const ticketRows = tickets.map((t) => {
    return {
      "Ticket #": t.ticketNumber,
      "Intake Date": t.createdAtISO ? t.createdAtISO.slice(0, 16).replace("T", " ") : "",
      Status: t.status.replace("_", " ").toUpperCase(),
      Priority: t.priority.toUpperCase(),
      "Customer Name": t.customerName,
      "Customer Phone": t.customerPhone,
      "Customer Email": t.customerEmail || "",
      "Device Type": t.deviceType.toUpperCase(),
      Brand: t.brand,
      Model: t.model,
      Color: t.color || "",
      "IMEI / Serial": t.imei1 || t.serialNumber || "",
      "Reported Faults": (t.reportedFaults || []).join(", "),
      "Assigned Technician": t.assignedTechnicianName || "Unassigned",
      "Estimated Cost (LKR)": Number(t.estimatedCost || 0).toFixed(2),
      "Deposit Paid (LKR)": Number(t.depositPaid || 0).toFixed(2),
      "Total Paid (LKR)": Number(t.totalPaid || 0).toFixed(2),
      "Balance Due (LKR)": Number(t.balanceDue || 0).toFixed(2),
      "Invoice #": t.finalInvoiceNumber || "Pending",
      "Is Warranty Rework": t.isWarrantyRework ? "YES" : "NO",
      Operator: t.intakeOperator?.displayName || t.intakeOperator?.username || "",
      Notes: t.intakeNotes || "",
    };
  });

  const wsTickets = XLSX.utils.json_to_sheet(ticketRows);

  wsTickets["!cols"] = [
    { wch: 18 }, // Ticket #
    { wch: 18 }, // Date
    { wch: 16 }, // Status
    { wch: 12 }, // Priority
    { wch: 20 }, // Customer
    { wch: 16 }, // Phone
    { wch: 22 }, // Email
    { wch: 14 }, // Device Type
    { wch: 14 }, // Brand
    { wch: 22 }, // Model
    { wch: 12 }, // Color
    { wch: 20 }, // IMEI
    { wch: 30 }, // Faults
    { wch: 20 }, // Technician
    { wch: 16 }, // Cost
    { wch: 16 }, // Deposit
    { wch: 16 }, // Paid
    { wch: 16 }, // Balance
    { wch: 18 }, // Invoice
    { wch: 14 }, // Warranty Rework
    { wch: 16 }, // Operator
    { wch: 30 }, // Notes
  ];

  XLSX.utils.book_append_sheet(wb, wsTickets, "Repair Tickets");

  // ── Sheet 2: Workshop Financial Analytics Summary ──
  const totalTickets = tickets.length;
  const activeCount = tickets.filter(
    (t) => !["collected", "cancelled", "irreparable", "customer_declined"].includes(t.status)
  ).length;
  const collectedCount = tickets.filter((t) => t.status === "collected").length;
  const totalRevenue = tickets.reduce((sum, t) => sum + (t.totalPaid || 0), 0);
  const totalBalanceDue = tickets.reduce((sum, t) => sum + (t.balanceDue || 0), 0);
  const warrantyReworkCount = tickets.filter((t) => t.isWarrantyRework).length;

  const summaryData = [
    { Metric: "Total Intake Tickets", Value: totalTickets },
    { Metric: "Active Jobs In Workshop", Value: activeCount },
    { Metric: "Completed & Collected Devices", Value: collectedCount },
    { Metric: "Warranty Rework Jobs", Value: warrantyReworkCount },
    { Metric: "Total Revenue Collected (LKR)", Value: totalRevenue.toFixed(2) },
    { Metric: "Total Outstanding Balance Due (LKR)", Value: totalBalanceDue.toFixed(2) },
  ];

  const wsSummary = XLSX.utils.json_to_sheet(summaryData);
  wsSummary["!cols"] = [{ wch: 35 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Financial Summary");

  // Output file
  const outName =
    filename || `Repair_Workshop_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, outName);
}
