(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const STORE = 'shadow-album-google-picker-public-settings-v1';
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  let token = '', expires = 0;
  const message = text => { $('status').textContent = text; };
  const fields = () => ({
    clientId: $('clientId').value.trim(),
    pickerKey: $('pickerKey').value.trim(),
    projectNumber: $('projectNumber').value.trim(),
    folderId: $('folderId').value.trim()
  });
  try {
    const previous = JSON.parse(localStorage.getItem(STORE) || '{}');
    for (const id of ['clientId','pickerKey','projectNumber']) if (previous[id]) $(id).value = previous[id];
  } catch { /* storage may be blocked */ }
  $('save').onclick = () => {
    const config = fields();
    if (!config.clientId.endsWith('.apps.googleusercontent.com') ||
        !/^AIza[A-Za-z0-9_-]+$/.test(config.pickerKey) ||
        !/^\d+$/.test(config.projectNumber)) {
      message('Συμπλήρωσε σωστά Client ID, περιορισμένο API key και αριθμό Project Number.');
      return;
    }
    try {
      localStorage.setItem(STORE, JSON.stringify({
        clientId:config.clientId,pickerKey:config.pickerKey,projectNumber:config.projectNumber
      }));
      message('Οι δημόσιες ρυθμίσεις αποθηκεύτηκαν μόνο σε αυτόν τον browser. Δεν είναι μυστικά.');
    } catch { message('Οι δημόσιες ρυθμίσεις είναι έτοιμες, αλλά ο browser δεν επιτρέπει αποθήκευση.'); }
  };
  const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  async function waitFor(name, check) {
    for (let i=0; i<40; i++) { if (check()) return; await pause(150); }
    throw Error('Δεν φορτώθηκε η Google ' + name + '. Έλεγξε blockers και internet.');
  }
  async function ensureToken() {
    if (token && Date.now() < expires - 60_000) return token;
    const {clientId} = fields();
    if (!clientId.endsWith('.apps.googleusercontent.com')) throw Error('Πρώτα συμπλήρωσε OAuth Client ID.');
    await waitFor('Identity Services', () => window.google?.accounts?.oauth2?.initTokenClient);
    return new Promise((resolve, reject) => {
      const auth = google.accounts.oauth2.initTokenClient({
        client_id:clientId,scope:SCOPE,
        include_granted_scopes:false,
        callback: response => {
          if (response.error || !response.access_token) {
            reject(Error(response.error_description || response.error || 'Η Google δεν επέστρεψε access token.'));
            return;
          }
          token = response.access_token;
          expires = Date.now() + (Number(response.expires_in || 3500)*1000);
          message('Επιτυχής σύνδεση Google με το περιορισμένο scope drive.file.\nΜπορείς τώρα να επιλέξεις φάκελο και αρχεία.');
          resolve(token);
        },
        error_callback: error => reject(Error(error?.message || error?.type || 'Η σύνδεση Google ακυρώθηκε.'))
      });
      auth.requestAccessToken({prompt:'consent'});
    });
  }
  function pickerReady() {
    return new Promise(async (resolve,reject) => {
      try {
        await waitFor('Picker', () => window.gapi?.load);
        gapi.load('picker',{callback:resolve,onerror:()=>reject(Error('Δεν φορτώθηκε η βιβλιοθήκη Google Picker.'))});
      } catch(e){reject(e);}
    });
  }
  async function showPicker(kind) {
    const settings = fields();
    if (!/^AIza[A-Za-z0-9_-]+$/.test(settings.pickerKey) ||
        !/^\d+$/.test(settings.projectNumber)) throw Error('Χρειάζονται έγκυρα Google Picker API key και Project Number.');
    const accessToken = await ensureToken();
    await pickerReady();
    const p = google.picker;
    let view;
    if (kind === 'folder') {
      // Let the owner browse all folders before granting access. Filtering
      // immediately by a not-yet-authorized folder can render an empty view.
      // Google Picker enforces user consent when the folder is selected.
      view = new p.DocsView(p.ViewId.FOLDERS)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(true)
        .setMode(p.DocsViewMode.LIST);
    } else {
      view = new p.DocsView(p.ViewId.DOCS)
        .setParent(settings.folderId)
        .setIncludeFolders(false)
        .setMode(p.DocsViewMode.LIST)
        .setMimeTypes('image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif,video/mp4,video/quicktime,video/webm,video/x-matroska');
    }
    const picker = new p.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setDeveloperKey(settings.pickerKey)
      .setAppId(settings.projectNumber)
      .setOrigin(window.location.origin)
      .enableFeature(p.Feature.MULTISELECT_ENABLED)
      .setTitle(kind === 'folder' ? 'Επέλεξε τον φάκελο Halloween' : 'Επέλεξε αναμνήσεις του Halloween')
      .setCallback(response => {
        if (response.action !== p.Action.PICKED) return;
        const docs = response.docs || [];
        if (kind === 'folder') {
          if (docs.some(d => d.id === settings.folderId)) {
            message('Επέλεξες τον σωστό φάκελο. Η εφαρμογή έχει πλέον άδεια πρόσβασης σε αυτόν.\nΕπόμενο: Εισαγωγή υπαρχόντων αρχείων και έλεγχος Worker.');
          } else {
            message('Δεν επέλεξες τον φάκελο του άλμπουμ. ID: ' + settings.folderId);
          }
        } else {
          message('Επέλεξες ' + docs.length + ' αρχείο/α από τον Google Picker.\nΗ Google παραχώρησε στην εφαρμογή πρόσβαση σε αυτά. Όσα είναι απευθείας στον φάκελο Halloween και έχουν τύπο φωτογραφίας/βίντεο θα εμφανίζονται στη gallery, όταν συνδεθεί ο Worker.\nΔεν μετακινήθηκε ή διαγράφηκε κανένα αρχείο.');
        }
      })
      .build();
    picker.setVisible(true);
  }
  async function safely(action) {
    try {await action()} catch(e) {message('Σφάλμα: ' + e.message); }
  }
  $('googleLogin').onclick = () => safely(async () => {await ensureToken();});
  $('pickFolder').onclick = () => safely(() => showPicker('folder'));
  $('pickFiles').onclick = () => safely(() => showPicker('files'));
  $('checkBackend').onclick = () => safely(async () => {
    const api = String(window.SHADOW_ALBUM_CONFIG?.apiBase || '').replace(/\/$/,'');
    if (!api) throw Error('Δεν έχει οριστεί ακόμη Worker URL στο config.js. Πρώτα θα τον δημοσιεύσουμε στο Cloudflare.');
    const response = await fetch(api+'/api/folder-access',{cache:'no-store'});
    const json = await response.json();
    if (!response.ok) throw Error(json.error || 'Δεν μπόρεσα να επικοινωνήσω με τον Worker.');
    message(json.folderAccessible
      ? 'Ο Worker έχει πρόσβαση στον φάκελο μέσω drive.file. Μπορείς να εισάγεις υπάρχοντα αρχεία.'
      : 'Ο Worker ΔΕΝ βλέπει τον φάκελο. Επέλεξε πρώτα τον φάκελο με το Picker και επιβεβαίωσε ότι το OAuth refresh token προέρχεται από τον ίδιο Google λογαριασμό και OAuth Client.');
  });
})();