import { notify, type UiNotificationOptions } from "@chardesk/ui";

export const feedback = {
  success(message: string, options?: UiNotificationOptions) {
    notify.success(message, options);
  },
  error(message: string, options?: UiNotificationOptions) {
    notify.error(message, options);
  },
  warning(message: string, options?: UiNotificationOptions) {
    notify.warning(message, options);
  },
  dismiss() {
    notify.dismiss();
  },
};
