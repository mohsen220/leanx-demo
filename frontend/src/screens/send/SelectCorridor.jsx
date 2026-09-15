import { BackIcon } from '../../icons.jsx';

export function SelectCorridor({ corridors, onSelect, onBack }) {
  return (
    <div className="phone-screen">
      <div className="topbar">
        <button className="back-btn" onClick={onBack}>
          <BackIcon />
        </button>
        <h1>New recipient</h1>
      </div>

      <div className="muted">Where will they receive the money?</div>

      <div className="corridor-grid">
        {corridors.map((c) => (
          <button key={c.code} className="corridor-card" onClick={() => onSelect(c)}>
            <span className="flag">{c.flag}</span>
            <span className="name">{c.name}</span>
            <span className="sub">Bank deposit · {c.currency}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
