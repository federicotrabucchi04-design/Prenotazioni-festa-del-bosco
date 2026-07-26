# Note sviluppo — Feste del Bosco

Riassunto per modifiche future. Stack: **Next.js App Router + TypeScript + Tailwind + Zustand + Firebase RTDB + framer-motion**.

---

## Dove sta cosa

| Area | Percorsi principali |
|------|---------------------|
| Shell app / login | `src/components/App.tsx`, `LoginScreen.tsx`, `AppHeader.tsx`, `BottomNav.tsx` |
| Auth PIN | `src/store/auth-store.ts`, `src/lib/constants.ts` (`PINS`), `src/lib/app-settings.ts` |
| Prenotazioni | `src/lib/reservations.ts`, `hooks/use-reservations.ts`, `components/reservations/*` |
| Layout zone/tavoli | `src/lib/layout.ts`, `layout-utils.ts`, `hooks/use-venue-layout.ts`, `components/zones/ZoneEditor.tsx` |
| Mappa operativa | `components/map/TablesMap.tsx`, `ZoneMarksLayer.tsx` |
| Cartina globale stampa | `components/map/GlobalCartina.tsx`, `lib/cartina.ts`, `lib/cartina-export.ts` |
| Servizio ordini | `lib/order-board.ts`, `hooks/use-order-board.ts`, `components/order/*` |
| Impostazioni admin | `components/SettingsPanel.tsx`, `lib/app-settings.ts`, `hooks/use-app-settings.ts` |
| Serate | `lib/evenings.ts`, `hooks/use-evenings.ts`, `EveningsPanel.tsx` |
| UI store | `store/ui-store.ts` (view, modal, cartina, settings) |
| Regole Firebase | `firebase.rules.json` |

---

## Ruoli (`UserRole`)

`staff` | `admin` | `orderSetup` | `orderDisplay` | `orderKeypad`

- Staff/admin → shell con header + bottom nav.
- Order* → early return in `App.tsx` verso schermi dedicati (niente nav prenotazioni).
- `canEditReservations` = solo admin.
- PIN effettivi: `getAppSettings().pins` (fallback ai default in `constants`).

---

## Firebase paths

| Path | Contenuto |
|------|-----------|
| `venueLayout` | Zone, tavoli (x/y %), marks |
| `evenings`, `activeEveningId` | Serate |
| `eveningReservations/{eveningId}` | Prenotazioni della sera attiva |
| `archives/{eveningId}` | Solo riepiloghi post-archivio |
| `orderBoard` | `assignments`, `highlight`, `cartina` |
| `appSettings` | PIN, highlight, scale, color ranges, capacityOverflow |

Demo mode: `localStorage` se Firebase non configurato (`isFirebaseConfigured()`).

---

## Cartina globale — comportamento atteso

1. Prefs locali `fdb-cartina-prefs-v3` + sync su `orderBoard.cartina` quando si salva/dispone.
2. Lavagna: coordinate % zone (`ZoneOnBoard`) + `MapMark[]`.
3. Anteprima/stampa/PNG: **A4 portrait** (verticale), margini minimi (`globals.css` `@page`, `cartina-export.ts` 2480×3508).
4. Anteprima: step `preview`, root `.cartina-print-root` (in stampa `position: fixed; inset: 0`).

Se l’anteprima “non si vede”: verificare che ci siano `placements`, che lo step sia `preview`, e che in stampa non restino overlay `.no-print`.

---

## Servizio ordini — sync

- Chiave tavolo: `` `${zoneId}_${tableNumber}` ``.
- Highlight: `{ orderNumber, found, at }` — durata da `appSettings.orderHighlightSeconds`.
- Colore numeri: `orderColorRanges` + `colorForOrderNumber()`.
- `setOrderHighlight` / `saveOrderCartina` usano `update()` parziale per ridurre race.
- Display chiama `clearOrderHighlightIf(at)` così un clear vecchio non cancella un highlight nuovo.

---

## Impostazioni — campi

Vedi `AppSettings` in `app-settings.ts`:

- `pins.*`
- `orderHighlightSeconds`, `orderHighlightColor`
- `orderNumberScale`, `orderColorRanges[]`
- `orderMaxDigits`, `capacityOverflow`

`softCapacityLimit()` legge `capacityOverflow` live dalla cache settings.

---

## UI patterns utili

- Overlay fullscreen: `fixed inset-0 z-50` (cartina, settings, assign).
- Safe area: `env(safe-area-inset-*)`.
- Tema: CSS vars `--forest`, `--forest-bg`, `--forest-ink`, `--forest-muted`.
- Print hide: classe `.no-print`.

---

## Checklist prima di un deploy

1. `npm run build` ok.
2. Push `main` → Vercel.
3. Firebase Rules pubblicate = `firebase.rules.json` (include `orderBoard` + `appSettings`).
4. Env `NEXT_PUBLIC_FIREBASE_*` su Vercel (Production/Preview).
5. Smoke test: login admin → Set; cartina anteprima/stampa; ORDINE + SCHERMO + TASTO.

---

## Idee / rischi noti

- Regole RTDB aperte (`.read/.write: true`): ok evento interno, non per produzione pubblica.
- Login può usare PIN default finché non arriva il primo `onValue` di `appSettings`.
- PIN duplicati: ordine di risoluzione admin → staff → order*.
- Preferenze cartina storicamente anche in localStorage: multi-device dipende da sync `orderBoard.cartina` / “Sincronizza disposizione”.

---

## Comandi tipici (Windows)

```powershell
cd progetto\feste-del-bosco
npm.cmd run dev
npm.cmd run build
git add -A; git commit -m "messaggio"; git push origin HEAD
```
