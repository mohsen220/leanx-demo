import { useState } from 'react';
import { EnterTopupAmount } from './topup/EnterTopupAmount.jsx';
import { TopupStatus } from './topup/TopupStatus.jsx';

// Two steps: amount (which also handles first-time bank authorization via
// the LinkSDK, inline — see EnterTopupAmount.jsx) → poll to settlement.
// `resumePaymentId`/`resumeAmount`/`resumeMethod`/`resumeGroupId` let
// App.jsx drop straight into the status step after a real bank redirect
// reloads the whole app — see the localStorage handoff in
// EnterTopupAmount.jsx and the pickup in App.jsx. `method` ('aof' | 'sip')
// decides which rail TopupStatus polls; `groupId` keeps every call this
// top-up makes (before AND after the redirect) tracing as one journey in
// the Developer Console.
export function TopUp({ userId, resumePaymentId, resumeAmount, resumeMethod, resumeGroupId, setError, onExit, onComplete }) {
  const [step, setStep] = useState(resumePaymentId ? 'status' : 'amount');
  const [amount, setAmount] = useState(resumeAmount ?? 0);
  const [paymentId, setPaymentId] = useState(resumePaymentId ?? null);
  const [method, setMethod] = useState(resumeMethod ?? 'aof');
  const [groupId, setGroupId] = useState(resumeGroupId ?? null);

  if (step === 'amount') {
    return (
      <EnterTopupAmount
        userId={userId}
        setError={setError}
        onBack={onExit}
        onPaymentStarted={({ paymentId: id, amount: a, method: m, groupId: g }) => {
          setPaymentId(id);
          setAmount(a);
          setMethod(m);
          setGroupId(g);
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
      groupId={groupId}
      userId={userId}
      setError={setError}
      onDone={onComplete}
    />
  );
}
