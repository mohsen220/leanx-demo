import { useState } from 'react';
import { EnterTopupAmount } from './topup/EnterTopupAmount.jsx';
import { TopupStatus } from './topup/TopupStatus.jsx';

// Two steps: amount (which also handles first-time bank authorization via
// the LinkSDK, inline — see EnterTopupAmount.jsx) → poll to settlement.
// Unlike a redirect-based rail, AoF never leaves this page, so there's no
// resume-after-redirect step to coordinate with App.jsx.
export function TopUp({ userId, setError, onExit, onComplete }) {
  const [step, setStep] = useState('amount');
  const [amount, setAmount] = useState(0);
  const [paymentId, setPaymentId] = useState(null);

  if (step === 'amount') {
    return (
      <EnterTopupAmount
        userId={userId}
        setError={setError}
        onBack={onExit}
        onPaymentStarted={({ paymentId: id, amount: a }) => {
          setPaymentId(id);
          setAmount(a);
          setStep('status');
        }}
      />
    );
  }

  return <TopupStatus paymentId={paymentId} amount={amount} userId={userId} setError={setError} onDone={onComplete} />;
}
