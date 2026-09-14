import crypto from 'node:crypto';
import { AsnParser, AsnSerializer, OctetString } from '@peculiar/asn1-schema';
import { AlgorithmIdentifier, AttributeTypeAndValue, AttributeValue, BasicConstraints, Certificate, Extension,
  Extensions, KeyUsage, Name, RelativeDistinguishedName, SubjectPublicKeyInfo, TBSCertificate, Validity } from '@peculiar/asn1-x509';
import { AttestationApplicationId, AttestationPackageInfo, AuthorizationList, IntegerSet, KeyDescription, RootOfTrust } from '@peculiar/asn1-android';

const digest = (value) => crypto.createHash('sha256').update(value).digest('base64url');

export function createTestDevice(publicOrigin = 'https://pxyb.cn') {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  const { crv, kty, x, y } = jwk;
  const thumbprint = digest(JSON.stringify({ crv, kty, x, y }));
  function sign(path, { method = 'POST', body = '{}', cookie = '', claims: extra = {} } = {}) {
    const url = new URL(path, publicOrigin);
    const header = Buffer.from(JSON.stringify({ typ: 'dpop+jwt', alg: 'ES256', jwk })).toString('base64url');
    const claims = Buffer.from(JSON.stringify({
      jti: crypto.randomBytes(18).toString('base64url'), iat: Math.floor(Date.now() / 1000),
      htm: method, htu: `${url.origin}${url.pathname}`, qsh: digest(url.search), bht: digest(body),
      ...(cookie ? { ath: digest(cookie.slice(cookie.indexOf('=') + 1)) } : {}), ...extra,
    })).toString('base64url');
    const input = `${header}.${claims}`;
    return `${input}.${crypto.sign('sha256', Buffer.from(input), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
  }
  const request = (origin, path, { method = 'POST', body = {}, cookie = '', headers = {} } = {}) => {
    const raw = ['GET', 'HEAD'].includes(method) ? '' : (typeof body === 'string' ? body : JSON.stringify(body));
    return fetch(`${origin}${path}`, {
      method, headers: {
        'Content-Type': 'application/json', 'X-Platform-Request': 'console',
        'User-Agent': 'MY-Control-Android/security-test',
        ...(cookie ? { Cookie: cookie } : {}), ...headers,
        DPoP: sign(path, { method, body: raw, cookie }),
      }, ...(!['GET', 'HEAD'].includes(method) ? { body: raw } : {}),
    });
  };
  return { publicKey, thumbprint, sign, request, async registration(origin, headers = {}) {
    const response = await request(origin, '/api/auth/device/challenge', { headers });
    if (!response.ok) throw new Error('Device registration challenge failed');
    const challenge = await response.json();
    return { challengeId: challenge.challengeId, certificateChain: [] };
  } };
}

export async function createTestPasskey(authStore, username, origin = 'https://pxyb.cn') {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  const id = crypto.randomBytes(24).toString('base64url');
  const cose = Buffer.concat([Buffer.from('a5010203262001215820', 'hex'), Buffer.from(jwk.x, 'base64url'),
    Buffer.from('225820', 'hex'), Buffer.from(jwk.y, 'base64url')]);
  await authStore.savePasskey(username, { id, publicKey: cose.toString('base64url'), counter: 0, transports: ['internal'] });
  let counter = 0;
  return {
    assertion(challenge) {
      const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin }));
      const authData = Buffer.alloc(37);
      crypto.createHash('sha256').update(new URL(origin).hostname).digest().copy(authData);
      authData[32] = 0x05;
      authData.writeUInt32BE(++counter, 33);
      const signature = crypto.sign('sha256', Buffer.concat([authData, crypto.createHash('sha256').update(clientDataJSON).digest()]), privateKey);
      return { id, rawId: id, type: 'public-key', clientExtensionResults: {}, response: {
        clientDataJSON: clientDataJSON.toString('base64url'), authenticatorData: authData.toString('base64url'), signature: signature.toString('base64url'),
      } };
    },
  };
}

export function createTestAttestation(options = {}) {
  const now = Date.UTC(2026, 8, 14);
  const challenge = crypto.randomBytes(32).toString('base64url');
  const keys = () => crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const rootKeys = keys();
  const issuerKeys = keys();
  const deviceKeys = keys();
  const signerDigest = Buffer.alloc(32, 7);
  const name = (value) => new Name([new RelativeDistinguishedName([
    new AttributeTypeAndValue({ type: '2.5.4.3', value: new AttributeValue({ utf8String: value }) }),
  ])]);
  const extension = (extnID, value, critical = true) => new Extension({ extnID, critical, extnValue: new OctetString(AsnSerializer.serialize(value)) });
  const description = new KeyDescription({
    attestationVersion: 3, attestationSecurityLevel: 1, keymasterVersion: 4, keymasterSecurityLevel: 1,
    attestationChallenge: new OctetString(Buffer.from(challenge, 'base64url')),
    softwareEnforced: new AuthorizationList({ attestationApplicationId: new OctetString(AsnSerializer.serialize(new AttestationApplicationId({
      packageInfos: [new AttestationPackageInfo({ packageName: new OctetString(Buffer.from('cn.pxyb.mycontrol')), version: 42 })],
      signatureDigests: [new OctetString(signerDigest)],
    }))) }),
    teeEnforced: new AuthorizationList({ algorithm: 3, keySize: 256, ecCurve: 1, purpose: new IntegerSet([2]),
      digest: new IntegerSet([4]), origin: 0, osPatchLevel: 202609,
      rootOfTrust: new RootOfTrust({ deviceLocked: true, verifiedBootState: 0, verifiedBootKey: new OctetString(Buffer.alloc(32, 1)) }),
      ...options.hardware,
    }),
  });
  description.teeEnforced.purpose = new IntegerSet(description.teeEnforced.purpose);
  description.teeEnforced.digest = new IntegerSet(description.teeEnforced.digest);
  description.teeEnforced.rootOfTrust = new RootOfTrust({ deviceLocked: true, verifiedBootState: 0,
    verifiedBootKey: new OctetString(Buffer.alloc(32, 1)), ...options.hardware?.rootOfTrust });
  function certificate(subject, issuer, publicKey, signingKey, extensions, serial, weak = false) {
    const algorithm = new AlgorithmIdentifier({ algorithm: weak ? '1.2.840.10045.4.1' : '1.2.840.10045.4.3.2' });
    const tbs = new TBSCertificate({ version: 2, serialNumber: Uint8Array.of(serial).buffer, signature: algorithm,
      subject: name(subject), issuer: name(issuer), validity: new Validity({ notBefore: new Date(now - 86_400_000), notAfter: new Date(now + 86_400_000) }),
      subjectPublicKeyInfo: AsnParser.parse(publicKey.export({ type: 'spki', format: 'der' }), SubjectPublicKeyInfo), extensions: new Extensions(extensions),
    });
    return new crypto.X509Certificate(Buffer.from(AsnSerializer.serialize(new Certificate({ tbsCertificate: tbs, signatureAlgorithm: algorithm,
      signatureValue: Uint8Array.from(crypto.sign(weak ? 'sha1' : 'sha256', Buffer.from(AsnSerializer.serialize(tbs)), signingKey)).buffer,
    }))));
  }
  const root = certificate('Root', 'Root', rootKeys.publicKey, rootKeys.privateKey, [
    extension('2.5.29.19', new BasicConstraints({ cA: true, pathLenConstraint: options.rootPathLen ?? 1 })),
    extension('2.5.29.15', new KeyUsage(32)),
  ], 1);
  const issuer = certificate('Issuer', 'Root', issuerKeys.publicKey, rootKeys.privateKey, [
    extension('2.5.29.19', new BasicConstraints({ cA: true, pathLenConstraint: 0 })),
    extension('2.5.29.15', new KeyUsage(options.issuerKeyUsage ?? 32)),
  ], 2);
  const leafExtensions = [extension('2.5.29.19', new BasicConstraints({ cA: false })),
    extension('2.5.29.15', new KeyUsage(1)), extension('1.3.6.1.4.1.11129.2.1.17', description, false)];
  if (options.unknownCritical) leafExtensions.push(extension('1.2.3.4', new BasicConstraints()));
  const leaf = certificate('Device', 'Issuer', deviceKeys.publicKey, issuerKeys.privateKey, leafExtensions, 3, options.weakSignature);
  return { chain: [leaf, issuer, root].map((value) => value.raw.toString('base64')), challenge, publicKey: deviceKeys.publicKey, now, revocations: {},
    config: { androidAttestationRootSha256: [root.fingerprint256], androidAppCertFingerprints: [signerDigest.toString('hex')],
      androidAppPackage: 'cn.pxyb.mycontrol', androidMinVersionCode: 42, androidMaxPatchAgeDays: 180 },
  };
}
