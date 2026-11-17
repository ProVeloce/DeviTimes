import { cn } from '@/lib/utils';
import { assetUrl } from '@/lib/asset-url';

type AppLogoProps = {
  size?: number;
  className?: string;
  rounded?: 'lg' | 'xl' | '2xl' | 'full';
};

const roundedClass = {
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
  full: 'rounded-full',
};

/** Branded SVT logo (PNG with SVG fallback in public/). */
export function AppLogo({ size = 36, className, rounded = 'lg' }: AppLogoProps) {
  const logoPng = assetUrl('logo.png');
  const logoSvg = assetUrl('logo.svg');

  return (
    <img
      src={logoPng}
      alt="Devi Times"
      width={size}
      height={size}
      className={cn('shrink-0 object-contain', roundedClass[rounded], className)}
      onError={(e) => {
        const img = e.currentTarget;
        if (img.src.includes('logo.svg')) return;
        img.src = logoSvg;
      }}
    />
  );
}
