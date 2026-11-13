// Browser APIs that jsdom lacks but Mantine and the app use. Import at the top of DOM tests,
// which also declare `// @vitest-environment jsdom`.
import 'fake-indexeddb/auto';

if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  });
}

class NoopResizeObserver {
  observe = () => {};
  unobserve = () => {};
  disconnect = () => {};
}
window.ResizeObserver ??= NoopResizeObserver;
Element.prototype.scrollIntoView ??= () => {};
