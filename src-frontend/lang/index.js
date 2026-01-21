export const t = (obj, path, defaultValue = null) => {
  if (obj == null || !path) return defaultValue;

  const keys = String(path).split(".").filter(Boolean);
  let cur = obj;

  for (const k of keys) {
    if (cur != null && Object.prototype.hasOwnProperty.call(cur, k)) {
      cur = cur[k];
    } else {
      return defaultValue;
    }
  }
  return cur;
};
