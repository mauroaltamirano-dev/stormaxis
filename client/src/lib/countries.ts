import { COUNTRY_BY_CODE, COUNTRY_OPTIONS } from '@nexusgg/shared'

export { COUNTRY_OPTIONS }

export function getCountryLabel(countryCode?: string | null) {
  if (!countryCode) return 'Sin país'
  const country = COUNTRY_BY_CODE[countryCode]
  return country ? `${country.flag} ${country.name}` : countryCode
}

export function getCountryFlag(countryCode?: string | null) {
  if (!countryCode) return '🌐'
  return COUNTRY_BY_CODE[countryCode]?.flag ?? '🌐'
}

export function getCountryName(countryCode?: string | null) {
  if (!countryCode) return 'Sin país'
  return COUNTRY_BY_CODE[countryCode]?.name ?? countryCode
}
