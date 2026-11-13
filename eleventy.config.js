import syntaxHighlight from "@11ty/eleventy-plugin-syntaxhighlight";
import markdownItAnchor from "markdown-it-anchor";
import markdownItFootnote from "markdown-it-footnote";
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

  // --- Markdown: anchored headings for TOC, footnotes ---
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
    md.use(markdownItFootnote);
    // Footnote markers read as a bare number ("1"), not "[1]"
    md.renderer.rules.footnote_caption = (tokens, idx) => {
      const { id, subId } = tokens[idx].meta;
      return subId > 0 ? `${id + 1}:${subId}` : `${id + 1}`;
    };

    // Chinese text: pair straight double quotes up as “ ”. The typographer only
    // curls quotes that sit next to spaces or punctuation, which they rarely do
    // between CJK characters, so they would otherwise stay straight.
    md.core.ruler.before("smartquotes", "zh_quotes", (state) => {
      if (!state.env || state.env.lang !== "zh") return;
      for (const block of state.tokens) {
        if (block.type !== "inline" || !block.children) continue;
        const texts = block.children.filter(
          (t) => t.type === "text" && t.content.includes('"')
        );
        const count = texts.reduce((n, t) => n + t.content.split('"').length - 1, 0);
        if (!count || count % 2) continue;
        let open = true;
        for (const t of texts) {
          t.content = t.content.replace(/"/g, () => {
            const q = open ? "“" : "”";
            open = !open;
            return q;
          });
        }
      }
    });

    // A paragraph written entirely in *emphasis* is an aside (a note to self
    // after the main text); mark it so it can be set apart instead of slanted.
    md.core.ruler.push("aside_paragraphs", (state) => {
      const t = state.tokens;
      for (let i = 0; i + 1 < t.length; i++) {
        if (t[i].type !== "paragraph_open" || t[i + 1].type !== "inline") continue;
        const kids = t[i + 1].children || [];
        if (kids.length < 3) continue;
        const last = kids.length - 1;
        const wrapped =
          kids[0].type === "em_open" &&
          kids[last].type === "em_close" &&
          kids.every((c, k) => k === 0 || k === last || c.level > 0);
        if (wrapped) t[i].attrJoin("class", "aside");
      }
    });
    // Bilingual pages render both versions together; prefix footnote ids by language so they don't collide
    md.renderer.rules.footnote_anchor_name = (tokens, idx, options, env) => {
      const n = Number(tokens[idx].meta.id + 1).toString();
      return env && env.lang ? `-${env.lang}-${n}` : n;
    };
  });

  // --- Date filters ---
  eleventyConfig.addFilter("readableDate", (dateObj, locale = "en") => {
    const dt = DateTime.fromJSDate(dateObj, { zone: "utc" });
    return dt.toFormat("yyyy-MM-dd");
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

  // --- Bilingual essays: same pattern as notes ---
  eleventyConfig.addFilter("findEssayTranslation", (ref, translations) => {
    if (!ref) return null;
    return (translations || []).find((t) => t.data.ref === ref) || null;
  });

  // --- Bilingual journal entries ---
  eleventyConfig.addFilter("findJournalTranslation", (ref, translations) => {
    if (!ref) return null;
    return (translations || []).find((t) => t.data.ref === ref) || null;
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
  eleventyConfig.addCollection("essayTranslation", (api) =>
    api.getFilteredByGlob("./src/essay-translations/*.md")
  );
  eleventyConfig.addCollection("journalTranslation", (api) =>
    api.getFilteredByGlob("./src/journal-translations/*.md")
  );
  eleventyConfig.addCollection("writingTranslation", (api) => [
    ...api.getFilteredByGlob("./src/essay-translations/*.md"),
    ...api.getFilteredByGlob("./src/journal-translations/*.md"),
  ]);
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
