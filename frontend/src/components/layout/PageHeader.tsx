import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, children, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-border)] pb-4 sm:mb-6 sm:gap-4 sm:pb-5',
        className
      )}
    >
      <div className="min-w-0">
        <h1 className="text-2xl font-medium tracking-tight text-[var(--color-foreground)]">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm leading-relaxed text-[var(--color-muted-foreground)]">
            {description}
          </p>
        )}
      </div>
      {children ? (
        <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto">{children}</div>
      ) : null}
    </div>
  );
}
