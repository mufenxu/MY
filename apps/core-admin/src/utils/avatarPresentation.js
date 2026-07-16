const AVATAR_COLORS = ['#2563EB', '#0F766E', '#7C3AED', '#B45309', '#BE123C', '#0369A1'];

export function normalizeAvatarText(value, fallback = 'U') {
  const normalized = String(value || '').trim();
  return normalized || fallback;
}

export function getAvatarInitials(value) {
  const text = normalizeAvatarText(value);
  const words = text.split(/\s+/).filter(Boolean);
  const characters = words.length > 1
    ? [Array.from(words[0])[0], Array.from(words[1])[0]]
    : Array.from(text).slice(0, 2);
  return characters.filter(Boolean).join('').toUpperCase();
}

export function getAvatarColor(value) {
  const text = normalizeAvatarText(value);
  const hash = Array.from(text).reduce((total, character) => (
    ((total * 31) + character.codePointAt(0)) >>> 0
  ), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
