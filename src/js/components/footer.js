function initFooterAdjustment(t) {
  let e = !1,
    o = "",
    n = null;
  const i = (function debounced(t) {
    return function () {
      (n && cancelAnimationFrame(n),
        (n = requestAnimationFrame(() => {
          try {
            t();
          } catch (t) {
            console.error(t);
          }
          n = null;
        })));
    };
  })(function adjustFooterPosition() {
    if (!t) return;
    const n = window.innerHeight || document.documentElement.clientHeight,
      i = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
        document.documentElement.offsetHeight,
        document.body.offsetHeight,
      ),
      d = t.offsetHeight || 0,
      r = i <= n;
    return r && !e
      ? ((t.style.position = "fixed"),
        (t.style.left = "0"),
        (t.style.bottom = "0"),
        (t.style.width = "100%"),
        (t.style.zIndex = "1000"),
        (o = document.body.style.paddingBottom || ""),
        (document.body.style.paddingBottom = d + "px"),
        void (e = !0))
      : !r && e
        ? ((t.style.position = ""),
          (t.style.left = ""),
          (t.style.bottom = ""),
          (t.style.width = ""),
          (t.style.zIndex = ""),
          (document.body.style.paddingBottom = o || ""),
          void (e = !1))
        : void 0;
  });
  (setTimeout(() => i(), 0),
    window.addEventListener("resize", i, { passive: !0 }),
    window.addEventListener("orientationchange", i, { passive: !0 }),
    window.addEventListener("load", i),
    setTimeout(() => i(), 400),
    setTimeout(() => i(), 1200));
}
function handleFooterLinks(t) {
  t.querySelectorAll("a").forEach((t) => {
    (!t.getAttribute("href") &&
      t.dataset.href &&
      (t.setAttribute("href", t.dataset.href), delete t.dataset.href),
      t.addEventListener("click", function (t) {
        this.dataset.href && (window.location.href = this.dataset.href);
      }));
  });
}
document.addEventListener("DOMContentLoaded", function () {
  fetch("../../partials/footer.html")
    .then((t) => t.text())
    .then((t) => {
      document.body.insertAdjacentHTML("beforeend", t);
      const e = document.querySelector("footer");
      e
        ? (console.log("Footer caricato con successo"),
          handleFooterLinks(e),
          initFooterAdjustment(e))
        : console.error("Footer non trovato dopo il caricamento");
    })
    .catch((t) => console.error("Error loading footer:", t));
});
