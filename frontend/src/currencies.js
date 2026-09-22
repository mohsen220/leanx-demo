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

// flagcdn.com serves crisp real flag images at any size (an emoji flag
// blown up to fill a card banner just looks pixelated) — ISO 3166-1
// alpha-2 codes, not the currency codes above.
const FLAG_COUNTRY = { AED: 'ae', USD: 'us', INR: 'in', PKR: 'pk', NGN: 'ng' };
export const flagImgFor = (currencyCode) => `https://flagcdn.com/w640/${FLAG_COUNTRY[currencyCode]}.png`;
