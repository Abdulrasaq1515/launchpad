/**
 * Wire @axe-core/react into development builds.
 *
 * axe patches `React.createElement` to audit each render. An ESM namespace
 * object is frozen, so handing it the result of `await import("react")`
 * directly threw
 *
 *   TypeError: Cannot set property createElement of [object Module]
 *              which has only a getter
 *
 * on every page load — meaning the accessibility auditing this project sets up
 * has never actually run. The CommonJS export under `.default` is the mutable
 * object axe needs.
 */
export async function initAxe(): Promise<void> {
  if (typeof window === "undefined" || process.env.NODE_ENV !== "development") {
    return;
  }

  try {
    const reactModule = await import("react");
    const reactDomModule = await import("react-dom");
    const axe = await import("@axe-core/react");

    const React = (reactModule as { default?: unknown }).default ?? reactModule;
    const ReactDOM =
      (reactDomModule as { default?: unknown }).default ?? reactDomModule;

    await axe.default(
      React as Parameters<typeof axe.default>[0],
      ReactDOM as Parameters<typeof axe.default>[1],
      1000,
    );
  } catch (err) {
    // Never let a dev-only auditor break the app it is auditing.
    console.warn("Accessibility auditing is unavailable:", err);
  }
}
