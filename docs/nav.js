// Menu mobile : le bouton ouvre et ferme la liste des liens de navigation.
const toggle = document.querySelector(".nav__toggle");
const links = document.getElementById("nav-links");

function setOpen(open) {
  links.classList.toggle("is-open", open);
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-label", open ? "Fermer le menu" : "Ouvrir le menu");
}

toggle.addEventListener("click", () => setOpen(!links.classList.contains("is-open")));
// Un lien suivi (ancre de la page comprise) referme le menu.
links.addEventListener("click", (event) => {
  if (event.target.closest("a")) setOpen(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setOpen(false);
});
