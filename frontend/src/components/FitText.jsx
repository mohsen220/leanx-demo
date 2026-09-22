import { useLayoutEffect, useRef } from 'react';

// Shrinks text to fit a fixed-width container instead of clipping it —
// same trick iOS Wallet uses for balance text. Needed anywhere a currency
// amount is shown: values range from "0" to something like
// "1,354,294.76" (NGN, or worse once someone types a big number into
// Convert), and a fixed font-size that looks great for a short number
// silently overflows a long one. Measures once and scales the font-size
// proportionally to exactly what's needed — clientWidth stays constant as
// font-size drops since the element is block-level and sized by its
// parent, not its content, so a single ratio (rather than a decrement
// loop) gets there directly.
export function FitText({ text, className, max = 34, min = 12 }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.fontSize = `${max}px`;
    const available = el.clientWidth;
    const needed = el.scrollWidth;
    if (available > 0 && needed > available) {
      const fitted = Math.max(min, Math.floor((max * available) / needed));
      el.style.fontSize = `${fitted}px`;
    }
  }, [text, max, min]);

  return (
    <div className={className} ref={ref}>
      {text}
    </div>
  );
}
