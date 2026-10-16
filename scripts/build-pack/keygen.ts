import { generatePackKeyPair } from "../lib/pack-tools.ts";

// Usage: npm run pack:keygen
// Prints a new Ed25519 key pair for signing knowledge packs. It writes NOTHING to disk.
//  - PRIVATE key: store it as the GitHub Actions secret TARTEEL_PACK_SIGNING_KEY and nowhere else. Never commit it.
//  - PUBLIC key: commit it as data/knowledge/PUBLISHER-KEY.pub.pem and embed it in the app (the app only verifies).
// Losing the private key means no new pack can be signed for installed apps; a leaked one means rotating the key in a new app release.
const { publicKeyPem, privateKeyPem } = generatePackKeyPair();
console.log("PUBLIC KEY (commit this):\n" + publicKeyPem);
console.log("PRIVATE KEY (secret TARTEEL_PACK_SIGNING_KEY, never commit):\n" + privateKeyPem);
