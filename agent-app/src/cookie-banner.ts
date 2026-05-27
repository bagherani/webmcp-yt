import chalk from "chalk";

const COOKIE_ACCEPT_TEXTS = [
  "alle cookies accepteren",
  "accepteren",
  "alles accepteren",
  "accepteer alle",
  "accepteer",
  "accept all",
  "accept",
  "allow all",
  "akkoord",
  "agree",
  "i agree",
];

const COOKIE_POLL_ATTEMPTS = 6;
const COOKIE_POLL_INTERVAL_MS = 600;
const POST_NAV_COOKIE_DELAY_MS = 800;

const COOKIE_DISMISS_AFTER_TOOLS = new Set([
  "new_page",
  "click",
  "fill",
  "press_key",
  "wait_for",
]);

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isCookieAcceptButton(label: string): boolean {
  const normalizedLabel = normalizeText(label);

  if (
    normalizedLabel.includes("instellingen") ||
    normalizedLabel.includes("settings") ||
    normalizedLabel.includes("weiger") ||
    normalizedLabel.includes("reject") ||
    normalizedLabel.includes("weigeren")
  ) {
    return false;
  }

  return COOKIE_ACCEPT_TEXTS.some((candidate) => {
    const normalizedCandidate = normalizeText(candidate);

    if (normalizedLabel === normalizedCandidate) {
      return true;
    }

    if (normalizedCandidate.length <= 3) {
      return false;
    }

    return normalizedLabel.includes(normalizedCandidate);
  });
}

function findCookieAcceptButton(
  snapshotText: string
): { uid: string; label: string } | null {
  const cookieBannerMatch = snapshotText.match(
    /region "Cookie-banner"([\s\S]*?)(?:\n  uid=\S+ region |\n  uid=\S+ Iframe |$)/
  );
  const scopes = cookieBannerMatch
    ? [cookieBannerMatch[1], snapshotText]
    : [snapshotText];

  for (const scope of scopes) {
    const buttonPattern = /uid=([^\s]+)\s+button\s+"([^"]+)"/g;
    let match: RegExpExecArray | null;

    while ((match = buttonPattern.exec(scope)) !== null) {
      const [, uid, label] = match;

      if (isCookieAcceptButton(label)) {
        return { uid, label };
      }
    }
  }

  return null;
}

function hasCookieBanner(snapshotText: string): boolean {
  return /region "Cookie-banner"/.test(snapshotText);
}

export type McpCallTool = (toolName: string, args: unknown) => Promise<string>;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function dismissCookieBanner(
  callTool: McpCallTool,
  options?: { quiet?: boolean }
): Promise<boolean> {
  for (let attempt = 0; attempt < COOKIE_POLL_ATTEMPTS; attempt += 1) {
    const snapshotText = await callTool("take_snapshot", {});
    const acceptButton = findCookieAcceptButton(snapshotText);

    if (acceptButton) {
      await callTool("click", { uid: acceptButton.uid });

      if (!options?.quiet) {
        console.log(
          `${chalk.cyanBright("->")} ${chalk.cyan(
            `Accepted cookies via "${acceptButton.label}".`
          )}`
        );
      }

      await delay(1000);
      return true;
    }

    if (!hasCookieBanner(snapshotText)) {
      return false;
    }

    await delay(COOKIE_POLL_INTERVAL_MS);
  }

  return false;
}

export function shouldDismissCookiesAfterTool(toolName: string): boolean {
  return COOKIE_DISMISS_AFTER_TOOLS.has(toolName);
}

export function getPostNavigationCookieDelayMs(): number {
  return POST_NAV_COOKIE_DELAY_MS;
}

export function wrapCallToolWithCookieDismiss(
  callTool: McpCallTool
): McpCallTool {
  return async (toolName, args) => {
    const result = await callTool(toolName, args);

    if (!shouldDismissCookiesAfterTool(toolName)) {
      return result;
    }

    await delay(getPostNavigationCookieDelayMs());
    await dismissCookieBanner(callTool, { quiet: false });

    return result;
  };
}
