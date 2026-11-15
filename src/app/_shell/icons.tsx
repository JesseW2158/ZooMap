/** Tab bar icons: inline SVG line icons that take the text color. */

type IconProps = { className?: string };

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

/** A sprinter, solid, in the style of a pictogram on a sign. */
export function ActivitiesIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <circle cx="15.6" cy="3.6" r="2.2" />
      {/* torso leaning forward, arms swinging, legs mid-stride: one shape of thick strokes */}
      <path
        d="M13.4 7.2l-4 1.1-1.9 3.1M13.4 7.2l-1.6 6 3.6 2.6.9 5.2M11.8 13.2l-2.4 3.7-4.6.9M13.4 7.2l2.3 3.5 3.4.4"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A group of people. */
export function CrowdIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="8" r="3" />
      <path d="M6.5 20v-1.5a5.5 5.5 0 0 1 11 0V20" />
      <circle cx="5" cy="9.5" r="2.2" />
      <path d="M1.5 19v-1a3.5 3.5 0 0 1 4.3-3.4" />
      <circle cx="19" cy="9.5" r="2.2" />
      <path d="M22.5 19v-1a3.5 3.5 0 0 0-4.3-3.4" />
    </svg>
  );
}

/** A map pin. */
export function MapIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  );
}

/** A calendar page. */
export function CalendarIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="4" y="5" width="16" height="16" rx="2.5" />
      <path d="M4 10h16M8.5 3v4M15.5 3v4" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01" strokeWidth={2.4} />
    </svg>
  );
}

/** A coin with a dollar sign. */
export function PointsIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M14.8 9.2c-.4-1-1.5-1.7-2.8-1.7-1.6 0-2.8.9-2.8 2.2 0 3 5.6 1.6 5.6 4.6 0 1.3-1.2 2.2-2.8 2.2-1.4 0-2.5-.7-2.9-1.8M12 6v1.5M12 16.5V18" />
    </svg>
  );
}

/** A speech bubble. */
export function AskIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4.5 3.5V17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
      <path d="M8 10.5h.01M12 10.5h.01M16 10.5h.01" strokeWidth={2.6} />
    </svg>
  );
}
