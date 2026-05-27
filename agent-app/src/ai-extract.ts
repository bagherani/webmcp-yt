import { z } from "zod";

import { getOpenAI, OPENAI_MODEL } from "./openai-client.js";

const BagExtractionSchema = z.object({
  title: z.string().nullable(),
  price: z.string().nullable(),
  url: z.string().nullable(),
});

export const BagInfoSchema = z.object({
  title: z.string(),
  price: z.string(),
  url: z.string().url(),
});

export type BagInfo = z.infer<typeof BagInfoSchema>;

const MAX_SNAPSHOT_CHARS = 48_000;

function trimSnapshot(snapshot: string): string {
  if (snapshot.length <= MAX_SNAPSHOT_CHARS) {
    return snapshot;
  }

  return `${snapshot.slice(0, MAX_SNAPSHOT_CHARS)}\n\n[... snapshot truncated for model context ...]`;
}

export async function extractBagFromSnapshot(
  snapshot: string,
  hints?: { ownedVacuum?: string }
): Promise<z.infer<typeof BagExtractionSchema>> {
  const openai = getOpenAI();
  const hintLines = hints?.ownedVacuum
    ? `Owned vacuum cleaner: ${hints.ownedVacuum}`
    : "";

  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      {
        role: "system",
        content: [
          "You extract data about a vacuum dust bag (stofzuigerzak) from a Miele.nl browser accessibility snapshot.",
          "The user owns a specific vacuum model and needs a compatible bag — not the vacuum itself.",
          "Return JSON with:",
          '- "title": the dust bag product name (e.g. contains "zak", "bag", "HyClean", "GN", "FJM", etc.)',
          '- "price": bag price as shown (e.g. "€ 12,99"), or null if not visible yet',
          '- "url": full https://www.miele.nl/... product link for the bag, or null if not in the snapshot',
          "Ignore the vacuum cleaner's own title/price unless no bag is visible.",
          "Use null for any field you cannot find. Do not guess prices.",
        ].join("\n"),
      },
      {
        role: "user",
        content: `${hintLines ? `${hintLines}\n\n` : ""}Snapshot:\n${trimSnapshot(snapshot)}`,
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 512,
  });

  const rawContent = completion.choices[0]?.message?.content;

  if (!rawContent) {
    throw new Error("The model returned an empty extraction response.");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawContent);
  } catch {
    throw new Error(`The model returned invalid JSON: ${rawContent}`);
  }

  return BagExtractionSchema.parse(parsed);
}

export async function extractBagInfoWithPolling(
  getSnapshot: () => Promise<string>,
  hints?: { ownedVacuum?: string },
  options?: { attempts?: number; intervalMs?: number }
): Promise<BagInfo> {
  const attempts = options?.attempts ?? 12;
  const intervalMs = options?.intervalMs ?? 750;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const snapshot = await getSnapshot();
    const extracted = await extractBagFromSnapshot(snapshot, hints);

    if (extracted.title && extracted.price && extracted.url) {
      return BagInfoSchema.parse({
        title: extracted.title,
        price: extracted.price,
        url: extracted.url,
      });
    }

    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  throw new Error(
    "AI could not extract a compatible bag title, price, and link from the page."
  );
}
