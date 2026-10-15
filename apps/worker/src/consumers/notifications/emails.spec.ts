import { pointsExpiringEmail, redemptionFulfilledEmail, tierChangedEmail } from './emails';

const recipient = {
  email: 'amira.khan@example.com',
  name: 'Amira Khan',
  businessName: 'Bean & Brew Café',
  portalUrl: 'http://localhost:3000/c/bean-brew',
};

describe('customer emails', () => {
  it('announces a new tier', () => {
    const email = tierChangedEmail(recipient, 'Gold');
    expect(email.to).toBe('amira.khan@example.com');
    expect(email.subject).toBe("You've reached Gold at Bean & Brew Café");
    expect(email.text).toMatch(/^Hi Amira,/);
    expect(email.text).toContain('http://localhost:3000/c/bean-brew');
  });

  it('confirms a fulfilled redemption', () => {
    const email = redemptionFulfilledEmail(recipient, 'Free flat white');
    expect(email.subject).toBe('Enjoy your Free flat white');
    expect(email.text).toContain('Your Free flat white from Bean & Brew Café');
  });

  it('warns about expiring points with a readable date', () => {
    const email = pointsExpiringEmail(recipient, 1250, '2026-10-22');
    expect(email.subject).toBe('1,250 points expire on 22 October 2026');
    expect(email.text).toContain('in your Bean & Brew Café account');
  });

  it('uses the singular for a single point', () => {
    expect(pointsExpiringEmail(recipient, 1, '2026-10-22').subject).toBe(
      '1 point expires on 22 October 2026',
    );
  });
});
