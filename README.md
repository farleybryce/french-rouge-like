# Le Donjon · Le Château des Échos

A free, French-first roguelike for learning by exploring a haunted château. No account, backend, API keys, analytics, or runtime AI. A static TypeScript application; all learner data stays in the browser.

## Run and play

Requires Node.js 24 and npm (the lockfile is committed).

```sh
npm ci
npm run dev
```

Open `http://localhost:5173/french-rouge-like/`. On a phone on the **same Wi-Fi as your development computer**, use `http://YOUR_COMPUTER_LAN_IP:5173/french-rouge-like/`. Allow the dev server through your local firewall. A cloud workspace is not on your home Wi-Fi. Service workers and installation require HTTPS or localhost; use the HTTPS GitHub Pages site for phone offline/install testing.

Choose **Frostwalker**, **Mirror keeper**, or **Ruby bearer**, then start an expedition. The three starting builds have different tools; no build gives permanent stat upgrades. Move by tapping adjacent map tiles or the arrows. Room symbols show risks and rewards before you enter.

- **Three procedural floors:** seeded maze corridors with loops and randomized room placement. Each floor has two optional enemies, treasure, a fountain, a merchant, a health-sacrifice altar, and a caretaker. A warden guards each of the first two exits; the Echo Queen guards the final exit.
- **Tactical combat:** inspect the next attack, then choose a spell and assemble its French formula. Éclat is free; Miroir blocks/reflects damage; Souffle heals before retaliation; frost creates two safe turns; blood magic combines damage and healing. Relics change spell effects or resource efficiency.
- **Finite supplies:** mana, potions, ether, bombs and gold persist between floors. Health does not refill on descent. Every fountain offers one health-or-mana choice, each chest one reward, each merchant one of each supply. Retreat costs two health and preserves the enemy's wounds and attack pattern. Supplies take a turn in combat, so use them before entering if possible.
- **Permadeath:** death loses character, equipment and supplies. Learning records, mistakes, review schedules and run history survive. Your next run has a new layout and build; there are no permanent combat stat boosts.

This remains a small game: 18 vocabulary/phrase entries, ten verb definitions, five used grammar patterns, six relics, four enemy types and one caretaker encounter. The planned 150-word/20-dialogue content pack and more varied quests remain future work.

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

Vitest covers conjugations and accents, SRS, per-pattern support, 600 generated floor layouts, tactical spell effects, finite rewards, permadeath, save validation and version-1 migration. It also completes 24 deterministic expeditions across all three starting builds using normal movement and resources. The browser smoke test plays a complete three-floor expedition through the UI, checks safe beginner corrections, free translations, floor carryover, reload persistence, export/import, version-1 import, offline play, 375px touch layout, and desktop rendering. It writes screenshots to `/tmp`. Install your own Chromium or use Playwright's browser installer if needed; no browser binary ships to players.

The production build generates a manifest and service worker caching the shell, original artwork and bundled JSON content. Visit online once and allow installation to finish before going offline. New versions offer an update button that saves your current run before refreshing. For the original prototype, which had no update UI, close all game tabs and reopen once to receive this version. Install using your browser's installation option (iOS: Safari → Share → Add to Home Screen).

## Deploy free on GitHub Pages

1. Keep the repository public. In **Settings → Pages → Build and deployment**, select **GitHub Actions**.
2. Push the code to `main` (or manually run the included **Test and deploy Le Donjon** workflow).
3. After a successful deployment, open `https://farleybryce.github.io/french-rouge-like/`.

The workflow tests and builds before deploying. `vite.config.ts` explicitly sets `base: '/french-rouge-like/'`; update this if the repository name changes. No custom domain, paid actions, or external hosting is needed. GitHub free-service limits still apply. A local build does not mean the Pages site is deployed.

## Learning, saves and audio

- Seen, independently understood, independently produced, failed and hinted items are tracked separately. Independent success schedules review after 1 day, then roughly doubles the interval. Failures/hints bring it back in ten minutes. Immediate retries do not advance the schedule.
- Language help is **free**. Default English explanations clarify game rules; **FR + EN** toggles them. Word glosses, spell examples, answer reveals, audio replay and listening transcripts never spend health, mana, gold or a turn.
- Support is **per learning item**, snapshotted at run start. Unfamiliar grammar has an example, a smaller tile bank, and a safe correction before an incorrect formula spends a combat turn. Three independent successes plus a review repetition and 65% recent accuracy unlock coached prompts; six successes, two review repetitions and 80% accuracy unlock independent prompts. Comprehension counts for direction items. Coached/independent casting errors can fizzle and spend a turn/mana; free answer help is always available first. Correct retries and revealed answers do not count as independent production. Optional typing accepts omitted accents with a correction note; it gives no combat bonus.
- New evidence adjusts the **next run's** support. It never changes enemy health, damage, loot or layout. Dungeon danger rises with floor, independently of language ability. Due grammar appears first in spell choices. CEFR labels are content/game labels, not proficiency certification; this release does not claim B1/B2 coverage.
- IndexedDB saves after every action, including current floor, enemy wounds, equipment, selected tiles and support snapshot. Unsubmitted free text is not persisted. Storage errors are visible. Export a JSON journal regularly; imports are validated before replacing the active save, and the prior current save is downloaded first (subject to browser download permissions). Files are unencrypted.
- **Save schema 2** migrates version-1 learning/settings/history. The incompatible old single-floor run is archived as a history entry; start a fresh expedition. When upgrading existing local IndexedDB data, the original version-1 save is retained under `legacy-v1-backup` and can be downloaded from Settings. An imported version-1 file remains its own original backup. No learning records are intentionally reset.
- **Protéger le stockage** requests `navigator.storage.persist()` after a tap. Browsers may refuse or evict data anyway. Export is the portable backup.
- Speech uses only a browser voice reported as **local**, with `fr-FR`, initiated by a tap. No voice/API/download is required by the app. Listening text is always free, automatically shown for guided directions, mute, captions, or missing local voice. Install a local French voice in device settings for listening. Actual iOS/Android voice and installation behavior still needs device testing.

## Add content

All language content lives in `src/content/`:

- `vocabulary.json`: unique `id`, `lemma`, English gloss, `tier`, `partOfSpeech`, noun gender (`m`/`f`), `needs_review`.
- `verbs.json`: `id`, `infinitive`, English meaning, `tier`, either six ordered present-tense `forms` (**je, tu, il, nous, vous, ils**) or a supported regular class (`er`, `ir`). Do not mark spelling-changing verbs as regular without extending and testing the rules.
- `grammar.json`: unique ID, verb reference, present tense, tier, French/English correction, non-answer teaching tips (`tipFr`, `tipEn`), `exampleEnglish` for the first-person example, and `needs_review`.
- `encounters.json`: authored dialogue, glossary tokens, direction clues and five spells (verb/grammar IDs, mana costs, French and English descriptions). Spell effects are implemented in the engine; adding an effect requires code and tests. The caretaker is authored rather than a generic dialogue framework.
- `dungeon.json`: bilingual floor, build, room, relic and enemy definitions; enemy stats and telegraphed attack cycles. IDs referenced by the engine are stable. Changing generated layouts or schema invariants requires a save migration, not just a JSON edit.

Run `npm run validate` after editing, and add conjugation fixtures for new rules/irregular forms. Mark uncertain French `needs_review: true` and get it reviewed before release. Save import IDs are validated against this content; keep published IDs stable. Future B1/B2 content and additional encounters need matching selection logic, not just new labels.

## Structure

`dungeon.ts` generates seeded connected floors; `engine.ts` holds run state, combat and resource choices; `language.ts` checks French and generates conjugations; `learner.ts` schedules reviews; `persistence.ts` handles IndexedDB, import validation and migration; `legacy.ts` validates the original schema; `main.ts` renders the touch UI. Content is separate JSON; CSS Grid renders the map without a game engine.

## License and cost inventory

Original application code, CSS, SVG château, icon, and authored content: **MIT**, see `LICENSE`. Art is self-made; no downloaded image/font/audio assets. Typography uses device system fonts. Chess/music/direction glyphs are Unicode rendered by the device.

Direct development dependencies (all free, never called as paid runtime services):

| Package          | License    | Purpose                 |
| ---------------- | ---------- | ----------------------- |
| TypeScript       | Apache-2.0 | Type checking           |
| Vite             | MIT        | Development/build       |
| Vitest           | MIT        | Unit tests              |
| vite-plugin-pwa  | MIT        | Manifest/service worker |
| @playwright/test | Apache-2.0 | Browser verification    |

Workbox (service-worker tooling/runtime) is MIT. The complete resolved dependency/license inventory is generated in `THIRD_PARTY_LICENSES.md`; package license texts remain in each installed dependency. Chromium used for development has BSD-style and third-party licenses and is not distributed by this site. Browser-native IndexedDB, Storage and Speech APIs need no paid service. Hosting uses the public-repository GitHub Pages/Actions free allowance.

## Next milestones

More room/quest variety, a reviewed 150-word and 20-dialogue A1–A2 pack, additional relic interactions, broader comprehension challenges, and real iOS/Android voice and install checks. Combat balance is introductory; deterministic solver checks demonstrate survivable routes, not human win rates.

Source was formatted with Prettier 3.6.2 (MIT, free), used as a one-off development tool without a runtime dependency.
