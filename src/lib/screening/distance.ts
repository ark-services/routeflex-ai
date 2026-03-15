/**
 * Calculates drive time and distance between two addresses using
 * the Google Maps Distance Matrix API.
 *
 * Requires env var: GOOGLE_MAPS_API_KEY
 */

export type DistanceResult = {
  distanceMiles: number;
  driveTimeMinutes: number;
};

export async function getDriveTimeAndDistance(
  originAddress: string,
  destinationAddress: string
): Promise<DistanceResult | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn("[getDriveTimeAndDistance] GOOGLE_MAPS_API_KEY not set — skipping distance calculation");
    return null;
  }

  if (!originAddress?.trim() || !destinationAddress?.trim()) {
    return null;
  }

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
    url.searchParams.set("origins", originAddress);
    url.searchParams.set("destinations", destinationAddress);
    url.searchParams.set("units", "imperial");
    url.searchParams.set("key", apiKey);

    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error("[getDriveTimeAndDistance] HTTP error:", res.status);
      return null;
    }

    const data = await res.json();
    const element = data?.rows?.[0]?.elements?.[0];

    if (!element || element.status !== "OK") {
      console.warn("[getDriveTimeAndDistance] No route found:", element?.status);
      return null;
    }

    // distance.value is in meters; duration.value is in seconds
    const distanceMiles = element.distance.value / 1609.344;
    const driveTimeMinutes = Math.round(element.duration.value / 60);

    return { distanceMiles: Math.round(distanceMiles * 10) / 10, driveTimeMinutes };
  } catch (err) {
    console.error("[getDriveTimeAndDistance] Error:", err);
    return null;
  }
}
