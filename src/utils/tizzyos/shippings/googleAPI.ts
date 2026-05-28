import fetch from "node-fetch";
const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// ------------------------------
// TYPES
// ------------------------------
interface DistanceMatrixElement {
  distance: { value: number };
  duration: { value: number };
  duration_in_traffic?: { value: number };
  status: string;
}

interface DistanceMatrixRow {
  elements: DistanceMatrixElement[];
}

interface DistanceMatrixResponse {
  status: string;
  rows: DistanceMatrixRow[];
}

interface DirectionsRoute {
  overview_polyline?: { points: string };
}

interface DirectionsResponse {
  status: string;
  routes: DirectionsRoute[];
}

interface GeocodeResult {
  formatted_address: string;
  place_id: string;
}

interface GeocodeResponse {
  status: string;
  results: GeocodeResult[];
}

// ------------------------------
// DISTANCE MATRIX → ETA
// ------------------------------
export async function getDistanceAndDuration(
  origin: { lat: number; lng: number },
  destination: { latitude: number; longitude: number }
) {
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin.lat},${origin.lng}&destinations=${destination.latitude},${destination.longitude}&mode=driving&departure_time=now&key=${GOOGLE_API_KEY}`;
  const response = await fetch(url);
  const data = (await response.json()) as DistanceMatrixResponse;

  if (data.status !== "OK") throw new Error("Google Distance Matrix API error");

  const element = data.rows[0].elements[0];

  return {
    distanceKm: element.distance.value / 1000,
    durationSec: element.duration.value,
    durationInTrafficSec: element.duration_in_traffic?.value || element.duration.value,
    status: element.status,
  };
}

// ------------------------------
// DIRECTIONS → POLYLINE
// ------------------------------
export async function getRoutePolyline(
  origin: { lat: number; lng: number },
  destination: { latitude: number; longitude: number }
) {
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.lat},${origin.lng}&destination=${destination.latitude},${destination.longitude}&mode=driving&departure_time=now&key=${GOOGLE_API_KEY}`;
  const response = await fetch(url);
  const data = (await response.json()) as DirectionsResponse;

  if (data.status !== "OK") throw new Error("Google Directions API error");

  return data.routes[0]?.overview_polyline?.points || "";
}

// ------------------------------
// GEOCODE → ADDRESS & PLACE ID
// ------------------------------
export async function geocodeAddress(lat: number, lng: number) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_API_KEY}`;
  const response = await fetch(url);
  const data = (await response.json()) as GeocodeResponse;

  if (data.status !== "OK") throw new Error("Google Geocode API error");

  const result = data.results[0];
  return { address: result.formatted_address, placeId: result.place_id };
}
