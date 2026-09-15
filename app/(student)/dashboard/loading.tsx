export default function DashboardLoading() {
  return (
    <div className="student-dashboard dashboard-a1 dashboard-a1-loading" aria-label="Loading your dashboard" aria-busy="true">
      <header className="dashboard-a1-header">
        <div><div className="dashboard-skeleton dashboard-skeleton--subtitle" /><div className="dashboard-skeleton dashboard-skeleton--title" /></div>
        <div className="dashboard-skeleton dashboard-skeleton--subtitle" />
      </header>
      <div className="dashboard-a1-grid" aria-hidden="true">
        <section className="dashboard-a1-focus dashboard-skeleton-card" />
        <section className="dashboard-a1-exam dashboard-skeleton-card" />
        <div className="dashboard-a1-pulse dashboard-skeleton-card" />
        <section className="dashboard-a1-continue dashboard-skeleton-card" />
        <section className="dashboard-a1-leaderboard dashboard-skeleton-card" />
        <section className="dashboard-a1-update dashboard-skeleton-card" />
        <section className="dashboard-a1-actions dashboard-skeleton-card" />
      </div>
    </div>
  );
}
