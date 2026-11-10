import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Smart City Digital Twin — Jakarta',
  description:
    'Interactive 3D digital twin of Jakarta combining OpenStreetMap geometry with live weather and air-quality data from open public APIs.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // The dashboard is a fixed-height application shell, so the browser chrome
  // colour is matched to the app background to avoid a seam on mobile.
  themeColor: '#060910',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      // `dark` is the server-rendered default; ThemeToggle applies a stored
      // preference after mount, which keeps hydration consistent.
      data-theme="dark"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
