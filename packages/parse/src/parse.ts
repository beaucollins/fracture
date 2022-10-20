/**
 *
 */
export type Failure<I> = Readonly<{
  type: "failure";
  reason: string;
  value: I;
}>;
export type Success<O> = Readonly<{ type: "success"; value: O }>;
export type Result<O, I = unknown> = Failure<I> | Success<O>;
export type Parser<O, I = unknown> = (value: I) => Result<O, I>;

export type SuccessType<T> = T extends Result<unknown, infer U>
  ? Success<U>
  : never;
export type FailureType<T> = T extends Result<infer U, unknown>
  ? Failure<U>
  : never;

export type ResultType<T> = T extends Parser<infer O, infer I>
  ? Result<O, I>
  : never;
export type ParserType<T> = T extends Parser<infer U, unknown> ? U : never;

export function optional<O, I = unknown>(
  validator: Parser<O, I>
): Parser<null | O, I> {
  return (value) => (value === null ? success(null) : validator(value));
}

export function voidable<O, I = unknown>(
  validator: Parser<O, I>
): Parser<undefined | O, I> {
  return (value) =>
    value === undefined ? success(undefined) : validator(value);
}

export function isString<I = unknown>(value: I): Result<string, I> {
  return typeof value === "string" ? success(value) : failTypeOf(value);
}

export function isNumber<I = unknown>(value: I): Result<number, I> {
  return typeof value === "number" ? success(value) : failTypeOf(value);
}

export function isUndefined<I = unknown>(value: I): Result<undefined, I> {
  return value === undefined ? success(undefined) : failTypeOf(value);
}

export function isBoolean<I = unknown>(value: I): Result<boolean, I> {
  return typeof value === "boolean" ? success(value) : failTypeOf(value);
}

// allowing any here
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isAnyValue<I = unknown>(value: I): Success<any> {
  return success(value);
}

export function isObject<I = unknown>(
  value: I
): Result<Record<string, unknown>, I> {
  return typeof value === "object" && value != null
    ? success(value as Record<string, unknown>)
    : failTypeOf(value);
}

export function isArray<I = unknown>(value: I): Result<unknown[], I> {
  return Array.isArray(value)
    ? success(value as unknown[])
    : failure(value, "value is not Array.isArray");
}

export function objectOf<
  T extends { [key: string]: unknown },
  I = unknown
>(validators: { [K in keyof T]: Parser<T[K], I> }): Parser<T, I> {
  return function (value: I) {
    const result = {} as T;
    if (!isObject(value)) {
      return failure<I>(value, "Not an object");
    }
    const obj = value as Record<string, unknown>;
    for (const key in validators) {
      const validated = validators[key]((obj ? obj[key] : undefined) as I);
      if (isFailure(validated)) {
        return keyedFailure(value, key, validated);
      }
      result[key] = validated.value;
    }
    return success(result);
  };
}

export function indexedObjectOf<T, I>(
  parser: Parser<T, unknown>
): Parser<{ [key: string]: T }, I> {
  return function (value): Result<{ [key: string]: T }, I> {
    const result = {} as { [key: string]: T };
    if (value === null || value == undefined) {
      return failure(value, "value is null or undefined");
    }
    if (typeof value !== "object") {
      return failTypeOf(value);
    }
    for (const key in value) {
      const child = parser(value[key]);
      if (isFailure(child)) {
        return keyedFailure<I>(value, key, child as Failure<I>);
      }
      result[key] = child.value;
    }
    return success(result as { [key: string]: T });
  };
}

export function mapParser<A, B, I = unknown>(
  validator: Parser<A, I>,
  next: (value: A) => Result<B, I>
): Parser<B, I> {
  return (value) =>
    mapFailure(mapSuccess(validator(value), next), (failure) => ({
      ...failure,
      value,
    }));
}

export function mapFailure<A, B, I = unknown>(
  result: Result<A, I>,
  next: (failure: Failure<I>) => B
): B | Success<A> {
  return isFailure(result) ? next(result) : result;
}

export function mapSuccess<A, B, I = unknown>(
  result: Result<A, I>,
  next: (value: A) => B
): B | Failure<I> {
  return isSuccess(result) ? next(result.value) : result;
}

export function mapResult<A, B, C, I = unknown>(
  result: Result<A, I>,
  success: (value: A) => B,
  failure: (failure: Failure<I>) => C
): B | C {
  return isSuccess(result) ? success(result.value) : failure(result);
}

export function arrayOf<O, I = any>(validator: Parser<O, I>): Parser<O[], I> {
  return mapParser(isArray, (value: any[]) =>
    value.reduce<Result<O[], I>>(
      (result, member, index) =>
        mapSuccess(result, (items) =>
          mapResult(
            validator(member),
            (valid) => success(items.concat([valid])),
            (failure) => keyedFailure(value, index, failure)
          )
        ),
      success([])
    )
  );
}

export function oneOf<O, I, V extends Array<Parser<any, any>>>(
  parser: Parser<O, I>,
  ...parsers: V
): Parser<ParserType<V[number]> | O, I> {
  if (parsers.length === 0) {
    return parser;
  }
  return (value) =>
    mapFailure(
      parsers.reduce(
        (result, validator) => mapFailure(result, () => validator(value)),
        parser(value)
      ),
      () =>
        failure(
          value,
          `'${value}' did not match any of ${parsers.length + 1} validators`
        )
    );
}

export function isExactly<S extends string | number | boolean, I = unknown>(
  option: S
): Parser<S, I> {
  return (value: any) =>
    value === option ? success(option) : failure(value, `is not ${option}`);
}

export function success<T>(value: T): Success<T> {
  return {
    value,
    type: "success",
  };
}

export function failure<T>(value: T, reason: string): Failure<T> {
  return {
    type: "failure",
    value,
    reason,
  };
}

function failTypeOf<T>(value: T): Failure<T> {
  return failure(
    value,
    "typeof value is " + (value === null ? "null" : typeof value)
  );
}

function keyedFailure<T>(
  value: any,
  key: string | number,
  failure: Failure<T>
): Failure<T> {
  return {
    ...failure,
    value,
    reason: `Failed at '${key}': ${failure.reason}`,
  };
}

export function isSuccess<O, I = unknown>(
  result: Result<O, I>
): result is Success<O> {
  return result.type === "success";
}

export function isFailure<O, I = unknown>(
  result: Result<O, I>
): result is Failure<I> {
  return result.type === "failure";
}
