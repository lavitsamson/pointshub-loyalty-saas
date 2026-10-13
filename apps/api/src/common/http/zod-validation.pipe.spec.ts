import { z } from 'zod';
import { ProblemException } from './problem.exception';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(
    z.object({
      email: z.email(),
      amount: z.coerce.number().positive(),
      address: z.object({ city: z.string().min(1) }).optional(),
    }),
  );

  it('returns the parsed value', () => {
    expect(pipe.transform({ email: 'a@b.co', amount: '12.5' })).toEqual({
      email: 'a@b.co',
      amount: 12.5,
    });
  });

  it('throws a 400 problem listing each invalid field by path', () => {
    let thrown: unknown;
    try {
      pipe.transform({ email: 'nope', amount: -1, address: { city: '' } });
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(ProblemException);
    const { problem } = thrown as ProblemException;
    expect(problem.status).toBe(400);
    expect(problem.errors?.map((e) => e.path)).toEqual(['email', 'amount', 'address.city']);
  });
});
