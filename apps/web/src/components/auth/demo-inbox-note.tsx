/**
 * Set at build time on the public demo, where outgoing email is captured by Mailpit instead of
 * being delivered, so visitors can still follow sign-up and reset links.
 */
const DEMO_INBOX_URL = process.env.NEXT_PUBLIC_DEMO_INBOX_URL;

export function DemoInboxNote() {
  if (!DEMO_INBOX_URL) return null;
  return (
    <p className="mt-3 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
      This demo does not deliver email. Open the{' '}
      <a
        href={DEMO_INBOX_URL}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-primary hover:underline"
      >
        demo inbox
      </a>{' '}
      to find the message. Anyone can read it, so use a made-up address.
    </p>
  );
}
