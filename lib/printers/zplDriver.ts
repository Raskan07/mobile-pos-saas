/**
 * lib/printers/zplDriver.ts
 *
 * PrinterDriver implementation for Zebra Thermal / Thermal Transfer Printers (ZPL II).
 * Compatible with Zebra ZD410, ZD420, ZD620, GX420, ZT230, ZT410 and compatible emulators.
 *
 * Converts millimeter label dimensions to dots based on 203 DPI (8 dots/mm)
 * or 300 DPI (11.8 dots/mm).
 */

import { PAPER_PRESETS } from "@/lib/utils/barcodePdfGenerator";
import { PrinterDriver, PrinterOutput, LabelRenderPayload } from "./types";

export class ZplPrinterDriver implements PrinterDriver {
  readonly id = "zebra_zpl";
  readonly name = "Zebra Direct Thermal (ZPL II)";
  readonly type = "zpl" as const;
  readonly fileExtension = "zpl";

  generate(payload: LabelRenderPayload): PrinterOutput {
    const { tasks, config, shopDisplayName } = payload;
    const dpi = config.printerDpi === 300 ? 300 : 203;
    // 203 DPI = 8 dots/mm, 300 DPI = 11.81 dots/mm
    const dotsPerMm = dpi === 300 ? 11.81 : 8.0;

    const preset = PAPER_PRESETS[config.paperPreset] || PAPER_PRESETS.thermal_50x30;
    const widthMm = config.customWidthMm && config.customWidthMm > 10 ? config.customWidthMm : preset.labelWidthMm;
    const heightMm = config.customHeightMm && config.customHeightMm > 10 ? config.customHeightMm : preset.labelHeightMm;

    const widthDots = Math.round(widthMm * dotsPerMm);
    const heightDots = Math.round(heightMm * dotsPerMm);

    let zpl = "";

    tasks.forEach((task) => {
      const { item, quantity } = task;
      const qty = Math.max(1, quantity);
      const code = (item.barcode || item.sku || "00000000").trim();
      const shopTitle = (config.customShopName || shopDisplayName).trim().toUpperCase();

      // Start Format
      zpl += "^XA\n";
      zpl += `^PW${widthDots}\n`;
      zpl += `^LL${heightDots}\n`;
      zpl += "^LH0,0\n";

      // Darkness / Print speed if configured
      if (config.printerDarkness !== undefined) {
        zpl += `^MD${Math.min(30, Math.max(0, config.printerDarkness))}\n`;
      }

      let yPos = Math.round(15 * (dpi / 203));

      // 1. Shop Name
      if (config.showShopName && shopTitle) {
        const fontH = Math.round(20 * (dpi / 203));
        const fontW = Math.round(18 * (dpi / 203));
        zpl += `^FO10,${yPos}^FB${widthDots - 20},1,0,C^A0N,${fontH},${fontW}^FD${escapeZpl(shopTitle)}^FS\n`;
        yPos += Math.round(26 * (dpi / 203));
      }

      // 2. Barcode (Code 128) - Clean Hero
      const bcHeight = Math.max(50, Math.round(heightDots * 0.44));
      const bcWidthRatio = widthDots > 400 ? 3 : 2;
      zpl += `^BY${bcWidthRatio},3,${bcHeight}\n`;
      // Center barcode offset approx
      const bcX = Math.max(20, Math.round((widthDots - code.length * 16 * (dpi / 203)) / 2));
      zpl += `^FO${bcX},${yPos}^BCN,${bcHeight},Y,N,N^FD${code}^FS\n`;
      yPos += bcHeight + Math.round(24 * (dpi / 203));

      // 4. SKU & Price / Category footer
      const fontFooterH = Math.round(20 * (dpi / 203));
      const fontFooterW = Math.round(18 * (dpi / 203));

      if (config.showSku && config.showPrice) {
        zpl += `^FO15,${yPos}^A0N,${fontFooterH},${fontFooterW}^FDSKU: ${escapeZpl(item.sku)}^FS\n`;
        const priceStr = `${config.currencySymbol || "Rs."} ${item.sellingPrice.toLocaleString()}`;
        zpl += `^FO${Math.round(widthDots / 2)},${yPos}^FB${Math.round(widthDots / 2) - 15},1,0,R^A0N,${Math.round(fontFooterH * 1.15)},${Math.round(fontFooterW * 1.15)}^FD${priceStr}^FS\n`;
      } else if (config.showPrice) {
        const priceStr = `${config.currencySymbol || "Rs."} ${item.sellingPrice.toLocaleString()}`;
        zpl += `^FO10,${yPos}^FB${widthDots - 20},1,0,C^A0N,${Math.round(fontFooterH * 1.2)},${Math.round(fontFooterW * 1.2)}^FD${priceStr}^FS\n`;
      } else if (config.showSku) {
        zpl += `^FO10,${yPos}^FB${widthDots - 20},1,0,C^A0N,${fontFooterH},${fontFooterW}^FDSKU: ${escapeZpl(item.sku)}^FS\n`;
      }

      // Quantity command
      zpl += `^PQ${qty},0,1,Y\n`;
      zpl += "^XZ\n\n";
    });

    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `zebra_labels_${dateStr}.zpl`;
    const blob = new Blob([zpl], { type: "text/plain;charset=utf-8" });
    const totalLabels = tasks.reduce((sum, t) => sum + Math.max(1, t.quantity), 0);

    return {
      type: "zpl",
      rawContent: zpl,
      blob,
      fileName,
      metadata: {
        totalLabels,
        dpi,
        language: `Zebra ZPL-II (${dpi} DPI)`,
      },
    };
  }

  download(output: PrinterOutput): void {
    if (!output.blob) return;
    const url = URL.createObjectURL(output.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = output.fileName || "zebra_labels.zpl";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  }

  async print(output: PrinterOutput): Promise<void> {
    // If Browser Print / Zebra Web Print is available, it can be called here.
    // For general web browser, we copy raw commands to clipboard or prompt user.
    if (typeof navigator !== "undefined" && navigator.clipboard && output.rawContent) {
      try {
        await navigator.clipboard.writeText(output.rawContent);
      } catch (err) {
        console.warn("Could not copy ZPL to clipboard:", err);
      }
    }
  }
}

function escapeZpl(text: string): string {
  return (text || "").replace(/[\^~]/g, "");
}

export const zplPrinterDriver = new ZplPrinterDriver();
