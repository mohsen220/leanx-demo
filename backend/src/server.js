import express from 'express';
import cors from 'cors';
import 'dotenv/config';

import { corridorsRouter } from './routes/corridors.js';
import { debugRouter } from './routes/debug.js';
import { accountsRouter } from './routes/accounts.js';
import { quotesRouter } from './routes/quotes.js';
import { paymentsRouter } from './routes/payments.js';
import { usersRouter } from './routes/users.js';
import { recipientsRouter } from './routes/recipients.js';
import { transactionsRouter } from './routes/transactions.js';
import { leanAofRouter } from './routes/leanAof.js';
import { leanSipRouter } from './routes/leanSip.js';
import { leanReRouter } from './routes/leanRe.js';
import { leanConsentsRouter } from './routes/leanConsents.js';
import { leanVerifyRouter } from './routes/leanVerify.js';
import { swiftxConfig } from './swiftxConfig.js';
import { withRequestContext, getUpstreamCalls } from './requestContext.js';

const app = express();

app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5174' }));

app.use((req, res, next) => {
  const start = Date.now();
  console.log(`[backend →] ${req.method} ${req.originalUrl}`);
  res.on('finish', () => {
    console.log(`[backend ←] ${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});

app.use(withRequestContext);

// Transparently rides the real Lean/SwiftX API calls a request made along
// with the response, under `_upstream` — every lean*Api.js/api.js client
// unpacks and re-logs these into the Developer Console, so it can show the
// actual upstream calls behind our own route instead of just the route
// itself. No route handler needs to know this exists.
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    const upstream = getUpstreamCalls();
    if (upstream.length && body && typeof body === 'object' && !Array.isArray(body)) {
      return originalJson({ ...body, _upstream: upstream });
    }
    return originalJson(body);
  };
  next();
});

app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true, mockMode: swiftxConfig.mockMode }));
app.use('/api', corridorsRouter);
app.use('/api', debugRouter);
app.use('/api', accountsRouter);
app.use('/api', quotesRouter);
app.use('/api', paymentsRouter);
app.use('/api', usersRouter);
app.use('/api', recipientsRouter);
app.use('/api', transactionsRouter);
app.use('/api', leanAofRouter);
app.use('/api', leanSipRouter);
app.use('/api', leanReRouter);
app.use('/api', leanConsentsRouter);
app.use('/api', leanVerifyRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status ?? 500).json({ error: err.message, detail: err.payload });
});

const port = process.env.PORT ?? 4100;
app.listen(port, () => {
  console.log(`SwiftX demo backend listening on http://localhost:${port}`);
  console.log(
    swiftxConfig.mockMode
      ? '⚠️  Running in MOCK mode — no SWIFTX_JWK set. Drop one into backend/.env to hit the real sandbox.'
      : `✅ Running against the real SwiftX sandbox at ${swiftxConfig.baseUrl}`,
  );
});
