import { BRAND_LOGO_DATA_URI } from './brand-logo-data';
export { BRAND_LOGO_DATA_URI };

export function resolveReceiptLogoSrc(logoUrl?: string): string {
  const url = logoUrl?.trim();
  if (url) return url;
  return BRAND_LOGO_DATA_URI;
}
