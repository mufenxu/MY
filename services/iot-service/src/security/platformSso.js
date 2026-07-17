const { HEADER_NAME, verifyPlatformSsoRequest } = require('@my-platform/platform-auth');

function verifyPlatformSso(req, audience = 'iot', now = Date.now()) {
  return verifyPlatformSsoRequest(req, { audience, now });
}

module.exports = { HEADER_NAME, verifyPlatformSso };
