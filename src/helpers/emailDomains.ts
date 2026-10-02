const DEFAULT_EDU_DOMAINS = [".edu.in", ".ac.in", ".edu", ".ac.uk"];

export function getAllowedEduDomains(): string[] {
  const raw = process.env.EDU_EMAIL_DOMAINS;
  if (!raw) return DEFAULT_EDU_DOMAINS;
  const parsed = raw
    .split(",")
    .map((value) => normalizeDomainPattern(value))
    .filter(Boolean);
  return parsed.length > 0 ? parsed : DEFAULT_EDU_DOMAINS;
}

export function normalizeDomainPattern(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/^\.+/, "")
    .replace(/\.+$/, "");
}

export function domainMatchesPattern(domain: string, pattern: string): boolean {
  const target = domain.trim().toLowerCase();
  const normalized = normalizeDomainPattern(pattern);
  if (!target || !normalized) return false;
  return target === normalized || target.endsWith(`.${normalized}`);
}

export function emailMatchesPatterns(email: string, patterns: string[]): boolean {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (!domain) return false;
  return patterns.some((pattern) => domainMatchesPattern(domain, pattern));
}

export function domainMatchesPatterns(
  domain: string,
  patterns: string[],
): boolean {
  return patterns.some((pattern) => domainMatchesPattern(domain, pattern));
}

export function isAllowedSchoolEmail(email: string): boolean {
  return emailMatchesPatterns(email, getAllowedEduDomains());
}

export function extractEmailDomain(email: string): string | null {
  const domain = email.split("@")[1]?.trim().toLowerCase();
  return domain ? domain : null;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
