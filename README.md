# Le Donjon · Le Château des Échos

A free, French-first roguelike for learning by exploring a haunted château. No account, backend, API keys, analytics, or runtime AI. A static TypeScript application; all learner data stays in the browser.

## Run and play

Requires Node.js 24 and npm (the lockfile is committed).

```sh
npm ci
npm run dev
```

Open `http://localhost:5173/french-rouge-like/`. On a phone on the **same Wi-Fi as your development computer**, use `http://YOUR_COMPUTER_LAN_IP:5173/french-rouge-like/`. Allow the dev server through your local firewall. A cloud workspace is not on your home Wi-Fi. Service workers and installation require HTTPS or localhost; use the HTTPS GitHub Pages site for phone offline/install testing.

Tap **Entrer dans le château**. Move with adjacent map tiles or the arrows. Ask Éloi for help, remember his potion clue, and find the spectral guardian in the middle of the upper gallery. Assemble subject + verb tiles to cast spells. **Miroir** blocks and reflects damage; watch the guardian's next attack. After getting the key and defeating the guardian, follow the voice at the northern doors.

Death resets the character, not learning records. A win unlocks the persistent title **Éclaireur des Échos**. Incorrect dialogue and door choices allow recovery. The first slice has one authored, tested floor topology with seeded exit variation, one NPC, one enemy type, three tactical spells, and 18 vocabulary/phrase entries plus ten verb definitions. Combat uses three grammar patterns. This is not the full planned procedural game or 150-word/20-dialogue content pack.

## Check and build

```sh
npm test
npm run validate
npm run build
npm run preview -- --port 4173
# With a locally installed Chromium (Debian path is the default):
node e2e/smoke.mjs
# Or CHROMIUM_PATH=/path/to/chromium node e2e/smoke.mjs
```

Vitest covers regular/irregular conjugations, accents/elision, SRS scheduling, adaptation, dungeon reachability, combat, permadeath, and import validation. The browser smoke test exercises a complete run, reload persistence, export/import, offline play, 375px touch layout, and desktop rendering. It writes screenshots to `/tmp`. Install your own Chromium or use Playwright's browser installer if needed; no browser binary ships to players.

The production build generates a manifest and service worker caching the shell, original artwork and bundled JSON content. Visit online once and allow installation to finish before going offline. Updates activate after existing tabs close. Install using your browser's installation option (iOS: Safari → Share → Add to Home Screen).

## Deploy free on GitHub Pages

1. Keep the repository public. In **Settings → Pages → Build and deployment**, select **GitHub Actions**.
2. Push the code to `main` (or manually run the included **Test and deploy Le Donjon** workflow).
3. After a successful deployment, open `https://farleybryce.github.io/french-rouge-like/`.

The workflow tests and builds before deploying. `vite.config.ts` explicitly sets `base: '/french-rouge-like/'`; update this if the repository name changes. No custom domain, paid actions, or external hosting is needed. GitHub free-service limits still apply. A local build does not mean the Pages site is deployed.

## Learning, saves and audio

- Seen, independently understood, independently produced, failed and hinted items are tracked separately. Independent success schedules review after 1 day, then roughly doubles the interval. Failures/hints bring it back in ten minutes. Immediate retries do not advance the schedule.
- Due grammar appears first in spell choices; due direction vocabulary influences the next exit clue. A rolling 20-result window adapts prompts between A1 and A2 (minimum 12 results); these are game difficulty labels, not proficiency certification. A2 adds more grammatical persons. Full content-tier unlocks are future work.
- Hints spend finite **lueurs** to reveal English. Core clues stay readable in French. Successful optional typing gives one lueur (up to nine); missing accents are accepted with a correction note. The debrief has optional English grammar help.
- IndexedDB stores state after every action; run seed, tiles and answers-in-progress survive reloads. Storage errors are visible. Use **Carnet et réglages → Exporter** regularly. Import validates the whole file, exports the previous carnet, and replaces the current save. Files are unencrypted; share them only intentionally. Version 1 is the only currently supported save schema; future schema changes must provide a migration before bumping it.
- **Protéger le stockage** requests `navigator.storage.persist()` after a tap. Browsers may refuse or evict data anyway. Export is the portable backup.
- Speech uses only a browser voice reported as **local**, with `fr-FR`, initiated by a tap. No voice/API/download is required by the app. If no local French voice exists, audio fails, sound is muted, or accessibility captions are on, written door clues are free. Install a local French voice in your device settings for listening. Voice quality/availability varies; actual iOS device behavior needs device testing.

## Add content

All language content lives in `src/content/`:

- `vocabulary.json`: unique `id`, `lemma`, English gloss, `tier`, `partOfSpeech`, noun gender (`m`/`f`), `needs_review`.
- `verbs.json`: `id`, `infinitive`, English meaning, `tier`, either six ordered present-tense `forms` (**je, tu, il, nous, vous, ils**) or a supported regular class (`er`, `ir`). Do not mark spelling-changing verbs as regular without extending and testing the rules.
- `grammar.json`: unique ID, verb reference, present tense, tier, French explanation, English explanation, `needs_review`.
- `encounters.json`: authored dialogue, glossary-linked tokens, replies, direction clues and spell descriptions. The first slice's spell effects are implemented in the engine; adding a new effect requires code and tests. Its single caretaker is intentionally authored rather than a generic dialogue framework.

Run `npm run validate` after editing, and add conjugation fixtures for new rules/irregular forms. Mark uncertain French `needs_review: true` and get it reviewed before release. Save import IDs are validated against this content; keep published IDs stable. Future B1/B2 content and additional encounters need matching selection logic, not just new labels.

## Structure

`engine.ts` holds run state and combat; `language.ts` checks French and generates conjugations; `learner.ts` schedules reviews; `persistence.ts` handles IndexedDB and import validation; `main.ts` renders the touch UI. Content is separate JSON; CSS Grid renders the map without a game engine.

## License and cost inventory

Original application code, CSS, SVG château, icon, and authored content: **MIT**, see `LICENSE`. Art is self-made; no downloaded image/font/audio assets. Typography uses device system fonts. Chess/music/direction glyphs are Unicode rendered by the device.

Direct development dependencies (all free, never called as paid runtime services):

| Package | License | Purpose |
| --- | --- | --- |
| TypeScript | Apache-2.0 | Type checking |
| Vite | MIT | Development/build |
| Vitest | MIT | Unit tests |
| vite-plugin-pwa | MIT | Manifest/service worker |
| @playwright/test | Apache-2.0 | Browser verification |

Workbox (service-worker tooling/runtime) is MIT. The complete resolved dependency/license inventory is generated in `THIRD_PARTY_LICENSES.md`; package license texts remain in each installed dependency. Chromium used for development has BSD-style and third-party licenses and is not distributed by this site. Browser-native IndexedDB, Storage and Speech APIs need no paid service. Hosting uses the public-repository GitHub Pages/Actions free allowance.

## Next milestones

Constrained procedural floor layouts with guaranteed solvable clues; broader SRS-driven encounter selection; a reviewed 150-word and 20-dialogue A1–A2 pack; content unlocks beyond the first title; and real iOS/Android installation and voice checks. This first slice deliberately starts with a small, playable encounter set.
