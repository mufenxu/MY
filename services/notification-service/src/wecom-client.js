const axios = require("axios");

const TOKEN_ERROR_CODES = new Set([40014, 42001, 42007, 42009]);

function createWeComError(message, code, wecomCode = null) {
  const error = new Error(message);
  error.status = 502;
  error.code = code;
  error.wecomCode = Number.isFinite(Number(wecomCode)) ? Number(wecomCode) : null;
  return error;
}

class WeComClient {
  constructor({ corpId, secret, margin = 120 }) {
    this.corpId = corpId;
    this.secret = secret;
    this.margin = Math.max(Number(margin) || 0, 0);
    this.accessToken = null;
    this.expiresAt = 0;
    this.client = axios.create({
      baseURL: "https://qyapi.weixin.qq.com",
      timeout: 10000,
    });
    this.refreshPromise = null;
  }

  async getAccessToken() {
    const now = Date.now() / 1000;
    if (this.accessToken && now < this.expiresAt) {
      return this.accessToken;
    }

    if (!this.refreshPromise) {
      this.refreshPromise = this.refreshAccessToken();
    }

    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  async refreshAccessToken() {
    const response = await this.client.get("/cgi-bin/gettoken", {
      params: {
        corpid: this.corpId,
        corpsecret: this.secret,
      },
    });

    if (response.status !== 200) {
      throw createWeComError(`获取企业微信 token 失败，HTTP 状态码：${response.status}`, 'WECOM_TOKEN_HTTP_ERROR');
    }

    const data = response.data;
    if (data.errcode !== 0) {
      throw createWeComError(
        `获取企业微信 token 失败：${data.errcode} ${data.errmsg || ""}`.trim(),
        'WECOM_TOKEN_ERROR',
        data.errcode,
      );
    }

    const expiresIn = data.expires_in || 7200;
    this.accessToken = data.access_token;
    this.expiresAt = Date.now() / 1000 + expiresIn - this.margin;
    return this.accessToken;
  }

  invalidateToken() {
    this.accessToken = null;
    this.expiresAt = 0;
  }

  async sendMessage(payload) {
    let token = await this.getAccessToken();
    let response = await this.postMessage(token, payload);

    if (response.errcode === 0) {
      return response;
    }

    if (TOKEN_ERROR_CODES.has(response.errcode)) {
      this.invalidateToken();
      token = await this.getAccessToken();
      response = await this.postMessage(token, payload);
    }

    if (response.errcode !== 0) {
      throw createWeComError(
        `企业微信发送失败：${response.errcode} ${response.errmsg || ""}`.trim(),
        'WECOM_MESSAGE_ERROR',
        response.errcode,
      );
    }

    return response;
  }

  async postMessage(accessToken, payload) {
    const response = await this.client.post("/cgi-bin/message/send", payload, {
      params: {
        access_token: accessToken,
      },
    });

    if (response.status !== 200) {
      throw createWeComError(`调用企业微信接口失败，HTTP 状态码：${response.status}`, 'WECOM_MESSAGE_HTTP_ERROR');
    }

    return response.data;
  }
}

module.exports = WeComClient;
module.exports.createWeComError = createWeComError;

