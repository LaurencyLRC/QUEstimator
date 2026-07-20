"use client";

import { useScale } from "@/lib/value-scale";
import { useLang } from "@/lib/i18n";

export function ScaleToggle() {
  const { mode, setMode } = useScale();
  const { t } = useLang();

  return (
    <div className="flex items-center rounded-md border border-border/60 overflow-hidden">
      <button
        onClick={() => setMode("lerp")}
        className={`px-2 py-1 text-[11px] font-medium transition-colors ${
          mode === "lerp"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted/60"
        }`}
      >
        {t.scaleLerp}
      </button>
      <button
        onClick={() => setMode("raw")}
        className={`px-2 py-1 text-[11px] font-medium transition-colors ${
          mode === "raw"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted/60"
        }`}
      >
        {t.scaleRaw}
      </button>
    </div>
  );
}