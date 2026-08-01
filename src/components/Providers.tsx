"use client";

import { useEffect } from "react";
import { Toaster } from "react-hot-toast";
import toast from "react-hot-toast";
import { startOfflineSync } from "@/lib/offline-sync";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    return startOfflineSync((count) => {
      toast.success(
        count === 1
          ? "Sincronizzata 1 modifica offline"
          : `Sincronizzate ${count} modifiche offline`,
      );
    });
  }, []);

  return (
    <>
      {children}
      <Toaster
        position="bottom-center"
        toastOptions={{
          className: "text-sm font-medium",
          style: {
            background: "#1e3d1a",
            color: "#f4faf3",
            borderRadius: "14px",
            padding: "12px 16px",
          },
          success: { iconTheme: { primary: "#9fd49a", secondary: "#1e3d1a" } },
          error: {
            style: { background: "#7f1d1d", color: "#fff" },
          },
        }}
        containerStyle={{ bottom: 88 }}
      />
    </>
  );
}
