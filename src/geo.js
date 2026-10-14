// -----------------------------------------------------------------------------
// Geometry on the sphere: distance, bearing, compass point, and the cheap
// bounding box that discards almost every strike of the worldwide feed
// before any trigonometry. Pure.
// -----------------------------------------------------------------------------

const EARTH_KM = 6371;
const KM_PER_DEGREE = (Math.PI * EARTH_KM) / 180; // ~111.2 km
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** Great-circle distance in km between { latitude, longitude } points. */
export function distanceKm(a, b) {
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from `a` to `b`, in degrees clockwise from north (0-359). */
export function bearingDeg(a, b) {
  const phi1 = rad(a.latitude);
  const phi2 = rad(b.latitude);
  const dLambda = rad(b.longitude - a.longitude);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return (Math.round(deg(Math.atan2(y, x))) + 360) % 360;
}

const POINTS = {
  en: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
  fr: ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'],
};

/** The 8-point compass name of a bearing: 0 -> N, 45 -> NE, 250 -> W (O). */
export function compassPoint(bearing, language = 'en') {
  const points = POINTS[language] ?? POINTS.en;
  return points[Math.round((((bearing % 360) + 360) % 360) / 45) % 8];
}

/**
 * The latitude/longitude box around a point that contains every point within
 * `km`. Near a pole (or for a box wider than the globe) the longitude test is
 * dropped; across the antimeridian the longitude difference wraps.
 */
export function boundingBox(point, km) {
  const dLat = km / KM_PER_DEGREE;
  const cos = Math.cos(rad(Math.min(89.9, Math.abs(point.latitude) + dLat)));
  const dLon = km / (KM_PER_DEGREE * cos);
  return {
    south: point.latitude - dLat,
    north: point.latitude + dLat,
    longitude: point.longitude,
    dLon: Math.abs(point.latitude) + dLat >= 89.9 || dLon >= 180 ? Infinity : dLon,
  };
}

/** Is { latitude, longitude } inside the box? Two comparisons for most strikes. */
export function inBox(box, latitude, longitude) {
  if (latitude < box.south || latitude > box.north) {
    return false;
  }
  if (box.dLon === Infinity) {
    return true;
  }
  const d = Math.abs(longitude - box.longitude);
  return Math.min(d, 360 - d) <= box.dLon;
}
