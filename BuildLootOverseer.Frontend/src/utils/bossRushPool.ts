import {
  CatalogItem,
  CatalogPayload,
  CharacterDto,
  LocationDto,
  RolledItemDto,
  ZoneDto,
} from '../types';
import { resolveWorldCodeLabel } from './i18n';

const BOSS_RUSH_PRISM_IDS = new Set([
  'prismofhatred',
  'prismofpassion',
  'prismofpride',
]);

const EXTRA_BOSS_WEAPON_MOD_IDS = new Set([
  'weapon_alphaomega',
  'weapon_cubegun',
  'mod_defrag',
  'mod_skewer',
]);

const BOSS_REF_LABELS: Record<string, { es: string; en: string }> = {
  Quest_Boss_Faelin: { es: 'Faelin (Losomn)', en: 'Faelin (Losomn)' },
  Quest_Boss_Faerlin: { es: 'Faerin (Losomn)', en: 'Faerin (Losomn)' },
  Quest_Boss_NightWeaver: { es: 'La Tejenoches (Losomn)', en: 'Nightweaver (Losomn)' },
  Quest_Boss_OneTrueKing: {
    es: 'El Único Rey Verdadero (Losomn)',
    en: 'The One True King (Losomn)',
  },
  Quest_Boss_Ravager: { es: 'Devastador Corrupto (Yaesha)', en: 'Corrupted Ravager (Yaesha)' },
  Quest_Boss_ManyFaces: { es: 'Corruptor (Yaesha)', en: 'Corruptor (Yaesha)' },
  Quest_Boss_Lydusa: { es: 'Lydusa (Yaesha)', en: 'Lydusa (Yaesha)' },
  Quest_Boss_TalRatha: { es: "Tal'Ratha (N'Erud)", en: "Tal'Ratha (N'Erud)" },
  Quest_Boss_NerudGuardian: { es: "Sha'Hala (N'Erud)", en: "Sha'Hala (N'Erud)" },
  Quest_Boss_AlepsisTaura: { es: "Alepsis-Taura (N'Erud)", en: "Alepsis-Taura (N'Erud)" },
  Quest_RootEarth_TowerBoss: {
    es: 'Aniquilación (Tierra de Raíz)',
    en: 'Annihilation (Root Earth)',
  },
  Quest_RootEarth_Zone1: { es: 'Cancer (Tierra de Raíz)', en: 'Cancer (Root Earth)' },
  Quest_RootEarth_Zone2: { es: 'Venom (Tierra de Raíz)', en: 'Venom (Root Earth)' },
};

type BossRushBucketKey =
  | 'boss_streaks'
  | 'wd_yaesha'
  | 'wd_losomn'
  | 'wd_nerud'
  | 'aberration_mutators';

function classifyBossRushBucket(item: CatalogItem): BossRushBucketKey | null {
  if (item.id.startsWith('Toolkit_')) return null;
  if (item.isCoop || item.isAccountAward) return null;

  const idLower = item.id.toLowerCase();
  const isBossRushPrism = BOSS_RUSH_PRISM_IDS.has(idLower);

  // Exclude items gated behind fixed puzzles, quest chains, or wearing specific gear
  if (item.prerequisite && !isBossRushPrism) {
    return null;
  }

  // 1. Boss Rush Milestone Prisms
  if (isBossRushPrism) {
    return 'boss_streaks';
  }

  // 2. Global World Drops (Rings & Amulets across all 6 Base + DLC biomes)
  if (item.dropType === 'World' && (item.type === 'ring' || item.type === 'amulet')) {
    if (item.world === 'World_Jungle' || item.world === 'World_DLC2') return 'wd_yaesha';
    if (item.world === 'World_Fae' || item.world === 'World_DLC1') return 'wd_losomn';
    if (item.world === 'World_Nerud' || item.world === 'World_DLC3') return 'wd_nerud';
    return 'wd_yaesha';
  }

  // 3. Random Aberration Mutators (Global pool)
  if (item.dropType === 'Global' && item.type === 'mutator') {
    return 'aberration_mutators';
  }

  // 4. Eligible World Boss & Miniboss Weapons and Mods awarded on Boss Rush streaks (7 / 19 bosses)
  if (item.type === 'weapon' || item.type === 'mod') {
    if (EXTRA_BOSS_WEAPON_MOD_IDS.has(idLower)) {
      return 'boss_streaks';
    }
    const ref = item.dropReference || '';
    if (
      item.dropType === 'Event' &&
      (ref.startsWith('Quest_Boss_') || ref.startsWith('Quest_Miniboss_'))
    ) {
      return 'boss_streaks';
    }
  }

  return null;
}

function mapCatalogToBossRushRolledItem(
  item: CatalogItem,
  bucket: BossRushBucketKey,
  ownedSet: Set<string>,
  hasMatSet: Set<string>,
  cassSet: Set<string>
): RolledItemDto {
  const idLower = item.id.toLowerCase();
  const isOwned =
    ownedSet.has(idLower) ||
    Boolean(item.profileId && ownedSet.has(item.profileId.toLowerCase()));

  let originType = 'BossRushWorldDrop';
  let originNameEn = resolveWorldCodeLabel(item.world, 'en');
  let originNameEs = resolveWorldCodeLabel(item.world, 'es');

  if (BOSS_RUSH_PRISM_IDS.has(idLower)) {
    originType = 'Boss';
    originNameEn = 'Boss Rush Milestone';
    originNameEs = 'Hito de Boss Rush';
  } else if (bucket === 'aberration_mutators') {
    originType = 'Enemy';
    originNameEn = 'Random Aberration';
    originNameEs = 'Aberración Aleatoria';
  } else if (bucket === 'boss_streaks') {
    const ref = item.dropReference || '';
    if (ref.startsWith('Quest_Miniboss_')) {
      originType = 'Miniboss';
      const cleanMb = ref.replace('Quest_Miniboss_', '').replace(/([A-Z])/g, ' $1').trim();
      originNameEn = `Boss Streak · ${cleanMb}`;
      originNameEs = `Racha Jefe · ${cleanMb}`;
    } else {
      originType = 'Boss';
      const bossEntry = BOSS_REF_LABELS[ref];
      if (bossEntry) {
        originNameEn = bossEntry.en;
        originNameEs = bossEntry.es;
      } else if (idLower === 'weapon_cubegun') {
        originNameEn = 'Labyrinth Sentinel';
        originNameEs = 'Centinela del Laberinto';
      } else {
        originNameEn = 'World Boss Streak';
        originNameEs = 'Racha Jefe de Mundo';
      }
    }
  }

  return {
    id: item.id,
    profileId: item.profileId || '',
    canonicalName: item.canonicalName,
    nameEs: item.nameEs || item.canonicalName,
    type: item.type,
    weaponSubtype: item.subtype || null,
    originType,
    originId: item.dropReference || 'BossRush',
    canonicalOriginName: originNameEn,
    originNameEs,
    howToObtainNote: item.howToObtainNote || '',
    prerequisiteRaw: null,
    materialId: item.materialId || null,
    isOwned,
    isLootedInWorld: false,
    isPrerequisiteMissing: false,
    hasRequiredMaterial: hasMatSet.has(idLower),
    isCoop: false,
    isAccountAward: false,
    isInCassShop: cassSet.has(idLower),
  };
}

export function buildBossRushZoneDto(
  catalog: CatalogPayload | null,
  character: CharacterDto | null
): ZoneDto | null {
  if (!catalog || !character) return null;

  const ownedSet = new Set<string>();
  for (const id of character.acquiredItemIds || []) ownedSet.add(id.toLowerCase());
  for (const pid of character.acquiredProfileIds || []) ownedSet.add(pid.toLowerCase());

  const hasMatSet = new Set<string>(
    (character.hasRequiredMaterialItemIds || []).map((x) => x.toLowerCase())
  );
  const cassSet = new Set<string>(
    (character.cassShop || []).map((c) => c.id.toLowerCase())
  );

  const buckets: Record<BossRushBucketKey, RolledItemDto[]> = {
    boss_streaks: [],
    wd_yaesha: [],
    wd_losomn: [],
    wd_nerud: [],
    aberration_mutators: [],
  };

  for (const item of catalog.items) {
    const bucket = classifyBossRushBucket(item);
    if (!bucket) continue;
    buckets[bucket].push(
      mapCatalogToBossRushRolledItem(item, bucket, ownedSet, hasMatSet, cassSet)
    );
  }

  const bucketDefs: Array<{
    key: BossRushBucketKey;
    nameEn: string;
    nameEs: string;
    groupEn: string;
    groupEs: string;
  }> = [
    {
      key: 'boss_streaks',
      nameEn: 'Boss Weapons, Mods & Prisms (Streaks)',
      nameEs: 'Armas, Mods de Jefes y Prismas (Rachas)',
      groupEn: '🏆 Streak Completion Rewards (7 / 19 Bosses)',
      groupEs: '🏆 Recompensas de Racha (7 / 19 Jefes)',
    },
    {
      key: 'wd_yaesha',
      nameEn: 'World Drops · Yaesha (Base + DLC)',
      nameEs: 'World Drops · Yaesha (Base + DLC)',
      groupEn: '🌍 Global Biome World Drops',
      groupEs: '🌍 World Drops Globales por Bioma',
    },
    {
      key: 'wd_losomn',
      nameEn: 'World Drops · Losomn (Base + DLC)',
      nameEs: 'World Drops · Losomn (Base + DLC)',
      groupEn: '🌍 Global Biome World Drops',
      groupEs: '🌍 World Drops Globales por Bioma',
    },
    {
      key: 'wd_nerud',
      nameEn: "World Drops · N'Erud (Base + DLC)",
      nameEs: "World Drops · N'Erud (Base + DLC)",
      groupEn: '🌍 Global Biome World Drops',
      groupEs: '🌍 World Drops Globales por Bioma',
    },
    {
      key: 'aberration_mutators',
      nameEn: 'Aberration Mutators (Global)',
      nameEs: 'Mutadores de Aberración (Global)',
      groupEn: '⚡ Aberration Drops',
      groupEs: '⚡ Drops de Aberración',
    },
  ];

  const locations: LocationDto[] = bucketDefs
    .filter((def) => buckets[def.key].length > 0)
    .map((def, index) => {
      const items = buckets[def.key];
      const allOwned = items.length > 0 && items.every((i) => i.isOwned);
      return {
        name: def.nameEn,
        nameEs: def.nameEs,
        world: 'Boss Rush',
        worldEs: 'Boss Rush',
        explorationStatus: allOwned ? 'Visited' : 'Undiscovered',
        isVisited: allOwned,
        visitedCoordinatesCount: 0,
        isRespawnLocation: false,
        respawnPointType: 'None',
        respawnPointName: null,
        respawnPointFormatted: null,
        zoneRole: 'BossRush',
        overworldIndex: 0,
        parentLocationName: null,
        parentLocationNameEs: null,
        isMainPathEntrance: def.key === 'boss_streaks',
        levelMin: index + 1,
        routeOrder: index,
        routeGroupLabelEs: def.groupEs,
        routeGroupLabelEn: def.groupEn,
        doorLinks: [],
        worldStones: [],
        connections: [],
        connectionsEs: [],
        isTraitBookPresent: false,
        isTraitBookLooted: false,
        isSimulacrumPresent: false,
        isSimulacrumLooted: false,
        isBloodmoon: false,
        vendors: [],
        vendorsEn: [],
        items,
      };
    });

  const completedPools = locations.filter((l) => l.isVisited).length;

  return {
    name: 'Boss Rush',
    nameEs: 'Boss Rush',
    story: 'Global Reward Pool',
    storyEs: 'Pool Global',
    isFinished: completedPools === locations.length && locations.length > 0,
    isPlayerHere: false,
    totalLocations: locations.length,
    visitedLocations: completedPools,
    pendingLocations: locations.length - completedPools,
    isBossRushNode: true,
    locations,
  };
}
