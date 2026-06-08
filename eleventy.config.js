import syntaxHighlight from "@11ty/eleventy-plugin-syntaxhighlight";
import markdownItAnchor from "markdown-it-anchor";
import { DateTime } from "luxon";

export default function (eleventyConfig) {
  // --- Passthrough static assets ---
  eleventyConfig.addPassthroughCopy({ "src/static": "/" });
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/js");

  // --- Watch CSS/JS during dev ---
  eleventyConfig.addWatchTarget("src/css");
  eleventyConfig.addWatchTarget("src/js");

  // --- Plugins ---
  eleventyConfig.addPlugin(syntaxHighlight, {
    preAttributes: { tabindex: 0 },
  });

  // --- Markdown: anchored headings for TOC ---
  eleventyConfig.amendLibrary("md", (md) => {
    md.set({ html: true, linkify: true, typographer: true });
    md.use(markdownItAnchor, {
      permalink: markdownItAnchor.permalink.headerLink({ safariReaderFix: true }),
      level: [2, 3],
      slugify: (s) =>
        s
          .trim()
          .toLowerCase()
          .replace(/[\s]+/g, "-")
          .replace(/[^\p{L}\p{N}-]/gu, ""),
    });
  });

  // --- Date filters ---
  eleventyConfig.addFilter("readableDate", (dateObj, locale = "en") => {
    const dt = DateTime.fromJSDate(dateObj, { zone: "utc" });
    return locale === "zh"
      ? dt.setLocale("zh").toFormat("yyyy 年 M 月 d 日")
      : dt.setLocale("en").toFormat("LLL d, yyyy");
  });
  eleventyConfig.addFilter("isoDate", (dateObj) =>
    DateTime.fromJSDate(dateObj, { zone: "utc" }).toISODate()
  );
  eleventyConfig.addFilter("year", (dateObj) =>
    DateTime.fromJSDate(dateObj, { zone: "utc" }).toFormat("yyyy")
  );

  // --- Limit filter for previews ---
  eleventyConfig.addFilter("limit", (arr, n) => (arr || []).slice(0, n));

  // --- Reading time (rough, CJK-aware) ---
  eleventyConfig.addFilter("readingTime", (content) => {
    if (!content) return "1 min";
    const text = content.replace(/<[^>]*>/g, " ");
    const cjk = (text.match(/[一-鿿]/g) || []).length;
    const words = (text.match(/[A-Za-z0-9]+/g) || []).length;
    const minutes = Math.max(1, Math.round(cjk / 400 + words / 220));
    return `${minutes} min`;
  });

  // --- Bilingual notes: find a note's translation by shared `ref` ---
  eleventyConfig.addFilter("findTranslation", (ref, translations) => {
    if (!ref) return null;
    return (translations || []).find((t) => t.data.ref === ref) || null;
  });

  // Resolve the title to display (prefer the English version when one exists)
  eleventyConfig.addFilter("preferredNoteTitle", (note, translations) => {
    const ref = note.data.ref;
    if (ref) {
      const t = (translations || []).find(
        (x) => x.data.ref === ref && x.data.lang === "en"
      );
      if (t) return t.data.title;
    }
    return note.data.title;
  });

  // --- Collections built from folders (newest-first) ---
  eleventyConfig.addCollection("notes", (api) =>
    api.getFilteredByGlob("./src/notes/*.md").sort((a, b) => b.date - a.date)
  );
  eleventyConfig.addCollection("essays", (api) =>
    api.getFilteredByGlob("./src/essays/*.md").sort((a, b) => b.date - a.date)
  );
  // Personal notes / journal entries (any length: jottings, conversations, study notes)
  eleventyConfig.addCollection("journal", (api) =>
    api.getFilteredByGlob("./src/journal/*.md").sort((a, b) => b.date - a.date)
  );
  // Combined writing stream (essays + notes), newest first
  eleventyConfig.addCollection("writing", (api) =>
    [
      ...api.getFilteredByGlob("./src/essays/*.md"),
      ...api.getFilteredByGlob("./src/journal/*.md"),
    ].sort((a, b) => b.date - a.date)
  );
  eleventyConfig.addCollection("noteTranslation", (api) =>
    api.getFilteredByGlob("./src/note-translations/*.md")
  );
  eleventyConfig.addCollection("projects", (api) =>
    api
      .getFilteredByGlob("./src/projects/*.md")
      .sort((a, b) => (a.data.order || 99) - (b.data.order || 99))
  );

  // Resolve a technical note by its slug/ref (for "Related notes" links)
  eleventyConfig.addFilter(
    "noteByRef",
    (ref, notes) =>
      (notes || []).find((n) => n.fileSlug === ref || n.data.ref === ref) || null
  );

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    templateFormats: ["njk", "md", "html"],
  };
}
