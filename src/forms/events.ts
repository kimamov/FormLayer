import type {
  FormEventType,
  RegistryEventType,
  FormEventHandler,
  RegistryEventHandler,
} from './types';

type AnyHandler = FormEventHandler | RegistryEventHandler;
type AnyEventType = FormEventType | RegistryEventType;

export class EventBus {
  private listeners = new Map<AnyEventType, Set<AnyHandler>>();

  /** Subscribe; returns a function that unsubscribes. */
  on(event: AnyEventType, handler: AnyHandler): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
    return () => this.off(event, handler);
  }

  once(event: AnyEventType, handler: AnyHandler): () => void {
    const wrapper = ((...args: unknown[]) => {
      this.off(event, wrapper as AnyHandler);
      (handler as (...a: unknown[]) => void)(...args);
    }) as AnyHandler;
    return this.on(event, wrapper);
  }

  off(event: AnyEventType, handler: AnyHandler): void {
    this.listeners.get(event)?.delete(handler);
  }

  emit(event: AnyEventType, detail: unknown): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const handler of [...set]) {
      try {
        (handler as (detail: unknown) => void)(detail);
      } catch (err) {
        console.error(`[FormLayer] Error in "${event}" handler:`, err);
      }
    }
  }

  destroy(): void {
    this.listeners.clear();
  }
}
