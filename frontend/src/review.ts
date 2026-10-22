/** Public review builds never imply that a physical monitoring station is online. */
export const publicReview = import.meta.env.VITE_REVIEW_MODE === 'true' ||
  (import.meta.env.PROD && !import.meta.env.VITE_API_BASE_URL);
export const apiBase = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export function sampleReadings(heightCm:number) {
  const now = Date.now();
  return Array.from({length:145},(_,i)=>{
    const levelCm = Math.round(Math.min(heightCm-30, Math.max(0, 23 + 0.26*i + 19*Math.sin(i/18)))*10)/10;
    const at = new Date(now+(i-144)*600000).toISOString();
    return {deviceId:'FW-001',bootId:'sample',sequence:i,observedAtUtc:at,receivedAtUtc:at,
      distanceCm:heightCm-levelCm,levelCm,latitude:14.5995,longitude:120.9842};
  });
}
