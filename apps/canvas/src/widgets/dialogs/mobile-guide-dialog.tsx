'use client';

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@chardesk/ui';
import { useUiI18n } from '@/shared/i18n';

type MobileGuideDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const guideSections = [
  'tools',
  'navigate',
  'library',
  'recover',
] as const;

export default function MobileGuideDialog({
  open,
  onOpenChange,
}: MobileGuideDialogProps) {
  const { t } = useUiI18n();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('mobileGuide.title')}</DialogTitle>
          <DialogDescription>{t('mobileGuide.description')}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <ol className="flex flex-col gap-4">
            {guideSections.map((section) => (
              <li key={section} className="flex flex-col gap-1">
                <h3 className="text-xs font-medium">
                  {t(`mobileGuide.${section}.title`)}
                </h3>
                <p className="text-xs leading-5 text-muted-foreground">
                  {t(`mobileGuide.${section}.description`)}
                </p>
              </li>
            ))}
          </ol>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
