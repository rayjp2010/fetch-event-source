import * as index from '../src/index';

describe('index', () => {
    it('should export fetchEventSource', () => {
        expect(index.fetchEventSource).toBeDefined();
        expect(typeof index.fetchEventSource).toBe('function');
    });

    it('should export EventStreamContentType', () => {
        expect(index.EventStreamContentType).toBeDefined();
        expect(index.EventStreamContentType).toBe('text/event-stream');
    });

    it('should export FetchEventSourceInit type (verified by TypeScript compilation)', () => {
        const init: index.FetchEventSourceInit = {
            onmessage: () => {},
            onopen: async () => {},
            onclose: () => {},
            onerror: () => {}
        };
        expect(init).toBeDefined();
    });

    it('should export EventSourceMessage type (verified by TypeScript compilation)', () => {
        const message: index.EventSourceMessage = {
            id: 'test-id',
            event: 'test-event',
            data: 'test-data'
        };
        expect(message).toBeDefined();
        expect(message.id).toBe('test-id');
        expect(message.event).toBe('test-event');
        expect(message.data).toBe('test-data');
    });
});
