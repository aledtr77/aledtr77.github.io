document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".button-simple").forEach((e) => {
    (e.addEventListener("mousedown", () => {
      e.classList.add("clicked");
    }),
      e.addEventListener("mouseup", () => {
        e.classList.remove("clicked");
      }),
      e.addEventListener("mouseleave", () => {
        e.classList.remove("clicked");
      }));
  });
});
