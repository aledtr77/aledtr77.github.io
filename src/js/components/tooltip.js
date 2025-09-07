function showTooltip(t, e, i = 2e3) {
  let l = t.querySelector(".tooltiptext");
  (l ||
    ((l = document.createElement("span")),
    (l.className = "tooltiptext"),
    t.appendChild(l),
    t.classList.add("tooltip")),
    (l.textContent = e),
    (l.style.visibility = "visible"),
    (l.style.opacity = "1"),
    setTimeout(() => {
      ((l.style.visibility = "hidden"), (l.style.opacity = "0"));
    }, i));
}
