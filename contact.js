const form = document.querySelector("#contact-form");
const successEl = document.querySelector("#contact-success");
const errorEl = document.querySelector("#contact-error");

const setMessage = (element, message) => {
  if (!element) {
    return;
  }
  element.textContent = message || "";
  element.hidden = !message;
};

if (!window.firebaseConfig || !window.firebaseConfig.projectId) {
  setMessage(errorEl, "Missing Firebase config. Update firebase-config.js.");
  if (form) {
    form.querySelector("button").disabled = true;
  }
} else if (form) {
  const functionUrl = `https://us-central1-${window.firebaseConfig.projectId}.cloudfunctions.net/contactForm`;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage(successEl, "");
    setMessage(errorEl, "");

    const payload = {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      type: form.type.value,
      message: form.message.value.trim(),
    };

    try {
      const response = await fetch(functionUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Unable to send message.");
      }
      form.reset();
      setMessage(successEl, "Message sent. We will reply soon.");
    } catch (error) {
      setMessage(errorEl, error.message);
    }
  });
}
