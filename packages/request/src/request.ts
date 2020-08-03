import { Result, isSuccess } from '@fracture/parse';
import { IncomingMessage } from 'http';
import { encode, ParsedUrlQueryInput } from 'querystring';
import { format } from 'util';
import { request as createRequest, RequestOptions } from 'https';
import * as response from './response-handler';
import * as request from './request-handler';
import * as build from './request-builder';

export { response, request, build };

export type ApiResponse<O> = {
    result: O,
    response: IncomingMessage,
    request: RequestOptions,
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ApiRequest<T, R=any> = (options: T) => Promise<ApiResponse<R>>;

export type ApiResponseType<T> = T extends ApiResponse<infer U> ? U : never;

export function asApiResponse<T>(request: RequestOptions, response: IncomingMessage, resolve: (result: ApiResponse<T>) => void): (result: T) => void {
    return function(result) {
        resolve({
            result,
            response,
            request
        });
    }
}

/**
 *
 * Given options T and api response of type O, uses three functions to handle
 * the pipeline of sending an HTTP Request and receving a HTTP Respose.
 *
 * @param buildRequest RequetsBuilder<T>
 * @param handleRequest RequestHandler<T>
 * @param handleResponse ResponseHandler<O>
 * @returns ApiRequest<T,O>
 */
export function apiRequest<T, O>(buildRequest: build.RequestBuilder<T>, handleRequest: request.RequestHandler<T>, handleResponse: response.ResponseHandler<O>): ApiRequest<T,O> {
    return function(config) {
        const options = buildRequest(config, {});
        return new Promise((resolve, reject) => {
            handleRequest(
                config,
                createRequest(
                    options,
                    response => handleResponse(response, asApiResponse(options, response, resolve), reject)
                ).on('error', reject)
            );
        });
    }
}

/**
 * Defines a requestor that sends no body and decodes the response as JSON.
 *
 * @param buildRequest RequestBuilder<T>
 */
export function getJson<T>(buildRequest: build.RequestBuilder<T>): ApiRequest<T> {
    return apiRequest(
        buildRequest,
        request.emptyBody,
        response.decodeJson
    );
}

/**
 * Sends the JSON encoded value returned by encoder with Content-Type: application/json.
 *
 * Expects the response body to be JSON encoded string and decodes it.
 *
 * @param buildRequest RequestBuilder<T>
 * @param encoder T => any
 * @return T => Promise<any>
 */
export function putJson<T>(
    buildRequest: build.RequestBuilder<T>,
    encoder: (options: T) => any
): (config: T) => Promise<ApiResponse<any>> {
    return jsonEncodedRequest(buildRequest, encoder, response.decodeJson);
}

export function sendJson<T, O=any>(
    buildRequest: build.RequestBuilder<T>,
    encoder: (options: T) => any,
    responseHandler: response.ResponseHandler<O>
): (config: T) => Promise<ApiResponse<O>> {
    return jsonEncodedRequest(
        buildRequest,
        encoder,
        responseHandler
    )
}

export function sendURLEncoded<T, O>(
    buildRequest: build.RequestBuilder<T>,
    encoder: (options: T) => ParsedUrlQueryInput,
    responseHandler: response.ResponseHandler<O>
): (config: T) => Promise<ApiResponse<O>> {
    return urlEncodedRequest(
        buildRequest,
        encoder,
        responseHandler
    );
}

export function jsonEncodedRequest<T, O>(
    buildRequest: build.RequestBuilder<T>,
    encoder: (options: T) => any,
    handleResponse: response.ResponseHandler<O>
): (config: T) => Promise<ApiResponse<O>> {
    return requestWithBody(
        buildRequest,
        mapBuffer(mapEncoder(encoder, JSON.stringify), 'application/json'),
        handleResponse
    );
}

function mapBuffer<O, T, S extends string>(encoder: (options: O) => T, contentType: S ) {
    return (options: O): [Buffer, S] => {
        return [Buffer.from(encoder(options)), contentType]
    }
}

function mapEncoder<T, A, B>(encoder: (options: T) => A, map: (encoded: A) => B): (options: T) => B {
    return options => map(encoder(options));
}

export function urlEncodedRequest<T, O>(
    buildRequest: build.RequestBuilder<T>,
    encoder: (options: T) => ParsedUrlQueryInput,
    handleResponse: response.ResponseHandler<O>
): (config: T) => Promise<ApiResponse<O>> {
    return requestWithBody(
        buildRequest,
        mapBuffer(mapEncoder(encoder, encode), 'application/x-www-form-urlencoded'),
        handleResponse
    );
}

export function requestWithBody<T, O>(
    buildRequest: build.RequestBuilder<T>,
    encoder: (options: T) => [Buffer, string],
    handleResponse: response.ResponseHandler<O>
): (config: T) => Promise<ApiResponse<O>> {
    return function(config: T) {
        const [buffer, contentType] = encoder(config);
        return apiRequest(
            build.build(
                buildRequest,
                build.addHeader('content-length', () => String(buffer.length)),
                build.addHeader('content-type', () => contentType)
            ),
            request.writeBuffer(buffer),
            handleResponse
        )(config);
    }
}

/**
 * An ApiResponse resolver that expects the status code to be a 2XX response.
 *
 * @param response ApiResponse<T>
 * @return ApiResponse<T>
 */
export function requireSuccess<T>(response: ApiResponse<T>): Promise<ApiResponse<T>> {
    if (response.response.statusCode === undefined) {
        return Promise.reject(new Error('Missing status code'));
    }
    if (response.response.statusCode >= 300) {
        return Promise.reject(new Error(`Failed: ${response.request.method} ${response.request.host}${response.request.path} ${response.response.statusCode} ${JSON.stringify(response.result)}`));
    }
    return Promise.resolve(response);
}

export function requireStatusCode<T>(statusCode: number, ...statusCodes: number[]): (response: ApiResponse<T>) => Promise<ApiResponse<T>> {
    const acceptedCodes: {[code: number]: true|undefined} = [statusCode, ...statusCodes].reduce(
        (codes, code) => ({...codes, [code]: true}),
        {}
    );
    return (response) => {
        const responseStatusCode = response.response.statusCode;
        if (!responseStatusCode) {
            return Promise.reject(new Error('Missing status code'));
        }
        if (!acceptedCodes[responseStatusCode]) {
            return Promise.reject(new Error(`Unexpected status code: ${responseStatusCode} ${response.request.method} ${response.request.host}${response.request.path}`));
        }
        return Promise.resolve(response);
    }
}

/**
 * Resolver that Logs the response status code.
 *
 * @param response ApiResponse<T>
 * @return ApiResponse<T>
 */
export function logStatus<T>(response: ApiResponse<T>): ApiResponse<T> {
    console.warn('Response, Status', response.response.statusCode);
    return response;
}

export function requireValid<T>(result: Result<T>): Promise<T> {
	return isSuccess(result)
		? Promise.resolve(result.value)
		: Promise.reject(new Error(result.reason));
}

export function requireValidResponse<T>(response: ApiResponse<Result<T>>): Promise<T> {
    return requireValid(response.result);
}

export function mapRequestOptions<A>(mapOptions: <T>(options: T) => A) {
    return <X,O>(api: ApiRequest<A,O>): ApiRequest<X,O> =>
        options =>  api(mapOptions(options))
}

export function logResponse<T>(response: ApiResponse<T>): ApiResponse<T> {
    process.stderr.write(format('Result\n', response.result));
    return response;
}
