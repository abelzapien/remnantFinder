import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FolderOpen,
  Gamepad2,
  HardDrive,
  Languages,
  Monitor,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import {
  AppLanguage,
  PlatformDiscoveryItemDto,
  PlatformDiscoveryResponseDto,
  SaveDatasetDto,
  SaveFolderInspectionDto,
  UserAppConfigDto,
} from '../types';

interface SettingsModalProps {
  lang: AppLanguage;
  config: UserAppConfigDto | null;
  isWelcomeWizard?: boolean;
  canClose?: boolean;
  onClose: () => void;
  onChangeLanguage: (nextLang: AppLanguage) => void;
  onAppliedSaveFolder: (nextConfig: UserAppConfigDto, nextSave: SaveDatasetDto) => void;
}

type PlatformChoice = 'Steam' | 'Epic' | 'Xbox' | 'Custom';

export const SettingsModal: React.FC<SettingsModalProps> = ({
  lang,
  config,
  isWelcomeWizard = false,
  canClose = true,
  onClose,
  onChangeLanguage,
  onAppliedSaveFolder,
}) => {
  const [discovery, setDiscovery] = useState<PlatformDiscoveryResponseDto | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformChoice>('Steam');
  const [folderPath, setFolderPath] = useState<string>('');
  const [inspection, setInspection] = useState<SaveFolderInspectionDto | null>(null);
  const [loadingDiscovery, setLoadingDiscovery] = useState<boolean>(true);
  const [validating, setValidating] = useState<boolean>(false);
  const [browsing, setBrowsing] = useState<boolean>(false);
  const [applying, setApplying] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingDiscovery(true);
      try {
        const res = await fetch('/api/save/platforms');
        if (!res.ok) return;
        const data: PlatformDiscoveryResponseDto = await res.json();
        if (cancelled) return;
        setDiscovery(data);

        const initialPath =
          config?.customSaveFolder ||
          data.activeSaveFolder ||
          data.platforms.find((p) => p.hasValidSaves)?.recommendedPath ||
          data.platforms[0]?.recommendedPath ||
          '';

        const inferredPlatform =
          (config?.savePlatform as PlatformChoice) ||
          (data.activeInspection?.platformType as PlatformChoice) ||
          'Steam';

        setSelectedPlatform(
          ['Steam', 'Epic', 'Xbox', 'Custom'].includes(inferredPlatform)
            ? inferredPlatform
            : 'Steam'
        );
        setFolderPath(initialPath);
        setInspection(data.activeInspection);
      } catch {
        // Ignore initial discovery error
      } finally {
        if (!cancelled) setLoadingDiscovery(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [config?.customSaveFolder, config?.savePlatform]);

  const validatePathRemote = async (candidate: string) => {
    setValidating(true);
    setErrorText(null);
    try {
      const res = await fetch('/api/save/validate-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: candidate }),
      });
      if (res.ok) {
        const insp: SaveFolderInspectionDto = await res.json();
        setInspection(insp);
      }
    } catch {
      // Ignore network error
    } finally {
      setValidating(false);
    }
  };

  const handleSelectPlatformCard = (plat: PlatformChoice) => {
    setSelectedPlatform(plat);
    setErrorText(null);
    if (plat === 'Custom') {
      return;
    }
    const found: PlatformDiscoveryItemDto | undefined = discovery?.platforms.find(
      (p) => p.platform.toLowerCase() === plat.toLowerCase()
    );
    if (found) {
      const target = found.recommendedPath || found.baseFolder;
      setFolderPath(target);
      validatePathRemote(target);
    }
  };

  const handleSelectAccountSubfolder = (fullPath: string, plat: PlatformChoice) => {
    setSelectedPlatform(plat);
    setFolderPath(fullPath);
    validatePathRemote(fullPath);
  };

  const handleBrowseFolder = async () => {
    setBrowsing(true);
    setErrorText(null);
    try {
      const res = await fetch('/api/save/browse-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initialPath: folderPath }),
      });
      if (res.ok) {
        const body = await res.json();
        if (!body.cancelled && body.selectedPath) {
          setFolderPath(body.selectedPath);
          if (body.inspection) {
            setInspection(body.inspection);
            const detected = body.inspection.platformType as PlatformChoice;
            if (['Steam', 'Epic', 'Xbox'].includes(detected)) {
              setSelectedPlatform(detected);
            } else {
              setSelectedPlatform('Custom');
            }
          } else {
            setSelectedPlatform('Custom');
            validatePathRemote(body.selectedPath);
          }
        }
      }
    } finally {
      setBrowsing(false);
    }
  };

  const handleApplyAndSave = async () => {
    if (!folderPath.trim()) return;
    setApplying(true);
    setErrorText(null);
    try {
      const res = await fetch('/api/save/apply-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: selectedPlatform,
          path: folderPath.trim(),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body.inspection) setInspection(body.inspection);
        setErrorText(
          body.error ||
            (lang === 'en'
              ? 'Could not detect valid Remnant 2 save files in that folder.'
              : 'No se detectaron archivos de guardado válidos en esa carpeta.')
        );
        return;
      }

      if (body.config && body.save) {
        onAppliedSaveFolder(body.config, body.save);
        onClose();
      }
    } catch (err: any) {
      setErrorText(err?.message || 'Error');
    } finally {
      setApplying(false);
    }
  };

  const steamInfo = discovery?.platforms.find((p) => p.platform === 'Steam');
  const epicInfo = discovery?.platforms.find((p) => p.platform === 'Epic');
  const xboxInfo = discovery?.platforms.find((p) => p.platform === 'Xbox');

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={() => {
        if (canClose) onClose();
      }}
    >
      <div
        className="bg-[#10141f] border border-slate-700 rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between gap-3 bg-[#0c1018]">
          <div className="flex items-center gap-2.5">
            {isWelcomeWizard ? (
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-400 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-amber-400" />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-xl bg-sky-500/20 border border-sky-400 flex items-center justify-center shrink-0">
                <Settings className="w-4 h-4 text-sky-400" />
              </div>
            )}
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-white">
                {isWelcomeWizard
                  ? lang === 'en'
                    ? 'Welcome! Select Your Platform & Save Folder'
                    : '¡Bienvenido! Selecciona tu Plataforma y Carpeta de Guardados'
                  : lang === 'en'
                  ? 'Settings · Platform & Save Folder (.sav / wgs)'
                  : 'Ajustes · Plataforma y Ruta de Guardados (.sav / wgs)'}
              </h3>
              <p className="text-[11px] text-slate-400">
                {lang === 'en'
                  ? '100% Read-Only via isolated RAM/Temp copy (Zero Write to game saves)'
                  : 'Lectura 100% segura por copia temporal aislada (Cero Escritura en tus archivos del juego)'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Quick Language Switch inside Wizard/Settings */}
            <div className="inline-flex rounded-lg bg-[#090c13] border border-slate-800 p-0.5">
              <button
                type="button"
                onClick={() => onChangeLanguage('es')}
                className={`px-2 py-0.5 rounded text-[11px] font-extrabold cursor-pointer ${
                  lang === 'es' ? 'bg-amber-400 text-slate-950' : 'text-slate-400 hover:text-white'
                }`}
              >
                ES
              </button>
              <button
                type="button"
                onClick={() => onChangeLanguage('en')}
                className={`px-2 py-0.5 rounded text-[11px] font-extrabold cursor-pointer ${
                  lang === 'en' ? 'bg-amber-400 text-slate-950' : 'text-slate-400 hover:text-white'
                }`}
              >
                EN
              </button>
            </div>

            {canClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Step 1: Explicit Platform Cards */}
          <div className="space-y-2">
            <div className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">
              {lang === 'en'
                ? '1. Choose your Remnant 2 Platform'
                : '1. Elige tu plataforma de Remnant 2'}
            </div>

            {loadingDiscovery ? (
              <div className="py-6 text-center text-slate-400 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
                <span>
                  {lang === 'en'
                    ? 'Scanning Steam, Epic Games, and Xbox Game Pass folders...'
                    : 'Escaneando rutas de Steam, Epic Games y Xbox Game Pass...'}
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                {/* STEAM CARD */}
                <div
                  onClick={() => handleSelectPlatformCard('Steam')}
                  className={`rounded-xl border p-3 cursor-pointer transition-all space-y-2 ${
                    selectedPlatform === 'Steam'
                      ? 'bg-sky-950/45 border-sky-400 shadow-sm'
                      : 'bg-[#0b0e16] border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-white flex items-center gap-1.5 text-xs">
                      <Monitor className="w-4 h-4 text-sky-400" /> Steam
                    </span>
                    {steamInfo?.hasValidSaves && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        {lang === 'en' ? 'Detected' : 'Detectado'}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono break-all">
                    %USERPROFILE%\Saved Games\Remnant2\Steam\
                  </div>

                  {steamInfo && steamInfo.accounts.length > 0 && (
                    <div className="pt-1 space-y-1">
                      <div className="text-[10px] text-slate-300 font-semibold">
                        {lang === 'en' ? 'Steam ID Subfolders:' : 'Subcarpetas de ID detectadas:'}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {steamInfo.accounts.map((acc) => {
                          const activeAcc =
                            folderPath.toLowerCase() === acc.fullPath.toLowerCase();
                          return (
                            <button
                              key={acc.fullPath}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectAccountSubfolder(acc.fullPath, 'Steam');
                              }}
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border cursor-pointer ${
                                activeAcc
                                  ? 'bg-sky-400 text-slate-950 border-sky-300'
                                  : 'bg-slate-900 text-slate-300 border-slate-700 hover:text-white'
                              }`}
                            >
                              ID: {acc.accountId} ({acc.worldSaveFiles.length} save)
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* EPIC GAMES CARD */}
                <div
                  onClick={() => handleSelectPlatformCard('Epic')}
                  className={`rounded-xl border p-3 cursor-pointer transition-all space-y-2 ${
                    selectedPlatform === 'Epic'
                      ? 'bg-amber-950/35 border-amber-400 shadow-sm'
                      : 'bg-[#0b0e16] border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-white flex items-center gap-1.5 text-xs">
                      <HardDrive className="w-4 h-4 text-amber-400" /> Epic Games
                    </span>
                    {epicInfo?.hasValidSaves && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        {lang === 'en' ? 'Detected' : 'Detectado'}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono break-all">
                    %USERPROFILE%\Saved Games\Remnant2\Epic\
                  </div>

                  {epicInfo && epicInfo.accounts.length > 0 && (
                    <div className="pt-1 space-y-1">
                      <div className="text-[10px] text-slate-300 font-semibold">
                        {lang === 'en' ? 'Epic Profiles:' : 'Perfiles detectados:'}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {epicInfo.accounts.map((acc) => {
                          const activeAcc =
                            folderPath.toLowerCase() === acc.fullPath.toLowerCase();
                          return (
                            <button
                              key={acc.fullPath}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectAccountSubfolder(acc.fullPath, 'Epic');
                              }}
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border cursor-pointer ${
                                activeAcc
                                  ? 'bg-amber-400 text-slate-950 border-amber-300'
                                  : 'bg-slate-900 text-slate-300 border-slate-700 hover:text-white'
                              }`}
                            >
                              {acc.accountId} ({acc.worldSaveFiles.length} save)
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* XBOX / PC GAME PASS CARD */}
                <div
                  onClick={() => handleSelectPlatformCard('Xbox')}
                  className={`rounded-xl border p-3 cursor-pointer transition-all space-y-2 ${
                    selectedPlatform === 'Xbox'
                      ? 'bg-emerald-950/35 border-emerald-400 shadow-sm'
                      : 'bg-[#0b0e16] border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-white flex items-center gap-1.5 text-xs">
                      <Gamepad2 className="w-4 h-4 text-emerald-400" /> Xbox / Game Pass
                    </span>
                    {xboxInfo?.hasValidSaves && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        {lang === 'en' ? 'Detected' : 'Detectado'}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono break-all">
                    %LOCALAPPDATA%\Packages\PerfectWorldEntertainment...\SystemAppData\wgs
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {lang === 'en'
                      ? 'Reads UWP containers.index & save blobs automatically.'
                      : 'Lee contenedores containers.index de Game Pass automáticamente.'}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Step 2: Active Folder Input + Manual Folder Picker Button */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">
                {lang === 'en'
                  ? '2. Active Save Directory Path'
                  : '2. Ruta de Carpeta de Guardado Seleccionada'}
              </span>

              <button
                type="button"
                onClick={handleBrowseFolder}
                disabled={browsing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-bold text-xs cursor-pointer transition-colors"
              >
                <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                {browsing
                  ? lang === 'en'
                    ? 'Opening...'
                    : 'Abriendo...'
                  : lang === 'en'
                  ? 'Change folder manually...'
                  : 'Cambiar carpeta manualmente...'}
              </button>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={folderPath}
                onChange={(e) => {
                  setFolderPath(e.target.value);
                  setSelectedPlatform('Custom');
                }}
                onBlur={() => {
                  if (folderPath.trim()) validatePathRemote(folderPath.trim());
                }}
                placeholder="C:\Users\...\Saved Games\Remnant2\Steam\..."
                className="flex-1 bg-[#090c13] border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-sky-400"
              />
              <button
                type="button"
                onClick={() => validatePathRemote(folderPath)}
                disabled={validating || !folderPath.trim()}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs cursor-pointer shrink-0"
              >
                {validating
                  ? '...'
                  : lang === 'en'
                  ? 'Verify'
                  : 'Verificar'}
              </button>
            </div>

            {/* Live Green / Warning Detection Indicator */}
            {inspection && (
              <div
                className={`rounded-xl border px-3.5 py-2.5 flex items-start gap-2.5 ${
                  inspection.isValid
                    ? 'bg-emerald-950/45 border-emerald-500/60 text-emerald-100'
                    : 'bg-amber-950/35 border-amber-500/50 text-amber-200'
                }`}
              >
                {inspection.isValid ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                )}
                <div className="space-y-0.5 min-w-0">
                  <div className="font-extrabold text-xs">
                    {inspection.isValid
                      ? lang === 'en'
                        ? 'profile.sav and world save files detected successfully'
                        : 'Archivos profile.sav y save detectados correctamente'
                      : lang === 'en'
                      ? 'No profile.sav or valid container detected in this folder yet'
                      : 'Aún no se detectan archivos profile.sav ni contenedores válidos en esta ruta'}
                  </div>
                  <div className="text-[11px] opacity-90 font-mono break-all">
                    {inspection.normalizedPath}
                  </div>
                  {inspection.isValid && (
                    <div className="text-[11px] text-emerald-300 font-semibold">
                      {lang === 'en' ? 'Detected files:' : 'Archivos detectados:'}{' '}
                      profile.sav
                      {inspection.worldSaveFiles.length > 0
                        ? ` + ${inspection.worldSaveFiles.join(', ')}`
                        : ''}
                    </div>
                  )}
                </div>
              </div>
            )}

            {errorText && (
              <div className="rounded-xl bg-red-950/50 border border-red-600/60 px-3.5 py-2.5 text-red-200 font-semibold">
                {errorText}
              </div>
            )}
          </div>

          {/* Safety Reminder Box */}
          <div className="rounded-xl bg-[#0b0f18] border border-slate-800 px-3.5 py-2.5 flex items-center gap-2.5 text-[11px] text-slate-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              {lang === 'en'
                ? 'Strict Zero-Write Protection: This app NEVER writes to or locks your Remnant 2 save folder. All analysis runs on an isolated temporary snapshot.'
                : 'Protección Estricta Cero Escritura: La app jamás modifica ni bloquea tu carpeta del juego. Todo el desencriptado corre sobre una copia temporal aislada.'}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-[#0c1018] flex items-center justify-between gap-3">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <Languages className="w-3.5 h-3.5 text-slate-400" />
            <span>
              {lang === 'en' ? 'Language:' : 'Idioma:'}{' '}
              <strong className="text-slate-200">
                {lang === 'en' ? 'English (EN)' : 'Español (ES)'}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            {canClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold cursor-pointer"
              >
                {lang === 'en' ? 'Cancel' : 'Cancelar'}
              </button>
            )}
            <button
              type="button"
              onClick={handleApplyAndSave}
              disabled={applying || !folderPath.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 text-xs font-black cursor-pointer transition-colors"
            >
              {applying && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              {lang === 'en'
                ? 'Save & Load Saves'
                : 'Guardar y Cargar Partida'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
