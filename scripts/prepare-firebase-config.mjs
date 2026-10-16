/**
 * Produces a Firebase web config only inside a deployment runner.
 * No service-account credentials or secrets may be placed in client code.
 */
import { writeFileSync } from "node:fs";

const mapping = {
  apiKey: "FIREBASE_API_KEY",
  authDomain: "FIREBASE_AUTH_DOMAIN",
  projectId: "FIREBASE_PROJECT_ID",
  appId: "FIREBASE_APP_ID"
};
const config = {};
for (const [key, variable] of Object.entries(mapping)) {
  const value = (process.env[variable] || "").trim();
  if (!value || value.startsWith("REPLACE_WITH_")) {
    console.error("Missing deployment variable: " + variable);
    process.exit(1);
  }
  config[key] = value;
}
if (config.projectId.includes("/") || config.authDomain.includes("/")) {
  throw new Error("Invalid Firebase project/domain values");
}
writeFileSync(
  "firebase-config.js",
  "// Generated in CI from Firebase public web-app configuration.\n" +
  "window.BALI_FIREBASE_CONFIG = Object.freeze(" +
  JSON.stringify(config, null, 2) + ");\n",
  "utf8"
);
console.log("Web config generated for Firebase project:", config.projectId);
