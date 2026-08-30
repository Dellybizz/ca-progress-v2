export default function DashboardLoading() {
  return (
    <div className="student-dashboard student-dashboard--loading" aria-label="Loading your dashboard" aria-busy="true">
      <div className="dashboard-skeleton dashboard-skeleton--title" />
      <div className="dashboard-skeleton dashboard-skeleton--subtitle" />
      <section className="smart-dashboard-hero dashboard-skeleton-card">
        <div className="dashboard-skeleton dashboard-skeleton--badge" />
        <div className="dashboard-skeleton dashboard-skeleton--hero-number" />
        <div className="dashboard-skeleton dashboard-skeleton--hero-copy" />
      </section>
      <section className="smart-dashboard-grid smart-dashboard-grid--top">
        <div className="dashboard-skeleton-card dashboard-skeleton-card--medium" />
        <div className="dashboard-skeleton-card dashboard-skeleton-card--medium" />
      </section>
      <section className="smart-dashboard-grid smart-dashboard-grid--main">
        <div className="dashboard-skeleton-card dashboard-skeleton-card--large" />
        <div className="dashboard-skeleton-card dashboard-skeleton-card--large" />
      </section>
    </div>
  );
}
