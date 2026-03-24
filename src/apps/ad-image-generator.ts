import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseHTML } from "linkedom";

type ScrapedAdBrief = {
  sourceUrl: string;
  title: string;
  description: string;
  highlights: string[];
};

type GenerateAdImageOptions = {
  url: string;
  outputPath: string;
  audience?: string;
  visualStyle?: string;
  imageModel?: string;
  imageSize?: string;
};

type OpenAiImageResponse = {
  data?: Array<{
    b64_json?: string;
  }>;
};

const DEFAULT_IMAGE_MODEL = "gpt-image-1";
const DEFAULT_IMAGE_SIZE = "1024x1024";
const DEFAULT_HIGHLIGHTS_LIMIT = 6;

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function extractAdBriefFromHtml(url: string, html: string): ScrapedAdBrief {
  const { document } = parseHTML(html);

  const title = normalizeText(document.querySelector("title")?.textContent ?? "");

  const description = normalizeText(
    document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "",
  );

  const highlightCandidates: string[] = [];
  const selectors = ["h1", "h2", "h3", "p", "li"];
  for (const selector of selectors) {
    for (const element of document.querySelectorAll(selector)) {
      const text = normalizeText(element.textContent ?? "");
      if (text.length < 30 || text.length > 220) continue;
      highlightCandidates.push(text);
      if (highlightCandidates.length >= DEFAULT_HIGHLIGHTS_LIMIT * 3) break;
    }
    if (highlightCandidates.length >= DEFAULT_HIGHLIGHTS_LIMIT * 3) break;
  }

  const uniqueHighlights = Array.from(new Set(highlightCandidates)).slice(
    0,
    DEFAULT_HIGHLIGHTS_LIMIT,
  );

  return {
    sourceUrl: url,
    title,
    description,
    highlights: uniqueHighlights,
  };
}

export function buildAdImagePrompt(
  brief: ScrapedAdBrief,
  options?: { audience?: string; style?: string },
): string {
  const parts = [
    "Create a polished digital ad image using the website brief below.",
    `Website: ${brief.sourceUrl}`,
    `Brand title: ${brief.title || "Unknown title"}`,
    `Brand description: ${brief.description || "No description provided"}`,
    `Target audience: ${options?.audience || "General consumers"}`,
    `Visual style: ${options?.style || "Modern, clean, high-converting"}`,
  ];

  if (brief.highlights.length > 0) {
    parts.push("Core value points:");
    for (const highlight of brief.highlights) parts.push(`- ${highlight}`);
  }

  parts.push(
    "Design constraints:",
    "- Prioritize legible typography and strong visual hierarchy.",
    "- Keep composition uncluttered and suitable for social ads.",
    "- Include room for a call-to-action button area.",
  );

  return parts.join("\n");
}

export async function scrapeWebsiteForAdBrief(url: string): Promise<ScrapedAdBrief> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": "moltbot-ad-generator/1.0",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to scrape website (${response.status} ${response.statusText})`);
  }

  const html = await response.text();
  return extractAdBriefFromHtml(url, html);
}

export async function generateAdImageFromWebsite(options: GenerateAdImageOptions): Promise<{
  prompt: string;
  outputPath: string;
}> {
  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is required to generate ad images.");

  const brief = await scrapeWebsiteForAdBrief(options.url);
  const prompt = buildAdImagePrompt(brief, {
    audience: options.audience,
    style: options.visualStyle,
  });

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: options.imageModel || DEFAULT_IMAGE_MODEL,
      size: options.imageSize || DEFAULT_IMAGE_SIZE,
      prompt,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Image generation failed (${response.status}): ${detail}`);
  }

  const payload = (await response.json()) as OpenAiImageResponse;
  const imageBase64 = payload.data?.[0]?.b64_json;
  if (!imageBase64) throw new Error("Image response missing b64_json payload.");

  const resolvedOutputPath = resolve(options.outputPath);
  await mkdir(dirname(resolvedOutputPath), { recursive: true });
  await writeFile(resolvedOutputPath, Buffer.from(imageBase64, "base64"));

  return {
    prompt,
    outputPath: resolvedOutputPath,
  };
}

function parseCliArgs(argv: string[]): GenerateAdImageOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) continue;
    values.set(key, value);
    index += 1;
  }

  const url = values.get("url");
  const outputPath = values.get("out") ?? "./output/ad-image.png";
  if (!url) {
    throw new Error(
      "Missing --url argument. Example: bun src/apps.ad-image-generator.ts --url https://example.com --out ./output/ad.png",
    );
  }

  return {
    url,
    outputPath,
    audience: values.get("audience"),
    visualStyle: values.get("style"),
    imageModel: values.get("model"),
    imageSize: values.get("size"),
  };
}

async function runCli(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));
  const result = await generateAdImageFromWebsite(options);
  process.stdout.write(`Generated ad image: ${result.outputPath}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runCli();
}
