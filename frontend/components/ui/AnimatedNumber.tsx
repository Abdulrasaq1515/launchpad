"use client";

import { useEffect, useRef, useState } from "react";

interface AnimatedNumberProps {
  /** Already formatted for display, e.g. "1,000,450.25". */
  value: string;
  className?: string;
}

/**
 * A number whose digits roll when the value changes.
 *
 * Only for figures that genuinely move — supply after a mint, a balance after
 * a transfer, releasable tokens as a cliff passes. The roll exists to answer
 * "did that go through, and by how much", so it runs on change and never on
 * first paint: animating a number into view on load would be decoration.
 *
 * Digits that did not change do not move, which makes the ones that did easy
 * to spot in a long figure. Under reduced motion the value simply swaps, and
 * screen readers always read the final value.
 */
export function AnimatedNumber({ value, className = "" }: AnimatedNumberProps) {
  const previous = useRef(value);
  const [chars, setChars] = useState<{ ch: string; changed: boolean }[]>(() =>
    value.split("").map((ch) => ({ ch, changed: false })),
  );

  useEffect(() => {
    const before = previous.current;
    if (before === value) return;

    // Compare from the right: the least significant digits are the ones that
    // move, and right-aligning the comparison keeps "999 -> 1,000" sensible.
    const next = value.split("");
    const prev = before.split("");
    const offset = next.length - prev.length;

    setChars(
      next.map((ch, i) => ({
        ch,
        changed: prev[i - offset] !== ch,
      })),
    );
    previous.current = value;

    const settle = window.setTimeout(
      () => setChars(value.split("").map((ch) => ({ ch, changed: false }))),
      420,
    );
    return () => window.clearTimeout(settle);
  }, [value]);

  return (
    <span className={`data inline-flex ${className}`}>
      <span className="sr-only">{value}</span>
      <span aria-hidden className="inline-flex">
        {chars.map(({ ch, changed }, i) => (
          <span
            key={`${i}-${ch}`}
            className="inline-block"
            style={
              changed
                ? { animation: "roll 380ms var(--ease-spring) both" }
                : undefined
            }
          >
            {ch === " " ? " " : ch}
          </span>
        ))}
      </span>
    </span>
  );
}
