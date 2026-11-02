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
2. Στα **Authorized redirect URIs**, πρόσθεσε ακριβώς: `https://developers.google.com/oauthplayground` και αποθήκευσε. Το `http://localhost:8765/oauth2callback` χρειάζεται μόνο αν επιλέξεις προαιρετικά τον παλιό τοπικό τρόπο.
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

## 2. Browser-only OAuth (χωρίς PowerShell)

**Προτεινόμενος τρόπος για αυτό το project:** το επίσημο [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground/) με **δικό σου OAuth Web Client**. Δεν απαιτεί εγκατάσταση προγραμμάτων ούτε τοπικό terminal.

> Σημαντικό για την ασφάλεια: το OAuth Playground είναι υπηρεσία της Google. Όταν επιλέξεις "Use your own OAuth credentials", το Client ID και το Client Secret μεταφέρονται στους servers της Google για την ανταλλαγή του OAuth code. Μην το χρησιμοποιήσεις αν δεν θέλεις να γίνει αυτό. Με δικό σου Client ID/Secret το Playground δεν ανακαλεί αυτομάτως το refresh token σε 24 ώρες (αλλά ισχύουν οι υπόλοιποι κανόνες λήξης της Google).

1. Google Cloud → **Google Auth Platform → Clients** → επίλεξε το Web OAuth Client του project **Halloween Party Album**.
2. Στο **Authorized redirect URIs** πρόσθεσε **ακριβώς** `https://developers.google.com/oauthplayground`. Save. Μπορείς να κρατήσεις το προηγούμενο localhost URI, δεν χρειάζεται να το χρησιμοποιήσεις.
3. Άνοιξε https://developers.google.com/oauthplayground/ και πάτησε **το γρανάζι επάνω δεξιά**.
4. Ρύθμισε **OAuth flow: Server-side**, **Access type: Offline**, **Force prompt: Consent Screen**. Ενεργοποίησε **Use your own OAuth credentials** και συμπλήρωσε εκεί το **Client ID** και **Client Secret** (ΟΧΙ στη συνομιλία ή στο repository).
5. Στο **Step 1 → Input your own scopes** επικόλλησε **ΜΟΝΟ** `https://www.googleapis.com/auth/drive.file`. Πάτησε **Authorize APIs**.
6. Επίλεξε τον ίδιο προσωπικό Google λογαριασμό που έχει τον φάκελο Halloween και επιβεβαίωσε το ζητούμενο scope. **Μην παραχωρήσεις πλήρη πρόσβαση Drive.**
7. Στο **Step 2** πάτησε **Exchange authorization code for tokens**. Αν ολοκληρωθεί επιτυχώς, θα εμφανιστεί το **Refresh token**. Κράτησέ το προσωρινά ιδιωτικό, για να το περάσεις στο Cloudflare Secret `GOOGLE_REFRESH_TOKEN`. Μην το στείλεις σε chat, GitHub ή screenshot.

> **OAuth Testing:** Για External apps σε Testing τα refresh tokens λήγουν συνήθως μετά από 7 ημέρες. Πριν από πραγματική χρήση, ρύθμισε την κατάσταση δημοσίευσης (Audience) και έλεγξε τις απαιτήσεις Google verification. Μετά από scope/consent αλλαγές, ενδέχεται να χρειαστεί νέο token.

## 3. Cloudflare Worker μέσω Dashboard και GitHub (χωρίς PowerShell)

1. Στον ίδιο Cloudflare λογαριασμό του Atlas άνοιξε https://dash.cloudflare.com/ → **Workers & Pages → Create application** → επέλεξε **GitHub**.
2. Εξουσιοδότησε (αν ζητηθεί) τη σύνδεση GitHub και επίλεξε `PagkalosG/halloween-party`.
3. Όρισε **Worker name**: `halloween-party-album-api` — πρέπει να ταιριάζει ακριβώς με το `name` στο `worker/wrangler.toml`.
4. **Root directory / Project path**: `worker` (όχι η ρίζα του repository). **Production branch**: `main`. **Build command**: κενό εφόσον επιτρέπεται, γιατί δεν απαιτείται μεταγλώττιση. **Deploy command**: `npx wrangler deploy`.
5. Πάτησε **Save and Deploy**. Η πρώτη έκδοση χωρίς secrets θα πρέπει να επιστρέφει στο `/api/config` κατάσταση `ready:false`. Τα uploads παραμένουν κλειστά.
6. Στον νέο Worker → **Settings → Variables and Secrets** πρόσθεσε ακριβώς τα παρακάτω ως **Secret**:
   - `GOOGLE_CLIENT_ID`: το OAuth Client ID
   - `GOOGLE_CLIENT_SECRET`: το OAuth Client Secret
   - `GOOGLE_REFRESH_TOKEN`: το Refresh token από το επίσημο Google Playground
   - `UPLOAD_SIGNING_KEY`: τυχαίο κλειδί τουλάχιστον 32 bytes (φτιάξ' το με password generator, ποτέ μην το κοινοποιήσεις)
   - `TURNSTILE_SITE_KEY`: το δημόσιο site key του Turnstile
   - `TURNSTILE_SECRET`: το μυστικό key του Turnstile
7. Το Turnstile δημιουργείται από Cloudflare Dashboard → **Turnstile**, για το hostname `pagkalosg.github.io`. Μην ενεργοποιήσεις uploads μέχρι να έχουμε ελέγξει το album.

**Public variables** που ορίζονται ήδη στο `worker/wrangler.toml`:
- `DRIVE_FOLDER_ID = "1cnjXZT6E8DQVmUjA7rTO_GZHzq5eRUQC"`
- `FRONTEND_ORIGIN = "https://pagkalosg.github.io"`
- `UPLOADS_ENABLED = "false"` — κλειστό μέχρι τις δοκιμές.
- `UPLOAD_LIMITER` — Cloudflare Rate Limiting binding.

Η ρύθμιση **rate limiting** χρησιμοποιεί το `[[ratelimits]]` του Wrangler (24 προσπάθειες / 60 δευτερόλεπτα ανά κλειδί, κατά προσέγγιση και ανά Cloudflare location). Αν ο Cloudflare λογαριασμός ή η έκδοση της πλατφόρμας δεν υποστηρίζει το binding, **μην το αφαιρέσεις απλώς για να δουλέψουν τα uploads**: ο Worker αποτυγχάνει με ασφαλή τρόπο όταν λείπει.

Το Worker χρησιμοποιεί κρυπτογραφημένα AES-GCM upload session tokens — οι Google resumable upload URLs δεν δημοσιεύονται ως απλό κείμενο στον browser.

Μόλις δημοσιευτεί, κράτησε **μόνο τη δημόσια διεύθυνση** `https://halloween-party-album-api.<subdomain>.workers.dev`. Μπορείς να τη στείλεις στη συνομιλία για να ενημερώσουμε το `config.js` μέσω GitHub. **Μη στείλεις κανένα OAuth ή Turnstile Secret.**

Η εξουσιοδότηση ενός folder και των επιλεγμένων υπαρχόντων αρχείων από το `drive.file` γίνεται στη σελίδα `owner.html` όπως περιγράφεται παρακάτω.

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
- Έχεις δημιουργήσει Turnstile widget με σωστό hostname και έχεις περάσει τα site/secret keys στον Worker. Το ίδιο το challenge ελέγχεται **μόνο όταν ενεργοποιήσουμε δοκιμαστικά** τα uploads.

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
