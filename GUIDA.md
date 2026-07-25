# Guida Feste del Bosco

Questa guida ti spiega **cosa fare una volta sola** (GitHub, Firebase, Vercel) e **come usare l’app** ogni giorno.

---

## Il quadro in 30 secondi

| Servizio | A cosa serve | Lo usi tu? |
|----------|--------------|------------|
| **GitHub** | Salva il codice (macchina del tempo) | Sì, una volta per creare il repository e collegarlo |
| **Vercel** | Mette online l’app (il link per i telefoni) | Sì, una volta: importa il repo GitHub |
| **Firebase** | Salva i dati live (prenotazioni, tavoli, “Arrivato”) | Sì, una volta: crea progetto + chiavi in `.env.local` / Vercel |
| **Questa app** | Interfaccia per staff e admin | Ogni sera dell’evento |

Flusso: **tu (o Cursor) modifichi codice → GitHub → Vercel aggiorna il sito → i telefoni usano Firebase per i dati**.

---

# PARTE A — Setup una tantum

Fai questi passi **in ordine**. Non serve rifarli ogni sera.

## A1. GitHub (archivio codice)

### Cosa fare
1. Vai su [https://github.com](https://github.com) e accedi (o crea un account).
2. Clicca **New repository**.
3. Nome esempio: `feste-del-bosco`.
4. Lascia **vuoto** (niente README se il progetto esiste già sul PC).
5. Crea il repository e copia l’URL (es. `https://github.com/TUONOME/feste-del-bosco.git`).

### Sul PC (cartella del progetto)
Apri il terminale nella cartella `feste-del-bosco` e (quando sei pronto):

```bash
git add .
git commit -m "Prima versione Feste del Bosco"
git branch -M main
git remote add origin https://github.com/TUONOME/feste-del-bosco.git
git push -u origin main
```

> Il repository locale è già inizializzato (`git init`). Manca solo il collegamento al tuo account e il primo push.

**Non caricare mai** il file `.env.local` (contiene le chiavi). È già escluso dal `.gitignore`.

---

## A2. Firebase (magazzino dati)

### Cosa fare
1. Vai su [https://console.firebase.google.com](https://console.firebase.google.com).
2. **Aggiungi progetto** → nome es. `Feste-Del-Bosco`.
3. Nel progetto: **Build → Realtime Database → Crea database**.
   - Scegli una regione (es. Europa).
   - Per l’evento puoi partire in modalità test, poi applica le regole sotto.
4. **Impostazioni progetto** (ingranaggio) → **Le tue app** → aggiungi app **Web** (`</>`).
5. Copia la config (`apiKey`, `authDomain`, `databaseURL`, `projectId`, …).

### Regole database (Realtime Database → Rules)
Incolla qualcosa di simile (per staff interno durante l’evento):

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

> Attenzione: chiunque abbia l’URL può leggere/scrivere. Va bene per un evento interno a breve termine. Per dopo, valuta regole più strette.

### Collegare l’app
1. Nella cartella progetto copia `.env.example` → `.env.local`.
2. Incolla le chiavi:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_DATABASE_URL=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

3. Riavvia `npm run dev` (o ridistribuisci su Vercel).

Finché le chiavi non ci sono, l’app funziona in **modalità Demo** (dati sul telefono/PC, badge “Demo”).

Su **Vercel** dovrai inserire le **stesse** variabili in: Project → Settings → Environment Variables.

---

## A3. Vercel (link pubblico dell’app)

### Cosa fare
1. Vai su [https://vercel.com](https://vercel.com) e accedi (meglio con lo stesso account GitHub).
2. **Add New → Project**.
3. **Import** del repository `feste-del-bosco`.
4. Framework: Next.js (di solito riconosciuto da solo).
5. Aggiungi le variabili `NEXT_PUBLIC_FIREBASE_*` (come in `.env.local`).
6. **Deploy**.

Al termine ottieni un link tipo:

`https://feste-del-bosco.vercel.app`

**Quello è il link da aprire sui telefoni dello staff.**

### Aggiornamenti futuri
Ogni volta che fai push su GitHub (`main`), Vercel ricostruisce l’app da sola in circa 1 minuto.

---

# PARTE B — Come usi l’app (tu e lo staff)

Apri il link Vercel (o `http://localhost:3000` in locale).

## B1. Login

| Ruolo | PIN | Cosa può fare |
|-------|-----|----------------|
| **Staff** | `STAFF2026` | Vedere lista e mappa, segnare **Arrivato** |
| **Admin** | `BOSCOADMIN` | Tutto lo staff + creare/modificare/eliminare prenotazioni + **Modifica zone/tavoli** |

Il login resta salvato: non serve reinserire il PIN a ogni refresh.

---

## B2. Lista prenotazioni (tab Lista)

- Scorri le card: nome, telefono, adulti/bambini, zona, tavolo, note.
- Tocca **Segna** (o swipe a destra) per **Arrivato**.
- Cerca in alto per nome / telefono / tavolo.
- **Solo Admin**: pulsante **Nuova**, Modifica, Elimina.

---

## B3. Mappa tavoli (tab Mappa)

- Scegli la **zona** dalle pill in alto.
- Ogni punto/riquadro è un tavolo:
  - verde chiaro = libero
  - rosso = occupato
  - verde scuro = qualcuno arrivato
- Tocca un tavolo libero (admin) per creare una prenotazione già assegnata lì.
- Tocca un tavolo occupato per vedere/modificare (admin) o un riepilogo (staff).
- **Più prenotazioni sullo stesso tavolo** sono ammesse se la somma delle persone è entro **capacità + 2**. Oltre quel limite compare un popup: puoi **annullare** o **forzare comunque**.

---

## B4. Modifica zone (solo Admin — tab Zone)

Qui configuri il piazzale **prima dell’evento** (da PC o telefono).

1. Apri tab **Zone**.
2. Seleziona una zona (o creane una nuova).
3. Scegli lo strumento:
   - **Tavolo** → tocca per aggiungere un tavolo (oggetto operativo)
   - **Linea** → tieni premuto e trascina (solo riferimento)
   - **Rettangolo** → trascina un’area (solo riferimento)
   - **Scritta** → tocca e digita (es. “Ingresso”, “Bar”)
   - **Seleziona** → tocca un riferimento per modificarlo/eliminarlo
4. Trascina i tavoli per posizionarli; imposta numero e capacità.
5. Salva.

La mappa mostra tavoli + riferimenti. I riferimenti **non** si assegnano alle prenotazioni.

---

## B5. Assegnare un tavolo a una prenotazione

1. Admin → **Nuova** oppure **Modifica**.
2. Compila nome, adulti, bambini, note.
3. Scegli **zona** e **tavolo** (elenco dai tavoli creati nell’editor).
4. Salva.
5. Se il tavolo è pieno oltre la regola (capacità + 2), compare il popup:
   - **Annulla** → non salva
   - **Assegna comunque** → salva forzando

---

## Checklist sera evento

1. [ ] Link Vercel funzionante  
2. [ ] Firebase collegato (niente badge Demo)  
3. [ ] Zone e tavoli già impostati dall’admin  
4. [ ] Prenotazioni caricate  
5. [ ] Staff con PIN `STAFF2026` sui telefoni  
6. [ ] Admin di riserva con `BOSCOADMIN`

---

## Problemi frequenti

| Problema | Cosa controllare |
|----------|------------------|
| Badge **Demo** | Mancano chiavi in `.env.local` o su Vercel |
| Dati non si aggiornano tra telefoni | Firebase non collegato / regole DB / URL database sbagliato |
| Deploy Vercel fallisce | Variabili env, build log su Vercel |
| Non vedo tab Zone | Sei entrato come Staff: serve Admin |

---

## Riepilogo “cosa faccio io adesso”

1. Crea repo su **GitHub** e fai il primo push.  
2. Crea progetto **Firebase** + Realtime Database + copia chiavi in `.env.local` e su Vercel.  
3. Importa il repo su **Vercel** e ottieni il link.  
4. Entra come **Admin**, apri **Zone**, disegna i tavoli.  
5. Carica le prenotazioni e assegna i tavoli.  
6. Dai il link + PIN Staff allo staff.
