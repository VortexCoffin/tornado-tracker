import { useState } from 'react'

const TIPS = {
  onGround: {
    title: 'Tornado on the ground — shelter immediately',
    items: [
      'Get to the lowest interior room now — basement or storm cellar is best.',
      'Stay away from windows, doors, and outside walls.',
      'Protect your head and neck with a helmet, mattress, or heavy blankets.',
      'Do not leave shelter until the warning has expired or officials say it is safe.',
      'Mobile homes and vehicles cannot protect you — get to a sturdy building.',
    ],
  },
  warning: {
    title: 'Tornado Warning — act now',
    items: [
      'Get indoors to the lowest floor, away from windows.',
      'Use a basement, storm cellar, or interior bathroom/closet.',
      'Cover your head — helmet, mattress, or heavy blankets help.',
      'Mobile homes and vehicles are not safe. Shelter in a sturdy building.',
      'Do not try to outrun a tornado in a car if it is close.',
    ],
  },
  watch: {
    title: 'Tornado Watch — be ready',
    items: [
      'Know where you will shelter if a warning is issued.',
      'Charge your phone and keep a radio or alerts app handy.',
      'Watch the sky and radar — storms can strengthen quickly.',
      'Secure loose outdoor items that could become debris.',
      'Review your plan with family before storms arrive.',
    ],
  },
  default: {
    title: 'Severe weather safety',
    items: [
      'Warnings mean a tornado is imminent or occurring — shelter immediately.',
      'Watches mean conditions are favourable — stay alert and prepared.',
      'Environment Canada is the official source for Canadian weather alerts.',
      'When thunder roars, go indoors.',
    ],
  },
}

export default function SafetyTips({ tipKey = 'default' }) {
  const [open, setOpen] = useState(true)
  const tips = TIPS[tipKey] || TIPS.default

  return (
    <section className="safety-tips">
      <button type="button" className="safety-tips-toggle" onClick={() => setOpen(!open)}>
        <span>{tips.title}</span>
        <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <ul>
          {tips.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </section>
  )
}