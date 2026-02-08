/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {setGlobalOptions} = require("firebase-functions");
const {HttpsError, onCall, onRequest} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {onDocumentWritten} = require("firebase-functions/v2/firestore");
const {
  defineBoolean,
  defineInt,
  defineSecret,
  defineString,
} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const Stripe = require("stripe");

admin.initializeApp();
const db = admin.firestore();

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({maxInstances: 10});

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

const smtpPass = defineSecret("SMTP_PASS");
const smtpHostParam = defineString("SMTP_HOST");
const smtpPortParam = defineInt("SMTP_PORT");
const smtpUserParam = defineString("SMTP_USER");
const smtpFromParam = defineString("SMTP_FROM");
const smtpToParam = defineString("SMTP_TO", {
  default: "help@blinddatebox.com",
});
const smtpSecureParam = defineBoolean("SMTP_SECURE");
const stripeSecret = defineSecret("STRIPE_SECRET_KEY");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");

exports.contactForm = onRequest(
    {cors: true, secrets: [smtpPass]},
    async (req, res) => {
      if (req.method !== "POST") {
        res.status(405).json({ok: false, error: "Method not allowed."});
        return;
      }

      const {name, email, type, message} = req.body || {};
      if (!name || !email || !message) {
        res.status(400).json({ok: false, error: "Missing required fields."});
        return;
      }

      const smtpHost = smtpHostParam.value();
      const smtpPort = smtpPortParam.value() || 587;
      const smtpUser = smtpUserParam.value();
      const smtpFrom = smtpFromParam.value() || smtpUser;
      const smtpTo = smtpToParam.value() ||
        "help@blinddatebox.com";
      const smtpSecure = smtpSecureParam.value() || false;
      const pass = smtpPass.value();

      logger.info("Contact form request received.", {
        name,
        email,
        type: type || "general",
        hasMessage: Boolean(message),
        smtpHost,
        smtpPort,
        smtpUser,
        smtpFrom,
        smtpTo,
        smtpSecure,
      });

      if (!smtpHost || !smtpUser || !pass) {
        logger.error("Missing SMTP config.");
        res.status(500).json({
          ok: false,
          error: "Email service not configured.",
        });
        return;
      }

      try {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpSecure,
          auth: {
            user: smtpUser,
            pass,
          },
        });

        await transporter.sendMail({
          from: smtpFrom,
          to: smtpTo,
          replyTo: email,
          subject: `Contact form: ${type || "general"}`,
          text: [
            `Name: ${name}`,
            `Email: ${email}`,
            `Type: ${type || "general"}`,
            "",
            message,
          ].join("\n"),
        });

        res.status(200).json({ok: true});
      } catch (error) {
        logger.error("Contact form error", error);
        res.status(500).json({ok: false, error: "Unable to send message."});
      }
    },
);

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

const roundCurrency = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const parsePriceValue = (value) => {
  if (Number.isFinite(value)) {
    return value;
  }
  const cleaned = String(value || "").replace(/[^0-9.]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeSizeEntries = (sizes) => {
  if (!Array.isArray(sizes)) {
    return [];
  }
  return sizes.map((sizeEntry) => {
    if (typeof sizeEntry === "string") {
      return {size: sizeEntry, quantity: 0};
    }
    return {
      size: sizeEntry.size || "",
      quantity: Number(sizeEntry.quantity) || 0,
    };
  });
};

const createEventRegistrations = async (order, orderDocId) => {
  const items = Array.isArray(order.items) ? order.items : [];
  const registrations = items.filter((item) => item.type === "event");
  if (!registrations.length) {
    return;
  }
  const batch = db.batch();
  const orderId = order.orderId || orderDocId || "";
  const orderDocKey = orderDocId || "";
  registrations.forEach((item) => {
    const regRef = db.collection("events").doc(item.id)
        .collection("registrations").doc();
    batch.set(regRef, {
      eventId: item.id,
      orderId,
      orderDocId: orderDocKey,
      name: String(order.name || ""),
      email: String(order.email || ""),
      ticketType: String(item.size || ""),
      quantity: Number(item.quantity) || 1,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();
};

const removeEventRegistrations = async (orderId, orderDocId) => {
  const orderKey = String(orderId || "");
  const docKey = String(orderDocId || "");
  if (!orderKey && !docKey) {
    return;
  }
  const snapshots = [];
  if (orderKey) {
    snapshots.push(
        await db.collectionGroup("registrations")
            .where("orderId", "==", orderKey)
            .get(),
    );
  }
  if (docKey && docKey !== orderKey) {
    snapshots.push(
        await db.collectionGroup("registrations")
            .where("orderDocId", "==", docKey)
            .get(),
    );
  }
  if (!snapshots.length) {
    return;
  }
  const batch = db.batch();
  let hasDeletes = false;
  snapshots.forEach((snapshot) => {
    snapshot.forEach((docSnap) => {
      hasDeletes = true;
      batch.delete(docSnap.ref);
    });
  });
  if (!hasDeletes) {
    return;
  }
  await batch.commit();
};

const removeEventRegistrationsForItem = async (
    orderId,
    orderDocId,
    item,
) => {
  if ((!orderId && !orderDocId) || !item || !item.id) {
    return;
  }
  const orderKey = String(orderId || "");
  const docKey = String(orderDocId || "");
  const ticketType = String(item.size || "").trim().toLowerCase();
  const registrationsRef = db.collection("events").doc(item.id)
      .collection("registrations");
  const snapshot = await registrationsRef.get();
  if (snapshot.empty) {
    return;
  }
  const batch = db.batch();
  let hasDeletes = false;
  snapshot.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const dataOrderId = String(data.orderId || "");
    const dataOrderDocId = String(data.orderDocId || "");
    const matchesOrder =
      (orderKey &&
        (dataOrderId === orderKey || dataOrderDocId === orderKey)) ||
      (docKey && (dataOrderId === docKey || dataOrderDocId === docKey));
    if (!matchesOrder) {
      return;
    }
    const dataTicket = String(data.ticketType || "").trim().toLowerCase();
    if (ticketType && dataTicket && dataTicket !== ticketType) {
      return;
    }
    hasDeletes = true;
    batch.delete(docSnap.ref);
  });
  if (!hasDeletes) {
    return;
  }
  await batch.commit();
};

const buildOrderId = () => {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `DM-${stamp}-${rand}`;
};

const buildReceiptHtml = (order) => {
  const items = Array.isArray(order.items) ? order.items : [];
  const eventDetails = order.eventDetails || {};
  const itemLines = items.map((item) => {
    const sizeLabel = item.size ? ` (${item.size})` : "";
    const qty = Number(item.quantity) || 1;
    const eventInfo = item.type === "event" && eventDetails[item.id] ?
      ` <em>${eventDetails[item.id]}</em>` :
      "";
    const label = item.name || "Item";
    return `<li>${label}${sizeLabel} &times; ${qty}${eventInfo}</li>`;
  });

  const addressParts = [
    order.address,
    order.city,
    order.state,
    order.zip,
  ].filter(Boolean);

  return `
    <div style="font-family:Arial, sans-serif; line-height:1.6;">
      <h2 style="margin:0 0 12px;">Thanks for your order!</h2>
      <p><strong>Order ID:</strong> ${order.orderId || ""}</p>
      <p><strong>Paid:</strong> ${order.paid ? "Yes" : "No"}</p>
      <p><strong>Items:</strong></p>
      <ul>
        ${itemLines.join("")}
      </ul>
      <p><strong>Subtotal:</strong> ${formatCurrency(order.subtotal)}</p>
      <p><strong>Tax:</strong> ${formatCurrency(order.taxAmount)}</p>
      <p><strong>Total:</strong> ${formatCurrency(order.total)}</p>
      <p><strong>Shipping:</strong> ${addressParts.join(", ") || "N/A"}</p>
      ${order.notes ? `<p><strong>Notes:</strong> ${order.notes}</p>` : ""}
    </div>
  `;
};

const buildReceiptText = (order) => {
  const items = Array.isArray(order.items) ? order.items : [];
  const eventDetails = order.eventDetails || {};
  const lines = items.map((item) => {
    const sizeLabel = item.size ? ` (${item.size})` : "";
    const qty = Number(item.quantity) || 1;
    const eventInfo = item.type === "event" && eventDetails[item.id] ?
      ` — ${eventDetails[item.id]}` :
      "";
    return `- ${item.name || "Item"}${sizeLabel} x${qty}${eventInfo}`;
  });
  const addressParts = [
    order.address,
    order.city,
    order.state,
    order.zip,
  ].filter(Boolean);

  return [
    "Thanks for your order!",
    `Order ID: ${order.orderId || ""}`,
    `Paid: ${order.paid ? "Yes" : "No"}`,
    "",
    "Items:",
    ...lines,
    "",
    `Subtotal: ${formatCurrency(order.subtotal)}`,
    `Tax: ${formatCurrency(order.taxAmount)}`,
    `Total: ${formatCurrency(order.total)}`,
    `Shipping: ${addressParts.join(", ") || "N/A"}`,
    order.notes ? `Notes: ${order.notes}` : "",
  ].filter(Boolean).join("\n");
};

const loadEventDetails = async (items) => {
  const eventIds = Array.isArray(items) ?
    items
        .filter((item) => item && item.type === "event" && item.id)
        .map((item) => item.id) :
    [];
  const uniqueIds = [...new Set(eventIds)];
  if (!uniqueIds.length) {
    return {};
  }
  const snapshots = await Promise.all(
      uniqueIds.map((id) => db.collection("events").doc(id).get()),
  );
  const details = {};
  snapshots.forEach((snap) => {
    if (!snap.exists) {
      return;
    }
    const data = snap.data() || {};
    const title = data.title || "Event";
    const date = data.date || "TBD";
    const timePart = data.time ? ` at ${data.time}` : "";
    const locationPart = data.location ? ` • ${data.location}` : "";
    details[snap.id] = `${title} — ${date}${timePart}${locationPart}`;
  });
  return details;
};

const buildShippingHtml = (order) => `
  <div style="font-family:Arial, sans-serif; line-height:1.6;">
    <h2 style="margin:0 0 12px;">Your order has shipped!</h2>
    <p><strong>Order ID:</strong> ${order.orderId || ""}</p>
    <p><strong>Tracking number:</strong> ${order.trackingNumber || ""}</p>
  </div>
`;

const buildShippingText = (order) => [
  "Your order has shipped!",
  `Order ID: ${order.orderId || ""}`,
  `Tracking number: ${order.trackingNumber || ""}`,
].join("\n");

const buildCancelHtml = (order) => `
  <div style="font-family:Arial, sans-serif; line-height:1.6;">
    <h2 style="margin:0 0 12px;">Your order was canceled</h2>
    <p><strong>Order ID:</strong> ${order.orderId || ""}</p>
    <p>If this was a mistake, please reply to this email.</p>
  </div>
`;

const buildCancelText = (order) => [
  "Your order was canceled.",
  `Order ID: ${order.orderId || ""}`,
  "If this was a mistake, please reply to this email.",
].join("\n");

exports.autoEndEvents = onSchedule(
    {
      schedule: "every 1 hours",
      timeZone: "America/Denver",
    },
    async () => {
      const snapshot = await db.collection("events")
          .where("status", "in", ["scheduled", "sold-out"])
          .get();
      if (snapshot.empty) {
        return;
      }

      const now = new Date();
      const updates = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() || {};
        if (!data.date) {
          return;
        }
        const timePart = data.time ? `${data.time}:00` : "23:59:00";
        const eventDate = new Date(`${data.date}T${timePart}`);
        if (Number.isNaN(eventDate.getTime())) {
          return;
        }
        if (eventDate <= now) {
          updates.push(docSnap.ref.update({
            status: "ended",
            endedAt: admin.firestore.FieldValue.serverTimestamp(),
          }));
        }
      });

      await Promise.all(updates);
    },
);

const getShopSettings = async () => {
  const snapshot = await db.collection("settings").doc("shop").get();
  if (!snapshot.exists) {
    return {taxRate: 0};
  }
  const data = snapshot.data() || {};
  return {
    taxRate: Number.isFinite(data.taxRate) ? data.taxRate / 100 : 0,
  };
};

const restoreInventory = async (items) => {
  if (!Array.isArray(items) || !items.length) {
    return;
  }
  await db.runTransaction(async (transaction) => {
    const eventGroups = new Map();
    const shopGroups = new Map();

    items.forEach((item) => {
      const type = item.type === "event" ? "event" : "shop";
      const key = item.id;
      if (type === "event") {
        if (!eventGroups.has(key)) {
          eventGroups.set(key, {
            ref: db.collection("events").doc(key),
            items: [],
          });
        }
        eventGroups.get(key).items.push(item);
      } else {
        if (!shopGroups.has(key)) {
          shopGroups.set(key, {
            ref: db.collection("shopItems").doc(key),
            items: [],
          });
        }
        shopGroups.get(key).items.push(item);
      }
    });

    const eventSnaps = new Map();
    for (const [key, entry] of eventGroups.entries()) {
      eventSnaps.set(key, await transaction.get(entry.ref));
    }
    const shopSnaps = new Map();
    for (const [key, entry] of shopGroups.entries()) {
      shopSnaps.set(key, await transaction.get(entry.ref));
    }

    for (const [key, entry] of eventGroups.entries()) {
      const snap = eventSnaps.get(key);
      if (!snap || !snap.exists) {
        continue;
      }
      const data = snap.data() || {};
      let maleTickets = Number(data.maleTickets) || 0;
      let femaleTickets = Number(data.femaleTickets) || 0;
      let registeredMale = Number(data.registeredMale) || 0;
      let registeredFemale = Number(data.registeredFemale) || 0;
      const statusRaw = String(data.status || "scheduled").toLowerCase();
      const keepStatus = statusRaw === "cancelled" ||
        statusRaw === "canceled";

      entry.items.forEach((item) => {
        const qty = Number(item.quantity) || 0;
        const sizeLabel = String(item.size || "").trim().toLowerCase();
        if (sizeLabel === "male") {
          maleTickets += qty;
          registeredMale = Math.max(0, registeredMale - qty);
        } else if (sizeLabel === "female") {
          femaleTickets += qty;
          registeredFemale = Math.max(0, registeredFemale - qty);
        }
      });

      transaction.update(entry.ref, {
        maleTickets,
        femaleTickets,
        registeredMale,
        registeredFemale,
        status: keepStatus ? statusRaw : "scheduled",
      });
    }

    for (const [key, entry] of shopGroups.entries()) {
      const snap = shopSnaps.get(key);
      if (!snap || !snap.exists) {
        continue;
      }
      const data = snap.data() || {};
      const sizes = normalizeSizeEntries(data.sizes);
      if (sizes.length) {
        const sizeMap = new Map(
            sizes.map((sizeEntry) => [sizeEntry.size, sizeEntry]),
        );
        entry.items.forEach((item) => {
          const qty = Number(item.quantity) || 0;
          const sizeKey = String(item.size || "").trim();
          const target = sizeMap.get(sizeKey);
          if (target) {
            target.quantity += qty;
          }
        });
        transaction.update(entry.ref, {sizes});
      } else {
        const currentQty = Number(data.quantity) || 0;
        const restoreQty = entry.items.reduce(
            (sum, item) => sum + (Number(item.quantity) || 0),
            0,
        );
        transaction.update(entry.ref, {
          quantity: currentQty + restoreQty,
        });
      }
    }
  });
};

const decrementInventory = async (items) => {
  if (!Array.isArray(items) || !items.length) {
    return;
  }
  await db.runTransaction(async (transaction) => {
    const eventGroups = new Map();
    const shopGroups = new Map();

    items.forEach((item) => {
      const type = item.type === "event" ? "event" : "shop";
      const key = item.id;
      if (type === "event") {
        if (!eventGroups.has(key)) {
          eventGroups.set(key, {
            ref: db.collection("events").doc(key),
            items: [],
          });
        }
        eventGroups.get(key).items.push(item);
      } else {
        if (!shopGroups.has(key)) {
          shopGroups.set(key, {
            ref: db.collection("shopItems").doc(key),
            items: [],
          });
        }
        shopGroups.get(key).items.push(item);
      }
    });

    const eventSnaps = new Map();
    for (const [key, entry] of eventGroups.entries()) {
      eventSnaps.set(key, await transaction.get(entry.ref));
    }
    const shopSnaps = new Map();
    for (const [key, entry] of shopGroups.entries()) {
      shopSnaps.set(key, await transaction.get(entry.ref));
    }

    for (const [key, entry] of eventGroups.entries()) {
      const snap = eventSnaps.get(key);
      if (!snap || !snap.exists) {
        throw new Error("Event not found for inventory update.");
      }
      const data = snap.data() || {};
      let maleTickets = Number(data.maleTickets) || 0;
      let femaleTickets = Number(data.femaleTickets) || 0;
      let registeredMale = Number(data.registeredMale) || 0;
      let registeredFemale = Number(data.registeredFemale) || 0;

      entry.items.forEach((item) => {
        const qty = Number(item.quantity) || 0;
        const sizeLabel = String(item.size || "").trim().toLowerCase();
        if (sizeLabel === "male") {
          if (maleTickets < qty) {
            throw new Error("Insufficient ticket inventory.");
          }
          maleTickets -= qty;
          registeredMale += qty;
        } else if (sizeLabel === "female") {
          if (femaleTickets < qty) {
            throw new Error("Insufficient ticket inventory.");
          }
          femaleTickets -= qty;
          registeredFemale += qty;
        } else {
          throw new Error("Missing ticket type.");
        }
      });

      const nextStatus = maleTickets + femaleTickets <= 0 ?
        "sold-out" :
        "scheduled";
      transaction.update(entry.ref, {
        maleTickets,
        femaleTickets,
        registeredMale,
        registeredFemale,
        status: nextStatus,
      });
    }

    for (const [key, entry] of shopGroups.entries()) {
      const snap = shopSnaps.get(key);
      if (!snap || !snap.exists) {
        throw new Error("Item not found for inventory update.");
      }
      const data = snap.data() || {};
      const sizes = normalizeSizeEntries(data.sizes);
      if (sizes.length) {
        const sizeMap = new Map(
            sizes.map((sizeEntry) => [sizeEntry.size, sizeEntry]),
        );
        entry.items.forEach((item) => {
          const qty = Number(item.quantity) || 0;
          const sizeKey = String(item.size || "").trim();
          const target = sizeMap.get(sizeKey);
          if (!target) {
            throw new Error("Size no longer available.");
          }
          if (target.quantity < qty) {
            throw new Error("Insufficient size inventory.");
          }
          target.quantity -= qty;
        });
        transaction.update(entry.ref, {sizes});
      } else {
        const currentQty = Number(data.quantity) || 0;
        const orderQty = entry.items.reduce(
            (sum, item) => sum + (Number(item.quantity) || 0),
            0,
        );
        if (currentQty < orderQty) {
          throw new Error("Insufficient inventory.");
        }
        transaction.update(entry.ref, {
          quantity: currentQty - orderQty,
        });
      }
    }
  });
};

exports.createCheckoutSession = onCall(
    {secrets: [stripeSecret]},
    async (request) => {
      const data = request.data || {};
      const items = Array.isArray(data.items) ? data.items : [];
      const customer = data.customer || {};
      const successUrl = String(data.successUrl || "");
      const cancelUrl = String(data.cancelUrl || "");
      const origin = String(data.origin || "");

      if (!items.length) {
        throw new HttpsError("invalid-argument", "Your cart is empty.");
      }
      if (!customer.email || !customer.name) {
        throw new HttpsError(
            "invalid-argument",
            "Missing required customer information.",
        );
      }
      if (!successUrl || !cancelUrl) {
        throw new HttpsError(
            "invalid-argument",
            "Missing checkout redirect URLs.",
        );
      }

      const {taxRate} = await getShopSettings();
      const orderItems = [];
      let subtotal = 0;

      const itemDocs = await Promise.all(items.map(async (item) => {
        if (!item || !item.id) {
          throw new HttpsError("invalid-argument", "Invalid item in cart.");
        }
        const type = item.type === "event" ? "event" : "shop";
        const collectionName = type === "event" ? "events" : "shopItems";
        const docRef = db.collection(collectionName).doc(item.id);
        const docSnap = await docRef.get();
        if (!docSnap.exists) {
          throw new HttpsError(
              "failed-precondition",
              "One of the items is no longer available.",
          );
        }
        return {snap: docSnap, type, cartItem: item};
      }));

      itemDocs.forEach(({snap, type, cartItem}) => {
        const data = snap.data() || {};
        const quantity = Math.max(1, Number(cartItem.quantity) || 1);
        const size = cartItem.size || "";
        if (type === "event") {
          const statusRaw = String(data.status || "scheduled").toLowerCase();
          if (statusRaw !== "scheduled") {
            throw new HttpsError(
                "failed-precondition",
                "One of the items is not available.",
            );
          }
          const sizeLabel = String(size || "").trim().toLowerCase();
          if (!sizeLabel) {
            throw new HttpsError(
                "invalid-argument",
                "Select a ticket type for event items.",
            );
          }
          const price = parsePriceValue(
              data.ticketPrice !== undefined ? data.ticketPrice : data.price,
          );
          const maleTickets = Number(data.maleTickets) || 0;
          const femaleTickets = Number(data.femaleTickets) || 0;
          if (sizeLabel === "male" && maleTickets < quantity) {
            throw new HttpsError(
                "failed-precondition",
                "One of the tickets is sold out.",
            );
          }
          if (sizeLabel === "female" && femaleTickets < quantity) {
            throw new HttpsError(
                "failed-precondition",
                "One of the tickets is sold out.",
            );
          }
          if (sizeLabel !== "male" && sizeLabel !== "female") {
            throw new HttpsError(
                "failed-precondition",
                "Selected ticket type is not available.",
            );
          }
          subtotal += price * quantity;
          orderItems.push({
            id: snap.id,
            type: "event",
            name: data.title || "Event ticket",
            price,
            quantity,
            size: sizeLabel === "male" ? "Male" : "Female",
            imageUrl: "",
          });
          return;
        }

        const status = String(data.status || "available").toLowerCase();
        if (status !== "available") {
          throw new HttpsError(
              "failed-precondition",
              "One of the items is not available.",
          );
        }

        const price = Number(data.price) || 0;
        const sizes = Array.isArray(data.sizes) ? data.sizes : [];

        if (sizes.length && !size) {
          throw new HttpsError(
              "invalid-argument",
              "Select a size for all sized items.",
          );
        }
        if (sizes.length && size) {
          const hasSize = sizes.some((sizeEntry) => {
            if (typeof sizeEntry === "string") {
              return sizeEntry === size;
            }
            return sizeEntry && sizeEntry.size === size;
          });
          if (!hasSize) {
            throw new HttpsError(
                "failed-precondition",
                "Selected size is no longer available.",
            );
          }
          const matched = sizes.find((sizeEntry) => {
            const entrySize =
              typeof sizeEntry === "string" ? sizeEntry : sizeEntry.size;
            return entrySize === size;
          });
          const sizeQty = matched && typeof matched !== "string" ?
            Number(matched.quantity) || 0 :
            0;
          if (sizeQty < quantity) {
            throw new HttpsError(
                "failed-precondition",
                "One of the sizes is sold out.",
            );
          }
        } else if (!sizes.length) {
          const currentQty = Number(data.quantity) || 0;
          if (currentQty < quantity) {
            throw new HttpsError(
                "failed-precondition",
                "One of the items is sold out.",
            );
          }
        }

        subtotal += price * quantity;
        orderItems.push({
          id: snap.id,
          type: "shop",
          name: data.name || "Item",
          price,
          quantity,
          size,
          imageUrl: data.imageUrl || "",
        });
      });

      const taxAmount = roundCurrency(subtotal * taxRate);
      const total = roundCurrency(subtotal + taxAmount);
      const orderId = buildOrderId();
      const pendingRef = db.collection("ordersPending").doc();
      const createdAt = admin.firestore.FieldValue.serverTimestamp();
      let pendingCreated = false;

      try {
        await pendingRef.set({
          orderId,
          name: String(customer.name || ""),
          email: String(customer.email || ""),
          phone: String(customer.phone || ""),
          address: String(customer.address || ""),
          city: String(customer.city || ""),
          state: String(customer.state || ""),
          zip: String(customer.zip || ""),
          notes: String(customer.notes || ""),
          items: orderItems,
          subtotal,
          taxRate,
          taxAmount,
          total,
          createdAt,
          origin,
        });
        pendingCreated = true;

        const stripe = new Stripe(stripeSecret.value(), {
          apiVersion: "2023-10-16",
        });

        const lineItems = orderItems.map((item) => {
          const sizeLabel = item.size ? ` (${item.size})` : "";
          return {
            price_data: {
              currency: "usd",
              unit_amount: Math.round((Number(item.price) || 0) * 100),
              product_data: {
                name: `${item.name}${sizeLabel}`,
                images: item.imageUrl ? [item.imageUrl] : [],
              },
            },
            quantity: item.quantity,
          };
        });

        if (taxAmount > 0) {
          lineItems.push({
            price_data: {
              currency: "usd",
              unit_amount: Math.round(taxAmount * 100),
              product_data: {
                name: "Sales tax",
              },
            },
            quantity: 1,
          });
        }

        const session = await stripe.checkout.sessions.create({
          mode: "payment",
          line_items: lineItems,
          customer_email: customer.email,
          success_url: successUrl,
          cancel_url: cancelUrl,
          client_reference_id: orderId,
          metadata: {
            orderId,
            orderPendingId: pendingRef.id,
          },
        });

        await pendingRef.update({
          stripeSessionId: session.id,
        });

        return {sessionId: session.id, orderId};
      } catch (error) {
        logger.error("Checkout session error", error);
        if (pendingCreated) {
          try {
            await pendingRef.delete();
          } catch (rollbackError) {
            logger.error("Pending cleanup failed", rollbackError);
          }
        }
        if (error instanceof HttpsError) {
          throw error;
        }
        throw new HttpsError(
            "internal",
            error.message || "Unable to start checkout.",
        );
      }
    },
);

exports.stripeWebhook = onRequest(
    {secrets: [stripeSecret, stripeWebhookSecret]},
    async (req, res) => {
      if (req.method !== "POST") {
        res.status(405).send("Method not allowed");
        return;
      }

      const signature = req.headers["stripe-signature"];
      if (!signature || Array.isArray(signature)) {
        res.status(400).send("Missing signature");
        return;
      }

      const stripe = new Stripe(stripeSecret.value(), {
        apiVersion: "2023-10-16",
      });

      let event;
      try {
        event = stripe.webhooks.constructEvent(
            req.rawBody,
            signature,
            stripeWebhookSecret.value(),
        );
      } catch (error) {
        logger.error("Stripe webhook signature verification failed", error);
        res.status(400).send("Webhook signature verification failed");
        return;
      }

      const session = event.data && event.data.object;
      if (!session || session.object !== "checkout.session") {
        res.status(200).json({received: true});
        return;
      }

      const metadata = session.metadata || {};
      const pendingId = metadata.orderPendingId;

      try {
        if (event.type === "checkout.session.completed") {
          if (pendingId) {
            const pendingRef = db.collection("ordersPending").doc(pendingId);
            const pendingSnap = await pendingRef.get();
            if (!pendingSnap.exists) {
              res.status(200).json({received: true});
              return;
            }
            const pending = pendingSnap.data() || {};
            const orderRef = db.collection("orders").doc();
            try {
              await decrementInventory(pending.items || []);
              try {
                await createEventRegistrations(pending, orderRef.id);
              } catch (error) {
                logger.error("Registration write failed", error);
              }
              await orderRef.set({
                ...pending,
                paid: true,
                status: "paid",
                paidAt: admin.firestore.FieldValue.serverTimestamp(),
                stripePaymentIntent: session.payment_intent || "",
                stripeSessionId: session.id,
                receiptSent: false,
              });
              await pendingRef.delete();
            } catch (inventoryError) {
              logger.error("Inventory update failed", inventoryError);
              if (session.payment_intent) {
                await stripe.refunds.create({
                  payment_intent: session.payment_intent,
                });
              }
              await orderRef.set({
                ...pending,
                paid: false,
                status: "canceled",
                canceledAt: admin.firestore.FieldValue.serverTimestamp(),
                cancelReason: "inventory-unavailable",
                refundStatus: session.payment_intent ?
                  "issued" :
                  "not-applicable",
                stripePaymentIntent: session.payment_intent || "",
                stripeSessionId: session.id,
              });
              await pendingRef.delete();
            }
          }
        }

        if (event.type === "checkout.session.expired") {
          if (pendingId) {
            await db.collection("ordersPending").doc(pendingId).delete();
          }
        }

        res.status(200).json({received: true});
      } catch (error) {
        logger.error("Stripe webhook processing failed", error);
        res.status(500).send("Webhook handler failed");
      }
    },
);

exports.sendOrderReceipt = onDocumentWritten(
    {
      document: "orders/{orderId}",
      secrets: [smtpPass],
    },
    async (event) => {
      const after = event.data ? event.data.after : null;
      const before = event.data ? event.data.before : null;
      const order = after ? after.data() : null;
      const previous = before ? before.data() : null;
      if (!order || !order.email) {
        logger.warn("Order missing email, skipping receipt.");
        return;
      }
      if (!order.paid || order.receiptSent) {
        return;
      }
      if (previous && previous.paid) {
        return;
      }

      const smtpHost = smtpHostParam.value();
      const smtpPort = smtpPortParam.value() || 587;
      const smtpUser = smtpUserParam.value();
      const smtpSecure = smtpSecureParam.value() || false;
      const pass = smtpPass.value();
      const smtpFrom = "orders@thedatemachine.com";

      if (!smtpHost || !smtpUser || !pass) {
        logger.error("Missing SMTP config for receipts.");
        return;
      }

      const subject = `Your Date Machine order ${order.orderId || ""}`;

      try {
        const eventDetails = await loadEventDetails(order.items || []);
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpSecure,
          auth: {
            user: smtpUser,
            pass,
          },
        });

        await transporter.sendMail({
          from: smtpFrom,
          to: order.email,
          subject,
          html: buildReceiptHtml({...order, eventDetails}),
          text: buildReceiptText({...order, eventDetails}),
        });

        await after.ref.update({
          receiptSent: true,
          receiptSentAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        logger.info("Receipt sent", {orderId: order.orderId});
      } catch (error) {
        logger.error("Receipt send failed", error);
      }
    },
);

exports.sendShippingUpdate = onDocumentWritten(
    {
      document: "orders/{orderId}",
      secrets: [smtpPass],
    },
    async (event) => {
      const after = event.data ? event.data.after : null;
      const before = event.data ? event.data.before : null;
      const order = after ? after.data() : null;
      const previous = before ? before.data() : null;
      if (!order || !order.email) {
        return;
      }
      if (order.shippingStatus !== "shipped") {
        return;
      }
      if (!order.trackingNumber) {
        return;
      }
      if (order.shippingEmailSent) {
        return;
      }
      if (previous && previous.shippingStatus === "shipped") {
        return;
      }

      const smtpHost = smtpHostParam.value();
      const smtpPort = smtpPortParam.value() || 587;
      const smtpUser = smtpUserParam.value();
      const smtpSecure = smtpSecureParam.value() || false;
      const pass = smtpPass.value();
      const smtpFrom = "orders@thedatemachine.com";

      if (!smtpHost || !smtpUser || !pass) {
        logger.error("Missing SMTP config for shipping updates.");
        return;
      }

      const subject = `Your Date Machine order shipped ${order.orderId || ""}`;

      try {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpSecure,
          auth: {
            user: smtpUser,
            pass,
          },
        });

        await transporter.sendMail({
          from: smtpFrom,
          to: order.email,
          subject,
          html: buildShippingHtml(order),
          text: buildShippingText(order),
        });

        await after.ref.update({
          shippingEmailSent: true,
          shippingEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (error) {
        logger.error("Shipping email failed", error);
      }
    },
);

exports.sendCancelUpdate = onDocumentWritten(
    {
      document: "orders/{orderId}",
      secrets: [smtpPass],
    },
    async (event) => {
      const after = event.data ? event.data.after : null;
      const before = event.data ? event.data.before : null;
      const order = after ? after.data() : null;
      const previous = before ? before.data() : null;
      if (!order || !order.email) {
        return;
      }
      if (order.status !== "canceled") {
        return;
      }
      if (order.cancelEmailSent) {
        return;
      }
      if (previous && previous.status === "canceled") {
        return;
      }

      const smtpHost = smtpHostParam.value();
      const smtpPort = smtpPortParam.value() || 587;
      const smtpUser = smtpUserParam.value();
      const smtpSecure = smtpSecureParam.value() || false;
      const pass = smtpPass.value();
      const smtpFrom = "orders@thedatemachine.com";

      if (!smtpHost || !smtpUser || !pass) {
        logger.error("Missing SMTP config for cancel updates.");
        return;
      }

      const subject =
        `Your Date Machine order was canceled ${order.orderId || ""}`;

      try {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpSecure,
          auth: {
            user: smtpUser,
            pass,
          },
        });

        await transporter.sendMail({
          from: smtpFrom,
          to: order.email,
          subject,
          html: buildCancelHtml(order),
          text: buildCancelText(order),
        });

        await after.ref.update({
          cancelEmailSent: true,
          cancelEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (error) {
        logger.error("Cancel email failed", error);
      }
    },
);

exports.cancelOrder = onCall(
    {secrets: [stripeSecret]},
    async (request) => {
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "Sign in required.");
      }
      const data = request.data || {};
      const orderId = String(data.orderId || "");
      if (!orderId) {
        throw new HttpsError("invalid-argument", "Missing order ID.");
      }

      const orderRef = db.collection("orders").doc(orderId);
      const orderSnap = await orderRef.get();
      if (!orderSnap.exists) {
        throw new HttpsError("not-found", "Order not found.");
      }

      const order = orderSnap.data() || {};
      if (order.status === "canceled") {
        return {ok: true, alreadyCanceled: true};
      }

      let refundId = "";
      if (order.paid && order.stripePaymentIntent) {
        const stripe = new Stripe(stripeSecret.value(), {
          apiVersion: "2023-10-16",
        });
        const refund = await stripe.refunds.create({
          payment_intent: order.stripePaymentIntent,
        });
        refundId = refund.id;
      }

      const previousSubtotal = Number(order.subtotal) || 0;
      const previousTax = Number(order.taxAmount) || 0;
      const previousTotal =
        Number(order.total) || previousSubtotal + previousTax;
      const refundedSubtotal = order.paid ? previousSubtotal : 0;
      const refundedTax = order.paid ? previousTax : 0;
      const refundedTotal = order.paid ? previousTotal : 0;

      await restoreInventory(order.items || []);
      try {
        await removeEventRegistrations(order.orderId || "", orderId);
      } catch (error) {
        logger.error("Failed to remove registrations", error);
      }
      await orderRef.update({
        status: "canceled",
        subtotal: 0,
        taxAmount: 0,
        total: 0,
        refundedSubtotal,
        refundedTax,
        refundedTotal,
        canceledAt: admin.firestore.FieldValue.serverTimestamp(),
        refundId,
        refundStatus: order.paid ? "issued" : "not-applicable",
      });

      return {ok: true, refundId};
    },
);

exports.cancelOrderItem = onCall(
    {secrets: [stripeSecret]},
    async (request) => {
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "Sign in required.");
      }
      const data = request.data || {};
      const orderId = String(data.orderId || "");
      const itemId = String(data.itemId || "");
      const itemType = data.itemType === "event" ? "event" : "shop";
      const itemSize = String(data.itemSize || "");
      if (!orderId || !itemId) {
        throw new HttpsError("invalid-argument", "Missing order item.");
      }

      const orderRef = db.collection("orders").doc(orderId);
      const orderSnap = await orderRef.get();
      if (!orderSnap.exists) {
        throw new HttpsError("not-found", "Order not found.");
      }
      const order = orderSnap.data() || {};
      if (!order.paid || !order.stripePaymentIntent) {
        throw new HttpsError("failed-precondition", "Order is not paid.");
      }

      const items = Array.isArray(order.items) ? order.items : [];
      const targetIndex = items.findIndex((item) => {
        const type = item.type || "shop";
        const sizeValue = String(item.size || "");
        return item.id === itemId &&
          type === itemType &&
          sizeValue === itemSize;
      });
      if (targetIndex === -1) {
        throw new HttpsError("not-found", "Order item not found.");
      }

      const target = items[targetIndex];
      const canceledQty = Number(target.canceledQuantity) || 0;
      const quantity = Number(target.quantity) || 0;
      const remainingQty = quantity - canceledQty;
      if (remainingQty <= 0) {
        throw new HttpsError("failed-precondition", "Item already canceled.");
      }

      const taxRate = Number.isFinite(order.taxRate) ? order.taxRate : 0;
      const currentSubtotal = roundCurrency(items.reduce((sum, item) => {
        const itemQty = Number(item.quantity) || 0;
        const itemCanceled = Number(item.canceledQuantity) || 0;
        const activeQty = Math.max(0, itemQty - itemCanceled);
        const price = Number(item.price) || 0;
        return sum + price * activeQty;
      }, 0));
      const currentTax = roundCurrency(currentSubtotal * taxRate);
      const currentTotal = roundCurrency(currentSubtotal + currentTax);

      const priceValue = Number(target.price) || 0;
      const itemSubtotal = roundCurrency(priceValue * remainingQty);
      const itemTax = roundCurrency(itemSubtotal * taxRate);
      const refundTotal = roundCurrency(itemSubtotal + itemTax);
      if (currentTotal > 0 && refundTotal > currentTotal) {
        throw new HttpsError(
            "failed-precondition",
            "Refund exceeds remaining order balance.",
        );
      }
      if (refundTotal <= 0) {
        throw new HttpsError("failed-precondition", "Invalid refund amount.");
      }

      const stripe = new Stripe(stripeSecret.value(), {
        apiVersion: "2023-10-16",
      });
      let refund;
      try {
        const intent = await stripe.paymentIntents.retrieve(
            order.stripePaymentIntent,
            {expand: ["charges"]},
        );
        let charges = [];
        if (intent.charges && Array.isArray(intent.charges.data)) {
          charges = intent.charges.data;
        }
        const charge = charges[0];
        if (charge) {
          const remainingCents = charge.amount - charge.amount_refunded;
          const remaining = Math.max(0, remainingCents / 100);
          if (refundTotal - remaining > 0.01) {
            throw new HttpsError(
                "failed-precondition",
                "Refund exceeds remaining Stripe balance.",
            );
          }
        }
      } catch (error) {
        if (error instanceof HttpsError) {
          throw error;
        }
        logger.error("Stripe balance check failed", error);
      }
      try {
        refund = await stripe.refunds.create({
          payment_intent: order.stripePaymentIntent,
          amount: Math.round(refundTotal * 100),
        });
      } catch (error) {
        logger.error("Stripe refund failed", error);
        throw new HttpsError("internal", "Refund failed in Stripe.");
      }

      const updatedItems = items.map((item, index) => {
        if (index !== targetIndex) {
          return item;
        }
        return {
          ...item,
          canceledQuantity: quantity,
          canceledAt: admin.firestore.Timestamp.now(),
          refundId: refund.id,
        };
      });

      const nextSubtotal = roundCurrency(currentSubtotal - itemSubtotal);
      const nextTax = roundCurrency(nextSubtotal * taxRate);
      const nextTotal = roundCurrency(nextSubtotal + nextTax);
      const refundedSubtotal = roundCurrency(
          (order.refundedSubtotal || 0) + itemSubtotal,
      );
      const refundedTax = roundCurrency(
          (order.refundedTax || 0) + itemTax,
      );
      const refundedTotal = roundCurrency(
          (order.refundedTotal || 0) + refundTotal,
      );
      const nextStatus = nextTotal <= 0 ? "refunded" : "partially-refunded";

      try {
        await orderRef.update({
          items: updatedItems,
          subtotal: Math.max(0, nextSubtotal),
          taxAmount: Math.max(0, nextTax),
          total: Math.max(0, nextTotal),
          refundedSubtotal,
          refundedTax,
          refundedTotal,
          status: nextStatus,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (error) {
        logger.error("Order update failed", error);
        throw new HttpsError("internal", "Order update failed.");
      }

      const canceledItem = {
        id: target.id,
        type: itemType,
        size: target.size || "",
        quantity: remainingQty,
      };
      try {
        await restoreInventory([canceledItem]);
      } catch (error) {
        logger.error("Inventory restore failed", error);
      }
      if (itemType === "event") {
        try {
          await removeEventRegistrationsForItem(
              order.orderId || "",
              orderId,
              target,
          );
        } catch (error) {
          logger.error("Registration cleanup failed", error);
        }
      }

      return {ok: true, refundId: refund.id};
    },
);
