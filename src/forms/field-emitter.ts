import type {
  FieldControllerEventHandler,
  FieldControllerEventType,
  FieldState,
} from './types';

export class FieldEmitter {
  private listeners = new Map<FieldControllerEventType, Set<FieldControllerEventHandler>>();

  on(event: FieldControllerEventType, handler: FieldControllerEventHandler): void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
  }

  once(event: FieldControllerEventType, handler: FieldControllerEventHandler): void {
    const wrapper: FieldControllerEventHandler = (state) => {
      this.off(event, wrapper);
      handler(state);
    };
    this.on(event, wrapper);
  }

  off(event: FieldControllerEventType, handler: FieldControllerEventHandler): void {
    this.listeners.get(event)?.delete(handler);
  }

  emit(event: FieldControllerEventType, state: FieldState, fieldName: string): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const handler of [...set]) {
      try {
        handler({ ...state });
      } catch (err) {
        console.error(`[FormsModule] Error in field "${fieldName}" "${event}" handler:`, err);
      }
    }
  }

  destroy(): void {
    this.listeners.clear();
  }
}
