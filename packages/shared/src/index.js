export const HOTS_MAPS = [
  { id: 'alterac-pass', name: 'Alterac Pass' },
  { id: 'battlefield-eternity', name: 'Battlefield Eternity' },
  { id: 'braxis-holdout', name: 'Braxis Holdout' },
  { id: 'cursed-hollow', name: 'Cursed Hollow' },
  { id: 'dragon-shire', name: 'Dragon Shire' },
  { id: 'garden-of-terror', name: 'Garden of Terror' },
  { id: 'hanamura-temple', name: 'Hanamura Temple' },
  { id: 'infernal-shrines', name: 'Infernal Shrines' },
  { id: 'sky-temple', name: 'Sky Temple' },
  { id: 'tomb-of-spider-queen', name: 'Tomb of the Spider Queen' },
  { id: 'towers-of-doom', name: 'Towers of Doom' },
  { id: 'volskaya-foundry', name: 'Volskaya Foundry' },
]

export const MAP_NAME_BY_ID = Object.fromEntries(
  HOTS_MAPS.map((map) => [map.id, map.name]),
)

export const MAP_ID_BY_NAME = Object.fromEntries(
  HOTS_MAPS.map((map) => [map.name, map.id]),
)

const shared = {
  HOTS_MAPS,
  MAP_NAME_BY_ID,
  MAP_ID_BY_NAME,
}

export default shared
