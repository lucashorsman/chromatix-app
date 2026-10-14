# Agent Instructions

## Project Overview

Chromatix is a desktop music player for Plex and Jellyfin, built as a React web app. It connects to self-hosted Plex/Jellyfin servers to browse and play music libraries. It runs as both a web app and an Electron desktop app.

## Tech Stack

- **React 18** (Vite 8) — UI framework
- **React Router v5** — Client-side routing
- **Rematch (Redux)** — Global state management
- **Sass (SCSS)** — Styling, with CSS Modules for component-scoped styles
- **TypeScript 6** — Used for utilities, hooks, config, and new files; legacy components are `.jsx`/`.js`
- **Tanstack Virtual** — Virtualised lists (artists, albums, tracks, queue)
- **Radix UI** — Accessible UI primitives (dialogs, dropdowns, popovers, selects)
- **Axios** — HTTP requests to Plex/Jellyfin APIs
- **Sonner** — Toast notifications
- **clsx** — Conditional class name composition
- **Vercel Analytics** — Usage and error tracking
- **dash.js** — DASH manifest playback for Plex transcoded tracks
- **Three.js** — 3D WebGL scene rendering for the 3D Record Bin (materials, lighting, procedural canvas textures)
- **Butterchurn** — WebGL2 MilkDrop 2 visualizer engine driven by the Web Audio API

## Project Structure

```
src/
  index.tsx              # App entry point
  CHANGELOG.md           # User-facing changelog
  css/
    _config/             # SCSS variables, mixins, typography, props
    base/                # Reset, fonts, grid, scrollbars, etc.
    styles.scss          # Master stylesheet (imports all partials)
  js/
    _config/             # App-wide config and static data
      config.ts          # Storage keys, encryption keys, global flags
      platformFeatures.ts # Feature flags per service (plex/jellyfin)
      routes.ts          # Route definitions (defaultRoutes / authRoutes)
      themes.ts          # Colour theme definitions
      whatsNew.ts        # "What's new" modal content
    app/                 # Root app components
      App.jsx            # Root component; layout, auth state, hooks
      BrowserRouteSwitch.jsx
      BrowserRouteValidate.jsx
      Modals.jsx         # Global modal registry
    components/          # Reusable UI components (each in own folder)
    hooks/               # Custom React hooks
    modals/              # Modal content components
    pages/               # Page-level components (one per route)
    services/            # API and playback services
      audioBridge.ts     # Web Audio API bridge connecting player elements to analyser node
      bridge.js          # Service-agnostic API bridge (Plex + Jellyfin)
      plexTools.js       # Plex API calls
      plexTranspose.js   # Plex API response normalisation
      jellyTools.js      # Jellyfin API calls
      jellyTranspose.js  # Jellyfin API response normalisation
      player.ts          # Player router — dispatches to native or DASH player
      player.native.ts   # Native audio playback (HTMLAudioElement)
      player.dash.ts     # DASH playback via dash.js (Plex transcoded tracks)
      visualizer.ts      # Butterchurn visualizer lifecycle, presets, and rendering
    store/               # Rematch global state models
      store.ts           # Store initialisation
      models.app.js      # App state (init, login, errors)
      models.dialog.js   # Dialog/modal state
      models.persistent.js # State persisted to localStorage
      models.player.js   # Playback state and effects
      models.session.js  # Session state (user preferences, current server)
    utils/               # Pure TypeScript utility functions
  types/
    global.d.ts          # Global type declarations
lib/                     # Node scripts for image processing and SVG compression
public/                  # Static assets (served as-is; root index.html is the Vite entry)
index.html               # Vite entry point (at project root)
vite.config.ts           # Vite + Vitest configuration
vitest.setup.ts          # Vitest setup (wires HTMLAudioElement mock)
eslint.config.js         # ESLint 10 flat config
```

## Module Resolution

The `src/` directory is set as `baseUrl` in `tsconfig.json`, so imports use paths relative to `src/`:

```ts
import config from 'js/_config/config';
import { sortList } from 'js/utils';
import style from './Button.module.scss';
```

## State Management

State is managed with **Rematch** (a Redux wrapper). The store has five models:

- `appModel` — Initialisation, login status, server/library errors
- `dialogModel` — Alert and confirmation dialogs
- `persistentModel` — Navigation history; persisted to `localStorage`
- `playerModel` — Playback state and all player effects (play, pause, skip, queue, etc.)
- `sessionModel` — User preferences and current session data; partially persisted to `localStorage`

Access state in components via `useSelector`:

```js
const loggedIn = useSelector(({ appModel }) => appModel.loggedIn);
```

Dispatch actions via `useDispatch`:

```js
dispatch.playerModel.playerPlay();
```

## Services

All API calls go through `bridge.js`, which delegates to either `plexTools.js` or `jellyTools.js` based on the active service. Raw API responses are normalised into a consistent internal format by `plexTranspose.js` / `jellyTranspose.js` respectively.

The audio player has three layers: `player.ts` is the router that selects the active backend; `player.native.ts` handles native `HTMLAudioElement` playback (MP3, FLAC, AAC, Ogg, and Jellyfin transcoded streams); `player.dash.ts` handles DASH playback via dash.js (used for Plex tracks whose codec requires transcoding, e.g. WMA, FLAC on unsupported browsers). Playback management logic (queue, skip, shuffle, repeat) lives in `models.player.js` in the store.

Audio visualisation and reactive analysis are handled by two services: `audioBridge.ts` creates a singleton Web Audio graph (`AudioContext`, `GainNode`, and `AnalyserNode`), automatically tapping audio elements from both native and DASH player instances via `connectAudioElement()` and exposing `getAudioEnergy()` (bass, mid, treble, overall) to drive audio-reactive visuals. `visualizer.ts` manages the Butterchurn (MilkDrop 2) WebGL2 visualizer engine, preset packs, auto-cycling timers, and canvas rendering.

The Plex API is entirely undocumented and reverse engineered. Plex API fields are explicitly excluded where not needed to reduce payload size.

## Routing

Routes are defined in `js/_config/routes.ts` as arrays of route objects:

- `defaultRoutes` — Routes shown when logged out
- `authRoutes` — Routes shown when logged in (redirects unauthenticated users)

Route components are resolved by string name and lazy-loaded via `BrowserRouteSwitch.jsx`.

## Components

Each component lives in its own folder under `src/js/components/` with a matching `.module.scss` file for styles:

```
components/
  Button/
    Button.jsx
    Button.module.scss
```

Components and hooks are barrel-exported from `components/index.js` and `hooks/index.js` respectively.

Use `clsx` for conditional class composition. Use CSS Modules for component-specific styles.

## Context Menus

Right-click/"more options" menus share one entry schema and renderer (`MenuEntry` in `components/MenuEntries/`), consumed by both `ContextMenu` (Radix context-menu, right-click) and `ActionMenu` (Radix dropdown-menu, click-triggered "..." button). An entry is `{ variant: 'action' | 'checkbox' | 'submenu' | 'divider' | 'sectionHeading', ... }` — see the header comment in `MenuEntries.jsx` for the per-variant fields. `ActionSort` also builds on the same dropdown-menu primitive and reuses `MenuEntries.module.scss`'s shared popup/item styling, but renders its own entries directly rather than going through `MenuEntry`, since a sort option isn't one of the variant shapes above.

Each entity type (album, artist, playlist, collection, track) has a `useContextMenu<Entity>` hook that builds its entries array from a plain object shaped like the entity's list/grid row, plus a thin `ContextMenu<Entity>` wrapper component. Follow the existing hooks for conventions such as: omitting a `link` field to suppress a "Go to X" entry on that entity's own detail page, and showing a "Remove from X" entry only when the relevant parent ID (e.g. `collectionId`) is present on the entity object.

## Action Components

The `Action*` components are the toolbar controls shown above list/grid views. Their shared trigger/icon/label CSS lives in `components/Action/_shared.scss` as Sass mixins (`@include action.trigger`, etc.) — this is a plain `.scss` partial, not a `.module.scss`, since Sass's `@use` resolution won't find a `.module.scss` file and it's never imported as a style object from JS, only `@use`'d from other Sass.

`ActionSort` combines a sort-field select with direction (asc/desc) into one control: selecting a new option sets it ascending; re-selecting the active option toggles direction. It's built on `@radix-ui/react-dropdown-menu` rather than `react-select`, since Select suppresses `onValueChange` when re-selecting the already-active value and always closes on select — neither of which this component wants. Each `useGet<Entity>Array`/`useGet<Entity>Items` hook's `setSort<Entity>(sort, order?)` setter accepts an optional second `order` argument so `ActionSort` can update both fields in one dispatch; calling `setSort` and `setOrder` as two separate dispatches back-to-back will clobber the sort field, because `setOrder` re-writes it from a stale closure value to guard against sorting by a hidden field.

## Modals

Modal content components live as flat files directly under `js/modals/` (no per-modal folder), sharing one stylesheet (`modals.module.scss`). Open one via `dispatch.dialogModel.showModal('Name')` or `showModal({ modal: 'Name', data: {...} })`; the modal reads `dialogModel.currentModalData` via `useSelector`. Confirmations use `dispatch.dialogModel.showConfirm({...})` instead (see `models.dialog.js`) rather than a dedicated modal component.

Name-entry modals (playlists, collections) validate inline using `validateEntityName` from `js/utils` — trims whitespace, rejects unsafe characters, and checks for a case-insensitive duplicate against the relevant list already in the store. Follow this pattern for any other user-named entity.

## 3D Record Bin (RecordBin3D)

`RecordBin3D` (`src/js/components/RecordBin3D/RecordBin3D.jsx`) is Chromatix's immersive 3D vinyl browsing experience, activated when selecting the "Crate" view mode (`viewAlbums === 'crate'`) from the Album view (`AlbumArray.jsx`). It is built on **Three.js** and styled with a Frutiger Aero aesthetic featuring daytime ("Sunlit Conservatory") and nighttime ("Midnight Lounge") environments.

### Scene Architecture & Framing

- **Three-Wing Camera Framing**: Uses a `PerspectiveCamera(36, ...)` positioned at `(0.6, 17.0, 43.0)` looking at `(0, 8.0, 1.0)`. A subtle pointer-driven parallax effect shifts camera X/Y smoothly relative to the mouse. The frame captures three distinct functional wings:
  - **Left Wing (Browsing Crate)**: Transparent acrylic record crate holding instanced sleeves for browsing.
  - **Center Hero (Turntable & Easel)**: Hi-Fi turntable with animated rotating vinyl, dynamic tonearm, tactile start/stop lever, and a propped "Now Spinning" easel displaying the current album's artwork.
  - **Right Wing (Unified Tracklist Card)**: Prominently angled gatefold card displaying album metadata, tracks, playing track indicator, and custom scrollbar rendered directly to an interactive HTML Canvas texture.
- **Lighting & Materials**: Built with `MeshPhysicalMaterial` for clearcoat acrylic, brushed chrome, lacquer finishes, and ambient/shadow tuning (`PCFShadowMap`, `ACESFilmicToneMapping`). Directional key lighting casts soft shadows, while neutral white/cyan fill lights and cyan rim lighting prevent dark washouts.
- **Curved Panorama Backdrop**: Uses a 180° cylinder geometry with exact 2:1 aspect ratio matching 2K sky panos (`/images/daysky.jpg` and `/images/nightsky2.jpg`), eliminating distortion or stretching.
- **Atmospheric Themes**: Toggled via the top bar or pressing `T` (persisted to `localStorage` under `chromatix_record_bin_theme`). Dynamically updates fog color/density, sky backdrop, lighting colors, and material colors/emissives between Sunlit Conservatory (day) and Midnight Lounge (night).

### Record Crate & Sleeve Pool

- **Object Pooling**: Maintains an array of `MAX_VISIBLE_SLEEVES` (28) mesh instances rather than allocating/destroying meshes during scrolling.
- **Windowing & Flip Physics**: As the user scrubs through records, sleeves are divided into:
  - **Front Stack (Flipped)**: Up to 3 past records angled forward (`rotation.x = 0.48`, resting at `Y = 3.8`) against the acrylic front lip. Outermost exiting records fade out smoothly.
  - **Rear Stack (Waiting)**: Up to 20 queued records leaning back (`rotation.x = -0.18`, resting at `Y = 5.95`).
  - **Active Center Record**: The selected record is elevated upward with a smooth spring interpolation. When user interaction ceases, an idle timeout (`IDLE_TIMEOUT_MS = 1000`) smoothly lowers the record back flush into the crate.
- **Artwork Loading & Caching**: Textures are loaded asynchronously using `THREE.TextureLoader` through `getProxiedImageUrl` (or native URL in Electron) with `sRGB` color space and mipmapping. Textures are cached in a local `Map` to prevent redundant network fetches.

### Turntable & Kinetic Tonearm

- **Platter & Vinyl**: When `playerPlaying` is active, the platter, vinyl disc, and center label spin continuously at 33 RPM rate.
- **Tactile Lever**: A physical start/stop lever with an emissive jewel knob tilts downward when playing and upward when paused; clicking the lever or platter toggles playback.
- **Dynamic Groove Tracking**: The tonearm assembly (gimbal ring, counterweight, arm tube, headshell, cartridge, stylus cantilever, needle tip) dynamically traverses across the vinyl grooves from lead-in (`-0.42` rad) to run-out (`-0.80` rad). The angle is continuously calculated as a function of the track and total album elapsed time via `playerX.getCurrentProgress()`.
- **Hero Easel**: Stands behind the turntable and displays the sleeve of the album currently playing in the audio player (or browsed album if no track is playing).

### Unified Tracklist Card (Canvas Texture & Raycasting)

- **Canvas Rendering**: `renderTrackCardCanvas()` paints the album title, artist, year, track count, total duration, track rows with durations, active playing status indicator (`▶`), and a custom scrollbar thumb directly onto an off-screen HTML canvas at high DPI.
- **Interactive Raycasting**: Mouse clicks and pointer movements raycast against the card mesh UV coordinates:
  - Clicking any track row triggers immediate playback (`dispatch.playerModel.playerLoadAlbum` or `playerLoadIndex`).
  - Clicking the card header area toggles playback of the album.
  - Dragging vertically on the card surface or using the mouse wheel scrolls the tracklist with smooth inertia damping.
  - Hovering over rows updates cursor style and draws a hover highlight background.
- **Dirty State Optimization**: Redrawing the 2D canvas is expensive; the render loop checks `needsCardUpdate` against album ID, track ID, playing state, tracklist reference/count, rounded scroll position, hovered track index, and active theme to avoid redundant canvas repaints.

### Butterchurn Visualizer Integration

- **Modes**: Toggled via the top bar or pressing `V` (persisted to `localStorage` under `chromatix_record_bin_viz`):
  - `'screen'` — Butterchurn renders as a full-screen background underlay behind the transparent WebGL canvas.
  - `'dome'` — Butterchurn renders to a dynamic `CanvasTexture` mapped onto the curved 180° cylinder backdrop inside the 3D scene.
  - `'off'` — Visualizer disabled; standard panoramic sky backdrop is displayed.
- **Audio Reactivity**: Connected via `audioBridge.ts`. Real-time bass energy from `audioBridge.getAudioEnergy()` dynamically modulates ambient light intensity and console glass trim emissive glow.
- **Preset Navigation**: Presets can be cycled forward (`B`), backward (`Shift+B`), or randomized (`R`). Supports an automated 25-second preset cycle timer (`isAutoCycle`).

### Controls & Navigation

- **Pointer**: Drag horizontally across the crate to flip records; drag vertically or scroll wheel over the card to scroll tracklists; click records to flip or play; click turntable/easel/header to play/pause.
- **Audio Cues**: Flipping records triggers a lightweight synthetic audio click generated on the fly via `AudioContext` oscillator and biquad filter (`playFlipSound`).
- **A-Z Jump Bar & Scrubber**: Bottom docked scrubber slider and alphabet buttons jump directly to letters matching either artist or title (depending on active sort).
- **Keyboard Shortcuts**:
  - `ArrowLeft` / `ArrowRight` / `ArrowUp` / `ArrowDown`: Step single record
  - `PageUp` / `PageDown`: Step 10 records
  - `Home` / `End`: Jump to first / last record
  - `Space`: Toggle play/pause
  - `Enter`: Play selected browsed album
  - `T`: Toggle Day / Night theme
  - `V`: Cycle visualizer mode (Screen / Dome / Off)
  - `B` / `Shift+B`: Next / Previous visualizer preset
  - `R`: Random visualizer preset
  - `F`: Toggle focus layout (cinematic mode)
  - `Escape`: Exit focus mode or exit 3D Crate view back to Grid view

### Performance & Resource Disposal

- **Paced Animation Loop**: Frame rate is paced to ~30-60 FPS using timestamp checks (`TARGET_FRAME_MS`) to prevent unthrottled loop execution on high refresh rate displays (144Hz/240Hz). The loop stops completely when idle (`isLoopRunning = false`, `shouldKeepRendering = false`).
- **Disposal on Unmount**: When the component unmounts or exits:
  - Animation frame request is canceled.
  - All DOM event listeners (pointer, wheel, resize, keydown) are removed.
  - Scene is traversed to dispose all geometries and materials.
  - Textures in `textureCache`, backdrop textures, visualizer textures, and track card canvas textures are disposed.
  - `WebGLRenderer` is disposed and removed from DOM.
  - `visualizerService.destroyVisualizer()` cleans up Butterchurn WebGL2 resources.

## TypeScript Migration

The codebase is partially migrated to TypeScript. New utilities and hooks should be written in TypeScript (`.ts`/`.tsx`). Existing `.js`/`.jsx` files do not need to be converted unless directly touched. The store models remain in JavaScript for now.

## Testing

Tests are colocated with the file they cover using the `.test.ts` suffix (e.g. `sortList.ts` / `sortList.test.ts`). This applies to all modules — utilities, services, hooks, etc. All utility functions should have thorough tests. Follow the existing naming convention:

```ts
// Tests generated using AI

import functionName from './functionName';

describe('Testing "functionName" function', () => {
  test('Test description', () => { ... });
});
```

Shared test fixtures live in `__fixtures__/` folders colocated with the tests that use them (e.g. `js/utils/__fixtures__/`).

Vitest manual mocks for browser APIs unavailable in jsdom (e.g. `HTMLAudioElement`) live in `__mocks__/` at the root. The setup file is `vitest.setup.ts` at the project root.

Tests use **Vitest** with `globals: true` — no need to import `describe`, `test`, `expect`, `vi`, etc.

- Run tests in watch mode with `npm run test`
- Run all tests once with `npm run test:all`

## E2E Testing

Visual regression tests use **Playwright** with Chromium. Snapshots are stored in `tests/snapshots/`. Auth session files live in `tests/.auth/` (gitignored).

Test files live in `tests/pages/`. Shared helpers (`waitForContent`, `checkForRateLimit`) are in `tests/utils.ts`. Config is in `playwright.config.ts`.

Each test navigates once then loops over viewports with `page.setViewportSize()` for full-page screenshots — no separate browser context per breakpoint.

Run `npm run test:e2e:login` once to authenticate before running auth tests. The setup test must run before library tests to generate `tests/.auth/library-id.json`.

## Key Scripts

- `npm start` / `npm run dev` — Start dev server (port 4000)
- `npm run build` — Production build (output to `build/`)
- `npm run check` — Run knip, lint, prettier, and typecheck in sequence
- `npm run test` / `npm run test:all` — Run Vitest tests (watch / once)
- `npm run test:e2e:login` — Manual Plex login; run once before auth tests
- `npm run test:e2e:*` — E2E snapshot tests; `:update` variants regenerate snapshots
- `npm run images:convert:new` — Convert new images to WebP
- `npm run images:tinify:new` — Compress new images via Tinify
- `npm run svg:compress:new` — Compress new SVGs
- `npm run css:sort` — Sort CSS/SCSS property order via PostCSS

## Environment Variables

Set via `import.meta.env` (Vite convention, prefixed `VITE_`):

- `VITE_VERSION` — App version (injected from `package.json` at build time)
- `VITE_DATE` — Build timestamp (Unix seconds)
- `VITE_ENV` — Environment identifier (`local`, `preview`, `production`)

## Coding Conventions

- ESLint 10 (flat config at `eslint.config.js`), Prettier, and EditorConfig enforce code style
- `package.json` has `"type": "module"` — the project is ESM-native
- Husky + lint-staged run ESLint and Prettier checks on staged files at pre-commit; knip, typecheck, and tests also run pre-commit
- Knip is used for dead code detection — avoid unused exports, imports, and files
- Use `clsx` for all conditional class name composition (not string concatenation)
- Use CSS Modules for component-scoped styles; import as `style` and reference as `style.className`
- Use `getEnvironment()` from `js/utils` as the single source of truth for environment, browser, OS, and Electron info — do not access `import.meta.env` or `navigator` directly for these
- Use `getLocalStorage` / `setLocalStorage` from `js/utils` for all localStorage access
- Use `safeEncodeURIComponent` / `safeDecodeURIComponent` from `js/utils` rather than the native globals
- All top-level exports in `js/hooks/` and `js/utils/` must have a clear, succinct JSDoc comment. Keep descriptions brief and factual — one sentence for simple functions, a few lines for complex ones. Include `@param` and `@returns` tags only when they add meaningful clarity beyond what the types convey
- Section comments use a consistent three-line banner style — a divider, a title, then a closing divider:
  ```
  // ======================================================================
  // SECTION TITLE
  // ======================================================================
  ```
- SVG components use the Vite-native `?react` import suffix: `import FooIcon from './foo.svg?react'`
- See **Adding Icons** below for the full icon workflow
- Do **not** use Prettier as an ESLint plugin — run `npm run prettier` separately; `eslint-config-prettier` disables conflicting formatting rules

## Adding Icons

1. Place the raw SVG in `src/js/components/Icon/icons/general-original/` (or `site-original/` for service logos)
2. Conform the SVG to the project format before compressing:
   - Root `<svg>` must have `fill="none"`
   - Remove all hardcoded `stroke` colour attributes (e.g. `stroke="white"`)
   - Remove all inline `style` attributes from paths
   - Remove `stroke-width` attributes from paths
   - Remove `<g clip-path>` wrappers and `<defs>` / `<clipPath>` blocks
   - Every path must have `stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"`
3. Run `npm run svg:compress:new` — this writes the optimised file to `general-compressed/` (skipping already-compressed files; delete the compressed copy first if you need to re-compress)
4. Add the import to `Icon.jsx`, importing from `general-compressed/`, in alphabetical order
5. Register the component in the `generalIcons` object (or `siteIcons` for site logos) in alphabetical order

## Response Style

- Be concise and direct — prefer short answers unless complexity warrants detail
- Don't repeat back what the user said before answering
- Skip unnecessary preamble like "Great question!" or "Certainly!"
- Don't add summaries at the end of responses

## Maintaining These Instructions

These instructions are for AI agents (including Copilot). When you make changes to this project, keep this file up to date. If you introduce a new pattern, convention, component type, third-party integration, or architectural decision, update the relevant section or add a new one. Outdated guidance is worse than none.
