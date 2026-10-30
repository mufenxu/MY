import crypto from 'node:crypto';

const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');

console.log(`PLATFORM_INTERNAL_AUTH_PRIVATE_KEY=${privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64url')}`);
console.log(`PLATFORM_INTERNAL_AUTH_PUBLIC_KEY=${publicKey.export({ format: 'der', type: 'spki' }).toString('base64url')}`);
