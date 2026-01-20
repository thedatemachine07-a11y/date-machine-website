import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  collection,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const listEl = document.querySelector("[data-sponsor-list]");
const emptyEl = document.querySelector("[data-sponsor-empty]");
const errorEl = document.querySelector("[data-sponsor-error]");

const setMessage = (element, message) => {
  if (!element) {
    return;
  }
  element.textContent = message || "";
  element.hidden = !message;
};

const renderSponsors = (snapshot) => {
  if (!listEl) {
    return;
  }
  listEl.innerHTML = "";
  if (snapshot.empty) {
    setMessage(emptyEl, "New sponsor spots are open.");
    return;
  }

  setMessage(emptyEl, "");

  snapshot.forEach((docRef) => {
    const data = docRef.data();
    const card = data.websiteUrl
      ? document.createElement("a")
      : document.createElement("div");
    card.className = "sponsor-card";

    if (data.websiteUrl) {
      card.href = data.websiteUrl;
      card.target = "_blank";
      card.rel = "noopener";
    }

    if (data.logoUrl) {
      const wrap = document.createElement("div");
      wrap.className = "sponsor-logo-wrap";
      if (data.backgroundColor) {
        wrap.style.backgroundColor = data.backgroundColor;
      }

      const img = document.createElement("img");
      img.className = "sponsor-logo";
      img.src = data.logoUrl;
      img.alt = data.name ? `${data.name} logo` : "Sponsor logo";
      img.loading = "lazy";
      wrap.appendChild(img);
      card.appendChild(wrap);
    } else {
      const fallback = document.createElement("div");
      fallback.className = "sponsor-fallback";
      fallback.textContent = data.name || "Sponsor";
      card.appendChild(fallback);
    }

    if (data.name) {
      card.classList.add("has-name");
      const name = document.createElement("span");
      name.className = "sponsor-name";
      name.textContent = data.name;
      card.appendChild(name);
    }

    listEl.appendChild(card);
  });
};

if (!listEl) {
  // Sponsors are not rendered on this page.
} else if (!window.firebaseConfig || window.firebaseConfig.apiKey === "REPLACE_ME") {
  setMessage(errorEl, "Missing Firebase config. Update firebase-config.js.");
} else {
  const app = initializeApp(window.firebaseConfig);
  const db = getFirestore(app);
  const sponsorsQuery = query(
    collection(db, "sponsors"),
    orderBy("createdAt", "desc")
  );

  onSnapshot(sponsorsQuery, renderSponsors, (error) => {
    setMessage(errorEl, error.message);
  });
}
