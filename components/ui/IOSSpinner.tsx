"use client";

/**
 * IOSSpinner.tsx
 *
 * Pixel-perfect, minimalist iOS-style segmented activity indicator spinner.
 * Features 12 radially arranged rounded blades with smooth stepped opacity animation.
 */

import React from "react";

interface IOSSpinnerProps {
  /** Size in pixels (default: 32) */
  size?: number;
  /** Custom blade color (default: white) */
  color?: string;
  className?: string;
}

export function IOSSpinner({
  size = 32,
  color = "currentColor",
  className = "",
}: IOSSpinnerProps) {
  // 12 blades spaced at 30 degree intervals
  const bladeCount = 12;
  const blades = Array.from({ length: bladeCount });

  return (
    <div
      role="presentation"
      aria-hidden="true"
      className={`relative inline-flex items-center justify-center flex-shrink-0 ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
      }}
    >
      {blades.map((_, i) => {
        const rotation = i * (360 / bladeCount);
        // Animation delay staggered backwards around the circle
        const delay = -((bladeCount - i) / bladeCount) * 1.2;

        return (
          <div
            key={i}
            className="absolute top-0 left-1/2 -translate-x-1/2 origin-bottom"
            style={{
              width: `${Math.max(2, size * 0.08)}px`,
              height: `${size * 0.28}px`,
              transform: `rotate(${rotation}deg)`,
              transformOrigin: `center ${size / 2}px`,
              borderRadius: `${Math.max(1, size * 0.04)}px`,
              backgroundColor: color,
              animation: "iosSpinnerBlade 1.2s linear infinite",
              animationDelay: `${delay}s`,
            }}
          />
        );
      })}
    </div>
  );
}
