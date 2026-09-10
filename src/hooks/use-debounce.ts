"use client";

import { useEffect, useState } from "react";

/**
 * Delays a fast-changing value so a server query does not fire on every
 * keystroke. Typing "Rashid" runs one search, not six.
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
