import type { Role } from '../../src';

export const DEMO_PASSWORD = 'DemoPass123!';

/** How often a customer visits, and for how long they kept coming. */
export type VisitPattern = 'daily' | 'weekly' | 'monthly' | 'lapsed';

export interface DemoTenant {
  name: string;
  slug: string;
  plan: 'FREE' | 'PRO';
  currency: string;
  pointsPerCurrencyUnit: string;
  pointsExpiryMonths: number | null;
  users: Array<{ email: string; name: string; role: Role }>;
  rewards: Array<{ name: string; description: string; pointsCost: number; stock?: number }>;
  customerCount: number;
  /** Typical basket, in pounds. */
  basket: { min: number; max: number };
  /** Days between visits for each pattern. */
  visitGapDays: Record<VisitPattern, [number, number]>;
  tags: string[];
  /** A portal login with history, for the customer side of the demo. */
  portalCustomer?: { email: string; name: string };
}

export const TIERS = [
  { name: 'Bronze', minLifetimePoints: 0, multiplier: '1.00', sortOrder: 1 },
  { name: 'Silver', minLifetimePoints: 500, multiplier: '1.25', sortOrder: 2 },
  { name: 'Gold', minLifetimePoints: 1500, multiplier: '1.50', sortOrder: 3 },
];

export const HISTORY_DAYS = 182;

export const TENANTS: DemoTenant[] = [
  {
    name: 'Bean & Brew Café',
    slug: 'bean-and-brew',
    plan: 'PRO',
    currency: 'GBP',
    pointsPerCurrencyUnit: '10',
    pointsExpiryMonths: 12,
    users: [
      { email: 'owner@beanbrew.demo', name: 'Olivia Bennett', role: 'OWNER' },
      { email: 'staff@beanbrew.demo', name: 'Sam Patel', role: 'STAFF' },
    ],
    rewards: [
      { name: 'Free espresso', description: 'Any single or double espresso.', pointsCost: 150 },
      {
        name: 'Pastry of your choice',
        description: 'From the counter, while stocks last.',
        pointsCost: 200,
      },
      { name: 'Free cappuccino', description: 'Any size, any milk.', pointsCost: 250 },
      {
        name: '10% off a bag of beans',
        description: 'Applies to any retail coffee bag.',
        pointsCost: 300,
      },
      {
        name: 'Lunch combo',
        description: 'Sandwich, soup or salad with a regular drink.',
        pointsCost: 600,
      },
      {
        name: 'Bag of house beans',
        description: '250 g of our house blend, whole or ground.',
        pointsCost: 800,
      },
      {
        name: 'Branded keep-cup',
        description: 'Reusable 12 oz cup.',
        pointsCost: 1000,
        stock: 25,
      },
      {
        name: 'Home-brew masterclass',
        description: 'A one-hour session with our head barista.',
        pointsCost: 1500,
        stock: 10,
      },
    ],
    customerCount: 300,
    basket: { min: 2.8, max: 14.5 },
    visitGapDays: { daily: [1, 3], weekly: [5, 9], monthly: [20, 40], lapsed: [6, 14] },
    tags: ['student', 'remote-worker', 'vip', 'oat-milk'],
    portalCustomer: { email: 'customer@beanbrew.demo', name: 'Chloe Martin' },
  },
  {
    name: 'Studio Bloom Salon',
    slug: 'studio-bloom',
    plan: 'FREE',
    currency: 'GBP',
    pointsPerCurrencyUnit: '1',
    pointsExpiryMonths: null,
    users: [{ email: 'owner@studiobloom.demo', name: 'Maya Okafor', role: 'OWNER' }],
    rewards: [
      { name: 'Free fringe trim', description: 'Between full appointments.', pointsCost: 100 },
      { name: 'Deep-conditioning treatment', description: 'Added to any cut.', pointsCost: 250 },
      { name: '£15 off colour', description: 'Any colour service.', pointsCost: 400 },
    ],
    customerCount: 40,
    basket: { min: 25, max: 95 },
    visitGapDays: { daily: [21, 35], weekly: [28, 42], monthly: [42, 70], lapsed: [35, 50] },
    tags: ['colour', 'bridal'],
  },
];

export const FIRST_NAMES = [
  'Amelia',
  'Ben',
  'Chloe',
  'Daniel',
  'Ella',
  'Finn',
  'Grace',
  'Harry',
  'Isla',
  'Jack',
  'Keira',
  'Leo',
  'Maya',
  'Noah',
  'Olivia',
  'Priya',
  'Quinn',
  'Ruby',
  'Samir',
  'Tara',
  'Usman',
  'Violet',
  'Will',
  'Xin',
  'Yusuf',
  'Zara',
  'Aisha',
  'Callum',
  'Dev',
  'Freya',
];

export const LAST_NAMES = [
  'Adams',
  'Brown',
  'Chen',
  'Davies',
  'Evans',
  'Fernandes',
  'Green',
  'Hughes',
  'Iqbal',
  'Jones',
  'Khan',
  'Lewis',
  'Murphy',
  'Nowak',
  "O'Brien",
  'Patel',
  'Roberts',
  'Singh',
  'Taylor',
  'Walker',
  'Wright',
  'Young',
  'Zhang',
  'Okafor',
  'Kowalski',
  'Ahmed',
];
