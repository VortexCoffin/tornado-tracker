export default function TornadoLogo({ size = 36 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      className="tornado-logo"
    >
      <circle cx="48" cy="14" r="6" fill="#8b1a1a" opacity="0.85" />
      <path
        d="M42 18C42 18 36 26 32 36C28 46 20 48 16 54"
        stroke="#d32f2f"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M38 24C38 24 34 30 30 38C26 46 22 48 18 50"
        stroke="#ff5252"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M34 30C34 30 31 35 28 41C25 47 22 48 20 49"
        stroke="#ff8a80"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}