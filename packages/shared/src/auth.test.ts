import { CompleteRegistrationSchema, LoginSchema, RegisterSchema } from './auth';

const valid = {
  name: 'Ada Lovelace',
  email: '  Ada@Example.COM ',
  businessName: 'Analytical Coffee',
};

describe('RegisterSchema', () => {
  it('normalises email and defaults the currency', () => {
    expect(RegisterSchema.parse(valid)).toMatchObject({
      email: 'ada@example.com',
      currency: 'GBP',
    });
  });

  it('rejects malformed currencies', () => {
    expect(RegisterSchema.safeParse({ ...valid, currency: 'POUND' }).success).toBe(false);
  });
});

describe('CompleteRegistrationSchema', () => {
  it('rejects passwords shorter than 12 characters', () => {
    expect(
      CompleteRegistrationSchema.safeParse({ token: 't', password: 'short-pass' }).success,
    ).toBe(false);
  });
});

describe('LoginSchema', () => {
  it('does not apply the password policy, so older passwords still log in', () => {
    expect(LoginSchema.safeParse({ email: 'a@b.co', password: 'short' }).success).toBe(true);
  });
});
