import React, { useState } from 'react';
import {
  Award,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Flame,
  KeyRound,
  Languages,
  PackageCheck,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  Star,
  Target,
  Users,
  Wrench,
} from 'lucide-react';
import {
  AppLanguage,
  CatalogPayload,
  EvaluatedLootItem,
  SynergyTagDefinition,
} from '../types';
import {
  openExternalUrl,
  resolveItemDisplay,
  resolveTagLabel,
} from '../utils/i18n';
import { translateUiTermEs } from '../utils/localizationEs';

interface ItemCardProps {
  evaluated: EvaluatedLootItem;
  tagDefById: Map<string, SynergyTagDefinition>;
  catalogPayload?: CatalogPayload | null;
  lang?: AppLanguage;
  onToggleWishlist: (
    itemId: string,
    toolkitId?: string | null,
    canonicalName?: string
  ) => void;
}

const ITEM_TYPE_LABELS: Record<string, { es: string; en: string }> = {
  ring: { es: 'Anillo', en: 'Ring' },
  amulet: { es: 'Amuleto', en: 'Amulet' },
  weapon: { es: 'Arma', en: 'Weapon' },
  mutator: { es: 'Mutador', en: 'Mutator' },
  relic: { es: 'Reliquia', en: 'Relic' },
  trait: { es: 'Rasgo', en: 'Trait' },
  mod: { es: 'Mod', en: 'Mod' },
  specialmod: { es: 'Mod Fijo', en: 'Built-in Mod' },
  engram: { es: 'Engrama', en: 'Engram' },
  archetype: { es: 'Arquetipo', en: 'Archetype' },
  armor: { es: 'Armadura', en: 'Armor' },
  concoction: { es: 'Brebaje', en: 'Concoction' },
  consumable: { es: 'Consumible', en: 'Consumable' },
  fragment: { es: 'Fragmento', en: 'Fragment' },
  prism: { es: 'Prisma', en: 'Prism' },
};

const ORIGIN_SHORT_LABELS: Record<string, { es: string; en: string; cls: string }> = {
  WorldDrop: {
    es: 'Botín Mundial',
    en: 'World Drop',
    cls: 'bg-slate-800/90 text-slate-300 border-slate-700',
  },
  BossRushWorldDrop: {
    es: 'World Drop',
    en: 'World Drop',
    cls: 'bg-sky-950/80 text-sky-300 border-sky-700/60',
  },
  Location: {
    es: 'Evento Fijo',
    en: 'Fixed Event',
    cls: 'bg-sky-950/80 text-sky-300 border-sky-700/60',
  },
  Injectable: {
    es: 'Injectable',
    en: 'Injectable',
    cls: 'bg-fuchsia-950/80 text-fuchsia-300 border-fuchsia-700/60',
  },
  Dungeon: {
    es: 'Mazmorra',
    en: 'Dungeon',
    cls: 'bg-rose-950/80 text-rose-300 border-rose-700/60',
  },
  Vendor: {
    es: 'Vendedor',
    en: 'Vendor',
    cls: 'bg-amber-950/80 text-amber-300 border-amber-700/60',
  },
  Quest: {
    es: 'Misión',
    en: 'Quest',
    cls: 'bg-indigo-950/80 text-indigo-300 border-indigo-700/60',
  },
  Boss: {
    es: 'Jefe',
    en: 'Boss',
    cls: 'bg-red-950/80 text-red-300 border-red-700/60',
  },
  Miniboss: {
    es: 'Minijefe',
    en: 'Miniboss',
    cls: 'bg-orange-950/80 text-orange-300 border-orange-700/60',
  },
  Enemy: {
    es: 'Aberración',
    en: 'Aberration',
    cls: 'bg-orange-950/80 text-orange-300 border-orange-700/60',
  },
  Default: {
    es: 'Evento Fijo',
    en: 'Fixed Event',
    cls: 'bg-sky-950/80 text-sky-300 border-sky-700/60',
  },
};

const DLC_BADGES: Record<string, { es: string; en: string }> = {
  base: { es: 'Juego Base', en: 'Base Game' },
  dlc1: { es: 'DLC 1 • Awakened King', en: 'DLC 1 • Awakened King' },
  dlc2: { es: 'DLC 2 • Forgotten Kingdom', en: 'DLC 2 • Forgotten Kingdom' },
  dlc3: { es: 'DLC 3 • Dark Horizon', en: 'DLC 3 • Dark Horizon' },
};

export const ItemCard: React.FC<ItemCardProps> = ({
  evaluated,
  tagDefById,
  catalogPayload,
  lang = 'es',
  onToggleWishlist,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [toggleAltLang, setToggleAltLang] = useState(false);

  const {
    rolled,
    catalog,
    priority,
    isWishlistMatch,
    matchedActiveTags,
    synergyReasons,
  } = evaluated;

  const typeInfo = ITEM_TYPE_LABELS[rolled.type.toLowerCase()];
  const typeLabel = typeInfo ? (lang === 'en' ? typeInfo.en : typeInfo.es) : rolled.type;

  const originInfo =
    ORIGIN_SHORT_LABELS[rolled.originType] || ORIGIN_SHORT_LABELS.Default;
  const originShortLabel = lang === 'en' ? originInfo.en : originInfo.es;

  const display = resolveItemDisplay(
    rolled,
    catalog,
    catalogPayload,
    lang,
    toggleAltLang
  );

  // Compact synergy chip: first tag + "+N"
  const matchedTagLabels = matchedActiveTags.map((t) =>
    resolveTagLabel(tagDefById.get(t), t, lang)
  );
  const compactSynergyLabel =
    matchedTagLabels.length > 0
      ? matchedTagLabels.length > 1
        ? `${matchedTagLabels[0]} +${matchedTagLabels.length - 1}`
        : matchedTagLabels[0]
      : null;

  // Priority visual styles
  let rowContainerCls = '';
  let leftBarCls = '';
  let badgeCls = '';
  let badgeShort = '';
  let PriorityIcon = Sparkles;

  if (priority === 'gold') {
    rowContainerCls =
      'border-amber-400/80 bg-gradient-to-r from-amber-950/40 via-[#131722] to-[#10141d] hover:from-amber-950/55';
    leftBarCls = 'bg-amber-400';
    badgeCls = 'bg-amber-400 text-slate-950 font-black';
    badgeShort = isWishlistMatch
      ? lang === 'en'
        ? 'GOLD • META'
        : 'ORO • META'
      : lang === 'en'
      ? 'GOLD'
      : 'ORO';
    PriorityIcon = isWishlistMatch ? Target : Award;
  } else if (priority === 'purple') {
    rowContainerCls =
      'border-purple-500/50 bg-gradient-to-r from-purple-950/30 via-[#121620] to-[#0f131c] hover:from-purple-950/45';
    leftBarCls = 'bg-purple-400';
    badgeCls =
      'bg-purple-500/25 text-purple-200 border border-purple-400/50 font-bold';
    badgeShort = lang === 'en' ? 'SYNERGY' : 'SINERGIA';
    PriorityIcon = Sparkles;
  } else if (priority === 'green') {
    rowContainerCls =
      'border-emerald-500/35 bg-[#10141e] hover:bg-[#141926]';
    leftBarCls = 'bg-emerald-400';
    badgeCls =
      'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold';
    badgeShort = lang === 'en' ? 'NEW' : 'NUEVO';
    PriorityIcon = Flame;
  } else {
    rowContainerCls =
      'border-slate-800/70 bg-[#0c0f16]/75 opacity-60 hover:opacity-95';
    leftBarCls = 'bg-slate-600';
    badgeCls =
      'bg-slate-800 text-slate-400 border border-slate-700 font-medium';
    badgeShort = lang === 'en' ? 'OWNED' : 'OBTENIDO';
    PriorityIcon = CheckCircle2;
  }

  const rawOriginName =
    lang === 'en'
      ? rolled.canonicalOriginName || rolled.originNameEs || ''
      : translateUiTermEs(rolled.originNameEs || rolled.canonicalOriginName || '', catalogPayload);

  const specificOriginName =
    rawOriginName &&
    rawOriginName.toLowerCase() !== 'drop mundial' &&
    rawOriginName.toLowerCase() !== 'world drop' &&
    rawOriginName.toLowerCase() !== 'botín del mundo' &&
    rawOriginName.toLowerCase() !== display.primaryName.toLowerCase()
      ? rawOriginName
      : null;

  const translatedPrereq =
    lang === 'en'
      ? rolled.prerequisiteRaw || ''
      : translateUiTermEs(rolled.prerequisiteRaw, catalogPayload);

  const rawSubtype = rolled.weaponSubtype || catalog?.subtype || '';
  const translatedSubtype =
    lang === 'en' ? rawSubtype : translateUiTermEs(rawSubtype, catalogPayload);

  const dlcEntry = DLC_BADGES[catalog?.dlc || 'base'] || DLC_BADGES.base;
  const dlcLabel = lang === 'en' ? dlcEntry.en : dlcEntry.es;
  const stats = catalog?.stats;

  return (
    <div
      className={`rounded-lg border transition-colors overflow-hidden relative ${rowContainerCls}`}
    >
      {/* Left Color Priority Accent Bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${leftBarCls}`} />

      {/* Single-Line High-Density Row (~40px height) */}
      <div
        onClick={() => setExpanded((prev) => !prev)}
        title={
          display.secondaryName
            ? `${display.primaryName} (${display.secondaryName}) — ${
                lang === 'en'
                  ? 'Click for stats & step-by-step guide'
                  : 'Clic para ver detalles y cómo conseguir'
              }`
            : `${display.primaryName} — ${
                lang === 'en'
                  ? 'Click for stats & step-by-step guide'
                  : 'Clic para ver detalles y cómo conseguir'
              }`
        }
        className="pl-3 pr-2.5 py-1.5 min-h-[40px] flex items-center justify-between gap-2.5 cursor-pointer select-none"
      >
        {/* Left & Center-Left: Priority + Primary Item Name + Category + Compact Source */}
        <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] tracking-tight uppercase shrink-0 ${badgeCls}`}
          >
            <PriorityIcon className="w-3 h-3 shrink-0" />
            {badgeShort}
          </span>

          <span className="text-[13px] font-bold text-white flex-grow min-w-[130px] sm:min-w-[175px] truncate">
            {display.primaryName}
          </span>

          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-950/90 text-indigo-300 border border-indigo-800/60 shrink-0">
            {typeLabel}
          </span>

          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border shrink-0 hidden md:inline-flex items-center gap-1 max-w-[190px] ${originInfo.cls}`}
            title={
              specificOriginName
                ? `${originShortLabel}: ${specificOriginName}`
                : originShortLabel
            }
          >
            <span className="shrink-0">{originShortLabel}</span>
            {specificOriginName && (
              <span className="opacity-85 truncate">
                · {specificOriginName}
              </span>
            )}
          </span>
        </div>

        {/* Center-Right: Compact Synergy Chip & 1-Line Effect Summary */}
        <div className="hidden xl:flex items-center gap-1.5 min-w-0 max-w-[36%] shrink">
          {compactSynergyLabel && (
            <span
              className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-400/40 text-amber-200 text-[10px] font-semibold shrink-0"
              title={`${lang === 'en' ? 'Synergy' : 'Sinergia'}: ${matchedTagLabels.join(', ')}`}
            >
              ⚡ {compactSynergyLabel}
            </span>
          )}
          {rolled.isCoop && (
            <span className="px-1.5 py-0.5 rounded bg-orange-950/80 text-orange-300 border border-orange-700/50 text-[10px] shrink-0">
              Co-op
            </span>
          )}
          {rolled.hasRequiredMaterial && !rolled.isOwned && (
            <span className="px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-600/50 text-[10px] font-semibold shrink-0">
              🧪 {lang === 'en' ? 'Material' : 'Material'}
            </span>
          )}
          {rolled.isInCassShop && !rolled.isOwned && (
            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-semibold shrink-0">
              🛒 Cass
            </span>
          )}
          <span className="text-[11px] text-slate-400 truncate">
            {display.oneLineSummary}
          </span>
        </div>

        {/* Far-Right: Quick Wishlist Star + [How to get ▾] Button */}
        <div className="flex items-center gap-1.5 shrink-0">
          {compactSynergyLabel && (
            <span
              className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-400/40 text-amber-200 text-[10px] font-semibold shrink-0 xl:hidden hidden sm:inline-block"
              title={`${lang === 'en' ? 'Synergy' : 'Sinergia'}: ${matchedTagLabels.join(', ')}`}
            >
              ⚡ {compactSynergyLabel}
            </span>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleWishlist(
                rolled.id,
                catalog?.toolkitId,
                rolled.canonicalName
              );
            }}
            title={
              isWishlistMatch
                ? lang === 'en'
                  ? 'Remove from Build Wishlist'
                  : 'Quitar de mi Wishlist de Build'
                : lang === 'en'
                ? 'Add to Build Wishlist (Gold Priority)'
                : 'Agregar a mi Wishlist de Build (Prioridad Oro)'
            }
            className={`p-1 rounded-md border transition-colors cursor-pointer ${
              isWishlistMatch
                ? 'bg-amber-500/25 text-amber-300 border-amber-400/70 hover:bg-amber-500/35'
                : 'bg-slate-800/80 text-slate-400 border-slate-700/80 hover:text-white'
            }`}
          >
            <Star
              className={`w-3.5 h-3.5 ${
                isWishlistMatch ? 'fill-amber-400 text-amber-400' : ''
              }`}
            />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((prev) => !prev);
            }}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border transition-colors cursor-pointer ${
              expanded
                ? 'bg-sky-500/25 border-sky-400 text-sky-200'
                : 'bg-[#0b0e16] border-slate-700/80 text-slate-300 hover:border-slate-600 hover:text-white'
            }`}
          >
            <span className="hidden sm:inline">
              {lang === 'en' ? 'How to get' : 'Cómo conseguir'}
            </span>
            {expanded ? (
              <ChevronUp className="w-3.5 h-3.5 text-sky-300" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            )}
          </button>
        </div>
      </div>

      {/* Expandable Detail Panel */}
      {expanded && (
        <div className="px-4 py-3 bg-[#0a0d14] border-t border-slate-800/90 space-y-2.5 text-xs">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm text-white">
                {display.primaryName}
              </span>
              {display.secondaryName && (
                <span className="text-xs text-slate-400">
                  ({display.secondaryName})
                </span>
              )}
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700">
                {dlcLabel}
              </span>
              {translatedSubtype && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-950 text-indigo-300 border border-indigo-800/50">
                  {translatedSubtype}
                </span>
              )}
            </div>

            {display.hasAltLanguageAvailable && (
              <button
                type="button"
                onClick={() => setToggleAltLang((prev) => !prev)}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border transition-colors cursor-pointer ${
                  toggleAltLang
                    ? 'bg-amber-500/20 border-amber-400/60 text-amber-200'
                    : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:text-white'
                }`}
              >
                <Languages className="w-3 h-3" />
                {display.altToggleLabel}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Left: Effect, Stats & Synergy Breakdown */}
            <div className="space-y-2">
              {synergyReasons.length > 0 && (
                <div className="rounded-lg bg-amber-500/10 border border-amber-400/35 px-2.5 py-1.5 text-amber-100 space-y-0.5">
                  {synergyReasons.map((r, i) => (
                    <div key={i} className="font-medium">
                      {r}
                    </div>
                  ))}
                </div>
              )}

              {display.description && (
                <div className="bg-[#0e121b] border border-slate-800 rounded-lg p-2.5 text-slate-200 leading-relaxed whitespace-pre-line">
                  {display.description}
                  {stats &&
                    (stats.damage !== undefined ||
                      stats.armor !== undefined) && (
                      <div className="mt-2 pt-1.5 border-t border-slate-800 flex flex-wrap gap-3 text-[11px] text-slate-300 font-mono">
                        {stats.damage !== undefined && (
                          <span>{lang === 'en' ? 'DMG' : 'Daño'}: {stats.damage}</span>
                        )}
                        {stats.rps !== undefined && (
                          <span>{lang === 'en' ? 'RPS' : 'Cadencia'}: {stats.rps}/s</span>
                        )}
                        {stats.magazine !== undefined && (
                          <span>{lang === 'en' ? 'Mag' : 'Cargador'}: {stats.magazine}</span>
                        )}
                        {stats.crit !== undefined && (
                          <span>{lang === 'en' ? 'Crit' : 'Crítico'}: {stats.crit}%</span>
                        )}
                        {stats.weakspot !== undefined && (
                          <span>{lang === 'en' ? 'Weakspot' : 'Punto Débil'}: +{stats.weakspot}%</span>
                        )}
                        {stats.armor !== undefined && (
                          <span>{lang === 'en' ? 'Armor' : 'Armadura'}: {stats.armor}</span>
                        )}
                        {stats.weight !== undefined && (
                          <span>{lang === 'en' ? 'Weight' : 'Peso'}: {stats.weight}</span>
                        )}
                      </div>
                    )}
                </div>
              )}

              {catalog && catalog.synergyTags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {catalog.synergyTags.map((tagId) => {
                    const isMatched = matchedActiveTags.includes(tagId);
                    const def = tagDefById.get(tagId);
                    return (
                      <span
                        key={tagId}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          isMatched
                            ? 'bg-amber-400/25 text-amber-200 border border-amber-400/70'
                            : 'bg-slate-800/80 text-slate-400 border border-slate-700/70'
                        }`}
                      >
                        {isMatched ? '⚡ ' : ''}
                        {resolveTagLabel(def, tagId, lang)}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right: Exact Acquisition / How To Obtain Step-by-Step Box */}
            <div className="bg-[#0e131f] border border-sky-900/50 rounded-lg p-3 flex flex-col justify-between gap-2">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 font-bold text-sky-300">
                    <BookOpen className="w-3.5 h-3.5 text-sky-400" />
                    {lang === 'en'
                      ? `How to obtain (${originShortLabel})`
                      : `Cómo se consigue exactamente (${originShortLabel})`}
                  </span>
                  {specificOriginName && (
                    <span className="px-2 py-0.5 rounded bg-sky-950/90 text-sky-200 border border-sky-700/60 text-[11px] font-semibold">
                      {lang === 'en' ? 'Source:' : 'Evento/Origen:'} {specificOriginName}
                    </span>
                  )}
                </div>

                <p className="text-slate-200 leading-relaxed whitespace-pre-line">
                  {display.howToGet}
                </p>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {rolled.isCoop && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-orange-950/80 text-orange-300 border border-orange-700/60">
                      <Users className="w-3 h-3" />{' '}
                      {lang === 'en' ? 'Requires Co-op' : 'Requiere Co-op'}
                    </span>
                  )}
                  {rolled.hasRequiredMaterial && !rolled.isOwned && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-emerald-950/80 text-emerald-300 border border-emerald-600/60 font-semibold">
                      <Wrench className="w-3 h-3" />{' '}
                      {lang === 'en'
                        ? 'Crafting material already in your inventory!'
                        : '¡Ya tienes el material en tu inventario!'}
                    </span>
                  )}
                  {rolled.isPrerequisiteMissing && translatedPrereq && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-red-950/80 text-red-300 border border-red-700/60">
                      <ShieldAlert className="w-3 h-3" />{' '}
                      {lang === 'en' ? 'Missing prerequisite:' : 'Prerrequisito faltante:'}{' '}
                      {translatedPrereq}
                    </span>
                  )}
                  {!rolled.isPrerequisiteMissing && translatedPrereq && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-teal-950/80 text-teal-300 border border-teal-700/60">
                      <KeyRound className="w-3 h-3" />{' '}
                      {lang === 'en' ? 'Prerequisite ready:' : 'Prerrequisito disponible:'}{' '}
                      {translatedPrereq}
                    </span>
                  )}
                  {rolled.isInCassShop && !rolled.isOwned && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-amber-950/80 text-amber-300 border border-amber-600/60">
                      <ShoppingBag className="w-3 h-3" />{' '}
                      {lang === 'en' ? "In Cass's Shop (Ward 13)" : 'En Tienda de Cass (Base 13)'}
                    </span>
                  )}
                  {rolled.isLootedInWorld && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-300 border border-slate-700">
                      <PackageCheck className="w-3 h-3 text-emerald-400" />{' '}
                      {lang === 'en' ? 'Looted in this roll' : 'Recogido en este mundo'}
                    </span>
                  )}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
                <span className="font-mono">{rolled.id}</span>
                {catalog?.wikiLink && (
                  <button
                    type="button"
                    onClick={() => openExternalUrl(catalog.wikiLink)}
                    className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 font-semibold cursor-pointer"
                  >
                    {lang === 'en' ? 'Open on Remnant.Wiki' : 'Abrir en Remnant.Wiki'}{' '}
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
