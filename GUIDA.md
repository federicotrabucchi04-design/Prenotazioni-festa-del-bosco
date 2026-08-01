# Guida all’uso — Feste del Bosco

App per **prenotazioni**, **mappa tavoli**, **cartina stampabile** e **servizio ordini** (tastierino + schermo).

Link tipico: quello del deploy Vercel del progetto.

---

## Accesso (PIN)

| Ruolo | PIN predefinito | Cosa apre |
|-------|-----------------|-----------|
| Staff | `STAFF2026` | Lista + Mappa (segna Arrivato) |
| Admin | `BOSCOADMIN` | Tutto lo staff + Zone + Impostazioni |
| Computer | `COMPUTER2026` | 4 pannelli insieme (schermo, tastierino, staff, ordini) |
| Assegna ordini | `ORDINE2026` | Metti i numeri d’ordine sui tavoli |
| Schermo cartina | `SCHERMO2026` | Cartina a tutto schermo |
| Tastierino | `TASTO2026` | Solo tastiera numerica |

I PIN si possono cambiare da **Admin → Impostazioni** (rotella **Set** in alto o in basso).

---

## Flusso tipico di una serata

1. **Admin** entra e controlla le **serate** (icona calendario).
2. Configura **zone e tavoli** (tab Zone) se serve.
3. Sistema la **Cartina globale** (da Mappa) e sincronizza per lo schermo ordini.
4. Staff usa **Lista** e **Mappa** per prenotazioni e “Arrivato”.
5. Per il servizio cucina/sala: un tablet con **ORDINE2026**, uno con **SCHERMO2026**, uno con **TASTO2026**.
   In alternativa un solo PC con **COMPUTER2026** (tutti e 4 i pannelli insieme).

---

## Dove usare cosa (device)

| Device | PIN consigliato | Cosa vedi |
|--------|-----------------|-----------|
| **Telefono** | Staff / Tastierino | Lista prenotazioni o tastierino grandi tasti |
| **Tablet** | Ordini (`ORDINE2026`) | Assegna numeri sulla cartina |
| **TV verticale** | Schermo (`SCHERMO2026`) | Cartina a tutto schermo + cerchio |
| **PC largo** | Computer / Admin | 4 pannelli oppure gestione completa |

La TV va messa con il **lato lungo in verticale** (portrait): la cartina riempie lo schermo.

---

## Profilo Computer (`COMPUTER2026`)

Schermo diviso in **4 angoli**:

| Angolo | Pannello |
|--------|----------|
| Alto-sx | Schermo cartina live |
| Alto-dx | Tastierino ordini |
| Basso-sx | Lista staff (segna Arrivato) |
| Basso-dx | Assegna numeri d’ordine |

Utile su un PC fisso in sala: un solo login, tutto sotto controllo.

---

## Lista prenotazioni (Staff / Admin)

- Cerca per nome / telefono.
- Tocca **Arrivato** quando il gruppo è al tavolo.
- **Admin**: crea, modifica, elimina; assegna tavolo dalla mappa se manca.

### Prenotazione senza tavolo
Se il tavolo non è ancora scelto, da Lista usa **Assegna** → scegli zona e tavolo sulla mappa.

### Capacità
Più gruppi possono condividere un tavolo fino a **capacità + extra** (extra regolabile in Impostazioni). Oltre il limite l’app chiede conferma.

---

## Mappa tavoli

- Cambia zona con le pill in alto (scorri se sono tante).
- Colori: libero / occupato / arrivato / oltre limite soft.
- Pulsante **Cartina globale** → lavagna stampabile.

---

## Cartina globale (importante per la cassa)

Apri da **Mappa → Cartina globale**.

### 1) Modifica (lavagna)
- Tocca una zona dalla lista “da mettere”, poi tocca dove posizionarla.
- **Sposta** e **ridimensiona** (pallino in basso a destra).
- Strumenti **Linea / Box / Scritta** + colori.
- **Stile cartina A4**: disposizione ispirata al foglio CARTINA (fascia BAR, CASSA, zone che riempiono).
- **Riempi foglio**: espande le zone per usare quasi tutto l’A4.
- **Auto-disponi** / **Svuota lavagna**.
- La disposizione si salva e si sincronizza anche verso lo schermo ordini.

### 2) Anteprima
- Mostra la cartina in proporzione **A4 verticale**, bordo a bordo.
- Nomi + persone sui tavoli occupati; numero tavolo debole sulle celle vuote.
- **Scarica PNG** o **Stampa** (pagina A4 verticale, senza margini inutili).

Suggerimento: in stampa scegli “Adatta alla pagina” / carta A4 verticale.

---

## Zone (solo Admin)

- Aggiungi zone, tavoli (posizione e capacità).
- Linee / rettangoli / scritte di riferimento sulla mappa operativa.
- Salva il layout: vale per tutti i device collegati a Firebase.

---

## Serate (calendario in alto)

- Più serate aperte in parallelo; cambia quella attiva.
- **Archivia** una serata: resta solo un riepilogo (totale persone), non il dettaglio prenotazioni.
- Creare una nuova serata **non** archivia automaticamente quella corrente.

---

## Modalità servizio ordini

### Assegna (`ORDINE2026`)
1. **Sincronizza disposizione** (usa la cartina globale già fatta).
2. Cartina globale o **Per zona**: tocca un tavolo → digita il numero d’ordine → Salva.
3. Un numero ordine sta su **un solo** tavolo.

### Schermo (`SCHERMO2026`)
- Cartina a tutto schermo con i numeri.
- Colori per fasce e dimensione numeri: da Impostazioni admin.
- Quando il tastierino cerca un numero: **cerchio** (colore/durata da Impostazioni), poi sparisce.

### Tastierino (`TASTO2026`)
- Digita il numero → **Cerca sulla cartina**.
- Se esiste, lo schermo lo cerchia; se no, avvisa “non assegnato”.
- **Togli cerchio** per cancellare subito.

---

## Impostazioni (solo Admin)

Apri con il bottone verde **Set** (header) o la tab **Set** in basso.

| Sezione | Cosa regola |
|---------|-------------|
| Password (PIN) | Tutti i PIN di accesso (anche Computer) |
| Servizio ordini | Durata e colore del cerchio; dimensione numeri; cifre max |
| Colori per fasce | Es. 1–19 blu, 20–39 rosso… |
| Capacità | Extra posti senza conferma (capacità + N) |
| **Backup prenotazioni** | Automatico ogni 2 min + dopo modifiche; JSON/CSV; ripristino |
| Ripristina | Torna ai valori di fabbrica |

Le impostazioni sono condivise via Firebase (`appSettings`).

### Backup (importante)
- Parte da solo quando sei loggato (qualsiasi profilo).
- Salva **locale** (browser) e su Firebase (`dataBackups`).
- Da Impostazioni: **Backup ora**, scarica **JSON** completo o **CSV** della serata attiva, **Ripristina** un punto precedente.
- **Archivia serata** NON è un backup: cancella il dettaglio. Usa sempre i backup prima.

---

## Firebase — regole da pubblicare

In Console → Realtime Database → **Rules**, devono esserci almeno:

- `venueLayout`, `evenings`, `activeEveningId`, `eveningReservations`, `archives`
- `orderBoard` (ordini + cartina servizio)
- `appSettings` (PIN e preferenze)
- `dataBackups` (copie di sicurezza prenotazioni)

Copia il file del progetto `firebase.rules.json` e premi **Pubblica**.

---

## Problemi frequenti

| Problema | Cosa fare |
|----------|-----------|
| Non vedo Impostazioni | Entra come **Admin** (`BOSCOADMIN`) |
| Schermo senza cartina | Su Assegna: **Sincronizza disposizione** (dopo aver fatto la Cartina globale) |
| Tastierino non cerchia | Controlla che il numero sia assegnato; regole Firebase `orderBoard` pubblicate |
| PIN personalizzato non funziona | Attendi sync impostazioni / ripeti login; PIN min 4 caratteri |
| Anteprima/stampa tagliata | Usa Anteprima, stampa in **A4 verticale**, margini zero |

---

## Demo vs Live

- Senza chiavi Firebase: modalità **Demo** (dati sul telefono).
- Con Firebase configurato su Vercel: dati **live** tra tutti i device.
