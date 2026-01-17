import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  collection,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const listEl = document.querySelector("#public-event-list");
const errorEl = document.querySelector("#public-events-error");

const setMessage = (element, message) => {
  if (!element) {
    return;
  }
  element.textContent = message || "";
  element.hidden = !message;
};

const formatStatus = (status) => {
  if (!status) {
    return "Scheduled";
  }
  return status
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const renderEvents = (snapshot) => {
  if (!listEl) {
    return;
  }
  listEl.innerHTML = "";
  if (snapshot.empty) {
    const empty = document.createElement("p");
    empty.className = "footer-note";
    empty.textContent = "No events yet.";
    listEl.appendChild(empty);
    return;
  }

  snapshot.forEach((docRef) => {
    const data = docRef.data();
    const item = document.createElement("div");
    item.className = "event-item";

    const header = document.createElement("div");
    header.className = "event-meta";

    const title = document.createElement("p");
    title.className = "event-title";
    title.textContent = data.title || "Untitled event";

    const status = document.createElement("span");
    status.className = "pill";
    status.textContent = formatStatus(data.status);

    header.append(title, status);

    const detail = document.createElement("p");
    detail.className = "event-detail";
    const timePart = data.time ? ` at ${data.time}` : "";
    detail.textContent = `${data.date || "TBD"}${timePart}`;

    const location = document.createElement("p");
    location.className = "event-detail";
    location.textContent = data.location ? data.location : "Location TBD";

    const price = document.createElement("p");
    price.className = "event-detail";
    price.textContent = data.price ? `Price: ${data.price}` : "Price TBD";

    item.append(header, detail, location, price);

    if (data.ticketUrl) {
      const ticket = document.createElement("a");
      ticket.href = data.ticketUrl;
      ticket.className = "event-link";
      ticket.textContent = "Get tickets";
      ticket.target = "_blank";
      ticket.rel = "noopener";
      item.appendChild(ticket);
    }

    if (data.notes) {
      const notes = document.createElement("p");
      notes.className = "event-detail";
      notes.textContent = data.notes;
      item.appendChild(notes);
    }

    listEl.appendChild(item);
  });
};

if (!window.firebaseConfig || window.firebaseConfig.apiKey === "REPLACE_ME") {
  setMessage(errorEl, "Missing Firebase config. Update firebase-config.js.");
} else {
  const app = initializeApp(window.firebaseConfig);
  const db = getFirestore(app);
  const eventsQuery = query(collection(db, "events"), orderBy("date", "asc"));

  onSnapshot(eventsQuery, renderEvents, (error) => {
    setMessage(errorEl, error.message);
  });
}
