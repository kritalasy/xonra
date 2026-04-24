import { createECDH, createHash } from "node:crypto";

function toBase64Url(buffer) {
    return Buffer.from(buffer)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}

const adminPasscode = process.argv[2] || "change-me-now";
const ecdh = createECDH("prime256v1");
ecdh.generateKeys();

console.log("WEB_PUSH_PUBLIC_KEY=" + toBase64Url(ecdh.getPublicKey(undefined, "uncompressed")));
console.log("WEB_PUSH_PRIVATE_KEY=" + toBase64Url(ecdh.getPrivateKey()));
console.log("WEB_PUSH_SUBJECT=mailto:admin@example.com");
console.log("XONRA_ADMIN_CODE_HASH=" + createHash("sha256").update(adminPasscode).digest("hex"));
