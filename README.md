# Το Αρχείο των Σκιών 🦇

Responsive spooky ψηφιακό άλμπουμ φωτογραφιών και βίντεο. Το frontend φιλοξενείται στο GitHub Pages, το API σε Cloudflare Worker και η αποθήκευση γίνεται στο Google Drive.

**Ασφάλεια (απόφαση έργου):** Προσωπικός Google λογαριασμός με **ΜΟΝΟ** OAuth scope `https://www.googleapis.com/auth/drive.file`, όχι `https://www.googleapis.com/auth/drive`. Οι καλεσμένοι δεν συνδέονται στη Google. Μπορούν να βλέπουν/ανεβάζουν μέσω του δικού μας API, όχι να διαγράφουν. Το backend ελέγχει ότι κάθε εμφανιζόμενο αρχείο ανήκει **απευθείας** στον επιλεγμένο φάκελο.

> ΣΗΜΑΝΤΙΚΟ: Αν κάποιος έχει το URL ή QR μπορεί να δει ό,τι εμφανίζεται στο άλμπουμ, χωρίς login. Τα Cloudflare Secrets δεν φαίνονται στο GitHub. Η επιλογή αρχείων μέσω Google Picker δίνει στην εφαρμογή πρόσβαση μόνο στα συγκεκριμένα επιλεγμένα αρχεία ή σε αρχεία που η εφαρμογή δημιούργησε.

## Υπάρχουσες διευθύνσεις

- GitHub repository: https://github.com/PagkalosG/halloween-party
- Frontend (GitHub Pages): https://pagkalosg.github.io/halloween-party/
- Φάκελος Google Drive (ID): `1cnjXZT6E8DQVmUjA7rTO_GZHzq5eRUQC`
- Google Cloud Project name: **Halloween Party Album**
- Worker name: `halloween-party-album-api`
- Owner-only setup page: https://pagkalosg.github.io/halloween-party/owner.html

## 1. Google Cloud (έχεις κάνει ήδη τα βασικά)

Στο project **Halloween Party Album** έχεις ενεργοποιήσει Drive API, Picker API και έχεις δημιουργήσει Web OAuth Client με Authorized JavaScript Origin `https://pagkalosg.github.io`.

1. Άνοιξε **Google Auth Platform → Clients** → τον OAuth Web Client σου: https://console.cloud.google.com/auth/clients
2. Στα **Authorized redirect URIs**, πρόσθεσε ακριβώς: `http://localhost:8765/oauth2callback` και αποθήκευσε.
3. Στο **Data Access**, χρησιμοποίησε το scope **ΜΟΝΟ** `https://www.googleapis.com/auth/drive.file`. **ΜΗΝ** χρησιμοποιήσεις full `drive` ή `drive.readonly`.
4. Στο **Audience**, βεβαιώσου ότι ο προσωπικός Google λογαριασμός σου είναι **Test user**, αν το app βρίσκεται σε Testing.

### Google Picker API key

Χρειάζεσαι επίσης ένα **API Key** (διαφορετικό από το OAuth Client Secret) που χρησιμοποιείται από το Google Picker μέσα στον browser:

1. Άνοιξε https://console.cloud.google.com/apis/credentials με επιλεγμένο το σωστό project.
2. **Create credentials → API key**.
3. **Edit API key → Application restrictions → Websites**.
4. Πρόσθεσε `https://pagkalosg.github.io/*` **και** `https://docs.google.com/*` (απαιτείται επειδή ο Picker εμφανίζεται μέσα σε iframe από το docs.google.com).
5. **API restrictions → Restrict key → Google Picker API**. Επίλεξε και Drive API μόνο εάν χρησιμοποιείς το API key για απευθείας κλήσεις Drive, κάτι που αυτή η έκδοση δεν κάνει.

Θα χρειαστείς τρία **δημόσια** στοιχεία για τη σελίδα `owner.html`: `OAuth Client ID`, `Google Picker API key`, `Project Number` (αριθμός στο project dashboard). Μην εισάγεις εκεί Client Secret ή Refresh Token. Ούτε το Worker API URL είναι μυστικό.

## 2. Λήψη refresh token με ασφαλή τοπική διαδικασία

Η μέθοδος αυτή **δεν** χρησιμοποιεί Google OAuth Playground ούτε άλλη ενδιάμεση υπηρεσία: τρέχει στον δικό σου Windows/Node υπολογιστή και χρησιμοποιεί **authorization code + PKCE**.

```powershell
git clone https://github.com/PagkalosG/halloween-party.git
cd halloween-party
node worker/scripts/google-auth-local.mjs
```

- Αν έχεις ήδη clone του repository, κάνε `git pull` αντί για νέο clone.
- Συμπλήρωσε **Client ID** και **Client Secret** μόνο στο τοπικό terminal (το Client Secret εμφανίζεται κατά την πληκτρολόγηση). Μην αποθηκεύσεις την έξοδο σε αρχείο.
- Το script εμφανίζει URL της Google. Άνοιξέ το στον browser όπου είσαι συνδεδεμένος στο **ίδιο προσωπικό Google account** που έχει τον φάκελο.
- Επίλεξε το `drive.file` scope. Ο browser επιστρέφει στο `http://localhost:8765/oauth2callback`, και το script τυπώνει το **refresh token μόνο στο terminal**.
- Αυτό το token πηγαίνει **μόνο στο Cloudflare Secret `GOOGLE_REFRESH_TOKEN`**. Δεν πρέπει να μπει ποτέ στο GitHub ή σε συνομιλία.

> OAuth Testing: Για External apps σε Testing τα refresh tokens λήγουν συνήθως μετά από **7 ημέρες**. Πριν την πραγματική εκδήλωση, ολοκλήρωσε την κατάσταση δημοσίευσης της εφαρμογής (Audience → Publish App / In production, αναλόγως της κονσόλας) και έλεγξε αν απαιτείται verification. Εάν μεταβάλεις scope ή ανακαλέσεις πρόσβαση, δημιούργησε νέο token. Το `drive.file` είναι non-sensitive scope, αλλά η πολιτική της Google εξακολουθεί να ισχύει.

## 3. Cloudflare Worker (ξεχωριστός από Atlas)

Στον ίδιο Cloudflare λογαριασμό, θα δημοσιεύσεις έναν **διαφορετικό Worker**. Δεν πρέπει να τροποποιήσεις τον Worker του D&D Atlas.

```powershell
cd worker
npm install
npx wrangler login
npx wrangler deploy
```

Η πρώτη δημοσίευση γίνεται χωρίς Google Secrets: το API θα εμφανίζει `ready:false`, όπως πρέπει.

**Ρύθμισε τα Secrets** από το ίδιο `worker/` folder:

```powershell
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put GOOGLE_REFRESH_TOKEN
npx wrangler secret put UPLOAD_SIGNING_KEY
npx wrangler secret put TURNSTILE_SITE_KEY
npx wrangler secret put TURNSTILE_SECRET
```

Το `UPLOAD_SIGNING_KEY` πρέπει να είναι τυχαίο και ισχυρό. Για παράδειγμα, δημιούργησέ το **στον υπολογιστή σου**:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Μόνο τα πραγματικά ευαίσθητα στοιχεία χρειάζονται Secret· το `TURNSTILE_SITE_KEY` είναι δημόσιο από τη φύση του, αλλά ο Worker το αναμένει ως μεταβλητή και μπορεί επίσης να ρυθμιστεί ως Secret.

Δημιούργησε Cloudflare Turnstile widget για το hostname `pagkalosg.github.io`: https://dash.cloudflare.com/ . Το Site key και Secret key τα παίρνεις από εκεί.

**Τελευταία εντολή** από `worker/`:
```powershell
npx wrangler deploy
```

Στο `worker/wrangler.toml` είναι ήδη:
- `DRIVE_FOLDER_ID`: ο ID του επιλεγμένου φακέλου.
- `FRONTEND_ORIGIN`: `https://pagkalosg.github.io`.
- `UPLOADS_ENABLED = "false"`: **σκόπιμα κλειστό** μέχρι να ολοκληρώσουμε δοκιμές.
- `UPLOAD_LIMITER`: Cloudflare Rate Limiting binding (24 προσπάθειες ανά 60 sec/κλειδί, **κατά προσέγγιση**, ανά Cloudflare location). Χρειάζεται Wrangler >=4.36.

Οι **σύνδεσμοι Drive resumable sessions** δεν επιστρέφονται ποτέ αυτούσιοι στον browser. Το Worker τους κρυπτογραφεί με AES-GCM χρησιμοποιώντας κλειδί που προκύπτει από το `UPLOAD_SIGNING_KEY`.

Μόλις πάρεις το URL του Worker, π.χ. `https://halloween-party-album-api.<subdomain>.workers.dev`, συμπλήρωσε **μόνο αυτό** στο δημόσιο αρχείο `config.js`:
```js
window.SHADOW_ALBUM_CONFIG = {
  apiBase: "https://halloween-party-album-api.<subdomain>.workers.dev"
};
```
Αυτό μπορεί επίσης να γίνει απευθείας από ChatGPT/GitHub αφού δώσεις **μόνο το δημόσιο URL**, όχι secret.

## 4. Google Picker: παραχώρηση πρόσβασης μόνο σε συγκεκριμένα αρχεία

Άνοιξε https://pagkalosg.github.io/halloween-party/owner.html

1. Συμπλήρωσε **OAuth Client ID, περιορισμένο Picker API Key, Google Cloud Project Number** και πάτησε «Αποθήκευση». Αυτά τα δημόσια στοιχεία αποθηκεύονται μόνο στο localStorage του browser.
2. «Σύνδεση με Google» → συνδέσου στον **ίδιο** Google λογαριασμό που χρησιμοποίησες για το refresh token.
3. «Επιλογή φακέλου» → επίλεξε **ακριβώς** τον φάκελο Halloween. Αυτό παραχωρεί στην εφαρμογή πρόσβαση στον φάκελο μέσω `drive.file`.
4. «Εισαγωγή αρχείων με Google Picker» → επέλεξε τις υπάρχουσες φωτογραφίες/βίντεο **που βρίσκονται απευθείας στον φάκελο**. Η εφαρμογή λαμβάνει άδεια μόνο για τα επιλεγμένα αρχεία.
5. «Έλεγχος σύνδεσης Worker»: πρέπει να εμφανίζει ότι ο φάκελος είναι προσβάσιμος.

**Δεν υπάρχει αυτόματη πρόσβαση σε κάθε αρχείο που θα βάλεις απευθείας στο Drive στο μέλλον**. Αν το προσθέσεις χειροκίνητα, ξαναπάτησε «Εισαγωγή» για εκείνο το αρχείο. Αρχεία που ανεβάζουν οι καλεσμένοι μέσω της ιστοσελίδας δημιουργούνται από την εφαρμογή και θα είναι διαθέσιμα χωρίς Picker.

Η owner.html είναι δημόσια διεύθυνση από πλευράς web hosting, αλλά δεν προσφέρει από μόνη της πρόσβαση στο Drive: το Google Picker απαιτεί ατομική Google συγκατάθεση. Μη χρησιμοποιείς αυτή τη σελίδα για διαχείριση άλλου λογαριασμού.

## 5. Ενεργοποίηση uploads μόνο μετά τις δοκιμές

Πρώτα επιβεβαίωσε:
- `GET /api/config` → `ready:true`, `uploadsEnabled:false`.
- `GET /api/folder-access` → `folderAccessible:true`.
- Η ιστοσελίδα φορτώνει επιλεγμένες φωτογραφίες και βίντεο.
- Το Turnstile λειτουργεί στη σελίδα χωρίς σφάλματα.

Έπειτα άλλαξε στο `worker/wrangler.toml` το `UPLOADS_ENABLED = "false"` σε `"true"` και κάνε νέο `npx wrangler deploy`. Τότε `/api/config` πρέπει να δίνει `uploadsEnabled:true`. Έλεγξε μία μικρή φωτογραφία και ένα μικρό MP4 πριν τα μεγάλα uploads.

## Λειτουργίες και περιορισμοί

- Mobile-first gallery, φωτογραφίες/βίντεο, αναζήτηση, ταξινόμηση, lightbox, swipe.
- Νέες φωτογραφίες εμφανίζονται περίπου κάθε 45 δευτερόλεπτα χωρίς reload.
- Resumable uploads με chunks 4 MiB, μέγιστο 300 MB/αρχείο, φωτογραφίες και συγκεκριμένοι τύποι βίντεο.
- Τα βίντεο `.mov`/HEVC μπορεί να μην αναπαράγονται σε όλους τους browsers, χωρίς μετατροπή σε MP4/H.264.
- Δεν υπάρχει endpoint διαγραφής/τροποποίησης για επισκέπτες.
- **Όποιος έχει link/QR βλέπει τη συλλογή**. Δεν είναι ιδιωτικό άλμπουμ με identity verification.
- Δεν υπάρχει ακόμα strict daily upload quota, antivirus scanning ή moderation. Τα Cloudflare rate limits είναι κατά προσέγγιση και δεν εξασφαλίζουν απόλυτη προστασία από κακόβουλο άνθρωπο. Προτείνεται upload window περιορισμένο στη διάρκεια/λίγο μετά το πάρτι και τακτικός έλεγχος αποθηκευτικού χώρου.
- Δεν έχουν διαβιβαστεί Google OAuth Secrets στη συνομιλία ή στο GitHub.

## Αν κάτι πάει στραβά

- `ready:false`: λείπουν Google Secrets από τον Worker.
- `folderAccessible:false`: επέλεξε τον φάκελο με Google Picker, έλεγξε τον λογαριασμό και το OAuth Client ID.
- Δεν εμφανίζονται υπάρχουσες φωτογραφίες: διάλεξέ τις ξεχωριστά μέσω Picker, όχι μόνο τον φάκελο.
- `GOOGLE_AUTH`: το refresh token είναι άκυρο/έληξε, πιθανό λόγω OAuth Testing.
- `redirect_uri_mismatch`: έλεγξε ακριβώς `http://localhost:8765/oauth2callback` στον OAuth Web Client.
- Αν λήξει ή διαρρεύσει token: ανάκληση από τη Google, δημιουργία νέου, ενημέρωση Worker Secret.
