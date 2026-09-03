import type { Metadata } from 'next'
import '@fontsource/outfit/400.css'
import '@fontsource/outfit/500.css'
import '@fontsource/outfit/600.css'
import '@fontsource/outfit/700.css'
import '@fontsource/ibm-plex-mono/500.css'
import '../src/styles.css'

export const metadata: Metadata = {
  title: 'MythWeaver | Draw a world together',
  description:
    'A consent-based story canvas where people and browser agents turn rough marks into a shared story world.',
  openGraph: {
    title: 'MythWeaver | Draw a world together',
    description: 'Draw first. Let your browser agent propose what the story becomes.',
    images: ['/mythweaver-og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MythWeaver | Draw a world together',
    description: 'A shared story canvas where the agent proposes and you decide.',
    images: ['/mythweaver-og.png'],
  },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
