import { PLATFORM_SSO_HEADER, verifyPlatformSsoRequest } from '@my-platform/platform-auth';

export function verifyPlatformSso(req, { audience = 'campus', now = Date.now() } = {}) {
  return verifyPlatformSsoRequest(req, { audience, now });
}

export { PLATFORM_SSO_HEADER };
