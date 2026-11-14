import type { Metadata } from 'next';
import { LiveJoinView } from '@/components/live-join-view';

export const metadata: Metadata = {
  title: 'Join live class',
  robots: { index: false, follow: false, nocache: true },
  other: { referrer: 'no-referrer' },
};

export default function LiveJoinPage() {
  return <LiveJoinView />;
}
