export const getRemainingTime = (expiresAt?: number | string) => {
  const expiry = Number(expiresAt);

  if (!expiry || Number.isNaN(expiry)) {
    return 0;
  }

  return Math.max(0, Math.floor((expiry - Date.now()) / 1000));
};
