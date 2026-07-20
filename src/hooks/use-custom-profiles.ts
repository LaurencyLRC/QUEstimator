import { useState, useEffect, useCallback } from "react";
import { type PlayerData } from "@/lib/questimator-types";

export function useCustomProfiles() {
  const [profiles, setProfiles] = useState<Record<string, PlayerData>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("questimator_custom_profiles");
      if (stored) {
        setProfiles(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to load custom profiles", e);
    }
    setLoaded(true);
  }, []);

  const saveProfile = useCallback((id: string, data: PlayerData) => {
    setProfiles((prev) => {
      const next = { ...prev, [id]: data };
      localStorage.setItem("questimator_custom_profiles", JSON.stringify(next));
      return next;
    });
  }, []);

  const deleteProfile = useCallback((id: string) => {
    setProfiles((prev) => {
      const next = { ...prev };
      delete next[id];
      localStorage.setItem("questimator_custom_profiles", JSON.stringify(next));
      return next;
    });
  }, []);

  return { profiles, loaded, saveProfile, deleteProfile };
}
