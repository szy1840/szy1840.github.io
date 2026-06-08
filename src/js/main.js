// --- Theme toggle ---
(function () {
  const root = document.documentElement;
  const btn = document.querySelector(".theme-toggle");
  if (btn) {
    btn.addEventListener("click", () => {
      const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try {
        localStorage.setItem("theme", next);
      } catch (e) {}
    });
  }
})();

// --- Current year in footer ---
(function () {
  document.querySelectorAll("[data-year]").forEach((el) => {
    el.textContent = new Date().getFullYear();
  });
})();

// --- Mobile nav toggle ---
(function () {
  const toggle = document.querySelector(".nav-toggle");
  const list = document.querySelector(".nav-list");
  if (!toggle || !list) return;
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!open));
    list.classList.toggle("is-open", !open);
  });
})();

// --- Scale live-demo iframes to fit their viewport (desktop render, scaled down) ---
(function () {
  const frames = Array.from(document.querySelectorAll("[data-scale-frame]"));
  if (!frames.length) return;
  function scale() {
    frames.forEach((f) => {
      const vp = f.parentElement;
      const base = parseInt(f.dataset.baseWidth, 10) || 1280;
      f.style.transform = "scale(" + vp.clientWidth / base + ")";
    });
  }
  scale();
  window.addEventListener("resize", scale);
})();

// --- Technical notes: table of contents + bilingual language toggle ---
(function () {
  const article = document.querySelector("[data-article]");
  const tocNav = document.querySelector("[data-toc]");
  if (!article) return;

  let observer = null;

  // Returns the element whose headings drive the TOC: the visible language
  // version when the note is bilingual, otherwise the article itself.
  function activeScope() {
    const visible = article.querySelector(".note-version:not([hidden])");
    return visible || article;
  }

  function buildTOC() {
    if (!tocNav) return;
    if (observer) observer.disconnect();
    tocNav.innerHTML = "";

    const headings = Array.from(activeScope().querySelectorAll("h2, h3"));
    const aside = tocNav.closest(".toc");
    if (headings.length < 2) {
      if (aside) aside.style.display = "none";
      return;
    }
    if (aside) aside.style.display = "";

    const frag = document.createDocumentFragment();
    headings.forEach((h) => {
      if (!h.id) return;
      const a = document.createElement("a");
      a.href = "#" + h.id;
      a.textContent = h.textContent.replace(/¶|#/g, "").trim();
      a.className = "toc__link toc__link--" + h.tagName.toLowerCase();
      a.dataset.target = h.id;
      frag.appendChild(a);
    });
    tocNav.appendChild(frag);

    const links = Array.from(tocNav.querySelectorAll(".toc__link"));
    const byId = new Map(links.map((l) => [l.dataset.target, l]));
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            links.forEach((l) => l.classList.remove("is-active"));
            const active = byId.get(entry.target.id);
            if (active) active.classList.add("is-active");
          }
        });
      },
      { rootMargin: "0px 0px -75% 0px", threshold: 0 }
    );
    headings.forEach((h) => h.id && observer.observe(h));
  }

  // --- Bilingual toggle ---
  const note = document.querySelector("[data-bilingual]");
  const switcher = document.querySelector("[data-lang-switch]");
  if (note && switcher) {
    const versions = Array.from(article.querySelectorAll(".note-version"));
    const titleEl = document.querySelector("[data-title]");
    const buttons = Array.from(switcher.querySelectorAll("button[data-lang]"));

    function setLang(lang) {
      versions.forEach((v) => {
        v.hidden = v.dataset.version !== lang;
      });
      buttons.forEach((b) => {
        const on = b.dataset.lang === lang;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-pressed", String(on));
      });
      if (titleEl && titleEl.dataset["title" + (lang === "zh" ? "Zh" : "En")]) {
        titleEl.textContent = titleEl.dataset["title" + (lang === "zh" ? "Zh" : "En")];
      }
      document.documentElement.lang = lang;
      try {
        localStorage.setItem("note-lang", lang);
      } catch (e) {}
      buildTOC();
    }

    let initial = note.dataset.defaultLang || "en";
    try {
      const saved = localStorage.getItem("note-lang");
      if (saved === "en" || saved === "zh") initial = saved;
    } catch (e) {}

    buttons.forEach((b) =>
      b.addEventListener("click", () => setLang(b.dataset.lang))
    );
    setLang(initial); // also builds the TOC
  } else {
    buildTOC();
  }
})();
