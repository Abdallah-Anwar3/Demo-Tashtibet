// Generates a VAPID key pair for Web Push. Run:  node scripts/gen-vapid.mjs
// No packages needed. Keep the private key secret (Supabase secret only, never in the app).
import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
});
const jwk = privateKey.export({ format: "jwk" });
const b64u = (b) => Buffer.from(b).toString("base64url");
const pub = Buffer.concat([
  Buffer.from([4]),
  Buffer.from(jwk.x, "base64url"),
  Buffer.from(jwk.y, "base64url"),
]);

console.log(
  "\nVAPID_PUBLIC_KEY  (Supabase secret AND Vercel env VITE_VAPID_PUBLIC_KEY):\n" +
    b64u(pub),
);
console.log("\nVAPID_PRIVATE_KEY (Supabase secret ONLY):\n" + jwk.d);
console.log(
  "\nVAPID_SUBJECT     (Supabase secret):\nmailto:your-email@example.com\n",
);
void publicKey;
