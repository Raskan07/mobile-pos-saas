/**
 * lib/printers/pdfDriver.ts
 *
 * PrinterDriver implementation for Standard Office, Laser, Inkjet,
 * and continuous POS thermal printers outputting standard PDF sheets and rolls.
 */

import { buildBarcodePdf, triggerDirectPrint, downloadBarcodePdf } from "@/lib/utils/barcodePdfGenerator";
import { PrinterDriver, PrinterOutput, LabelRenderPayload } from "./types";

export class PdfPrinterDriver implements PrinterDriver {
  readonly id = "standard_pdf";
  readonly name = "Standard Office & Desktop (PDF Sheets / Rolls)";
  readonly type = "pdf" as const;
  readonly fileExtension = "pdf";

  generate(payload: LabelRenderPayload): PrinterOutput {
    const { tasks, config, shopDisplayName } = payload;
    const doc = buildBarcodePdf(tasks, config, shopDisplayName);
    const blob = doc.output("blob");
    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `barcode_labels_${dateStr}.pdf`;

    const totalLabels = tasks.reduce((sum, t) => sum + Math.max(1, t.quantity), 0);

    return {
      type: "pdf",
      blob,
      fileName,
      metadata: {
        totalLabels,
        language: "PDF (300 DPI Vector)",
      },
    };
  }

  download(output: PrinterOutput): void {
    if (!output.blob) return;
    const url = URL.createObjectURL(output.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = output.fileName || "barcodes.pdf";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  }

  print(output: PrinterOutput): void {
    if (!output.blob) return;
    // Direct browser iframe print
    const blobUrl = URL.createObjectURL(output.blob);
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.top = "-9999px";
    iframe.style.left = "-9999px";
    iframe.style.width = "1px";
    iframe.style.height = "1px";
    iframe.style.opacity = "0.01";
    iframe.src = blobUrl;
    document.body.appendChild(iframe);

    iframe.onload = () => {
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (e) {
          console.warn("Direct iframe print blocked, opening window:", e);
          window.open(blobUrl, "_blank")?.focus();
        } finally {
          setTimeout(() => {
            document.body.removeChild(iframe);
            URL.revokeObjectURL(blobUrl);
          }, 60000);
        }
      }, 250);
    };
  }
}

export const pdfPrinterDriver = new PdfPrinterDriver();
