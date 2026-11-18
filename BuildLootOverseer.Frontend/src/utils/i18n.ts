import {
  AppLanguage,
  CatalogItem,
  CatalogPayload,
  CharacterDto,
  DoorLinkDto,
  LocationDto,
  RolledItemDto,
  RolledWorldDto,
  SynergyTagDefinition,
  ZoneDto,
} from '../types';
import {
  resolveItemDescriptionEs,
  resolveItemHowToGetEs,
  translateDifficultyEs,
  translateUiTermEs,
} from './localizationEs';

export function normalizeLanguage(raw?: string | null): AppLanguage {
  return raw?.toLowerCase() === 'en' ? 'en' : 'es';
}

const DIFFICULTY_TO_EN: Record<string, string> = {
  Superviviente: 'Survivor',
  Veterano: 'Veteran',
  Pesadilla: 'Nightmare',
  Apocalipsis: 'Apocalypse',
  Survivor: 'Survivor',
  Veteran: 'Veteran',
  Nightmare: 'Nightmare',
  Apocalypse: 'Apocalypse',
};

const WORLD_CODE_LABELS: Record<string, { es: string; en: string }> = {
  World_Fae: { es: 'Losomn', en: 'Losomn' },
  World_DLC1: { es: 'Losomn (DLC 1)', en: 'Losomn (DLC 1)' },
  World_Jungle: { es: 'Yaesha', en: 'Yaesha' },
  World_DLC2: { es: 'Yaesha (DLC 2)', en: 'Yaesha (DLC 2)' },
  World_Nerud: { es: "N'Erud", en: "N'Erud" },
  World_DLC3: { es: "N'Erud (DLC 3)", en: "N'Erud (DLC 3)" },
  World_Root: { es: 'Tierra de Raíz', en: 'Root Earth' },
  World_Labyrinth: { es: 'El Laberinto', en: 'The Labyrinth' },
  World_Base: { es: 'Global', en: 'Global' },
};

export function resolveWorldCodeLabel(worldCode: string | null | undefined, lang: AppLanguage): string {
  if (!worldCode) return lang === 'en' ? 'Global' : 'Global';
  const entry = WORLD_CODE_LABELS[worldCode];
  if (entry) return lang === 'en' ? entry.en : entry.es;
  return lang === 'en' ? worldCode : translateUiTermEs(worldCode);
}

export function resolveTagLabel(
  def: SynergyTagDefinition | undefined,
  fallbackId: string,
  lang: AppLanguage
): string {
  if (!def) return fallbackId;
  return lang === 'en' ? def.labelEn || def.id : def.labelEs || def.id;
}

export function resolveCharacterSummary(ch: CharacterDto, lang: AppLanguage): string {
  if (lang === 'en') {
    if (ch.summaryEn) return ch.summaryEn;
    const sec = ch.secondaryArchetype ? ` / ${ch.secondaryArchetype}` : '';
    return `${ch.primaryArchetype}${sec} (${ch.acquiredItemsCount} items)`;
  }
  return ch.summary;
}

export function resolveDifficulty(world: RolledWorldDto, lang: AppLanguage): string {
  if (lang === 'en') {
    if (world.difficultyEn) return world.difficultyEn;
    return DIFFICULTY_TO_EN[world.difficulty] || world.difficulty;
  }
  return translateDifficultyEs(world.difficulty);
}

export function resolveZoneName(z: ZoneDto, lang: AppLanguage, catalog?: CatalogPayload | null): string {
  if (z.isBossRushNode) return 'Boss Rush';
  if (lang === 'en') return z.name.trim();
  return translateUiTermEs(z.nameEs || z.name, catalog);
}

export function resolveZoneStory(z: ZoneDto, lang: AppLanguage, catalog?: CatalogPayload | null): string {
  if (z.isBossRushNode) {
    return lang === 'en' ? 'Global Reward Pool' : 'Pool Global';
  }
  if (lang === 'en') return z.story.trim();
  return translateUiTermEs(z.storyEs || z.story, catalog);
}

export function resolveLocationName(loc: LocationDto, lang: AppLanguage): string {
  return lang === 'en' ? loc.name.trim() : (loc.nameEs || loc.name).trim();
}

export function resolveParentLocationName(loc: LocationDto, lang: AppLanguage): string | null {
  if (lang === 'en') {
    return loc.parentLocationName ? loc.parentLocationName.trim() : null;
  }
  return loc.parentLocationNameEs || loc.parentLocationName || null;
}

export function resolveDoorTargetName(dl: DoorLinkDto, lang: AppLanguage): string {
  return lang === 'en' ? dl.targetLocationName.trim() : (dl.targetLocationNameEs || dl.targetLocationName).trim();
}

export function resolveWorldLocationHeader(
  world: RolledWorldDto,
  lang: AppLanguage,
  catalog?: CatalogPayload | null
): {
  currentLocPrimary: string;
  currentLocSecondary: string | null;
  worldLabel: string;
  respawnLabel: string | null;
} {
  if (lang === 'en') {
    const primary = (world.currentLocationName || 'Ward 13').trim();
    const wLabel = (world.currentWorldName || world.mode).trim();
    const respawn =
      world.respawnPointFormattedEn ||
      (world.respawnPointRawName ? `Checkpoint: ${world.respawnPointRawName}` : null);
    return {
      currentLocPrimary: primary,
      currentLocSecondary: null,
      worldLabel: wLabel,
      respawnLabel: respawn,
    };
  }

  const primaryEs = translateUiTermEs(world.currentLocationNameEs, catalog) || 'Base 13 (Ward 13)';
  const secondaryEn =
    world.currentLocationName &&
    world.currentLocationName.trim().toLowerCase() !== primaryEs.trim().toLowerCase()
      ? world.currentLocationName.trim()
      : null;
  const wLabelEs = translateUiTermEs(world.currentWorldNameEs || world.mode, catalog);
  const respawnEs = world.respawnPointFormatted
    ? translateUiTermEs(world.respawnPointFormatted, catalog)
    : null;

  return {
    currentLocPrimary: primaryEs,
    currentLocSecondary: secondaryEn,
    worldLabel: wLabelEs,
    respawnLabel: respawnEs,
  };
}

export function resolveItemDisplay(
  rolled: RolledItemDto,
  catalogItem: CatalogItem | undefined | null,
  catalogPayload: CatalogPayload | undefined | null,
  lang: AppLanguage,
  toggleAltLang: boolean
): {
  primaryName: string;
  secondaryName: string | null;
  description: string;
  howToGet: string;
  oneLineSummary: string;
  hasAltLanguageAvailable: boolean;
  altToggleLabel: string;
} {
  const nameEn = (rolled.canonicalName || catalogItem?.canonicalName || rolled.id).trim();
  const nameEs =
    (translateUiTermEs(rolled.nameEs || catalogItem?.nameEs, catalogPayload) || nameEn).trim();

  const descPair = resolveItemDescriptionEs(catalogItem);
  const howPair = resolveItemHowToGetEs(
    rolled.howToObtainNote,
    rolled.originType,
    catalogItem,
    catalogPayload
  );

  const effectiveLang: AppLanguage = toggleAltLang ? (lang === 'es' ? 'en' : 'es') : lang;

  const primaryName = lang === 'en' ? nameEn : nameEs;
  const candidateSecondary = lang === 'en' ? nameEs : nameEn;
  const secondaryName =
    candidateSecondary && candidateSecondary.toLowerCase() !== primaryName.toLowerCase()
      ? candidateSecondary
      : null;

  const description =
    effectiveLang === 'en' ? descPair.en || descPair.es : descPair.es || descPair.en;
  const howToGet =
    effectiveLang === 'en' ? howPair.en || howPair.es : howPair.es || howPair.en;

  const summarySource =
    lang === 'en'
      ? descPair.en || howPair.en || descPair.es
      : descPair.es || howPair.es || descPair.en;

  const hasAltLanguageAvailable = Boolean(
    (descPair.en && descPair.es && descPair.en !== descPair.es) ||
      (howPair.en && howPair.es && howPair.en !== howPair.es)
  );

  const altToggleLabel =
    lang === 'es'
      ? toggleAltLang
        ? '[Volver a Español]'
        : '[Ver original EN]'
      : toggleAltLang
      ? '[Back to English]'
      : '[Ver en Español]';

  return {
    primaryName,
    secondaryName,
    description,
    howToGet,
    oneLineSummary: (summarySource || '').replace(/\s+/g, ' ').trim(),
    hasAltLanguageAvailable,
    altToggleLabel,
  };
}

export async function openExternalUrl(url: string): Promise<void> {
  if (!url) return;
  try {
    await fetch('/api/open-external', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
