if (process.env.FUNCTIONS_EMULATOR || process.env.FIREBASE_EMULATOR_HUB) {
  require("dotenv").config();
}

const admin = require("firebase-admin");
const Stripe = require("stripe");
const { getFirestore, Timestamp, FieldValue } = require("firebase-admin/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = getFirestore();

setGlobalOptions({ region: "europe-west1" });

const TRIAL_DAYS = 7;

const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_PRICE_PRO = defineSecret("STRIPE_PRICE_PRO");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");

// ---------- helpers ----------
function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return Boolean(email && email.includes("@"));
}

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

function isExpiredTs(ts, nowMs) {
  if (!ts || typeof ts.toMillis !== "function") return false;
  return nowMs > ts.toMillis();
}

function isActivePaidEntitlement(ent, nowMs = Date.now()) {
  if (!ent) return false;

  const rank = tierRank(ent.tier || "free");
  if (rank < 3) return false;

  const expiresAt = ent.expiresAt || null;
  return !isExpiredTs(expiresAt, nowMs);
}

function normalizeCountryBucket(countryCode) {
  const c = String(countryCode || "").toUpperCase();

  if (c === "FI") return "FI";
  if (c === "SE") return "SE";
  if (c === "NO") return "NO";

  return "OTHER";
}

async function getExistingPaidAccess({ uid, email }) {
  const normalizedEmail = normalizeEmail(email);
  const entRef = db.doc(`entitlements/${uid}`);
  const emailRef = db.doc(`entitlement_email/${normalizedEmail}`);

  const [entSnap, emailSnap] = await Promise.all([
    entRef.get(),
    emailRef.get(),
  ]);

  const uidEnt = entSnap.exists ? entSnap.data() || {} : null;
  const emailEnt = emailSnap.exists ? emailSnap.data() || {} : null;

  if (isActivePaidEntitlement(uidEnt)) {
    return {
      alreadyPro: true,
      source: "entitlements_uid",
      entitlement: uidEnt,
    };
  }

  if (isActivePaidEntitlement(emailEnt)) {
    return {
      alreadyPro: true,
      source: "entitlement_email",
      entitlement: emailEnt,
    };
  }

  return {
    alreadyPro: false,
    source: null,
    entitlement: null,
  };
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

function buildPaidEntitlement({
  tier = "pro_permanent",
  source = "stripe",
  expiresAt = null,
  email = null,
  stripeCustomerId = null,
  stripeSessionId = null,
  restoredFromEmail = null,
}) {
  return {
    tier,
    source,
    expiresAt,
    email: email || null,
    unlockedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    meta: {
      email: email || null,
      stripeCustomerId: stripeCustomerId || null,
      stripeSessionId: stripeSessionId || null,
      restoredFromEmail: restoredFromEmail || null,
    },
  };
}

function buildEmailAnchor({
  email,
  uid,
  tier = "pro_permanent",
  source = "stripe",
  expiresAt = null,
  stripeCustomerId = null,
  stripeSessionId = null,
}) {
  return {
    email,
    tier,
    source,
    expiresAt,
    unlockedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    trialUsed: true,
    lastUid: uid,
    stripeCustomerId: stripeCustomerId || null,
    stripeSessionId: stripeSessionId || null,
  };
}

function mapAppLocaleToStripe(appLocale) {
  const l = String(appLocale || "").toLowerCase();

  if (l === "fi") return "fi";
  if (l === "en") return "en";
  if (l === "sv") return "sv";
  if (l === "no") return "nb"; // Stripe käyttää norjasta koodia nb
  return "auto";
}

function getCheckoutInfoText(appLocale) {
  const l = String(appLocale || "").toLowerCase();

  if (l === "en") {
    return "The PRO version unlocks all advanced KalasääApp features, including extended statistics, fish activity analysis and improved forecasts based on your recorded fishing sessions. We recommend purchasing PRO access after the 7-day trial period so you can explore the application at your own pace and confirm everything works correctly. KalasääApp is a self-learning system that improves fish activity predictions as more fishing data is recorded.";
  }

  if (l === "sv") {
    return "PRO-versionen låser upp alla avancerade funktioner i KalasääApp, inklusive utökad statistik, analys av fiskens aktivitet och mer exakta prognoser baserade på registrerade fiskepass. Vi rekommenderar att du köper PRO-åtkomst först efter att 7-dagars testperioden har avslutats, så att du hinner bekanta dig med applikationen och säkerställa att allt fungerar korrekt. KalasääApp är en självlärande applikation som förbättrar prognoserna ju mer data som sparas från fiskepass.";
  }

  if (l === "no") {
    return "PRO-versjonen låser opp alle avanserte funksjoner i KalasääApp, inkludert utvidet statistikk, analyse av fiskens aktivitet og mer presise prognoser basert på registrerte fisketurer. Vi anbefaler å kjøpe PRO-tilgang først etter at 7-dagers prøveperiode er avsluttet, slik at du får tid til å bli kjent med applikasjonen og kontrollere at alt fungerer som forventet. KalasääApp er en selvlærende applikasjon som forbedrer prognosene etter hvert som mer data fra fisketurer lagres.";
  }

  return "PRO-versio avaa kaikki KalasääAppin edistyneet ominaisuudet, kuten laajemmat tilastot, ottihalukkuus-analyysin sekä kalastussessioiden dataan perustuvan ennusteen tarkentumisen. Suositus on, että ostat PRO-oikeudet vasta 7 vuorokauden koejakson päätyttyä. Näin ehdit tutustua sovellukseen rauhassa ja varmistua sen toimivuudesta. KalasääApp on itseoppiva sovellus, joka parantaa ottiennusteen tarkkuutta sitä mukaa kun kalastussessioista tallennetaan lisää dataa.";
}

exports.unlockWithTestCode = onCall({}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Login required");
  }

  const uid = request.auth.uid;
  const email = normalizeEmail(request.auth.token.email || "");
  const code = String(request.data?.code || "").trim().toUpperCase();

  const TEST_CODES = new Set([
    "KALASAA-PRO-TEST-001",
  ]);

  if (!TEST_CODES.has(code)) {
    throw new HttpsError("permission-denied", "Invalid code");
  }

  await db.doc(`entitlements/${uid}`).set(
    {
      ok: true,
      tier: "pro_permanent",
      source: "manual_code",
      email: email || null,
      expiresAt: null,
      unlockedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      meta: {
        codeUsed: code,
      },
    },
    { merge: true }
  );

  if (isValidEmail(email)) {
    await db.doc(`entitlement_email/${email}`).set(
      {
        email,
        tier: "pro_permanent",
        source: "manual_code",
        expiresAt: null,
        trialUsed: true,
        lastUid: uid,
        unlockedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  return {
    ok: true,
    tier: "pro_permanent",
    source: "manual_code",
    expiresAtMs: null,
  };
});

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
      email_verified: request.auth?.token?.email_verified || false,
    });

    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Login required");
    }

    const uid = request.auth.uid;
    const email = normalizeEmail(request.auth.token.email || "");
    const emailVerified = request.auth.token.email_verified === true;

    if (!isValidEmail(email)) {
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
      const curExpired = isExpiredTs(curExpiresAt, nowMs);

      // 1) Jos uid:llä on jo maksettu/pysyvä eikä vanhentunut -> älä alenna
      if (curRank >= 3 && !curExpired) {
        tx.set(
          entRef,
          {
            updatedAt: FieldValue.serverTimestamp(),
            email,
          },
          { merge: true }
        );

        tx.set(
          emailRef,
          {
            email,
            lastUid: uid,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        return entitlementToClient(currentEnt);
      }

      const emailState = emailSnap.exists ? emailSnap.data() || {} : {};
      const emailTier = emailState.tier || "free";
      const emailRank = tierRank(emailTier);
      const emailExpiresAt = emailState.expiresAt || null;
      const emailExpired = isExpiredTs(emailExpiresAt, nowMs);

      // 2) Palauta maksettu oikeus email-ankkurista uudelle uid:lle
      if (emailRank >= 3 && !emailExpired) {
        if (!emailVerified) {
          throw new HttpsError(
            "failed-precondition",
            "Verified email required for paid entitlement restore"
          );
        }

        const restored = {
          tier: emailTier,
          source: emailState.source || "stripe_restore",
          expiresAt: emailState.expiresAt ?? null,
          unlockedAt: emailState.unlockedAt ?? FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          email,
          meta: {
            email,
            stripeCustomerId: emailState.stripeCustomerId || null,
            stripeSessionId: emailState.stripeSessionId || null,
            restoredFromEmail: email,
          },
        };

        tx.set(entRef, restored, { merge: true });
        tx.set(
          emailRef,
          {
            email,
            lastUid: uid,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        return entitlementToClient(restored);
      }

      let next = {
        tier: "free",
        source: "firebase",
        expiresAt: null,
        updatedAt: FieldValue.serverTimestamp(),
      };

      // 3) Email-allowlist voittaa
      if (allowEmailSnap.exists) {
        const a = allowEmailSnap.data() || {};
        next = {
          tier: a.tier || "pro_permanent",
          source: "allowlist_email",
          expiresAt: a.expiresAt ?? null,
          updatedAt: FieldValue.serverTimestamp(),
        };

        tx.set(entRef, { ...next, email }, { merge: true });
        tx.set(
          emailRef,
          {
            email,
            tier: next.tier,
            source: next.source,
            expiresAt: next.expiresAt,
            lastUid: uid,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        return entitlementToClient(next);
      }

      // 4) Domain-allowlist kiintiöllä
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

        if (memberSnap.exists) {
          tx.set(entRef, { ...domainEnt, email }, { merge: true });
          tx.set(
            emailRef,
            {
              email,
              tier: domainEnt.tier,
              source: domainEnt.source,
              expiresAt: domainEnt.expiresAt,
              lastUid: uid,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          return entitlementToClient(domainEnt);
        }

        if (seats > 0 && used < seats) {
          tx.set(domainMemberRef, {
            createdAt: FieldValue.serverTimestamp(),
            uid,
            email,
          });

          tx.set(
            allowDomainRef,
            { used: used + 1 },
            { merge: true }
          );

          tx.set(entRef, { ...domainEnt, email }, { merge: true });
          tx.set(
            emailRef,
            {
              email,
              tier: domainEnt.tier,
              source: domainEnt.source,
              expiresAt: domainEnt.expiresAt,
              lastUid: uid,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );

          return entitlementToClient(domainEnt);
        }
      }

      // 5) Trial kerran per email
      const trialUsed = emailState.trialUsed === true;

      if (!trialUsed) {
        next = {
          tier: "pro_trial",
          source: "trial",
          expiresAt: trialExpiresTs,
          updatedAt: FieldValue.serverTimestamp(),
        };

        tx.set(entRef, { ...next, email }, { merge: true });
        tx.set(
          emailRef,
          {
            email,
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

      // 6) Trial käytetty -> free
      tx.set(entRef, { ...next, email }, { merge: true });
      tx.set(
        emailRef,
        {
          email,
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
exports.createCheckoutSession = onCall(
  {
    secrets: [STRIPE_SECRET_KEY, STRIPE_PRICE_PRO],
  },
  async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Login required");
  }

  const key = STRIPE_SECRET_KEY.value().trim();
  const priceId = STRIPE_PRICE_PRO.value().trim();;

  if (!key || !key.startsWith("sk_")) {
    throw new HttpsError("failed-precondition", "Stripe key missing");
  }

  if (!priceId || !priceId.startsWith("price_")) {
    throw new HttpsError("failed-precondition", "Stripe price missing");
  }

  const stripe = new Stripe(key, { apiVersion: "2024-06-20" });

  const uid = request.auth.uid;
  const email = normalizeEmail(request.auth.token.email || "");
  const emailVerified = request.auth.token.email_verified === true;

  const appLocale = String(request.data?.locale || "fi").toLowerCase();
  const origin = String(request.data?.origin || "http://127.0.0.1:5173").trim();

  const stripeLocale = mapAppLocaleToStripe(appLocale);
  const infoText = getCheckoutInfoText(appLocale);

  if (!isValidEmail(email)) {
    throw new HttpsError("failed-precondition", "Email is required");
  }

  if (!emailVerified) {
    throw new HttpsError("failed-precondition", "Verified email required");
  }

  const existing = await getExistingPaidAccess({ uid, email });

  if (existing.alreadyPro) {
    logger.info("[createCheckoutSession] alreadyPro, skipping checkout", {
      uid,
      email,
      source: existing.source,
      tier: existing.entitlement?.tier || null,
      expiresAt: existing.entitlement?.expiresAt || null,
      entitlement: existing.entitlement || null,
    });

    return {
      alreadyPro: true,
      source: existing.source,
      tier: existing.entitlement?.tier || "pro_permanent",
      url: null,
    };
  }

  try {
    const idempotencyKey = `checkout_${uid}_${Math.random().toString(36).slice(2)}`;

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        automatic_tax: { enabled: false },
        billing_address_collection: "auto",

        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],

        success_url: `${origin}/?checkout=success`,
        cancel_url: `${origin}/?checkout=cancel`,

        client_reference_id: uid,
        customer_email: email,

        locale: stripeLocale,

        custom_text: {
          submit: {
            message: infoText,
          },
        },

        metadata: {
          uid,
          email,
          app: "kalasaaapp",
          license: "pro",
          emailVerified: "true",
          appLocale,
          env: "prod",
        },
      },
      {
        idempotencyKey,
      }
    );

    if (!session?.url) {
      throw new HttpsError("internal", "Stripe session URL missing");
    }

    return { url: session.url };
  } catch (err) {
    logger.error("[createCheckoutSession] Stripe checkout error", {
      message: safeErrorMessage(err),
      uid,
      email,
      appLocale,
      origin,
      stripeLocale,
    });
    throw new HttpsError("internal", safeErrorMessage(err));
  }
});

// ---------- 3) stripeWebhook ----------
exports.stripeWebhook = onRequest(
  {
    region: "europe-west1",
    invoker: "public",
    secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET],
  },
  async (req, res) => {
    const key = STRIPE_SECRET_KEY.value().trim();
    const webhookSecret = STRIPE_WEBHOOK_SECRET.value().trim();

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

        const rawCountry =
	  session.customer_details?.address?.country || null;
	const countryBucket = normalizeCountryBucket(rawCountry);

        logger.info("[webhook] checkout.session.completed", {
          payment_status: session?.payment_status || null,
          client_reference_id: session?.client_reference_id || null,
          metadata: session?.metadata || null,
          sessionId: session?.id || null,
          customer: session?.customer || null,
          customer_email: session?.customer_email || null,
          customer_details_email: session?.customer_details?.email || null,
        });

        const paid =
          session?.payment_status === "paid" ||
          session?.payment_status === "no_payment_required";

        const uid = session?.metadata?.uid || session?.client_reference_id || null;
        const email = normalizeEmail(
          session?.customer_details?.email ||
            session?.customer_email ||
            session?.metadata?.email ||
            ""
        );
        const stripeCustomerId = session?.customer || null;
        const stripeSessionId = session?.id || null;

	await db.collection("proPurchases").doc(stripeSessionId).set(
	  {
	    uid: uid || null,
	    email: email || null,
	    stripeSessionId: stripeSessionId || null,
	    stripeCustomerId: stripeCustomerId || null,
	    paymentStatus: session?.payment_status || null,
	    countryCode: rawCountry || null,
	    countryBucket: countryBucket || "OTHER",
	    createdAt: FieldValue.serverTimestamp(),
	    updatedAt: FieldValue.serverTimestamp(),
	  },
	  { merge: true }
	);

        await db.collection("analytics").doc("proSalesByCountry").set(
	  {
	    [countryBucket]: FieldValue.increment(1),
	    updatedAt: FieldValue.serverTimestamp(),
	  },
	  { merge: true }
	);
        logger.info("[webhook] checkout.session.completed details", {
          paid,
          uidFromMetadata: session?.metadata?.uid || null,
          uidFromClientReference: session?.client_reference_id || null,
          emailResolved: email || null,
          stripeCustomerId,
          stripeSessionId,
        });

        if (paid) {
	  if (!uid) {
	    logger.warn("[webhook] No uid in metadata/client_reference_id", {
	      sessionId: stripeSessionId,
	      metadata: session?.metadata || null,
	      client_reference_id: session?.client_reference_id || null,
	    });
	  } else {
	    logger.info("[webhook] writing entitlement", {
	      uid,
	      email,
	      sessionId: stripeSessionId,
	      countryCode: rawCountry,
	      countryBucket,
	    });

	    const purchaseRef = db.collection("proPurchases").doc(stripeSessionId);
	    const purchaseSnap = await purchaseRef.get();

	    await purchaseRef.set(
	      {
	        uid: uid || null,
	        email: email || null,
	        stripeSessionId: stripeSessionId || null,
	        stripeCustomerId: stripeCustomerId || null,
	        paymentStatus: session?.payment_status || null,
	        countryCode: rawCountry || null,
	        countryBucket: countryBucket || "OTHER",
	        createdAt: purchaseSnap.exists
	          ? purchaseSnap.data()?.createdAt || FieldValue.serverTimestamp()
	          : FieldValue.serverTimestamp(),
	        updatedAt: FieldValue.serverTimestamp(),
	      },
	      { merge: true }
	    );

	    if (!purchaseSnap.exists) {
	      await db.collection("analytics").doc("proSalesByCountry").set(
	        {
	          [countryBucket]: FieldValue.increment(1),
	          updatedAt: FieldValue.serverTimestamp(),
	        },
	        { merge: true }
	      );
	    }

	logger.info("[webhook] final entitlement payload", {
	  uid,
	  email,
	  tier: "pro_permanent",
	  source: "stripe",
	  stripeSessionId,
	});

    const entRef = db.doc(`entitlements/${uid}`);

	const entDoc = buildPaidEntitlement({
	  tier: "pro_permanent",
	  source: "stripe",
	  expiresAt: null,
	  email: email || null,
	  stripeCustomerId,
	  stripeSessionId,
	});

	logger.info("[webhook] final entitlement payload", {
	  uid,
	  email,
	  tier: "pro_permanent",
	  source: "stripe",
	  stripeSessionId,
	});

await entRef.set(
  {
    tier: "pro_permanent",
    source: "stripe",
    email: email || null,
    expiresAt: null,
    unlockedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    meta: {
      email: email || null,
      stripeCustomerId: stripeCustomerId || null,
      stripeSessionId: stripeSessionId || null,
    },
  },
  { merge: true }
);

    logger.info("[webhook] entitlement doc write ok", {
      uid,
      path: `entitlements/${uid}`,
    });

    if (isValidEmail(email)) {
      const emailRef = db.doc(`entitlement_email/${email}`);

      const emailAnchor = buildEmailAnchor({
        email,
        uid,
        tier: "pro_permanent",
        source: "stripe",
        expiresAt: null,
        stripeCustomerId,
        stripeSessionId,
      });

	// --- domain analytics ---
if (email) {
  const domain = email.split("@")[1];

  const domainRef = db.doc(`pro_domain_allowlist/${domain}`);
  const domainSnap = await domainRef.get();

  if (domainSnap.exists) {
    const memberRef =
      db.doc(`pro_domain_allowlist/${domain}/members/${email}`);

    await memberRef.set({
      email,
      uid,
      stripeSessionId,
      createdAt: FieldValue.serverTimestamp(),
    });

    await domainRef.update({
      memberCount: FieldValue.increment(1),
      used: FieldValue.increment(1),
    });

    logger.info("[webhook] domain member added", {
      domain,
      email,
    });
  }
}
      await emailRef.set(emailAnchor, { merge: true });

      logger.info("[webhook] entitlement_email doc write ok", {
        email,
        path: `entitlement_email/${email}`,
      });
    } else {
      logger.warn("[webhook] Paid session missing valid email anchor", {
        uid,
        sessionId: stripeSessionId,
      });
    }

    logger.info("[webhook] entitlement updated", {
      uid,
      sessionId: stripeSessionId,
      countryCode: rawCountry,
      countryBucket,
    });
  }
} else {
          logger.info("[webhook] session not paid, skipping entitlement", {
            payment_status: session?.payment_status || null,
            sessionId: stripeSessionId,
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