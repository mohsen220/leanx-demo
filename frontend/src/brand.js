// The exchange house whose app this is. SwiftX / Lean X is the rail underneath,
// never the brand the customer sees — so everything customer-facing reads from
// here, and re-skinning the demo for a different prospect is a one-object change.
//
// "Falcon Exchange" is fictional (the falcon is the UAE's national symbol).
export const brand = {
  name: 'Falcon Exchange',
  shortName: 'Falcon',
  initials: 'FX',
  tagline: 'Send money home in seconds',
  // Where the exchange house operates — drives the default source currency
  // and the sender's residency in the KYC profile.
  homeCountry: 'ARE',
  homeCurrency: 'AED',
  // Two different rails, two different marks: cross-border remittances run
  // on Lean X, top-ups run on Lean's core Pay by Bank / Open Finance rail.
  poweredBy: 'Lean X',
  poweredByPay: 'Lean',
  supportPhone: '600 555 000',
};

// Indicative FX for the "as you type" conversion. The backend's corridor
// rates are quoted per 1 USD, so re-base them to the customer's currency here;
// the *firm* rate always comes from the real quote API right before sending.
const USD_PER_UNIT = { USD: 1, AED: 1 / 3.6725, BHD: 1 / 0.376 };

export function indicativeRate(corridor, currency) {
  const usdPerUnit = USD_PER_UNIT[currency] ?? 1;
  return corridor.rate * usdPerUnit;
}
