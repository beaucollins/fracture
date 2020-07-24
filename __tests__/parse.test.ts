import {
    Parser,
    Result,
    isBoolean,
    isNumber,
    isString,
    isUndefined,
    isExactly,
    failure,
    success,
    arrayOf,
    objectOf,
    optional,
    oneOf,
    indexedObjectOf,
} from '../src/parse';

describe('fractal/parse', () => {

    type Validator<T> = Parser<T>;

    describe('isString', () => {
        it('succeeds', () => {
            const validator: Validator<string> = isString;
            const value: Result<string> = validator( 'yes' );
            expect(value).toEqual(success('yes'));
        } )

        it('fails', () => {
            const validator: Validator<string> = isString;
            const value = validator( 1 );
            expect(value).toEqual(failure(1, 'typeof value is number'));
        });
    });

    describe('arrayOf', () => {
        it('succeeds', () => {
            const value = arrayOf(isNumber)([1, 2, 3]);
            expect(value).toEqual(success([1, 2, 3]));
        });

        it('fails', () => {
            const value = arrayOf(isNumber)([1, '2', 3]);
            expect(value).toEqual(failure([1, '2', 3], 'Failed at \'1\': typeof value is string'));
        });
    })

    describe('optional', () => {
        it('succeeds', () => {
            const validator = arrayOf(optional(isNumber));
            const result = validator([1, null, 3]);
            expect(result).toEqual(success([1, null, 3]));
        });

        it('fails', () => {
            const validator = arrayOf(optional(isNumber));
            const result = validator([1, false, 3]);
            expect(result).toEqual(failure([1, false, 3], 'Failed at \'1\': typeof value is boolean'));
        });
    });

    describe('objectOf', () => {
        it('succeeds', () => {
            type Record = {
                artist: string,
                yearReleased: number,
                name: string,
            };

            const validator = objectOf<Record>({
                artist: isString,
                yearReleased: isNumber,
                name: isString,
            });

            const record = {
                artist: 'The Beatles',
                name: 'Revolver',
                yearReleased: 1966,
            };
            const result = validator(record);

            expect(result).toEqual(success(record));
        })

        it('fails', () => {
            type Thing = {name: string};
            const validator = objectOf<Thing>({'name': isString});
            const result = validator({'some-key': 1});

            expect(result).toEqual(failure({'some-key': 1}, 'Failed at \'name\': typeof value is undefined'));
        });

        it('allows undefined keys', () => {
            const validator = objectOf({
                name: isString,
                age: oneOf(isUndefined, isString)
            });
            expect(validator({})).toEqual(failure({}, 'Failed at \'name\': typeof value is undefined'));
            expect(validator({name: 'Hello', age: 10})).toEqual(failure({name: 'Hello', age: 10}, 'Failed at \'age\': \'10\' did not match any of 2 validators'))
            expect(validator({name: 'Hello'})).toEqual(success({name: 'Hello'}))
        })

        it('nests', () => {
            const validate = objectOf({
                name: isString,
                child: objectOf({
                   id: isNumber
                }),
            });

            const valid = {
                name: 'Valid',
                child: { id: 1 },
            };

            const invalid = {
                name: 'Invalid',
                child: { id: 'not-number' },
            };

            expect(validate(valid)).toEqual(success(valid));
            expect(validate(invalid)).toEqual(failure(invalid, 'Failed at \'child\': Failed at \'id\': typeof value is string' ));
        })
    })

    describe('indexedObjectOf', () => {
        const parse = indexedObjectOf(oneOf(isExactly('one'), isExactly(1)));

        it('succeeds', () => {
            const value = {a: 'one', b: 1};
            expect(parse(value)).toEqual(success(value));
        });
    })

    describe('oneOf', () => {
        it('validates multiple validators', () => {
            const year = oneOf(isNumber, isString, isBoolean);

            expect(year(2015)).toEqual(success(2015));
            expect(year('2015')).toEqual(success('2015'));
            expect(year(true)).toEqual(success(true));

            expect(year(null)).toEqual(failure(null, '\'null\' did not match any of 3 validators'));
        })
    });

    describe('arrayOf oneOf', () => {
        const validator = arrayOf(oneOf(isNumber, isBoolean));

        it('succeeds', () => {
            expect(validator([])).toEqual(success([]));
            expect(validator([1, 2, true, false])).toEqual(success([1, 2, true, false]));
            expect(validator([null, true])).toEqual(failure([null, true], 'Failed at \'0\': \'null\' did not match any of 2 validators'));
        })
    });

    describe('oneOf var', () => {
        const validator = oneOf(
            isNumber,
            isBoolean,
            isString,
            objectOf({
                name: isString,
            })
        );
        it('succeeds', () => {
            expect(validator(1)).toEqual(success(1));
            expect(validator('a')).toEqual(success('a'));
        })
    })
});
