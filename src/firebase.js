// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator, GoogleAuthProvider } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
};

export const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const functions = getFunctions(app, "europe-west1");

// ✅ Käytä emulaattoreita, kun VITE_USE_EMULATORS=true (toimii sekä 5173 että 5000)

const USE_EMULATORS = import.meta.env.VITE_USE_EMULATORS === "true";

if (USE_EMULATORS) {

  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);

  console.log("🔥 Firebase emulators connected");
}

console.log(
  "[FB] DEV=",
  import.meta.env.DEV,
  "USE_EMULATORS=",
  USE_EMULATORS,
  "functions region=",
  "europe-west1",
  "origin=",
  window.location.origin
);