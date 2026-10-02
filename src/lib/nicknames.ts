const ADJECTIVES = [
  "Quiet", "Brave", "Clever", "Calm", "Swift", "Bright", "Wise", "Gentle",
  "Bold", "Curious", "Lucky", "Mellow", "Nimble", "Sharp", "Sunny", "Fierce",
];

const ANIMALS = [
  "Tiger", "Fox", "Wolf", "Owl", "Lynx", "Falcon", "Panda", "Dolphin",
  "Hedgehog", "Otter", "Raven", "Sparrow", "Koala", "Gecko", "Whale",
];

export function generateNickname(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const number = Math.floor(10 + Math.random() * 90);
  return `${adj}${animal}${number}`;
}

export function isValidNickname(value: string): boolean {
  const trimmed = value.trim().slice(0, 24);
  return trimmed.length >= 2 && /^[A-Za-z0-9 _-]+$/.test(trimmed);
}