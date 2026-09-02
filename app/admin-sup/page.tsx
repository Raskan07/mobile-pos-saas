"use client";

import React, { useState, useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";

export default function AdminSupPage() {
  const [activeTab, setActiveTab] = useState<"Default" | "Advanced">("Advanced");
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Dynamic 3D Wireframe / Particle Sphere Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = 460);
    let height = (canvas.height = 460);

    const numPoints = 140;
    const radius = 170;
    const points: {
      x: number;
      y: number;
      z: number;
      origX: number;
      origY: number;
      origZ: number;
    }[] = [];

    const phi = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < numPoints; i++) {
      const y = 1 - (i / (numPoints - 1)) * 2;
      const radiusAtY = Math.sqrt(1 - y * y);
      const theta = phi * i;
      const x = Math.cos(theta) * radiusAtY;
      const z = Math.sin(theta) * radiusAtY;
      points.push({
        x: x * radius,
        y: y * radius,
        z: z * radius,
        origX: x * radius,
        origY: y * radius,
        origZ: z * radius,
      });
    }

    let angleX = 0.003;
    let angleY = 0.006;
    let rotationX = 0.2;
    let rotationY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - width / 2;
      const mouseY = e.clientY - rect.top - height / 2;
      angleY = mouseX * 0.00005 + 0.003;
      angleX = mouseY * 0.00005 + 0.002;
    };

    canvas.addEventListener("mousemove", handleMouseMove);

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      rotationX += angleX;
      rotationY += angleY;

      const cosX = Math.cos(rotationX);
      const sinX = Math.sin(rotationX);
      const cosY = Math.cos(rotationY);
      const sinY = Math.sin(rotationY);

      const projected = points.map((p) => {
        const x1 = p.origX * cosY - p.origZ * sinY;
        const z1 = p.origZ * cosY + p.origX * sinY;
        const y2 = p.origY * cosX - z1 * sinX;
        const z2 = z1 * cosX + p.origY * sinX;
        const fov = 400;
        const scale = fov / (fov + z2);
        return { x: x1 * scale + width / 2, y: y2 * scale + height / 2, z: z2, scale };
      });

      for (let i = 0; i < projected.length; i++) {
        for (let j = i + 1; j < projected.length; j++) {
          const p1 = projected[i];
          const p2 = projected[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 65) {
            const alpha = Math.max(0.04, (1 - dist / 65) * 0.38 * ((p1.scale + p2.scale) / 2));
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(249, 115, 22, ${alpha})`;
            ctx.lineWidth = 0.85;
            ctx.stroke();
          }
        }
      }

      for (const p of projected) {
        const depthAlpha = ((p.z + radius) / (2 * radius)) * 0.75 + 0.25;
        const size = Math.max(1, 1.8 * p.scale);
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 138, 43, ${depthAlpha})`;
        ctx.fill();
        if (p.z > 0) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, size * 2.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(249, 115, 22, ${0.15 * depthAlpha})`;
          ctx.fill();
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      canvas.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  const handleStartScan = () => {
    setIsScanning(true);
    setScanProgress(0);
    const interval = setInterval(() => {
      setScanProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => setIsScanning(false), 500);
          return 100;
        }
        return prev + 12;
      });
    }, 180);
  };

  return (
    <div className="relative h-screen w-screen bg-[#0d0d11] text-zinc-100 font-sans select-none overflow-hidden flex flex-col">
      {/* Background Ambient Glow */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute inset-0 bg-radial from-[#1e1411] via-[#0e0d10] to-[#080709]" />
        <div className="absolute -top-32 right-1/4 w-[750px] h-[750px] bg-orange-600/10 rounded-full blur-[160px]" />
        <div className="absolute top-1/3 right-1/3 w-[600px] h-[600px] bg-amber-600/8 rounded-full blur-[140px]" />
        <div className="absolute -bottom-40 left-10 w-[650px] h-[650px] bg-orange-950/15 rounded-full blur-[180px]" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(rgba(255,255,255,0.4) 1px, transparent 1px)`,
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      {/* App Shell */}
      <div className="relative z-10 w-full h-full flex flex-col overflow-hidden backdrop-blur-2xl">
        <AppShell defaultSectionId="shops">

          {/* ── Main content ── */}
          <div className="flex-1 flex flex-col overflow-hidden">

            {/* ── Centered canvas area ── */}
            <div className="flex-1 flex flex-col items-center justify-center gap-6 overflow-hidden relative p-8">

              {/* Sphere */}
              <div className="relative flex items-center justify-center">
                <div className="absolute w-80 h-80 rounded-full bg-gradient-to-tr from-orange-600/15 via-amber-500/8 to-transparent blur-3xl pointer-events-none" />
                <canvas
                  ref={canvasRef}
                  className="cursor-grab active:cursor-grabbing relative z-10 hover:scale-[1.02] transition-transform duration-300"
                  style={{ width: "380px", height: "380px" }}
                />
                {isScanning && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm rounded-full">
                    <div className="w-12 h-12 rounded-full border-2 border-orange-500/30 border-t-orange-500 animate-spin mb-3" />
                    <span className="text-xs font-mono text-orange-300">
                      Scanning assets… {scanProgress}%
                    </span>
                  </div>
                )}
              </div>

              {/* Toggle pill */}
              <div className="flex items-center p-0.5 rounded-lg bg-black/40 border border-white/[0.08] backdrop-blur-md shadow-inner">
                <button
                  onClick={() => setActiveTab("Default")}
                  className={`px-4 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                    activeTab === "Default"
                      ? "bg-white/[0.12] text-zinc-100 shadow-sm border border-white/[0.08]"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  Default
                </button>
                <button
                  onClick={() => setActiveTab("Advanced")}
                  className={`px-4 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                    activeTab === "Advanced"
                      ? "bg-white/[0.14] text-zinc-100 shadow-sm border border-white/[0.08]"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  Advanced
                </button>
              </div>

              {/* Empty state */}
              <div className="text-center space-y-4">
                <p className="text-sm font-normal text-zinc-400 tracking-tight">
                  No data to display yet — start a scan to populate insights.
                </p>
                <button
                  onClick={handleStartScan}
                  disabled={isScanning}
                  className="group inline-flex items-center gap-2 pl-4 pr-3 py-2 rounded-xl bg-gradient-to-r from-[#ea4815] to-[#f95721] text-white font-medium text-xs shadow-[0_4px_20px_rgba(234,72,21,0.35)] hover:shadow-[0_6px_25px_rgba(234,72,21,0.5)] active:scale-[0.98] transition-all duration-200 disabled:opacity-60 disabled:pointer-events-none"
                >
                  <span className="tracking-wide">
                    {isScanning ? "Scanning in progress…" : "New scan"}
                  </span>
                  <div className="w-5 h-5 rounded-md bg-white/20 flex items-center justify-center group-hover:bg-white/30 transition-colors">
                    <Plus className="w-3.5 h-3.5" />
                  </div>
                </button>
              </div>

            </div>
          </div>

        </AppShell>
      </div>
    </div>
  );
}
