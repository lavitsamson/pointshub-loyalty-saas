import type { MailMessage } from '../../mail/mail-transport';

export interface Recipient {
  email: string;
  name: string;
  businessName: string;
  /** The customer portal, where they can check points and redeem. */
  portalUrl: string;
}

const greeting = (r: Recipient) => `Hi ${r.name.split(' ')[0] ?? r.name},`;
const footer = (r: Recipient) => [
  '',
  `See your points and rewards: ${r.portalUrl}`,
  '',
  `You are receiving this because you are a member of the ${r.businessName} loyalty programme.`,
];

export function tierChangedEmail(r: Recipient, tierName: string): MailMessage {
  return {
    to: r.email,
    subject: `You've reached ${tierName} at ${r.businessName}`,
    text: [
      greeting(r),
      '',
      `Your visits to ${r.businessName} have taken you to ${tierName}. From now on you earn`,
      'points faster on every purchase. Thank you for being a regular!',
      ...footer(r),
    ].join('\n'),
  };
}

export function redemptionFulfilledEmail(r: Recipient, rewardName: string): MailMessage {
  return {
    to: r.email,
    subject: `Enjoy your ${rewardName}`,
    text: [
      greeting(r),
      '',
      `Your ${rewardName} from ${r.businessName} has been handed over. Enjoy it, and thanks`,
      'for collecting points with us.',
      ...footer(r),
    ].join('\n'),
  };
}

export function pointsExpiringEmail(r: Recipient, points: number, expiresOn: string): MailMessage {
  const date = new Date(`${expiresOn}T00:00:00.000Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const count = points === 1 ? '1 point' : `${points.toLocaleString('en-GB')} points`;
  const verb = points === 1 ? 'expires' : 'expire';
  return {
    to: r.email,
    subject: `${count} ${verb} on ${date}`,
    text: [
      greeting(r),
      '',
      `${count} in your ${r.businessName} account ${verb} on ${date}.`,
      'Spend them on a reward before then so they do not go to waste.',
      ...footer(r),
    ].join('\n'),
  };
}
