"use client";

import { createContext, useContext, useState, useEffect, type ReactNode, useMemo } from "react";
import type { LevelSummary } from "./questimator-types";

export type ScaleMode = "lerp" | "raw";

interface ScaleContextValue {
  mode: ScaleMode;
  setMode: (m: ScaleMode) => void;
  toScale: (logit: number | null | undefined) => number | null;
  format: (logit: number | null | undefined, digits?: number) => string;
}

const ScaleContext = createContext<ScaleContextValue | null>(null);

export function ScaleProvider({ children, levels }: { children: ReactNode; levels: LevelSummary[] }) {
  const [mode, setModeState] = useState<ScaleMode>("lerp");

  useEffect(() => {
    const saved = localStorage.getItem("questimator_scale") as ScaleMode;
    if (saved === "raw" || saved === "lerp") setModeState(saved);
  }, []);

  const setMode = (m: ScaleMode) => {
    setModeState(m);
    localStorage.setItem("questimator_scale", m);
  };

  const anchors = useMemo(() => {
    const pts: { num: number; val: number }[] = [];
    for (const l of levels) {
      let num = parseInt(l.level);
      if (l.level === "Ω") num = 31;
      if (!isNaN(num) && l.hard_median != null) {
        pts.push({ num, val: l.hard_median });
      }
    }
    pts.sort((a, b) => a.num - b.num);
    // Enforce strict monotonicity (handles edge case noise)
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].val <= pts[i - 1].val) {
        pts[i].val = pts[i - 1].val + 0.001;
      }
    }
    return pts;
  }, [levels]);

  const toScale = (logit: number | null | undefined): number | null => {
    if (logit == null || Number.isNaN(logit)) return null;
    if (mode === "raw" || anchors.length < 2) return logit;

    const val = logit;
    if (val <= anchors[0].val) {
      const a = anchors[0], b = anchors[1];
      return a.num + ((val - a.val) * (b.num - a.num)) / (b.val - a.val);
    }
    if (val >= anchors[anchors.length - 1].val) {
      const a = anchors[anchors.length - 2], b = anchors[anchors.length - 1];
      return a.num + ((val - a.val) * (b.num - a.num)) / (b.val - a.val);
    }
    for (let i = 0; i < anchors.length - 1; i++) {
      const a = anchors[i], b = anchors[i + 1];
      if (val >= a.val && val <= b.val) {
        return a.num + ((val - a.val) * (b.num - a.num)) / (b.val - a.val);
      }
    }
    return val;
  };

  const format = (logit: number | null | undefined, digits = 2) => {
    const v = toScale(logit);
    if (v == null) return "–";
    if (mode === "raw") {
      const sign = v >= 0 ? "+" : "";
      return `${sign}${v.toFixed(digits)}`;
    }
    return v.toFixed(digits); // mapped LERP values are typically un-prefixed positive scale ranks 
  };

  const value: ScaleContextValue = {
    mode,
    setMode,
    toScale,
    format,
  };

  return <ScaleContext.Provider value={value}>{children}</ScaleContext.Provider>;
}

export function useScale() {
  const ctx = useContext(ScaleContext);
  if (!ctx) throw new Error("useScale must be used within ScaleProvider");
  return ctx;
}