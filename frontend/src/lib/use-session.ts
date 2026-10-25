"use client";

import { useEffect, useState } from "react";
import { readSession } from "./session";
import type { Session } from "./types";

/**
 * Hook untuk membaca sesi tersimpan di sisi klien.
 *
 * @returns Sesi aktif, atau `null` saat belum terbaca/tidak ada.
 */
export function useCurrentSession(): Session | null {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    setSession(readSession());
  }, []);

  return session;
}
