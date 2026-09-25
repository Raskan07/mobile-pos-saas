/**
 * lib/printers/printerRegistry.ts
 *
 * Central registry and dispatcher for all label printer drivers.
 * Keeps UI components agnostic of driver implementations, so future
 * printers (Zebra, TSC, Citizen, Godex, Brother, Star, Epson) can be added cleanly.
 */

import { PrinterDriver, PrinterProfile, PrinterType, LabelRenderPayload, PrinterOutput } from "./types";
import { pdfPrinterDriver } from "./pdfDriver";
import { zplPrinterDriver } from "./zplDriver";
import { tsplPrinterDriver } from "./tsplDriver";

export const PRINTER_PROFILES: Record<string, PrinterProfile> = {
  standard_pdf: {
    id: "standard_pdf",
    name: "Standard Desktop / Office Printer (PDF)",
    type: "pdf",
    description: "Generates multi-label A4 grid sheets (60/24/44 labels) or continuous rolls for laser, inkjet, and general printers.",
    supportedDpis: [300],
    defaultDpi: 300,
    connectionNotes: "Uses browser native print dialog or PDF download. No driver install required.",
    fileExtension: "pdf",
  },
  zebra_zpl: {
    id: "zebra_zpl",
    name: "Zebra Direct Thermal (ZPL II)",
    type: "zpl",
    description: "Outputs high-speed raw ZPL commands for Zebra ZD410/420, GX420, ZT230, and compatible barcode printers.",
    supportedDpis: [203, 300],
    defaultDpi: 203,
    connectionNotes: "Direct spooling via raw port 9100, USB Generic Text, or Zebra Browser Print.",
    fileExtension: "zpl",
  },
  tsc_tspl: {
    id: "tsc_tspl",
    name: "TSC Direct Thermal (TSPL / TSPL2)",
    type: "tspl",
    description: "Outputs optimized TSPL-II commands for TSC TE200/244, TTP-244, DA200, ME240, and Gprinter barcode printers.",
    supportedDpis: [203, 300],
    defaultDpi: 203,
    connectionNotes: "Direct spooling via raw USB, COM, or Network print spooler (.prn file).",
    fileExtension: "prn",
  },
};

const DRIVER_REGISTRY: Record<string, PrinterDriver> = {
  standard_pdf: pdfPrinterDriver,
  zebra_zpl: zplPrinterDriver,
  tsc_tspl: tsplPrinterDriver,
};

export function getPrinterDriver(printerIdOrType: string): PrinterDriver {
  if (DRIVER_REGISTRY[printerIdOrType]) {
    return DRIVER_REGISTRY[printerIdOrType];
  }

  // Fallback by type
  if (printerIdOrType === "zpl") return zplPrinterDriver;
  if (printerIdOrType === "tspl") return tsplPrinterDriver;
  return pdfPrinterDriver;
}

export function getAllPrinterProfiles(): PrinterProfile[] {
  return Object.values(PRINTER_PROFILES);
}

export function renderLabelsForPrinter(
  printerId: string,
  payload: LabelRenderPayload
): Promise<PrinterOutput> | PrinterOutput {
  const driver = getPrinterDriver(printerId);
  return driver.generate(payload);
}
