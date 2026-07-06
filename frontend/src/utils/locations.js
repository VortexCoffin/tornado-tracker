const PROVINCE_CODES = {
  AB: 'Alberta',
  BC: 'British Columbia',
  MB: 'Manitoba',
  NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador',
  NS: 'Nova Scotia',
  NT: 'Northwest Territories',
  NU: 'Nunavut',
  ON: 'Ontario',
  PE: 'Prince Edward Island',
  QC: 'Quebec',
  SK: 'Saskatchewan',
  YT: 'Yukon',
}

const PROVINCE_ALIASES = {
  ab: 'AB',
  alberta: 'AB',
  bc: 'BC',
  'british columbia': 'BC',
  mb: 'MB',
  manitoba: 'MB',
  nb: 'NB',
  'new brunswick': 'NB',
  nl: 'NL',
  'newfoundland and labrador': 'NL',
  newfoundland: 'NL',
  ns: 'NS',
  'nova scotia': 'NS',
  nt: 'NT',
  'northwest territories': 'NT',
  nu: 'NU',
  nunavut: 'NU',
  on: 'ON',
  ontario: 'ON',
  pe: 'PE',
  'prince edward island': 'PE',
  qc: 'QC',
  quebec: 'QC',
  sk: 'SK',
  sask: 'SK',
  saskatchewan: 'SK',
  yt: 'YT',
  yukon: 'YT',
}

export function resolveProvinceCode(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''

  const upper = raw.toUpperCase()
  if (PROVINCE_CODES[upper]) return upper

  const alias = PROVINCE_ALIASES[raw.toLowerCase()]
  return alias || upper
}

export function parseLocationInput(city, province) {
  let name = String(city || '').trim()
  let prov = resolveProvinceCode(province)

  if (!name) return { city: '', province: prov }

  const commaParts = name.split(',').map((part) => part.trim()).filter(Boolean)
  if (commaParts.length >= 2) {
    const maybeProvince = resolveProvinceCode(commaParts[commaParts.length - 1])
    if (maybeProvince && PROVINCE_CODES[maybeProvince]) {
      prov = prov || maybeProvince
      name = commaParts.slice(0, -1).join(', ')
    }
  }

  const words = name.split(/\s+/)
  if (words.length >= 2) {
    const lastTwo = words.slice(-2).join(' ').toLowerCase()
    const lastOne = words[words.length - 1].toLowerCase().replace(/\./g, '')
    const trailingProvince =
      resolveProvinceCode(lastTwo) || resolveProvinceCode(lastOne)

    if (trailingProvince && PROVINCE_CODES[trailingProvince]) {
      prov = prov || trailingProvince
      name =
        trailingProvince === resolveProvinceCode(lastTwo)
          ? words.slice(0, -2).join(' ')
          : words.slice(0, -1).join(' ')
    }
  }

  return { city: name.trim(), province: prov }
}

export function normalizeLocationName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/^city of\s+/i, '')
    .replace(/^town of\s+/i, '')
    .replace(/^municipality of\s+/i, '')
    .replace(/\s+(sk|sask|saskatchewan|ab|alberta|bc|mb|nb|nl|ns|nt|nu|on|pe|qc|yt)$/i, '')
    .trim()
}

export function locationsMatch(alertLocation, areaLocation) {
  const alertName = normalizeLocationName(alertLocation)
  const areaName = normalizeLocationName(areaLocation)
  if (!alertName || !areaName) return false

  return alertName.includes(areaName) || areaName.includes(alertName)
}