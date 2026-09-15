import { Router } from 'express';
import { leanApiFetch } from '../leanApi.js';
import { db } from '../db.js';

export const leanVerifyRouter = Router();

// Lean's real Account Verification Service (AVS — OKYC / Verify Suite):
// confirms an IBAN genuinely belongs to the name on file, straight from
// bank/regulatory sources. This is a third, distinct Lean product from
// Lean Pay (money movement) and Lean X (cross-border) — a stateless
// bank/identity check with no customer_id or prior connection involved.
leanVerifyRouter.post('/lean/verify-account', async (req, res, next) => {
  try {
    const { userId, iban, fullName } = req.body;
    const user = db.users.get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!iban) return res.status(400).json({ error: 'iban is required' });

    const result = await leanApiFetch('/verifications/v1/accounts', {
      method: 'POST',
      body: JSON.stringify({
        country_code: 'AE',
        type: 'PERSONAL',
        account_details: { type: 'IBAN', value: iban },
        identifications: [{ type: 'FULL_NAME', value: fullName || user.sender_name }],
      }),
    });

    // Only the first real match flips the badge — re-verifying afterwards
    // (e.g. testing a different IBAN) doesn't downgrade an already-verified
    // customer just because a later check comes back unmatched.
    const verified = result.verifications?.account_ownership_verified === true;
    if (verified && !user.bankVerifiedAt) {
      db.users.update(user.id, {
        bankVerifiedAt: new Date().toISOString(),
        verifiedIban: iban,
        verifiedBankName: result.verifications?.bank_details?.bank_name?.en ?? null,
      });
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});
