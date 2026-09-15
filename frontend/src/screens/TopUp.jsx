import { useState } from 'react';
import { EnterTopupAmount } from './topup/EnterTopupAmount.jsx';
import { AuthorizeTopup } from './topup/AuthorizeTopup.jsx';
import { TopupStatus } from './topup/TopupStatus.jsx';

// Three steps: amount → authorize (a real redirect to Lean's hosted page,
// not a modal) → poll to settlement. `resumeIntentId` lets App.jsx drop
// straight into the status step when the customer lands back from that
// redirect — the amount/authorize steps never re-run on return.
export function TopUp({ userId, resumeIntentId, setError, onExit, onComplete }) {
  const [step, setStep] = useState(resumeIntentId ? 'status' : 'amount');
  const [amount, setAmount] = useState(0);
  const [session, setSession] = useState(null);
  const [intentId, setIntentId] = useState(resumeIntentId ?? null);

  if (step === 'amount') {
    return (
      <EnterTopupAmount
        userId={userId}
        setError={setError}
        onBack={onExit}
        onIntentCreated={({ intentId: id, session: s, amount: a }) => {
          setIntentId(id);
          setSession(s);
          setAmount(a);
          setStep('authorize');
        }}
      />
    );
  }

  if (step === 'authorize') {
    return (
      <AuthorizeTopup amount={amount} intentId={intentId} session={session} onBack={() => setStep('amount')} />
    );
  }

  return <TopupStatus intentId={intentId} userId={userId} setError={setError} onDone={onComplete} />;
}
