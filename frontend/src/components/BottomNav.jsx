import { HomeIcon, SendIcon, HistoryIcon, DevIcon } from '../icons.jsx';

const TABS = [
  { key: 'home', label: 'Home', Icon: HomeIcon },
  { key: 'send', label: 'Send', Icon: SendIcon },
  { key: 'history', label: 'History', Icon: HistoryIcon },
  { key: 'developer', label: 'Developer', Icon: DevIcon },
];

export function BottomNav({ active, onNavigate }) {
  return (
    <nav className="bottom-nav">
      {TABS.map(({ key, label, Icon }) => (
        <button key={key} className={active === key ? 'active' : ''} onClick={() => onNavigate(key)}>
          <Icon />
          {label}
        </button>
      ))}
    </nav>
  );
}
