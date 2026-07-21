import auth from '../index.cjs';

export const HEADER_NAME = auth.HEADER_NAME;
export const PLATFORM_SSO_HEADER = auth.PLATFORM_SSO_HEADER;
export const PLATFORM_ROLE_NAMES = auth.PLATFORM_ROLE_NAMES;
export const SAFE_HTTP_METHODS = auth.SAFE_HTTP_METHODS;
export const SCAN_LOGIN_STATUSES = auth.SCAN_LOGIN_STATUSES;
export const SERVICE_AUTH_HEADERS = auth.SERVICE_AUTH_HEADERS;
export const TOKEN_ISSUER = auth.TOKEN_ISSUER;
export const issueInternalIdentity = auth.issueInternalIdentity;
export const issueServiceRequest = auth.issueServiceRequest;
export const isPlatformRole = auth.isPlatformRole;
export const isScanLoginSessionExpired = auth.isScanLoginSessionExpired;
export const isSafeHttpMethod = auth.isSafeHttpMethod;
export const isTerminalScanLoginStatus = auth.isTerminalScanLoginStatus;
export const requestPathWithQuery = auth.requestPathWithQuery;
export const serviceRequestPath = auth.serviceRequestPath;
export const validateInternalKeyPair = auth.validateInternalKeyPair;
export const verifyInternalIdentity = auth.verifyInternalIdentity;
export const verifyPlatformSsoRequest = auth.verifyPlatformSsoRequest;
export const verifyServiceRequest = auth.verifyServiceRequest;

export default auth;
