document.addEventListener("DOMContentLoaded", function () {
  const e = document.getElementById("search"),
    t = document.querySelectorAll(".clickable-item"),
    n = document.getElementsByTagName("details"),
    o = document.querySelector("header"),
    i = document.querySelector(".menu-icon"),
    a = document.querySelector(".nav-menu"),
    s = document.querySelector(".sidebar-toggle"),
    c = document.querySelector("aside"),
    r = document.querySelector(".main-content");
  let d = o ? o.offsetHeight : 0;
  function updateHeaderHeight() {
    d = o ? o.offsetHeight : 0;
  }
  window.addEventListener("resize", updateHeaderHeight);
  const l = new IntersectionObserver(
    (e) => {
      e.forEach((e) => {
        if (e.isIntersecting) {
          const t = e.target;
          t.hasAttribute("data-loaded") ||
            (t.setAttribute("data-loaded", "true"), l.unobserve(t));
        }
      });
    },
    { rootMargin: "200px" },
  );
  function handleSearch() {
    const t = e.value.toLowerCase().trim();
    let o = null,
      i = null;
    Array.from(n).forEach((e) => {
      const n = e.querySelector("summary"),
        a = n.textContent || n.innerText;
      ("" === t
        ? (e.open = !1)
        : e.hasAttribute("data-priority") && a.toLowerCase().startsWith(t)
          ? ((e.open = !0), i || (i = e))
          : a.toLowerCase().startsWith(t)
            ? ((e.open = !0), o || (o = e))
            : (e.open = !1),
        e.open &&
          !e.hasAttribute("data-loaded") &&
          e.setAttribute("data-loaded", "true"));
    });
    const a = i || o;
    a &&
      setTimeout(() => {
        updateHeaderHeight();
        const e = -d - 0,
          t = a.getBoundingClientRect().top + window.pageYOffset + e;
        window.scrollTo({ top: t, behavior: "smooth" });
      }, 100);
  }
  function closeMenu() {
    (i.classList.remove("active"),
      a.classList.remove("active"),
      document.body.classList.remove("menu-open"));
  }
  (Array.from(n).forEach((e) => l.observe(e)),
    e.addEventListener("input", handleSearch),
    t.forEach((t) => {
      t.addEventListener("click", function () {
        const t = this.textContent.trim();
        ((e.value = t),
          setTimeout(() => {
            handleSearch();
            const t = new Event("input", { bubbles: !0, cancelable: !0 });
            e.dispatchEvent(t);
          }, 0),
          window.innerWidth <= 768 &&
            (c.classList.remove("active"), s.classList.remove("active")));
      });
    }),
    (window.copyCode = function (e) {
      const t = e.closest(".code-container").querySelector("code"),
        n = document.createElement("textarea");
      ((n.value = t.innerText),
        document.body.appendChild(n),
        n.select(),
        document.execCommand("copy"),
        document.body.removeChild(n));
      const o = e.innerHTML,
        i = e.querySelector("i").outerHTML;
      ((e.innerHTML = i + " Copiato!"),
        setTimeout(() => {
          e.innerHTML = o;
        }, 2e3));
    }),
    i &&
      a &&
      (i.addEventListener("click", function () {
        (this.classList.toggle("active"),
          a.classList.toggle("active"),
          document.body.classList.toggle("menu-open"));
      }),
      document.querySelectorAll(".nav-link").forEach((e) => {
        e.addEventListener("click", closeMenu);
      }),
      document.addEventListener("click", function (e) {
        !a.contains(e.target) &&
          !i.contains(e.target) &&
          a.classList.contains("active") &&
          closeMenu();
      })),
    s &&
      c &&
      (s.addEventListener("click", function () {
        (this.classList.toggle("active"),
          c.classList.toggle("active"),
          r.classList.toggle("aside-open"));
      }),
      document.addEventListener("click", function (e) {
        !c.contains(e.target) &&
          !s.contains(e.target) &&
          c.classList.contains("active") &&
          window.innerWidth <= 768 &&
          (s.classList.remove("active"),
          c.classList.remove("active"),
          r.classList.remove("aside-open"));
      })));
  let u = [];
  (window.addEventListener("blur", function () {
    u = Array.from(n).map((e) => e.open);
  }),
    window.addEventListener("focus", function () {
      (updateHeaderHeight(),
        Array.from(n).forEach((e, t) => {
          e.open = u[t] || !1;
        }));
    }),
    window.addEventListener("beforeunload", function () {
      e.value = "";
    }),
    setTimeout(handleSearch, 300));
});
const logos = document.querySelectorAll(".logo"),
  headings = document.querySelectorAll(".invisible-text, .resize-text");
function handleResize() {
  window.innerWidth < 1200
    ? (logos.forEach((e) => (e.style.display = "none")),
      headings.forEach((e) => (e.style.display = "none")))
    : (logos.forEach((e) => (e.style.display = "")),
      headings.forEach((e) => (e.style.display = "")));
}
(window.addEventListener("resize", handleResize), handleResize());
