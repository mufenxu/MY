function modPow(base, exponent, modulus) {
  let result = 1n;
  let value = base % modulus;
  let power = exponent;
  while (power > 0n) {
    if (power & 1n) result = (result * value) % modulus;
    power >>= 1n;
    value = (value * value) % modulus;
  }
  return result;
}

function highDigitIndexFromHex(hex) {
  const normalized = String(hex || "").replace(/^0+/, "") || "0";
  return Math.ceil(normalized.length / 4) - 1;
}

export function casEncryptPassword(password, { modulusHex, exponentHex }) {
  const modulus = BigInt(`0x${modulusHex}`);
  const exponent = BigInt(`0x${exponentHex}`);
  const chunkSize = 2 * highDigitIndexFromHex(modulusHex);
  if (chunkSize <= 0) throw new Error("CAS RSA modulus is invalid.");
  const bytes = Array.from(String(password), (char) => char.charCodeAt(0));
  while (bytes.length % chunkSize !== 0) bytes.push(0);

  const blocks = [];
  for (let index = 0; index < bytes.length; index += chunkSize) {
    let block = 0n;
    for (let digitIndex = 0, cursor = index; cursor < index + chunkSize; digitIndex += 1) {
      const digit = BigInt(bytes[cursor++] + (bytes[cursor++] << 8));
      block += digit << BigInt(16 * digitIndex);
    }
    blocks.push(modPow(block, exponent, modulus).toString(16));
  }
  return blocks.join(" ");
}

export function extractInputValue(html, name) {
  const escapedName = String(name || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const source = String(html || "");
  // 属性顺序不固定：name 在前（常见）与 value 在前（部分网关改写后）都要能取到。
  const nameFirst = new RegExp(
    `<input[^>]*\\bname=["']${escapedName}["'][^>]*\\bvalue=["']([^"']*)["']`,
    "i"
  );
  const hit = source.match(nameFirst);
  if (hit) return hit[1];
  const valueFirst = new RegExp(
    `<input[^>]*\\bvalue=["']([^"']*)["'][^>]*\\bname=["']${escapedName}["']`,
    "i"
  );
  return source.match(valueFirst)?.[1] || "";
}

export function extractFormAction(html, serviceUrl) {
  const source = String(html || "");
  const forms = source.match(/<form[^>]*>/gi) || [];
  const pickAction = (tag) => tag?.match(/\baction=["']([^"']+)["']/i)?.[1] || "";
  const fm1 = forms.find((tag) => /\bid=["']fm1["']/i.test(tag));
  // 优先 CAS 标准的 fm1；被网关改写后可能没有 id，退化为第一个带 action 的表单。
  return pickAction(fm1)
    || pickAction(forms.find((tag) => /\baction=["']/i.test(tag)))
    || `/cas/login?service=${encodeURIComponent(serviceUrl)}`;
}

// 登录页拿不到 execution 时，把「到底拿回了什么」记下来。
// 校园出口常见深信服（Sangfor）SSL 解密网关，未放行时会返回自己的认证页，
// 表现和 CAS 页面结构变化完全一样，必须靠指纹区分。
export function describeLoginPage(html) {
  const source = String(html || "");
  const title = source.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() || "";
  const text = source
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const markers = [
    "execution", "fm1", "统一身份认证", "cas/login",
    "Sangfor", "深信服", "上网认证", "上网行为", "准入", "认证失败", "请先登录"
  ].filter((marker) => source.toLowerCase().includes(marker.toLowerCase()));
  return {
    bytes: Buffer.byteLength(source, "utf8"),
    title,
    markers,
    // 未解压的 gzip 会以 0x1f 0x8b 开头，解码后表现为大量替换字符。
    looksCompressed: source.charCodeAt(0) === 0x1f && source.charCodeAt(1) === 0x8b,
    replacementChars: (source.match(/\uFFFD/g) || []).length,
    sample: text.slice(0, 200)
  };
}

export function htmlErrorMessage(html, fallback = "登录失败，请检查账号密码或是否需要验证码。") {
  const source = String(html || "");
  const candidates = [
    source.match(/<span[^>]+id=["']msg1["'][^>]*>([\s\S]*?)<\/span>/i)?.[1],
    source.match(/<span[^>]+id=["']swiSpan1["'][^>]*>([\s\S]*?)<\/span>/i)?.[1],
    source.match(/class=["'][^"']*form-error[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]
  ].filter(Boolean);
  return candidates
    .map((item) => item.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim())
    .find(Boolean) || fallback;
}
