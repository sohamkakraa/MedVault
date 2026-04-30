const enabled = process.env.NODE_ENV !== "production" || !!process.env.LOG_LEVEL;

export const log = {
  debug: (...args: unknown[]) => {
    if (enabled) console.log(...args);
  },
  warn: (msg: string, data?: Record<string, unknown>) => {
    if (enabled) console.warn(`[warn] ${msg}`, data ?? "");
  },
};
