/**
 * lib/printers/tsplDriver.ts
 *
 * PrinterDriver implementation for TSC Direct Thermal & Thermal Transfer Printers (TSPL / TSPL2).
 * Compatible with TSC TE200, TE244, TTP-244, DA200, ME240, Gprinter and compatible hardware.
 */

import { PAPER_PRESETS } from "@/lib/utils/barcodePdfGenerator";
import { PrinterDriver, PrinterOutput, LabelRenderPayload } from "./types";

export class TsplPrinterDriver implements PrinterDriver {
  readonly id = "tsc_tspl";
  readonly name = "TSC Direct Thermal (TSPL / TSPL2)";
  readonly type = "tspl" as const;
  readonly fileExtension = "prn";

  generate(payload: LabelRenderPayload): PrinterOutput {
    const { tasks, config, shopDisplayName } = payload;
    const dpi = config.printerDpi === 300 ? 300 : 203;
    const dotsPerMm = dpi === 300 ? 11.81 : 8.0;

    const preset = PAPER_PRESETS[config.paperPreset] || PAPER_PRESETS.thermal_50x30;
    const widthMm = config.customWidthMm && config.customWidthMm > 10 ? config.customWidthMm : preset.labelWidthMm;
    const heightMm = config.customHeightMm && config.customHeightMm > 10 ? config.customHeightMm : preset.labelHeightMm;

    const widthDots = Math.round(widthMm * dotsPerMm);

    let tspl = "";

    tasks.forEach((task) => {
      const { item, quantity } = task;
      const qty = Math.max(1, quantity);
      const code = (item.barcode || item.sku || "00000000").trim();
      const shopTitle = (config.customShopName || shopDisplayName).trim().toUpperCase();

      tspl += `SIZE ${widthMm} mm, ${heightMm} mm\r\n`;
      tspl += `GAP 3 mm, 0 mm\r\n`;
      tspl += `DIRECTION 1\r\n`;
      tspl += `CLS\r\n`;

      if (config.printerDarkness !== undefined) {
        tspl += `DENSITY ${Math.min(15, Math.max(1, Math.round(config.printerDarkness / 2)))}\r\n`;
      }

      let yPos = Math.round(15 * (dpi / 203));

      // 1. Shop Name
      if (config.showShopName && shopTitle) {
        const xPos = Math.max(20, Math.round((widthDots - shopTitle.length * 12 * (dpi / 203)) / 2));
        tspl += `TEXT ${xPos},${yPos},"2",0,1,1,"${escapeTspl(shopTitle)}"\r\n`;
        yPos += Math.round(26 * (dpi / 203));
      }

      // 2. Barcode (Code 128) - Clean Hero
      const bcHeight = Math.max(45, Math.round(heightMm * dotsPerMm * 0.44));
      const bcX = Math.max(25, Math.round((widthDots - code.length * 14 * (dpi / 203)) / 2));
      tspl += `BARCODE ${bcX},${yPos},"128",${bcHeight},1,0,2,2,"${code}"\r\n`;
      yPos += bcHeight + Math.round(24 * (dpi / 203));

      // 4. SKU & Price
      const hasSku = config.showSku && Boolean(item.sku);
      const hasPrice = config.showPrice;

      if (hasSku && hasPrice) {
        tspl += `TEXT 20,${yPos},"2",0,1,1,"SKU: ${escapeTspl(item.sku)}"\r\n`;
        const priceStr = `${config.currencySymbol || "Rs."} ${item.sellingPrice.toLocaleString()}`;
        const priceX = widthDots - priceStr.length * 14 * (dpi / 203) - 20;
        tspl += `TEXT ${Math.max(20, priceX)},${yPos},"3",0,1,1,"${priceStr}"\r\n`;
      } else if (hasPrice) {
        const priceStr = `${config.currencySymbol || "Rs."} ${item.sellingPrice.toLocaleString()}`;
        const priceX = Math.max(20, Math.round((widthDots - priceStr.length * 14 * (dpi / 203)) / 2));
        tspl += `TEXT ${priceX},${yPos},"3",0,1,1,"${priceStr}"\r\n`;
      } else if (hasSku) {
        tspl += `TEXT 20,${yPos},"2",0,1,1,"SKU: ${escapeTspl(item.sku)}"\r\n`;
      }

      // Print command: PRINT <sets>, <copies>
      tspl += `PRINT ${qty},1\r\n\r\n`;
    });

    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `tsc_labels_${dateStr}.prn`;
    const blob = new Blob([tspl], { type: "text/plain;charset=utf-8" });
    const totalLabels = tasks.reduce((sum, t) => sum + Math.max(1, t.quantity), 0);

    return {
      type: "tspl",
      rawContent: tspl,
      blob,
      fileName,
      metadata: {
        totalLabels,
        dpi,
        language: `TSC TSPL-II (${dpi} DPI)`,
      },
    };
  }

  download(output: PrinterOutput): void {
    if (!output.blob) return;
    const url = URL.createObjectURL(output.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = output.fileName || "tsc_labels.prn";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  }

  async print(output: PrinterOutput): Promise<void> {
    if (typeof navigator !== "undefined" && navigator.clipboard && output.rawContent) {
      try {
        await navigator.clipboard.writeText(output.rawContent);
      } catch (err) {
        console.warn("Could not copy TSPL to clipboard:", err);
      }
    }
  }
}

function escapeTspl(text: string): string {
  return (text || "").replace(/["\r\n]/g, "");
}

export const tsplPrinterDriver = new TsplPrinterDriver();
