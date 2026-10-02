import {
  RegExpMatcher,
  assignIncrementingIds,
  englishDataset,
  englishRecommendedTransformers,
  parseRawPattern,
} from "obscenity";

const CUSTOM_BLOCKED_WORDS = [
  "chutiya",
  "chutiye",
  "chutiyapa",
  "gandu",
  "gaandu",
  "madarchod",
  "madarchood",
  "behenchod",
  "bhenchod",
  "bhosdi",
  "bhosdike",
  "bhosada",
  "harami",
  "haramkhor",
  "haramzada",
  "kutta",
  "kutte",
  "kutiya",
  "kamina",
  "kamine",
  "kameena",
  "randi",
  "lodu",
  "loda",
  "lund",
  "lauda",
  "jhatu",
  "jhantu",
  "chodu",
  "choda",
  "suar",
  "suwar",
  "bsdk",
  "bkl",
  "gandfat",
  "najayaz",
  "badzaat",
  "bhadwa",
  "bhadwe",
  "kanjar",
  "kanjari",
  "kill you",
  "kill yourself",
  "go kill",
  "go die",
  "you should die",
  "i will kill",
  "rape you",
  "shoot you",
  "stab you",
];

const EXTRA_WHITELIST = [
  "sex education",
  "sexual education",
  "sexual reproduction",
  "sexual health",
  "sex chromosome",
  "same sex",
  "drug abuse",
  "drugs abuse",
  "alcohol abuse",
  "child abuse",
  "abuse of",
  "kill the process",
  "kill process",
  "kill the server",
  "kill a process",
];

const RESERVED_NICKNAME_TOKENS = [
  "admin",
  "administrator",
  "prof",
  "professor",
  "teacher",
  "faculty",
  "dean",
  "principal",
  "moderator",
  "official",
  "staff",
  "hearback",
  "support",
  "system",
  "owner",
  "founder",
];

const englishPreset = englishDataset.build();

const englishMatcher = new RegExpMatcher({
  ...englishPreset,
  whitelistedTerms: [
    ...(englishPreset.whitelistedTerms ?? []),
    ...EXTRA_WHITELIST,
  ],
  ...englishRecommendedTransformers,
});

const customMatcher = new RegExpMatcher({
  blacklistedTerms: assignIncrementingIds(
    CUSTOM_BLOCKED_WORDS.map((word) => parseRawPattern(`|${word}|`)),
  ),
  whitelistedTerms: EXTRA_WHITELIST,
  ...englishRecommendedTransformers,
});

export const MODERATION_BLOCKED_MESSAGE =
  "This text contains language that is not allowed here. Please rewrite it respectfully.";

function compactSeparatedLetters(input: string): string {
  return input.replace(
    /(?:\b[\p{L}\p{N}]\b[\s._\-*|~^]*){3,}/giu,
    (match) => match.replace(/[^\p{L}\p{N}]/giu, ""),
  );
}

function matchesBlocked(input: string): boolean {
  return englishMatcher.hasMatch(input) || customMatcher.hasMatch(input);
}

function hasBlockedLanguage(input: string): boolean {
  const text = input.normalize("NFKC");
  if (!text.trim()) return false;
  if (matchesBlocked(text)) return true;
  const compact = compactSeparatedLetters(text);
  return compact !== text && matchesBlocked(compact);
}

function hasReservedToken(input: string): boolean {
  const tokens = input
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return tokens.some((token) => RESERVED_NICKNAME_TOKENS.includes(token));
}

export interface TextCheck {
  ok: boolean;
  message?: string;
}

export function checkContent(input: string): TextCheck {
  if (hasBlockedLanguage(input)) {
    return { ok: false, message: MODERATION_BLOCKED_MESSAGE };
  }
  return { ok: true };
}

export function checkNickname(input: string): TextCheck {
  const content = checkContent(input);
  if (!content.ok) return content;
  if (hasReservedToken(input)) {
    return {
      ok: false,
      message:
        "This nickname is reserved. Please pick something else so nobody is misled.",
    };
  }
  return { ok: true };
}

export function checkUsername(input: string): TextCheck {
  const content = checkContent(input);
  if (!content.ok) return content;
  if (hasReservedToken(input)) {
    return {
      ok: false,
      message: "This username is reserved. Please choose a different one.",
    };
  }
  return { ok: true };
}
