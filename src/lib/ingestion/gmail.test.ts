import { describe, it, expect } from "vitest";
import { stripHtml } from "./gmail";

describe("stripHtml", () => {
  it("keeps visible text", () => {
    expect(stripHtml("<p>Your Pro subscription is confirmed.</p>")).toContain(
      "Your Pro subscription is confirmed.",
    );
  });

  it("drops content inside an mso conditional comment", () => {
    // Real markup from an Anthropic billing email: MJML/Outlook boilerplate
    // wrapped in <!--[if mso]>...<![endif]--> is a genuine HTML comment on
    // every non-Outlook renderer (including Gmail) — never visible to the
    // user. The old regex-based tag stripper didn't recognize comment
    // syntax, so the "96" inside <o:PixelsPerInch>96</o:PixelsPerInch>
    // leaked through as if it were real body text, and the LLM later
    // mistook it for a price.
    const html =
      "<p>Thanks for starting your Pro subscription.</p>" +
      "<!--[if mso]>\n" +
      "    <noscript>\n" +
      "    <xml>\n" +
      "    <o:OfficeDocumentSettings>\n" +
      "      <o:AllowPNG/>\n" +
      "      <o:PixelsPerInch>96</o:PixelsPerInch>\n" +
      "    </o:OfficeDocumentSettings>\n" +
      "    </xml>\n" +
      "    </noscript>\n" +
      "    <![endif]-->" +
      "<p>The next charge will be on Aug 17, 2026.</p>";

    const result = stripHtml(html);
    expect(result).not.toContain("96");
    expect(result).toContain("Thanks for starting your Pro subscription.");
    expect(result).toContain("The next charge will be on Aug 17, 2026.");
  });

  it("drops the split mso conditional pattern used by MJML", () => {
    // MJML's "everything except mso" wrapper: <!--[if !mso]><!--> ... <!--<![endif]-->
    // On a standard renderer this parses as one real (mostly empty) comment
    // followed by ordinary markup — never as visible text either way.
    const html =
      '<!--[if !mso]><!--><link href="https://fonts.example.com/css">' +
      "<!--<![endif]-->" +
      "<p>Visible text</p>";

    const result = stripHtml(html);
    expect(result).toContain("Visible text");
    expect(result).not.toContain("fonts.example.com");
  });

  it("still strips ordinary style and script blocks", () => {
    const html =
      "<style>.a{color:red}</style><script>track()</script><p>Body text</p>";
    const result = stripHtml(html);
    expect(result).not.toContain("color:red");
    expect(result).not.toContain("track()");
    expect(result).toContain("Body text");
  });
});
