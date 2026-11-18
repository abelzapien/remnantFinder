import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CornerUpLeft,
  Dices,
  DoorOpen,
  Eye,
  EyeOff,
  Flame,
  Footprints,
  Gem,
  GitBranch,
  Layers,
  Lock,
  MapPin,
  Moon,
  Navigation,
  Search,
  Sparkles,
  Store,
  Trophy,
} from 'lucide-react';
import {
  AppLanguage,
  CatalogPayload,
  CharacterDto,
  DoorLinkDto,
  EvaluatedLootItem,
  LocationDto,
  RolledWorldDto,
  UserBuildPresetDto,
  ZoneDto,
} from '../types';
import { CatalogLookup, evaluateRolledItem } from '../utils/buildPriorityEngine';
import { buildBossRushZoneDto } from '../utils/bossRushPool';
import {
  resolveDifficulty,
  resolveDoorTargetName,
  resolveLocationName,
  resolveParentLocationName,
  resolveWorldLocationHeader,
  resolveZoneName,
  resolveZoneStory,
} from '../utils/i18n';
import { translateUiTermEs } from '../utils/localizationEs';
import { ItemCard } from './ItemCard';

interface WorldExplorerViewProps {
  worldData: RolledWorldDto;
  character: CharacterDto;
  catalog: CatalogPayload | null;
  lookup: CatalogLookup;
  activePreset: UserBuildPresetDto;
  lang: AppLanguage;
  hideOwnedItems: boolean;
  onToggleHideOwned: () => void;
  onToggleWishlist: (itemId: string, toolkitId?: string | null, canonicalName?: string) => void;
}

interface EvaluatedLocation {
  location: LocationDto;
  specificItems: EvaluatedLootItem[];
  worldDropItems: EvaluatedLootItem[];
  visibleSpecificItems: EvaluatedLootItem[];
  visibleWorldDropItems: EvaluatedLootItem[];
  goldCount: number;
  purpleCount: number;
  greenCount: number;
  grayCount: number;
  specificGoldCount: number;
}

interface EvaluatedZone {
  zone: ZoneDto;
  locations: EvaluatedLocation[];
  goldCount: number;
  purpleCount: number;
  greenCount: number;
  grayCount: number;
}

export const WorldExplorerView: React.FC<WorldExplorerViewProps> = ({
  worldData,
  character,
  catalog,
  lookup,
  activePreset,
  lang,
  hideOwnedItems,
  onToggleHideOwned,
  onToggleWishlist,
}) => {
  const [selectedZoneIdx, setSelectedZoneIdx] = useState<number>(0);
  const [selectedLocationKey, setSelectedLocationKey] = useState<string>('__CURRENT__');
  const [sidebarSortMode, setSidebarSortMode] = useState<'proximity' | 'route'>('proximity');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'build' | 'missing'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedWorldDropsMap, setExpandedWorldDropsMap] = useState<Record<string, boolean>>({});

  // Build global Boss Rush Zone node cross-referenced against profile.sav
  const bossRushZone = useMemo(
    () => buildBossRushZoneDto(catalog, character),
    [catalog, character]
  );

  const combinedZones: ZoneDto[] = useMemo(() => {
    return bossRushZone ? [...worldData.zones, bossRushZone] : worldData.zones;
  }, [worldData.zones, bossRushZone]);

  // Auto-select the zone and dungeon where the player is currently located when world roll changes
  useEffect(() => {
    const playerZoneIndex = worldData.zones.findIndex((z) => z.isPlayerHere);
    const targetZoneIdx = playerZoneIndex >= 0 ? playerZoneIndex : 0;
    setSelectedZoneIdx(targetZoneIdx);

    const z = worldData.zones[targetZoneIdx];
    if (z) {
      const currentLoc = z.locations.find(
        (l) => l.isRespawnLocation || l.explorationStatus === 'Current'
      );
      if (currentLoc) {
        setSelectedLocationKey(currentLoc.name);
      } else if (z.locations.length > 0) {
        setSelectedLocationKey(z.locations[0].name);
      } else {
        setSelectedLocationKey('__ALL__');
      }
    }
  }, [
    worldData.mode,
    worldData.currentLocationName,
    worldData.respawnPointRawName,
    worldData.zones.length,
  ]);

  const sortEvaluated = (a: EvaluatedLootItem, b: EvaluatedLootItem) => {
    if (a.priorityRank !== b.priorityRank) return a.priorityRank - b.priorityRank;
    if (a.isWishlistMatch !== b.isWishlistMatch) return a.isWishlistMatch ? -1 : 1;
    if (a.matchedActiveTags.length !== b.matchedActiveTags.length) {
      return b.matchedActiveTags.length - a.matchedActiveTags.length;
    }
    const nameA = lang === 'en' ? a.rolled.canonicalName : a.rolled.nameEs;
    const nameB = lang === 'en' ? b.rolled.canonicalName : b.rolled.nameEs;
    return nameA.localeCompare(nameB);
  };

  // Evaluate all zones (including Boss Rush global node), locations, and items
  const evaluatedZones: EvaluatedZone[] = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const filterItem = (ev: EvaluatedLootItem, loc: LocationDto) => {
      if (hideOwnedItems && ev.priority === 'gray') return false;
      if (priorityFilter === 'build' && ev.priority !== 'gold' && ev.priority !== 'purple') {
        return false;
      }
      if (priorityFilter === 'missing' && ev.priority === 'gray') return false;
      if (!q) return true;

      const matchItem =
        ev.rolled.nameEs.toLowerCase().includes(q) ||
        ev.rolled.canonicalName.toLowerCase().includes(q) ||
        ev.rolled.originNameEs.toLowerCase().includes(q) ||
        ev.rolled.canonicalOriginName.toLowerCase().includes(q) ||
        ev.rolled.howToObtainNote.toLowerCase().includes(q) ||
        (ev.catalog?.descriptionEs || '').toLowerCase().includes(q) ||
        (ev.catalog?.howToObtainNoteEs || '').toLowerCase().includes(q) ||
        (ev.catalog?.description || '').toLowerCase().includes(q) ||
        ev.matchedActiveTags.some((t) => t.toLowerCase().includes(q));

      const matchLocation =
        loc.nameEs.toLowerCase().includes(q) || loc.name.toLowerCase().includes(q);

      return matchItem || matchLocation;
    };

    return combinedZones.map((zone) => {
      let zoneGold = 0;
      let zonePurple = 0;
      let zoneGreen = 0;
      let zoneGray = 0;

      const evalLocations: EvaluatedLocation[] = zone.locations.map((loc) => {
        const allEval = loc.items
          .map((item) =>
            evaluateRolledItem(item, lookup, character, activePreset, catalog, lang)
          )
          .sort(sortEvaluated);

        const specificItems = allEval.filter((ev) => ev.rolled.originType !== 'WorldDrop');
        const worldDropItems = allEval.filter((ev) => ev.rolled.originType === 'WorldDrop');

        let locGold = 0;
        let locPurple = 0;
        let locGreen = 0;
        let locGray = 0;
        let specificGold = 0;

        for (const ev of allEval) {
          if (ev.priority === 'gold') {
            locGold++;
            if (ev.rolled.originType !== 'WorldDrop') specificGold++;
          } else if (ev.priority === 'purple') locPurple++;
          else if (ev.priority === 'green') locGreen++;
          else locGray++;
        }

        zoneGold += locGold;
        zonePurple += locPurple;
        zoneGreen += locGreen;
        zoneGray += locGray;

        const visibleSpecificItems = specificItems.filter((ev) => filterItem(ev, loc));
        const visibleWorldDropItems = worldDropItems.filter((ev) => filterItem(ev, loc));

        return {
          location: loc,
          specificItems,
          worldDropItems,
          visibleSpecificItems,
          visibleWorldDropItems,
          goldCount: locGold,
          purpleCount: locPurple,
          greenCount: locGreen,
          grayCount: locGray,
          specificGoldCount: specificGold,
        };
      });

      return {
        zone,
        locations: evalLocations,
        goldCount: zoneGold,
        purpleCount: zonePurple,
        greenCount: zoneGreen,
        grayCount: zoneGray,
      };
    });
  }, [
    combinedZones,
    lookup,
    character,
    activePreset,
    catalog,
    lang,
    hideOwnedItems,
    priorityFilter,
    searchQuery,
  ]);

  const activeEvaluatedZone =
    evaluatedZones[selectedZoneIdx] || evaluatedZones[0] || null;
  const isBossRushActive = Boolean(activeEvaluatedZone?.zone.isBossRushNode);

  // Player's physical location inside the active biome
  const playerLocationInZone: LocationDto | null = useMemo(() => {
    if (!activeEvaluatedZone || activeEvaluatedZone.zone.isBossRushNode) return null;
    const found = activeEvaluatedZone.locations.find(
      (el) => el.location.isRespawnLocation || el.location.explorationStatus === 'Current'
    );
    return found ? found.location : null;
  }, [activeEvaluatedZone]);

  const adjacencyAnchorLocation: LocationDto | null = useMemo(() => {
    if (isBossRushActive) return null;
    if (playerLocationInZone) return playerLocationInZone;
    if (!activeEvaluatedZone || selectedLocationKey === '__ALL__') return null;
    return (
      activeEvaluatedZone.locations.find((el) => el.location.name === selectedLocationKey)
        ?.location || null
    );
  }, [isBossRushActive, playerLocationInZone, activeEvaluatedZone, selectedLocationKey]);

  const directDoorsFromPlayer = useMemo(() => {
    const map = new Map<string, DoorLinkDto>();
    if (!playerLocationInZone?.doorLinks) return map;
    for (const dl of playerLocationInZone.doorLinks) {
      map.set(dl.targetLocationName, dl);
      map.set(dl.targetLocationName.trim(), dl);
    }
    return map;
  }, [playerLocationInZone]);

  const directDoorsFromAnchor = useMemo(() => {
    const map = new Map<string, DoorLinkDto>();
    if (!adjacencyAnchorLocation?.doorLinks) return map;
    for (const dl of adjacencyAnchorLocation.doorLinks) {
      map.set(dl.targetLocationName, dl);
      map.set(dl.targetLocationName.trim(), dl);
    }
    return map;
  }, [adjacencyAnchorLocation]);

  const effectiveSortMode: 'proximity' | 'route' =
    sidebarSortMode === 'proximity' && playerLocationInZone !== null ? 'proximity' : 'route';

  const sidebarLocations = useMemo(() => {
    if (!activeEvaluatedZone) return [];
    const list = [...activeEvaluatedZone.locations];

    if (effectiveSortMode === 'route' || isBossRushActive) {
      return list.sort((a, b) => (a.location.routeOrder ?? 0) - (b.location.routeOrder ?? 0));
    }

    const insideDungeon =
      playerLocationInZone != null && playerLocationInZone.zoneRole !== 'Overworld';

    const getProximityBucket = (loc: LocationDto): [number, number, number] => {
      const isCurr = loc.isRespawnLocation || loc.explorationStatus === 'Current';
      if (isCurr) return [0, 0, loc.routeOrder ?? 0];

      const door =
        directDoorsFromPlayer.get(loc.name) || directDoorsFromPlayer.get(loc.name.trim());
      if (door) {
        if (insideDungeon) {
          const isExit =
            door.isExitToParent ||
            (loc.zoneRole === 'Overworld' &&
              (loc.levelMin ?? 0) <= (playerLocationInZone?.levelMin ?? 0));
          return [1, isExit ? 0 : 1, loc.routeOrder ?? 0];
        }
        if (door.isExitToParent) {
          return [1, 4, loc.routeOrder ?? 0];
        }
        const isPendingDoor = !loc.isVisited || !door.isUsed;
        if (isPendingDoor) {
          return [1, door.isMainPath ? 0 : 1, loc.routeOrder ?? 0];
        }
        return [1, door.isMainPath ? 2 : 3, loc.routeOrder ?? 0];
      }

      return [2, 0, loc.routeOrder ?? 0];
    };

    return list.sort((a, b) => {
      const [gA, sA, rA] = getProximityBucket(a.location);
      const [gB, sB, rB] = getProximityBucket(b.location);
      if (gA !== gB) return gA - gB;
      if (sA !== sB) return sA - sB;
      return rA - rB;
    });
  }, [
    activeEvaluatedZone,
    effectiveSortMode,
    isBossRushActive,
    playerLocationInZone,
    directDoorsFromPlayer,
  ]);

  const displayedLocations = useMemo(() => {
    if (!activeEvaluatedZone) return [];
    if (searchQuery.trim() || selectedLocationKey === '__ALL__') {
      const qLower = searchQuery.trim().toLowerCase();
      return sidebarLocations.filter((el) => {
        if (!qLower) return true;
        return (
          el.visibleSpecificItems.length > 0 ||
          el.visibleWorldDropItems.length > 0 ||
          el.location.nameEs.toLowerCase().includes(qLower) ||
          el.location.name.toLowerCase().includes(qLower)
        );
      });
    }
    const found = sidebarLocations.find((el) => el.location.name === selectedLocationKey);
    return found ? [found] : sidebarLocations.slice(0, 1);
  }, [activeEvaluatedZone, sidebarLocations, selectedLocationKey, searchQuery]);

  // Priority totals for top bar: shows Boss Rush totals when Boss Rush is active, otherwise current rolled world totals
  const bannerPriorityTotals = useMemo(() => {
    if (isBossRushActive && activeEvaluatedZone) {
      return {
        gold: activeEvaluatedZone.goldCount,
        purple: activeEvaluatedZone.purpleCount,
        green: activeEvaluatedZone.greenCount,
        gray: activeEvaluatedZone.grayCount,
      };
    }
    return evaluatedZones
      .filter((z) => !z.zone.isBossRushNode)
      .reduce(
        (acc, z) => {
          acc.gold += z.goldCount;
          acc.purple += z.purpleCount;
          acc.green += z.greenCount;
          acc.gray += z.grayCount;
          return acc;
        },
        { gold: 0, purple: 0, green: 0, gray: 0 }
      );
  }, [evaluatedZones, isBossRushActive, activeEvaluatedZone]);

  const toggleWorldDropsSection = (locName: string) => {
    setExpandedWorldDropsMap((prev) => ({
      ...prev,
      [locName]: !prev[locName],
    }));
  };

  const locHeader = resolveWorldLocationHeader(worldData, lang, catalog);
  const diffLabel = resolveDifficulty(worldData, lang);

  return (
    <div className="space-y-2.5">
      {/* 1. Compact Horizontal Current Location & Counters Bar (~60px) */}
      <div
        className={`bg-gradient-to-r rounded-xl px-3.5 py-2 flex flex-col xl:flex-row xl:items-center justify-between gap-2 shadow-md border ${
          isBossRushActive
            ? 'from-amber-950/45 via-[#131724] to-[#0f131e] border-amber-500/50'
            : 'from-[#121828] via-[#111623] to-[#0f131e] border-sky-500/40'
        }`}
      >
        {/* Left: Current Location (or Boss Rush Global Banner) */}
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {isBossRushActive ? (
            <>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-black uppercase bg-amber-400 text-slate-950 shrink-0">
                <Trophy className="w-3 h-3 stroke-[2.5]" /> Boss Rush
              </span>
              <span className="text-sm sm:text-base font-black text-white truncate">
                {lang === 'en'
                  ? 'Global Farmable Reward Pool'
                  : 'Pool Global de Recompensas Farmeables'}
              </span>
              <span className="text-xs text-slate-300 hidden md:inline">
                {lang === 'en'
                  ? '(World Drops from all biomes + Boss Streak Weapons/Mods, cross-checked against profile.sav)'
                  : '(World Drops globales + Armas/Mods de racha de jefes, cruzados con tu profile.sav)'}
              </span>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-black uppercase bg-sky-400 text-slate-950 shrink-0">
                <MapPin className="w-3 h-3 stroke-[2.5]" />{' '}
                {lang === 'en' ? 'Current Location' : 'Ubicación Actual'}
              </span>

              <span className="text-sm sm:text-base font-black text-white truncate">
                {locHeader.currentLocPrimary}
              </span>

              {locHeader.currentLocSecondary && (
                <span className="text-xs text-slate-400 hidden sm:inline">
                  ({locHeader.currentLocSecondary})
                </span>
              )}

              <span className="text-slate-600">•</span>

              <span className="px-2 py-0.5 rounded text-xs font-bold bg-indigo-500/20 text-indigo-200 border border-indigo-500/40">
                {locHeader.worldLabel} ({diffLabel})
              </span>

              {locHeader.respawnLabel && (
                <span className="text-xs text-sky-300 inline-flex items-center gap-1 truncate">
                  <Navigation className="w-3 h-3 shrink-0" />
                  <strong className="text-slate-200">{locHeader.respawnLabel}</strong>
                </span>
              )}
            </>
          )}
        </div>

        {/* Right: Compact Pill Counters + Quick Filters + [Hide Owned] */}
        <div className="flex items-center gap-1.5 flex-wrap shrink-0">
          {!isBossRushActive && (
            <span
              className="px-2 py-1 rounded-lg bg-[#0a0d14] border border-slate-800 text-[11px] font-bold text-slate-300"
              title={
                lang === 'en'
                  ? `${worldData.visitedLocationsCount} visited / ${worldData.pendingLocationsCount} undiscovered`
                  : `${worldData.visitedLocationsCount} visitadas / ${worldData.pendingLocationsCount} pendientes por descubrir`
              }
            >
              {lang === 'en' ? 'Zones:' : 'Zonas:'}{' '}
              <strong className="text-emerald-400">{worldData.visitedLocationsCount}</strong>/
              {worldData.totalLocationsCount}
            </span>
          )}

          <button
            type="button"
            onClick={() =>
              setPriorityFilter((prev) => (prev === 'build' ? 'all' : 'build'))
            }
            title={
              lang === 'en'
                ? 'Click to filter Gold + Purple Build Priority only'
                : 'Clic para filtrar solo Prioridad Oro + Morado'
            }
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-extrabold border cursor-pointer transition-colors ${
              priorityFilter === 'build'
                ? 'bg-amber-400 text-slate-950 border-amber-300'
                : 'bg-[#0a0d14] border-amber-500/50 text-amber-300 hover:bg-amber-500/15'
            }`}
          >
            <Award className="w-3 h-3" /> {lang === 'en' ? 'Gold' : 'Oro'}:{' '}
            {bannerPriorityTotals.gold}
          </button>

          <button
            type="button"
            onClick={() =>
              setPriorityFilter((prev) => (prev === 'build' ? 'all' : 'build'))
            }
            title={
              lang === 'en'
                ? 'Click to filter Gold + Purple Build Priority only'
                : 'Clic para filtrar solo Prioridad Oro + Morado'
            }
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold border cursor-pointer transition-colors ${
              priorityFilter === 'build'
                ? 'bg-purple-500 text-white border-purple-400'
                : 'bg-[#0a0d14] border-purple-500/50 text-purple-300 hover:bg-purple-500/15'
            }`}
          >
            <Sparkles className="w-3 h-3" /> {lang === 'en' ? 'Purple' : 'Morado'}:{' '}
            {bannerPriorityTotals.purple}
          </button>

          <button
            type="button"
            onClick={() =>
              setPriorityFilter((prev) => (prev === 'missing' ? 'all' : 'missing'))
            }
            title={
              lang === 'en'
                ? 'Click to filter unowned items only'
                : 'Clic para filtrar solo faltantes'
            }
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold border cursor-pointer transition-colors ${
              priorityFilter === 'missing'
                ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                : 'bg-[#0a0d14] border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/15'
            }`}
          >
            <Flame className="w-3 h-3" /> {lang === 'en' ? 'Green' : 'Verde'}:{' '}
            {bannerPriorityTotals.green}
          </button>

          {/* Compact Search Input */}
          <div className="relative w-44 sm:w-52">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                lang === 'en' ? 'Search item or zone...' : 'Buscar ítem o zona...'
              }
              className="w-full bg-[#090c12] border border-slate-700/80 rounded-lg pl-8 pr-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400"
            />
          </div>

          {/* Quick Toggle: Hide Owned */}
          <button
            type="button"
            onClick={onToggleHideOwned}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-extrabold transition-colors cursor-pointer ${
              hideOwnedItems
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700'
            }`}
          >
            {hideOwnedItems ? (
              <>
                <EyeOff className="w-3.5 h-3.5" />{' '}
                {lang === 'en' ? 'Hiding Owned' : 'Ocultando Obtenidos'}
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5" />{' '}
                {lang === 'en' ? 'Hide Owned' : 'Ocultar Obtenidos'}
              </>
            )}
          </button>
        </div>
      </div>

      {/* 2. Compact 1-Line World Biome & Global Boss Rush Selector Bar */}
      {evaluatedZones.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {evaluatedZones.map((ez, idx) => {
            const isSelected = idx === selectedZoneIdx;
            const z = ez.zone;
            const isBR = Boolean(z.isBossRushNode);
            const zName = resolveZoneName(z, lang, catalog);
            const zStory = resolveZoneStory(z, lang, catalog);

            return (
              <button
                key={`${z.name}_${idx}`}
                type="button"
                onClick={() => {
                  setSelectedZoneIdx(idx);
                  if (z.isBossRushNode) {
                    setSelectedLocationKey('__ALL__');
                  } else {
                    const curr = z.locations.find(
                      (l) => l.isRespawnLocation || l.explorationStatus === 'Current'
                    );
                    setSelectedLocationKey(
                      curr ? curr.name : z.locations[0]?.name || '__ALL__'
                    );
                  }
                }}
                className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-2 shrink-0 transition-all cursor-pointer ${
                  isSelected
                    ? isBR
                      ? 'bg-amber-950/80 border-amber-400 text-white shadow-xs'
                      : 'bg-sky-950/80 border-sky-400 text-white shadow-xs'
                    : isBR
                    ? 'bg-[#141218] border-amber-500/40 text-amber-200 hover:border-amber-400'
                    : 'bg-[#10141e] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                {isBR && <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                <span>{zName}</span>
                {zStory && zStory.toLowerCase() !== zName.toLowerCase() && !isBR && (
                  <span className="text-[10px] text-slate-400 font-normal">
                    ({zStory})
                  </span>
                )}
                {z.isPlayerHere && (
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-sky-400 text-slate-950">
                    📍 {lang === 'en' ? 'HERE' : 'AQUÍ'}
                  </span>
                )}
                {!isBR && (
                  <span className="text-[10px] text-emerald-400 font-mono">
                    {z.visitedLocations}/{z.totalLocations}
                  </span>
                )}
                {ez.goldCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-black bg-amber-400 text-slate-950">
                    🥇{ez.goldCount}
                  </span>
                )}
                {isBR && ez.purpleCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-purple-500/35 text-purple-100 border border-purple-400/50">
                    🟣{ez.purpleCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* 3. Main Tactical Split: Narrow Left Dungeon/Pool Selector + High-Density Right Loot List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
        {/* Left Sidebar */}
        <aside className="lg:col-span-3 xl:col-span-3 bg-[#0f131d] border border-slate-800/90 rounded-xl p-2 space-y-1.5">
          <div className="px-1.5 pb-1.5 flex items-center justify-between gap-1 border-b border-slate-800/80">
            <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider truncate">
              {isBossRushActive
                ? lang === 'en'
                  ? 'Boss Rush Pools'
                  : 'Categorías Boss Rush'
                : `${lang === 'en' ? 'Dungeons' : 'Mazmorras'} (${
                    activeEvaluatedZone?.zone.visitedLocations || 0
                  }/${activeEvaluatedZone?.zone.totalLocations || 0})`}
            </span>

            <div className="flex items-center gap-1 shrink-0">
              {!isBossRushActive &&
                activeEvaluatedZone &&
                activeEvaluatedZone.locations.length > 1 && (
                  <div className="inline-flex rounded-md bg-[#090c13] border border-slate-800 p-0.5">
                    {playerLocationInZone && (
                      <button
                        type="button"
                        onClick={() => setSidebarSortMode('proximity')}
                        title={
                          lang === 'en'
                            ? 'Sort placing your Current Location and directly walkable doors at the top'
                            : 'Ordenar poniendo arriba tu ubicación actual y las puertas directas desde donde estás'
                        }
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-0.5 cursor-pointer transition-colors ${
                          effectiveSortMode === 'proximity'
                            ? 'bg-amber-400 text-slate-950'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <DoorOpen className="w-3 h-3" />{' '}
                        {lang === 'en' ? 'Doors' : 'Puertas'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSidebarSortMode('route')}
                      title={
                        lang === 'en'
                          ? 'Sort following the world progression route (Overworld 1 + doors ➔ Connector ➔ Overworld 2 + doors ➔ Boss)'
                          : 'Ordenar siguiendo la ruta real del mundo (Zona Exterior 1 + puertas ➔ Conector ➔ Zona Exterior 2 + puertas ➔ Jefe)'
                      }
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-0.5 cursor-pointer transition-colors ${
                        effectiveSortMode === 'route'
                          ? 'bg-sky-400 text-slate-950'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <GitBranch className="w-3 h-3" />{' '}
                      {lang === 'en' ? 'Route' : 'Ruta'}
                    </button>
                  </div>
                )}

              <button
                type="button"
                onClick={() =>
                  setSelectedLocationKey((prev) =>
                    prev === '__ALL__'
                      ? sidebarLocations[0]?.location.name || '__ALL__'
                      : '__ALL__'
                  )
                }
                title={
                  lang === 'en'
                    ? 'Show all zones/pools together'
                    : 'Mostrar el loot de todas las zonas a la vez'
                }
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                  selectedLocationKey === '__ALL__'
                    ? 'bg-sky-500 text-slate-950'
                    : 'bg-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                <Layers className="w-3 h-3 inline mr-0.5" />
                {lang === 'en' ? 'All' : 'Todas'}
              </button>
            </div>
          </div>

          <div className="space-y-1 max-h-[calc(100vh-195px)] overflow-y-auto pr-0.5">
            {sidebarLocations.map((el, idx) => {
              const loc = el.location;
              const locTitle = resolveLocationName(loc, lang);
              const parentTitle = resolveParentLocationName(loc, lang);
              const isCurrent =
                loc.isRespawnLocation || loc.explorationStatus === 'Current';
              const isSelected =
                selectedLocationKey === loc.name && selectedLocationKey !== '__ALL__';

              const isAnchorCurrentPlayer = playerLocationInZone !== null;
              const isAnchorSelf =
                adjacencyAnchorLocation != null &&
                adjacencyAnchorLocation.name === loc.name;

              const directDoor = !isAnchorSelf
                ? directDoorsFromAnchor.get(loc.name) ||
                  directDoorsFromAnchor.get(loc.name.trim())
                : undefined;

              const anchorInsideDungeon =
                adjacencyAnchorLocation != null &&
                adjacencyAnchorLocation.zoneRole !== 'Overworld';

              const isExitOrConnectedParent =
                Boolean(directDoor) &&
                anchorInsideDungeon &&
                Boolean(
                  directDoor?.isExitToParent ||
                    (loc.zoneRole === 'Overworld' &&
                      (loc.levelMin ?? 0) <= (adjacencyAnchorLocation?.levelMin ?? 0))
                );

              // Section dividers
              let sectionHeaderLabel: string | null = null;
              if (sidebarLocations.length > 1) {
                if (!isBossRushActive && effectiveSortMode === 'proximity') {
                  const getProxSection = (itemLoc: LocationDto): 'curr' | 'doors' | 'other' => {
                    if (
                      itemLoc.isRespawnLocation ||
                      itemLoc.explorationStatus === 'Current'
                    ) {
                      return 'curr';
                    }
                    const d =
                      directDoorsFromPlayer.get(itemLoc.name) ||
                      directDoorsFromPlayer.get(itemLoc.name.trim());
                    return d ? 'doors' : 'other';
                  };
                  const currSec = getProxSection(loc);
                  const prevSec = idx > 0 ? getProxSection(sidebarLocations[idx - 1].location) : null;
                  if (currSec !== prevSec) {
                    if (currSec === 'doors') {
                      const doorCardsCount = sidebarLocations.filter(
                        (x) => getProxSection(x.location) === 'doors'
                      ).length;
                      sectionHeaderLabel = anchorInsideDungeon
                        ? lang === 'en'
                          ? `↩ Direct connection (${doorCardsCount})`
                          : `↩ Conexión directa (${doorCardsCount})`
                        : lang === 'en'
                        ? `🚪 Doors from here (${doorCardsCount})`
                        : `🚪 Puertas desde aquí (${doorCardsCount})`;
                    } else if (currSec === 'other') {
                      sectionHeaderLabel =
                        lang === 'en'
                          ? '🗺️ Other world zones'
                          : '🗺️ Otras zonas del mundo';
                    }
                  }
                } else {
                  const groupLabel =
                    lang === 'en'
                      ? loc.routeGroupLabelEn || loc.routeGroupLabelEs || ''
                      : loc.routeGroupLabelEs || '';
                  const prevLoc = idx > 0 ? sidebarLocations[idx - 1].location : null;
                  const prevGroupLabel = prevLoc
                    ? lang === 'en'
                      ? prevLoc.routeGroupLabelEn || prevLoc.routeGroupLabelEs || ''
                      : prevLoc.routeGroupLabelEs || ''
                    : '';
                  if (groupLabel && groupLabel !== prevGroupLabel) {
                    sectionHeaderLabel = groupLabel;
                  }
                }
              }

              const indentInRoute =
                !isBossRushActive &&
                effectiveSortMode === 'route' &&
                loc.zoneRole !== 'Overworld' &&
                loc.zoneRole !== 'WorldBoss' &&
                loc.zoneRole !== 'SharedEvent' &&
                loc.zoneRole !== 'Hub' &&
                Boolean(parentTitle) &&
                !(loc.routeGroupLabelEs || '').startsWith('⚔️');

              let cardClass =
                'bg-[#0b0e16] border-slate-800/80 text-slate-300 hover:bg-[#131824] hover:border-slate-700';
              if (isSelected) {
                cardClass = 'bg-sky-950/65 border-sky-400 text-white shadow-xs';
              } else if (isCurrent) {
                cardClass =
                  'bg-[#131b2e] border-sky-500/60 text-slate-100 hover:border-sky-400';
              } else if (directDoor) {
                if (isExitOrConnectedParent) {
                  cardClass =
                    'bg-emerald-950/25 border-emerald-500/55 text-slate-100 hover:border-emerald-400';
                } else if (directDoor.isMainPath) {
                  cardClass =
                    'bg-amber-950/20 border-amber-500/55 text-slate-100 hover:border-amber-400';
                } else {
                  cardClass =
                    'bg-cyan-950/20 border-cyan-500/50 text-slate-100 hover:border-cyan-400';
                }
              }

              // Build dynamic Line-2 indicator
              let line2Badge: React.ReactNode;
              if (isBossRushActive) {
                const missingInPool = el.goldCount + el.purpleCount + el.greenCount;
                line2Badge = (
                  <span className="text-slate-400 truncate">
                    {missingInPool > 0
                      ? lang === 'en'
                        ? `🎯 ${missingInPool} unowned / ${loc.items.length} total`
                        : `🎯 ${missingInPool} faltantes / ${loc.items.length} total`
                      : lang === 'en'
                      ? '✅ Complete (100% owned)'
                      : '✅ Completado (100% obtenidos)'}
                  </span>
                );
              } else if (isCurrent) {
                const doorTotal = loc.doorLinks?.length || 0;
                const roleHint =
                  loc.zoneRole === 'Overworld'
                    ? lang === 'en'
                      ? `Overworld ${loc.overworldIndex || ''}`.trim()
                      : `Zona Exterior ${loc.overworldIndex || ''}`.trim()
                    : parentTitle
                    ? `${lang === 'en' ? 'In' : 'En'}: ${parentTitle}`
                    : lang === 'en'
                    ? 'Active Zone'
                    : 'Zona Activa';
                line2Badge = (
                  <span className="text-sky-300 font-semibold truncate">
                    📍 {roleHint}
                    {doorTotal > 0
                      ? lang === 'en'
                        ? ` · ${doorTotal} door${doorTotal > 1 ? 's' : ''}`
                        : ` · ${doorTotal} puerta${doorTotal > 1 ? 's' : ''}`
                      : ''}
                  </span>
                );
              } else if (directDoor) {
                const doorCountSuffix =
                  directDoor.doorCount > 1 ? ` x${directDoor.doorCount}` : '';
                const crossedHint = directDoor.isUsed
                  ? lang === 'en'
                    ? '✓ Crossed'
                    : '✓ Ya cruzada'
                  : lang === 'en'
                  ? 'Uncrossed'
                  : 'Sin cruzar aún';
                const doorPrefix = isAnchorCurrentPlayer
                  ? lang === 'en'
                    ? 'Door here'
                    : 'Puerta aquí'
                  : lang === 'en'
                  ? 'Door'
                  : 'Puerta';
                const anchorName = adjacencyAnchorLocation
                  ? resolveLocationName(adjacencyAnchorLocation, lang)
                  : '';

                if (isExitOrConnectedParent) {
                  line2Badge = (
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/45 truncate"
                      title={
                        lang === 'en'
                          ? `Directly connected with ${anchorName} (${crossedHint})`
                          : `Conectada directamente con ${anchorName} (${crossedHint})`
                      }
                    >
                      <CornerUpLeft className="w-3 h-3 shrink-0" />
                      ↩ {lang === 'en' ? 'Connected / Exit' : 'Conectada / Salida'}
                      {doorCountSuffix}
                    </span>
                  );
                } else if (directDoor.isMainPath) {
                  const mainKind =
                    loc.zoneRole === 'WorldBoss'
                      ? lang === 'en'
                        ? 'Boss'
                        : 'Jefe'
                      : loc.zoneRole === 'Overworld' && directDoor.isExitToParent
                      ? lang === 'en'
                        ? `Overworld ${loc.overworldIndex || 1}`
                        : `Zona Ext. ${loc.overworldIndex || 1}`
                      : lang === 'en'
                      ? 'Main'
                      : 'Principal';
                  line2Badge = (
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/50 truncate"
                      title={
                        lang === 'en'
                          ? `Square Door (Main Path / Boss) from ${anchorName} · ${crossedHint}`
                          : `Puerta Cuadrada (Paso Principal / Jefe) desde ${anchorName} · ${crossedHint}`
                      }
                    >
                      🚪 {doorPrefix} · {mainKind}
                      {doorCountSuffix}
                      {directDoor.isUsed ? ' ✓' : ''}
                    </span>
                  );
                } else {
                  line2Badge = (
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-cyan-500/20 text-cyan-200 border border-cyan-500/45 truncate"
                      title={
                        lang === 'en'
                          ? `Arched Door (Optional Side Dungeon) from ${anchorName} · ${crossedHint}`
                          : `Puerta Arqueada (Mazmorra Secundaria / Opcional) desde ${anchorName} · ${crossedHint}`
                      }
                    >
                      🚪 {doorPrefix} · {lang === 'en' ? 'Optional' : 'Opcional'}
                      {doorCountSuffix}
                      {directDoor.isUsed ? ' ✓' : ''}
                    </span>
                  );
                }
              } else if (loc.zoneRole === 'SharedEvent') {
                line2Badge = (
                  <span className="text-slate-400 truncate">
                    🤝 {lang === 'en' ? 'Shared zone event' : 'Evento entre zonas'}
                  </span>
                );
              } else if (loc.zoneRole === 'Overworld') {
                line2Badge = (
                  <span className="text-slate-400 truncate">
                    🗺️ {lang === 'en' ? `Overworld ${loc.overworldIndex || 1}` : `Zona Ext. ${loc.overworldIndex || 1}`}
                    {parentTitle ? ` · ${lang === 'en' ? 'via' : 'vía'} ${parentTitle}` : ''}
                  </span>
                );
              } else if (parentTitle) {
                const doorShape = loc.isMainPathEntrance
                  ? lang === 'en'
                    ? 'Square'
                    : 'Cuadrada'
                  : lang === 'en'
                  ? 'Arched'
                  : 'Arqueada';
                line2Badge = (
                  <span
                    className="text-slate-400 truncate"
                    title={
                      lang === 'en'
                        ? `Entrance to ${locTitle} is in ${parentTitle} (${doorShape} Door)`
                        : `La puerta de entrada a ${locTitle} está en ${parentTitle} (Puerta ${doorShape})`
                    }
                  >
                    {lang === 'en' ? 'Entrance in:' : 'Entrada en:'}{' '}
                    <strong className="text-slate-300 font-semibold">{parentTitle}</strong> ·{' '}
                    {doorShape}
                  </span>
                );
              } else {
                line2Badge = (
                  <span className={loc.isVisited ? 'text-emerald-400/90' : 'text-amber-300/80'}>
                    {loc.isVisited
                      ? lang === 'en'
                        ? '✅ Visited'
                        : '✅ Visitada'
                      : lang === 'en'
                      ? '⏳ Undiscovered'
                      : '⏳ Pendiente'}
                  </span>
                );
              }

              return (
                <React.Fragment key={loc.name}>
                  {sectionHeaderLabel && (
                    <div className="pt-1.5 pb-0.5 px-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400/90 flex items-center gap-1">
                      <span className="truncate">{sectionHeaderLabel}</span>
                    </div>
                  )}

                  <div className={indentInRoute ? 'ml-2 pl-1.5 border-l-2 border-slate-800/90' : ''}>
                    <button
                      type="button"
                      onClick={() => setSelectedLocationKey(loc.name)}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer flex flex-col gap-1 ${cardClass}`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {isBossRushActive ? (
                            <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          ) : isCurrent ? (
                            <span
                              className="w-2 h-2 rounded-full bg-sky-400 shrink-0 animate-pulse"
                              title={lang === 'en' ? 'You are here' : 'Estás parado aquí'}
                            />
                          ) : loc.isVisited ? (
                            <span
                              className="shrink-0 inline-flex"
                              title={
                                lang === 'en'
                                  ? `Visited (${loc.visitedCoordinatesCount} coords)`
                                  : `Visitada (${loc.visitedCoordinatesCount} coords)`
                              }
                            >
                              <Footprints className="w-3.5 h-3.5 text-emerald-400" />
                            </span>
                          ) : (
                            <span
                              className="shrink-0 inline-flex"
                              title={lang === 'en' ? 'Undiscovered' : 'Pendiente por descubrir'}
                            >
                              <Lock className="w-3.5 h-3.5 text-amber-400/80" />
                            </span>
                          )}
                          <span className="text-xs font-bold truncate" title={locTitle}>
                            {locTitle}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0 text-[10px]">
                          {isCurrent && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-sky-400 text-slate-950">
                              {lang === 'en' ? 'HERE' : 'AQUÍ'}
                            </span>
                          )}
                          {el.goldCount > 0 && (
                            <span className="px-1 rounded bg-amber-400 text-slate-950 font-black">
                              🥇{el.goldCount}
                            </span>
                          )}
                          {el.purpleCount > 0 && (
                            <span className="px-1 rounded bg-purple-500/30 text-purple-200 font-bold">
                              🟣{el.purpleCount}
                            </span>
                          )}
                          {el.greenCount > 0 && (
                            <span className="px-1 rounded bg-emerald-500/25 text-emerald-300">
                              🟢{el.greenCount}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-1.5 text-[10px] pl-4 min-w-0">
                        <div className="min-w-0 flex-1 flex items-center">{line2Badge}</div>

                        {!isBossRushActive && el.specificItems.length > 0 && (
                          <span className="px-1 rounded bg-slate-800/90 text-slate-300 shrink-0">
                            {el.specificItems.length} {lang === 'en' ? 'fixed' : 'fijos'}
                          </span>
                        )}
                      </div>
                    </button>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </aside>

        {/* Right Main Area: High-Density Compressed Loot Rows (9 cols on lg) */}
        <div className="lg:col-span-9 xl:col-span-9 space-y-4">
          {displayedLocations.map((evalLoc, locIdx) => {
            const {
              location: loc,
              visibleSpecificItems,
              visibleWorldDropItems,
              goldCount,
              purpleCount,
              greenCount,
              grayCount,
            } = evalLoc;

            const locTitle = resolveLocationName(loc, lang);
            const locAltName =
              lang === 'es' &&
              loc.name.trim().toLowerCase() !== locTitle.toLowerCase() &&
              !isBossRushActive
                ? loc.name.trim()
                : null;

            const isCurrent =
              loc.isRespawnLocation || loc.explorationStatus === 'Current';
            const isWorldDropsExpanded = Boolean(expandedWorldDropsMap[loc.name]);

            const wdGold = visibleWorldDropItems.filter((x) => x.priority === 'gold').length;
            const wdPurple = visibleWorldDropItems.filter((x) => x.priority === 'purple').length;
            const wdGreen = visibleWorldDropItems.filter((x) => x.priority === 'green').length;
            const wdGray = visibleWorldDropItems.filter((x) => x.priority === 'gray').length;

            const vendorList =
              lang === 'en' && loc.vendorsEn ? loc.vendorsEn : loc.vendors;

            return (
              <section
                key={`${loc.name}_${locIdx}`}
                className={`rounded-xl border overflow-hidden ${
                  isBossRushActive
                    ? 'border-amber-500/45 bg-[#0e121b]'
                    : isCurrent
                    ? 'border-sky-400/80 bg-[#0e131f]'
                    : 'border-slate-800 bg-[#0e121b]'
                }`}
              >
                {/* Compact Zone Header Bar (~42px) */}
                <div
                  className={`px-3.5 py-2 border-b flex flex-wrap items-center justify-between gap-2 ${
                    isBossRushActive
                      ? 'bg-gradient-to-r from-amber-950/45 via-[#131724] to-[#0e121b] border-amber-500/35'
                      : isCurrent
                      ? 'bg-gradient-to-r from-sky-950/75 via-[#131c30] to-[#0e131f] border-sky-500/40'
                      : 'bg-[#121723] border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    {isBossRushActive ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-amber-400 text-slate-950 inline-flex items-center gap-1">
                        <Trophy className="w-3 h-3" /> BOSS RUSH
                      </span>
                    ) : isCurrent ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-sky-400 text-slate-950">
                        📍 {lang === 'en' ? 'YOU ARE HERE' : 'ESTÁS AQUÍ'}
                      </span>
                    ) : loc.isVisited ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        ✅{' '}
                        {lang === 'en'
                          ? `Visited (${loc.visitedCoordinatesCount} coords)`
                          : `Visitada (${loc.visitedCoordinatesCount} coords)`}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        ⏳ {lang === 'en' ? 'Undiscovered' : 'Pendiente por descubrir'}
                      </span>
                    )}

                    <h3 className="text-sm sm:text-base font-black text-white">
                      {locTitle}
                    </h3>
                    {locAltName && (
                      <span className="text-xs text-slate-400">({locAltName})</span>
                    )}

                    {loc.isTraitBookPresent && (
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                          loc.isTraitBookLooted
                            ? 'bg-slate-800/80 text-slate-400 border-slate-700'
                            : 'bg-sky-950/90 text-sky-300 border-sky-700/60'
                        }`}
                      >
                        <BookOpen className="w-3 h-3" />{' '}
                        {lang === 'en' ? 'Tome' : 'Tomo'}{' '}
                        {loc.isTraitBookLooted
                          ? '(✓)'
                          : lang === 'en'
                          ? '(Active!)'
                          : '(¡Activo!)'}
                      </span>
                    )}

                    {loc.isSimulacrumPresent && (
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                          loc.isSimulacrumLooted
                            ? 'bg-slate-800/80 text-slate-400 border-slate-700'
                            : 'bg-fuchsia-950/90 text-fuchsia-300 border-fuchsia-700/60'
                        }`}
                      >
                        <Gem className="w-3 h-3" />{' '}
                        {lang === 'en' ? 'Simulacrum' : 'Simulacro'}{' '}
                        {loc.isSimulacrumLooted
                          ? '(✓)'
                          : lang === 'en'
                          ? '(Active!)'
                          : '(¡Activo!)'}
                      </span>
                    )}

                    {loc.isBloodmoon && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-950/90 text-rose-300 border border-rose-700/60">
                        <Moon className="w-3 h-3" />{' '}
                        {lang === 'en' ? 'Blood Moon Altar' : 'Altar de Luna de Sangre'}
                      </span>
                    )}

                    {vendorList
                      .filter(
                        (v) =>
                          !(
                            loc.isBloodmoon &&
                            /blood\s*moon|luna\s*de\s*sangre/i.test(v)
                          )
                      )
                      .map((v) => (
                        <span
                          key={v}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-950/80 text-amber-200 border border-amber-700/50"
                        >
                          <Store className="w-3 h-3" />{' '}
                          {lang === 'en' ? v : translateUiTermEs(v, catalog)}
                        </span>
                      ))}
                  </div>

                  {/* Connections & Totals */}
                  <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                    {loc.doorLinks && loc.doorLinks.length > 0 ? (
                      <div className="flex items-center gap-1 flex-wrap">
                        {loc.doorLinks.map((dl) => {
                          const isExitFromDungeon =
                            loc.zoneRole !== 'Overworld' && dl.isExitToParent;
                          const pillClass = isExitFromDungeon
                            ? 'bg-emerald-950/70 text-emerald-300 border-emerald-500/45 hover:border-emerald-400'
                            : dl.isMainPath
                            ? 'bg-amber-950/60 text-amber-200 border-amber-500/45 hover:border-amber-400'
                            : 'bg-cyan-950/60 text-cyan-200 border-cyan-500/40 hover:border-cyan-400';
                          const doorTarget = resolveDoorTargetName(dl, lang);
                          const doorTypeHint = isExitFromDungeon
                            ? lang === 'en'
                              ? 'Exit / Parent Zone'
                              : 'Salida / Zona Padre'
                            : dl.isMainPath
                            ? lang === 'en'
                              ? 'Square Door (Main Path / Boss)'
                              : 'Puerta Cuadrada (Paso Principal / Jefe)'
                            : lang === 'en'
                            ? 'Arched Door (Optional Dungeon)'
                            : 'Puerta Arqueada (Mazmorra Opcional)';
                          const crossedTxt = dl.isUsed
                            ? lang === 'en'
                              ? '✓ Crossed'
                              : '✓ Ya cruzada'
                            : lang === 'en'
                            ? 'Uncrossed'
                            : 'Sin cruzar';
                          return (
                            <button
                              key={dl.targetLocationName}
                              type="button"
                              onClick={() => setSelectedLocationKey(dl.targetLocationName)}
                              title={`${
                                lang === 'en' ? 'Go to' : 'Ir a'
                              } ${doorTarget} · ${doorTypeHint} (${crossedTxt})`}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer inline-flex items-center gap-1 ${pillClass}`}
                            >
                              <span>
                                {isExitFromDungeon ? '↩' : dl.isMainPath ? '▣' : '⌒'}{' '}
                                {doorTarget}
                                {dl.doorCount > 1 ? ` x${dl.doorCount}` : ''}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      loc.connectionsEs.length > 0 && (
                        <span className="text-slate-400 hidden xl:inline truncate max-w-[260px]">
                          ↔{' '}
                          {(lang === 'en' ? loc.connections : loc.connectionsEs).join(
                            ' · '
                          )}
                        </span>
                      )
                    )}
                    {goldCount > 0 && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-400 text-slate-950">
                        🥇 {goldCount}
                      </span>
                    )}
                    {purpleCount > 0 && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/25 text-purple-200 border border-purple-400/50">
                        🟣 {purpleCount}
                      </span>
                    )}
                    {greenCount > 0 && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        🟢 {greenCount}
                      </span>
                    )}
                    {grayCount > 0 && (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400">
                        <CheckCircle2 className="w-3 h-3 inline mr-0.5" />
                        {grayCount}
                      </span>
                    )}
                  </div>
                </div>

                {/* Zone Loot Body */}
                <div className="p-2.5 space-y-2.5">
                  <div className="space-y-1">
                    <div className="px-1 flex items-center justify-between text-[11px] font-bold text-slate-300">
                      <span>
                        {isBossRushActive
                          ? lang === 'en'
                            ? `🏆 Eligible Boss Rush Rewards · ${locTitle} (${visibleSpecificItems.length} items)`
                            : `🏆 Recompensas Elegibles en Boss Rush · ${locTitle} (${visibleSpecificItems.length} ítems)`
                          : lang === 'en'
                          ? `🎯 Specific / Guaranteed Loot in ${locTitle} (${visibleSpecificItems.length} items)`
                          : `🎯 Loot Específico / Garantizado de ${locTitle} (${visibleSpecificItems.length} ítems)`}
                      </span>
                      <span className="text-[10px] text-slate-500 font-normal">
                        {lang === 'en'
                          ? 'Click any row to expand stats & acquisition guide'
                          : 'Clic en cualquier fila para desplegar estadísticas y guía paso a paso'}
                      </span>
                    </div>

                    {visibleSpecificItems.length === 0 ? (
                      <div className="py-3 px-3 rounded-lg bg-[#0b0e16] border border-slate-800/70 text-xs text-slate-400">
                        {evalLoc.specificItems.length === 0
                          ? lang === 'en'
                            ? 'This zone has no specific fixed/injectable rewards.'
                            : 'Esta zona no tiene recompensas fijas/inyectables pendientes.'
                          : lang === 'en'
                          ? 'All items in this pool have been obtained (hidden by your active filter).'
                          : 'Todos los objetos de esta lista ya fueron obtenidos (ocultos por tu filtro activo).'}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {visibleSpecificItems.map((evItem, idx) => (
                          <ItemCard
                            key={`spec_${evItem.rolled.id}_${evItem.rolled.originId}_${idx}`}
                            evaluated={evItem}
                            tagDefById={lookup.tagDefById}
                            catalogPayload={catalog}
                            lang={lang}
                            onToggleWishlist={onToggleWishlist}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* SECTION B: Collapsible Random World Drops Pool at the bottom of normal biomes */}
                  {visibleWorldDropItems.length > 0 && (
                    <div className="pt-1 border-t border-slate-800/80">
                      <button
                        type="button"
                        onClick={() => toggleWorldDropsSection(loc.name)}
                        className="w-full px-3 py-2 rounded-lg bg-[#0b0e16] hover:bg-[#111622] border border-slate-800 flex items-center justify-between gap-2 text-xs transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          {isWorldDropsExpanded ? (
                            <ChevronDown className="w-4 h-4 text-sky-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-400" />
                          )}
                          <Dices className="w-3.5 h-3.5 text-amber-400" />
                          <span className="font-bold text-slate-200">
                            {lang === 'en'
                              ? `Possible Random World Drops of ${loc.world} (${visibleWorldDropItems.length} biome pool items)`
                              : `Posibles World Drops Aleatorios de ${translateUiTermEs(
                                  loc.worldEs,
                                  catalog
                                )} (${visibleWorldDropItems.length} ítems del pool del bioma)`}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {wdGold > 0 && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-amber-400 text-slate-950">
                              🥇 {wdGold} {lang === 'en' ? 'Gold' : 'Oro'}
                            </span>
                          )}
                          {wdPurple > 0 && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/25 text-purple-200 border border-purple-400/50">
                              🟣 {wdPurple} {lang === 'en' ? 'Synergy' : 'Sinergia'}
                            </span>
                          )}
                          {wdGreen > 0 && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                              🟢 {wdGreen} {lang === 'en' ? 'New' : 'Nuevos'}
                            </span>
                          )}
                          {wdGray > 0 && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400">
                              ✓ {wdGray} {lang === 'en' ? 'Owned' : 'Obtenidos'}
                            </span>
                          )}
                          <span className="text-[11px] text-sky-400 font-semibold ml-1">
                            {isWorldDropsExpanded
                              ? lang === 'en'
                                ? 'Hide ▲'
                                : 'Ocultar ▲'
                              : lang === 'en'
                              ? 'Show ▼'
                              : 'Mostrar ▼'}
                          </span>
                        </div>
                      </button>

                      {isWorldDropsExpanded && (
                        <div className="mt-1.5 space-y-1 pl-2 border-l-2 border-slate-800">
                          {visibleWorldDropItems.map((evItem, idx) => (
                            <ItemCard
                              key={`wd_${evItem.rolled.id}_${idx}`}
                              evaluated={evItem}
                              tagDefById={lookup.tagDefById}
                              catalogPayload={catalog}
                              lang={lang}
                              onToggleWishlist={onToggleWishlist}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
};
