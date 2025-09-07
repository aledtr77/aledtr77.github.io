document.addEventListener("DOMContentLoaded", function () {
  (document.querySelectorAll(".nav-link").forEach((t) => {
    t.addEventListener("click", function (t) {
      const o = this.getAttribute("href"),
        e =
          window.location.pathname.endsWith("/") ||
          window.location.pathname.endsWith("/index.html") ||
          "/" === window.location.pathname;
      if ("./index.html" !== o && "/" !== o && "#" !== o) {
        if (o.includes("#")) {
          const [n, i] = o.split("#");
          if (e) {
            t.preventDefault();
            const o = document.getElementById(i);
            if (o) {
              const t = o.offsetTop - 160;
              window.scrollTo({ top: t, behavior: "smooth" });
            }
          } else if ("" === n || "./" === n || "./index.html" === n) return;
        }
      } else
        e &&
          (t.preventDefault(), window.scrollTo({ top: 0, behavior: "smooth" }));
    });
  }),
    window.location.hash &&
      setTimeout(() => {
        const t = document.getElementById(window.location.hash.substring(1));
        if (t) {
          const o = t.offsetTop - 160;
          window.scrollTo({ top: o, behavior: "smooth" });
        }
      }, 0));
});
