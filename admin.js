import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const loginSection = document.querySelector("[data-admin-login]");
const panelSection = document.querySelector("[data-admin-panel]");
const loginForm = document.querySelector("#admin-login-form");
const errorEl = document.querySelector("[data-admin-error]");
const panelErrorEl = document.querySelector("[data-admin-panel-error]");
const successEl = document.querySelector("[data-admin-success]");
const eventForm = document.querySelector("#event-form");
const eventList = document.querySelector("#event-list");
const signOutButton = document.querySelector("#admin-signout");
const eventCancelButton = document.querySelector("#event-cancel");
const waitlistList = document.querySelector("#waitlist-list");
const waitlistCount = document.querySelector("#waitlist-count");
const waitlistCopyButton = document.querySelector("#waitlist-copy");
const waitlistMessage = document.querySelector("#waitlist-message");

if (loginSection) {
  loginSection.hidden = false;
}
if (panelSection) {
  panelSection.hidden = true;
}

const setMessage = (element, message) => {
  if (!element) {
    return;
  }
  element.textContent = message || "";
  element.hidden = !message;
};

const setError = (message) => {
  setMessage(errorEl, message);
  setMessage(panelErrorEl, message);
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

const eventSubmitButton = eventForm?.querySelector("button[type='submit']");

const resetEventForm = ({ keepMessage = false } = {}) => {
  if (!eventForm) {
    return;
  }
  eventForm.reset();
  delete eventForm.dataset.editId;
  if (eventSubmitButton) {
    eventSubmitButton.textContent = "Add event";
  }
  if (eventCancelButton) {
    eventCancelButton.hidden = true;
  }
  if (!keepMessage) {
    setMessage(successEl, "");
  }
};

const startEventEdit = (docId, data) => {
  if (!eventForm) {
    return;
  }
  eventForm.title.value = data.title || "";
  eventForm.date.value = data.date || "";
  eventForm.time.value = data.time || "";
  eventForm.location.value = data.location || "";
  eventForm.price.value = data.price || "";
  eventForm.ticketUrl.value = data.ticketUrl || "";
  eventForm.status.value = data.status || "scheduled";
  eventForm.notes.value = data.notes || "";
  eventForm.dataset.editId = docId;
  if (eventSubmitButton) {
    eventSubmitButton.textContent = "Update event";
  }
  if (eventCancelButton) {
    eventCancelButton.hidden = false;
  }
  setMessage(successEl, "Editing event. Save to update.");
};

const renderEvents = (snapshot) => {
  if (!eventList) {
    return;
  }
  eventList.innerHTML = "";
  if (snapshot.empty) {
    const empty = document.createElement("p");
    empty.className = "footer-note";
    empty.textContent = "No events yet.";
    eventList.appendChild(empty);
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
      ticket.textContent = "Ticket link";
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

    const actions = document.createElement("div");
    actions.className = "event-actions";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "btn btn-secondary btn-small";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", () => {
      startEventEdit(docRef.id, data);
      eventForm?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "btn btn-ghost btn-small";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", async () => {
      const confirmed = window.confirm("Delete this event?");
      if (!confirmed) {
        return;
      }
      try {
        await deleteDoc(docRef.ref);
        setMessage(successEl, "Event deleted.");
      } catch (error) {
        setError(error.message);
      }
    });

    actions.append(editButton, deleteButton);
    item.appendChild(actions);

    eventList.appendChild(item);
  });
};

if (!window.firebaseConfig || window.firebaseConfig.apiKey === "REPLACE_ME") {
  setError("Missing Firebase config. Update firebase-config.js.");
  if (loginForm) {
    loginForm.querySelector("button").disabled = true;
  }
} else {
  const app = initializeApp(window.firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  let eventsUnsubscribe = null;
  let waitlistUnsubscribe = null;
  let waitlistEmails = [];

  const renderWaitlist = (snapshot) => {
    if (!waitlistList) {
      return;
    }
    waitlistList.innerHTML = "";
    waitlistEmails = [];
    if (waitlistCount) {
      waitlistCount.textContent = String(snapshot.size || 0);
    }
    if (snapshot.empty) {
      const empty = document.createElement("p");
      empty.className = "footer-note";
      empty.textContent = "No signups yet.";
      waitlistList.appendChild(empty);
      return;
    }

    snapshot.forEach((docRef) => {
      const data = docRef.data();
      if (data.email) {
        waitlistEmails.push(data.email);
      }

      const item = document.createElement("div");
      item.className = "waitlist-item";

      const name = document.createElement("p");
      name.className = "waitlist-name";
      name.textContent = data.name || "Unnamed";

      const email = document.createElement("p");
      email.className = "waitlist-email";
      email.textContent = data.email || "No email";

      const merch = document.createElement("span");
      merch.className = "pill";
      merch.textContent = data.merch ? data.merch.replace(/^\w/, (c) => c.toUpperCase()) : "Merch";

      const header = document.createElement("div");
      header.className = "waitlist-row";

      const meta = document.createElement("div");
      meta.className = "waitlist-meta";
      meta.append(name, merch);

      const actions = document.createElement("div");
      actions.className = "waitlist-actions";

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "btn btn-ghost btn-small";
      deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", async () => {
        const confirmed = window.confirm("Delete this waitlist entry?");
        if (!confirmed) {
          return;
        }
        try {
          await deleteDoc(doc(db, "waitlist", docRef.id));
          setMessage(waitlistMessage, "Waitlist entry deleted.");
        } catch (error) {
          setError(error.message);
        }
      });

      actions.append(deleteButton);
      header.append(meta, actions);

      item.append(header, email);
      waitlistList.appendChild(item);
    });
  };

  const startEventsListener = () => {
    if (eventsUnsubscribe || !eventList) {
      return;
    }
    const eventsQuery = query(collection(db, "events"), orderBy("date", "asc"));
    eventsUnsubscribe = onSnapshot(eventsQuery, renderEvents, (error) => {
      setError(error.message);
    });
  };

  const startWaitlistListener = () => {
    if (waitlistUnsubscribe || !waitlistList) {
      return;
    }
    const waitlistQuery = query(
      collection(db, "waitlist"),
      orderBy("createdAt", "desc")
    );
    waitlistUnsubscribe = onSnapshot(waitlistQuery, renderWaitlist, (error) => {
      setError(error.message);
    });
  };

  const stopEventsListener = () => {
    if (eventsUnsubscribe) {
      eventsUnsubscribe();
      eventsUnsubscribe = null;
    }
  };

  const stopWaitlistListener = () => {
    if (waitlistUnsubscribe) {
      waitlistUnsubscribe();
      waitlistUnsubscribe = null;
    }
  };

  onAuthStateChanged(auth, (user) => {
    if (user) {
      loginSection.hidden = true;
      panelSection.hidden = false;
      setError("");
      startEventsListener();
      startWaitlistListener();
    } else {
      loginSection.hidden = false;
      panelSection.hidden = true;
      setError("");
      stopEventsListener();
      stopWaitlistListener();
    }
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setError("");
    const email = loginForm.email.value.trim();
    const password = loginForm.password.value;

    try {
      await signInWithEmailAndPassword(auth, email, password);
      loginForm.reset();
    } catch (error) {
      setError(error.message);
    }
  });

  signOutButton.addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch (error) {
      setError(error.message);
    }
  });

  if (eventCancelButton) {
    eventCancelButton.addEventListener("click", () => {
      resetEventForm();
    });
  }

  if (eventForm) {
    eventForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setError("");
      setMessage(successEl, "");

      const payload = {
        title: eventForm.title.value.trim(),
        date: eventForm.date.value,
        time: eventForm.time.value,
        location: eventForm.location.value.trim(),
        price: eventForm.price.value.trim(),
        ticketUrl: eventForm.ticketUrl.value.trim(),
        status: eventForm.status.value,
        notes: eventForm.notes.value.trim(),
      };
      const editId = eventForm.dataset.editId;

      try {
        if (editId) {
          await updateDoc(doc(db, "events", editId), {
            ...payload,
            updatedAt: serverTimestamp(),
          });
          resetEventForm({ keepMessage: true });
          setMessage(successEl, "Event updated.");
        } else {
          await addDoc(collection(db, "events"), {
            ...payload,
            createdAt: serverTimestamp(),
          });
          resetEventForm({ keepMessage: true });
          setMessage(successEl, "Event added.");
        }
      } catch (error) {
        setError(error.message);
      }
    });
  }

  if (waitlistCopyButton) {
    waitlistCopyButton.addEventListener("click", async () => {
      setMessage(waitlistMessage, "");
      if (!waitlistEmails.length) {
        setMessage(waitlistMessage, "No emails to copy yet.");
        return;
      }

      const text = waitlistEmails.join(", ");
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          setMessage(waitlistMessage, "Emails copied to clipboard.");
        } else {
          setMessage(waitlistMessage, "Clipboard unavailable in this browser.");
        }
      } catch (error) {
        setMessage(waitlistMessage, "Unable to copy emails.");
      }
    });
  }
}
