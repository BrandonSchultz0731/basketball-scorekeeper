---
name: developing-code
description: Code standards for this repo. Load before writing, editing, or reviewing any TypeScript/JavaScript here.
---

# Developing code in this repo

Follow these rules for all code in this repo. When a rule conflicts with existing code, the rule wins: fix the code you touch.

## Tooling

- Use **pnpm**, never npm or yarn. `pnpm install`, `pnpm dev`, `pnpm build`, `pnpm typecheck`, `pnpm lint`. Commit `pnpm-lock.yaml`.
- Run `pnpm lint` and `pnpm typecheck` before calling a change done. `pnpm build` runs both and fails on any error.
- Rules that can be checked mechanically go in `eslint.config.js` as well as this file.
- TypeScript stays on 6.0.x until typescript-eslint supports 7 (it currently allows `<6.1.0`).

## Project layout

```
src/
  shared/              code used by more than one page
    components/        reusable React components (Section, StatList)
    enums/             cross-feature enums, one file per enum (hoop.ts -> HOOP)
    theme/             Mantine theme, HOOP_COLOR, mount()
    types/             cross-feature interfaces and types (Detection)
    utils/             pure functions and constants (HOOPS, otherHoop, YOLOX decode)
  <feature>/           one folder per page (spike/, label/): main.tsx, App.tsx, feature-only code
```

- Each `shared/` folder has an `index.ts` that re-exports its files. Import from the folder (`from '../shared/enums'`), never from a file inside it.
- Put things in the folder for what they *are*. Enums, types and functions go in separate folders even when they're about one topic: `COCO_CLASS` is in `enums/`, `Detection` in `types/`, `decode` in `utils/`. `enums/` holds only enums, and helpers built on an enum (`HOOPS`, `otherHoop`) go in `utils/`.
- File names: components are PascalCase (`StatList.tsx`). Everything else is camelCase (`cocoClass.ts`).
- Code starts in its feature folder. Move it to `shared/` once a second feature needs it.
- `enums/`, `types/` and `utils/` must not import React, Mantine or browser-only globals, because the detector worker imports them. UI goes in `components/` or `theme/`.
- Lint enforces both import rules via `no-restricted-imports`. Lint can't check the browser-only-globals part.

## Functions

- Use **arrow function syntax**, never the `function` keyword. This covers top-level helpers, exported functions, and React components.

  ```ts
  // yes
  export const decode = (raw: Float32Array, size: number): Detection[] => { … };
  export const App = () => { … };

  // no
  export function decode(raw: Float32Array, size: number): Detection[] { … }
  function App() { … }
  ```

- Arrow `const`s are not hoisted, so define helpers above the code that calls them at module load.
- The only exception is generator functions (`function*`), which have no arrow form.
- Enforced by `no-restricted-syntax` in `eslint.config.js`.

## Enums

- Use a **TypeScript enum** for any fixed set of values referenced in more than one place: discriminants (`kind`, `type`), sides (`HOOP`), modes, states, backends, message types.

  ```ts
  // yes
  export enum HOOP { LEFT = 'left', RIGHT = 'right' }
  if (e.kind === LABEL_EVENT_KIND.MAKE) score[e.hoop] += e.points;

  // no
  type Hoop = 'left' | 'right';
  if (e.kind === 'make') …
  ```

- Naming: enum names and members are both UPPER_SNAKE_CASE (`LABEL_EVENT_KIND.GAME_START`, `HOOP.LEFT`). Values stay lowercase (`'game_start'`).
- Use **string enums** with explicit values. The values end up in label files, game logs and worker messages, so they must stay readable and stable. Never rename a value that has been persisted; rename only the member.
- Use numeric enums only when the number is the meaning (e.g. `COCO_CLASS.SPORTS_BALL = 32`, a model's class index).
- Where enums live:
  - Domain enums used across features go in `src/shared/enums/`, one file per enum (e.g. `HOOP` in `hoop.ts`), re-exported from `index.ts`.
  - Feature enums live with that feature's types (`LABEL_EVENT_KIND` in `src/label/types.ts`).
  - Enums private to one file stay in that file.
- Don't put enums that the main thread imports in a worker file. Importing the enum pulls the whole worker module, onnxruntime included, into the page bundle. Use a separate protocol file (`src/spike/protocol.ts`).
- Key lookup tables by the enum: `Record<HOOP, MantineColor>`, `{ [HOOP.LEFT]: 'cyan' }`. Display text comes from a label map (`KIND_LABEL[kind]`), never from string-munging the enum value.
- Leave strings alone when they belong to an external API (DOM values like `'videoinput'`, Mantine props like `variant="light"`).
- Point values stay numbers (`2 | 3`). They are about to become a setting, so an enum would be wrong.
- Lint flags any union of string literals (`'a' | 'b'`) via `no-restricted-syntax`, and enforces enum naming via `@typescript-eslint/naming-convention`.
- To run a TS file containing enums directly in Node, use `node --experimental-transform-types`; `--experimental-strip-types` rejects enums.

## UI

- Build UI with **Mantine** (`@mantine/core`, `@mantine/hooks`). Reach for a Mantine component before writing a raw element plus CSS: `Button`, `Group`/`Stack`/`Grid` for layout, `Paper`/`Card` for panels, `Text`/`Title` for type, `NativeSelect`/`NumberInput`/`FileInput`/`TextInput` for forms.
- Customise the look in one place: `src/shared/theme/theme.ts` (`createTheme`). Don't hard-code colours, radii, spacing or fonts in components. Use Mantine props (`c="dimmed"`, `p="md"`, `color={HOOP_COLOR[HOOP.LEFT]}`) or CSS variables (`var(--mantine-radius-md)`).
- Canvas drawing can't use CSS variables, so read colours from `useMantineTheme()`.
- Every page entry point renders through `mount()` in `src/shared/theme/mount.tsx`, which applies the provider, theme and Mantine styles.
- Reusable components go in `src/shared/components/` (e.g. `Section`, `StatList`).
- Phone-first: buttons default to `size="md"` for touch targets. Layouts must work at phone width; use responsive props like `span={{ base: 12, md: 8 }}`.
- Use inline `style` only for things Mantine has no prop for (video/canvas sizing, `touchAction`). If the styling grows, use a CSS module, which can use the Mantine PostCSS mixins and breakpoints set up in `postcss.config.js`.
- Each page has a user guide in `docs/` (`docs/spike.md`, `docs/labeler.md`) explaining every button, setting and readout. When you add, remove or change a control or stat on a page, update its guide in the same change. A new page gets a new guide, linked from `README.md`.
- Long-running work started from a component (run loops, `requestVideoFrameCallback` chains, worker message handlers, timers) outlives the render that started it. It must read current settings from a ref that is refreshed on every render (`live.current = { center, threshold, … }`), never from state captured when it started. Otherwise changes made mid-run are silently ignored.
- When a result comes back asynchronously, keep the inputs that produced it with it (e.g. the crop a detection came from) and draw from those, not from current state.
- Mantine is on v9. Check prop names against `node_modules/@mantine/core/lib` rather than memory (e.g. `Grid` takes `gap`, not the older `gutter`).
