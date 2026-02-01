import { fetchEventSource, EventStreamContentType } from '../src/fetch';

function createMockResponse(
    body: string,
    contentType = EventStreamContentType,
    status = 200,
    statusText = 'OK'
): Response {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode(body));
            controller.close();
        }
    });

    return new Response(stream, {
        status,
        statusText,
        headers: { 'content-type': contentType }
    });
}

describe('fetch', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('EventStreamContentType', () => {
        it('should be text/event-stream', () => {
            expect(EventStreamContentType).toBe('text/event-stream');
        });
    });

    describe('fetchEventSource', () => {
        it('should make a fetch request and parse messages', async () => {
            const messages: { id: string; event: string; data: string }[] = [];
            const mockFetch = jest.fn().mockResolvedValue(
                createMockResponse('id: 1\nevent: test\ndata: hello\n\n')
            );

            const promise = fetchEventSource('http://test.com/sse', {
                fetch: mockFetch,
                openWhenHidden: true,
                onmessage: (msg) => {
                    messages.push(msg);
                }
            });

            await promise;

            expect(mockFetch).toHaveBeenCalledWith(
                'http://test.com/sse',
                expect.objectContaining({
                    headers: expect.objectContaining({
                        accept: EventStreamContentType
                    })
                })
            );
            expect(messages).toHaveLength(1);
            expect(messages[0]).toEqual({
                id: '1',
                event: 'test',
                data: 'hello',
                retry: undefined
            });
        });

        it('should use custom accept header if provided', async () => {
            const mockFetch = jest.fn().mockResolvedValue(
                createMockResponse('data: test\n\n')
            );

            await fetchEventSource('http://test.com/sse', {
                fetch: mockFetch,
                openWhenHidden: true,
                headers: { accept: 'custom/type' }
            });

            expect(mockFetch).toHaveBeenCalledWith(
                'http://test.com/sse',
                expect.objectContaining({
                    headers: expect.objectContaining({
                        accept: 'custom/type'
                    })
                })
            );
        });

        it('should handle null headers without throwing (issue #52)', async () => {
            const mockFetch = jest.fn().mockResolvedValue(
                createMockResponse('data: test\n\n')
            );

            // This simulates React state being null after navigation
            await fetchEventSource('http://test.com/sse', {
                fetch: mockFetch,
                openWhenHidden: true,
                headers: null as unknown as Record<string, string>
            });

            expect(mockFetch).toHaveBeenCalledWith(
                'http://test.com/sse',
                expect.objectContaining({
                    headers: expect.objectContaining({
                        accept: EventStreamContentType
                    })
                })
            );
        });

        it('should handle undefined headers without throwing', async () => {
            const mockFetch = jest.fn().mockResolvedValue(
                createMockResponse('data: test\n\n')
            );

            await fetchEventSource('http://test.com/sse', {
                fetch: mockFetch,
                openWhenHidden: true,
                headers: undefined
            });

            expect(mockFetch).toHaveBeenCalledWith(
                'http://test.com/sse',
                expect.objectContaining({
                    headers: expect.objectContaining({
                        accept: EventStreamContentType
                    })
                })
            );
        });

        it('should call onopen with response', async () => {
            const mockResponse = createMockResponse('data: test\n\n');
            const mockFetch = jest.fn().mockResolvedValue(mockResponse);
            const onopen = jest.fn().mockResolvedValue(undefined);

            await fetchEventSource('http://test.com/sse', {
                fetch: mockFetch,
                openWhenHidden: true,
                onopen
            });

            expect(onopen).toHaveBeenCalledWith(mockResponse);
        });

        it('should call onclose when stream ends', async () => {
            const mockFetch = jest.fn().mockResolvedValue(
                createMockResponse('data: test\n\n')
            );
            const onclose = jest.fn();

            await fetchEventSource('http://test.com/sse', {
                fetch: mockFetch,
                openWhenHidden: true,
                onclose
            });

            expect(onclose).toHaveBeenCalled();
        });

        it('should throw error for invalid content-type with default onopen', async () => {
            const mockFetch = jest.fn().mockResolvedValue(
                createMockResponse('data: test\n\n', 'text/plain')
            );
            const onerror = jest.fn().mockImplementation(() => {
                throw new Error('stop retry');
            });

            await expect(fetchEventSource('http://test.com/sse', {
                fetch: mockFetch,
                openWhenHidden: true,
                onerror
            })).rejects.toThrow('stop retry');

            expect(onerror).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('Expected content-type to be text/event-stream')
                })
            );
        });

        it('should throw error with status code for non-ok response (issue #50)', async () => {
            const mockFetch = jest.fn().mockResolvedValue(
                createMockResponse('Not Found', 'text/plain', 404, 'Not Found')
            );
            const onerror = jest.fn().mockImplementation(() => {
                throw new Error('stop retry');
            });

            await expect(fetchEventSource('http://test.com/sse', {
                fetch: mockFetch,
                openWhenHidden: true,
                onerror
            })).rejects.toThrow('stop retry');

            expect(onerror).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('Request failed with status 404')
                })
            );
        });

        it('should throw error for 500 server error with default onopen', async () => {
            const mockFetch = jest.fn().mockResolvedValue(
                createMockResponse('Internal Server Error', 'text/html', 500, 'Internal Server Error')
            );
            const onerror = jest.fn().mockImplementation(() => {
                throw new Error('stop retry');
            });

            await expect(fetchEventSource('http://test.com/sse', {
                fetch: mockFetch,
                openWhenHidden: true,
                onerror
            })).rejects.toThrow('stop retry');

            expect(onerror).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('Request failed with status 500')
                })
            );
        });

        it('should resolve when abort signal is triggered', async () => {
            const controller = new AbortController();
            const mockFetch = jest.fn().mockImplementation(() =>
                new Promise(() => {})
            );

            const promise = fetchEventSource('http://test.com/sse', {
                fetch: mockFetch,
                signal: controller.signal,
                openWhenHidden: true
            });

            controller.abort();
            await expect(promise).resolves.toBeUndefined();
        });

        it('should retry on error with default interval', async () => {
            let callCount = 0;
            const mockFetch = jest.fn().mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                    return Promise.reject(new Error('network error'));
                }
                return Promise.resolve(createMockResponse('data: test\n\n'));
            });

            const promise = fetchEventSource('http://test.com/sse', {
                fetch: mockFetch,
                openWhenHidden: true
            });

            await jest.advanceTimersByTimeAsync(1000);
            await promise;

            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        it('should use custom retry interval from onerror', async () => {
            let callCount = 0;
            const mockFetch = jest.fn().mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                    return Promise.reject(new Error('network error'));
                }
                return Promise.resolve(createMockResponse('data: test\n\n'));
            });

            const promise = fetchEventSource('http://test.com/sse', {
                fetch: mockFetch,
                openWhenHidden: true,
                onerror: () => 500
            });

            await jest.advanceTimersByTimeAsync(500);
            await promise;

            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        it('should stop retrying when onerror throws', async () => {
            const mockFetch = jest.fn().mockRejectedValue(new Error('network error'));
            const onerror = jest.fn().mockImplementation(() => {
                throw new Error('fatal error');
            });

            await expect(fetchEventSource('http://test.com/sse', {
                fetch: mockFetch,
                openWhenHidden: true,
                onerror
            })).rejects.toThrow('fatal error');

            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it('should send last-event-id header on retry', async () => {
            let callCount = 0;
            const mockFetch = jest.fn().mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                    const response = createMockResponse('id: event-123\ndata: first\n\n');
                    return Promise.resolve(response);
                }
                return Promise.resolve(createMockResponse('data: second\n\n'));
            });

            let firstOnClose = true;
            const promise = fetchEventSource('http://test.com/sse', {
                fetch: mockFetch,
                openWhenHidden: true,
                onclose: () => {
                    if (firstOnClose) {
                        firstOnClose = false;
                        throw new Error('retry');
                    }
                }
            });

            await jest.advanceTimersByTimeAsync(1000);
            await promise;

            expect(mockFetch).toHaveBeenCalledTimes(2);
            expect(mockFetch.mock.calls[1][1].headers['last-event-id']).toBe('event-123');
        });

        it('should update retry interval from server message', async () => {
            let callCount = 0;
            const mockFetch = jest.fn().mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                    return Promise.resolve(createMockResponse('retry: 2000\ndata: test\n\n'));
                }
                if (callCount === 2) {
                    return Promise.reject(new Error('error'));
                }
                return Promise.resolve(createMockResponse('data: done\n\n'));
            });

            let closeCount = 0;
            const promise = fetchEventSource('http://test.com/sse', {
                fetch: mockFetch,
                openWhenHidden: true,
                onclose: () => {
                    closeCount++;
                    if (closeCount === 1) {
                        throw new Error('retry');
                    }
                }
            });

            await jest.advanceTimersByTimeAsync(2000);
            await jest.advanceTimersByTimeAsync(2000);
            await promise;

            expect(mockFetch).toHaveBeenCalledTimes(3);
        });

        it('should handle visibility change when openWhenHidden is false', async () => {
            const mockFetch = jest.fn().mockImplementation(() =>
                new Promise(() => {})
            );
            const controller = new AbortController();

            const promise = fetchEventSource('http://test.com/sse', {
                fetch: mockFetch,
                signal: controller.signal,
                openWhenHidden: false
            });

            expect(mockFetch).toHaveBeenCalledTimes(1);

            Object.defineProperty(document, 'hidden', { value: true, configurable: true });
            document.dispatchEvent(new Event('visibilitychange'));

            Object.defineProperty(document, 'hidden', { value: false, configurable: true });
            document.dispatchEvent(new Event('visibilitychange'));

            await jest.advanceTimersByTimeAsync(0);
            expect(mockFetch).toHaveBeenCalledTimes(2);

            controller.abort();
            await promise;
        });

        it('should clear last-event-id when id is empty', async () => {
            let callCount = 0;
            const mockFetch = jest.fn().mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                    return Promise.resolve(createMockResponse('id: event-123\ndata: first\n\nid:\ndata: second\n\n'));
                }
                return Promise.resolve(createMockResponse('data: third\n\n'));
            });

            let firstOnClose = true;
            const promise = fetchEventSource('http://test.com/sse', {
                fetch: mockFetch,
                openWhenHidden: true,
                onclose: () => {
                    if (firstOnClose) {
                        firstOnClose = false;
                        throw new Error('retry');
                    }
                }
            });

            await jest.advanceTimersByTimeAsync(1000);
            await promise;

            expect(mockFetch).toHaveBeenCalledTimes(2);
            expect(mockFetch.mock.calls[1][1].headers['last-event-id']).toBeUndefined();
        });
    });
});
