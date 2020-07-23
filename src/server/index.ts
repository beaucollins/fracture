import { IncomingMessage, ServerResponse, OutgoingHttpHeaders } from 'http';
import { Handler, Route, Responder, Response, Request } from './endpoint';
import { failure, success, mapFailure } from '../parse';
import { Readable } from 'stream';

export type Endpoint = (request: IncomingMessage, response: ServerResponse) => Response|Promise<Response>;

export function serve(handler: Handler, defaultHandler: (req: Request) => Response|Promise<Response> = notFound): Endpoint {
    return async (req: IncomingMessage, res: ServerResponse) => {
        const request: Request = {
            request: req,
            method: req.method ?? 'GET',
            url: req.url ?? '/',
            headers: req.headers,
        };
        const result = await mapFailure(
            await handler(request),
            async () => success(await defaultHandler(request))
        );

        const [status, headers, stream] = result.value;
        res.writeHead(status, headers);
        stream.pipe(res);
        return result.value;
    }
}

export function jsonResponse(
    status: number,
    headers: OutgoingHttpHeaders,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    json: any
): Response {
    const body = Buffer.from(JSON.stringify(json));
    const stream = Readable.from([body]);
    return [
        status,
        {
            ...headers,
            'content-type': 'application/json',
            'content-length': body.length,
        },
        stream
    ];
}

function notFound(): Response {
    return jsonResponse(404, {}, {status: 'not-found'});
}

export function sendJson<T>(encoder: (context: T, request: Request) => [number, OutgoingHttpHeaders, any]): Responder<T> {
    return (context, request) => {
        const [status, headers, data] = encoder(context, request);
        return jsonResponse(status, headers, data);
    }
}

export function method<T extends ('GET'|'POST')>(method: T): Route<T> {
    return req => req.method === method ? success(method) : failure(req, `method is ${req.method}`)
}

export function exactPath<T extends string>(path: T): Route<T> {
    return req => req.url === path ? success(path) : failure(req, `Path ${req.url} is not ${path}`)
}

export function always<T>(value: T): () => T {
    return () => value;
}
