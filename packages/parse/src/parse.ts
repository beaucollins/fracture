/**
 *
 */
/* eslint @typescript-eslint/no-explicit-any: 0 */
export type Failure<I> = Readonly<{type: 'failure', reason: string, value: I}>
export type Success<O> = Readonly<{type: 'success', value: O}>
export type Result<O,I=any> = Failure<I> | Success<O>
export type Parser<O,I=any> = (value: I) => Result<O,I>;

export type SuccessType<T> = T extends Result<unknown, infer U> ? Success<U> : never;
export type FailureType<T> = T extends Result<infer U, unknown> ? Failure<U> : never;

export type ResultType<T> = T extends Parser<infer O, infer I> ? Result<O, I> : never;
export type ParserType<T> = T extends Parser<infer U, unknown> ? U : never;

export function optional<O,I=any>(validator: Parser<O,I>): Parser<(null|O),I> {
    return (value) => value === null ? success(null) : validator(value);
}

export function voidable<O,I=any>(validator: Parser<O,I>): Parser<(undefined|O),I> {
    return (value) => value === undefined ? success(undefined) : validator(value);
}

export function isString<I=any>(value: I): Result<string, I> {
    return typeof value === 'string' ? success(value) : failTypeOf(value);
}

export function isNumber<I=any>(value: I): Result<number, I> {
    return typeof(value) === 'number' ? success(value) : failTypeOf(value);
}

export function isUndefined<I=any>(value: I): Result<undefined, I> {
    return value === undefined ? success(undefined) : failTypeOf(value);
}

export function isBoolean<I=any>(value: I): Result<boolean, I> {
    return typeof(value) === 'boolean' ? success(value) : failTypeOf(value);
}

export function isAnyValue<I=any>(value: I): Success<any> {
    return success(value);
}

export function isObject<I=any>(value: I): Result<{[key: string]: any}, I> {
    return typeof(value) === 'object' ? success(value) : failTypeOf(value);
}

export function isArray<O,I=any>(value: I): Result<O[],I> {
    return Array.isArray(value) ? success(value) : failure(value, 'value is not Array.isArray');
}

export function objectOf<T extends {[key: string]: any}, I=any>(validators: {[K in keyof T]: Parser<T[K],I>}): Parser<T,I> {
    return function(value: any) {
        const result = {} as T;
        for (const key in validators) {
            const validated = validators[key](value ? value[key] : undefined);
            if (isFailure(validated)) {
                return keyedFailure(value, key, validated);
            }
            result[key] = validated.value
        }
        return success(result);
    };
}

export function indexedObjectOf<I, T>(parser: Parser<T,any>): Parser<{[key: string]: T},I> {
    return function(value) {
        const result = {} as {[key: string]: T};
        if (value === null || value == undefined) {
            return failure(value, 'value is null or undefined');
        }
        if (typeof value !== 'object') {
            return failTypeOf(value);
        }
        for (const key in value) {
            const child = parser(value[key]);
            if (isFailure(child)) {
                return keyedFailure(value, key, child);
            }
            result[key] = child.value;
        }
        return success(result);
    }
}

export function mapParser<A, B, I=any>(validator: Parser<A,I>, next: (value: A) => Result<B,I>): Parser<B,I> {
    return (value) => mapFailure(
        mapSuccess(validator(value), next),
        failure => ({...failure, value}),
    );
}

export function mapFailure<A, B, I=any>(result: Result<A,I>, next: (failure: Failure<I>) => B): (B | Success<A>) {
    return isFailure(result) ? next(result) : result;
}

export function mapSuccess<A, B, I=any>(result: Result<A,I>, next: (value: A) => B): (B | Failure<I>) {
    return isSuccess(result) ? next(result.value) : result;
}

export function mapResult<A, B, C, I=any>(result: Result<A,I>, success:(value: A) => B, failure:(failure: Failure<I>) => C): (B|C) {
    return isSuccess(result) ? success(result.value) : failure(result);
}

export function arrayOf<O, I=any>(validator: Parser<O,I>): Parser<O[],I> {
    return mapParser(isArray, (value: any[]) =>
        value.reduce<Result<O[],I>>(
            (result, member, index) => mapSuccess(
                result,
                items => mapResult(
                    validator(member),
                    valid => success(items.concat([valid])),
                    failure => keyedFailure(value, index, failure)
                )
            ),
            success([])
        )
    )
}

export function oneOf<O, I, V extends Array<Parser<any, any>>>(parser: Parser<O,I>, ...parsers: V): Parser<(ParserType<V[number]>|O), I> {
    if (parsers.length === 0) {
        return parser;
    }
    return value => mapFailure(
        parsers.reduce(
            (result, validator) => mapFailure(result, () => validator(value)),
            parser(value)
        ),
        () => failure(value, `'${value}' did not match any of ${parsers.length+1} validators`)
    );
}

export function isExactly<S extends (string|number|boolean), I=any>(option: S): Parser<S, I> {
    return (value: any) => value === option ? success(option) : failure(value, `is not ${option}`);
}

export function success<T>(value: T): Success<T> {
    return {
        value,
        type: 'success'
    }
}

export function failure<T>(value: T, reason: string): Failure<T> {
    return {
        type: 'failure',
        value,
        reason,
    }
}

function failTypeOf<T>(value: T): Failure<T> {
    return failure(value, 'typeof value is ' + ( value === null ? 'null' : typeof value));
}

function keyedFailure<T>(value: any, key: string | number, failure: Failure<T>): Failure<T> {
    return {
        ...failure,
        value,
        reason: `Failed at '${key}': ${failure.reason}`,
    }
}

export function isSuccess<O,I=any>(result: Result<O,I>): result is Success<O> {
    return result.type === 'success';
}

export function isFailure<O,I=any>(result: Result<O,I>): result is Failure<I> {
    return result.type === 'failure';
}
