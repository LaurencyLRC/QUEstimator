import type { PlayersDict } from "./questimator-types";

let cachedPromise: Promise<PlayersDict> | null = null;
let cachedData: PlayersDict | null = null;

/**
 * Loads data/players.json with a singleton promise and in-memory cache.
 * Ensures that multiple components requesting player data share the exact
 * same network request and in-memory object.
 */
export async function fetchPlayersData(): Promise<PlayersDict> {
  if (cachedData) return cachedData;
  if (!cachedPromise) {
    cachedPromise = fetch("data/players.json")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<PlayersDict>;
      })
      .then((data) => {
        cachedData = data;
        return data;
      })
      .catch((err) => {
        cachedPromise = null;
        throw err;
      });
  }
  return cachedPromise;
}

export function getCachedPlayersData(): PlayersDict | null {
  return cachedData;
}
