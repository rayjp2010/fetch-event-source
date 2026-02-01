# Fetch Event Source
This package provides a better API for making [Event Source requests](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) - also known as server-sent events - with all the features available in the [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API).

The [default browser EventSource API](https://developer.mozilla.org/en-US/docs/Web/API/EventSource) imposes several restrictions on the type of request you're allowed to make: the [only parameters](https://developer.mozilla.org/en-US/docs/Web/API/EventSource/EventSource#Parameters) you're allowed to pass in are the `url` and `withCredentials`, so:
* You cannot pass in a request body: you have to encode all the information necessary to execute the request inside the URL, which is [limited to 2000 characters](https://stackoverflow.com/questions/417142) in most browsers.
* You cannot pass in custom request headers
* You can only make GET requests - there is no way to specify another method.
* If the connection is cut, you don't have any control over the retry strategy: the browser will silently retry for you a few times and then stop, which is not good enough for any sort of robust application.

This library provides an alternate interface for consuming server-sent events, based on the Fetch API. It is fully compatible with the [Event Stream format](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events#Event_stream_format), so if you already have a server emitting these events, you can consume it just like before. However, you now have greater control over the request and response so:

* You can use any request method/headers/body, plus all the other functionality exposed by fetch(). You can even provide an alternate fetch() implementation, if the default browser implementation doesn't work for you.
* You have access to the response object if you want to do some custom validation/processing before  parsing the event source. This is useful in case you have API gateways (like nginx) in front of your application server: if the gateway returns an error, you might want to handle it correctly.
* If the connection gets cut or an error occurs, you have full control over the retry strategy.

In addition, this library also plugs into the browser's [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) so the connection closes if the document is hidden (e.g., the user minimizes the window), and automatically retries with the last event ID when it becomes visible again. This reduces the load on your server by not having open connections unnecessarily (but you can opt out of this behavior if you want.)

# Install
```sh
npm install @microsoft/fetch-event-source
```

# Usage
```ts
// BEFORE:
const sse = new EventSource('/api/sse');
sse.onmessage = (ev) => {
    console.log(ev.data);
};

// AFTER:
import { fetchEventSource } from '@microsoft/fetch-event-source';

await fetchEventSource('/api/sse', {
    onmessage(ev) {
        console.log(ev.data);
    }
});
```

You can pass in all the [other parameters](https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/fetch#Parameters) exposed by the default fetch API, for example:
```ts
const ctrl = new AbortController();
fetchEventSource('/api/sse', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        foo: 'bar'
    }),
    signal: ctrl.signal,
});
```

You can add better error handling, for example:
```ts
class RetriableError extends Error { }
class FatalError extends Error { }

fetchEventSource('/api/sse', {
    async onopen(response) {
        if (response.ok && response.headers.get('content-type') === EventStreamContentType) {
            return; // everything's good
        } else if (response.status >= 400 && response.status < 500 && response.status !== 429) {
            // client-side errors are usually non-retriable:
            throw new FatalError();
        } else {
            throw new RetriableError();
        }
    },
    onmessage(msg) {
        // if the server emits an error message, throw an exception
        // so it gets handled by the onerror callback below:
        if (msg.event === 'FatalError') {
            throw new FatalError(msg.data);
        }
    },
    onclose() {
        // if the server closes the connection unexpectedly, retry:
        throw new RetriableError();
    },
    onerror(err) {
        if (err instanceof FatalError) {
            throw err; // rethrow to stop the operation
        } else {
            // do nothing to automatically retry. You can also
            // return a specific retry interval here.
        }
    }
});
```

# Compatibility
This library is written in typescript and targets ES2017 features supported by all evergreen browsers (Chrome, Firefox, Safari, Edge.) You might need to [polyfill TextDecoder](https://www.npmjs.com/package/fast-text-encoding) for old Edge (versions < 79), though:
```js
require('fast-text-encoding');
```

# Connection Limits

This library does not impose any connection limits, but browsers and servers do. Keep these limitations in mind when designing your application:

| Factor | Typical Limit | Notes |
|--------|---------------|-------|
| HTTP/1.1 connections per domain | ~6 | Browser-enforced limit |
| HTTP/2 streams per connection | ~100-256 | Better multiplexing, but still limited |
| Browser memory | Varies | Each connection consumes memory |
| Server connections | Varies | Depends on server configuration |

**Recommendations for applications requiring many concurrent streams:**

1. **Use HTTP/2** on your server to benefit from connection multiplexing
2. **Consolidate streams** - use a single SSE connection with event routing instead of many separate connections
3. **Consider alternatives** - for 100+ real-time streams, WebSockets or a pub/sub architecture may be more appropriate
4. **Close unused connections** - use the `AbortController` to close connections when they're no longer needed

# Contributing

This project welcomes contributions and suggestions.  Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.opensource.microsoft.com.

When you submit a pull request, a CLA bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., status check, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.
