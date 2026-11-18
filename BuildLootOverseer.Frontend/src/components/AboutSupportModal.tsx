import React from 'react';
import {
  Coffee,
  ExternalLink,
  Heart,
  Scale,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';
import { APP_AUTHOR, APP_VERSION, getValidatedKofiUrl, KOFI_URL } from '../constants';
import { AppBrandingDto, AppLanguage, UserAppConfigDto } from '../types';
import { openExternalUrl } from '../utils/i18n';

interface AboutSupportModalProps {
  lang: AppLanguage;
  config: UserAppConfigDto | null;
  branding: AppBrandingDto | null;
  onClose: () => void;
}

export const AboutSupportModal: React.FC<AboutSupportModalProps> = ({
  lang,
  config,
  branding,
  onClose,
}) => {
  const supportUrl = getValidatedKofiUrl(
    config?.donationUrl || branding?.defaultDonationUrl || KOFI_URL
  );
  const authorName = branding?.author || APP_AUTHOR;
  const versionLabel = branding?.appVersion || APP_VERSION;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#10141f] border border-slate-700 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Original Custom Vector App Emblem */}
        <div className="px-5 py-4 border-b border-slate-800 bg-[#0c1018] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src="/overseer-icon.svg"
              alt="Overseer Emblem"
              className="w-10 h-10 rounded-xl shadow-md shrink-0"
            />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-black text-white">
                  Remnant 2 Build &amp; Loot Overseer
                </h3>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-400 text-slate-950">
                  v{versionLabel}
                </span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40">
                  GNU GPL-3.0
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {lang === 'en'
                  ? `Created by ${authorName} · About, License & Community Support`
                  : `Creado por ${authorName} · Acerca de, Licencia y Apoyo`}
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
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* 1. Ko-fi Support Card */}
          <div className="rounded-xl bg-gradient-to-r from-amber-950/45 via-[#151926] to-[#111520] border border-amber-500/50 p-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="space-y-1 max-w-md">
              <div className="text-sm font-extrabold text-amber-300 flex items-center gap-1.5">
                <Coffee className="w-4 h-4 text-amber-400" />
                {lang === 'en'
                  ? `Support ${authorName} on Ko-fi`
                  : `Apoyar a ${authorName} en Ko-fi`}
              </div>
              <p className="text-slate-300 leading-relaxed">
                {lang === 'en'
                  ? 'Remnant 2 Build & Loot Overseer is 100% free, ad-free, and open-source. If it helped you farm your build faster, you can buy Choppx a coffee!'
                  : 'Remnant 2 Build & Loot Overseer es 100% gratuito, sin anuncios y de código abierto. Si te ayudó a completar tu Build más rápido, ¡puedes invitarle un café a Choppx!'}
              </p>
              <div className="text-[11px] text-amber-200/80 font-mono">{supportUrl}</div>
            </div>

            <button
              type="button"
              onClick={() => openExternalUrl(supportUrl)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs shadow-md cursor-pointer shrink-0 transition-colors"
            >
              <Heart className="w-3.5 h-3.5 fill-rose-600 text-rose-600" />
              <span>☕ {lang === 'en' ? 'Support on Ko-fi' : 'Apoyar en Ko-fi'}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 2. License: GNU GPL-3.0 */}
          <div className="rounded-xl bg-[#0b0e16] border border-slate-800 p-3.5 space-y-1.5">
            <div className="font-extrabold text-slate-200 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 text-emerald-400" />
                {lang === 'en'
                  ? 'License: GNU General Public License v3.0 (GPL-3.0)'
                  : 'Licencia: GNU General Public License v3.0 (GPL-3.0)'}
              </span>
              <button
                type="button"
                onClick={() => openExternalUrl('https://www.gnu.org/licenses/gpl-3.0.html')}
                className="text-[11px] text-sky-400 hover:text-sky-300 inline-flex items-center gap-1 cursor-pointer"
              >
                gnu.org/licenses/gpl-3.0 <ExternalLink className="w-3 h-3" />
              </button>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              {lang === 'en'
                ? 'This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License v3.0. Provided "AS IS" without warranty of any kind.'
                : 'Este programa es software libre: puedes redistribuirlo y/o modificarlo bajo los términos de la Licencia Pública General GNU v3.0 (GPL-3.0). Se distribuye "TAL CUAL", sin garantías de ningún tipo.'}
            </p>
          </div>

          {/* 3. Base Open-Source Projects */}
          <div className="rounded-xl bg-[#0b0e16] border border-slate-800 p-4 space-y-2.5">
            <div className="font-extrabold text-white flex items-center gap-1.5 text-xs uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-sky-400" />
              {lang === 'en'
                ? 'Base Open-Source Projects & Credits'
                : 'Proyectos Base Open Source y Créditos'}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() =>
                  openExternalUrl('https://github.com/Angelore/remnant-two-overseer')
                }
                className="text-left p-3 rounded-xl bg-[#101522] hover:bg-[#151c2d] border border-slate-800 hover:border-sky-500/50 transition-colors cursor-pointer space-y-1"
              >
                <div className="font-bold text-sky-300 flex items-center justify-between">
                  <span>Angelore / RemnantOverseer</span>
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">
                  {lang === 'en'
                    ? 'Save decryption & world-roll analysis engine (lib.remnant2.analyzer & lib.remnant2.saves).'
                    : 'Motor base de desencriptado y análisis de archivos .sav (lib.remnant2.analyzer y lib.remnant2.saves).'}
                </p>
              </button>

              <button
                type="button"
                onClick={() =>
                  openExternalUrl('https://github.com/joshpayette/remnant2-toolkit')
                }
                className="text-left p-3 rounded-xl bg-[#101522] hover:bg-[#151c2d] border border-slate-800 hover:border-purple-500/50 transition-colors cursor-pointer space-y-1"
              >
                <div className="font-bold text-purple-300 flex items-center justify-between">
                  <span>joshpayette / remnant2-toolkit</span>
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">
                  {lang === 'en'
                    ? 'Community item database, synergy tags, stats, and build URL ecosystem.'
                    : 'Base de datos comunitaria de ítems, etiquetas de sinergia, estadísticas e importación de builds.'}
                </p>
              </button>
            </div>
          </div>

          {/* 4. Mandatory Legal Notice */}
          <div className="rounded-xl bg-slate-900/90 border border-slate-700/80 p-3.5 space-y-1">
            <div className="font-bold text-amber-300 flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
              <ShieldAlert className="w-3.5 h-3.5" />
              {lang === 'en' ? 'Legal Notice' : 'Aviso Legal'}
            </div>
            <p className="text-[11px] text-slate-200 font-medium leading-relaxed">
              {lang === 'en'
                ? 'Free, unofficial fan-made tool. Not affiliated with, associated with, or endorsed by Gunfire Games or Arc Games.'
                : 'Herramienta fan no oficial y gratuita. No afiliada, asociada ni respaldada por Gunfire Games ni Arc Games.'}
            </p>
          </div>
        </div>

        {/* Window Footer: Official Creator Identity + Base Credits Underneath */}
        <div className="px-5 py-3.5 border-t border-slate-800 bg-[#0b0e16] text-center space-y-1">
          <div className="text-xs font-extrabold text-white">
            {lang === 'en'
              ? `Developed by ${authorName} · Open Source (GPL-3.0)`
              : `Desarrollado por ${authorName} · Open Source (GPL-3.0)`}
          </div>
          <div className="text-[11px] text-slate-400 flex items-center justify-center gap-1.5 flex-wrap">
            <span>{lang === 'en' ? 'Credits:' : 'Créditos:'}</span>
            <button
              type="button"
              onClick={() =>
                openExternalUrl('https://github.com/Angelore/remnant-two-overseer')
              }
              className="text-sky-400 hover:text-sky-300 font-semibold cursor-pointer"
            >
              Angelore/RemnantOverseer
            </button>
            <span>&bull;</span>
            <button
              type="button"
              onClick={() =>
                openExternalUrl('https://github.com/joshpayette/remnant2-toolkit')
              }
              className="text-purple-300 hover:text-purple-200 font-semibold cursor-pointer"
            >
              joshpayette/remnant2-toolkit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
