"use client";

import { useEffect, useState } from "react";
import {
  type AppSettings,
  DEFAULT_SETTINGS,
  getAppSettings,
  subscribeAppSettings,
} from "@/lib/app-settings";

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => getAppSettings());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribeAppSettings((next) => {
      setSettings(next);
      setLoading(false);
    });
    return unsub;
  }, []);

  return { settings, loading, defaults: DEFAULT_SETTINGS };
}
