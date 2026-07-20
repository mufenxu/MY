import auth from '../index.cjs';

export const HEADER_NAME = auth.HEADER_NAME;
export const PLATFORM_SSO_HEADER = auth.PLATFORM_SSO_HEADER;
export const SERVICE_AUTH_HEADERS = auth.SERVICE_AUTH_HEADERS;
export const TOKEN_ISSUER = auth.TOKEN_ISSUER;
export const issueInternalIdentity = auth.issueInternalIdentity;
export const issueServiceRequest = auth.issueServiceRequest;
export const requestPathWithQuery = auth.requestPathWithQuery;
export const serviceRequestPath = auth.serviceRequestPath;
export const validateInternalKeyPair = auth.validateInternalKeyPair;
export const verifyInternalIdentity = auth.verifyInternalIdentity;
export const verifyPlatformSsoRequest = auth.verifyPlatformSsoRequest;
export const verifyServiceRequest = auth.verifyServiceRequest;

export default auth;
