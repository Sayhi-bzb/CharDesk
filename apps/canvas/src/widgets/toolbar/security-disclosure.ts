const SECURITY_DISCLOSURE_STORAGE_KEY = 'chardesk-security-disclosure-v1';
const ACKNOWLEDGED = 'acknowledged';

export const hasAcknowledgedSecurityDisclosure = () => {
  try {
    return window.localStorage.getItem(SECURITY_DISCLOSURE_STORAGE_KEY) === ACKNOWLEDGED;
  } catch {
    return false;
  }
};

export const acknowledgeSecurityDisclosure = () => {
  try {
    window.localStorage.setItem(SECURITY_DISCLOSURE_STORAGE_KEY, ACKNOWLEDGED);
  } catch {
    // The current page still clears the prompt when browser storage is unavailable.
  }
};
