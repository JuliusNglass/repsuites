// Miles or kilometres, by where the business is. Client-safe.
// The UK and the US use miles; nearly everywhere else (Nigeria included)
// uses kilometres. Stored distances are always in kilometres.

const KM_PER_MILE = 1.609344;

export function usesMiles(lat?: number | null, lng?: number | null): boolean {
  if (typeof lat === "number" && typeof lng === "number") {
    const uk = lat >= 49.8 && lat <= 60.9 && lng >= -8.7 && lng <= 1.8;
    const us = lat >= 18.9 && lat <= 71.4 && lng >= -179.2 && lng <= -66.9;
    return uk || us;
  }
  if (typeof navigator !== "undefined") {
    const l = (navigator.language || "").toLowerCase();
    return l === "en-gb" || l === "en-us";
  }
  return false;
}

export function distanceLabel(km: number, miles: boolean): string {
  if (!miles) return `${km} km`;
  const m = Math.round((km / KM_PER_MILE) * 4) / 4;
  const text = m === 0.5 ? "half a mile" : `${m} mile${m === 1 ? "" : "s"}`;
  return text;
}

// Grid choices: clean numbers in the person's own unit (stored in km).
export function gridChoices(miles: boolean): { grid: number; km: number; label: string }[] {
  return miles
    ? [
        { grid: 5, km: 1.6, label: "5 by 5, 1 mile apart (town)" },
        { grid: 5, km: 3.2, label: "5 by 5, 2 miles apart (wider area)" },
        { grid: 5, km: 0.8, label: "5 by 5, half a mile apart (city centre)" },
        { grid: 3, km: 2.4, label: "3 by 3, 1.5 miles apart (cheapest)" },
      ]
    : [
        { grid: 5, km: 1.5, label: "5 by 5, 1.5 km apart (town)" },
        { grid: 5, km: 3, label: "5 by 5, 3 km apart (wider area)" },
        { grid: 5, km: 0.8, label: "5 by 5, 0.8 km apart (city centre)" },
        { grid: 3, km: 2, label: "3 by 3, 2 km apart (cheapest)" },
      ];
}
