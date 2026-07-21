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
  const pattern = new RegExp(`<input[^>]+name=["']${escapedName}["'][^>]*value=["']([^"']*)["']`, "i");
  return String(html || "").match(pattern)?.[1] || "";
}

export function extractFormAction(html, serviceUrl) {
  const match = String(html || "").match(/<form[^>]+id=["']fm1["'][^>]+action=["']([^"']+)["']/i);
  return match?.[1] || `/cas/login?service=${encodeURIComponent(serviceUrl)}`;
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
