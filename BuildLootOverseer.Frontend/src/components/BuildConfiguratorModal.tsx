import React, { useMemo, useState } from 'react';
import {
  Check,
  ClipboardPaste,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import {
  AppLanguage,
  CatalogItem,
  CatalogPayload,
  CharacterDto,
  SynergyTagDefinition,
  UserAppConfigDto,
  UserBuildPresetDto,
} from '../types';
import {
  CatalogLookup,
  cleanLookupKey,
  parseBuildImportInput,
} from '../utils/buildPriorityEngine';
import { resolveCharacterSummary, resolveTagLabel } from '../utils/i18n';

interface BuildConfiguratorPanelProps {
  config: UserAppConfigDto;
  activePreset: UserBuildPresetDto;
  catalog: CatalogPayload | null;
  lookup: CatalogLookup;
  activeCharacter: CharacterDto | null;
  lang?: AppLanguage;
  onUpdateConfig: (nextConfig: UserAppConfigDto) => void;
}

export const BuildConfiguratorPanel: React.FC<BuildConfiguratorPanelProps> = ({
  config,
  activePreset,
  catalog,
  lookup,
  activeCharacter,
  lang = 'es',
  onUpdateConfig,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [importText, setImportText] = useState('');
  const [importFeedback, setImportFeedback] = useState<string | null>(null);
  const [newBuildName, setNewBuildName] = useState('');

  const ownedIdSet = useMemo(() => {
    const s = new Set<string>();
    for (const id of activeCharacter?.acquiredItemIds || []) s.add(id.toLowerCase());
    for (const pid of activeCharacter?.acquiredProfileIds || []) s.add(pid.toLowerCase());
    return s;
  }, [activeCharacter]);

  const updateActivePreset = (
    updater: (preset: UserBuildPresetDto) => UserBuildPresetDto
  ) => {
    const nextBuilds = config.builds.map((b) =>
      b.id === activePreset.id ? updater({ ...b }) : b
    );
    onUpdateConfig({ ...config, builds: nextBuilds });
  };

  const handleToggleSynergyTag = (tagId: string) => {
    updateActivePreset((preset) => {
      const exists = preset.activeSynergyTags.includes(tagId);
      const nextTags = exists
        ? preset.activeSynergyTags.filter((t) => t !== tagId)
        : [...preset.activeSynergyTags, tagId];
      return { ...preset, activeSynergyTags: nextTags };
    });
  };

  const handleAutoSuggestFromArchetypes = () => {
    if (!activeCharacter || !catalog) return;
    const map = catalog.archetypeSynergyMap || {};
    const suggested = new Set<string>();
    if (activeCharacter.primaryArchetype && map[activeCharacter.primaryArchetype]) {
      for (const t of map[activeCharacter.primaryArchetype]) suggested.add(t);
    }
    if (activeCharacter.secondaryArchetype && map[activeCharacter.secondaryArchetype]) {
      for (const t of map[activeCharacter.secondaryArchetype]) suggested.add(t);
    }
    for (const eq of activeCharacter.equippedItems || []) {
      const catItem = lookup.byId.get(eq.id.toLowerCase());
      for (const t of catItem?.synergyTags || []) {
        suggested.add(t);
      }
    }
    if (suggested.size > 0) {
      updateActivePreset((preset) => ({
        ...preset,
        activeSynergyTags: Array.from(suggested),
      }));
      const charSum = resolveCharacterSummary(activeCharacter, lang);
      setImportFeedback(
        lang === 'en'
          ? `✨ Activated ${suggested.size} recommended synergy tags for ${charSum} and your equipped gear.`
          : `✨ Se activaron ${suggested.size} etiquetas de sinergia recomendadas para ${charSum} y tu equipamiento actual.`
      );
    }
  };

  const handleToggleWishlistItem = (item: CatalogItem) => {
    updateActivePreset((preset) => {
      const idLower = item.id.toLowerCase();
      const exists = preset.wishlistItemIds.some((x) => x.toLowerCase() === idLower);
      if (exists) {
        return {
          ...preset,
          wishlistItemIds: preset.wishlistItemIds.filter((x) => x.toLowerCase() !== idLower),
          wishlistToolkitIds: item.toolkitId
            ? preset.wishlistToolkitIds.filter(
                (x) => x.toLowerCase() !== item.toolkitId!.toLowerCase()
              )
            : preset.wishlistToolkitIds,
          wishlistItemNames: preset.wishlistItemNames.filter(
            (x) => cleanLookupKey(x) !== cleanLookupKey(item.canonicalName)
          ),
        };
      } else {
        return {
          ...preset,
          wishlistItemIds: [...preset.wishlistItemIds, item.id],
          wishlistToolkitIds: item.toolkitId
            ? Array.from(new Set([...preset.wishlistToolkitIds, item.toolkitId]))
            : preset.wishlistToolkitIds,
          wishlistItemNames: Array.from(
            new Set([...preset.wishlistItemNames, item.canonicalName])
          ),
        };
      }
    });
  };

  const handleImportBuildText = (replaceExisting: boolean) => {
    const res = parseBuildImportInput(importText, lookup, catalog);
    if (res.matchedItems.length === 0) {
      setImportFeedback(
        lang === 'en'
          ? '⚠️ No valid catalog items detected in pasted URL or text. Paste a Remnant 2 Toolkit URL or item names in English/Spanish.'
          : '⚠️ No se detectaron ítems válidos del catálogo en el texto o URL pegado. Puedes pegar una URL de Remnant 2 Toolkit o nombres de ítems en inglés o español.'
      );
      return;
    }

    updateActivePreset((preset) => {
      const baseIds = replaceExisting ? [] : preset.wishlistItemIds;
      const baseTkIds = replaceExisting ? [] : preset.wishlistToolkitIds;
      const baseNames = replaceExisting ? [] : preset.wishlistItemNames;
      const baseTags = replaceExisting ? [] : preset.activeSynergyTags;

      const nextIds = Array.from(
        new Set([...baseIds, ...res.matchedItems.map((m) => m.id)])
      );
      const nextTkIds = Array.from(
        new Set([
          ...baseTkIds,
          ...res.matchedItems
            .map((m) => m.toolkitId)
            .filter((x): x is string => Boolean(x)),
        ])
      );
      const nextNames = Array.from(
        new Set([...baseNames, ...res.matchedItems.map((m) => m.canonicalName)])
      );
      const nextTags = Array.from(new Set([...baseTags, ...res.suggestedSynergyTags]));

      return {
        ...preset,
        wishlistItemIds: nextIds,
        wishlistToolkitIds: nextTkIds,
        wishlistItemNames: nextNames,
        activeSynergyTags: nextTags,
        importedSourceUrl: res.sourceUrl || preset.importedSourceUrl,
      };
    });

    setImportFeedback(
      lang === 'en'
        ? `✅ Imported ${res.matchedItems.length} items into your Build Wishlist and ${res.suggestedSynergyTags.length} suggested synergy tags!`
        : `✅ ¡Importados ${res.matchedItems.length} ítems a tu Wishlist de Build y ${res.suggestedSynergyTags.length} etiquetas de sinergia sugeridas!`
    );
    setImportText('');
  };

  const handleCreatePreset = () => {
    const trimmed = newBuildName.trim();
    if (!trimmed) return;
    const newId = `build_${Date.now()}`;
    const newPreset: UserBuildPresetDto = {
      id: newId,
      name: trimmed,
      activeSynergyTags: ['Critical Chance', 'Weakspot'],
      wishlistItemIds: [],
      wishlistToolkitIds: [],
      wishlistItemNames: [],
      importedSourceUrl: null,
      notes: '',
    };
    onUpdateConfig({
      ...config,
      activeBuildId: newId,
      builds: [...config.builds, newPreset],
    });
    setNewBuildName('');
  };

  const handleDeleteActivePreset = () => {
    if (config.builds.length <= 1) return;
    const remaining = config.builds.filter((b) => b.id !== activePreset.id);
    onUpdateConfig({
      ...config,
      activeBuildId: remaining[0].id,
      builds: remaining,
    });
  };

  const wishlistCatalogItems = useMemo(() => {
    const list: CatalogItem[] = [];
    const seen = new Set<string>();

    for (const id of activePreset.wishlistItemIds) {
      const item = lookup.byId.get(id.toLowerCase());
      if (item && !seen.has(item.id)) {
        seen.add(item.id);
        list.push(item);
      }
    }
    for (const tkId of activePreset.wishlistToolkitIds) {
      const item = lookup.byToolkitId.get(tkId.toLowerCase());
      if (item && !seen.has(item.id)) {
        seen.add(item.id);
        list.push(item);
      }
    }
    return list;
  }, [activePreset, lookup]);

  const searchResults = useMemo(() => {
    if (!catalog) return [];
    const q = searchQuery.trim().toLowerCase();
    const allowedCategories = new Set([
      'ring',
      'amulet',
      'weapon',
      'mutator',
      'relic',
      'trait',
      'mod',
      'specialmod',
      'engram',
      'archetype',
      'armor',
      'concoction',
    ]);

    return catalog.items
      .filter((item) => {
        if (item.id.startsWith('Toolkit_')) return false;
        if (!allowedCategories.has(item.type)) return false;
        if (categoryFilter !== 'all' && item.type !== categoryFilter) return false;
        if (!q) return true;
        return (
          item.nameEs.toLowerCase().includes(q) ||
          item.canonicalName.toLowerCase().includes(q) ||
          (item.descriptionEs || '').toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.synergyTags.some((t) => t.toLowerCase().includes(q))
        );
      })
      .slice(0, 36);
  }, [catalog, searchQuery, categoryFilter]);

  const synergyDefinitions = catalog?.synergyTagDefinitions || [];

  return (
    <div className="bg-[#111520] border border-slate-800 rounded-2xl p-5 space-y-6 shadow-xl">
      {/* Header & Build Preset Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-extrabold text-white tracking-tight">
              {lang === 'en'
                ? 'Smart "My Build" Engine (Synergies + Wishlist)'
                : 'Motor Inteligente de “Mi Build” (Sinergias + Wishlist)'}
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {lang === 'en' ? (
              <>
                Select your build mechanics or import target items from{' '}
                <span className="text-amber-300 font-medium">Remnant 2 Toolkit</span> to
                highlight them with{' '}
                <span className="text-amber-400 font-bold">GOLD PRIORITY</span> and{' '}
                <span className="text-purple-300 font-bold">PURPLE PRIORITY</span> across
                dungeons and Boss Rush.
              </>
            ) : (
              <>
                Configura las mecánicas de tu build o importa tus piezas objetivo de{' '}
                <span className="text-amber-300 font-medium">Remnant 2 Toolkit</span> para
                resaltarlas con{' '}
                <span className="text-amber-400 font-bold">PRIORIDAD ORO</span> y{' '}
                <span className="text-purple-300 font-bold">PRIORIDAD MORADA</span> en cada
                mazmorra y en Boss Rush.
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={activePreset.id}
            onChange={(e) => onUpdateConfig({ ...config, activeBuildId: e.target.value })}
            className="bg-[#0b0e16] border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-semibold text-white focus:outline-none focus:border-amber-400"
          >
            {config.builds.map((b) => (
              <option key={b.id} value={b.id}>
                🎯 {b.name} ({b.activeSynergyTags.length} tags, {b.wishlistItemIds.length}{' '}
                {lang === 'en' ? 'items' : 'ítems'})
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1">
            <input
              type="text"
              value={newBuildName}
              onChange={(e) => setNewBuildName(e.target.value)}
              placeholder={lang === 'en' ? 'New build...' : 'Nueva build...'}
              className="bg-[#0b0e16] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 w-32 focus:outline-none focus:border-amber-400"
            />
            <button
              type="button"
              onClick={handleCreatePreset}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/50 text-amber-300 hover:bg-amber-500/30 text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> {lang === 'en' ? 'Create' : 'Crear'}
            </button>
            {config.builds.length > 1 && (
              <button
                type="button"
                onClick={handleDeleteActivePreset}
                title={lang === 'en' ? 'Delete preset' : 'Eliminar este preset de build'}
                className="p-1.5 rounded-lg bg-red-950/50 border border-red-800/50 text-red-300 hover:bg-red-900/50 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {importFeedback && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-amber-500/15 border border-amber-400/50 px-4 py-2.5 text-xs text-amber-200">
          <span>{importFeedback}</span>
          <button
            type="button"
            onClick={() => setImportFeedback(null)}
            className="text-amber-300 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Mode 1: Synergy Tags Selector */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-400/60 text-amber-300 inline-flex items-center justify-center text-xs">
                1
              </span>
              {lang === 'en'
                ? `Active Synergy Tags (${activePreset.activeSynergyTags.length} selected)`
                : `Etiquetas de Sinergia Activas (${activePreset.activeSynergyTags.length} seleccionadas)`}
            </h3>
            <p className="text-xs text-slate-400">
              {lang === 'en' ? (
                <>
                  Unowned items matching these mechanics are promoted to{' '}
                  <strong className="text-amber-400">Gold Priority</strong> or{' '}
                  <strong className="text-purple-300">Purple Priority</strong>.
                </>
              ) : (
                <>
                  Los ítems que no tengas y aporten directamente a estas etiquetas subirán
                  a <strong className="text-amber-400">Prioridad Oro</strong> o{' '}
                  <strong className="text-purple-300">Prioridad Morada</strong>.
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {activeCharacter && (
              <button
                type="button"
                onClick={handleAutoSuggestFromArchetypes}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600/25 border border-purple-400/60 text-purple-200 hover:bg-purple-600/35 text-xs font-semibold cursor-pointer transition-colors"
              >
                <Wand2 className="w-3.5 h-3.5 text-purple-300" />
                {lang === 'en'
                  ? `Auto-Suggest for ${resolveCharacterSummary(activeCharacter, 'en')}`
                  : `Auto-Sugerir para mi ${activeCharacter.summary}`}
              </button>
            )}
            {activePreset.activeSynergyTags.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  updateActivePreset((p) => ({ ...p, activeSynergyTags: [] }))
                }
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-xs cursor-pointer"
              >
                {lang === 'en' ? 'Clear Tags' : 'Limpiar Tags'}
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {synergyDefinitions.map((tag: SynergyTagDefinition) => {
            const isActive = activePreset.activeSynergyTags.includes(tag.id);
            const mainLabel = resolveTagLabel(tag, tag.id, lang);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => handleToggleSynergyTag(tag.id)}
                className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-left transition-all cursor-pointer ${
                  isActive
                    ? 'bg-amber-500/20 border-amber-400 text-amber-100 shadow-sm shadow-amber-500/20'
                    : 'bg-[#0b0e17] border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold truncate">{mainLabel}</div>
                  <div className="text-[10px] opacity-75 truncate">{tag.id}</div>
                </div>
                <span
                  className={`w-4 h-4 rounded-md flex items-center justify-center shrink-0 ${
                    isActive
                      ? 'bg-amber-400 text-slate-950'
                      : 'border border-slate-700 bg-slate-900'
                  }`}
                >
                  {isActive && <Check className="w-3 h-3 stroke-[3]" />}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Mode 2: Wishlist & Remnant 2 Toolkit Importer */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-4 border-t border-slate-800">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-400/60 text-amber-300 inline-flex items-center justify-center text-xs">
                2
              </span>
              {lang === 'en'
                ? `My Build Wishlist (${wishlistCatalogItems.length} target items)`
                : `Mi Wishlist de Build (${wishlistCatalogItems.length} piezas objetivo)`}
            </h3>
            {wishlistCatalogItems.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  updateActivePreset((p) => ({
                    ...p,
                    wishlistItemIds: [],
                    wishlistToolkitIds: [],
                    wishlistItemNames: [],
                  }))
                }
                className="text-xs text-red-400 hover:text-red-300 cursor-pointer"
              >
                {lang === 'en' ? 'Clear Wishlist' : 'Vaciar Wishlist'}
              </button>
            )}
          </div>

          <div className="bg-[#0b0e16] border border-slate-800 rounded-xl p-3 min-h-[120px] max-h-[240px] overflow-y-auto space-y-2">
            {wishlistCatalogItems.length === 0 ? (
              <div className="text-xs text-slate-500 text-center py-8">
                {lang === 'en'
                  ? 'No specific items in your Wishlist yet. Add them from the catalog search on the right, any dungeon card, or paste a Remnant 2 Toolkit URL below.'
                  : 'Aún no tienes ítems específicos en tu Wishlist. Agrégalos desde el buscador de la derecha, desde cualquier tarjeta de mazmorra o pegando una URL de Remnant 2 Toolkit abajo.'}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {wishlistCatalogItems.map((item) => {
                  const isOwned =
                    ownedIdSet.has(item.id.toLowerCase()) ||
                    (item.profileId && ownedIdSet.has(item.profileId.toLowerCase()));
                  return (
                    <div
                      key={item.id}
                      className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs border ${
                        isOwned
                          ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-200'
                          : 'bg-amber-500/15 border-amber-400/60 text-amber-100'
                      }`}
                    >
                      <span className="font-semibold">
                        {isOwned ? '✓ ' : '🎯 '}
                        {lang === 'en' ? item.canonicalName : item.nameEs}
                      </span>
                      <span className="text-[10px] opacity-70 uppercase">({item.type})</span>
                      <button
                        type="button"
                        onClick={() => handleToggleWishlistItem(item)}
                        className="text-slate-400 hover:text-white cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-[#0b0e16] border border-slate-800 rounded-xl p-3.5 space-y-2.5">
            <label className="block text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <ClipboardPaste className="w-3.5 h-3.5 text-amber-400" />
              {lang === 'en'
                ? 'Import from Remnant 2 Toolkit URL or Item List:'
                : 'Importar desde URL de Remnant 2 Toolkit o Lista de Ítems:'}
            </label>
            <textarea
              rows={3}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={
                lang === 'en'
                  ? "Paste a remnant2toolkit.com/builder?... URL, CSV export, or item list (e.g. Zania's Malice, Probability Cord, Nightfall)..."
                  : "Pega aquí una URL de remnant2toolkit.com/builder?..., un CSV exportado, o una lista de ítems (ej: Zania's Malice, Probability Cord, Nightfall)..."
              }
              className="w-full bg-[#07090e] border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleImportBuildText(false)}
                disabled={!importText.trim()}
                className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400 disabled:opacity-40 cursor-pointer"
              >
                {lang === 'en' ? '+ Add to Active Build' : '+ Agregar a mi Build Actual'}
              </button>
              <button
                type="button"
                onClick={() => handleImportBuildText(true)}
                disabled={!importText.trim()}
                className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 font-semibold text-xs disabled:opacity-40 cursor-pointer"
              >
                {lang === 'en'
                  ? 'Replace Wishlist with Import'
                  : 'Reemplazar Wishlist con Importación'}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Search Catalog */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Search className="w-4 h-4 text-sky-400" />
            {lang === 'en'
              ? `Search Catalog (${catalog?.totalItemsCount || 0} items)`
              : `Buscar Ítems en el Catálogo Oficial (${catalog?.totalItemsCount || 0} ítems)`}
          </h3>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  lang === 'en'
                    ? 'Search ring, amulet, weapon, mutator, effect (e.g. bleed, shield)...'
                    : 'Buscar anillo, amuleto, arma, mutador, efecto (ej. bleed, shield)...'
                }
                className="w-full bg-[#0b0e16] border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-[#0b0e16] border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-400"
            >
              <option value="all">
                {lang === 'en' ? 'All Categories' : 'Todas las categorías'}
              </option>
              <option value="ring">{lang === 'en' ? 'Rings' : 'Anillos'}</option>
              <option value="amulet">{lang === 'en' ? 'Amulets' : 'Amuletos'}</option>
              <option value="weapon">{lang === 'en' ? 'Weapons' : 'Armas'}</option>
              <option value="mutator">{lang === 'en' ? 'Mutators' : 'Mutadores'}</option>
              <option value="relic">{lang === 'en' ? 'Relics' : 'Reliquias'}</option>
              <option value="mod">{lang === 'en' ? 'Mods' : 'Modificadores'}</option>
              <option value="trait">{lang === 'en' ? 'Traits' : 'Rasgos'}</option>
              <option value="engram">{lang === 'en' ? 'Engrams' : 'Engramas'}</option>
              <option value="armor">{lang === 'en' ? 'Armor' : 'Armaduras'}</option>
            </select>
          </div>

          <div className="bg-[#0b0e16] border border-slate-800 rounded-xl p-2.5 max-h-[310px] overflow-y-auto divide-y divide-slate-800/70">
            {searchResults.map((item) => {
              const inWishlist = activePreset.wishlistItemIds.some(
                (x) => x.toLowerCase() === item.id.toLowerCase()
              );
              const isOwned =
                ownedIdSet.has(item.id.toLowerCase()) ||
                (item.profileId && ownedIdSet.has(item.profileId.toLowerCase()));

              const mainName = lang === 'en' ? item.canonicalName : item.nameEs;
              const subName =
                lang === 'es' && item.canonicalName !== item.nameEs
                  ? item.canonicalName
                  : null;
              const desc =
                lang === 'en'
                  ? item.description || item.descriptionEs
                  : item.descriptionEs || item.description;

              return (
                <div
                  key={item.id}
                  className="py-2 px-2 flex items-start justify-between gap-3 hover:bg-slate-900/60 rounded-lg transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-white">{mainName}</span>
                      {subName && (
                        <span className="text-[11px] text-slate-400">({subName})</span>
                      )}
                      <span className="px-1.5 py-0.5 rounded text-[10px] uppercase bg-slate-800 text-slate-300">
                        {item.type}
                      </span>
                      {isOwned ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-950/80 text-emerald-300 border border-emerald-700/50">
                          ✓ {lang === 'en' ? 'Owned' : 'Ya en tu inventario'}
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-950/70 text-amber-300 border border-amber-700/50">
                          {lang === 'en' ? 'Missing' : 'Faltante'}
                        </span>
                      )}
                    </div>
                    {desc && (
                      <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">
                        {desc}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggleWishlistItem(item)}
                    className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                      inWishlist
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-800 border border-slate-700 text-slate-300 hover:text-white'
                    }`}
                  >
                    <Star className={`w-3 h-3 ${inWishlist ? 'fill-slate-950' : ''}`} />
                    {inWishlist
                      ? lang === 'en'
                        ? 'Wishlisted'
                        : 'En Wishlist'
                      : lang === 'en'
                      ? '+ Target'
                      : '+ Meta'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
