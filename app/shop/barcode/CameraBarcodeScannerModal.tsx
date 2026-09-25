"use client";

/**
 * app/shop/barcode/CameraBarcodeScannerModal.tsx
 *
 * Lightweight camera/webcam barcode scanner modal.
 * Allows cashiers to point a phone or laptop camera at a barcode to quickly
 * locate a product and trigger label reprinting.
 */

import React, { useEffect, useRef, useState } from "react";
import { X, Camera, ScanLine, Check, AlertTriangle, Loader2 } from "lucide-react";

interface CameraBarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
}

export default function CameraBarcodeScannerModal({
  isOpen,
  onClose,
  onDetected,
}: CameraBarcodeScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<"idle" | "starting" | "scanning" | "detected" | "error">("idle");
  const [detectedCode, setDetectedCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load BarcodeDetector or try a polyfill approach
  const startCamera = async () => {
    setStatus("starting");
    setErrorMessage("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Use native BarcodeDetector API if available (Chrome/Android)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const BarcodeDetectorApi = (window as any).BarcodeDetector;
      if (BarcodeDetectorApi) {
        const detector = new BarcodeDetectorApi({ formats: ["code_128", "ean_13", "ean_8", "code_39", "qr_code"] });
        setStatus("scanning");
        intervalRef.current = setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) {
              const code = barcodes[0].rawValue as string;
              handleDetected(code);
            }
          } catch {
            // no barcode in frame yet, keep scanning
          }
        }, 300);
      } else {
        // Fallback: inform user their browser doesn't support BarcodeDetector
        setStatus("error");
        setErrorMessage(
          "Your browser doesn't support the native Barcode Detection API. Please use Chrome on Android/Desktop, or use manual entry instead."
        );
      }
    } catch (err) {
      console.error("[CameraScanner] Camera error:", err);
      setStatus("error");
      setErrorMessage("Camera access denied or unavailable. Please allow camera permissions and try again.");
    }
  };

  const handleDetected = (code: string) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setDetectedCode(code);
    setStatus("detected");
    stopCamera(false);
    setTimeout(() => {
      onDetected(code);
      onClose();
    }, 1200);
  };

  const stopCamera = (alsoClose = true) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (alsoClose) {
      setStatus("idle");
      setDetectedCode(null);
      onClose();
    }
  };

  useEffect(() => {
    if (!isOpen) {
      stopCamera(false);
      setStatus("idle");
      setDetectedCode(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    return () => {
      stopCamera(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="relative w-full max-w-md bg-[#0e1018] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Camera Scanner</h3>
              <p className="text-[11px] text-zinc-400">Point camera at a barcode to detect it</p>
            </div>
          </div>
          <button
            onClick={() => stopCamera(true)}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Camera Viewport */}
        <div className="relative bg-black aspect-video overflow-hidden">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            muted
            playsInline
          />

          {/* Scanning overlays */}
          {status === "idle" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70">
              <Camera className="w-10 h-10 text-zinc-400" />
              <p className="text-sm text-zinc-300 text-center px-6">
                Tap &ldquo;Start Scanner&rdquo; to activate your camera
              </p>
            </div>
          )}

          {status === "starting" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70">
              <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
              <p className="text-sm text-zinc-300">Starting camera…</p>
            </div>
          )}

          {status === "scanning" && (
            <>
              {/* Laser sweep animation */}
              <div className="absolute inset-x-8 h-0.5 bg-red-500/80 shadow-[0_0_12px_#ef4444] animate-[scanLine_2s_ease-in-out_infinite]"
                style={{ animation: "scanLine 2s ease-in-out infinite" }} />
              {/* Viewfinder corners */}
              <div className="absolute top-4 left-8 w-6 h-6 border-t-2 border-l-2 border-white/70 rounded-tl" />
              <div className="absolute top-4 right-8 w-6 h-6 border-t-2 border-r-2 border-white/70 rounded-tr" />
              <div className="absolute bottom-4 left-8 w-6 h-6 border-b-2 border-l-2 border-white/70 rounded-bl" />
              <div className="absolute bottom-4 right-8 w-6 h-6 border-b-2 border-r-2 border-white/70 rounded-br" />
              <div className="absolute bottom-3 inset-x-0 flex justify-center">
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/60 border border-white/10">
                  <ScanLine className="w-3 h-3 text-red-400 animate-pulse" />
                  <span className="text-[10px] font-mono text-zinc-300">Scanning for barcode…</span>
                </div>
              </div>
            </>
          )}

          {status === "detected" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-emerald-900/40">
              <div className="w-14 h-14 rounded-full bg-emerald-500 flex items-center justify-center shadow-[0_0_40px_#10b981]">
                <Check className="w-7 h-7 text-white" />
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-white">Barcode Detected!</p>
                <p className="text-xs font-mono text-emerald-300 mt-1">{detectedCode}</p>
              </div>
            </div>
          )}

          {status === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 p-6">
              <AlertTriangle className="w-8 h-8 text-amber-400" />
              <p className="text-xs text-zinc-300 text-center">{errorMessage}</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 flex items-center justify-between gap-3 border-t border-white/10">
          <button
            onClick={() => stopCamera(true)}
            className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-semibold transition-colors cursor-pointer"
          >
            Cancel
          </button>
          {status === "idle" || status === "error" ? (
            <button
              onClick={startCamera}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              <Camera className="w-3.5 h-3.5" />
              Start Scanner
            </button>
          ) : (
            <button
              onClick={() => stopCamera(true)}
              className="flex-1 py-2.5 rounded-xl bg-red-600/20 border border-red-500/30 hover:bg-red-600/30 text-red-400 text-xs font-semibold transition-colors cursor-pointer"
            >
              Stop Camera
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes scanLine {
          0% { top: 20%; }
          50% { top: 75%; }
          100% { top: 20%; }
        }
      `}</style>
    </div>
  );
}
