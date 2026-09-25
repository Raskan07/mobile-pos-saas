/**
 * lib/utils/barcodePdfGenerator.ts
 *
 * Client-side Barcode Image & PDF Generator.
 * Supports A4 6-col (60 labels/page), A4 3-col (24 labels/page), Thermal 50x30mm.
 */

import { jsPDF } from "jspdf";
import JsBarcode from "jsbarcode";
import { BarcodeItem, LabelConfig, PaperPreset, PaperPresetId } from "../types/barcode";

export const PAPER_PRESETS: Record<PaperPresetId, PaperPreset> = {
  a4_6col: {
    id: "a4_6col",
    name: "A4 Sheet (6 per row - 60 Labels)",
    description: "Standard retail barcode grid: 6 columns x 10 rows (32mm x 24mm)",
    pageWidthMm: 210,
    pageHeightMm: 297,
    columns: 6,
    rows: 10,
    labelWidthMm: 32,
    labelHeightMm: 24,
    marginTopMm: 12,
    marginLeftMm: 6,
    gapXColMm: 2,
    gapYRowMm: 2.5,
  },
  a4_4col: {
    id: "a4_4col",
    name: "A4 Sheet (4 per row - 44 Labels)",
    description: "Medium barcode grid: 4 columns x 11 rows (48mm x 24mm)",
    pageWidthMm: 210,
    pageHeightMm: 297,
    columns: 4,
    rows: 11,
    labelWidthMm: 48,
    labelHeightMm: 24,
    marginTopMm: 12,
    marginLeftMm: 5,
    gapXColMm: 2.5,
    gapYRowMm: 2.5,
  },
  a4_3col: {
    id: "a4_3col",
    name: "A4 Sheet (3 per row - 24 Labels)",
    description: "Standard retail barcode sheet: 3 columns x 8 rows (62mm x 32mm)",
    pageWidthMm: 210,
    pageHeightMm: 297,
    columns: 3,
    rows: 8,
    labelWidthMm: 62,
    labelHeightMm: 32,
    marginTopMm: 10.5,
    marginLeftMm: 9,
    gapXColMm: 3,
    gapYRowMm: 3,
  },
  thermal_50x30: {
    id: "thermal_50x30",
    name: "Thermal Roll (50mm x 30mm)",
    description: "Standard single-label continuous roll for POS thermal barcode printers",
    pageWidthMm: 50,
    pageHeightMm: 30,
    columns: 1,
    rows: 1,
    labelWidthMm: 46,
    labelHeightMm: 26,
    marginTopMm: 2,
    marginLeftMm: 2,
    gapXColMm: 0,
    gapYRowMm: 0,
  },
  thermal_40x28: {
    id: "thermal_40x28",
    name: "Thermal Roll (40mm x 28mm)",
    description: "Compact retail roll for cosmetics, jewelry, and small accessories",
    pageWidthMm: 40,
    pageHeightMm: 28,
    columns: 1,
    rows: 1,
    labelWidthMm: 36,
    labelHeightMm: 24,
    marginTopMm: 2,
    marginLeftMm: 2,
    gapXColMm: 0,
    gapYRowMm: 0,
  },
  thermal_60x40: {
    id: "thermal_60x40",
    name: "Thermal Roll (60mm x 40mm)",
    description: "Medium shelf and warehouse bin label roll",
    pageWidthMm: 60,
    pageHeightMm: 40,
    columns: 1,
    rows: 1,
    labelWidthMm: 56,
    labelHeightMm: 36,
    marginTopMm: 2,
    marginLeftMm: 2,
    gapXColMm: 0,
    gapYRowMm: 0,
  },
  thermal_100x50: {
    id: "thermal_100x50",
    name: "Thermal Roll (100mm x 50mm)",
    description: "Large shipping and carton label roll",
    pageWidthMm: 100,
    pageHeightMm: 50,
    columns: 1,
    rows: 1,
    labelWidthMm: 94,
    labelHeightMm: 46,
    marginTopMm: 2,
    marginLeftMm: 3,
    gapXColMm: 0,
    gapYRowMm: 0,
  },
};

export function generateBarcodeDataUrl(
  barcodeValue: string,
  options: {
    width?: number;
    height?: number;
    displayValue?: boolean;
    fontSize?: number;
  } = {}
): string {
  if (typeof window === "undefined") return "";

  const cleanCode = (barcodeValue || "0000000000").trim();
  const canvas = document.createElement("canvas");

  // High-DPI bar width and height for razor-sharp scanning and crisp print
  const barWidth = options.width ?? 3;
  const barHeight = options.height ?? 64;
  const fontSize = options.fontSize ?? 13;

  try {
    JsBarcode(canvas, cleanCode, {
      format: "CODE128",
      width: barWidth,
      height: barHeight,
      displayValue: options.displayValue ?? true,
      fontSize: fontSize,
      font: "monospace",
      textMargin: 3,
      margin: 3,
      background: "#ffffff",
      lineColor: "#000000",
    });
    return canvas.toDataURL("image/png");
  } catch (err) {
    console.warn("[BarcodeGenerator] Fallback for code:", cleanCode, err);
    try {
      JsBarcode(canvas, cleanCode.replace(/[^0-9a-zA-Z]/g, "") || "00000000", {
        format: "CODE128",
        width: barWidth,
        height: barHeight,
        displayValue: true,
        fontSize: fontSize,
        margin: 3,
        background: "#ffffff",
        lineColor: "#000000",
      });
      return canvas.toDataURL("image/png");
    } catch {
      return "";
    }
  }
}

export interface PrintableLabelTask {
  item: BarcodeItem;
  quantity: number;
}

export function buildBarcodePdf(
  tasks: PrintableLabelTask[],
  config: LabelConfig,
  shopDisplayName = "POS STORE"
): jsPDF {
  const preset = PAPER_PRESETS[config.paperPreset] || PAPER_PRESETS.a4_6col;
  const isThermal = preset.id.startsWith("thermal_");

  const doc = new jsPDF({
    orientation: isThermal ? "landscape" : "portrait",
    unit: "mm",
    format: [preset.pageWidthMm, preset.pageHeightMm],
  });

  const flatLabels: BarcodeItem[] = [];
  tasks.forEach((task) => {
    const qty = Math.max(1, task.quantity);
    for (let i = 0; i < qty; i++) {
      flatLabels.push(task.item);
    }
  });

  if (flatLabels.length === 0) return doc;

  const barcodeCache = new Map<string, string>();
  flatLabels.forEach((item) => {
    const code = item.barcode || item.sku;
    if (!barcodeCache.has(code)) {
      barcodeCache.set(
        code,
        generateBarcodeDataUrl(code, {
          width: 3.5, // High-DPI integer scaling for 300+ DPI print quality
          height: 75,
          displayValue: true,
          fontSize: 13,
        })
      );
    }
  });

  const labelsPerPage = preset.columns * preset.rows;
  const totalPages = Math.ceil(flatLabels.length / labelsPerPage);

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    if (pageIdx > 0) {
      doc.addPage([preset.pageWidthMm, preset.pageHeightMm], isThermal ? "landscape" : "portrait");
    }

    const startLabelIdx = pageIdx * labelsPerPage;
    const endLabelIdx = Math.min(startLabelIdx + labelsPerPage, flatLabels.length);

    for (let i = startLabelIdx; i < endLabelIdx; i++) {
      const item = flatLabels[i];
      const slotOnPage = i - startLabelIdx;
      const col = slotOnPage % preset.columns;
      const row = Math.floor(slotOnPage / preset.columns);

      const w = config.customWidthMm && config.customWidthMm > 10 ? config.customWidthMm : preset.labelWidthMm;
      const h = config.customHeightMm && config.customHeightMm > 10 ? config.customHeightMm : preset.labelHeightMm;
      const x = preset.marginLeftMm + col * (w + preset.gapXColMm);
      const y = preset.marginTopMm + row * (h + preset.gapYRowMm);

      doc.setDrawColor(220, 220, 225);
      doc.setLineWidth(0.1);
      doc.roundedRect(x, y, w, h, 1, 1, "S");

      let currentY = y + 2.2;

      if (config.showShopName) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(preset.id === "a4_6col" ? 5.0 : 6.5);
        doc.setTextColor(100, 100, 105);
        const shopText = (config.customShopName || shopDisplayName).trim().toUpperCase();
        doc.text(shopText, x + w / 2, currentY, { align: "center", maxWidth: w - 2 });
        currentY += preset.id === "a4_6col" ? 2.4 : 3.2;
      }

      const code = item.barcode || item.sku;
      const barcodeImg = barcodeCache.get(code);

      const barcodeW = Math.max(18, w - (preset.id === "a4_6col" ? 2.5 : 4));
      const barcodeH = Math.max(8.5, Math.min(16, h * 0.52));
      const barcodeX = x + (w - barcodeW) / 2;

      if (barcodeImg) {
        try {
          doc.addImage(barcodeImg, "PNG", barcodeX, currentY, barcodeW, barcodeH, undefined, "FAST");
        } catch (imgErr) {
          console.warn("Could not insert barcode image:", imgErr);
        }
      }

      const hasSku = config.showSku && Boolean(item.sku);
      const hasPrice = config.showPrice;

      if (hasSku || hasPrice) {
        const footerY = y + h - (preset.id === "a4_6col" ? 1.8 : 2.4);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(preset.id === "a4_6col" ? 4.8 : 6.4);
        doc.setTextColor(50, 50, 55);

        if (hasSku && hasPrice) {
          const skuText = item.sku;
          doc.text(skuText, x + 1.5, footerY, { maxWidth: w / 2 });
          doc.setFont("helvetica", "bold");
          doc.setFontSize(preset.id === "a4_6col" ? 5.4 : 7.2);
          doc.setTextColor(0, 0, 0);
          const priceText = `${config.currencySymbol || "Rs."} ${item.sellingPrice.toLocaleString()}`;
          doc.text(priceText, x + w - 1.5, footerY, { align: "right" });
        } else if (hasPrice) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(preset.id === "a4_6col" ? 5.8 : 7.8);
          doc.setTextColor(0, 0, 0);
          const priceText = `${config.currencySymbol || "Rs."} ${item.sellingPrice.toLocaleString()}`;
          doc.text(priceText, x + w / 2, footerY, { align: "center" });
        } else if (hasSku) {
          const skuText = item.sku;
          doc.text(skuText, x + w / 2, footerY, { align: "center", maxWidth: w - 2 });
        }
      }
    }
  }

  return doc;
}

export function triggerDirectPrint(doc: jsPDF): void {
  if (typeof window === "undefined") return;

  const blob = doc.output("blob");
  const blobUrl = URL.createObjectURL(blob);

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
    try {
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
          URL.revokeObjectURL(blobUrl);
        }, 60000);
      }, 250);
    } catch (e) {
      console.error("Failed to trigger print on iframe:", e);
      const printWin = window.open(blobUrl, "_blank");
      printWin?.focus();
    }
  };
}

export function downloadBarcodePdf(doc: jsPDF, filename = "barcode_labels.pdf"): void {
  doc.save(filename);
}
