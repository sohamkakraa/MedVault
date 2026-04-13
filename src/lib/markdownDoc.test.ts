import { describe, expect, it } from "vitest";
import { stripInlineMarkdownForDisplay } from "@/lib/markdownDoc";

describe("stripInlineMarkdownForDisplay", () => {
  it("removes bold and stray markers", () => {
    expect(stripInlineMarkdownForDisplay("**HbA1c** 5.4%")).toBe("HbA1c 5.4%");
    expect(stripInlineMarkdownForDisplay("Result: **high**")).toBe("Result: high");
  });

  it("handles empty input", () => {
    expect(stripInlineMarkdownForDisplay("")).toBe("");
    expect(stripInlineMarkdownForDisplay(undefined)).toBe("");
  });
});
