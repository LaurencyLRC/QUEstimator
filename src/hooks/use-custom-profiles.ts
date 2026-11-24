import { useState, useEffect, useCallback } from "react";
import { type PlayerData, type Chart, estimateThetaWithSe } from "@/lib/questimator-types";

export function useCustomProfiles(charts?: Chart[]) {
  const [profiles, setProfiles] = useState<Record<string, PlayerData>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("questimator_custom_profiles");
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        const normalized: Record<string, PlayerData> = {};
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
            if (v && typeof v === "object" && !Array.isArray(v)) {
              const raw = v as Partial<PlayerData>;
              normalized[k] = {
                c: raw.c && typeof raw.c === "object" ? raw.c : {},
                n: typeof raw.n === "string" ? raw.n : undefined,
                t: typeof raw.t === "number" ? raw.t : 0,
                se: typeof raw.se === "number" ? raw.se : undefined,
                history: Array.isArray(raw.history) ? raw.history : undefined,
              };
            }
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
    if (!loaded || !charts || charts.length === 0) return;
    setProfiles((prev) => {
      let changed = false;
      const updated: Record<string, PlayerData> = {};
      for (const [k, v] of Object.entries(prev)) {
        const { theta: calculatedTheta, se: calculatedSe } = estimateThetaWithSe(charts, v.c || {});
        if (Math.abs(calculatedTheta - v.t) > 0.0001 || v.se == null || Math.abs(calculatedSe - v.se) > 0.0001) {
          changed = true;
          updated[k] = { ...v, t: calculatedTheta, se: calculatedSe };
        } else {
          updated[k] = v;
        }
      }
      return changed ? updated : prev;
    });
  }, [charts, loaded]);

  const saveProfile = useCallback((id: string, data: PlayerData) => {
    setProfiles((prev) => {
      const next = { ...prev, [id]: data };
      // Omit player ability level (t) from storage to prevent obsolete calculations when chart difficulties update
      const toStore = Object.fromEntries(
        Object.entries(next).map(([k, v]) => [
          k,
          {
            c: v.c,
            ...(v.n ? { n: v.n } : {}),
            ...(v.history ? { history: v.history } : {}),
          },
        ])
      );
      try {
        localStorage.setItem("questimator_custom_profiles", JSON.stringify(toStore));
      } catch (e) {
        console.error("Failed to persist custom profiles", e);
      }
      return next;
    });
  }, []);

  const deleteProfile = useCallback((id: string) => {
    setProfiles((prev) => {
      const next = { ...prev };
      delete next[id];
      const toStore = Object.fromEntries(
        Object.entries(next).map(([k, v]) => [
          k,
          {
            c: v.c,
            ...(v.n ? { n: v.n } : {}),
            ...(v.history ? { history: v.history } : {}),
          },
        ])
      );
      try {
        localStorage.setItem("questimator_custom_profiles", JSON.stringify(toStore));
      } catch (e) {
        console.error("Failed to persist custom profiles", e);
      }
      return next;
    });
  }, []);

  return { profiles, loaded, saveProfile, deleteProfile };
}
