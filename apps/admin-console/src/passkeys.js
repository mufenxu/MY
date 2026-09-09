import crypto from 'node:crypto';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';

function userId(username) {
  return new Uint8Array(crypto.createHash('sha256').update(`my-platform:${username}`).digest());
}

function boundedName(value) {
  return String(value || 'Passkey').trim().slice(0, 64) || 'Passkey';
}

export function createPasskeyService({ authStore, rpName, rpID, origin } = {}) {
  if (!authStore || !rpName || !rpID || !origin) throw new Error('Passkey service configuration is incomplete.');

  return {
    async registrationOptions(username) {
      const account = await authStore.findAccount(username);
      if (!account?.active) return null;
      const passkeys = await authStore.getPasskeys(username);
      const options = await generateRegistrationOptions({
        rpName,
        rpID,
        userID: userId(account.id || username),
        userName: username,
        userDisplayName: username,
        attestationType: 'none',
        excludeCredentials: passkeys.map((passkey) => ({ id: passkey.id, transports: passkey.transports || [] })),
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
        supportedAlgorithmIDs: [-7, -257],
      });
      const challengeId = await authStore.saveChallenge({ kind: 'passkey_registration', username, challenge: { value: options.challenge, accountId: account.id, authVersion: account.authVersion || 0 } });
      return { challengeId, options };
    },

    async verifyRegistration(username, { challengeId, response, name } = {}) {
      const challenge = await authStore.consumeChallenge(challengeId, 'passkey_registration', username);
      const account = await authStore.findAccount(username);
      if (!challenge || !response || !account?.active || challenge.accountId !== account.id || challenge.authVersion !== (account.authVersion || 0)) return { verified: false };
      const verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: challenge.value,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
        supportedAlgorithmIDs: [-7, -257],
      });
      if (!verification.verified || !verification.registrationInfo) return { verified: false };
      const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
      const saved = await authStore.savePasskey(username, {
        id: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString('base64url'),
        counter: credential.counter,
        transports: credential.transports || response.response?.transports || [],
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        name: boundedName(name),
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
      }, { accountId: account.id, authVersion: challenge.authVersion });
      return { verified: saved };
    },

    async authenticationOptions(username, { purpose = 'authentication', sessionNonce = '' } = {}) {
      const normalizedUsername = String(username || '').trim();
      const passkeys = normalizedUsername
        ? (await authStore.findAccount(normalizedUsername))?.active ? await authStore.getPasskeys(normalizedUsername) : []
        : [];
      if (normalizedUsername && passkeys.length === 0) return null;
      const optionInput = {
        rpID,
        userVerification: 'required',
      };
      if (normalizedUsername) {
        optionInput.allowCredentials = passkeys.map((passkey) => ({ id: passkey.id, transports: passkey.transports || [] }));
      }
      const options = await generateAuthenticationOptions(optionInput);
      const account = normalizedUsername ? await authStore.findAccount(normalizedUsername) : null;
      const challengeId = await authStore.saveChallenge({
        kind: `passkey_${purpose}`, username: normalizedUsername,
        challenge: { value: options.challenge, sessionNonce, accountId: account?.id, authVersion: account?.authVersion || 0 },
      });
      return { challengeId, options };
    },

    async verifyAuthentication(username, { challengeId, response } = {}, { purpose = 'authentication', sessionNonce = '' } = {}) {
      const normalizedUsername = String(username || '').trim();
      const challenge = await authStore.consumeChallenge(challengeId, `passkey_${purpose}`, normalizedUsername);
      if (!challenge || !response?.id || challenge.sessionNonce !== sessionNonce) return { verified: false };
      const resolved = normalizedUsername
        ? { username: normalizedUsername, passkey: (await authStore.getPasskeys(normalizedUsername)).find((item) => item.id === response.id) }
        : await authStore.findPasskey(response.id);
      const passkey = resolved?.passkey;
      if (!passkey) return { verified: false };
      const account = await authStore.findAccount(resolved.username);
      if (!account?.active || (normalizedUsername && (challenge.accountId !== account.id || challenge.authVersion !== (account.authVersion || 0)))) return { verified: false };
      const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge.value,
        expectedOrigin: origin,
        expectedRPID: rpID,
        credential: {
          id: passkey.id,
          publicKey: new Uint8Array(Buffer.from(passkey.publicKey, 'base64url')),
          counter: passkey.counter,
          transports: passkey.transports || [],
        },
        requireUserVerification: true,
      });
      if (!verification.verified) return { verified: false };
      const updated = await authStore.updatePasskeyCounter(resolved.username, passkey.id, verification.authenticationInfo.newCounter, {
        accountId: account.id, authVersion: account.authVersion || 0, previousCounter: passkey.counter,
      });
      if (!updated) return { verified: false };
      return { verified: true, method: 'passkey', username: resolved.username, accountId: account.id, authVersion: account.authVersion || 0 };
    },
  };
}
