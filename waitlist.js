import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  addDoc,
  collection,
  getFirestore,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const form = document.querySelector("#waitlist-form");
const successEl = document.querySelector("#waitlist-success");
const errorEl = document.querySelector("#waitlist-error");

const setMessage = (element, message) => {
  if (!element) {
    return;
  }
  element.textContent = message || "";
  element.hidden = !message;
};

if (!window.firebaseConfig || window.firebaseConfig.apiKey === "REPLACE_ME") {
  setMessage(errorEl, "Missing Firebase config. Update firebase-config.js.");
  if (form) {
    form.querySelector("button").disabled = true;
  }
} else if (form) {
  const app = initializeApp(window.firebaseConfig);
  const db = getFirestore(app);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage(successEl, "");
    setMessage(errorEl, "");

    const payload = {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      merch: form.merch.value,
      createdAt: serverTimestamp(),
    };

    try {
      await addDoc(collection(db, "waitlist"), payload);
      form.reset();
      setMessage(successEl, "You are on the list. We will be in touch soon.");
    } catch (error) {
      setMessage(errorEl, error.message);
    }
  });
}
