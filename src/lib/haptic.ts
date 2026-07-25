export function haptic(pattern: number | number[] = 12) {
  if (typeof navigator === "undefined") return;
  if (!("vibrate" in navigator)) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // ignore unsupported environments
  }
}
