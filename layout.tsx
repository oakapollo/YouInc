export const metadata = {
    title: "YouInc",
    description: "You are the stock."
  };
  
  export default function RootLayout({
    children
  }: {
    children: React.ReactNode;
  }) {
    return (
      <html lang="en">
        <body>{children}</body>
      </html>
    );
  }