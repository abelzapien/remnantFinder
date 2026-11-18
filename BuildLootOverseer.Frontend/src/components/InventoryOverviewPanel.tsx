import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  Filter,
  Search,
  ShoppingBag,
  Star,
  XCircle,
} from 'lucide-react';
import {
  AppLanguage,
  CatalogItem,
  CatalogPayload,
  CharacterDto,
  UserBuildPresetDto,
} from '../types';
import { CatalogLookup, cleanLookupKey } from '../utils/buildPriorityEngine';
import { openExternalUrl, resolveTagLabel, resolveWorldCodeLabel } from '../utils/i18n';

interface InventoryOverviewPanelProps {
  character: CharacterDto;
  catalog: CatalogPayload | null;
  lookup: CatalogLookup;
  activePreset: UserBuildPresetDto;
  lang?: AppLanguage;
  onToggleWishlist: (itemId: string, toolkitId?: string | null, canonicalName?: string) => void;
}

const TRACKED_CATEGORIES = [
  { id: 'all', es: 'Todos los Coleccionables', en: 'All Collectibles' },
  { id: 'ring', es: 'Anillos', en: 'Rings' },
  { id: 'amulet', es: 'Amuletos', en: 'Amulets' },
  { id: 'weapon', es: 'Armas', en: 'Weapons' },
  { id: 'mutator', es: 'Mutadores', en: 'Mutators' },
  { id: 'relic', es: 'Reliquias', en: 'Relics' },
  { id: 'trait', es: 'Rasgos', en: 'Traits' },
  { id: 'mod', es: 'Modificadores', en: 'Mods' },
  { id: 'engram', es: 'Arquetipos / Engramas', en: 'Archetypes / Engrams' },
  { id: 'armor', es: 'Armaduras', en: 'Armor' },
];

export const InventoryOverviewPanel: React.FC<InventoryOverviewPanelProps> = ({
  character,
  catalog,
  lookup,
  activePreset,
  lang = 'es',
  onToggleWishlist,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [ownershipFilter, setOwnershipFilter] = useState<'all' | 'missing' | 'owned' | 'synergy'>('missing');
  const [search, setSearch] = useState('');

  const ownedSet = useMemo(() => {
    const s = new Set<string>();
    for (const id of character.acquiredItemIds) s.add(id.toLowerCase());
    for (const pid of character.acquiredProfileIds) s.add(pid.toLowerCase());
    return s;
  }, [character]);

  const wishlistSet = useMemo(() => {
    const s = new Set<string>();
    for (const id of activePreset.wishlistItemIds) s.add(id.toLowerCase());
    for (const tk of activePreset.wishlistToolkitIds) s.add(tk.toLowerCase());
    for (const nm of activePreset.wishlistItemNames) s.add(cleanLookupKey(nm));
    return s;
  }, [activePreset]);

  const activeTagsSet = useMemo(
    () => new Set(activePreset.activeSynergyTags),
    [activePreset.activeSynergyTags]
  );

  const trackableCatalogItems = useMemo(() => {
    if (!catalog) return [];
    const validTypes = new Set([
      'ring',
      'amulet',
      'weapon',
      'mutator',
      'relic',
      'trait',
      'mod',
      'engram',
      'armor',
    ]);
    return catalog.items.filter(
      (item) => !item.id.startsWith('Toolkit_') && validTypes.has(item.type)
    );
  }, [catalog]);

  const categoryStats = useMemo(() => {
    const stats: Record<string, { owned: number; total: number }> = {};
    for (const cat of TRACKED_CATEGORIES) {
      stats[cat.id] = { owned: 0, total: 0 };
    }
    for (const item of trackableCatalogItems) {
      const isOwned =
        ownedSet.has(item.id.toLowerCase()) ||
        (item.profileId && ownedSet.has(item.profileId.toLowerCase()));
      stats.all.total++;
      if (isOwned) stats.all.owned++;
      if (stats[item.type]) {
        stats[item.type].total++;
        if (isOwned) stats[item.type].owned++;
      }
    }
    return stats;
  }, [trackableCatalogItems, ownedSet]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return trackableCatalogItems
      .filter((item) => {
        if (selectedCategory !== 'all' && item.type !== selectedCategory) return false;
        const isOwned =
          ownedSet.has(item.id.toLowerCase()) ||
          (item.profileId && ownedSet.has(item.profileId.toLowerCase()));
        if (ownershipFilter === 'owned' && !isOwned) return false;
        if (ownershipFilter === 'missing' && isOwned) return false;

        const hasSynergy =
          item.synergyTags.some((t) => activeTagsSet.has(t)) ||
          wishlistSet.has(item.id.toLowerCase()) ||
          (item.toolkitId && wishlistSet.has(item.toolkitId.toLowerCase()));

        if (ownershipFilter === 'synergy' && (isOwned || !hasSynergy)) return false;

        if (!q) return true;
        return (
          item.nameEs.toLowerCase().includes(q) ||
          item.canonicalName.toLowerCase().includes(q) ||
          (item.descriptionEs || '').toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          (item.world && item.world.toLowerCase().includes(q)) ||
          (item.howToObtainNoteEs || '').toLowerCase().includes(q) ||
          item.howToObtainNote.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const aWish = wishlistSet.has(a.id.toLowerCase()) ? 1 : 0;
        const bWish = wishlistSet.has(b.id.toLowerCase()) ? 1 : 0;
        if (aWish !== bWish) return bWish - aWish;
        const aSyn = a.synergyTags.filter((t) => activeTagsSet.has(t)).length;
        const bSyn = b.synergyTags.filter((t) => activeTagsSet.has(t)).length;
        if (aSyn !== bSyn) return bSyn - aSyn;
        const nA = lang === 'en' ? a.canonicalName : a.nameEs;
        const nB = lang === 'en' ? b.canonicalName : b.nameEs;
        return nA.localeCompare(nB);
      });
  }, [
    trackableCatalogItems,
    selectedCategory,
    ownershipFilter,
    ownedSet,
    activeTagsSet,
    wishlistSet,
    search,
    lang,
  ]);

  return (
    <div className="space-y-5">
      {/* Category Progress Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {TRACKED_CATEGORIES.map((cat) => {
          const st = categoryStats[cat.id] || { owned: 0, total: 0 };
          const pct = st.total > 0 ? Math.round((st.owned / st.total) * 100) : 0;
          const active = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                active
                  ? 'bg-sky-950/50 border-sky-400 text-white shadow-sm'
                  : 'bg-[#111520] border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="truncate">{lang === 'en' ? cat.en : cat.es}</span>
                <span className="text-sky-400 font-mono">{pct}%</span>
              </div>
              <div className="mt-1.5 flex items-baseline justify-between text-[11px] text-slate-400">
                <span>
                  <strong className="text-emerald-400">{st.owned}</strong>{' '}
                  {lang === 'en' ? 'owned' : 'obtenidos'}
                </span>
                <span>
                  {st.total - st.owned} {lang === 'en' ? 'missing' : 'faltantes'}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-sky-500 to-emerald-400 rounded-full"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>

      {/* Cass Shop Banner */}
      {character.cassShop && character.cassShop.length > 0 && (
        <div className="bg-gradient-to-r from-amber-950/35 via-[#131722] to-[#111520] border border-amber-500/40 rounded-2xl p-4 space-y-2.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-bold text-amber-300 flex items-center gap-2">
              <ShoppingBag className="w-4 h-4" />
              {lang === 'en'
                ? "Current Stock in Cass's Shop (Ward 13)"
                : 'Inventario Actual en la Tienda de Cass (Base 13)'}
            </h3>
            <span className="text-xs text-slate-400">
              {lang === 'en'
                ? 'Detected directly from your save file'
                : 'Detectado directamente desde tu archivo de guardado'}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {character.cassShop.map((cassItem) => {
              const cassLabel = lang === 'en' ? cassItem.name : cassItem.nameEs;
              return (
                <span
                  key={cassItem.id}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${
                    cassItem.isOwned
                      ? 'bg-slate-900/80 border-slate-800 text-slate-400'
                      : 'bg-amber-500/20 border-amber-400 text-amber-200 font-bold'
                  }`}
                >
                  {cassItem.isOwned
                    ? '✓ '
                    : lang === 'en'
                    ? '🛒 NEW! '
                    : '🛒 ¡NUEVO! '}
                  {cassLabel}
                  <span className="text-[10px] opacity-75">({cassItem.type})</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-[#111520] border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <button
            type="button"
            onClick={() => setOwnershipFilter('missing')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
              ownershipFilter === 'missing'
                ? 'bg-rose-500/25 border border-rose-400 text-rose-200'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {lang === 'en' ? 'Missing in profile.sav' : 'Faltantes en profile.sav'}
          </button>
          <button
            type="button"
            onClick={() => setOwnershipFilter('synergy')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
              ownershipFilter === 'synergy'
                ? 'bg-amber-500/25 border border-amber-400 text-amber-200'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            ⚡{' '}
            {lang === 'en'
              ? 'Missing with Build Synergy'
              : 'Faltantes con Sinergia de Build'}
          </button>
          <button
            type="button"
            onClick={() => setOwnershipFilter('owned')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
              ownershipFilter === 'owned'
                ? 'bg-emerald-500/25 border border-emerald-400 text-emerald-200'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            ✓ {lang === 'en' ? 'Owned' : 'Ya Obtenidos'}
          </button>
          <button
            type="button"
            onClick={() => setOwnershipFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
              ownershipFilter === 'all'
                ? 'bg-sky-500/25 border border-sky-400 text-sky-200'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {lang === 'en' ? 'All' : 'Todos'}
          </button>
        </div>

        <div className="relative min-w-[260px]">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              lang === 'en'
                ? 'Filter by name, world, or how to get...'
                : 'Filtrar por nombre, mundo o requisito...'
            }
            className="w-full bg-[#0b0e16] border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400"
          />
        </div>
      </div>

      {/* Results Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
        {filteredItems.slice(0, 120).map((item: CatalogItem) => {
          const isOwned =
            ownedSet.has(item.id.toLowerCase()) ||
            (item.profileId && ownedSet.has(item.profileId.toLowerCase()));
          const inWishlist =
            wishlistSet.has(item.id.toLowerCase()) ||
            (item.toolkitId ? wishlistSet.has(item.toolkitId.toLowerCase()) : false);
          const matchedTags = item.synergyTags.filter((t) => activeTagsSet.has(t));

          const primaryTitle = lang === 'en' ? item.canonicalName : item.nameEs;
          const secondaryTitle =
            lang === 'es' && item.canonicalName !== item.nameEs
              ? item.canonicalName
              : null;
          const itemDesc =
            lang === 'en'
              ? item.description || item.descriptionEs
              : item.descriptionEs || item.description;
          const itemHowTo =
            lang === 'en'
              ? item.howToObtainNote || item.howToObtainNoteEs
              : item.howToObtainNoteEs || item.howToObtainNote;

          return (
            <div
              key={item.id}
              className={`rounded-xl p-4 border flex flex-col justify-between gap-3 ${
                inWishlist && !isOwned
                  ? 'border-amber-400/80 bg-amber-950/20'
                  : matchedTags.length > 0 && !isOwned
                  ? 'border-purple-500/50 bg-purple-950/15'
                  : isOwned
                  ? 'border-slate-800 bg-[#0d1017]/80 opacity-75'
                  : 'border-slate-800 bg-[#111520]'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold ${
                      isOwned
                        ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/50'
                        : 'bg-rose-950/80 text-rose-300 border border-rose-700/50'
                    }`}
                  >
                    {isOwned ? (
                      <>
                        <CheckCircle2 className="w-3 h-3" />{' '}
                        {lang === 'en' ? 'Owned' : 'En Inventario'}
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3 h-3" />{' '}
                        {lang === 'en' ? 'Missing' : 'Faltante'}
                      </>
                    )}
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      onToggleWishlist(item.id, item.toolkitId, item.canonicalName)
                    }
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold cursor-pointer ${
                      inWishlist
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-800 text-slate-300 hover:text-white'
                    }`}
                  >
                    <Star className={`w-3 h-3 ${inWishlist ? 'fill-slate-950' : ''}`} />
                    {inWishlist
                      ? lang === 'en'
                        ? 'Wishlisted'
                        : 'En Wishlist'
                      : '+ Wishlist'}
                  </button>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-white">
                    {primaryTitle}{' '}
                    {secondaryTitle && (
                      <span className="text-xs font-normal text-slate-400">
                        ({secondaryTitle})
                      </span>
                    )}
                  </h4>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    <span className="px-2 py-0.5 rounded text-[10px] uppercase bg-indigo-950/80 text-indigo-300 border border-indigo-800/50">
                      {item.type}
                    </span>
                    {item.world && (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300">
                        🌍 {resolveWorldCodeLabel(item.world, lang)}
                      </span>
                    )}
                  </div>
                </div>

                {itemDesc && (
                  <p className="text-xs text-slate-300 bg-[#090b10] border border-slate-800/80 rounded-lg p-2 whitespace-pre-line">
                    {itemDesc}
                  </p>
                )}

                {item.synergyTags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {item.synergyTags.map((t) => {
                      const active = matchedTags.includes(t);
                      const label = resolveTagLabel(lookup.tagDefById.get(t), t, lang);
                      return (
                        <span
                          key={t}
                          className={`px-2 py-0.5 rounded-full text-[10px] ${
                            active
                              ? 'bg-amber-500/25 text-amber-200 border border-amber-400/60 font-semibold'
                              : 'bg-slate-800/80 text-slate-400'
                          }`}
                        >
                          {active ? '⚡ ' : ''}
                          {label}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-slate-800/80 text-xs text-slate-400 space-y-1">
                {itemHowTo && (
                  <p className="text-slate-300 leading-relaxed">
                    <strong className="text-sky-300">
                      {lang === 'en' ? 'How to obtain:' : 'Obtención:'}
                    </strong>{' '}
                    {itemHowTo}
                  </p>
                )}
                <div className="flex items-center justify-between pt-1 text-[11px]">
                  <span className="font-mono text-slate-500">{item.id}</span>
                  {item.wikiLink && (
                    <button
                      type="button"
                      onClick={() => openExternalUrl(item.wikiLink)}
                      className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 cursor-pointer"
                    >
                      Wiki <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
