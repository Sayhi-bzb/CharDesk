import type { ReactNode } from 'react';

type SettingsContentSectionProps = {
  heading: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function SettingsContentSection({ heading, children, footer }: SettingsContentSectionProps) {
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <h2 className="shrink-0 whitespace-nowrap pe-8 text-sm font-medium tracking-tight">{heading}</h2>
      <div
        data-slot="settings-section-scroll"
        className="mt-3 min-h-0 w-full flex-1 overflow-x-hidden overflow-y-auto pe-1"
      >
        <div className="w-full min-w-0">{children}</div>
      </div>
      {footer ? (
        <div data-slot="settings-content-footer" className="shrink-0 pt-3">
          {footer}
        </div>
      ) : null}
    </section>
  );
}
