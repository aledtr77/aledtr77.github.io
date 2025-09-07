document.addEventListener("click", (e) => {
  navMenu.contains(e.target) ||
    menuIcon.contains(e.target) ||
    !navMenu.classList.contains("active") ||
    (navMenu.classList.remove("active"), menuIcon.classList.remove("active"));
});
const menuIcon = document.querySelector(".menu-icon"),
  navMenu = document.querySelector(".nav-menu");
menuIcon.addEventListener("click", () => {
  (menuIcon.classList.toggle("active"), navMenu.classList.toggle("active"));
});
const logos = document.querySelectorAll(".logo"),
  headings = document.querySelectorAll(".invisible-text, .resize-text");
function handleResize() {
  window.innerWidth < 860
    ? (logos.forEach((e) => (e.style.display = "none")),
      headings.forEach((e) => (e.style.display = "none")))
    : (logos.forEach((e) => (e.style.display = "")),
      headings.forEach((e) => (e.style.display = "")));
}
(window.addEventListener("resize", handleResize), handleResize());
