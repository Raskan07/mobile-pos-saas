/**
 * lib/printers/types.ts
 *
 * Pluggable architecture for label printing.
 * Allows seamless generation and dispatch to:
 * 1. Standard Desktop / Office Printers (PDF sheets & continuous rolls)
 * 2. Zebra Direct Thermal / Thermal Transfer (ZPL II)
 * 3. TSC Direct Thermal / Thermal Transfer (TSPL / TSPL2)
 *
 * Future printers (e.g. ESC/POS, EPL, Brother) can implement `PrinterDriver`
 * without touching UI or business logic components.
 */

import { BarcodeItem, LabelConfig } from "@/lib/types/barcode";

export type PrinterType = "pdf" | "zpl" | "tspl";

export interface PrintableTask {
  item: BarcodeItem;
  quantity: number;
}

export interface LabelRenderPayload {
  tasks: PrintableTask[];
  config: LabelConfig;
  shopDisplayName: string;
}

export interface PrinterOutput {
  type: PrinterType;
  /** Raw printable code or text representation (ZPL string, TSPL string, or description for PDF) */
  rawContent?: string;
  /** Blob representing the generated document or payload (PDF Blob or text/plain blob for raw files) */
  blob?: Blob;
  /** File name suggestion for downloading (e.g. barcodes_123.pdf or labels_123.zpl) */
  fileName: string;
  /** Additional printer meta for logging or UI feedback */
  metadata?: {
    totalLabels: number;
    dpi?: number;
    language?: string;
  };
}

export interface PrinterProfile {
  id: string;
  name: string;
  type: PrinterType;
  description: string;
  supportedDpis: number[];
  defaultDpi: number;
  connectionNotes: string;
  fileExtension: string;
}

export interface PrinterDriver {
  readonly id: string;
  readonly name: string;
  readonly type: PrinterType;
  readonly fileExtension: string;

  /** Generate raw output (PDF Blob, ZPL instructions, or TSPL instructions) */
  generate(payload: LabelRenderPayload): Promise<PrinterOutput> | PrinterOutput;

  /** Download generated document to user's local disk */
  download(output: PrinterOutput): void;

  /** Optional direct-print handler (e.g. browser print iframe or Web Zebra / Network socket) */
  print?(output: PrinterOutput): Promise<void> | void;
}
