import {
  AppLanguage,
  CatalogItem,
  CatalogPayload,
  CharacterDto,
  EvaluatedLootItem,
  LootPriorityTier,
  RolledItemDto,
  SynergyTagDefinition,
  UserBuildPresetDto,
} from '../types';

export interface CatalogLookup {
  byId: Map<string, CatalogItem>;
  byToolkitId: Map<string, CatalogItem>;
  byProfileId: Map<string, CatalogItem>;
  byCleanName: Map<string, CatalogItem>;
  tagDefById: Map<string, SynergyTagDefinition>;
}

export function cleanLookupKey(str?: string | null): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’`"\-_:.,!()/\\]/g, '')
    .replace(/\s+/g, '');
}

export function buildCatalogLookup(catalog: CatalogPayload | null): CatalogLookup {
  const byId = new Map<string, CatalogItem>();
  const byToolkitId = new Map<string, CatalogItem>();
  const byProfileId = new Map<string, CatalogItem>();
  const byCleanName = new Map<string, CatalogItem>();
  const tagDefById = new Map<string, SynergyTagDefinition>();

  if (!catalog) {
    return { byId, byToolkitId, byProfileId, byCleanName, tagDefById };
  }

  for (const td of catalog.synergyTagDefinitions || []) {
    tagDefById.set(td.id, td);
  }

  for (const item of catalog.items || []) {
    if (item.id) {
      byId.set(item.id.toLowerCase(), item);
    }
    if (item.toolkitId) {
      byToolkitId.set(item.toolkitId.toLowerCase(), item);
    }
    if (item.profileId) {
      byProfileId.set(item.profileId.toLowerCase(), item);
    }
    const cleanEn = cleanLookupKey(item.canonicalName);
    if (cleanEn && !byCleanName.has(cleanEn)) {
      byCleanName.set(cleanEn, item);
    }
    const cleanEs = cleanLookupKey(item.nameEs);
    if (cleanEs && !byCleanName.has(cleanEs)) {
      byCleanName.set(cleanEs, item);
    }
  }

  return { byId, byToolkitId, byProfileId, byCleanName, tagDefById };
}

export function findCatalogItemForRolled(
  rolled: RolledItemDto,
  lookup: CatalogLookup
): CatalogItem | undefined {
  return (
    lookup.byId.get(rolled.id.toLowerCase()) ||
    (rolled.profileId ? lookup.byProfileId.get(rolled.profileId.toLowerCase()) : undefined) ||
    lookup.byCleanName.get(cleanLookupKey(rolled.canonicalName)) ||
    lookup.byCleanName.get(cleanLookupKey(rolled.nameEs))
  );
}

export function evaluateRolledItem(
  rolled: RolledItemDto,
  lookup: CatalogLookup,
  character: CharacterDto | null,
  activePreset: UserBuildPresetDto | null,
  catalog: CatalogPayload | null,
  lang: AppLanguage = 'es'
): EvaluatedLootItem {
  const catalogItem = findCatalogItemForRolled(rolled, lookup);
  const itemSynergyTags = catalogItem?.synergyTags || [];
  const rawToolkitTags = new Set(catalogItem?.rawToolkitTags || []);
  const externalTokens = new Set(catalogItem?.externalTokens || []);

  const activeTagsSet = new Set(activePreset?.activeSynergyTags || []);
  const wishlistIds = new Set((activePreset?.wishlistItemIds || []).map((x) => x.toLowerCase()));
  const wishlistTkIds = new Set((activePreset?.wishlistToolkitIds || []).map((x) => x.toLowerCase()));
  const wishlistNames = new Set((activePreset?.wishlistItemNames || []).map((x) => cleanLookupKey(x)));

  // 1. Check Wishlist Match
  let isWishlistMatch = false;
  if (
    wishlistIds.has(rolled.id.toLowerCase()) ||
    (catalogItem?.id && wishlistIds.has(catalogItem.id.toLowerCase())) ||
    (catalogItem?.toolkitId && wishlistTkIds.has(catalogItem.toolkitId.toLowerCase())) ||
    wishlistNames.has(cleanLookupKey(rolled.canonicalName)) ||
    wishlistNames.has(cleanLookupKey(rolled.nameEs))
  ) {
    isWishlistMatch = true;
  }

  // Also check if item is an Engram or Weapon whose linked Archetype/Mod is in Wishlist
  if (!isWishlistMatch && catalogItem?.linkedItems) {
    const linkedArch = catalogItem.linkedItems.archetype?.name;
    const linkedMod = catalogItem.linkedItems.mod?.name;
    if (linkedArch && wishlistNames.has(cleanLookupKey(linkedArch))) {
      isWishlistMatch = true;
    }
    if (linkedMod && wishlistNames.has(cleanLookupKey(linkedMod))) {
      isWishlistMatch = true;
    }
  }

  // 2. Check Active Synergy Tags match
  const matchedActiveTags = itemSynergyTags.filter((t) => activeTagsSet.has(t));

  // Distinguish direct mechanical tag match (from remnant2-toolkit tags/tokens) vs keyword match
  let directMechanicalTagCount = 0;
  for (const tagId of matchedActiveTags) {
    const def = lookup.tagDefById.get(tagId);
    if (!def) continue;
    const directTokens = def.rawTokens || def.toolkitTags || [];
    const extTokens = def.externalTokens || [];
    const hasDirectTag =
      directTokens.some((tt) => rawToolkitTags.has(tt) || externalTokens.has(tt)) ||
      extTokens.some((et) => externalTokens.has(et));
    if (hasDirectTag) {
      directMechanicalTagCount++;
    }
  }

  // 3. Check Equipped Archetypes Synergy match
  const archetypeRecommendedTags = new Set<string>();
  const archMap = catalog?.archetypeSynergyMap || {};
  if (character?.primaryArchetype && archMap[character.primaryArchetype]) {
    for (const t of archMap[character.primaryArchetype]) archetypeRecommendedTags.add(t);
  }
  if (character?.secondaryArchetype && archMap[character.secondaryArchetype]) {
    for (const t of archMap[character.secondaryArchetype]) archetypeRecommendedTags.add(t);
  }
  const matchedArchetypeTags = itemSynergyTags.filter((t) => archetypeRecommendedTags.has(t));

  const isWorldDrop =
    rolled.originType === 'WorldDrop' || rolled.originType === 'BossRushWorldDrop';

  const getTagLbl = (t: string) => {
    const def = lookup.tagDefById.get(t);
    if (!def) return t;
    return lang === 'en' ? def.labelEn || def.id : def.labelEs || def.id;
  };

  // Build human-readable synergy explanation
  const synergyReasons: string[] = [];
  if (isWishlistMatch) {
    synergyReasons.push(
      lang === 'en'
        ? '🎯 Priority target in your Build Wishlist'
        : '🎯 Objetivo prioritario en tu Wishlist de Build'
    );
  }
  if (matchedActiveTags.length > 0) {
    const labels = matchedActiveTags.map(getTagLbl);
    if (matchedActiveTags.length >= 2 && directMechanicalTagCount >= 1) {
      synergyReasons.push(
        lang === 'en'
          ? `⚡ Strong synergy (${labels.join(' + ')})`
          : `⚡ Sinergia fuerte (${labels.join(' + ')})`
      );
    } else {
      synergyReasons.push(
        lang === 'en'
          ? `✨ Synergy with tags: ${labels.join(', ')}`
          : `✨ Sinergia con tags: ${labels.join(', ')}`
      );
    }
  }
  if (matchedArchetypeTags.length > 0 && matchedActiveTags.length === 0) {
    const archNames =
      lang === 'en'
        ? [character?.primaryArchetype, character?.secondaryArchetype].filter(Boolean).join('/')
        : [character?.primaryArchetypeEs, character?.secondaryArchetypeEs].filter(Boolean).join('/');
    const labels = matchedArchetypeTags.map(getTagLbl);
    synergyReasons.push(
      lang === 'en'
        ? `🛡️ Compatible with ${archNames}: ${labels.join(', ')}`
        : `🛡️ Compatible con ${archNames}: ${labels.join(', ')}`
    );
  }

  // 4. Determine 4-Tier Visual Priority
  const isStrongGoldSynergy = isWorldDrop
    ? matchedActiveTags.length >= 2 && directMechanicalTagCount >= 2
    : (matchedActiveTags.length >= 2 && directMechanicalTagCount >= 1) ||
      directMechanicalTagCount >= 2;

  let priority: LootPriorityTier = 'green';
  let priorityRank = 3;
  let priorityLabel = lang === 'en' ? 'NEW' : 'NUEVO';

  if (rolled.isOwned) {
    priority = 'gray';
    priorityRank = 4;
    priorityLabel = lang === 'en' ? 'OWNED' : 'OBTENIDO';
  } else if (isWishlistMatch || isStrongGoldSynergy) {
    priority = 'gold';
    priorityRank = 1;
    priorityLabel = isWishlistMatch
      ? lang === 'en'
        ? 'GOLD • WISHLIST'
        : 'ORO • WISHLIST'
      : lang === 'en'
      ? 'GOLD • META'
      : 'ORO • META';
  } else if (matchedActiveTags.length >= 1 || matchedArchetypeTags.length >= 1) {
    priority = 'purple';
    priorityRank = 2;
    priorityLabel = lang === 'en' ? 'PURPLE • SYNERGY' : 'MORADO • SINERGIA';
  } else {
    priority = 'green';
    priorityRank = 3;
    priorityLabel = lang === 'en' ? 'GREEN • NEW' : 'VERDE • NUEVO';
  }

  return {
    rolled,
    catalog: catalogItem,
    priority,
    priorityRank,
    priorityLabel,
    isWishlistMatch,
    matchedActiveTags,
    matchedArchetypeTags,
    synergyReasons,
  };
}

export interface ParsedBuildImportResult {
  matchedItems: CatalogItem[];
  suggestedSynergyTags: string[];
  sourceUrl?: string;
}

/**
 * Parses a Remnant 2 Toolkit URL, Vash Calculator URL, CSV export, or plaintext item list
 * and resolves every matching item in the catalog without hallucinating items.
 */
export function parseBuildImportInput(
  rawInput: string,
  lookup: CatalogLookup,
  catalog: CatalogPayload | null
): ParsedBuildImportResult {
  const text = (rawInput || '').trim();
  if (!text || !catalog) {
    return { matchedItems: [], suggestedSynergyTags: [] };
  }

  const foundById = new Map<string, CatalogItem>();
  let detectedUrl: string | undefined;

  const addMatch = (item?: CatalogItem) => {
    if (!item) return;
    foundById.set(item.id, item);
  };

  if (text.includes('http://') || text.includes('https://') || text.includes('?')) {
    try {
      const urlMatch = text.match(/https?:\/\/[^\s"'<>]+/i);
      const urlString = urlMatch
        ? urlMatch[0]
        : text.startsWith('?')
        ? `https://remnant2toolkit.com/${text}`
        : '';
      if (urlString) {
        detectedUrl = urlString;
        const url = new URL(urlString);
        url.searchParams.forEach((val) => {
          const tokens = val
            .split(/[,;|+]/)
            .map((s) => s.trim())
            .filter(Boolean);
          for (const tok of tokens) {
            const cleanTok = tok.split(':')[0].split(';')[0].trim();
            if (!cleanTok) continue;
            const byTk = lookup.byToolkitId.get(cleanTok.toLowerCase());
            if (byTk) {
              addMatch(byTk);
              continue;
            }
            const byId = lookup.byId.get(cleanTok.toLowerCase());
            if (byId) {
              addMatch(byId);
              continue;
            }
            const byName = lookup.byCleanName.get(cleanLookupKey(cleanTok));
            if (byName) {
              addMatch(byName);
            }
          }
        });
      }
    } catch {
      // Fallback to text token scanning below
    }
  }

  const segments = text
    .split(/[\r\n,;|\t]+/)
    .map((s) => s.replace(/^[-*•\d.)+\s]+/, '').trim())
    .filter((s) => s.length >= 2);

  for (const seg of segments) {
    const afterColon = seg.includes(':') ? seg.split(':').slice(1).join(':').trim() : seg;
    for (const candidate of [seg, afterColon]) {
      if (!candidate) continue;
      const byTk = lookup.byToolkitId.get(candidate.toLowerCase());
      if (byTk) {
        addMatch(byTk);
        continue;
      }
      const byId = lookup.byId.get(candidate.toLowerCase());
      if (byId) {
        addMatch(byId);
        continue;
      }
      const byName = lookup.byCleanName.get(cleanLookupKey(candidate));
      if (byName) {
        addMatch(byName);
      }
    }
  }

  if (foundById.size === 0 && text.length > 3) {
    const lowerText = text.toLowerCase();
    for (const item of catalog.items) {
      if (item.id.startsWith('Toolkit_')) continue;
      if (item.canonicalName.length >= 5 && lowerText.includes(item.canonicalName.toLowerCase())) {
        addMatch(item);
      } else if (item.nameEs.length >= 5 && lowerText.includes(item.nameEs.toLowerCase())) {
        addMatch(item);
      }
    }
  }

  const matchedItems = Array.from(foundById.values());

  const tagCounts = new Map<string, number>();
  for (const item of matchedItems) {
    for (const tag of item.synergyTags || []) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }

  const suggestedSynergyTags = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag]) => tag);

  return {
    matchedItems,
    suggestedSynergyTags,
    sourceUrl: detectedUrl,
  };
}
