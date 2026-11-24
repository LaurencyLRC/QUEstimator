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

/**
 * Solve symmetric positive-definite (diag(w) + lam * D2^T D2) v = w * y
 * (chart-count-weighted 2nd-difference Whittaker smoother) via Cholesky.
 */
function whittakerSmooth(y: number[], w: number[], lam: number): number[] {
  const n = y.length;
  if (n < 3 || lam <= 0) return [...y];

  // Build dense n x n SPD matrix A = diag(w) + lam * D2^T D2 (n <= 31)
  const A: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const rhs = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    A[i][i] = w[i];
    rhs[i] = w[i] * y[i];
  }
  for (let i = 0; i < n - 2; i++) {
    // Row i of D2 has [1, -2, 1] at columns [i, i+1, i+2]
    const idx = [i, i + 1, i + 2];
    const coef = [1, -2, 1];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        A[idx[r]][idx[c]] += lam * coef[r] * coef[c];
      }
    }
  }

  // Cholesky factorization A = L L^T
  const L: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i][j];
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
      if (i === j) {
        L[i][j] = Math.sqrt(Math.max(sum, 1e-12));
      } else {
        L[i][j] = sum / L[j][j];
      }
    }
  }

  // Forward substitution L z = rhs
  const z = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let sum = rhs[i];
    for (let k = 0; k < i; k++) sum -= L[i][k] * z[k];
    z[i] = sum / L[i][i];
  }

  // Backward substitution L^T v = z
  const v = new Array<number>(n);
  for (let i = n - 1; i >= 0; i--) {
    let sum = z[i];
    for (let k = i + 1; k < n; k++) sum -= L[k][i] * v[k];
    v[i] = sum / L[i][i];
  }
  return v;
}

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

  const scaleCurve = useMemo(() => {
    const raw: { num: number; val: number; weight: number }[] = [];
    for (const l of levels) {
      let num = parseInt(l.level);
      if (l.level === "Ω") num = 31;
      if (!isNaN(num) && l.hard_median != null) {
        raw.push({ num, val: l.hard_median, weight: Math.max(1, l.n_charts_total) });
      }
    }
    raw.sort((a, b) => a.num - b.num);
    if (raw.length < 2) {
      return { pts: raw.map((r) => ({ num: r.num, val: r.val })), slopes: [] as number[] };
    }

    // 1. Chart-count-weighted Whittaker smoothing (lambda = 0.5):
    // Pins high-N core folders (Lv 17-25) within ~0.03 U_E while smoothing pinched
    // noise gaps in smaller folders (e.g. Lv 13->14, Lv 15->16).
    const meanW = raw.reduce((s, r) => s + r.weight, 0) / raw.length;
    const normW = raw.map((r) => r.weight / meanW);
    const smoothedVals = whittakerSmooth(
      raw.map((r) => r.val),
      normW,
      0.5
    );

    // 2. Pool-Adjacent-Violators (PAVA) isotonic pooling to guarantee strict monotonicity.
    const blocks: { numSum: number; valSum: number; count: number }[] = [];
    for (let i = 0; i < raw.length; i++) {
      blocks.push({ numSum: raw[i].num, valSum: smoothedVals[i], count: 1 });
      while (blocks.length >= 2) {
        const last = blocks[blocks.length - 1];
        const prev = blocks[blocks.length - 2];
        if (last.valSum / last.count <= prev.valSum / prev.count) {
          prev.numSum += last.numSum;
          prev.valSum += last.valSum;
          prev.count += last.count;
          blocks.pop();
        } else {
          break;
        }
      }
    }
    const pts = blocks.map((b) => ({
      num: b.numSum / b.count,
      val: b.valSum / b.count,
    }));

    // 3. Fritsch-Carlson monotone cubic Hermite (PCHIP) tangents m[i] = d(level)/d(logit).
    const k = pts.length;
    if (k < 2) return { pts, slopes: [] as number[] };
    const h = new Array<number>(k - 1);
    const delta = new Array<number>(k - 1);
    for (let i = 0; i < k - 1; i++) {
      h[i] = Math.max(pts[i + 1].val - pts[i].val, 1e-4);
      delta[i] = (pts[i + 1].num - pts[i].num) / h[i];
    }

    const slopes = new Array<number>(k).fill(0);
    if (k === 2) {
      slopes[0] = delta[0];
      slopes[1] = delta[0];
    } else {
      for (let i = 1; i < k - 1; i++) {
        if (delta[i - 1] * delta[i] > 0) {
          const w1 = 2 * h[i] + h[i - 1];
          const w2 = h[i] + 2 * h[i - 1];
          slopes[i] = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i]);
        }
      }
      // One-sided shape-preserving endpoint tangents
      let m0 = ((2 * h[0] + h[1]) * delta[0] - h[0] * delta[1]) / (h[0] + h[1]);
      if (m0 * delta[0] <= 0) m0 = 0;
      else if (Math.abs(m0) > 3 * Math.abs(delta[0])) m0 = 3 * delta[0];
      slopes[0] = m0;

      let mn = ((2 * h[k - 2] + h[k - 3]) * delta[k - 2] - h[k - 2] * delta[k - 3]) / (h[k - 2] + h[k - 3]);
      if (mn * delta[k - 2] <= 0) mn = 0;
      else if (Math.abs(mn) > 3 * Math.abs(delta[k - 2])) mn = 3 * delta[k - 2];
      slopes[k - 1] = mn;
    }

    return { pts, slopes };
  }, [levels]);

  const toScale = (logit: number | null | undefined): number | null => {
    if (logit == null || Number.isNaN(logit)) return null;
    const { pts, slopes } = scaleCurve;
    if (mode === "raw" || pts.length < 2) return logit;

    const val = logit;
    if (val <= pts[0].val) {
      const a = pts[0];
      let refIdx = 1;
      while (refIdx < pts.length - 1 && pts[refIdx].val - a.val < 0.5) refIdx++;
      const dVal = pts[refIdx].val - a.val;
      const slope = dVal > 0.05 ? (pts[refIdx].num - a.num) / dVal : 1.5;
      return a.num + (val - a.val) * slope;
    }
    const lastIdx = pts.length - 1;
    if (val >= pts[lastIdx].val) {
      const last = pts[lastIdx];
      let refIdx = lastIdx - 1;
      while (refIdx > 0 && last.val - pts[refIdx].val < 0.5) refIdx--;
      const dVal = last.val - pts[refIdx].val;
      const slope = dVal > 0.05 ? (last.num - pts[refIdx].num) / dVal : 1.5;
      return last.num + (val - last.val) * slope;
    }

    // Binary search for interval [i, i+1]
    let lo = 0;
    let hi = lastIdx - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (pts[mid].val <= val) lo = mid;
      else hi = mid - 1;
    }
    const a = pts[lo];
    const b = pts[lo + 1];
    const h = Math.max(b.val - a.val, 1e-4);
    const t = (val - a.val) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    return h00 * a.num + h10 * h * slopes[lo] + h01 * b.num + h11 * h * slopes[lo + 1];
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