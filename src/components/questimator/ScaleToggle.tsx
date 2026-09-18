"use client";

import { useScale } from "@/lib/value-scale";
import { useLang } from "@/lib/i18n";

export function ScaleToggle() {
  const { mode, setMode } = useScale();
  const { t } = useLang();

  return (
    <div className="inline-flex items-center p-0.5 rounded-md bg-muted/40 border border-border/80 font-mono text-[11px]">
      <button
        onClick={() => setMode("lerp")}
        className={`px-2.5 py-1 rounded transition-all font-medium ${
          mode === "lerp"
            ? "bg-card text-foreground shadow-sm border border-border/80"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {t.scaleLerp}
      </button>
      <button
        onClick={() => setMode("raw")}
        className={`px-2.5 py-1 rounded transition-all font-medium ${
          mode === "raw"
            ? "bg-card text-foreground shadow-sm border border-border/80"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {t.scaleRaw}
      </button>
    </div>
  );
}