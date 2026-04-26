export type HotsMap = {
  id: string
  name: string
}

export type HeroRoleId =
  | 'TANK'
  | 'BRUISER'
  | 'RANGED_ASSASSIN'
  | 'MELEE_ASSASSIN'
  | 'HEALER'
  | 'SUPPORT'

export type HeroRole = {
  id: HeroRoleId
  label: string
}

export type HotsHero = {
  id: string
  name: string
  role: HeroRoleId
  roleLabel: string
  franchise: string
  portrait: string
}

export type CountryOption = {
  code: string
  name: string
  flag: string
}

export declare const HOTS_MAPS: readonly HotsMap[]
export declare const MAP_NAME_BY_ID: Record<string, string>
export declare const MAP_ID_BY_NAME: Record<string, string>
export declare const HERO_ROLES: readonly HeroRole[]
export declare const HOTS_HEROES: readonly HotsHero[]
export declare const HERO_BY_ID: Record<string, HotsHero>
export declare const HERO_ID_BY_NAME: Record<string, string>
export declare const COUNTRY_OPTIONS: readonly CountryOption[]
export declare const COUNTRY_BY_CODE: Record<string, CountryOption>
export declare const isValidCountryCode: (code: string | null | undefined) => boolean

declare const _default: {
  HOTS_MAPS: readonly HotsMap[]
  MAP_NAME_BY_ID: Record<string, string>
  MAP_ID_BY_NAME: Record<string, string>
  HERO_ROLES: readonly HeroRole[]
  HOTS_HEROES: readonly HotsHero[]
  HERO_BY_ID: Record<string, HotsHero>
  HERO_ID_BY_NAME: Record<string, string>
  COUNTRY_OPTIONS: readonly CountryOption[]
  COUNTRY_BY_CODE: Record<string, CountryOption>
  isValidCountryCode: (code: string | null | undefined) => boolean
}

export default _default
