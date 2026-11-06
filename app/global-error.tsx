"use client";

// Replaces the root layout when it fails, so it has its own document and inline styles (no global CSS).
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#f6f7f9", color: "#14213d", fontFamily: "system-ui, sans-serif", padding: 16 }}>
        <title>Sakani</title>
        <main style={{ maxWidth: 420, padding: 28, borderRadius: 20, background: "#fff", boxShadow: "0 20px 50px rgb(20 33 61 / 10%)", textAlign: "center" }}>
          <h1 style={{ margin: "0 0 8px", fontSize: 22 }}>حصلت مشكلة</h1>
          <p style={{ margin: "0 0 4px", color: "#46546b" }}>سكني مش عارف يفتح دلوقتي. جرّب تاني كمان شوية.</p>
          <p dir="ltr" style={{ margin: "0 0 20px", color: "#46546b" }}>Something went wrong. Please try again in a moment.</p>
          <button type="button" onClick={() => retry()} style={{ minHeight: 46, padding: "0 22px", border: 0, borderRadius: 12, background: "#14213d", color: "#fff", font: "inherit", fontWeight: 700, cursor: "pointer" }}>
            جرّب تاني · Try again
          </button>
        </main>
      </body>
    </html>
  );
}
