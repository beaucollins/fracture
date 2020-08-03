import { IncomingMessage } from 'http';
import { Result, Parser, failure, success, mapParser, mapFailure } from '@fracture/parse';

export type ResponseHandler<T> = (response: IncomingMessage, resolve: (result: T) => void, reject: (error: Error) => void) => void;

export function collectBuffers(): ResponseHandler<Array<Buffer>> {
    return function(res, onResult, onError) {
        const buffers: Array<Buffer> = [];
        res.on('data', function(data) {
            buffers.push(data);
        });
        res.on('end', function() {
            onResult(buffers);
        });
        res.on('error', onError);
    }
}

export const withData = mapHandler(collectBuffers(), buffers => Buffer.concat(buffers).toString('utf-8'));

export const decodeJson = mapHandler(collectBuffers(), (buffers, res) => {
    try {
        return JSON.parse(Buffer.concat(buffers).toString('utf8'));
    } catch (error) {
        console.error('failed to parse', res.statusCode, Buffer.concat(buffers).toString('utf8'));
        throw error;
    }
});

export function mapHandler<A, B>(handler: ResponseHandler<A>, map: (result: A, res: IncomingMessage) => B): ResponseHandler<B> {
    return function(res, onResult, onError) {
        return handler(res, (a) => {
            try {
                onResult(map(a, res));
            } catch (error) {
                onError(error);
            }
        }, onError);
    }
}

function parseJson(raw: string): Result<any, string> {
    try {
        return success(JSON.parse(raw));
    } catch (error) {
        return failure(raw, error.message);
    }
}

export function withParser<O,I>(parse: Parser<O,I>): Parser<O, string> {
	return mapParser(
        parseJson,
        value => mapFailure(
            parse(value),
            (failure) => ({...failure, value})
        )
    );
}
