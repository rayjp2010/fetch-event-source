import { EventSourceMessage, getBytes, getLines, getMessages } from './parse.js';

export const EventStreamContentType = 'text/event-stream';

const DefaultRetryInterval = 1000;
const LastEventId = 'last-event-id';

export interface FetchEventSourceInit extends Omit<RequestInit, 'headers'> {
    /**
     * The request headers. FetchEventSource only supports the Record<string,string> format,
     * or a function that returns headers. Using a function allows dynamic headers that are
     * refreshed on each retry, useful for updating Authorization tokens.
     */
    headers?: Record<string, string> | (() => Record<string, string>),

    /**
     * Called when a response is received. Use this to validate that the response
     * actually matches what you expect (and throw if it doesn't.) If not provided,
     * will default to a basic validation to ensure the content-type is text/event-stream.
     */
    onopen?: (response: Response) => Promise<void>,

    /**
     * Called when a message is received. NOTE: Unlike the default browser
     * EventSource.onmessage, this callback is called for _all_ events,
     * even ones with a custom `event` field.
     */
    onmessage?: (ev: EventSourceMessage) => void;

    /**
     * Called when a response finishes. If you don't expect the server to kill
     * the connection, you can throw an exception here and retry using onerror.
     */
    onclose?: () => void;

    /**
     * Called when there is any error making the request / processing messages /
     * handling callbacks etc. Use this to control the retry strategy: if the
     * error is fatal, rethrow the error inside the callback to stop the entire
     * operation. Otherwise, you can return an interval (in milliseconds) after
     * which the request will automatically retry (with the last-event-id).
     * If this callback is not specified, or it returns undefined, fetchEventSource
     * will treat every error as retriable and will try again after 1 second.
     */
    onerror?: (err: any) => number | null | undefined | void,

    /**
     * If true, will keep the request open even if the document is hidden.
     * By default, fetchEventSource will close the request and reopen it
     * automatically when the document becomes visible again.
     */
    openWhenHidden?: boolean;

    /** The Fetch function to use. Defaults to window.fetch */
    fetch?: typeof fetch;
}

export function fetchEventSource(input: RequestInfo, {
    signal: inputSignal,
    headers: inputHeaders,
    onopen: inputOnOpen,
    onmessage,
    onclose,
    onerror,
    openWhenHidden,
    fetch: inputFetch,
    ...rest
}: FetchEventSourceInit) {
    // Create a function to get headers, supporting both static and dynamic headers
    const getHeaders: () => Record<string, string> = typeof inputHeaders === 'function'
        ? inputHeaders
        : () => ({ ...(inputHeaders ?? {}) });

    return new Promise<void>((resolve, reject) => {
        // Track last-event-id separately so it persists across retries even with dynamic headers
        let lastEventId: string | undefined;

        let curRequestController: AbortController;
        function onVisibilityChange() {
            curRequestController.abort(); // close existing request on every visibility change
            if (!document.hidden) {
                create(); // page is now visible again, recreate request.
            }
        }

        if (!openWhenHidden) {
            document.addEventListener('visibilitychange', onVisibilityChange);
        }

        let retryInterval = DefaultRetryInterval;
        let retryTimer = 0;
        function dispose() {
            document.removeEventListener('visibilitychange', onVisibilityChange);
            window.clearTimeout(retryTimer);
            // Only abort if not already aborted to avoid unnecessary DOMException logs
            if (!curRequestController.signal.aborted) {
                curRequestController.abort();
            }
        }

        // if the incoming signal aborts, dispose resources and resolve:
        inputSignal?.addEventListener('abort', () => {
            dispose();
            resolve(); // don't waste time constructing/logging errors
        });

        const fetch = inputFetch ?? window.fetch;
        const onopen = inputOnOpen ?? defaultOnOpen;
        async function create() {
            // Get fresh headers on each attempt (supports dynamic headers for token refresh)
            const headers = getHeaders();
            if (!headers.accept) {
                headers.accept = EventStreamContentType;
            }
            // Add last-event-id if we have one from a previous connection
            if (lastEventId) {
                headers[LastEventId] = lastEventId;
            }

            // Store controller in local scope to avoid race condition during rapid tab switches.
            // Without this, the catch block might check a different controller's abort status.
            const currentController = new AbortController();
            curRequestController = currentController;
            try {
                const response = await fetch(input, {
                    ...rest,
                    headers,
                    signal: currentController.signal,
                });

                await onopen(response);

                await getBytes(response.body!, getLines(getMessages(id => {
                    if (id) {
                        // store the id and send it back on the next retry:
                        lastEventId = id;
                    } else {
                        // don't send the last-event-id header anymore:
                        lastEventId = undefined;
                    }
                }, retry => {
                    retryInterval = retry;
                }, onmessage)));

                onclose?.();
                dispose();
                resolve();
            } catch (err) {
                if (!currentController.signal.aborted) {
                    // if we haven't aborted the request ourselves:
                    try {
                        // check if we need to retry:
                        const interval: any = onerror?.(err) ?? retryInterval;
                        window.clearTimeout(retryTimer);
                        // if user aborted during onerror callback, stop retrying:
                        if (inputSignal?.aborted) {
                            dispose();
                            resolve();
                            return;
                        }
                        // if page is hidden and openWhenHidden is false, don't retry now.
                        // onVisibilityChange will call create() when page becomes visible.
                        if (!openWhenHidden && document.hidden) {
                            return;
                        }
                        retryTimer = window.setTimeout(create, interval);
                    } catch (innerErr) {
                        // we should not retry anymore:
                        dispose();
                        reject(innerErr);
                    }
                }
            }
        }

        create();
    });
}

function defaultOnOpen(response: Response) {
    if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}: ${response.statusText}`);
    }
    const contentType = response.headers.get('content-type');
    if (!contentType?.startsWith(EventStreamContentType)) {
        throw new Error(`Expected content-type to be ${EventStreamContentType}, Actual: ${contentType}`);
    }
}
