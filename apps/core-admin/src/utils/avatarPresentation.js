const AVATAR_COLORS = ['#2563EB', '#0F766E', '#7C3AED', '#B45309', '#BE123C', '#0369A1'];

const BACKGROUNDS = [
  ['#FFF0F4', '#FF8EAD', '#FFD4DF'],
  ['#EAF7FF', '#50A7E8', '#BFE6FF'],
  ['#FFF5D9', '#F2B84B', '#FFE4A3'],
  ['#EAFBF3', '#48B88A', '#BDEED8'],
  ['#F2EEFF', '#8B75E8', '#D8CFFF'],
  ['#FFF0E7', '#F08A61', '#FFD2BD'],
];
const SKIN_TONES = ['#FFD8C2', '#F5C5A8', '#E9B18E', '#C98662', '#8F563F'];
const HAIR_COLORS = ['#2F2630', '#513A35', '#7A4C32', '#C77B40', '#24334B', '#A64B5F'];
const SHIRT_COLORS = ['#4E8FF7', '#FF7695', '#49B893', '#F2B84B', '#8D76E8', '#F07D62'];
const ACCESSORY_COLORS = ['#FF6F91', '#4E8FF7', '#F2B84B', '#7A68D8'];

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
  const hash = hashAvatarSeed(value);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function hashAvatarSeed(value) {
  const text = normalizeAvatarText(value);
  return Array.from(text).reduce((total, character) => (
    ((total * 31) + character.codePointAt(0)) >>> 0
  ), 0);
}

function createSeededRandom(value) {
  let state = hashAvatarSeed(value) || 0x6D2B79F5;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let result = state;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(items, random) {
  return items[Math.floor(random() * items.length)];
}

function renderHair(style, color) {
  const hairStyles = [
    {
      back: `<path d="M21 45C18 23 29 9 48 9s31 14 27 37l-8 15H29z" fill="${color}"/>`,
      front: `<path d="M23 37C24 18 35 12 49 12c14 0 23 8 25 23-6-2-10-7-12-13-8 9-20 14-37 14z" fill="${color}"/>`,
    },
    {
      back: `<path d="M19 42C18 20 30 9 48 9s30 12 29 34l-3 25-13 5-4-20H37l-3 20-13-5z" fill="${color}"/>`,
      front: `<path d="M22 35C26 17 36 11 50 11c13 0 22 8 24 24-8-2-14-7-18-14-7 8-18 13-34 14z" fill="${color}"/>`,
    },
    {
      back: `<circle cx="27" cy="17" r="10" fill="${color}"/><circle cx="69" cy="17" r="10" fill="${color}"/><path d="M21 44C19 22 30 10 48 10s29 12 27 34L67 60H29z" fill="${color}"/>`,
      front: `<path d="M23 35C27 18 37 12 49 12 62 12 70 20 73 34c-10-1-18-6-24-13-6 7-14 12-26 14z" fill="${color}"/>`,
    },
    {
      back: `<path d="M20 45C18 22 30 9 48 9s30 13 28 36l-7 17H27z" fill="${color}"/><circle cx="23" cy="31" r="8" fill="${color}"/><circle cx="32" cy="17" r="8" fill="${color}"/><circle cx="48" cy="13" r="9" fill="${color}"/><circle cx="64" cy="17" r="8" fill="${color}"/><circle cx="73" cy="31" r="8" fill="${color}"/>`,
      front: `<path d="M24 35c4-10 12-16 24-16 13 0 21 7 24 17-7-1-13-5-17-11-8 6-18 10-31 10z" fill="${color}"/>`,
    },
    {
      back: `<path d="M21 45C18 22 30 9 48 9s31 14 27 37l-8 15H29z" fill="${color}"/>`,
      front: `<path d="M23 36C25 19 36 11 50 11c13 0 22 8 24 23-12-2-20-8-24-17-5 10-14 17-27 19z" fill="${color}"/>`,
    },
  ];
  return hairStyles[style % hairStyles.length];
}

function renderEyes(style) {
  if (style === 1) {
    return '<path d="M34 47q4-5 8 0M54 47q4-5 8 0" fill="none" stroke="#3C3034" stroke-width="2.6" stroke-linecap="round"/>';
  }
  if (style === 2) {
    return '<ellipse cx="38" cy="47" rx="3" ry="4" fill="#3C3034"/><ellipse cx="58" cy="47" rx="3" ry="4" fill="#3C3034"/><circle cx="39" cy="45.5" r="1" fill="#FFF"/><circle cx="59" cy="45.5" r="1" fill="#FFF"/>';
  }
  return '<circle cx="38" cy="47" r="2.6" fill="#3C3034"/><circle cx="58" cy="47" r="2.6" fill="#3C3034"/>';
}

function renderAccessory(style, color) {
  if (style === 1) {
    return `<path d="M27 31c-5-4-8-1-7 4 1 4 5 5 9 2l3-3-5-3zm10 0c5-4 8-1 7 4-1 4-5 5-9 2l-3-3 5-3z" fill="${color}"/><circle cx="32" cy="34" r="3" fill="#FFF"/>`;
  }
  if (style === 2) {
    return `<rect x="25" y="28" width="13" height="5" rx="2.5" fill="${color}" transform="rotate(-12 25 28)"/><circle cx="29" cy="30" r="1.4" fill="#FFF"/><circle cx="34" cy="29" r="1.4" fill="#FFF"/>`;
  }
  if (style === 3) {
    return '<g fill="none" stroke="#4C4145" stroke-width="2"><circle cx="38" cy="47" r="6"/><circle cx="58" cy="47" r="6"/><path d="M44 47h8M31 45l-6-2M65 45l6-2"/></g>';
  }
  return '';
}

export function getCartoonAvatarDataUri(value) {
  const random = createSeededRandom(value);
  const [background, accent, decoration] = pick(BACKGROUNDS, random);
  const skin = pick(SKIN_TONES, random);
  const hairColor = pick(HAIR_COLORS, random);
  const shirt = pick(SHIRT_COLORS, random);
  const accessory = pick(ACCESSORY_COLORS, random);
  const hair = renderHair(Math.floor(random() * 5), hairColor);
  const eyes = renderEyes(Math.floor(random() * 3));
  const accessoryShape = renderAccessory(Math.floor(random() * 5), accessory);
  const mouthStyle = Math.floor(random() * 3);
  const mouth = mouthStyle === 0
    ? '<path d="M43 58q5 5 10 0" fill="none" stroke="#A64E5E" stroke-width="2.4" stroke-linecap="round"/>'
    : mouthStyle === 1
      ? '<path d="M43 58q5 7 10 0" fill="#FFF" stroke="#A64E5E" stroke-width="2" stroke-linejoin="round"/>'
      : '<path d="M44 59q4 3 8 0" fill="none" stroke="#A64E5E" stroke-width="2.2" stroke-linecap="round"/>';

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
      <rect width="96" height="96" rx="24" fill="${background}"/>
      <circle cx="13" cy="18" r="7" fill="${decoration}" opacity=".72"/>
      <circle cx="83" cy="30" r="9" fill="${accent}" opacity=".18"/>
      <path d="M7 72c13-7 18 2 30-2 14-5 23-4 33 2 8 5 14 4 26-2v26H7z" fill="${accent}" opacity=".12"/>
      <path d="M17 96c2-19 14-29 31-29s29 10 31 29z" fill="${shirt}"/>
      <path d="M39 70c2 5 5 8 9 8s7-3 9-8l-3-8H42z" fill="${skin}"/>
      ${hair.back}
      <circle cx="23" cy="46" r="7" fill="${skin}"/>
      <circle cx="73" cy="46" r="7" fill="${skin}"/>
      <ellipse cx="48" cy="43" rx="25" ry="29" fill="${skin}"/>
      ${hair.front}
      ${eyes}
      <ellipse cx="32" cy="56" rx="5" ry="2.5" fill="#F18B9B" opacity=".45"/>
      <ellipse cx="64" cy="56" rx="5" ry="2.5" fill="#F18B9B" opacity=".45"/>
      ${mouth}
      ${accessoryShape}
      <path d="M31 82c5 4 11 6 17 6s12-2 17-6" fill="none" stroke="#FFF" stroke-width="2.4" stroke-linecap="round" opacity=".72"/>
    </svg>
  `.replace(/\s{2,}/g, ' ').trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
