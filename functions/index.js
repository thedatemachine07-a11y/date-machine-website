/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {setGlobalOptions} = require("firebase-functions");
const {onRequest} = require("firebase-functions/https");
const {
  defineBoolean,
  defineInt,
  defineSecret,
  defineString,
} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const nodemailer = require("nodemailer");

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
