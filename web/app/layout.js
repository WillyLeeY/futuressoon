import './globals.css';

export const metadata = {
  title: 'FuturesSoon - 台指期每日資料',
  description: '台指期每日 K 線與三大法人期貨買賣超',
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
