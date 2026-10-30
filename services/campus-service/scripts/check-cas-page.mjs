#!/usr/bin/env node
// 诊断学校 CAS 登录页“实际返回了什么”。
// 用法：node scripts/check-cas-page.mjs
// 可用 HGU_CAS_ORIGIN / HGU_CAS_SERVICE 覆盖目标地址。
import { Agent } from "undici";

const CAS_ORIGIN = process.env.HGU_CAS_ORIGIN || "https://cas.hgu.edu.cn";
const SERVICE_URL = process.env.HGU_CAS_SERVICE || "https://nrg.hgu.edu.cn/wecom/oauth/servicecenter/main.do";
const url = `${CAS_ORIGIN}/cas/login?service=${encodeURIComponent(SERVICE_URL)}`;

const HEADERS = {
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
  "cache-control": "max-age=0",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "sec-fetch-user": "?1",
  "upgrade-insecure-requests": "1"
};

function request(dispatcher) {
  return fetch(url, {
    headers: HEADERS,
    redirect: "manual",
    ...(dispatcher ? { dispatcher } : {})
  });
}

let response;
let relaxed = false;
try {
  response = await request(null);
} catch (error) {
  const code = error?.cause?.code || error?.code || "";
  console.log(`严格 TLS 请求失败：${code || error.message}`);
  response = await request(new Agent({ connect: { rejectUnauthorized: false } }));
  relaxed = true;
  console.log("已改用宽松 TLS 重试（仅用于诊断）。");
}

const location = response.headers.get("location");
const html = await response.text();
const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.replace(/\s+/g, " ").trim() || "";
const text = html
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .trim();
const markers = ["execution", "fm1", "统一身份认证", "Sangfor", "深信服", "上网认证", "上网行为", "拦截", "准入"]
  .filter((keyword) => html.toLowerCase().includes(keyword.toLowerCase()));

console.log("---");
console.log("URL      :", url);
console.log("状态码   :", response.status);
console.log("宽松 TLS :", relaxed ? "是（链路证书无法用公共 CA 校验）" : "否");
if (location) console.log("Location :", location);
console.log("字节数   :", Buffer.byteLength(html, "utf8"));
console.log("标题     :", title || "(无)");
console.log("命中特征 :", markers.join(", ") || "(无)");
console.log("正文样本 :", text.slice(0, 300) || "(空)");
console.log("---");

if (markers.includes("execution")) {
  console.log("结论：CAS 登录页正常，execution 可解析。");
} else if (markers.some((item) => ["Sangfor", "深信服", "上网认证", "上网行为", "准入"].includes(item))) {
  console.log("结论：返回的是深信服网关页面，不是 CAS 登录页。需要在服务器侧完成上网认证或请网络中心放行。");
} else if (response.status >= 300 && response.status < 400) {
  console.log("结论：返回的是跳转（未跟随）。请把 Location 一并提供给排查。");
} else {
  console.log("结论：不是 CAS 登录页，请根据标题与正文样本判断拦截来源。");
}
