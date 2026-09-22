import { useState } from 'react';
import { SelectRecipient } from './send/SelectRecipient.jsx';
import { SelectCorridor } from './send/SelectCorridor.jsx';
import { BeneficiaryDetails } from './send/BeneficiaryDetails.jsx';
import { EnterAmount } from './send/EnterAmount.jsx';
import { ReviewAndSend } from './send/ReviewAndSend.jsx';
import { TrackStatus } from './send/TrackStatus.jsx';
import { startTracking } from '../inflightStore.js';

// Recipient-first, the way real remittance apps work: pick who you're paying
// (which fixes the corridor), then how much, then confirm. Adding someone new
// is the only path that asks for a country and bank details. The sender's own
// KYC is never asked here — it was captured once at onboarding.
//
// Quote → payment stay adjacent (the quote is single-use and expires), which
// this ordering guarantees.
export function SendFlow({
  corridors,
  recipients,
  sender,
  initialRecipient,
  resumeTrackerId,
  onRecipientSaved,
  setError,
  onExit,
  onPaymentComplete,
}) {
  const corridorByCode = Object.fromEntries(corridors.map((c) => [c.code, c]));

  const [step, setStep] = useState(resumeTrackerId ? 'status' : initialRecipient ? 'amount' : 'recipient');
  const [recipient, setRecipient] = useState(initialRecipient ?? null);
  const [corridor, setCorridor] = useState(initialRecipient ? corridorByCode[initialRecipient.corridorCode] : null);
  const [quote, setQuote] = useState(null);
  const [purpose, setPurpose] = useState(null);
  const [payment, setPayment] = useState(resumeTrackerId ? { id: resumeTrackerId } : null);
  // One id per attempt, so every call this flow makes (quote, validate,
  // payment, status polls) is grouped together in the Developer Console.
  const [flowId] = useState(() => crypto.randomUUID());

  if (step === 'recipient') {
    return (
      <SelectRecipient
        recipients={recipients}
        corridors={corridors}
        onSelect={(r) => {
          setRecipient(r);
          setCorridor(corridorByCode[r.corridorCode]);
          setStep('amount');
        }}
        onAddNew={() => {
          // With a single corridor there's nothing to choose — go straight to the form.
          if (corridors.length === 1) {
            setCorridor(corridors[0]);
            setStep('new-recipient');
          } else {
            setStep('corridor');
          }
        }}
        onBack={onExit}
      />
    );
  }

  if (step === 'corridor') {
    return (
      <SelectCorridor
        corridors={corridors}
        onSelect={(c) => {
          setCorridor(c);
          setStep('new-recipient');
        }}
        onBack={() => setStep('recipient')}
      />
    );
  }

  if (step === 'new-recipient') {
    return (
      <BeneficiaryDetails
        corridor={corridor}
        flowId={flowId}
        setError={setError}
        onBack={() => setStep(corridors.length === 1 ? 'recipient' : 'corridor')}
        onContinue={async (r) => {
          const saved = await onRecipientSaved(r);
          setRecipient(saved);
          setStep('amount');
        }}
      />
    );
  }

  if (step === 'amount') {
    return (
      <EnterAmount
        corridor={corridor}
        recipient={recipient}
        balance={sender.balance}
        flowId={flowId}
        setError={setError}
        onBack={() => (initialRecipient ? onExit() : setStep('recipient'))}
        onQuoted={({ quote: q, purpose: p }) => {
          setQuote(q);
          setPurpose(p);
          setStep('review');
        }}
      />
    );
  }

  if (step === 'review') {
    return (
      <ReviewAndSend
        corridor={corridor}
        recipient={recipient}
        quote={quote}
        purpose={purpose}
        sender={sender}
        flowId={flowId}
        setError={setError}
        onBack={() => setStep('amount')}
        onSent={(p) => {
          // A full, durable snapshot of everything TrackStatus needs to
          // render — stored so tracking survives leaving this screen (or
          // reloading) and a resumed TrackStatus needs nothing but the id.
          startTracking({
            id: p.id,
            flowId,
            corridor,
            recipient,
            quote,
            purpose,
            status: p.status,
            amount: p.amount,
            amountCurrency: p.amount_currency,
            bankReference: p.bank_reference,
            transactionCompleted: p.transaction_completed,
            createdAt: p.created,
          });
          setPayment(p);
          setStep('status');
        }}
      />
    );
  }

  // step === 'status'
  return <TrackStatus trackerId={payment.id} onLeave={onExit} onDone={onPaymentComplete} />;
}
