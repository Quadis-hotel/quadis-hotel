import { types as pgTypes } from 'pg'
import '../src/db'

/**
 * Guards the bug that took the whole site down.
 *
 * node-postgres returns NUMERIC as a string, because the type is
 * arbitrary-precision. Every price, rate and rating in this schema is NUMERIC,
 * so connecting a real database made the API serve `"1500.00"` and `"4.60"`.
 * The frontend called `rating.toFixed(1)`, that threw, React unmounted, and
 * every page rendered blank.
 *
 * The quieter half was worse: `hotel.price + roomOffset` concatenated instead
 * of adding, so a 1,500 room with a 1,000 upgrade would have quoted "15001000"
 * rather than crashing.
 *
 * Nothing caught it. The in-memory store holds real numbers, so development and
 * the entire suite passed while production was broken — which is exactly why
 * this test asserts on the parser registration rather than on query results.
 * It has to fail without a database, since that is the situation it exists for.
 */
describe('Postgres numeric type parsing', () => {
  // 1700 = NUMERIC, 20 = INT8/BIGINT. Both are stringified by default.
  const NUMERIC_OID = 1700
  const INT8_OID = 20

  it('parses NUMERIC into a number, not a string', () => {
    const parse = pgTypes.getTypeParser(NUMERIC_OID) as (v: string) => unknown
    const value = parse('1500.00')
    expect(typeof value).toBe('number')
    expect(value).toBe(1500)
  })

  it('keeps the decimal part of a rating', () => {
    const parse = pgTypes.getTypeParser(NUMERIC_OID) as (v: string) => unknown
    expect(parse('4.60')).toBe(4.6)
  })

  it('parses INT8 into a number', () => {
    const parse = pgTypes.getTypeParser(INT8_OID) as (v: string) => unknown
    expect(parse('42')).toBe(42)
  })

  it('supports the two operations that actually broke', () => {
    const parse = pgTypes.getTypeParser(NUMERIC_OID) as (v: string) => number
    const price = parse('1500.00')
    const rating = parse('4.60')

    // Addition must add, not concatenate — a wrong price is worse than a crash
    // because nothing surfaces it.
    expect(price + 1000).toBe(2500)
    // toFixed only exists on a number; this threw and blanked every page.
    expect(rating.toFixed(1)).toBe('4.6')
  })
})
