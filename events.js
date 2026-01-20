import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  collection,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const upcomingListEl = document.querySelector("#public-event-list");
const previousListEl = document.querySelector("#previous-event-list");
const errorEl = document.querySelector("#public-events-error");
const upcomingEmptyEl = document.querySelector("#public-events-empty");
const previousEmptyEl = document.querySelector("#previous-events-empty");

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

const formatCurrency = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return "$0.00";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
};

const buildEventCard = (data, { showTickets }) => {
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
    const priceValue = Number.isFinite(data.ticketPrice) ? data.ticketPrice : null;
    price.textContent = priceValue !== null
      ? `Price: ${formatCurrency(priceValue)}`
      : "Price TBD";

    const tickets = document.createElement("p");
    tickets.className = "event-detail";
    const maleLeft = Number.isFinite(data.maleTickets) ? data.maleTickets : 0;
    const femaleLeft = Number.isFinite(data.femaleTickets) ? data.femaleTickets : 0;
    tickets.textContent = `Tickets left - Male: ${maleLeft}, Female: ${femaleLeft}`;

    const content = document.createElement("div");
    content.className = "event-content";

    if (data.imageUrl) {
      const poster = document.createElement("img");
      poster.src = data.imageUrl;
      poster.alt = data.title ? `${data.title} poster` : "Event poster";
      poster.loading = "lazy";
      poster.className = "event-image";
      item.appendChild(poster);
    }

    content.append(header, detail, location, price, tickets);

    if (data.notes) {
      const notes = document.createElement("p");
      notes.className = "event-detail";
      notes.textContent = data.notes;
      content.appendChild(notes);
    }

    if (showTickets) {
      const cta = document.createElement("a");
      cta.href = "shop.html";
      cta.className = "btn btn-secondary btn-small";
      cta.textContent = "Get tickets";
      content.appendChild(cta);
    }
    item.appendChild(content);
    return item;
};

const renderEvents = (snapshot) => {
  if (!upcomingListEl || !previousListEl) {
    return;
  }
  upcomingListEl.innerHTML = "";
  previousListEl.innerHTML = "";

  const upcomingItems = [];
  const previousItems = [];

  snapshot.forEach((docRef) => {
    const data = docRef.data();
    const status = String(data.status || "scheduled").toLowerCase();
    if (status === "ended") {
      previousItems.push(buildEventCard(data, { showTickets: false }));
      return;
    }
    if (status === "cancelled") {
      return;
    }
    upcomingItems.push(buildEventCard(data, { showTickets: true }));
  });

  if (!upcomingItems.length) {
    if (upcomingEmptyEl) {
      upcomingEmptyEl.hidden = false;
      upcomingListEl.appendChild(upcomingEmptyEl);
    }
  } else if (upcomingEmptyEl) {
    upcomingEmptyEl.hidden = true;
  }
  upcomingItems.forEach((item) => upcomingListEl.appendChild(item));

  if (!previousItems.length) {
    if (previousEmptyEl) {
      previousEmptyEl.hidden = false;
      previousListEl.appendChild(previousEmptyEl);
    }
  } else if (previousEmptyEl) {
    previousEmptyEl.hidden = true;
  }
  previousItems.forEach((item) => previousListEl.appendChild(item));
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
