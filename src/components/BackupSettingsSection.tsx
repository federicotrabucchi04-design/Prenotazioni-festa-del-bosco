"use client";

import { useEffect, useState } from "react";
import { Download, HardDriveDownload, RefreshCw, RotateCcw } from "lucide-react";
import toast from "react-hot-toast";
import {
  type BackupSnapshot,
  createBackup,
  downloadActiveEveningCsv,
  downloadBackupJson,
  formatBackupWhen,
  listLocalBackups,
  listRemoteBackups,
  restoreBackup,
  subscribeBackupMeta,
  getBackupMeta,
} from "@/lib/backup";

export function BackupSettingsSection() {
  const [meta, setMeta] = useState(getBackupMeta);
  const [items, setItems] = useState<BackupSnapshot[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeBackupMeta(setMeta), []);

  useEffect(() => {
    void refreshList();
  }, [meta.lastBackupAt]);

  async function refreshList() {
    try {
      const list = await listRemoteBackups();
      setItems(list.slice(0, 8));
    } catch {
      setItems(listLocalBackups().slice(0, 8));
    }
  }

  async function runBackup() {
    setBusy(true);
    try {
      await createBackup("manual");
      toast.success("Backup salvato (locale + cloud)");
      await refreshList();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore backup");
    } finally {
      setBusy(false);
    }
  }

  async function onRestore(snapshot: BackupSnapshot) {
    setBusy(true);
    try {
      const ok = await restoreBackup(snapshot);
      if (ok) {
        toast.success("Backup ripristinato — ricarica la pagina se serve");
        window.setTimeout(() => window.location.reload(), 600);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore ripristino");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border border-emerald-200/80 bg-emerald-50/60 p-4">
      <p className="mb-1 text-sm font-semibold text-[var(--forest-ink)]">
        Backup prenotazioni
      </p>
      <p className="mb-3 text-xs text-[var(--forest-muted)]">
        Automatico ogni 2 minuti e dopo ogni modifica. Copie in questo
        dispositivo e su Firebase. Non confondere con “Archivia serata” (che
        cancella il dettaglio).
      </p>

      <div className="mb-3 rounded-2xl bg-white/80 px-3 py-2 text-xs text-[var(--forest-ink)]">
        <p>
          Ultimo backup:{" "}
          <span className="font-semibold">
            {formatBackupWhen(meta.lastBackupAt)}
          </span>
          {meta.lastSource ? ` · ${meta.lastSource}` : ""}
        </p>
        {meta.lastError ? (
          <p className="mt-1 font-semibold text-red-700">{meta.lastError}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void runBackup()}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-[var(--forest)] px-3 py-2.5 text-xs font-bold text-white disabled:opacity-50"
        >
          <HardDriveDownload className="h-3.5 w-3.5" />
          Backup ora
        </button>
        <button
          type="button"
          disabled={busy || items.length === 0}
          onClick={() => {
            const latest = items[0];
            if (!latest) return;
            downloadBackupJson(latest);
            toast.success("JSON scaricato");
          }}
          className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-white px-3 py-2.5 text-xs font-semibold text-[var(--forest)] disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          JSON
        </button>
        <button
          type="button"
          disabled={busy || items.length === 0}
          onClick={() => {
            try {
              const latest = items[0];
              if (!latest) return;
              downloadActiveEveningCsv(latest);
              toast.success("CSV prenotati scaricato");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Errore CSV");
            }
          }}
          className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-white px-3 py-2.5 text-xs font-semibold text-[var(--forest)] disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          CSV
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void refreshList()}
          className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-white px-3 py-2.5 text-xs font-semibold text-[var(--forest)]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {items.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {items.map((b) => (
            <li
              key={b.id}
              className="flex items-center justify-between gap-2 rounded-2xl bg-white/90 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-[var(--forest-ink)]">
                  {formatBackupWhen(b.createdAt)} · {b.reservationCount} pren.
                </p>
                <p className="text-[10px] text-[var(--forest-muted)]">
                  {b.source}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => downloadBackupJson(b)}
                  className="rounded-xl bg-[var(--forest)]/8 px-2 py-1.5 text-[10px] font-semibold text-[var(--forest)]"
                >
                  File
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onRestore(b)}
                  className="inline-flex items-center gap-1 rounded-xl bg-amber-50 px-2 py-1.5 text-[10px] font-semibold text-amber-900"
                >
                  <RotateCcw className="h-3 w-3" />
                  Ripristina
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-[var(--forest-muted)]">
          Nessun backup ancora — verrà creato automaticamente.
        </p>
      )}
    </section>
  );
}
