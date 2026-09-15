import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { RELATIONS } from '../../stores.js';
import { BackIcon, CheckIcon, ClockIcon, XIcon } from '../../icons.jsx';

const BASE_FIELDS = [
  { key: 'beneficiary_name', label: 'Full name' },
  { key: 'beneficiary_account_number', label: 'Account number' },
  { key: 'beneficiary_city', label: 'City' },
  { key: 'beneficiary_address', label: 'Address' },
  { key: 'beneficiary_mobile', label: 'Mobile' },
];

// Adding a new recipient — saved after this so the next transfer to them is
// two taps. Pre-filled with the API's documented sandbox beneficiary for the
// corridor so the demo's happy path validates without hunting for test data.
export function BeneficiaryDetails({ corridor, flowId, setError, onBack, onContinue }) {
  const [form, setForm] = useState(() => ({
    bank_name: corridor.sample.bank_name ?? '',
    ...(corridor.identifierField ? { [corridor.identifierField]: corridor.sample[corridor.identifierField] } : {}),
    ...(corridor.hasAccountType ? { beneficiary_account_type: corridor.sample.beneficiary_account_type } : {}),
    ...Object.fromEntries(BASE_FIELDS.map((f) => [f.key, corridor.sample[f.key] ?? ''])),
  }));
  const [relation, setRelation] = useState('brother');
  // null = not checked yet, 'checking' = in flight, otherwise the API result
  const [validation, setValidation] = useState(null);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const runValidate = async () => {
    if (!corridor.hasValidateAccount) return;
    setValidation('checking');
    try {
      const result = await api.validateAccount(
        {
          country: corridor.code,
          account_number: form.beneficiary_account_number,
          bank_branch_code: form[corridor.identifierField],
        },
        flowId,
      );
      setValidation(result);
    } catch (err) {
      setError(err.message);
      setValidation(null);
    }
  };

  // Auto-run once on mount so the pre-filled happy path always shows a result.
  useEffect(() => {
    runValidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canContinue = !corridor.hasValidateAccount || (validation && validation !== 'checking' && validation.status !== 'invalid');

  const submit = () =>
    onContinue({
      id: crypto.randomUUID(),
      corridorCode: corridor.code,
      name: form.beneficiary_name,
      relation,
      lastSentAt: null,
      details: form,
    });

  return (
    <div className="phone-screen">
      <div className="topbar">
        <button className="back-btn" onClick={onBack}>
          <BackIcon />
        </button>
        <h1>
          {corridor.flag} Recipient details
        </h1>
      </div>

      <label className="field">
        Bank name
        <input value={form.bank_name} onChange={(e) => set('bank_name', e.target.value)} />
      </label>

      {corridor.identifierField && (
        <label className="field">
          {corridor.identifierLabel}
          <input
            value={form[corridor.identifierField] ?? ''}
            onChange={(e) => set(corridor.identifierField, e.target.value)}
            onBlur={runValidate}
          />
        </label>
      )}

      {BASE_FIELDS.map((f) => (
        <label className="field" key={f.key}>
          {f.label}
          <input
            value={form[f.key]}
            onChange={(e) => set(f.key, e.target.value)}
            onBlur={f.key === 'beneficiary_account_number' ? runValidate : undefined}
          />
        </label>
      ))}

      {corridor.hasAccountType && (
        <label className="field">
          Account type
          <select value={form.beneficiary_account_type} onChange={(e) => set('beneficiary_account_type', e.target.value)}>
            <option value="savings">Savings</option>
            <option value="current">Current</option>
          </select>
        </label>
      )}

      <label className="field">
        Relationship to you
        <select value={relation} onChange={(e) => setRelation(e.target.value)}>
          {RELATIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>

      {corridor.hasValidateAccount && <ValidateBadge validation={validation} />}

      <button className="btn btn-primary" disabled={!canContinue} onClick={submit}>
        Save recipient
      </button>
    </div>
  );
}

function ValidateBadge({ validation }) {
  if (validation === 'checking') {
    return (
      <span className="validate-badge checking">
        <ClockIcon width={12} height={12} /> Checking account…
      </span>
    );
  }
  if (!validation) return null;

  const { status, name } = validation;
  const icon =
    status === 'valid' ? (
      <CheckIcon width={12} height={12} />
    ) : status === 'invalid' ? (
      <XIcon width={12} height={12} />
    ) : (
      <ClockIcon width={12} height={12} />
    );
  const text =
    {
      valid: `Account verified${name ? ` — ${name}` : ''}`,
      invalid: 'Account not found — check the details',
      nre: 'NRE account — additional checks apply',
      pending: 'Verification pending',
    }[status] ?? status;

  return (
    <span className={`validate-badge ${status}`}>
      {icon} {text}
    </span>
  );
}
