import { csvRow } from './csv';

describe('csvRow', () => {
  it('joins plain cells with commas and ends with CRLF', () => {
    expect(csvRow(['a', 1, 'b'])).toBe('a,1,b\r\n');
  });

  it('renders null and undefined as empty cells', () => {
    expect(csvRow([null, 'x', undefined])).toBe(',x,\r\n');
  });

  it('quotes cells containing commas, quotes or newlines', () => {
    expect(csvRow(['Smith, Jo', 'say "hi"', 'two\nlines'])).toBe(
      '"Smith, Jo","say ""hi""","two\nlines"\r\n',
    );
  });

  it.each(['=1+1', '+44 20', '-5', '@SUM(A1)', '\tx'])(
    'neutralises a potential formula: %p',
    (value) => {
      expect(csvRow([value]).startsWith(`'`) || csvRow([value]).startsWith(`"'`)).toBe(true);
    },
  );

  it('leaves negative numbers as numbers', () => {
    expect(csvRow([-5])).toBe('-5\r\n');
  });
});
