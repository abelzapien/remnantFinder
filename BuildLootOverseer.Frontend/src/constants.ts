/**
 * Identidad oficial del creador y enlaces públicos de soporte.
 * Edita KOFI_HANDLE o KOFI_URL aquí si alguna vez necesitas actualizar el enlace.
 */
export const APP_AUTHOR = 'Choppx';
export const APP_VERSION = '1.0.0';
export const APP_LICENSE = 'GPL-3.0';

export const KOFI_HANDLE = 'choppx';
export const KOFI_URL = `https://ko-fi.com/${KOFI_HANDLE}`;

/**
 * Valida que el enlace de Ko-fi tenga un protocolo http/https válido y el handle exacto configurado,
 * cayendo de forma segura en KOFI_URL si no se especificó otro válido.
 */
export function getValidatedKofiUrl(candidateUrl?: string | null): string {
  const raw = (candidateUrl || '').trim();
  if (!raw || raw === 'https://ko-fi.com/' || raw === 'https://ko-fi.com') {
    return KOFI_URL;
  }

  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return KOFI_URL;
    }
    if (url.hostname.toLowerCase().endsWith('ko-fi.com')) {
      const handle = url.pathname.replace(/^\/+|\/+$/g, '');
      if (!handle || !/^[a-zA-Z0-9_-]+$/.test(handle)) {
        return KOFI_URL;
      }
    }
    return url.toString();
  } catch {
    return KOFI_URL;
  }
}
