// Shared currency reference for anything that shows AED alongside another
// currency — the balance carousel (Home.jsx) and the Send flow's amount
// step (EnterAmount.jsx) both read from here, so they never disagree on a
// name or a flag.
export const CURRENCY_NAME = {
  AED: 'UAE Dirham',
  USD: 'US Dollar',
  INR: 'Indian Rupee',
  PKR: 'Pakistani Rupee',
  NGN: 'Nigerian Naira',
};

// ISO 3166-1 alpha-2 codes, not the currency codes above.
const FLAG_COUNTRY = { AED: 'ae', USD: 'us', INR: 'in', PKR: 'pk', NGN: 'ng' };

// flagcdn.com serves crisp real flag images at any size (an emoji flag
// blown up to fill a card banner just looks pixelated) — for a wide,
// rectangular presentation like a full-bleed card banner, where a real
// flag's own proportions read correctly.
export const flagBannerFor = (currencyCode) => `https://flagcdn.com/w640/${FLAG_COUNTRY[currencyCode]}.png`;

// For a small circular badge, a naive object-fit:cover crop of a
// rectangular flag can crop away exactly what makes it recognizable — the
// UAE's flag is 2:1 with its red stripe confined to the left ~25% of the
// width, and a center-crop into a 1:1 circle drops that stripe entirely
// (confirmed live: it silently vanished). circle-flags redraws each flag
// specifically for circular display instead of cropping a rectangle, so
// this is a different asset, not just a differently-sized one.
export const flagIconFor = (currencyCode) =>
  `https://cdn.jsdelivr.net/gh/HatScripts/circle-flags@gh-pages/flags/${FLAG_COUNTRY[currencyCode]}.svg`;
