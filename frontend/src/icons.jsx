const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export const HomeIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M3 11l9-8 9 8" />
    <path d="M5 10v10h14V10" />
  </svg>
);

export const SendIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M21 12 3 5l4.5 7L3 19Z" />
    <path d="M7.5 12H21" />
  </svg>
);

export const HistoryIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M3 3v5h5" />
    <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
    <path d="M12 7v5l4 2" />
  </svg>
);

export const DevIcon = (props) => (
  <svg {...base} {...props}>
    <path d="m8 6-6 6 6 6" />
    <path d="m16 6 6 6-6 6" />
  </svg>
);

export const BackIcon = (props) => (
  <svg {...base} width={18} height={18} {...props}>
    <path d="M15 18l-6-6 6-6" />
  </svg>
);

export const CheckIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const ClockIcon = (props) => (
  <svg {...base} {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
  </svg>
);

export const XIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export const BankIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M3 21h18" />
    <path d="M4 21V9l8-6 8 6v12" />
    <path d="M9 21V13h6v8" />
  </svg>
);

export const ExchangeIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M7 3 3 7l4 4" />
    <path d="M3 7h13a4 4 0 0 1 4 4v1" />
    <path d="M17 21l4-4-4-4" />
    <path d="M21 17H8a4 4 0 0 1-4-4v-1" />
  </svg>
);

export const BoltIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />
  </svg>
);

/* -------------------------------------------------------- iOS status bar */

export const SignalIcon = (props) => (
  <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor" {...props}>
    <rect x="0" y="8" width="3" height="4" rx="0.6" />
    <rect x="5" y="5.5" width="3" height="6.5" rx="0.6" />
    <rect x="10" y="3" width="3" height="9" rx="0.6" />
    <rect x="15" y="0" width="3" height="12" rx="0.6" />
  </svg>
);

export const WifiIcon = (props) => (
  <svg width="16" height="12" viewBox="0 0 16 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" {...props}>
    <path d="M1 4.2a10 10 0 0 1 14 0" />
    <path d="M3.7 7.1a6 6 0 0 1 8.6 0" />
    <path d="M6.6 10a2.3 2.3 0 0 1 2.8 0" />
  </svg>
);

export const PlusIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const UserIcon = (props) => (
  <svg {...base} {...props}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </svg>
);

export const LogoutIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5" />
    <path d="M21 12H9" />
  </svg>
);

export const ShieldIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M12 3 4 6v6c0 4.6 3.2 8.2 8 9 4.8-.8 8-4.4 8-9V6l-8-3Z" />
  </svg>
);

export const BatteryIcon = (props) => (
  <svg width="25" height="12" viewBox="0 0 25 12" fill="none" {...props}>
    <rect x="1" y="1" width="20" height="10" rx="2.6" stroke="currentColor" strokeWidth="1" opacity="0.35" />
    <rect x="2.5" y="2.5" width="16" height="7" rx="1.4" fill="currentColor" />
    <rect x="22.3" y="4" width="1.7" height="4" rx="0.8" fill="currentColor" opacity="0.35" />
  </svg>
);
