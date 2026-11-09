/* Landing interactions: locale switching + copy installer. */
(() => {
  "use strict";
  const translations = globalThis.GLG_I18N;
  const languages = ["pt-BR", "en", "es"];
  const command = document.getElementById("install-command");
  const copy = document.getElementById("copy-command");
  const status = document.getElementById("copy-status");
  let locale = "pt-BR";
  let copied = false;
  let resetTimer;

  function normalized(value) {
    const raw = String(value || "").toLowerCase().replace("_", "-");
    if (raw === "pt" || raw.startsWith("pt-")) return "pt-BR";
    if (raw === "en" || raw.startsWith("en-")) return "en";
    if (raw === "es" || raw.startsWith("es-")) return "es";
    return null;
  }

  function savedLanguage() {
    try {
      return normalized(localStorage.getItem("gearLeverGrab.language"));
    } catch {
      return null;
    }
  }

  function saveLanguage(value) {
    try {
      localStorage.setItem("gearLeverGrab.language", value);
    } catch {
      /* Private browsing / blocked storage: URL still works. */
    }
  }

  function writeMeta(selector, value) {
    const node = document.querySelector(selector);
    if (node) node.setAttribute("content", value);
  }

  function updateLanguage(language, options = {}) {
    if (!languages.includes(language)) return;
    locale = language;
    const data = translations[locale];
    document.documentElement.setAttribute("lang", locale);
    document.title = data["meta.title"];
    writeMeta('meta[name="description"]', data["meta.description"]);
    writeMeta('meta[property="og:title"]', data["meta.title"]);
    writeMeta('meta[property="og:description"]', data["meta.ogDescription"]);

    document.querySelectorAll("[data-i18n]").forEach(node => {
      const key = node.getAttribute("data-i18n");
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        node.textContent = key === "install.copy" && copied ? data["install.copied"] : data[key];
      }
    });
    document.querySelectorAll("[data-i18n-aria]").forEach(node => {
      const key = node.getAttribute("data-i18n-aria");
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        node.setAttribute("aria-label", data[key]);
      }
    });

    document.querySelectorAll("[data-lang]").forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset.lang === locale));
    });

    if (options.persist) saveLanguage(locale);
    if (options.updateUrl) {
      const url = new URL(window.location.href);
      if (locale === "pt-BR") url.searchParams.delete("lang");
      else url.searchParams.set("lang", locale);
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  }

  const params = new URLSearchParams(window.location.search);
  const requested = normalized(params.get("lang"));
  const browserLanguage = (navigator.languages || [navigator.language]).map(normalized).find(Boolean);
  updateLanguage(requested || savedLanguage() || browserLanguage || "pt-BR");

  for (const button of document.querySelectorAll("[data-lang]")) {
    button.addEventListener("click", () => {
      updateLanguage(button.dataset.lang, { persist: true, updateUrl: true });
    });
  }

  copy.addEventListener("click", async () => {
    const value = command.textContent.trim();
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(value);
      copied = true;
      status.textContent = translations[locale]["install.copied"];
      updateLanguage(locale);
      window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => {
        copied = false;
        updateLanguage(locale);
      }, 2400);
    } catch {
      // In insecure contexts, let the user press Ctrl+C on the selected command.
      const range = document.createRange();
      range.selectNodeContents(command);
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
      status.textContent = translations[locale]["install.failed"];
    }
  });
})();
