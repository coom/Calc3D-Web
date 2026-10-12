import '@testing-library/jest-dom/vitest';

// jsdom has no ResizeObserver; Radix primitives (select, checkbox) call it on mount.
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= ResizeObserverStub;

// jsdom n'a pas non plus matchMedia : largeur simulée de 1280 px par défaut
// (voir src/test-utils/viewport.ts pour la changer dans un test).
import { installMatchMedia } from './test-utils/viewport';
installMatchMedia();

// jsdom n'implémente pas Blob.prototype.text (lecture des G-code dans le navigateur) : repli sur FileReader.
if (typeof Blob.prototype.text !== 'function') {
  Blob.prototype.text = function text(this: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}
