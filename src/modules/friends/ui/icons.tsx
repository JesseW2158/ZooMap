/**
 * Line icons, 24×24, drawn in the text colour. The same set is copied into each module's
 * `ui/icons.tsx` (modules may not import one another, and src/shared is frozen); keep the
 * copies identical when adding one.
 */

type P = { className?: string };
const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};
const solid = { viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": true };

// ---------------------------------------------------------------- actions

export const PlusIcon = ({ className }: P) => (
  <svg {...base} strokeWidth={2.6} className={className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const CheckIcon = ({ className }: P) => (
  <svg {...base} strokeWidth={2.6} className={className}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

export const CloseIcon = ({ className }: P) => (
  <svg {...base} strokeWidth={2.4} className={className}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const ChevronUpIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M6 15l6-6 6 6" />
  </svg>
);

export const ChevronDownIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

/** A navigation arrow: directions. */
export const GoIcon = ({ className }: P) => (
  <svg {...solid} className={className}>
    <path d="M20.6 3.4a1 1 0 0 0-1.1-.2L3.7 10a1 1 0 0 0 .1 1.9l6.6 1.7 1.7 6.6a1 1 0 0 0 1.9.1l6.8-15.8a1 1 0 0 0-.2-1.1z" />
  </svg>
);

export const SearchIcon = ({ className }: P) => (
  <svg {...base} strokeWidth={2.2} className={className}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </svg>
);

export const SendIcon = ({ className }: P) => (
  <svg {...solid} className={className}>
    <path d="M3.4 20.4l17.5-7.5a1 1 0 0 0 0-1.8L3.4 3.6a.7.7 0 0 0-1 .8L4.6 11l8.4 1-8.4 1-2.2 6.6a.7.7 0 0 0 1 .8z" />
  </svg>
);

export const ExitIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10" />
  </svg>
);

export const StopIcon = ({ className }: P) => (
  <svg {...solid} className={className}>
    <rect x="6" y="6" width="12" height="12" rx="2.5" />
  </svg>
);

export const PencilIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" />
    <path d="M13.5 6.5l4 4" />
  </svg>
);

export const TrashIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5" />
  </svg>
);

export const SkipIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M5 5.5l9 6.5-9 6.5v-13z" />
    <path d="M18.5 5v14" />
  </svg>
);

export const GearIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v2.5M12 19v2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12H5M19 12h2.5M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8" />
  </svg>
);

export const LinkIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2" />
  </svg>
);

// ---------------------------------------------------------------- people and contact

export const QrIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.2" />
    <rect x="14" y="3.5" width="6.5" height="6.5" rx="1.2" />
    <rect x="3.5" y="14" width="6.5" height="6.5" rx="1.2" />
    <path d="M14 14h2.5v2.5H14zM18 18h2.5v2.5H18zM14 19.5h1M19.5 14v1.5" />
  </svg>
);

export const ScanIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M3.5 8V5.5a2 2 0 0 1 2-2H8M16 3.5h2.5a2 2 0 0 1 2 2V8M20.5 16v2.5a2 2 0 0 1-2 2H16M8 20.5H5.5a2 2 0 0 1-2-2V16" />
    <path d="M7 12h10" />
  </svg>
);

export const UsersIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20v-1a6 6 0 0 1 12 0v1" />
    <path d="M15.2 4.9a3.2 3.2 0 0 1 0 6.2M17.5 14.2A6 6 0 0 1 21 19.6v.4" />
  </svg>
);

export const UserPlusIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <circle cx="9.5" cy="8" r="3.5" />
    <path d="M3 20a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6" />
  </svg>
);

export const UserMinusIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <circle cx="9.5" cy="8" r="3.5" />
    <path d="M3 20a6.5 6.5 0 0 1 13 0M16.5 11h5" />
  </svg>
);

export const PhoneIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M5 4h3.5l1.7 4.3-2.2 1.4a11 11 0 0 0 6.3 6.3l1.4-2.2L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5A16 16 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4z" />
  </svg>
);

export const ChatIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M4 5.5h16v10.5H9l-5 4V5.5z" />
  </svg>
);

export const MailIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <rect x="3" y="5.5" width="18" height="13" rx="2" />
    <path d="M3.5 7l8.5 6 8.5-6" />
  </svg>
);

export const HeartIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" />
  </svg>
);

export const GlobeIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z" />
  </svg>
);

// ---------------------------------------------------------------- places and time

export const PinIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.4" />
  </svg>
);

export const ClockIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

export const AlarmIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="13" r="7" />
    <path d="M12 9.5V13l2.2 1.5M4 5l3-2.5M20 5l-3-2.5" />
  </svg>
);

export const FlagIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M5 21V4M5 4.5h11l-2 4 2 4H5" />
  </svg>
);

export const CalendarIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <rect x="4" y="5" width="16" height="16" rx="2.5" />
    <path d="M4 10h16M8.5 3v4M15.5 3v4" />
  </svg>
);

export const WalkIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <circle cx="13" cy="4.5" r="1.8" />
    <path d="M10.5 21l2-6-2.5-2.5 1.5-5 3 3 2.5 1M12.5 15l2.5 2 1 4M10.5 8.5L7.5 10l-1 3.5" />
  </svg>
);

export const BuildingIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M3.5 9.5L12 4l8.5 5.5M5 20.5h14M6.5 10.5v8M10 10.5v8M14 10.5v8M17.5 10.5v8" />
  </svg>
);

export const HomeIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M4 11l8-6.5 8 6.5M6 9.5V20h12V9.5M10 20v-5.5h4V20" />
  </svg>
);

export const SunIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </svg>
);

export const MoonIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />
  </svg>
);

export const AlertIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M12 4l9 16H3l9-16zM12 10v4M12 17h.01" />
  </svg>
);

// ---------------------------------------------------------------- categories and things

export const BookIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M12 6.5C10.2 5.2 7.6 4.6 3.5 4.8v13.4c4.1-.2 6.7.4 8.5 1.8 1.8-1.4 4.4-2 8.5-1.8V4.8c-4.1-.2-6.7.4-8.5 1.7z" />
    <path d="M12 6.5V20" />
  </svg>
);

export const CapIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M2.5 9.5L12 5l9.5 4.5L12 14 2.5 9.5z" />
    <path d="M6.5 11.5V16c1.5 1.5 3.4 2.2 5.5 2.2s4-.7 5.5-2.2v-4.5M21.5 9.5v5" />
  </svg>
);

export const NoteIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M6 3.5h9l4 4v13H6v-17z" />
    <path d="M14.5 3.5v4.5H19M9 12h7M9 15.5h7" />
  </svg>
);

export const BookmarkIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M6.5 3.5h11v17l-5.5-4-5.5 4v-17z" />
  </svg>
);

/** Social: two speech bubbles. */
export const BubblesIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M3.5 5h11v8h-6l-3.5 3v-3H3.5V5z" />
    <path d="M17.5 9h3v8h-1.5v3l-3.5-3H11v-1.5" />
  </svg>
);

export const BallIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5v17M6 6a9 9 0 0 1 0 12M18 6a9 9 0 0 0 0 12" />
  </svg>
);

export const UtensilsIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M7 3v7M4.5 3v4.5A2.5 2.5 0 0 0 7 10a2.5 2.5 0 0 0 2.5-2.5V3M7 10v11" />
    <path d="M17 21V3c-2 1.5-3 4-3 7v3h3" />
  </svg>
);

export const SparkleIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M12 3.5l1.9 5.2 5.1 1.8-5.1 1.8L12 17.5l-1.9-5.2L5 10.5l5.1-1.8L12 3.5zM18.5 16l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z" />
  </svg>
);

export const CoinIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M14.6 9.3c-.4-.9-1.4-1.5-2.6-1.5-1.5 0-2.6.8-2.6 2 0 2.8 5.2 1.5 5.2 4.3 0 1.2-1.1 2-2.6 2-1.3 0-2.3-.6-2.7-1.6M12 6.5v1.3M12 16.2v1.3" />
  </svg>
);

export const GiftIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <rect x="3.5" y="8" width="17" height="4" rx="1" />
    <path d="M5 12v8.5h14V12M12 8v12.5M12 8c-1-3-4.5-4-5.5-2S9 8 12 8zM12 8c1-3 4.5-4 5.5-2S15 8 12 8z" />
  </svg>
);

export const BagIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M5 8h14l-1 12.5H6L5 8zM9 8V6.5a3 3 0 0 1 6 0V8" />
  </svg>
);

export const TicketIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M3.5 7.5h17V10a2 2 0 0 0 0 4v2.5h-17V14a2 2 0 0 0 0-4V7.5zM14 7.5v9" />
  </svg>
);

export const LockIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </svg>
);

export const FlameIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M12 21a6 6 0 0 0 6-6c0-4-3-6-4-10-2 2-3 4-3 6-1-1-1.5-2-1.5-3C7 10 6 12.5 6 15a6 6 0 0 0 6 6z" />
  </svg>
);

export const CupIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M4.5 9h12v5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V9zM16.5 10.5h1.5a2.5 2.5 0 0 1 0 5h-1.8M8 3.5v2.5M12 3.5v2.5" />
  </svg>
);

export const IdCardIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <rect x="3" y="6" width="18" height="13" rx="2" />
    <circle cx="9" cy="12" r="2" />
    <path d="M6 16.5a3 3 0 0 1 6 0M14.5 11h4M14.5 14h3M10 6V3.5h4V6" />
  </svg>
);

export const DropIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M12 3.5s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z" />
  </svg>
);

export const ShirtIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M8.5 3.5L3.5 6.5l2 4 2-1V20.5h9V9.5l2 1 2-4-5-3a3.5 3.5 0 0 1-7 0z" />
  </svg>
);

export const HistoryIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5M3.5 4v4.5H8M12 8v4l3 2" />
  </svg>
);
