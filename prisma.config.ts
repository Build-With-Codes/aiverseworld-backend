import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: (() => {
      const configuredUrl = process.env['DATABASE_URL'];

      if (!configuredUrl) {
        return undefined;
      }

      try {
        const url = new URL(configuredUrl);
        url.searchParams.set('schema', 'aiverse_world');
        return url.toString();
      } catch {
        return configuredUrl;
      }
    })(),
  },
});

