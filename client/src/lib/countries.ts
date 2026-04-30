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

export function getCountryFlagWithCode(countryCode?: string | null) {
  if (!countryCode) return '--'
  const country = COUNTRY_BY_CODE[countryCode]
  if (!country) return countryCode.toUpperCase()
  return country.code
}

export function getCountryFlagIconUrl(countryCode?: string | null) {
  const code = getCountryFlagWithCode(countryCode).toLowerCase()
  if (!/^[a-z]{2}$/.test(code)) return null
  return `https://flagcdn.com/w20/${code}.png`
}

export function getCountryName(countryCode?: string | null) {
  if (!countryCode) return 'Sin país'
  return COUNTRY_BY_CODE[countryCode]?.name ?? countryCode
}
