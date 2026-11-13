import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
if (!config.apiKey || !config.projectId)
  throw new Error("Firebase client configuration is missing");
export const auth = getAuth(initializeApp(config));
if (import.meta.env.VITE_AUTH_MODE === "emulator") {
  if (import.meta.env.PROD)
    throw new Error("Auth emulator is disabled in production builds");
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
}
