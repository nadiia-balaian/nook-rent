const foundations = [
  '3–90-night stays',
  'Human-backed Agent authorization',
  'Atomic reservation holds',
  'Real Hedera Testnet escrow',
];

export function App() {
  return (
    <main className="shell">
      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">Nook.rent</p>
        <h1 id="page-title">Trusted temporary stays, coordinated by human-backed agents.</h1>
        <p className="summary">
          The project foundation is ready. Marketplace implementation begins with deterministic
          dates, quotes, approval, and booking state.
        </p>
        <ul>
          {foundations.map((foundation) => (
            <li key={foundation}>{foundation}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
