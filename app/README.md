# Flyto front

Vue 3 + Pinia, built with Vite. The pages are rendered by the server (`public/pug`),
which loads the scripts listed in `public/app/.vite/manifest.json`.

```bash
npm install

# rebuild on every change, run the server next to it (npm run dev at the root)
npm run dev

# production build into ../public/app
npm run build

# browser tests, they start the server themselves; they need PostgreSQL,
# so they run in CI (FLYTO_TEST_DB_URL, FLYTO_TEST_REDIS_URL)
npm run test:e2e
```

Icons come from [Phosphor](https://phosphoricons.com) through `unplugin-icons`:
import one with `import Name from '~icons/ph/name'`, or add it to `src/common/Icon.vue`
to use it as `icon(name="…")` in templates.
