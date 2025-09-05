!(function () {
  "use strict";
  if (window.__navLoaderActive) return;
  window.__navLoaderActive = !0;
  const e = {
    placeholderSelector: "#nav-menu",
    partialPath: "/partials/nav.html",
    fetchOptions: { cache: "no-store" },
    enableLog: !1,
    forceReload: !1,
  };
  function log(...t) {
    e.enableLog && console.log("[nav-loader]", ...t);
  }
  async function loadNav() {
    const t = document.querySelector(e.placeholderSelector);
    if (t)
      if ("true" !== t.dataset.partialLoaded || e.forceReload)
        try {
          const a = await fetch(e.partialPath, e.fetchOptions);
          if (!a.ok)
            return void console.error(
              "[nav-loader] fetch fallito:",
              a.status,
              e.partialPath,
            );
          const o = await a.text(),
            r = new DOMParser().parseFromString(o, "text/html"),
            n = r.querySelector("ul"),
            i = n ? n.innerHTML.trim() : r.body.innerHTML.trim(),
            l = (t.innerHTML || "").trim();
          if (l && l === i && !e.forceReload)
            return (
              log(
                "Contenuto identico già presente nel placeholder, skip iniezione.",
              ),
              void (t.dataset.partialLoaded = "true")
            );
          ((t.innerHTML = ""),
            (t.innerHTML = n ? n.innerHTML : r.body.innerHTML),
            (t.dataset.partialLoaded = "true"),
            log("Nav iniettata con successo."),
            (function markCurrent(e) {
              const t = normalizePath(location.pathname || "/");
              e.querySelectorAll("a.nav-link").forEach((e) => {
                const a = e.getAttribute("href") || "";
                if (/^(mailto:|tel:|javascript:|#)/i.test(a)) return;
                let o;
                try {
                  o = new URL(a, location.origin).pathname;
                } catch {
                  o = a;
                }
                ((o = normalizePath(o)),
                  o === t
                    ? (e.setAttribute("aria-current", "page"),
                      e.classList.add("is-active"))
                    : (e.removeAttribute("aria-current"),
                      e.classList.remove("is-active")));
              });
            })(t));
        } catch (e) {
          console.error("[nav-loader] errore:", e);
        }
      else log("Placeholder già popolato; esco.");
    else
      console.warn(
        "[nav-loader] placeholder non trovato:",
        e.placeholderSelector,
      );
  }
  function normalizePath(e) {
    return "" ===
      (e = (e = (e = (e || "").split("?")[0].split("#")[0]).replace(
        /index\.html$/i,
        "",
      )).replace(/\/+$/g, ""))
      ? "/"
      : e;
  }
  (document.addEventListener("DOMContentLoaded", loadNav),
    (window.navLoader = { load: loadNav, config: e }));
})();
