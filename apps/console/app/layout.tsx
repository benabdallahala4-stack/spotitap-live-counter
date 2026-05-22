import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Spotitap Prototype Console',
  description: 'Prototype hardware testing console for Spotitap live counters'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
