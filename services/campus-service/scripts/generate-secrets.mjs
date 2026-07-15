import { randomBytes } from "node:crypto";

function secret(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

console.log(`HGU_ADMIN_PASSWORD=${secret(24)}`);
console.log(`HGU_APP_SESSION_SECRET=${secret(32)}`);
console.log(`HGU_DATA_ENCRYPTION_KEY=${secret(32)}`);
