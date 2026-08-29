export function StateCard({
  title,
  tone = "default",
  children,
}: {
  title: string;
  tone?: "default" | "danger" | "permission";
  children: React.ReactNode;
}) {
  return (
    <section className="state-card" data-tone={tone}>
      <h2>{title}</h2>
      <p>{children}</p>
    </section>
  );
}
