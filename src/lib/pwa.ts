"use client";

// display-mode alone misses iOS, which reports standalone only through the
// legacy navigator flag, and misses Android launches from the installed icon.
// Guessing "browser" here costs the user an 83-day-shorter session.
export function isInstalledApp(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    document.referrer.startsWith("android-app://")
  );
}
