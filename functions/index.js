console.log("index: start");

if (process.env.FUNCTIONS_EMULATOR || process.env.FIREBASE_EMULATOR_HUB) {
  require("dotenv").config();
}
console.log("index: dotenv ok");

const admin = require("firebase-admin");
const Stripe = require("stripe");
const { getFirestore, Timestamp, FieldValue } = require("firebase-admin/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = getFirestore();

setGlobalOptions({ region: "europe-west1" });

const TRIAL_DAYS = 7;

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_PRICE_PRO = process.env.STRIPE_PRICE_PRO || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

console.log("index: secrets defined");
// ---------- helpers ----------
function tierRank(tier) {
  const t = String(tier || "free").toLowerCase();
  if (t === "pro_permanent" || t === "pro_paid") return 3;
  if (t === "pro_trial" || t === "pro") return 2;
  return 1;
}

function tsToMillis(ts) {
  if (!ts) return null;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  return null;
}

function entitlementToClient(ent) {
  return {
    ok: true,
    tier: ent?.tier || "free",
    source: ent?.source || "firebase",
    expiresAtMs: tsToMillis(ent?.expiresAt),
  };
}

function safeErrorMessage(err) {
  return err?.message || String(err);
}

// ---------- 1) syncEntitlement ----------
exports.syncEntitlement = onCall(
  {
    cors: [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "https://kalasaaapp.web.app",
      "https://kalasaaapp.firebaseapp.com",
    ],
  },
  async (request) => {
  logger.info("[syncEntitlement] entered", {
      uid: request.auth?.uid || null,
      email: request.auth?.token?.email || null,
    });

    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Login required");
    }

    const uid = request.auth.uid;
    const emailRaw = request.auth.token.email || "";
    const email = String(emailRaw).toLowerCase().trim();

    if (!email || !email.includes("@")) {
      throw new HttpsError("failed-precondition", "Email is required");
    }

    const domain = email.split("@")[1];
    const entRef = db.doc(`entitlements/${uid}`);
    const emailRef = db.doc(`entitlement_email/${email}`);
    const allowEmailRef = db.doc(`pro_allowlist/${email}`);
    const allowDomainRef = db.doc(`pro_domain_allowlist/${domain}`);
    const domainMemberRef = db.doc(`pro_domain_allowlist/${domain}/members/${email}`);

    const nowMs = Date.now();
    const nowTs = Timestamp.fromMillis(nowMs);
    const trialExpiresTs = Timestamp.fromMillis(
      nowMs + TRIAL_DAYS * 24 * 3600 * 1000
    );

    const result = await db.runTransaction(async (tx) => {
      const [entSnap, emailSnap, allowEmailSnap, allowDomainSnap, memberSnap] =
        await Promise.all([
          tx.get(entRef),
          tx.get(emailRef),
          tx.get(allowEmailRef),
          tx.get(allowDomainRef),
          tx.get(domainMemberRef),
        ]);

      const currentEnt = entSnap.exists ? entSnap.data() || {} : {};
      const curTier = currentEnt.tier || "free";
      const curExpiresAt = currentEnt.expiresAt || null;
      const curRank = tierRank(curTier);
      const curExpired =
        curExpiresAt && typeof curExpiresAt.toMillis === "function"
          ? nowMs > curExpiresAt.toMillis()
          : false;

      // 1) Jos on jo maksettu/pysyvä eikä vanhentunut -> älä alenna
      if (curRank >= 3 && !curExpired) {
        tx.set(
          entRef,
          { updatedAt: FieldValue.serverTimestamp() },
          { merge: true }
        );
        return entitlementToClient(currentEnt);
      }

      let next = {
        tier: "free",
        source: "firebase",
        expiresAt: null,
        updatedAt: FieldValue.serverTimestamp(),
      };

      // 2) Email-allowlist voittaa
      if (allowEmailSnap.exists) {
        const a = allowEmailSnap.data() || {};
        next = {
          tier: a.tier || "pro_permanent",
          source: "allowlist_email",
          expiresAt: a.expiresAt ?? null,
          updatedAt: FieldValue.serverTimestamp(),
        };

        tx.set(entRef, next, { merge: true });
        tx.set(
          emailRef,
          {
            lastUid: uid,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        return entitlementToClient(next);
      }

      // 3) Domain-allowlist kiintiöllä
      if (allowDomainSnap.exists) {
        const d = allowDomainSnap.data() || {};
        const seats = Number(d.seats || 0);
        const used = Number(d.used || 0);

        const domainEnt = {
          tier: d.tier || "pro_permanent",
          source: "allowlist_domain",
          expiresAt: d.expiresAt ?? null,
          updatedAt: FieldValue.serverTimestamp(),
        };

        // Email on jo domain-jäsen
        if (memberSnap.exists) {
          tx.set(entRef, domainEnt, { merge: true });
          tx.set(
            emailRef,
            {
              lastUid: uid,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          return entitlementToClient(domainEnt);
        }

        // Ei jäsen -> varaa paikka jos mahdollista
        if (seats > 0 && used < seats) {
          tx.set(domainMemberRef, {
            createdAt: FieldValue.serverTimestamp(),
            uid,
          });

          tx.set(
            allowDomainRef,
            { used: used + 1 },
            { merge: true }
          );

          tx.set(entRef, domainEnt, { merge: true });
          tx.set(
            emailRef,
            {
              lastUid: uid,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );

          return entitlementToClient(domainEnt);
        }

        // Kiintiö täynnä -> jatketaan trial/free-polulle
      }

      // 4) Trial kerran per email
      const emailState = emailSnap.exists ? emailSnap.data() || {} : {};
      const trialUsed = emailState.trialUsed === true;

      if (!trialUsed) {
        next = {
          tier: "pro_trial",
          source: "trial",
          expiresAt: trialExpiresTs,
          updatedAt: FieldValue.serverTimestamp(),
        };

        tx.set(entRef, next, { merge: true });
        tx.set(
          emailRef,
          {
            trialUsed: true,
            trialStartedAt: nowTs,
            trialExpiresAt: trialExpiresTs,
            lastUid: uid,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        return entitlementToClient(next);
      }

      // Trial käytetty -> free
      tx.set(entRef, next, { merge: true });
      tx.set(
        emailRef,
        {
          lastUid: uid,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return entitlementToClient(next);
    });
  logger.info("[syncEntitlement] result", result);
    return result;
  }
);

// ---------- 2) createCheckoutSession ----------
exports.createCheckoutSession = onCall({}, async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Login required");
    }

    const key = STRIPE_SECRET_KEY.trim();
    const priceId = STRIPE_PRICE_PRO.trim();

    if (!key || !key.startsWith("sk_")) {
      throw new HttpsError("failed-precondition", "Stripe key missing");
    }

    if (!priceId || !priceId.startsWith("price_")) {
      throw new HttpsError("failed-precondition", "Stripe price missing");
    }

    const stripe = new Stripe(key, { apiVersion: "2024-06-20" });

    const uid = request.auth.uid;
    const email = String(request.auth.token.email || "").toLowerCase().trim();

const priceObj = await stripe.prices.retrieve(priceId, {
  expand: ["product"],
});

console.log("STRIPE DEBUG", {
  priceId,
  unit_amount: priceObj.unit_amount,
  currency: priceObj.currency,
  productId: priceObj.product?.id || priceObj.product,
  productName: priceObj.product?.name,
  productDescription: priceObj.product?.description,
});

    try {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: "http://127.0.0.1:5173/?checkout=success",
        cancel_url: "http://127.0.0.1:5173/?checkout=cancel",
        client_reference_id: uid,
        customer_email: email || undefined,
        metadata: {
          uid,
          email,
        },
      });

      if (!session?.url) {
        throw new HttpsError("internal", "Stripe session URL missing");
      }

      return { url: session.url };
    } catch (err) {
      logger.error("Stripe checkout error", { message: safeErrorMessage(err) });
      throw new HttpsError("internal", safeErrorMessage(err));
    }
  }
);

// ---------- 3) stripeWebhook ----------
exports.stripeWebhook = onRequest(
  {
    region: "europe-west1",
    invoker: "public",
  },
  async (req, res) => {
    logger.info("[webhook] entered", {
      method: req.method,
      contentType: req.headers["content-type"] || null,
      hasRawBody: !!req.rawBody,
      rawBodyIsBuffer: Buffer.isBuffer(req.rawBody),
      rawBodyLength: req.rawBody ? req.rawBody.length : 0,
      hasSigHeader: !!req.headers["stripe-signature"],
    });

    const key = String(STRIPE_SECRET_KEY || "").trim();
    const webhookSecret = String(STRIPE_WEBHOOK_SECRET || "").trim();

    logger.info("[webhook] env check", {
      hasStripeKey: !!key,
      stripeKeyPrefix: key ? key.slice(0, 7) : null,
      hasWebhookSecret: !!webhookSecret,
      webhookSecretPrefix: webhookSecret ? webhookSecret.slice(0, 12) : null,
    });

    if (!key || !key.startsWith("sk_")) {
      logger.error("[webhook] Missing/invalid STRIPE_SECRET_KEY", {
        stripeKeyPrefix: key ? key.slice(0, 7) : null,
      });
      res.status(500).send("Stripe not configured");
      return;
    }

    if (!webhookSecret || !webhookSecret.startsWith("whsec_")) {
      logger.error("[webhook] Missing/invalid STRIPE_WEBHOOK_SECRET", {
        secretPrefix: webhookSecret ? webhookSecret.slice(0, 12) : null,
        rawBodyLength: req.rawBody ? req.rawBody.length : 0,
        contentType: req.headers["content-type"] || null,
      });
      res.status(500).send("Missing STRIPE_WEBHOOK_SECRET");
      return;
    }

    const sig = req.headers["stripe-signature"];
    if (!sig) {
      logger.error("[webhook] Missing stripe-signature header");
      res.status(400).send("Missing stripe-signature");
      return;
    }

    const stripe = new Stripe(key, { apiVersion: "2024-06-20" });

    logger.info("[webhook] debug signature inputs", {
      hasSig: !!sig,
      sigPrefix: String(sig || "").slice(0, 20),
      secretPrefix: webhookSecret.slice(0, 12),
      rawBodyType: typeof req.rawBody,
      rawBodyIsBuffer: Buffer.isBuffer(req.rawBody),
      rawBodyLength: req.rawBody ? req.rawBody.length : 0,
      contentType: req.headers["content-type"] || null,
      method: req.method,
    });

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);

      logger.info("[webhook] event received", {
        id: event?.id || null,
        type: event?.type || null,
      });
    } catch (err) {
      logger.error("[webhook] Signature verify failed", {
        message: safeErrorMessage(err),
        stack: err?.stack || null,
      });
      res.status(400).send("Bad signature");
      return;
    }

    try {
      if (event.type === "checkout.session.completed") {
        const session = event.data.object;

        logger.info("[webhook] checkout.session.completed", {
	  payment_status: session?.payment_status || null,
	  client_reference_id: session?.client_reference_id || null,
	  metadata: session?.metadata || null,
	  sessionId: session?.id || null,
	});

	const paid =
	  session?.payment_status === "paid" ||
	  session?.payment_status === "no_payment_required";

	logger.info("[webhook] checkout.session.completed details", {
	  paid,
	  uidFromMetadata: session?.metadata?.uid || null,
	  uidFromClientReference: session?.client_reference_id || null,
	  emailFromMetadata: session?.metadata?.email || null,
	});

        if (paid) {
          const uid = session?.metadata?.uid || session?.client_reference_id;
          const email = String(session?.metadata?.email || "")
            .toLowerCase()
            .trim();

          if (!uid) {
            logger.warn("[webhook] No uid in metadata/client_reference_id", {
              sessionId: session?.id || null,
              metadata: session?.metadata || null,
              client_reference_id: session?.client_reference_id || null,
            });
          } else {
            logger.info("[webhook] writing entitlement", {
              uid,
              email,
              sessionId: session?.id || null,
            });

            const entRef = db.doc(`entitlements/${uid}`);
            await entRef.set(
              {
                tier: "pro_permanent",
                source: "stripe",
                expiresAt: null,
                unlockedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
                meta: {
                  stripeSessionId: session?.id || null,
                  stripeCustomerId: session?.customer || null,
                  email: email || null,
                },
              },
              { merge: true }
            );

            logger.info("[webhook] entitlement doc write ok", {
              uid,
              path: `entitlements/${uid}`,
            });

            if (email) {
              const emailRef = db.doc(`entitlement_email/${email}`);
              await emailRef.set(
                {
                  trialUsed: true,
                  lastUid: uid,
                  updatedAt: FieldValue.serverTimestamp(),
                },
                { merge: true }
              );

              logger.info("[webhook] entitlement_email doc write ok", {
                email,
                path: `entitlement_email/${email}`,
              });
            }

            logger.info("[webhook] entitlement updated", {
              uid,
              sessionId: session?.id || null,
            });
          }
        } else {
          logger.info("[webhook] session not paid, skipping entitlement", {
            payment_status: session?.payment_status || null,
            sessionId: session?.id || null,
          });
        }
      } else {
        logger.info("[webhook] ignored event type", {
          id: event?.id || null,
          type: event?.type || null,
        });
      }

      logger.info("[webhook] responding 200", {
        eventType: event?.type || null,
      });
      res.status(200).json({ received: true });
    } catch (err) {
      logger.error("[webhook] handler error", {
        message: safeErrorMessage(err),
        stack: err?.stack || null,
        eventType: event?.type || null,
        eventId: event?.id || null,
      });
      res.status(500).send("Webhook error");
    }
  }
);