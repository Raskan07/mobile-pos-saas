"use client";

import React, { useState } from "react";
import { Package } from "lucide-react";

interface ProductImageProps {
  type?: string;
  className?: string;
  imageUrl?: string;
  name?: string;
}

export default function ProductImage({
  className = "w-16 h-16",
  imageUrl,
  name,
}: ProductImageProps) {
  const [hasError, setHasError] = useState(false);

  // If Firebase image exists and hasn't errored
  if (imageUrl && !hasError) {
    return (
      <div className={`relative flex items-center justify-center overflow-hidden rounded-xl bg-black/40 border border-white/10 ${className}`}>
        <img
          src={imageUrl}
          alt={name || "Product"}
          className="w-full h-full object-cover"
          onError={() => setHasError(true)}
          loading="lazy"
        />
      </div>
    );
  }

  // Fallback: Clean, modern POS product badge with initial or package icon
  const initial = name?.trim() ? name.trim().charAt(0).toUpperCase() : null;

  return (
    <div
      className={`relative flex items-center justify-center rounded-xl bg-white/[0.04] border border-white/10 text-zinc-400 select-none ${className}`}
    >
      {initial ? (
        <span className="font-bold font-mono text-zinc-300 text-xs">{initial}</span>
      ) : (
        <Package className="w-1/2 h-1/2 text-zinc-500" />
      )}
    </div>
  );
}
