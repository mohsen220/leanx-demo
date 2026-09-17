import { Router } from 'express';
import { getCustomerToken } from '../leanAuth.js';
import { leanConfig } from '../leanConfig.js';
import { db } from '../db.js';
import { ensureLeanCustomer } from '../leanCustomerSetup.js';

export const leanConsentsRouter = Router();

// CMI (Consent Management Interface) session. This is a regulatory
// requirement, not a nice-to-have — per the OF taskforce, every AoF/SIP
// integration needs a surface for the customer to view and revoke their own
// consents (Lean.manageConsents(), backed by the Consents API: GET
// /consents/v1, GET /consents/v1/{id}, GET /consents/v1/{id}/payments,
// POST /consents/v1/{id}/revocation). It just needs a Lean customer and a
// customer-scoped token — no consent or destination setup up front, since
// manageConsents() renders the whole list/revoke/history UI itself.
leanConsentsRouter.post('/lean/consents/session', async (req, res, next) => {
  try {
    const { userId } = req.body;
    const user = db.users.get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const customerId = await ensureLeanCustomer(user);
    const { accessToken } = await getCustomerToken(customerId);

    res.json({ appToken: leanConfig.appToken, customerId, accessToken });
  } catch (err) {
    next(err);
  }
});
