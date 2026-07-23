import { createMiddleware } from "hono/factory";
import type { Variables } from "../config";

// Supported locales
const SUPPORTED_LOCALES = ["bn", "en", "hi"];

// Detect user's preferred locale from Accept-Language header or user preference
export const i18nMiddleware = createMiddleware<{ Variables: Variables }>(async (c, next) => {
  const user = c.get("user");
  let locale = user?.locale || "bn";

  // If no user preference, try Accept-Language header
  if (!user) {
    const acceptLanguage = c.req.header("Accept-Language");
    if (acceptLanguage) {
      const preferred = acceptLanguage.split(",")[0]?.split("-")[0]?.toLowerCase();
      if (preferred && SUPPORTED_LOCALES.includes(preferred)) {
        locale = preferred;
      }
    }
  }

  c.set("locale", locale);
  await next();
});
