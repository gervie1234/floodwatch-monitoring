/** Public review builds never imply that a physical monitoring station is online. */
export const localDashboard = import.meta.env.VITE_LOCAL_DASHBOARD === 'true';
const configuredApi = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '');
// Vercel sends public dashboard requests through its same-origin rewrite.
const useVercelProxy = import.meta.env.VITE_VERCEL_ENV === 'production' && Boolean(configuredApi);
export const apiBase = localDashboard ? '' : useVercelProxy ? '/station' : configuredApi;
export const publicReview = !localDashboard && (import.meta.env.VITE_REVIEW_MODE === 'true' ||
  (import.meta.env.PROD && !apiBase));
export const initialDemoMode = !localDashboard && (publicReview || !apiBase);

export function sampleReadings(heightCm:number) {
  const now = Date.now();
  return Array.from({length:145},(_,i)=>{
    const levelCm = Math.round(Math.min(heightCm-30, Math.max(0, 23 + 0.26*i + 19*Math.sin(i/18)))*10)/10;
    const at = new Date(now+(i-144)*600000).toISOString();
    return {deviceId:'FW-001',bootId:'sample',sequence:i,observedAtUtc:at,receivedAtUtc:at,
      distanceCm:heightCm-levelCm,levelCm,latitude:14.5995,longitude:120.9842};
  });
}
