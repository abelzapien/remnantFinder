import { CatalogItem, CatalogPayload } from '../types';

const STATIC_TERMS_ES: Record<string, string> = {
  Survivor: 'Superviviente',
  Veteran: 'Veterano',
  Nightmare: 'Pesadilla',
  Apocalypse: 'Apocalipsis',
  Hardcore: 'Extremo',
  Campaign: 'Campaña',
  Adventure: 'Aventura',
  'Blood Moon Altar': 'Altar de Luna de Sangre',
  'Blood Moon': 'Luna de Sangre',
  Bedel: 'Bedel, de los vaunnt',
  'Bedel of the Vaunnt': 'Bedel, de los vaunnt',
  Mudtooth: 'Colmillo Fangoso',
  'Drzyr Replicator': 'Replicador drzyr',
  Whispers: 'Susurros',
  Whisper: 'Susurros',
  Spark: 'Chispa',
  McCabe: 'Ava McCabe',
  'Ward 13': 'Base 13',
  'Root Earth': 'Tierra de Raíz',
  Labyrinth: 'Laberinto',
  'The Labyrinth': 'El Laberinto',
  'Long Gun': 'Arma Larga',
  LongGun: 'Arma Larga',
  'Hand Gun': 'Arma Corta',
  HandGun: 'Arma Corta',
  Melee: 'Cuerpo a Cuerpo',
  MeleeWeapon: 'Arma Cuerpo a Cuerpo',
  Gunslinger: 'Pistolero',
  'World Drop': 'Drop Mundial',
  WorldDrop: 'Drop Mundial',
  'The Forgotten Kingdom': 'El Reino Olvidado',
  Ravager: 'El Devastador',
  'The Ravager': 'El Devastador',
  'Corrupted Ravager': 'Devastador Corrupto',
  'Red Throne': 'El Trono Rojo',
  'The Red Throne': 'El Trono Rojo',
  'The One True King': 'El Único Rey Verdadero',
  Nightweaver: 'La Tejenoches',
  'The Nightweaver': 'La Tejenoches',
  'Faelin / Faerin': 'Faelin / Faerin',
  'The Core': 'El Núcleo',
  "Tal'Ratha": "Tal'Ratha",
  'The Dark Horizon': 'El Horizonte Oscuro',
  'Glittering Grotto': 'Gruta Reluciente',
};

const STATIC_VALUES_ES = new Set<string>(Object.values(STATIC_TERMS_ES));
let cachedGlossaryRef: Record<string, string> | undefined;
let cachedGlossaryValuesEs = new Set<string>();

function isAlreadySpanishTerm(
  text: string,
  glossary?: Record<string, string>
): boolean {
  if (STATIC_VALUES_ES.has(text)) return true;
  if (!glossary) return false;
  if (glossary !== cachedGlossaryRef) {
    cachedGlossaryRef = glossary;
    cachedGlossaryValuesEs = new Set<string>(Object.values(glossary));
  }
  return cachedGlossaryValuesEs.has(text);
}

export function translateDifficultyEs(difficulty?: string | null): string {
  if (!difficulty) return '';
  return STATIC_TERMS_ES[difficulty] || difficulty;
}

export function translateUiTermEs(
  raw?: string | null,
  catalog?: CatalogPayload | null
): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  if (STATIC_TERMS_ES[trimmed]) return STATIC_TERMS_ES[trimmed];
  const glossary = catalog?.uiGlossaryEs;
  if (glossary && glossary[trimmed]) return glossary[trimmed];

  // Avoid re-splitting terms that are already translated Spanish phrases containing commas (e.g. "Bedel, de los vaunnt")
  if (isAlreadySpanishTerm(trimmed, glossary)) {
    return trimmed;
  }

  // Handle "World Stone: <Location>" / "Piedra de Mundo: <Location>" or "Checkpoint: <Location>"
  if (trimmed.startsWith('World Stone:')) {
    const loc = trimmed.slice('World Stone:'.length).trim();
    return `Piedra de Mundo: ${translateUiTermEs(loc, catalog)}`;
  }
  if (trimmed.startsWith('Piedra de Mundo:')) {
    const loc = trimmed.slice('Piedra de Mundo:'.length).trim();
    return `Piedra de Mundo: ${translateUiTermEs(loc, catalog)}`;
  }
  if (trimmed.startsWith('Checkpoint:')) {
    const loc = trimmed.slice('Checkpoint:'.length).trim();
    return `Punto de Control: ${translateUiTermEs(loc, catalog)}`;
  }
  if (trimmed.startsWith('Punto de control:')) {
    const loc = trimmed.slice('Punto de control:'.length).trim();
    return `Punto de Control: ${translateUiTermEs(loc, catalog)}`;
  }

  // Handle comma-separated prerequisites or lists
  if (trimmed.includes(',')) {
    return trimmed
      .split(',')
      .map((part) => translateUiTermEs(part.trim(), catalog))
      .join(', ');
  }

  return trimmed;
}

export function resolveItemDescriptionEs(
  catalogItem?: CatalogItem | null
): { es: string; en: string } {
  const en = (catalogItem?.description || '').trim();
  const es = (catalogItem?.descriptionEs || en).trim();
  return { es, en };
}

export function resolveItemHowToGetEs(
  rolledNote: string | undefined | null,
  originType: string,
  catalogItem?: CatalogItem | null,
  catalogPayload?: CatalogPayload | null
): { es: string; en: string } {
  const rawEn = (rolledNote || catalogItem?.howToObtainNote || '').trim();
  let es = '';

  // If rolledNote matches catalogItem.howToObtainNote or catalogItem has howToObtainNoteEs
  if (
    rawEn &&
    catalogPayload?.notesDictionaryEs &&
    catalogPayload.notesDictionaryEs[rawEn]
  ) {
    es = catalogPayload.notesDictionaryEs[rawEn];
  } else if (catalogItem?.howToObtainNoteEs) {
    es = catalogItem.howToObtainNoteEs;
  } else if (rawEn) {
    es = rawEn;
  }

  if (!es) {
    es =
      originType === 'WorldDrop'
        ? 'Drop aleatorio del pool general de este bioma. Aparece en el suelo de zonas/mazmorras o al derrotar aberraciones.'
        : 'Se obtiene completando este evento, jefe o mazmorra.';
  }

  return {
    es,
    en: rawEn,
  };
}
