import { describe, expect, it } from "vitest";

import { buildAdImagePrompt, extractAdBriefFromHtml } from "./ad-image-generator.js";

describe("extractAdBriefFromHtml", () => {
  it("extracts title, description, and highlights", () => {
    const html = `
      <html>
        <head>
          <title>Acme Widgets</title>
          <meta name="description" content="We build premium widgets for e-commerce teams." />
        </head>
        <body>
          <h1>Scale your checkout conversions with smart widget bundles</h1>
          <p>Launch highly targeted storefront experiences with no engineering required.</p>
          <p>Increase average order value using data-informed merchandising blocks.</p>
        </body>
      </html>
    `;

    const brief = extractAdBriefFromHtml("https://example.com", html);

    expect(brief.title).toBe("Acme Widgets");
    expect(brief.description).toBe("We build premium widgets for e-commerce teams.");
    expect(brief.highlights.length).toBeGreaterThan(0);
    expect(brief.highlights[0]).toContain("Scale your checkout conversions");
  });
});

describe("buildAdImagePrompt", () => {
  it("includes source details and constraints", () => {
    const prompt = buildAdImagePrompt(
      {
        sourceUrl: "https://example.com",
        title: "Acme Widgets",
        description: "Premium widgets for modern shops.",
        highlights: ["Fast setup for growth teams."],
      },
      { audience: "E-commerce founders", style: "Minimal and bold" },
    );

    expect(prompt).toContain("Website: https://example.com");
    expect(prompt).toContain("Target audience: E-commerce founders");
    expect(prompt).toContain("Visual style: Minimal and bold");
    expect(prompt).toContain("Design constraints:");
  });
});
