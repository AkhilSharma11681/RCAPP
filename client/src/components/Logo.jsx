// client/src/components/Logo.jsx
//
// A small, brandable SVG logo for Miloo. Uses currentColor for
// the inner mark so it adapts to any text color.

export default function Logo({ size = 32 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <defs>
        <linearGradient id="milooLogoGrad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f0abfc" />
          <stop offset="50%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="28" height="28" rx="9" fill="url(#milooLogoGrad)" />
      <path
        d="M10.5 21.5c0-3 2-5 5.5-5s5.5 2 5.5 5"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="12.5" cy="13.5" r="1.6" fill="white" />
      <circle cx="19.5" cy="13.5" r="1.6" fill="white" />
    </svg>
  )
}
