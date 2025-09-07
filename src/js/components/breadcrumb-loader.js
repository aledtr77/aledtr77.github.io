// /js/breadcrumb-loader.js
// Breadcrumb loader completo e robusto (sostituisci interamente il file con questo)
// - supporta varianti di nome dei frammenti
// - cerca in più percorsi candidate
// - inserisce il frammento nel DOM (header -> nextSibling, fallback top body)
// - rende cliccabile l'ultima breadcrumb (aria-current="page") in modo sicuro
// - logging configurabile

(function () {
  'use strict';

  // CONFIG
  const ENABLE_LOG = true; // true per debug in console, false in produzione
  const FRAGMENTS_BASE = '../../includes/'; // legacy base
  const SOURCE_PREFIX = '/html'; // non usato attivamente ma lasciato per compatibilità
  const EXTRA_CANDIDATE_PATHS = ['/includes/', '/html/includes/', '/_includes/'];

  function log(...args) { if (ENABLE_LOG) console.log('[breadcrumb-loader]', ...args); }

  // --- helper: normalizza path -> nome pagina ---
  function pageNameFromPath(p) {
    if (!p) return 'index';
    p = p.replace(/^\/+|\/+$/g, ''); // strip leading/trailing slashes
    if (!p) return 'index';
    // sostituisce slash con underscore e rimuove .html finale
    return p.replace(/\//g, '_').replace(/\.html$/i, '');
  }

  // Ritorna varianti possibili di nome file per un dato pathname
  function nameVariantsForPath(pathname) {
    const raw = (pathname || '').replace(/^\/+|\/+$/g, ''); // 'risorse/index.html' oppure 'risorse'
    const segs = raw ? raw.split('/').filter(Boolean) : [];
    const fullName = pageNameFromPath(pathname); // es: 'risorse_index' o 'risorse'
    const variants = new Set();

    // 1) variante predefinita
    variants.add(fullName + '.html');

    // 2) se termina con _index -> aggiungi versione senza suffix
    if (/_index$/i.test(fullName)) {
      variants.add(fullName.replace(/_index$/i, '') + '.html');
    }

    // 3) aggiungi l'ultimo segmento come file (es: 'index' -> dirName)
    const last = segs.length ? segs[segs.length - 1].replace(/\.html$/i, '') : 'index';
    variants.add(last + '.html');

    // 4) se last è 'index' prova anche il nome della cartella precedente: 'risorse.html'
    if (last.toLowerCase() === 'index' && segs.length >= 2) {
      variants.add(segs[segs.length - 2].replace(/\.html$/i, '') + '.html');
    }

    // 5) fallback generico
    variants.add('index.html');

    return Array.from(variants);
  }

  // Costruisce lista di URL candidate (in ordine preferenziale)
  function candidateFragmentUrls(pathname) {
    const names = nameVariantsForPath(pathname);
    const candidates = [];

    // 1) legacy base (relative)
    names.forEach(n => candidates.push(FRAGMENTS_BASE + n));

    // 2) percorsi assoluti noti
    EXTRA_CANDIDATE_PATHS.forEach(base => {
      names.forEach(n => candidates.push(base.replace(/\/+$/, '/') + n));
    });

    // 3) origine + percorsi utili (dev / gh-pages)
    try {
      const origin = window.location.origin || (location.protocol + '//' + location.hostname + (location.port ? ':' + location.port : ''));
      names.forEach(n => {
        candidates.push(origin + '/includes/' + n);
        candidates.push(origin + '/html/includes/' + n);
        candidates.push(origin + '/_includes/' + n);
      });
    } catch (e) {
      // noop
    }

    // 4) nome semplice (server potrebbe risolverlo)
    names.forEach(n => candidates.push(n));

    // dedup e ritorna
    return Array.from(new Set(candidates));
  }

  // Inserisce l'HTML nel DOM (header.nextSibling o fallback top body)
  function insertHtml(html) {
    let container = document.getElementById('breadcrumb-container');
    if (!container) {
      const header = document.querySelector('header');
      if (header) {
        container = document.createElement('div');
        container.id = 'breadcrumb-container';
        header.parentNode.insertBefore(container, header.nextSibling);
      } else {
        // fallback: topo del body
        container = document.createElement('div');
        container.id = 'breadcrumb-container';
        document.body.insertBefore(container, document.body.firstChild);
        log('header non trovato: inserito container in cima al body (fallback).');
      }
    }

    // Inseriamo l'HTML (comportamento originale)
    container.innerHTML = html;

    // Tentiamo di rendere l'ultima breadcrumb cliccabile in modo resiliente
    try {
      makeCurrentClickable(container);
    } catch (err) {
      // Non vogliamo mai interrompere il flusso: logghiamo e procediamo.
      log('makeCurrentClickable error:', err && err.message ? err.message : err);
    }

    // Notifica eventuali consumer (es. JSON-LD rebuild)
    if (window.rebuildBreadcrumbs) {
      try { window.rebuildBreadcrumbs(); } catch (e) { log('rebuildBreadcrumbs error', e); }
    }
    if (window.onBreadcrumbsLoaded) {
      try { window.onBreadcrumbsLoaded(); } catch (e) { /* ignore */ }
    }
  }

  // Prova i candidate in sequenza fino a trovare una risposta OK (status 200..299)
  function fetchFirstSuccessful(candidates) {
    let i = 0;
    function next() {
      if (i >= candidates.length) return Promise.resolve(null);
      const url = candidates[i++];
      log('Trying fragment URL:', url);
      return fetch(url, { cache: 'no-cache' })
        .then(resp => {
          log(' ->', url, 'status', resp.status);
          if (!resp.ok) return next();
          return resp.text().then(text => ({ url, text }));
        })
        .catch(err => {
          log('fetch error for', url, err && err.message ? err.message : err);
          return next();
        });
    }
    return next();
  }

  // Carica il frammento corretto per la pathname corrente
  function loadBreadcrumb() {
    const pathname = location.pathname || '/';
    const candidates = candidateFragmentUrls(pathname);
    log('Candidates:', candidates);
    return fetchFirstSuccessful(candidates)
      .then(found => {
        if (!found) {
          log('Nessun frammento breadcrumb trovato per', pathname);
          return;
        }
        log('Frammento caricato da', found.url);
        insertHtml(found.text);
      })
      .catch(err => log('Loader error', err));
  }

  // waitAndLoad: usa MutationObserver per aspettare header inserito dinamicamente, con fallback timeout
  function waitAndLoad(timeout = 2500) {
    if (document.querySelector('header')) {
      return loadBreadcrumb();
    }
    const obs = new MutationObserver((mut, o) => {
      if (document.querySelector('header')) {
        o.disconnect();
        log('Header trovato via MutationObserver.');
        loadBreadcrumb();
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    // fallback: dopo timeout chiudiamo observer e procediamo
    setTimeout(() => {
      try { obs.disconnect(); } catch (e) {}
      if (!document.querySelector('header')) log('Timeout: header non trovato entro', timeout, 'ms — procedo comunque.');
      loadBreadcrumb();
    }, timeout);
  }

  // Avvio: controlla readyState e aspetta DOMContentLoaded se necessario
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => waitAndLoad(2500));
  } else {
    waitAndLoad(2500);
  }

  // -------------------------
  // Funzione ausiliaria: makeCurrentClickable
  // - Rende cliccabile l'elemento con aria-current="page" senza rompere il markup esistente.
  // - Gestisce questi casi:
  //   * aria-current è già su <a> -> aggiunge classe
  //   * aria-current è su <li> ma c'è un <a> interno -> trasferisce/classa e assicura aria-current sull'<a>
  //   * aria-current è su elemento plain -> incapsula innerHTML in <a>
  // - Non lancia eccezioni non gestite (catch interno)
  // -------------------------
  function makeCurrentClickable(container) {
    if (!container) return;
    const current = container.querySelector('[aria-current="page"]');
    if (!current) return;

    // Se è già un <a>, aggiungiamo solo la classe
    try {
      if (current.tagName && current.tagName.toLowerCase() === 'a') {
        current.classList.add('breadcrumb-reset');
        return;
      }

      // Se dentro current c'è un <a>, aggiungiamo la classe al <a> e assicuriamo aria-current sia sul <a>
      const innerA = current.querySelector && current.querySelector('a');
      if (innerA) {
        innerA.classList.add('breadcrumb-reset');
        innerA.setAttribute('aria-current', 'page');
        return;
      }

      // Altrimenti creiamo un <a> che punta al "clean href" (origin + pathname) e incapsuliamo il contenuto
      const origin = (window.location && window.location.origin) || (location.protocol + '//' + location.hostname + (location.port ? ':' + location.port : ''));
      const cleanHref = origin + (window.location && window.location.pathname ? window.location.pathname : '/');

      const anchor = document.createElement('a');
      anchor.href = cleanHref;
      anchor.title = 'Reset pagina';
      anchor.className = 'breadcrumb-reset';
      anchor.setAttribute('aria-current', 'page');

      // Preserviamo l'innerHTML del nodo corrente (se hai script inline o span ecc. verrà mantenuto)
      // Se preferisci solo il testo, sostituisci con anchor.textContent = current.textContent;
      anchor.innerHTML = current.innerHTML || (current.textContent || 'Reset');

      // Sostituiamo il contenuto del nodo corrente con l'anchor
      while (current.firstChild) current.removeChild(current.firstChild);
      current.appendChild(anchor);

      // Nota: non aggiungiamo event listener che prevenga la navigation per mantenere comportamento predicibile.
      // Se vuoi usare location.replace per non aggiungere entry nella history, decommenta il blocco seguente:
      //
      // anchor.addEventListener('click', function (e) {
      //   e.preventDefault();
      //   location.replace(cleanHref);
      // });

    } catch (e) {
      // Log e swallow — non vogliamo che un errore faccia "sparire" tutto il widget
      log('Errore durante makeCurrentClickable (non fatale):', e && e.message ? e.message : e);
    }
  }

})(); // IIFE chiusa
