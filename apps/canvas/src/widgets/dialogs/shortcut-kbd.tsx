import { formatShortcutLabel, getShortcutDisplayStrokes } from '@/domains/actions/public';
import type { ShortcutSequence } from '@/domains/editor/public';
import { Kbd, KbdGroup } from '@chardesk/ui';

type ShortcutKbdProps = {
  shortcut: ShortcutSequence | string;
  className?: string;
  invalid?: boolean;
};

export function ShortcutKbd({ shortcut, className, invalid = false }: ShortcutKbdProps) {
  return (
    <KbdGroup
      className={className}
      aria-invalid={invalid || undefined}
      aria-label={formatShortcutLabel(shortcut)}
    >
      {getShortcutDisplayStrokes(shortcut).map((stroke, index) => (
        <span key={`${stroke.label}-${index}`} className="contents">
          {index > 0 ? (
            <span aria-hidden="true" className="text-muted-foreground">
              +
            </span>
          ) : null}
          <Kbd
            aria-hidden="true"
            invalid={invalid}
          >
            {stroke.label}
          </Kbd>
        </span>
      ))}
    </KbdGroup>
  );
}
