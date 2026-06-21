import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Platform Console — DataSentinel",
  robots: { index: false, follow: false },
};

/**
 * Root layout for the platform super-admin console. The `admin-theme` class
 * re-maps the brand accent to violet for the entire subtree, giving the elevated
 * console a clear visual identity while keeping the same fonts and surfaces.
 */
export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="admin-theme min-h-screen bg-bg text-foreground">{children}</div>;
}
