const injectPartial = async (selector, url) => {
  const target = document.querySelector(selector);
  if (!target) {
    return;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load ${url}: ${response.status}`);
    }
    target.innerHTML = await response.text();
  } catch (error) {
    console.warn(error);
  }
};

const highlightActiveNav = () => {
  const path = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".site-nav a").forEach((link) => {
    const href = link.getAttribute("href");
    if (href === path) {
      link.classList.add("is-active");
    }
  });
};

const bindNavToggle = () => {
  const header = document.querySelector(".site-header");
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".site-nav");
  if (!header || !toggle || !nav) {
    return;
  }

  const closeMenu = () => {
    header.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  };

  toggle.addEventListener("click", () => {
    const isOpen = header.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });

  document.addEventListener("click", (event) => {
    if (!header.contains(event.target)) {
      closeMenu();
    }
  });
};

document.addEventListener("DOMContentLoaded", async () => {
  await Promise.all([
    injectPartial("#site-header", "header.html"),
    injectPartial("#site-footer", "footer.html"),
  ]);
  highlightActiveNav();
  bindNavToggle();
});
