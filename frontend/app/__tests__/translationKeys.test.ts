import fs from "fs";
import path from "path";

/**
 * Every `t("…")` call must resolve against every locale.
 *
 * next-intl renders the raw key path when a message is missing, so a typo ships
 * as literal `dashboard.sections.deployToken` text on a button. That is exactly
 * what happened, and it survived review because nothing failed — the page still
 * rendered, just with the key in place of the words.
 */
const LOCALES = ["en", "es", "fr", "zh"] as const;
const ROOT = path.join(__dirname, "..", "..");

function loadMessages(locale: string) {
  return JSON.parse(
    fs.readFileSync(path.join(ROOT, "messages", `${locale}.json`), "utf-8"),
  );
}

function resolve(messages: unknown, dottedPath: string): unknown {
  let cur: unknown = messages;
  for (const part of dottedPath.split(".")) {
    if (typeof cur !== "object" || cur === null || !(part in cur)) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".next", "__tests__", "e2e"].includes(entry.name)) continue;
      walk(full, out);
    } else if (entry.name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

/** Every (namespace, key) pair a component actually asks for. */
function collectUsages(): { file: string; key: string; namespaces: string[] }[] {
  const usages: { file: string; key: string; namespaces: string[] }[] = [];
  for (const dir of ["app", "components"]) {
    for (const file of walk(path.join(ROOT, dir))) {
      const src = fs.readFileSync(file, "utf-8");
      // A file often declares `const t = useTranslations(...)` inside several
      // components, against different namespaces, so a variable cannot be
      // mapped to one namespace by name. Collect every namespace the file
      // binds and require each key to resolve under at least one of them —
      // which is exactly the condition under which next-intl renders words
      // rather than the raw key path.
      const namespaces = [
        ...src.matchAll(
          /(?:useTranslations|getTranslations)\("([^"]+)"\)/g,
        ),
      ].map(([, ns]) => ns);
      if (namespaces.length === 0) continue;

      const translatorVars = new Set(
        [
          ...src.matchAll(
            /const\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(/g,
          ),
        ].map(([, v]) => v),
      );

      for (const variable of translatorVars) {
        const calls = [...src.matchAll(new RegExp(`\\b${variable}\\("([^"]+)"`, "g"))];
        for (const [, key] of calls) {
          usages.push({
            file: path.relative(ROOT, file),
            key,
            namespaces,
          });
        }
      }
    }
  }
  return usages;
}

describe("translation keys", () => {
  const usages = collectUsages();

  it("finds translator usages to check", () => {
    expect(usages.length).toBeGreaterThan(50);
  });

  it.each(LOCALES)("every key used by a component resolves in %s", (locale) => {
    const messages = loadMessages(locale);
    const missing = usages
      .filter(
        ({ key, namespaces }) =>
          !namespaces.some((ns) => resolve(messages, `${ns}.${key}`) !== undefined),
      )
      .map(({ file, key, namespaces }) => `${file}: ${key} (tried ${namespaces.join(", ")})`);
    expect([...new Set(missing)]).toEqual([]);
  });
});
