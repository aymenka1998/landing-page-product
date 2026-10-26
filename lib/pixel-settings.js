function validPixelSettings(tracking) {
  if (tracking === undefined || tracking === null) return true;
  if (typeof tracking !== 'object' || Array.isArray(tracking)) return false;

  const metaPixelId = tracking.metaPixelId ?? '';
  const tiktokPixelId = tracking.tiktokPixelId ?? '';
  return typeof metaPixelId === 'string' && /^(?:|\d{5,30})$/.test(metaPixelId) &&
    typeof tiktokPixelId === 'string' && /^(?:|[A-Za-z0-9_-]{5,64})$/.test(tiktokPixelId);
}

module.exports = { validPixelSettings };
