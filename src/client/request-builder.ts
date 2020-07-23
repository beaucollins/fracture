import { RequestOptions } from 'http';
import { encode as encodeQueryString, ParsedUrlQueryInput } from 'querystring';

export type RequestBuilder<T> = (options: T, request: RequestOptions) => RequestOptions;

export const host = setRequestProperty('host');
export const method = setRequestProperty('method');

export const get = pathWithMethod('GET');
export const post = pathWithMethod('POST');
export const put = pathWithMethod('PUT');
export const del = pathWithMethod('DELETE');

export function setRequestProperty<K extends keyof RequestOptions>(property: K) {
    return function<T>(propertyBuilder: (options: T) => RequestOptions[K]): RequestBuilder<T> {
        return function(options, request) {
            return {
                ...request,
                [property]: propertyBuilder(options)
            };
        }
    }
}

function pathWithMethod(method: 'GET' | 'PUT' | 'POST' | 'DELETE') {
    return function <T>(pathBuilder: (string | ((config: T) => string)), queryBuilder?: (config: T) => ParsedUrlQueryInput): RequestBuilder<T> {
        const buildPath: (config: T) => string = typeof pathBuilder === 'string' ? () => pathBuilder : pathBuilder;
        const buildQuery: (config: T) => ParsedUrlQueryInput = queryBuilder ?? (() => ({}));
        return function(config, request) {
            const path = buildPath(config);
            const query = encodeQueryString(buildQuery(config));
            return {
                ...request,
                method: method,
                path: query && query !== '' ? path.concat(path.indexOf('?') > -1 ? '&' : '?', query) : path
            };
        }
    }
}

export function appendQuery<T>(buildQuery: (input: T) => ParsedUrlQueryInput): RequestBuilder<T> {
    return function(input, request) {
        const path = request.path ?? '';
        const hasQuery = path.indexOf('?') > -1;
        const query = encodeQueryString(buildQuery(input));
        return {
            ...request,
            path: path.concat(hasQuery ? '&' : '?', query)
        }
    }
}

function encodeBasicAuthHeader(username: string, password: string) {
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');
    return `Basic ${credentials}`;
}

export function build<T>(...builders: Array<RequestBuilder<T>>): RequestBuilder<T> {
    if (builders.length == 0) {
        throw new Error('No builders provided');
    }

    if (builders.length == 1) {
        return builders[0];
    }
    const [initial, ...rest] = builders;
    return function(input, initialRequest) {
        const [, out] = rest.reduce(function([options, request], builder) {
            return [options, builder(options, request)];
        }, [input, initial(input, initialRequest)]);
        return out;
    }
}

export function mapRequestBuilder<A, B>(map: (a: A) => B, builder: RequestBuilder<B>): RequestBuilder<A>  {
    return function(a, request) {
        return builder(map(a), request);
    }
}

export function addHeader<T>(headerName: string, headerValue: (options: T) => string): RequestBuilder<T> {
    return function(options, request) {
        const headers = request.headers ?? {};
        return {
            ...request,
            headers: { ...headers, [headerName]: headerValue(options)}
        }
    }
}

export function basicAuth<T>(createCredentials: (options: T) => [string, string]): RequestBuilder<T> {
    return addHeader('authorization', (options) => encodeBasicAuthHeader(...createCredentials(options)));
}
