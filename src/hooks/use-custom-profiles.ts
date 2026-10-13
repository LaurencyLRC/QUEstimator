import { useState, useEffect, useCallback } from "react";
import { type PlayerData, type Chart, estimateTheta } from "@/lib/questimator-types";

export function useCustomProfiles(charts?: Chart[]) {
  const [profiles, setProfiles] = useState<Record<string, PlayerData>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("questimator_custom_profiles");
      if (stored) {
        const parsed = JSON.parse(stored);
        const normalized: Record<string, PlayerData> = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (v && typeof v === "object") {
            normalized[k] = {
              c: (v as any).c || {},
              n: (v as any).n,
              t: (v as any).t ?? 0,
            };
          }
        }
        setProfiles(normalized);
      }
    } catch (e) {
      console.error("Failed to load custom profiles", e);
    }
    setLoaded(true);
  }, []);

  // When charts are available, recompute theta for all custom profiles so they reflect latest chart calibrations
  useEffect(() => {
    if (!charts || charts.length === 0) return;
    setProfiles((prev) => {
      let changed = false;
      const updated: Record<string, PlayerData> = {};
      for (const [k, v] of Object.entries(prev)) {
        const calculatedTheta = estimateTheta(charts, v.c || {});
        if (Math.abs(calculatedTheta - v.t) > 0.0001) {
          changed = true;
          updated[k] = { ...v, t: calculatedTheta };
        } else {
          updated[k] = v;
        }
      }
      return changed ? updated : prev;
    });
  }, [charts]);

  const saveProfile = useCallback((id: string, data: PlayerData) => {
    setProfiles((prev) => {
      const next = { ...prev, [id]: data };
      // Omit player ability level (t) from storage to prevent obsolete calculations when chart difficulties update
      const toStore = Object.fromEntries(
        Object.entries(next).map(([k, v]) => [k, { c: v.c, ...(v.n ? { n: v.n } : {}) }])
      );
      localStorage.setItem("questimator_custom_profiles", JSON.stringify(toStore));
      return next;
    });
  }, []);

  const deleteProfile = useCallback((id: string) => {
    setProfiles((prev) => {
      const next = { ...prev };
      delete next[id];
      const toStore = Object.fromEntries(
        Object.entries(next).map(([k, v]) => [k, { c: v.c, ...(v.n ? { n: v.n } : {}) }])
      );
      localStorage.setItem("questimator_custom_profiles", JSON.stringify(toStore));
      return next;
    });
  }, []);

  return { profiles, loaded, saveProfile, deleteProfile };
}
