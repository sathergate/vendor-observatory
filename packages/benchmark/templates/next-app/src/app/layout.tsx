export const metadata = {
  title: "Benchmark App",
  description: "A benchmark Next.js application",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
