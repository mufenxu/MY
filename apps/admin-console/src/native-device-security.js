import crypto from 'node:crypto';
import { AsnParser } from '@peculiar/asn1-schema';
import { BasicConstraints, Certificate, KeyUsage, KeyUsageFlags } from '@peculiar/asn1-x509';
import { AttestationApplicationId, KeyDescription } from '@peculiar/asn1-android';

const ATTESTATION_OID = '1.3.6.1.4.1.11129.2.1.17';
const CERTIFICATE_SIGNATURE_ALGORITHMS = new Set([
  '1.2.840.113549.1.1.11', '1.2.840.113549.1.1.12', '1.2.840.113549.1.1.13',
  '1.2.840.10045.4.3.2', '1.2.840.10045.4.3.3', '1.2.840.10045.4.3.4',
]);
export const proofDigest = (value) => crypto.createHash('sha256').update(value).digest('base64url');
const fingerprint = (value) => String(value || '').replace(/:/g, '').toLowerCase();

export async function readDeviceRequestBody(req, limit = 1024 * 1024) {
  if (req.bodyDigest) return;
  if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') {
    throw new DeviceSecurityError('DEVICE_BODY_ENCODING', '设备请求不支持压缩正文。', 415);
  }
  const hasBody = req.headers['transfer-encoding'] || Number(req.headers['content-length'] || 0) > 0;
  if (!hasBody) {
    req.bodyDigest = proofDigest('');
    return;
  }
  if (req.readableEnded || Number(req.headers['content-length']) > limit) {
    throw new DeviceSecurityError('DEVICE_BODY_INVALID', '设备请求正文无法验证或超过大小限制。', 413);
  }
  req.deviceRequestBody = await new Promise((resolve, rejectBody) => {
    const chunks = [];
    let size = 0;
    const finish = (error) => {
      clearTimeout(timer);
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('error', onError);
      req.off('aborted', onAbort);
      if (error) { req.resume(); rejectBody(error); }
      else resolve(Buffer.concat(chunks, size));
    };
    const onData = (chunk) => {
      size += chunk.length;
      if (size > limit) finish(new DeviceSecurityError('DEVICE_BODY_TOO_LARGE', '设备请求正文超过大小限制。', 413));
      else chunks.push(chunk);
    };
    const onEnd = () => finish();
    const onError = () => finish(new DeviceSecurityError('DEVICE_BODY_INVALID', '设备请求正文不完整。', 400));
    const onAbort = onError;
    const timer = setTimeout(() => finish(new DeviceSecurityError('DEVICE_BODY_TIMEOUT', '设备请求正文接收超时。', 408)), 15_000);
    timer.unref?.();
    req.on('data', onData).once('end', onEnd).once('error', onError).once('aborted', onAbort);
  });
  req.bodyDigest = proofDigest(req.deviceRequestBody);
}

export class DeviceSecurityError extends Error {
  constructor(code, message, status = 403) {
    super(message);
    this.name = 'DeviceSecurityError';
    this.code = code;
    this.status = status;
  }
}

function reject(code = 'DEVICE_PROOF_INVALID', message = '设备请求验证失败，请重新登录。') {
  throw new DeviceSecurityError(code, message);
}

export function verifyDeviceProof({ proof, method, url, bodyDigest, token = '', now = Date.now() }) {
  if (typeof proof !== 'string' || proof.length > 8192) reject();
  const parts = proof.split('.');
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) reject();
  let header;
  let claims;
  let publicKey;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url'));
    claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
    if (!header || !claims || typeof header !== 'object' || typeof claims !== 'object' || Array.isArray(header) || Array.isArray(claims)) reject();
    const jwk = header.jwk;
    if (header.typ !== 'dpop+jwt' || header.alg !== 'ES256' || Object.hasOwn(header, 'crit') || jwk?.kty !== 'EC' || jwk.crv !== 'P-256' || Object.hasOwn(jwk, 'd')) reject();
    if (![jwk.x, jwk.y].every((value) => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value))) reject();
    if (![jwk.x, jwk.y].every((value) => Buffer.from(value, 'base64url').toString('base64url') === value)) reject();
    publicKey = crypto.createPublicKey({ key: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, format: 'jwk' });
  } catch { reject(); }
  const target = new URL(url);
  const signature = Buffer.from(parts[2], 'base64url');
  if (signature.length !== 64 || !crypto.verify('sha256', Buffer.from(`${parts[0]}.${parts[1]}`), {
    key: publicKey, dsaEncoding: 'ieee-p1363',
  }, signature)) reject();
  if (!Number.isSafeInteger(claims.iat) || Math.abs(Math.floor(now / 1000) - claims.iat) > 60) reject('DEVICE_PROOF_EXPIRED', '设备时间与服务器不一致，或请求证明已过期。');
  if (typeof claims.jti !== 'string' || !/^[A-Za-z0-9_-]{16,96}$/.test(claims.jti)) reject();
  // DPoP binds method, origin/path and token; these required extensions also cover query and exact body bytes.
  if (claims.htm !== method || claims.htu !== `${target.origin}${target.pathname}` ||
      claims.qsh !== proofDigest(target.search) || claims.bht !== bodyDigest ||
      (token ? claims.ath !== proofDigest(token) : claims.ath !== undefined)) reject();
  const { crv, kty, x, y } = header.jwk;
  return { thumbprint: proofDigest(JSON.stringify({ crv, kty, x, y })), publicKey, jti: claims.jti };
}

export function verifyAndroidAttestation({ chain, challenge, publicKey, config, revocations, now = Date.now() }) {
  if (!Array.isArray(chain) || chain.length < 2 || chain.length > 8 || chain.some((value) => typeof value !== 'string' || value.length > 12_000)) reject('DEVICE_ATTESTATION_INVALID', '设备证明证书格式无效。');
  const certificates = chain.map((value) => new crypto.X509Certificate(Buffer.from(value, 'base64')));
  const parsedCertificates = certificates.map((value) => AsnParser.parse(value.raw, Certificate));
  const root = certificates.at(-1);
  const allowedRoots = config.androidAttestationRootSha256.map(fingerprint);
  if (!allowedRoots.includes(fingerprint(root.fingerprint256)) || !root.ca || !root.verify(root.publicKey)) reject('DEVICE_ATTESTATION_UNTRUSTED', '设备证明未由受信任的硬件根证书签发。');
  for (let index = 0; index < certificates.length; index += 1) {
    const certificate = certificates[index];
    const parsed = parsedCertificates[index];
    if (!CERTIFICATE_SIGNATURE_ALGORITHMS.has(parsed.signatureAlgorithm.algorithm) ||
        parsed.signatureAlgorithm.algorithm !== parsed.tbsCertificate.signature.algorithm) reject('DEVICE_ATTESTATION_INVALID', '设备证明证书签名算法不符合要求。');
    const key = certificate.publicKey;
    const strongKey = key.asymmetricKeyType === 'rsa' ? key.asymmetricKeyDetails.modulusLength >= 2048
      : key.asymmetricKeyType === 'ec' && ['prime256v1', 'secp384r1', 'secp521r1'].includes(key.asymmetricKeyDetails.namedCurve);
    if (!strongKey) reject('DEVICE_ATTESTATION_INVALID', '设备证明证书密钥强度不足。');
    const extensions = parsed.tbsCertificate.extensions || [];
    const ids = new Set();
    for (const extension of extensions) {
      if (ids.has(extension.extnID) || (extension.critical && !['2.5.29.19', '2.5.29.15', ...(index === 0 ? [ATTESTATION_OID] : [])].includes(extension.extnID))) {
        reject('DEVICE_ATTESTATION_INVALID', '设备证明证书包含不受支持的约束。');
      }
      ids.add(extension.extnID);
    }
    const constraintsExtension = extensions.find((item) => item.extnID === '2.5.29.19');
    const constraints = constraintsExtension && AsnParser.parse(constraintsExtension.extnValue.buffer, BasicConstraints);
    const usageExtension = extensions.find((item) => item.extnID === '2.5.29.15');
    if ((index === 0 && constraints?.cA) || (index > 0 && !constraints?.cA) ||
        (usageExtension && !(AsnParser.parse(usageExtension.extnValue.buffer, KeyUsage).toNumber() &
          (index === 0 ? KeyUsageFlags.digitalSignature : KeyUsageFlags.keyCertSign)))) reject('DEVICE_ATTESTATION_INVALID', '设备证明证书用途不符合要求。');
    // pathLen counts non-self-issued CA certificates below this issuer, excluding the device leaf.
    if (constraints?.pathLenConstraint !== undefined && certificates.slice(1, index).filter((item) => item.subject !== item.issuer).length > constraints.pathLenConstraint) {
      reject('DEVICE_ATTESTATION_INVALID', '设备证明证书链超过允许的签发层级。');
    }
    if (Date.parse(certificate.validFrom) > now || Date.parse(certificate.validTo) <= now) reject('DEVICE_ATTESTATION_EXPIRED', '设备证明证书已过期。');
    const serial = certificate.serialNumber.toLowerCase().replace(/^0+/, '') || '0';
    if (Object.hasOwn(revocations, serial)) reject('DEVICE_ATTESTATION_REVOKED', '设备证明证书已被撤销。');
    if (index + 1 < certificates.length) {
      const issuer = certificates[index + 1];
      if (!issuer.ca || !certificate.checkIssued(issuer) || !certificate.verify(issuer.publicKey)) reject('DEVICE_ATTESTATION_INVALID', '设备证明证书链验证失败。');
    }
  }
  const leaf = certificates[0];
  if (!leaf.publicKey.export({ type: 'spki', format: 'der' }).equals(publicKey.export({ type: 'spki', format: 'der' }))) reject();
  const parsed = parsedCertificates[0];
  const extensions = parsed.tbsCertificate.extensions?.filter((item) => item.extnID === ATTESTATION_OID) || [];
  if (extensions.length !== 1) reject('DEVICE_ATTESTATION_INVALID', '缺少有效的 Android 硬件证明。');
  const description = AsnParser.parse(extensions[0].extnValue.buffer, KeyDescription);
  if (!Buffer.from(description.attestationChallenge.buffer).equals(Buffer.from(challenge, 'base64url')) ||
      ![1, 2].includes(description.attestationSecurityLevel) || ![1, 2].includes(description.keymasterSecurityLevel)) reject('DEVICE_ATTESTATION_INVALID', '设备证明挑战或硬件安全等级不符合要求。');
  const hardware = description.teeEnforced;
  if (!hardware.rootOfTrust?.deviceLocked || hardware.rootOfTrust.verifiedBootState !== 0 ||
      hardware.origin !== 0 || hardware.algorithm !== 3 || hardware.keySize !== 256 || hardware.ecCurve !== 1 ||
      !hardware.purpose?.includes(2) || hardware.purpose.some((value) => ![2, 3].includes(value)) ||
      !hardware.digest?.includes(4) || hardware.digest.some((value) => ![4, 5, 6].includes(value)) ||
      hardware.allApplications !== undefined || description.softwareEnforced.allApplications !== undefined) reject('DEVICE_INTEGRITY_FAILED', '设备启动状态或硬件密钥不符合安全要求。');
  const appId = description.softwareEnforced.attestationApplicationId;
  if (!appId) reject('DEVICE_ATTESTATION_INVALID', '设备证明未包含应用身份。');
  const application = AsnParser.parse(appId.buffer, AttestationApplicationId);
  const packageInfo = application.packageInfos[0];
  const acceptedSigners = config.androidAppCertFingerprints.map(fingerprint);
  if (application.packageInfos.length !== 1 || Buffer.from(packageInfo.packageName).toString() !== config.androidAppPackage ||
      application.signatureDigests.length === 0 || application.signatureDigests.some((value) => !acceptedSigners.includes(Buffer.from(value).toString('hex')))) reject('DEVICE_APP_UNRECOGNIZED', '当前应用签名未通过验证，请安装官方版本。');
  const versionCode = packageInfo.version;
  if (!Number.isSafeInteger(versionCode) || versionCode < config.androidMinVersionCode) reject('APP_UPDATE_REQUIRED', '当前版本不再受支持，请更新应用。');
  const patch = String(hardware.osPatchLevel || '');
  const patchTime = /^\d{6}$/.test(patch) && Number(patch.slice(4)) >= 1 && Number(patch.slice(4)) <= 12
    ? Date.UTC(Number(patch.slice(0, 4)), Number(patch.slice(4)) - 1, 1) : NaN;
  if (!Number.isFinite(patchTime) || patchTime > now || now - patchTime > config.androidMaxPatchAgeDays * 86_400_000) reject('DEVICE_PATCH_OUTDATED', '设备安全补丁过旧，请更新系统后重试。');
  return { integrity: 'verified', attestedAt: now, versionCode };
}

export function createNativeDeviceSecurity({ config, authStore, fetchImpl = fetch, now = () => Date.now() }) {
  const verifiedRequests = new WeakMap();
  let revocationCache;
  let pendingRevocations;
  async function revocations() {
    if (revocationCache?.expiresAt > now()) return revocationCache.entries;
    if (!pendingRevocations) {
      pendingRevocations = (async () => {
        const response = await fetchImpl('https://android.googleapis.com/attestation/status', { signal: AbortSignal.timeout(8000), redirect: 'error' });
        if (!response.ok) throw new Error('Revocation service unavailable');
        const raw = await response.text();
        if (raw.length > 4 * 1024 * 1024) throw new Error('Invalid revocation response');
        const value = JSON.parse(raw);
        if (!value.entries || typeof value.entries !== 'object' || Array.isArray(value.entries)) throw new Error('Invalid revocation response');
        const entries = Object.fromEntries(Object.entries(value.entries).map(([serial, entry]) => [serial.toLowerCase().replace(/^0+/, '') || '0', entry]));
        revocationCache = { entries, expiresAt: now() + 60 * 60_000 };
        return entries;
      })().finally(() => { pendingRevocations = null; });
    }
    return pendingRevocations;
  }
  return {
    async challenge() {
      const value = crypto.randomBytes(32).toString('base64url');
      const challengeId = await authStore.saveChallenge({ kind: 'android_device', username: '', ttlMs: 5 * 60_000, challenge: { value } });
      return { challengeId, challenge: value, attestationConfigured: config.androidAttestationRootSha256.length > 0, attestationRequired: config.androidRequireIntegrity };
    },
    async proof(req, token = '') {
      const cached = verifiedRequests.get(req);
      if (cached?.token === token) return cached.proof;
      const requestPath = req.securityOriginalUrl || req.originalUrl || req.url;
      if (typeof requestPath !== 'string' || !requestPath.startsWith('/') || requestPath.startsWith('//')) reject();
      await readDeviceRequestBody(req);
      const proof = verifyDeviceProof({
        proof: req.headers.dpop, method: req.method,
        url: new URL(requestPath, config.publicOrigin).toString(),
        bodyDigest: req.bodyDigest, token, now: now(),
      });
      if (!await authStore.claimDeviceProof(`${proof.thumbprint}:${proof.jti}`, now() + 125_000)) reject('DEVICE_PROOF_REPLAYED', '该设备请求已使用，请重新操作。');
      verifiedRequests.set(req, { token, proof });
      return proof;
    },
    async register(proof, registration) {
      if (!proof || !registration || typeof registration.challengeId !== 'string') reject();
      const challenge = await authStore.consumeChallenge(registration.challengeId, 'android_device', '');
      if (!challenge) reject('DEVICE_ATTESTATION_EXPIRED', '设备注册挑战已失效，请重新登录。');
      const unverified = { thumbprint: proof.thumbprint, integrity: 'unverified', attestedAt: 0, versionCode: 0 };
      if (!config.androidAttestationRootSha256.length) {
        if (config.androidRequireIntegrity) reject('DEVICE_ATTESTATION_UNAVAILABLE', '设备完整性验证尚未配置。');
        return unverified;
      }
      let revoked;
      try { revoked = await revocations(); } catch {
        throw new DeviceSecurityError('DEVICE_ATTESTATION_UNAVAILABLE', '设备完整性验证暂不可用，请稍后重试。', 503);
      }
      try {
        return { thumbprint: proof.thumbprint, ...verifyAndroidAttestation({
          chain: registration.certificateChain, challenge: challenge.value, publicKey: proof.publicKey,
          config, revocations: revoked, now: now(),
        }) };
      } catch (error) {
        if (error instanceof DeviceSecurityError) throw error;
        throw new DeviceSecurityError('DEVICE_ATTESTATION_INVALID', '设备证明证书无效，请检查设备系统后重试。');
      }
    },
  };
}
