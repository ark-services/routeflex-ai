"use client";

import { useState, useEffect } from "react";

interface Props {
  thumbnailPath: string | null;
  title: string;
  className?: string;
}

export function TemplateThumbnail({ thumbnailPath, title, className = "" }: Props) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!thumbnailPath) return;
    fetch(`/api/templates/signed-url?path=${encodeURIComponent(thumbnailPath)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.url) setSrc(d.url);
      })
      .catch(() => {});
  }, [thumbnailPath]);

  if (src) {
    return (
      <img
        src={src}
        alt={title}
        className={className}
        onError={() => setSrc(null)}
      />
    );
  }

  // Gradient placeholder
  return (
    <div
      className={`bg-gradient-to-br from-rf-blue-tint via-rf-blue-tint to-rf-blue-tint flex items-center justify-center ${className}`}
    >
      <span className="text-xl font-bold text-rf-blue-light select-none">
        {title.slice(0, 2).toUpperCase()}
      </span>
    </div>
  );
}
