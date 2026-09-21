"use client";

import { useEffect, useState } from "react";
import { getAppSettings } from "@/lib/settings";
import { DEFAULT_TIME_ZONE } from "@/lib/tz";

/**
 * The organisation's timezone (Settings → General), so a punch reads as the
 * office wall clock rather than the viewer's — the register means nothing if a
 * manager on a trip sees everyone checking in at 4 am.
 *
 * Fetched once per page load and shared: several panels on the attendance page
 * want it, and settings change about once a year.
 */
let cached: string | null = null;
let inflight: Promise<string> | null = null;

function loadTimeZone(): Promise<string> {
  inflight ??= getAppSettings()
    .then((s) => {
      cached = s.timezone || DEFAULT_TIME_ZONE;
      return cached;
    })
    .catch(() => {
      // Settings unreachable: the office clock is a better guess than the
      // viewer's, and every stored punch was written against it anyway.
      inflight = null;
      return DEFAULT_TIME_ZONE;
    });
  return inflight;
}

export function useOrgTimeZone(): string {
  const [timeZone, setTimeZone] = useState(cached ?? DEFAULT_TIME_ZONE);

  useEffect(() => {
    if (cached) return;
    let active = true;
    loadTimeZone().then((tz) => {
      if (active) setTimeZone(tz);
    });
    return () => {
      active = false;
    };
  }, []);

  return timeZone;
}
