// Mock DOM APIs needed by fetch.ts
const documentListeners: Map<string, EventListener[]> = new Map();

Object.defineProperty(globalThis, 'document', {
    value: {
        hidden: false,
        addEventListener: (type: string, listener: EventListener) => {
            if (!documentListeners.has(type)) {
                documentListeners.set(type, []);
            }
            documentListeners.get(type)!.push(listener);
        },
        removeEventListener: (type: string, listener: EventListener) => {
            const listeners = documentListeners.get(type);
            if (listeners) {
                const idx = listeners.indexOf(listener);
                if (idx !== -1) listeners.splice(idx, 1);
            }
        },
        dispatchEvent: (event: Event) => {
            const listeners = documentListeners.get(event.type);
            if (listeners) {
                listeners.forEach(l => l(event));
            }
        }
    },
    writable: true,
    configurable: true,
});

Object.defineProperty(globalThis, 'window', {
    value: {
        fetch: globalThis.fetch,
        setTimeout: globalThis.setTimeout,
        clearTimeout: globalThis.clearTimeout,
    },
    writable: true,
    configurable: true,
});
