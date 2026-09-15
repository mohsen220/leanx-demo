import { useState } from 'react';
import { EnterTopupAmount } from './topup/EnterTopupAmount.jsx';
import { TopupStatus } from './topup/TopupStatus.jsx';

// Two steps: amount (which also handles first-time bank authorization via
// the LinkSDK, inline — see EnterTopupAmount.jsx) → poll to settlement.
// `resumePaymentId`/`resumeAmount`/`resumeMethod` let App.jsx drop straight
// into the status step after a real bank redirect reloads the whole app —
// see the localStorage handoff in EnterTopupAmount.jsx and the pickup in
// App.jsx. `method` ('aof' | 'sip') decides which rail TopupStatus polls.
export function TopUp({ userId, resumePaymentId, resumeAmount, resumeMethod, setError, onExit, onComplete }) {
  const [step, setStep] = useState(resumePaymentId ? 'status' : 'amount');
  const [amount, setAmount] = useState(resumeAmount ?? 0);
  const [paymentId, setPaymentId] = useState(resumePaymentId ?? null);
  const [method, setMethod] = useState(resumeMethod ?? 'aof');

  if (step === 'amount') {
    return (
      <EnterTopupAmount
        userId={userId}
        setError={setError}
        onBack={onExit}
        onPaymentStarted={({ paymentId: id, amount: a, method: m }) => {
          setPaymentId(id);
          setAmount(a);
          setMethod(m);
          setStep('status');
        }}
      />
    );
  }

  return (
    <TopupStatus
      paymentId={paymentId}
      amount={amount}
      method={method}
      userId={userId}
      setError={setError}
      onDone={onComplete}
    />
  );
}
