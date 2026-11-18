import React, { useState } from 'react';
import {
  Archive,
  CheckCircle2,
  Clock,
  FolderLock,
  HardDriveDownload,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { AppLanguage, BackupEntryInfo, SaveDatasetDto } from '../types';

interface BackupsModalProps {
  saveData: SaveDatasetDto;
  backups: BackupEntryInfo[];
  lang?: AppLanguage;
  onClose: () => void;
  onCreateManualBackup: () => Promise<void>;
}

export const BackupsModal: React.FC<BackupsModalProps> = ({
  saveData,
  backups,
  lang = 'es',
  onClose,
  onCreateManualBackup,
}) => {
  const [creating, setCreating] = useState(false);

  const handleManual = async () => {
    setCreating(true);
    try {
      await onCreateManualBackup();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#111520] border border-slate-700 rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
            <div>
              <h3 className="text-base font-extrabold text-white">
                {lang === 'en'
                  ? 'Save File Security & Rotating Backups (.zip)'
                  : 'Seguridad de Archivos .sav y Respaldos Rotativos (.zip)'}
              </h3>
              <p className="text-xs text-slate-400">
                {lang === 'en'
                  ? 'Strict Zero-Write Mode active • Automatic history of your last 10 backups'
                  : 'Modo Estricto Cero Escritura activo • Historial automático de los últimos 10 backups'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-[#0b0e16] border border-emerald-800/50 rounded-xl p-3.5 space-y-1">
              <div className="text-[11px] font-bold text-emerald-400 uppercase flex items-center gap-1.5">
                <FolderLock className="w-3.5 h-3.5" />{' '}
                {lang === 'en' ? 'Zero Write to Game' : 'Cero Escritura en Juego'}
              </div>
              <div className="text-xs text-slate-200 font-semibold">
                SaveGuardValidator
              </div>
              <div className="text-[11px] text-slate-400 truncate" title={saveData.sourceFolder}>
                {lang === 'en' ? 'Source' : 'Origen'}: {saveData.sourceFolder}
              </div>
            </div>

            <div className="bg-[#0b0e16] border border-sky-800/50 rounded-xl p-3.5 space-y-1">
              <div className="text-[11px] font-bold text-sky-400 uppercase flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />{' '}
                {lang === 'en' ? 'Non-Blocking Snapshot' : 'Copia Temporal No Bloqueante'}
              </div>
              <div className="text-xs text-slate-200 font-semibold">
                RAM Copy: {saveData.copyDurationMs.toFixed(2)} ms
              </div>
              <div
                className="text-[11px] text-slate-400 truncate"
                title={saveData.tempSnapshotFolder}
              >
                Snapshot: {saveData.tempSnapshotFolder}
              </div>
            </div>

            <div className="bg-[#0b0e16] border border-amber-800/50 rounded-xl p-3.5 space-y-1">
              <div className="text-[11px] font-bold text-amber-400 uppercase flex items-center gap-1.5">
                <Archive className="w-3.5 h-3.5" />{' '}
                {lang === 'en' ? 'Rotating Backups' : 'Respaldos Rotativos'}
              </div>
              <div className="text-xs text-slate-200 font-semibold">
                {backups.length} / 10 .zip
              </div>
              <div className="text-[11px] text-slate-400">
                {lang === 'en'
                  ? 'Auto-rotates on World Stone checkpoints'
                  : 'Rotación automática al tocar piedra de mundo'}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2">
            <h4 className="text-sm font-bold text-white">
              {lang === 'en'
                ? 'Compressed Backup History (.zip)'
                : 'Historial de Respaldos Comprimidos (.zip)'}
            </h4>
            <button
              type="button"
              onClick={handleManual}
              disabled={creating}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-bold text-xs hover:bg-emerald-400 disabled:opacity-50 cursor-pointer"
            >
              {creating ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <HardDriveDownload className="w-3.5 h-3.5" />
              )}
              {lang === 'en' ? 'Create .zip Backup Now' : 'Crear Respaldo .zip Ahora'}
            </button>
          </div>

          <div className="bg-[#0b0e16] border border-slate-800 rounded-xl divide-y divide-slate-800/80">
            {backups.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                {lang === 'en'
                  ? 'No backups recorded yet.'
                  : 'No hay respaldos registrados todavía.'}
              </div>
            ) : (
              backups.map((b, idx) => (
                <div
                  key={b.fileName}
                  className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-900/50"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="text-xs font-bold text-white font-mono">
                        {b.fileName}
                      </span>
                      {idx === 0 && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                          {lang === 'en' ? 'LATEST' : 'MÁS RECIENTE'}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate" title={b.fullPath}>
                      {lang === 'en' ? 'Path' : 'Ruta'}: {b.fullPath}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-300 shrink-0">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px]">
                      {(b.sizeBytes / 1024).toFixed(1)} KB
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {new Date(b.createdAtUtc).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
