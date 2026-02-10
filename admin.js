import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

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
const sponsorForm = document.querySelector("#sponsor-form");
const sponsorList = document.querySelector("#sponsor-list");
const sponsorSuccess = document.querySelector("[data-sponsor-success]");
const sponsorCancelButton = document.querySelector("#sponsor-cancel");
const shopForm = document.querySelector("#shop-form");
const shopList = document.querySelector("#shop-list");
const shopSuccess = document.querySelector("[data-shop-success]");
const shopCancelButton = document.querySelector("#shop-cancel");
const shopImageList = shopForm?.querySelector("[data-shop-images]");
const sizeList = shopForm?.querySelector("[data-size-list]");
const sizeAddButton = shopForm?.querySelector("#size-add");
const shopSettingsForm = document.querySelector("#shop-settings-form");
const shopSettingsSuccess = document.querySelector("[data-shop-settings-success]");
const taxRateInput = shopSettingsForm?.querySelector("[name='taxRate']");
let shopFormImages = [];
let sizeVariants = [];
let eventDocs = [];
let eventRegistrations = new Map();
const ordersList = document.querySelector("#orders-list");
const ordersCount = document.querySelector("#orders-count");

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

const setButtonLoading = (button, isLoading) => {
  if (!button) {
    return;
  }
  button.classList.toggle("loading", isLoading);
  button.disabled = isLoading;
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

const formatShopStatus = (status) => {
  if (!status) {
    return "Available";
  }
  return status
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const eventSubmitButton = eventForm?.querySelector("button[type='submit']");
const sponsorSubmitButton = sponsorForm?.querySelector("button[type='submit']");
const shopSubmitButton = shopForm?.querySelector("button[type='submit']");

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
  eventForm.price.value =
    Number.isFinite(data.ticketPrice) ? data.ticketPrice : "";
  eventForm.maleTickets.value = Number.isFinite(data.maleTickets)
    ? data.maleTickets
    : "";
  eventForm.femaleTickets.value = Number.isFinite(data.femaleTickets)
    ? data.femaleTickets
    : "";
  if (eventForm.eventImage) {
    eventForm.eventImage.value = "";
  }
  eventForm.dataset.imageUrl = data.imageUrl || "";
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

const renderEventsFromDocs = (docs) => {
  if (!eventList) {
    return;
  }
  eventList.innerHTML = "";
  if (!docs.length) {
    const empty = document.createElement("p");
    empty.className = "footer-note";
    empty.textContent = "No events yet.";
    eventList.appendChild(empty);
    return;
  }

  docs.forEach((docRef) => {
    const data = docRef.data();
    const item = document.createElement("div");
    item.className = "event-item";

    const content = document.createElement("div");
    content.className = "event-content";

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
    const maleReg = Number.isFinite(data.registeredMale) ? data.registeredMale : 0;
    const femaleReg = Number.isFinite(data.registeredFemale) ? data.registeredFemale : 0;
    tickets.textContent =
      `Tickets left - Male: ${maleLeft}, Female: ${femaleLeft} • Registered - Male: ${maleReg}, Female: ${femaleReg}`;

    if (data.imageUrl) {
      const thumb = document.createElement("img");
      thumb.src = data.imageUrl;
      thumb.alt = data.title ? `${data.title} poster` : "Event poster";
      thumb.loading = "lazy";
      thumb.className = "event-image";
      item.appendChild(thumb);
    }

    content.append(header, detail, location, price, tickets);

    if (data.notes) {
      const notes = document.createElement("p");
      notes.className = "event-detail";
      notes.textContent = data.notes;
      content.appendChild(notes);
    }

    const registrations = eventRegistrations.get(docRef.id) || [];
    const registrationsWrap = document.createElement("div");
    registrationsWrap.className = "event-registrations";
    if (!registrations.length) {
      const emptyReg = document.createElement("p");
      emptyReg.className = "footer-note";
      emptyReg.textContent = "No registrations yet.";
      registrationsWrap.appendChild(emptyReg);
    } else {
      registrations.forEach((registration) => {
        const row = document.createElement("p");
        row.className = "event-registration";
        const name = registration.name || "Guest";
        const email = registration.email || "No email";
        const qty = registration.quantity || 1;
        const ticketType = registration.ticketType
          ? ` • ${registration.ticketType} x${qty}`
          : ` x${qty}`;
        row.textContent = `${name} (${email})${ticketType}`;
        registrationsWrap.appendChild(row);
      });
    }
    content.appendChild(registrationsWrap);

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
    content.appendChild(actions);
    item.appendChild(content);

    eventList.appendChild(item);
  });
};

const renderEvents = (snapshot) => {
  eventDocs = snapshot.docs || [];
  renderEventsFromDocs(eventDocs);
};

const resetSponsorForm = ({ keepMessage = false } = {}) => {
  if (!sponsorForm) {
    return;
  }
  sponsorForm.reset();
  delete sponsorForm.dataset.editId;
  if (sponsorSubmitButton) {
    sponsorSubmitButton.textContent = "Add sponsor";
  }
  if (sponsorCancelButton) {
    sponsorCancelButton.hidden = true;
  }
  if (!keepMessage) {
    setMessage(sponsorSuccess, "");
  }
};

const startSponsorEdit = (docId, data) => {
  if (!sponsorForm) {
    return;
  }
  sponsorForm.logoUrl.value = data.logoUrl || "";
  sponsorForm.websiteUrl.value = data.websiteUrl || "";
  sponsorForm.name.value = data.name || "";
  sponsorForm.backgroundColor.value = data.backgroundColor || "#ffffff";
  if (sponsorForm.logoFile) {
    sponsorForm.logoFile.value = "";
  }
  sponsorForm.dataset.editId = docId;
  if (sponsorSubmitButton) {
    sponsorSubmitButton.textContent = "Update sponsor";
  }
  if (sponsorCancelButton) {
    sponsorCancelButton.hidden = false;
  }
  setMessage(sponsorSuccess, "Editing sponsor. Save to update.");
};

const renderShopImageList = () => {
  if (!shopImageList) {
    return;
  }
  shopImageList.innerHTML = "";
  if (!shopFormImages.length) {
    const note = document.createElement("p");
    note.className = "footer-note";
    note.textContent = "No images uploaded yet.";
    shopImageList.appendChild(note);
    return;
  }

  const grid = document.createElement("div");
  grid.className = "shop-image-thumb-grid";

  shopFormImages.forEach((url, index) => {
    const thumb = document.createElement("div");
    thumb.className = "shop-image-thumb";

    const img = document.createElement("img");
    img.src = url;
    img.alt = `Uploaded image ${index + 1}`;
    img.loading = "lazy";

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn btn-ghost btn-small";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      shopFormImages = shopFormImages.filter((_, idx) => idx !== index);
      renderShopImageList();
    });

    thumb.append(img, remove);
    grid.appendChild(thumb);
  });

  shopImageList.appendChild(grid);
};

const renderSizeRows = (sizes) => {
  if (!sizeList) {
    return;
  }
  sizeList.innerHTML = "";
  if (!sizes.length) {
    const note = document.createElement("p");
    note.className = "footer-note";
    note.textContent = "No size variants added.";
    sizeList.appendChild(note);
    return;
  }

  sizes.forEach((size, index) => {
    const row = document.createElement("div");
    row.className = "size-row";

    const sizeInput = document.createElement("input");
    sizeInput.type = "text";
    sizeInput.placeholder = "Size (e.g., M)";
    sizeInput.value = size.size || "";
    sizeInput.addEventListener("input", (event) => {
      sizeVariants[index].size = event.target.value.trim();
    });

    const qtyInput = document.createElement("input");
    qtyInput.type = "number";
    qtyInput.min = "0";
    qtyInput.step = "1";
    qtyInput.placeholder = "Qty";
    qtyInput.value = Number.isFinite(size.quantity) ? size.quantity : 0;
    qtyInput.addEventListener("input", (event) => {
      sizeVariants[index].quantity = Number(event.target.value);
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn btn-ghost btn-small";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      sizeVariants.splice(index, 1);
      renderSizeRows(sizeVariants);
    });

    row.append(sizeInput, qtyInput, remove);
    sizeList.appendChild(row);
  });
};

const resetShopForm = ({ keepMessage = false } = {}) => {
  if (!shopForm) {
    return;
  }
  shopForm.reset();
  delete shopForm.dataset.editId;
  if (shopSubmitButton) {
    shopSubmitButton.textContent = "Add item";
  }
  if (shopCancelButton) {
    shopCancelButton.hidden = true;
  }
  if (!keepMessage) {
    setMessage(shopSuccess, "");
  }
  shopFormImages = [];
  if (shopForm.imageFiles) {
    shopForm.imageFiles.value = "";
  }
  renderShopImageList();
  if (sizeList) {
    sizeVariants = [];
    renderSizeRows(sizeVariants);
  }
};

const startShopEdit = (docId, data) => {
  if (!shopForm) {
    return;
  }
  shopForm.name.value = data.name || "";
  shopForm.price.value = data.price ?? "";
  shopForm.quantity.value = Number.isFinite(data.quantity) ? data.quantity : "";
  shopForm.description.value = data.description || "";
  shopForm.status.value = data.status || "available";
  shopFormImages = Array.isArray(data.images) && data.images.length
    ? [...data.images]
    : data.imageUrl
    ? [data.imageUrl]
    : [];
  renderShopImageList();
  if (sizeList) {
    sizeVariants = [];
    if (Array.isArray(data.sizes)) {
      sizeVariants = data.sizes.map((size) =>
        typeof size === "string"
          ? { size, quantity: 0 }
          : { size: size.size || "", quantity: Number(size.quantity) || 0 }
      );
    }
    renderSizeRows(sizeVariants);
  }
  shopForm.dataset.editId = docId;
  if (shopSubmitButton) {
    shopSubmitButton.textContent = "Update item";
  }
  if (shopCancelButton) {
    shopCancelButton.hidden = false;
  }
  setMessage(shopSuccess, "Editing item. Save to update.");
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
  const storage = getStorage(app);
  const functions = getFunctions(app);
  const cancelOrder = httpsCallable(functions, "cancelOrder");
  const cancelOrderItem = httpsCallable(functions, "cancelOrderItem");

  let eventsUnsubscribe = null;
  let registrationsUnsubscribe = null;
  let sponsorsUnsubscribe = null;
  let shopUnsubscribe = null;
  let ordersUnsubscribe = null;
  let settingsUnsubscribe = null;

  const uploadMediaFile = async (folder, file) => {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileRef = ref(storage, `${folder}/${Date.now()}-${safeName}`);
    await uploadBytes(fileRef, file);
    return getDownloadURL(fileRef);
  };


  const renderSponsors = (snapshot) => {
    if (!sponsorList) {
      return;
    }
    sponsorList.innerHTML = "";
    if (snapshot.empty) {
      const empty = document.createElement("p");
      empty.className = "footer-note";
      empty.textContent = "No sponsors yet.";
      sponsorList.appendChild(empty);
      return;
    }

    snapshot.forEach((docRef) => {
      const data = docRef.data();
      const item = document.createElement("div");
      item.className = "sponsor-item";

      const preview = document.createElement("div");
      preview.className = "sponsor-preview";
      if (data.backgroundColor) {
        preview.style.backgroundColor = data.backgroundColor;
      }

      if (data.logoUrl) {
        const img = document.createElement("img");
        img.src = data.logoUrl;
        img.alt = data.name ? `${data.name} logo` : "Sponsor logo";
        img.loading = "lazy";
        preview.appendChild(img);
      } else {
        const fallback = document.createElement("span");
        fallback.className = "footer-note";
        fallback.textContent = "Logo missing";
        preview.appendChild(fallback);
      }

      const meta = document.createElement("div");
      meta.className = "sponsor-meta";

      const name = document.createElement("p");
      name.className = "sponsor-name";
      name.textContent = data.name || "Sponsor logo";

      meta.appendChild(name);

      if (data.websiteUrl) {
        const link = document.createElement("a");
        link.className = "sponsor-link";
        link.href = data.websiteUrl;
        link.target = "_blank";
        link.rel = "noopener";
        link.textContent = "Visit website";
        meta.appendChild(link);
      } else {
        const missing = document.createElement("p");
        missing.className = "footer-note";
        missing.textContent = "No website link";
        meta.appendChild(missing);
      }

      const actions = document.createElement("div");
      actions.className = "sponsor-actions";

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "btn btn-secondary btn-small";
      editButton.textContent = "Edit";
      editButton.addEventListener("click", () => {
        startSponsorEdit(docRef.id, data);
        sponsorForm?.scrollIntoView({ behavior: "smooth", block: "start" });
      });

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "btn btn-ghost btn-small";
      deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", async () => {
        const confirmed = window.confirm("Delete this sponsor?");
        if (!confirmed) {
          return;
        }
        try {
          await deleteDoc(doc(db, "sponsors", docRef.id));
          setMessage(sponsorSuccess, "Sponsor deleted.");
          if (sponsorForm?.dataset.editId === docRef.id) {
            resetSponsorForm();
          }
        } catch (error) {
          setError(error.message);
        }
      });

      actions.append(editButton, deleteButton);
      item.append(preview, meta, actions);
      sponsorList.appendChild(item);
    });
  };

  const renderShopItems = (snapshot) => {
    if (!shopList) {
      return;
    }
    shopList.innerHTML = "";
    if (snapshot.empty) {
      const empty = document.createElement("p");
      empty.className = "footer-note";
      empty.textContent = "No shop items yet.";
      shopList.appendChild(empty);
      return;
    }

    snapshot.forEach((docRef) => {
      const data = docRef.data();
      const item = document.createElement("div");
      item.className = "shop-item";

      const images = Array.isArray(data.images) && data.images.length
        ? data.images
        : data.imageUrl
        ? [data.imageUrl]
        : [];
      const cover = images[0];
      const media = document.createElement("div");
      media.className = "shop-item-media";

      if (cover) {
        const img = document.createElement("img");
        img.src = cover;
        img.alt = data.name ? `${data.name} photo` : "Shop item";
        img.loading = "lazy";
        media.appendChild(img);
      } else {
        const fallback = document.createElement("span");
        fallback.className = "footer-note";
        fallback.textContent = "Image missing";
        media.appendChild(fallback);
      }

      const meta = document.createElement("div");
      meta.className = "shop-item-meta";

      const name = document.createElement("p");
      name.className = "shop-item-name";
      name.textContent = data.name || "Untitled item";

      const price = document.createElement("p");
      price.className = "shop-item-price";
      price.textContent = formatCurrency(data.price);

      const status = document.createElement("span");
      status.className = "pill";
      status.textContent = formatShopStatus(data.status);

      meta.append(name, price, status);

      if (Array.isArray(data.sizes) && data.sizes.length) {
        const sizes = document.createElement("p");
        sizes.className = "footer-note";
        sizes.textContent = `Sizes: ${data.sizes
          .map((size) =>
            typeof size === "string"
              ? size
              : `${size.size || ""} (${Number(size.quantity) || 0})`
          )
          .filter(Boolean)
          .join(", ")}`;
        meta.appendChild(sizes);
      } else {
        const quantity = document.createElement("p");
        quantity.className = "footer-note";
        const qtyValue = Number.isFinite(data.quantity) ? data.quantity : 0;
        quantity.textContent = `Quantity: ${qtyValue}`;
        meta.appendChild(quantity);
      }

      if (data.description) {
        const desc = document.createElement("p");
        desc.className = "footer-note";
        desc.textContent = data.description;
        meta.appendChild(desc);
      }

      const actions = document.createElement("div");
      actions.className = "shop-item-actions";

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "btn btn-secondary btn-small";
      editButton.textContent = "Edit";
      editButton.addEventListener("click", () => {
        startShopEdit(docRef.id, data);
        shopForm?.scrollIntoView({ behavior: "smooth", block: "start" });
      });

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "btn btn-ghost btn-small";
      deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", async () => {
        const confirmed = window.confirm("Delete this item?");
        if (!confirmed) {
          return;
        }
        try {
          await deleteDoc(doc(db, "shopItems", docRef.id));
          setMessage(shopSuccess, "Shop item deleted.");
          if (shopForm?.dataset.editId === docRef.id) {
            resetShopForm();
          }
        } catch (error) {
          setError(error.message);
        }
      });

      actions.append(editButton, deleteButton);
      item.append(media, meta, actions);
      shopList.appendChild(item);
    });
  };

  const renderOrders = (snapshot) => {
    if (!ordersList) {
      return;
    }
    ordersList.innerHTML = "";
    if (ordersCount) {
      ordersCount.textContent = String(snapshot.size || 0);
    }
    if (snapshot.empty) {
      const empty = document.createElement("p");
      empty.className = "footer-note";
      empty.textContent = "No orders yet.";
      ordersList.appendChild(empty);
      return;
    }

    snapshot.forEach((docRef) => {
      const data = docRef.data();
      const item = document.createElement("div");
      item.className = "order-item";

      const header = document.createElement("div");
      header.className = "order-header";

      const name = document.createElement("p");
      name.className = "order-name";
      const orderId = data.orderId ? `#${data.orderId}` : "";
      name.textContent = orderId
        ? `${data.name || "Customer"} ${orderId}`
        : data.name || "Customer";

      const paid = document.createElement("span");
      paid.className = "pill";
      paid.textContent = data.paid ? "Paid" : "Unpaid";

      const statusValue = String(data.status || "").toLowerCase();
      const isCanceled = statusValue === "canceled";
      const isPartiallyRefunded = statusValue === "partially-refunded";
      const isRefunded = statusValue === "refunded";
      const hasRefundedItems = (data.items || []).some(
        (orderItem) => Number(orderItem.canceledQuantity) > 0
      );
      const blockFullCancel = isPartiallyRefunded || hasRefundedItems;
      const canceledPill = document.createElement("span");
      if (isCanceled || isPartiallyRefunded || isRefunded) {
        canceledPill.className = "pill";
        canceledPill.textContent = isCanceled
          ? "Refunded"
          : isRefunded
          ? "Refunded"
          : "Partial refund";
      }

      const total = document.createElement("p");
      total.className = "order-total";
      const totalValue = Number(data.total);
      const subtotalValue = Number(data.subtotal);
      const displayTotal = isCanceled || isRefunded
        ? 0
        : Number.isFinite(totalValue)
        ? totalValue
        : Number.isFinite(subtotalValue)
        ? subtotalValue
        : 0;
      total.textContent = formatCurrency(displayTotal);

      header.append(name, total, paid);
      if (isCanceled || isPartiallyRefunded || isRefunded) {
        header.append(canceledPill);
      }

      const meta = document.createElement("p");
      meta.className = "footer-note order-meta";
      const emailText = data.email ? data.email : "No email";
      const taxText =
        Number.isFinite(data.taxAmount) && data.taxAmount > 0
          ? `Tax: ${formatCurrency(data.taxAmount)}`
          : "";
      meta.textContent = taxText ? `${emailText} • ${taxText}` : emailText;

      const items = document.createElement("div");
      items.className = "order-items";
      const orderItems = data.items || [];
      const hasMultipleItems = orderItems.length > 1;
      orderItems.forEach((orderItem) => {
        const row = document.createElement("div");
        row.className = "order-line-row";
        const line = document.createElement("p");
        line.className = "order-line";
        const sizeLabel = orderItem.size ? ` (${orderItem.size})` : "";
        line.textContent = `${orderItem.name || "Item"}${sizeLabel} x${orderItem.quantity || 1}`;

        const canceledQty = Number(orderItem.canceledQuantity) || 0;
        if (canceledQty) {
          line.classList.add("order-line-canceled");
          const canceledLabel = document.createElement("span");
          canceledLabel.className = "pill";
          canceledLabel.textContent = "Refunded";
          row.append(line, canceledLabel);
        } else {
          row.appendChild(line);
          if (data.paid && !isCanceled && !isRefunded && hasMultipleItems) {
            const cancelButton = document.createElement("button");
            cancelButton.type = "button";
            cancelButton.className = "btn btn-ghost btn-small";
            cancelButton.textContent = "Cancel item";
            const cancelSpinner = document.createElement("span");
            cancelSpinner.className = "btn-spinner";
            cancelButton.appendChild(cancelSpinner);
            cancelButton.addEventListener("click", async () => {
              const confirmText = window.prompt(
                'Type "refund" to cancel this item:'
              );
              if (!confirmText || confirmText.trim().toLowerCase() !== "refund") {
                setError('Refund not processed. Type "refund" to confirm.');
                return;
              }
              setButtonLoading(cancelButton, true);
              try {
                await cancelOrderItem({
                  orderId: docRef.id,
                  itemId: orderItem.id,
                  itemType: orderItem.type || "shop",
                  itemSize: orderItem.size || "",
                });
              } catch (error) {
                setButtonLoading(cancelButton, false);
                setError(error.message);
              }
            });
            row.appendChild(cancelButton);
          }
        }
        items.appendChild(row);
      });

      const notes = document.createElement("p");
      notes.className = "footer-note";
      notes.textContent = data.notes ? `Notes: ${data.notes}` : "";
      notes.hidden = !data.notes;

      const actions = document.createElement("div");
      actions.className = "order-actions";
      if (isCanceled || isRefunded) {
        const canceledNote = document.createElement("p");
        canceledNote.className = "footer-note";
        canceledNote.textContent = "Order refunded.";
        actions.appendChild(canceledNote);
      } else {
        const shippingStatus = String(data.shippingStatus || "ordered").toLowerCase();
        if (shippingStatus === "shipped") {
          const shipped = document.createElement("span");
          shipped.className = "pill";
          shipped.textContent = "Shipped";
          actions.appendChild(shipped);
          if (data.trackingNumber) {
            const tracking = document.createElement("p");
            tracking.className = "footer-note";
            tracking.textContent = `Tracking: ${data.trackingNumber}`;
            actions.appendChild(tracking);
          }
        } else {
          const markShipped = document.createElement("button");
          markShipped.className = "btn btn-secondary btn-small";
          markShipped.type = "button";
          markShipped.textContent = "Ordered";
          markShipped.addEventListener("click", async () => {
            const trackingNumber = window.prompt("Enter tracking number:");
            if (!trackingNumber || !trackingNumber.trim()) {
              return;
            }
            try {
              await updateDoc(doc(db, "orders", docRef.id), {
                shippingStatus: "shipped",
                trackingNumber: trackingNumber.trim(),
                shippedAt: serverTimestamp(),
              });
            } catch (error) {
              setError(error.message);
            }
          });
          actions.appendChild(markShipped);
        }

        if (blockFullCancel) {
          const cancelNote = document.createElement("p");
          cancelNote.className = "footer-note";
          cancelNote.textContent =
            "Partial refunds applied. Full order cancellation is disabled.";
          actions.appendChild(cancelNote);
        } else {
          const cancelButton = document.createElement("button");
          cancelButton.className = "btn btn-secondary btn-small";
          cancelButton.type = "button";
          cancelButton.textContent = "Cancel order";
          const cancelSpinner = document.createElement("span");
          cancelSpinner.className = "btn-spinner";
          cancelButton.appendChild(cancelSpinner);
          cancelButton.addEventListener("click", async () => {
            const confirmText = window.prompt('Type "refund" to cancel this order:');
            if (!confirmText || confirmText.trim().toLowerCase() !== "refund") {
              setError('Refund not processed. Type "refund" to confirm.');
              return;
            }
            setButtonLoading(cancelButton, true);
            try {
              await cancelOrder({orderId: docRef.id});
            } catch (error) {
              setButtonLoading(cancelButton, false);
              setError(error.message);
            }
          });
          actions.appendChild(cancelButton);
        }
      }

      const footer = document.createElement("div");
      footer.className = "order-footer";
      footer.append(meta, actions);

      item.append(header, items, notes, footer);
      ordersList.appendChild(item);
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
    startRegistrationsListener();
  };

  const renderRegistrations = (snapshot) => {
    eventRegistrations = new Map();
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const eventId = data.eventId;
      if (!eventId) {
        return;
      }
      if (!eventRegistrations.has(eventId)) {
        eventRegistrations.set(eventId, []);
      }
      eventRegistrations.get(eventId).push({
        name: data.name || "",
        email: data.email || "",
        ticketType: data.ticketType || "",
        quantity: Number(data.quantity) || 1,
      });
    });
    if (eventDocs.length) {
      renderEventsFromDocs(eventDocs);
    }
  };

  const startRegistrationsListener = () => {
    if (registrationsUnsubscribe || !eventList) {
      return;
    }
    const registrationsQuery = query(
      collectionGroup(db, "registrations")
    );
    registrationsUnsubscribe = onSnapshot(
      registrationsQuery,
      renderRegistrations,
      (error) => {
        setError(error.message);
      }
    );
  };


  const startSponsorsListener = () => {
    if (sponsorsUnsubscribe || !sponsorList) {
      return;
    }
    const sponsorsQuery = query(
      collection(db, "sponsors"),
      orderBy("createdAt", "desc")
    );
    sponsorsUnsubscribe = onSnapshot(sponsorsQuery, renderSponsors, (error) => {
      setError(error.message);
    });
  };

  const startShopListener = () => {
    if (shopUnsubscribe || !shopList) {
      return;
    }
    const shopQuery = query(
      collection(db, "shopItems"),
      orderBy("createdAt", "desc")
    );
    shopUnsubscribe = onSnapshot(shopQuery, renderShopItems, (error) => {
      setError(error.message);
    });
  };

  const startOrdersListener = () => {
    if (ordersUnsubscribe || !ordersList) {
      return;
    }
    const ordersQuery = query(
      collection(db, "orders"),
      where("paid", "==", true),
      orderBy("createdAt", "desc")
    );
    ordersUnsubscribe = onSnapshot(ordersQuery, renderOrders, (error) => {
      setError(error.message);
    });
  };

  const startSettingsListener = () => {
    if (settingsUnsubscribe || !taxRateInput) {
      return;
    }
    const settingsRef = doc(db, "settings", "shop");
    settingsUnsubscribe = onSnapshot(settingsRef, (snapshot) => {
      if (!snapshot.exists()) {
        return;
      }
      const data = snapshot.data();
      if (taxRateInput) {
        taxRateInput.value = Number.isFinite(data.taxRate) ? data.taxRate : "";
      }
    });
  };

  const stopEventsListener = () => {
    if (eventsUnsubscribe) {
      eventsUnsubscribe();
      eventsUnsubscribe = null;
    }
    if (registrationsUnsubscribe) {
      registrationsUnsubscribe();
      registrationsUnsubscribe = null;
    }
  };


  const stopSponsorsListener = () => {
    if (sponsorsUnsubscribe) {
      sponsorsUnsubscribe();
      sponsorsUnsubscribe = null;
    }
  };

  const stopShopListener = () => {
    if (shopUnsubscribe) {
      shopUnsubscribe();
      shopUnsubscribe = null;
    }
  };

  const stopOrdersListener = () => {
    if (ordersUnsubscribe) {
      ordersUnsubscribe();
      ordersUnsubscribe = null;
    }
  };

  const stopSettingsListener = () => {
    if (settingsUnsubscribe) {
      settingsUnsubscribe();
      settingsUnsubscribe = null;
    }
  };

  onAuthStateChanged(auth, (user) => {
    if (user) {
      loginSection.hidden = true;
      panelSection.hidden = false;
      setError("");
      startEventsListener();
      startSponsorsListener();
      startShopListener();
      startOrdersListener();
      startSettingsListener();
    } else {
      loginSection.hidden = false;
      panelSection.hidden = true;
      setError("");
      stopEventsListener();
      stopSponsorsListener();
      stopShopListener();
      stopOrdersListener();
      stopSettingsListener();
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

      let imageUrl = eventForm.dataset.imageUrl || "";
      if (eventForm.eventImage && eventForm.eventImage.files) {
        const [file] = eventForm.eventImage.files;
        if (file) {
          imageUrl = await uploadMediaFile("events", file);
        }
      }

      const payload = {
        title: eventForm.title.value.trim(),
        date: eventForm.date.value,
        time: eventForm.time.value,
        location: eventForm.location.value.trim(),
        ticketPrice: Number(eventForm.price.value) || 0,
        maleTickets: Number(eventForm.maleTickets.value) || 0,
        femaleTickets: Number(eventForm.femaleTickets.value) || 0,
        imageUrl,
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


  if (sponsorForm) {
    sponsorForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setError("");
      setMessage(sponsorSuccess, "");

      const name = sponsorForm.name.value.trim();
      const backgroundColor = sponsorForm.backgroundColor?.value?.trim();
      const logoFile = sponsorForm.logoFile?.files?.[0];
      const logoUrlInput = sponsorForm.logoUrl.value.trim();
      let logoUrl = logoUrlInput;
      const editId = sponsorForm.dataset.editId;

      try {
        if (logoFile) {
          logoUrl = await uploadMediaFile("sponsors", logoFile);
        }

        if (!logoUrl) {
          setError("Add a logo URL or upload a logo image.");
          return;
        }

        const payload = {
          logoUrl,
          websiteUrl: sponsorForm.websiteUrl.value.trim(),
          name: name || "",
          backgroundColor: backgroundColor || "",
        };

        if (editId) {
          await updateDoc(doc(db, "sponsors", editId), {
            ...payload,
            updatedAt: serverTimestamp(),
          });
          resetSponsorForm({ keepMessage: true });
          setMessage(sponsorSuccess, "Sponsor updated.");
        } else {
          await addDoc(collection(db, "sponsors"), {
            ...payload,
            createdAt: serverTimestamp(),
          });
          resetSponsorForm({ keepMessage: true });
          setMessage(sponsorSuccess, "Sponsor added.");
        }
      } catch (error) {
        setError(error.message);
      }
    });
  }

  if (sponsorCancelButton) {
    sponsorCancelButton.addEventListener("click", () => {
      resetSponsorForm();
    });
  }

  if (shopForm) {
    shopForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setError("");
      setMessage(shopSuccess, "");

      const name = shopForm.name.value.trim();
      const priceValue = Number(shopForm.price.value);
      const quantityValue = Number(shopForm.quantity.value);
      if (!name) {
        setError("Add a shop item name.");
        return;
      }
      if (!Number.isFinite(priceValue)) {
        setError("Add a valid price.");
        return;
      }
      const sizes = sizeVariants
        .map((entry) => ({
          size: (entry.size || "").trim(),
          quantity: Number(entry.quantity) || 0,
        }))
        .filter((entry) => entry.size);

      if (!sizes.length) {
        if (!Number.isFinite(quantityValue) || quantityValue < 0) {
          setError("Add a valid quantity.");
          return;
        }
      } else {
        shopForm.quantity.value = "";
      }
      const imageFiles = Array.from(shopForm.imageFiles?.files || []);
      const uploadedUrls = await Promise.all(
        imageFiles.map((file) => uploadMediaFile("shop-items", file))
      );
      const finalImages = [...shopFormImages, ...uploadedUrls];

      if (!finalImages.length) {
        setError("Upload at least one product image.");
        return;
      }

      shopFormImages = finalImages;
      renderShopImageList();

      const payload = {
        name,
        price: priceValue,
        description: shopForm.description.value.trim(),
        images: finalImages,
        imageUrl: finalImages[0],
        sizes,
        quantity: sizes.length ? null : quantityValue,
        status: shopForm.status.value,
      };
      const editId = shopForm.dataset.editId;

      try {
        if (editId) {
          await updateDoc(doc(db, "shopItems", editId), {
            ...payload,
            updatedAt: serverTimestamp(),
          });
          resetShopForm({ keepMessage: true });
          setMessage(shopSuccess, "Shop item updated.");
        } else {
          await addDoc(collection(db, "shopItems"), {
            ...payload,
            createdAt: serverTimestamp(),
          });
          resetShopForm({ keepMessage: true });
          setMessage(shopSuccess, "Shop item added.");
        }
      } catch (error) {
        setError(error.message);
      }
    });
  }

  if (shopCancelButton) {
    shopCancelButton.addEventListener("click", () => {
      resetShopForm();
    });
  }

  if (sizeAddButton) {
    sizeAddButton.addEventListener("click", () => {
      sizeVariants.push({ size: "", quantity: 0 });
      renderSizeRows(sizeVariants);
    });
  }

  if (shopSettingsForm) {
    shopSettingsForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setError("");
      setMessage(shopSettingsSuccess, "");

      const taxRateValue = Number(taxRateInput?.value);
      if (!Number.isFinite(taxRateValue) || taxRateValue < 0) {
        setError("Add a valid tax percentage.");
        return;
      }

      try {
        await setDoc(
          doc(db, "settings", "shop"),
          { taxRate: taxRateValue, updatedAt: serverTimestamp() },
          { merge: true }
        );
        setMessage(shopSettingsSuccess, "Shop settings saved.");
      } catch (error) {
        setError(error.message);
      }
    });
  }
}
