/** Décalage (ms) entre l'heure murale du fuseau et UTC pour un instant donné. */
function offsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return wall - instant.getTime();
}

/** « yyyy-MM-dd HH:mm » ou « yyyy-MM-dd » lu dans un CSV de l'application bureau (heure murale de l'utilisateur) → instant UTC. */
export function zonedLocalToUtc(local: string, timeZone: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(local.trim());
  if (!m) return new Date(NaN);
  const [y, mo, d, h, mi] = [m[1], m[2], m[3], m[4] ?? '0', m[5] ?? '0'].map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const probe = new Date(guess);
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return new Date(NaN);
  // Deux passes suffisent (changement d'heure compris) : on corrige le décalage mesuré sur la première estimation.
  const first = guess - offsetMs(probe, timeZone);
  return new Date(guess - offsetMs(new Date(first), timeZone));
}
