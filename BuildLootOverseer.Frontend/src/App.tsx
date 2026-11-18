import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Coffee,
  Compass,
  FolderSearch,
  Info,
  Package,
  RefreshCw,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import { getValidatedKofiUrl, KOFI_URL } from './constants';
import {
  AppBrandingDto,
  AppLanguage,
  BackupEntryInfo,
  CatalogPayload,
  CharacterDto,
  SaveDatasetDto,
  UserAppConfigDto,
  UserBuildPresetDto,
} from './types';
import { buildCatalogLookup, cleanLookupKey } from './utils/buildPriorityEngine';
import {
  normalizeLanguage,
  openExternalUrl,
  resolveCharacterSummary,
  resolveTagLabel,
} from './utils/i18n';
import { WorldExplorerView } from './components/WorldExplorerView';
import { BuildConfiguratorPanel } from './components/BuildConfiguratorModal';
import { InventoryOverviewPanel } from './components/InventoryOverviewPanel';
import { BackupsModal } from './components/BackupsModal';
import { SettingsModal } from './components/SettingsModal';
import { AboutSupportModal } from './components/AboutSupportModal';

export const App: React.FC = () => {
  const [saveData, setSaveData] = useState<SaveDatasetDto | null>(null);
  const [catalog, setCatalog] = useState<CatalogPayload | null>(null);
  const [config, setConfig] = useState<UserAppConfigDto | null>(null);
  const [branding, setBranding] = useState<AppBrandingDto | null>(null);
  const [backups, setBackups] = useState<BackupEntryInfo[]>([]);
  const [selectedCharIdx, setSelectedCharIdx] = useState<number>(0);
  const [selectedWorldMode, setSelectedWorldMode] = useState<'Campaign' | 'Adventure'>('Campaign');
  const [activeTab, setActiveTab] = useState<'world' | 'inventory'>('world');

  // Modals (all hidden by default except first-run Welcome Wizard)
  const [isBuildModalOpen, setIsBuildModalOpen] = useState<boolean>(false);
  const [showBackupsModal, setShowBackupsModal] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [isWelcomeWizard, setIsWelcomeWizard] = useState<boolean>(false);
  const [showAboutModal, setShowAboutModal] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [liveToast, setLiveToast] = useState<string | null>(null);

  const lang: AppLanguage = useMemo(
    () => normalizeLanguage(config?.language),
    [config?.language]
  );

  const lookup = useMemo(() => buildCatalogLookup(catalog), [catalog]);

  const fetchAllData = useCallback(async (isInitial = false, forceRefresh = false) => {
    if (isInitial) setLoading(true);
    setErrorMsg(null);
    try {
      const saveUrl = forceRefresh ? '/api/save?refresh=true' : '/api/save';
      const [saveRes, catRes, cfgRes, bakRes, brandRes] = await Promise.all([
        fetch(saveUrl),
        fetch('/api/catalog'),
        fetch('/api/config'),
        fetch('/api/backups'),
        fetch('/api/branding').catch(() => null),
      ]);

      const catJson: CatalogPayload | null = catRes.ok ? await catRes.json() : null;
      const cfgJson: UserAppConfigDto | null = cfgRes.ok ? await cfgRes.json() : null;
      const bakJson: BackupEntryInfo[] = bakRes.ok ? await bakRes.json() : [];
      const brandJson: AppBrandingDto | null =
        brandRes && brandRes.ok ? await brandRes.json() : null;

      if (catJson) setCatalog(catJson);
      if (cfgJson) setConfig(cfgJson);
      setBackups(bakJson);
      if (brandJson) setBranding(brandJson);

      // Open First-Run Welcome Wizard if user hasn't configured their platform/save folder yet
      if (isInitial && cfgJson && !cfgJson.hasCompletedSetup && !cfgJson.customSaveFolder) {
        setIsWelcomeWizard(true);
        setShowSettingsModal(true);
      }

      if (!saveRes.ok) {
        const errBody = await saveRes.json().catch(() => ({}));
        if (isInitial) {
          setIsWelcomeWizard(true);
          setShowSettingsModal(true);
        }
        throw new Error(
          errBody.error || errBody.detail || `Error (${saveRes.status})`
        );
      }

      const saveJson: SaveDatasetDto = await saveRes.json();
      if (!saveJson?.characters || saveJson.characters.length === 0) {
        throw new Error(
          'El juego aún estaba guardando en el punto de control. Haz clic en Reintentar Lectura para recargar.'
        );
      }

      setSaveData(saveJson);

      if (isInitial && saveJson.characters.length > 0) {
        const defaultCharIdx = saveJson.activeCharacterListIndex ?? 0;
        setSelectedCharIdx(defaultCharIdx);
        const charObj = saveJson.characters[defaultCharIdx] || saveJson.characters[0];
        if (charObj.activeWorldSlot === 'Adventure' && charObj.adventure) {
          setSelectedWorldMode('Adventure');
        } else {
          setSelectedWorldMode('Campaign');
        }
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error inesperado al conectar con el backend local.');
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData(true, false);
  }, [fetchAllData]);

  // Subscribe to real-time SSE save file updates
  useEffect(() => {
    const es = new EventSource('/api/events');
    es.onmessage = async (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'saveUpdated' || payload.type === 'save-updated') {
          let nextSave: SaveDatasetDto | null = payload.data || null;

          if (!nextSave || !nextSave.characters || nextSave.characters.length === 0) {
            const saveRes = await fetch('/api/save?refresh=true');
            if (saveRes.ok) {
              nextSave = await saveRes.json();
            }
          }

          if (!nextSave || !nextSave.characters || nextSave.characters.length === 0) {
            return;
          }

          setSaveData(nextSave);
          setErrorMsg(null);
          if (Array.isArray(nextSave.backups)) {
            setBackups(nextSave.backups);
          }

          const activeChar =
            nextSave.characters[nextSave.activeCharacterListIndex] || nextSave.characters[0];
          if (activeChar) {
            if (activeChar.activeWorldSlot === 'Adventure' && activeChar.adventure) {
              setSelectedWorldMode('Adventure');
            } else if (activeChar.activeWorldSlot === 'Campaign') {
              setSelectedWorldMode('Campaign');
            }
          }
          setLiveToast(
            lang === 'en'
              ? `🔄 Checkpoint detected (${nextSave.copyDurationMs.toFixed(1)} ms snapshot copy)`
              : `🔄 Punto de control detectado (${nextSave.copyDurationMs.toFixed(1)} ms en copia temporal)`
          );
          setTimeout(() => setLiveToast(null), 4000);
        }
      } catch {
        // Ignore malformed SSE heartbeats
      }
    };
    return () => es.close();
  }, [lang]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/save/refresh', { method: 'POST' });
      if (res.ok) {
        const nextSave: SaveDatasetDto = await res.json();
        if (nextSave?.characters?.length > 0) {
          setSaveData(nextSave);
          setErrorMsg(null);
          if (Array.isArray(nextSave.backups)) {
            setBackups(nextSave.backups);
          }
          setLiveToast(
            lang === 'en'
              ? `✅ Save reloaded in ${nextSave.copyDurationMs.toFixed(1)} ms`
              : `✅ Guardado recargado en ${nextSave.copyDurationMs.toFixed(1)} ms`
          );
          setTimeout(() => setLiveToast(null), 3500);
        }
      }
    } finally {
      setRefreshing(false);
    }
  };

  const handleUpdateConfig = async (nextConfig: UserAppConfigDto) => {
    setConfig(nextConfig);
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextConfig),
      });
    } catch {
      // Keep optimistic state
    }
  };

  const handleSwitchLanguage = (nextLang: AppLanguage) => {
    const baseCfg: UserAppConfigDto = config || {
      language: nextLang,
      hideOwnedItems: false,
      hideLootedInWorld: false,
      hasCompletedSetup: false,
      savePlatform: 'Steam',
      activeBuildId: 'default',
      builds: [
        {
          id: 'default',
          name: 'Mi Build Principal',
          activeSynergyTags: ['Critical Chance', 'Weakspot', 'Mod Power'],
          wishlistItemIds: [],
          wishlistToolkitIds: [],
          wishlistItemNames: [],
          notes: '',
        },
      ],
    };
    handleUpdateConfig({
      ...baseCfg,
      language: nextLang,
    });
  };

  const handleAppliedSaveFolder = (
    nextConfig: UserAppConfigDto,
    nextSave: SaveDatasetDto
  ) => {
    setConfig(nextConfig);
    setSaveData(nextSave);
    setErrorMsg(null);
    setIsWelcomeWizard(false);
    if (Array.isArray(nextSave.backups)) {
      setBackups(nextSave.backups);
    }
    if (nextSave.characters.length > 0) {
      const defaultIdx = nextSave.activeCharacterListIndex ?? 0;
      setSelectedCharIdx(defaultIdx);
      const ch = nextSave.characters[defaultIdx] || nextSave.characters[0];
      if (ch.activeWorldSlot === 'Adventure' && ch.adventure) {
        setSelectedWorldMode('Adventure');
      } else {
        setSelectedWorldMode('Campaign');
      }
    }
    setLiveToast(
      normalizeLanguage(nextConfig.language) === 'en'
        ? '✅ Platform & save folder configured successfully!'
        : '✅ ¡Plataforma y ruta de guardados configuradas correctamente!'
    );
    setTimeout(() => setLiveToast(null), 4000);
  };

  const handleCreateManualBackup = async () => {
    const res = await fetch('/api/backups/create', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      if (data.backups) setBackups(data.backups);
      setLiveToast(
        lang === 'en'
          ? '🛡️ Preventive .zip backup created successfully.'
          : '🛡️ Respaldo preventivo .zip creado correctamente.'
      );
      setTimeout(() => setLiveToast(null), 3500);
    }
  };

  const activeCharacter: CharacterDto | null = useMemo(() => {
    if (!saveData || saveData.characters.length === 0) return null;
    return saveData.characters[selectedCharIdx] || saveData.characters[0];
  }, [saveData, selectedCharIdx]);

  const activePreset: UserBuildPresetDto = useMemo(() => {
    if (!config || config.builds.length === 0) {
      return {
        id: 'default',
        name: 'Mi Build Principal',
        activeSynergyTags: ['Critical Chance', 'Weakspot', 'Mod Power'],
        wishlistItemIds: [],
        wishlistToolkitIds: [],
        wishlistItemNames: [],
        notes: '',
      };
    }
    return (
      config.builds.find((b) => b.id === config.activeBuildId) || config.builds[0]
    );
  }, [config]);

  const handleToggleWishlistQuick = (
    itemId: string,
    toolkitId?: string | null,
    canonicalName?: string
  ) => {
    if (!config) return;
    const idLower = itemId.toLowerCase();
    const exists = activePreset.wishlistItemIds.some((x) => x.toLowerCase() === idLower);

    const nextPreset: UserBuildPresetDto = exists
      ? {
          ...activePreset,
          wishlistItemIds: activePreset.wishlistItemIds.filter(
            (x) => x.toLowerCase() !== idLower
          ),
          wishlistToolkitIds: toolkitId
            ? activePreset.wishlistToolkitIds.filter(
                (x) => x.toLowerCase() !== toolkitId.toLowerCase()
              )
            : activePreset.wishlistToolkitIds,
          wishlistItemNames: canonicalName
            ? activePreset.wishlistItemNames.filter(
                (x) => cleanLookupKey(x) !== cleanLookupKey(canonicalName)
              )
            : activePreset.wishlistItemNames,
        }
      : {
          ...activePreset,
          wishlistItemIds: [...activePreset.wishlistItemIds, itemId],
          wishlistToolkitIds: toolkitId
            ? Array.from(new Set([...activePreset.wishlistToolkitIds, toolkitId]))
            : activePreset.wishlistToolkitIds,
          wishlistItemNames: canonicalName
            ? Array.from(new Set([...activePreset.wishlistItemNames, canonicalName]))
            : activePreset.wishlistItemNames,
        };

    const nextBuilds = config.builds.map((b) =>
      b.id === activePreset.id ? nextPreset : b
    );
    handleUpdateConfig({ ...config, builds: nextBuilds });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b0d12] text-slate-200 flex flex-col items-center justify-center p-6">
        <img
          src="/overseer-icon.svg"
          alt="Overseer"
          className="w-12 h-12 rounded-2xl mb-3 animate-pulse shadow-lg"
        />
        <h1 className="text-base font-extrabold text-white">
          Remnant 2 Build &amp; Loot Overseer
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          {lang === 'en'
            ? 'Loading safe temporary save snapshot (.sav)...'
            : 'Cargando copia temporal segura (.sav)...'}
        </p>
      </div>
    );
  }

  if (!saveData || !activeCharacter) {
    return (
      <div className="min-h-screen bg-[#0b0d12] text-slate-200 flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-[#111520] border border-red-800/60 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-red-400 font-bold">
            <FolderSearch className="w-6 h-6" />
            <span>
              {lang === 'en'
                ? 'Could not load Remnant 2 save file'
                : 'No se pudo cargar el archivo de guardado'}
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            {errorMsg ||
              (lang === 'en'
                ? 'Select your platform (Steam, Epic Games, or Xbox Game Pass) or click Retry.'
                : 'Selecciona tu plataforma (Steam, Epic Games o Xbox Game Pass) o haz clic en Reintentar Lectura.')}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fetchAllData(true, true)}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer"
            >
              {lang === 'en' ? 'Retry Save Read' : 'Reintentar Lectura'}
            </button>

            <button
              type="button"
              onClick={() => {
                setIsWelcomeWizard(true);
                setShowSettingsModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-bold text-xs cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5 text-sky-400" />
              {lang === 'en'
                ? 'Select Platform / Save Folder...'
                : 'Configurar Plataforma / Ruta .sav...'}
            </button>
          </div>
        </div>

        {showSettingsModal && (
          <SettingsModal
            lang={lang}
            config={config}
            isWelcomeWizard={isWelcomeWizard}
            canClose={true}
            onClose={() => setShowSettingsModal(false)}
            onChangeLanguage={handleSwitchLanguage}
            onAppliedSaveFolder={handleAppliedSaveFolder}
          />
        )}
      </div>
    );
  }

  const activeWorldData =
    selectedWorldMode === 'Adventure' && activeCharacter.adventure
      ? activeCharacter.adventure
      : activeCharacter.campaign;

  const collectionPct =
    activeCharacter.totalTrackableItemsCount > 0
      ? Math.round(
          (activeCharacter.acquiredItemsCount / activeCharacter.totalTrackableItemsCount) * 100
        )
      : 0;

  return (
    <div className="min-h-screen bg-[#0b0d12] text-slate-200 flex flex-col">
      {/* Live FileSystemWatcher Notification Toast */}
      {liveToast && (
        <div className="fixed bottom-4 right-4 z-50 bg-emerald-950/95 border border-emerald-400 text-emerald-100 px-3.5 py-2 rounded-xl shadow-2xl text-xs font-bold flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{liveToast}</span>
        </div>
      )}

      {/* 1. Single Ultra-Compact Top Bar (1 row, ~48px) */}
      <header className="sticky top-0 z-40 bg-[#0c0f17]/95 backdrop-blur-md border-b border-slate-800/90 px-3 sm:px-4 h-12 flex items-center">
        <div className="max-w-[1760px] w-full mx-auto flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
          {/* Left: Original Vector Brand + View Navigation + Configurar Build Trigger */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowAboutModal(true)}
              title={
                lang === 'en'
                  ? 'About Remnant 2 Build & Loot Overseer (GPL-3.0)'
                  : 'Acerca de Remnant 2 Build & Loot Overseer (GPL-3.0)'
              }
              className="flex items-center gap-2 pr-1 cursor-pointer hover:opacity-90"
            >
              <img
                src="/overseer-icon.svg"
                alt="Overseer"
                className="w-7 h-7 rounded-lg shrink-0"
              />
              <span className="text-sm font-black text-white tracking-tight hidden xl:inline">
                R2 Build &amp; Loot Overseer
              </span>
            </button>

            <div className="h-4 w-px bg-slate-800 hidden sm:block" />

            <nav className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setActiveTab('world')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-extrabold cursor-pointer transition-colors ${
                  activeTab === 'world'
                    ? 'bg-sky-500/20 border border-sky-400 text-sky-200'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Compass className="w-3.5 h-3.5" />
                <span>{lang === 'en' ? 'Active Map & Loot' : 'Mapa y Loot Activo'}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('inventory')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-extrabold cursor-pointer transition-colors ${
                  activeTab === 'inventory'
                    ? 'bg-emerald-500/20 border border-emerald-400 text-emerald-200'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Package className="w-3.5 h-3.5" />
                <span>{lang === 'en' ? 'Inventory / Cass' : 'Inventarios / Cass'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsBuildModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-extrabold bg-amber-500/20 border border-amber-400/70 text-amber-200 hover:bg-amber-500/30 cursor-pointer transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>{lang === 'en' ? 'Configure Build' : 'Configurar Build'}</span>
              </button>
            </nav>
          </div>

          {/* Right: Character Selector + Campaign/Adventure + ES|EN + Settings + Support + Security */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Compact Character Selector */}
            <div className="flex items-center gap-1.5 bg-[#121723] border border-slate-700/80 rounded-lg px-2 py-1">
              <User className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <select
                value={selectedCharIdx}
                onChange={(e) => {
                  const idx = Number(e.target.value);
                  setSelectedCharIdx(idx);
                  const ch = saveData.characters[idx];
                  if (ch?.activeWorldSlot === 'Adventure' && ch.adventure) {
                    setSelectedWorldMode('Adventure');
                  } else {
                    setSelectedWorldMode('Campaign');
                  }
                }}
                className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer"
              >
                {saveData.characters.map((ch, idx) => (
                  <option key={ch.saveFileName} value={idx} className="bg-[#111520] text-white">
                    #{ch.saveSlotIndex + 1} {resolveCharacterSummary(ch, lang)} •{' '}
                    {lang === 'en' ? 'PL' : 'Nv.'}
                    {ch.powerLevel}
                  </option>
                ))}
              </select>
              <span
                className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold"
                title={
                  lang === 'en'
                    ? `${activeCharacter.acquiredItemsCount} of ${activeCharacter.totalTrackableItemsCount} trackable items owned in profile.sav`
                    : `${activeCharacter.acquiredItemsCount} de ${activeCharacter.totalTrackableItemsCount} objetos coleccionables obtenidos en profile.sav`
                }
              >
                {collectionPct}%
              </span>
            </div>

            {/* Compact Campaign / Adventure Switch */}
            <div className="inline-flex rounded-lg bg-[#121723] border border-slate-800 p-0.5">
              <button
                type="button"
                onClick={() => setSelectedWorldMode('Campaign')}
                className={`px-2 py-0.5 rounded-md text-[11px] font-extrabold transition-all flex items-center gap-1 cursor-pointer ${
                  selectedWorldMode === 'Campaign'
                    ? 'bg-sky-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>{lang === 'en' ? 'Campaign' : 'Campaña'}</span>
                {activeCharacter.activeWorldSlot === 'Campaign' && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-current"
                    title={lang === 'en' ? 'Active in-game slot' : 'Modo activo en juego'}
                  />
                )}
              </button>

              <button
                type="button"
                disabled={!activeCharacter.adventure}
                onClick={() => setSelectedWorldMode('Adventure')}
                className={`px-2 py-0.5 rounded-md text-[11px] font-extrabold transition-all flex items-center gap-1 cursor-pointer disabled:opacity-35 ${
                  selectedWorldMode === 'Adventure'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>{lang === 'en' ? 'Adventure' : 'Aventura'}</span>
                {activeCharacter.activeWorldSlot === 'Adventure' && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-current"
                    title={lang === 'en' ? 'Active in-game slot' : 'Modo activo en juego'}
                  />
                )}
              </button>
            </div>

            {/* Instant Language Switcher (ES | EN) */}
            <div
              className="inline-flex rounded-lg bg-[#121723] border border-slate-700/80 p-0.5"
              title={
                lang === 'en'
                  ? 'Switch UI and catalog language instantly (ES / EN)'
                  : 'Alternar idioma de interfaz y catálogo al instante (ES / EN)'
              }
            >
              <button
                type="button"
                onClick={() => handleSwitchLanguage('es')}
                className={`px-1.5 py-0.5 rounded text-[10px] font-black cursor-pointer transition-colors ${
                  lang === 'es'
                    ? 'bg-amber-400 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                ES
              </button>
              <button
                type="button"
                onClick={() => handleSwitchLanguage('en')}
                className={`px-1.5 py-0.5 rounded text-[10px] font-black cursor-pointer transition-colors ${
                  lang === 'en'
                    ? 'bg-amber-400 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                EN
              </button>
            </div>

            {/* Settings Button (Platform & Save Path) */}
            <button
              type="button"
              onClick={() => {
                setIsWelcomeWizard(false);
                setShowSettingsModal(true);
              }}
              title={
                lang === 'en'
                  ? 'Settings: Select Platform (Steam / Epic / Xbox Game Pass) & Save Folder'
                  : 'Ajustes: Seleccionar Plataforma (Steam / Epic / Xbox Game Pass) y Ruta .sav'
              }
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#121723] border border-slate-700/80 text-slate-200 hover:text-white hover:border-sky-500/60 text-[11px] font-bold cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5 text-sky-400" />
              <span className="hidden 2xl:inline">
                {lang === 'en' ? 'Settings' : 'Ajustes'}
              </span>
            </button>

            {/* Discrete Support Button -> Opens https://ko-fi.com/choppx directly in external browser */}
            <button
              type="button"
              onClick={() =>
                openExternalUrl(
                  getValidatedKofiUrl(
                    config?.donationUrl || branding?.defaultDonationUrl || KOFI_URL
                  )
                )
              }
              title={
                lang === 'en'
                  ? `Support Choppx on Ko-fi (${KOFI_URL})`
                  : `Apoyar a Choppx en Ko-fi (${KOFI_URL})`
              }
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/15 border border-amber-500/45 text-amber-200 hover:bg-amber-500/25 text-[11px] font-extrabold cursor-pointer transition-colors"
            >
              <Coffee className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden lg:inline">
                {lang === 'en' ? 'Support' : 'Apoyar'}
              </span>
            </button>

            {/* Discrete About / GPL-3.0 Credits Modal Button */}
            <button
              type="button"
              onClick={() => setShowAboutModal(true)}
              title={
                lang === 'en'
                  ? 'About, Credits & GNU GPL-3.0 License'
                  : 'Acerca de, Créditos y Licencia GNU GPL-3.0'
              }
              className="p-1.5 rounded-lg bg-[#121723] border border-slate-700/80 text-slate-300 hover:text-white hover:border-sky-500/60 cursor-pointer"
            >
              <Info className="w-3.5 h-3.5 text-sky-400" />
            </button>

            {/* Discrete Icon: Reload */}
            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={refreshing}
              title={
                lang === 'en'
                  ? `Reload temporary save snapshot (Last copy: ${saveData.copyDurationMs.toFixed(1)} ms)`
                  : `Recargar copia temporal de los archivos .sav (Última copia: ${saveData.copyDurationMs.toFixed(1)} ms)`
              }
              className="p-1.5 rounded-lg bg-[#121723] border border-slate-700/80 text-slate-300 hover:text-white hover:border-sky-500/60 cursor-pointer"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-sky-400' : ''}`}
              />
            </button>

            {/* Discrete Icon: Backups */}
            <button
              type="button"
              onClick={() => setShowBackupsModal(true)}
              title={
                lang === 'en'
                  ? `Rotating Preventive Backups: ${backups.length}/10 .zip files saved.`
                  : `Respaldos Preventivos Rotativos: ${backups.length}/10 archivos .zip guardados.`
              }
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#121723] border border-slate-700/80 text-emerald-300 hover:border-emerald-500/60 text-[11px] font-bold cursor-pointer"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>{backups.length}</span>
            </button>

            {/* Discrete Icon: Zero-Write Security Status */}
            <button
              type="button"
              onClick={() => setShowBackupsModal(true)}
              title={
                lang === 'en'
                  ? `ZERO-WRITE ACTIVE (SaveGuardValidator) • RAM Snapshot (${saveData.copyDurationMs.toFixed(2)} ms) • Intact source: ${saveData.sourceFolder}`
                  : `CERO ESCRITURA ACTIVO (SaveGuardValidator) • Lectura por copia temporal en RAM (${saveData.copyDurationMs.toFixed(2)} ms) • Origen intacto: ${saveData.sourceFolder}`
              }
              className="p-1.5 rounded-lg bg-emerald-950/60 border border-emerald-600/50 text-emerald-400 hover:bg-emerald-900/60 cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* 2. Micro-Bar of Active Build (1 single compact line, ~32px) */}
      <div className="bg-[#0e121b] border-b border-slate-800/80 px-3 sm:px-4 py-1">
        <div className="max-w-[1760px] w-full mx-auto flex items-center justify-between gap-2 flex-wrap text-xs">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span className="inline-flex items-center gap-1 font-extrabold text-amber-300 shrink-0">
              <SlidersHorizontal className="w-3 h-3" />
              {activePreset.name}:
            </span>
            <span className="text-[11px] text-slate-400 shrink-0">
              {activePreset.activeSynergyTags.length} tags ·{' '}
              {activePreset.wishlistItemIds.length} Wishlist
            </span>

            <div className="flex items-center gap-1 flex-wrap">
              {activePreset.activeSynergyTags.slice(0, 7).map((tagId) => {
                const label = resolveTagLabel(
                  lookup.tagDefById.get(tagId),
                  tagId,
                  lang
                );
                return (
                  <span
                    key={tagId}
                    className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-200 border border-amber-400/40"
                  >
                    ⚡ {label}
                  </span>
                );
              })}
              {activePreset.activeSynergyTags.length > 7 && (
                <span className="text-[10px] text-slate-400">
                  +{activePreset.activeSynergyTags.length - 7}{' '}
                  {lang === 'en' ? 'more' : 'más'}
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsBuildModalOpen(true)}
            className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-amber-200 text-[11px] font-bold cursor-pointer shrink-0"
          >
            {lang === 'en'
              ? '[Edit Build / Import Toolkit]'
              : '[Editar Build / Importar Toolkit]'}
          </button>
        </div>
      </div>

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1760px] w-full mx-auto px-3 sm:px-4 py-2.5">
        {activeTab === 'world' ? (
          <WorldExplorerView
            worldData={activeWorldData}
            character={activeCharacter}
            catalog={catalog}
            lookup={lookup}
            activePreset={activePreset}
            lang={lang}
            hideOwnedItems={Boolean(config?.hideOwnedItems)}
            onToggleHideOwned={() => {
              if (!config) return;
              handleUpdateConfig({
                ...config,
                hideOwnedItems: !config.hideOwnedItems,
              });
            }}
            onToggleWishlist={handleToggleWishlistQuick}
          />
        ) : (
          <InventoryOverviewPanel
            character={activeCharacter}
            catalog={catalog}
            lookup={lookup}
            activePreset={activePreset}
            lang={lang}
            onToggleWishlist={handleToggleWishlistQuick}
          />
        )}
      </main>

      {/* Slide-Over Modal / Drawer for Build Engine */}
      {isBuildModalOpen && config && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex justify-end"
          onClick={() => setIsBuildModalOpen(false)}
        >
          <div
            className="w-full max-w-5xl bg-[#0d111a] border-l border-slate-700 h-full overflow-y-auto p-4 sm:p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                {lang === 'en'
                  ? 'Active Build & Wishlist Configuration'
                  : 'Configuración de Build Activa y Wishlist'}
              </span>
              <button
                type="button"
                onClick={() => setIsBuildModalOpen(false)}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white cursor-pointer"
              >
                <X className="w-4 h-4" />{' '}
                {lang === 'en' ? 'Close Panel' : 'Cerrar Panel'}
              </button>
            </div>

            <BuildConfiguratorPanel
              config={config}
              activePreset={activePreset}
              catalog={catalog}
              lookup={lookup}
              activeCharacter={activeCharacter}
              lang={lang}
              onUpdateConfig={handleUpdateConfig}
            />
          </div>
        </div>
      )}

      {/* Backups Modal */}
      {showBackupsModal && (
        <BackupsModal
          saveData={saveData}
          backups={backups}
          lang={lang}
          onClose={() => setShowBackupsModal(false)}
          onCreateManualBackup={handleCreateManualBackup}
        />
      )}

      {/* Settings / First-Run Platform Wizard Modal */}
      {showSettingsModal && (
        <SettingsModal
          lang={lang}
          config={config}
          isWelcomeWizard={isWelcomeWizard}
          canClose={true}
          onClose={() => setShowSettingsModal(false)}
          onChangeLanguage={handleSwitchLanguage}
          onAppliedSaveFolder={handleAppliedSaveFolder}
        />
      )}

      {/* About, Legal GPL-3.0 & Donations Modal */}
      {showAboutModal && (
        <AboutSupportModal
          lang={lang}
          config={config}
          branding={branding}
          onClose={() => setShowAboutModal(false)}
        />
      )}
    </div>
  );
};
