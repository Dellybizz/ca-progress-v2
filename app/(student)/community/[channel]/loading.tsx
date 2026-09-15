export default function Loading() {
  return <div className="phase10-channel-page" aria-busy="true">
    <div className="phase10-split-chat">
      <aside className="phase10-chat-sidebar">
        <div className="phase10-chat-sidebar-head"><span className="phase10-back">‹ Community</span><strong>Channels</strong></div>
        <div className="phase10-channel-list"><div className="phase10-skeleton phase10-skeleton--nav" /><div className="phase10-skeleton phase10-skeleton--nav" /><div className="phase10-skeleton phase10-skeleton--nav" /></div>
      </aside>
      <section className="phase10-chat-panel" aria-label="Loading messages">
        <header className="phase10-chat-header">
          <div><span className="phase10-channel-icon phase10-skeleton phase10-skeleton--icon" /><div><h1>Loading channel…</h1><p>Messages will appear shortly.</p></div></div>
          <div className="phase10-chat-search phase10-skeleton phase10-skeleton--search" />
        </header>
        <div className="phase10-message-scroll"><div className="phase10-messages">
          <article className="phase10-message"><div className="phase10-avatar phase10-skeleton" /><div className="phase10-message-body"><div className="phase10-skeleton phase10-skeleton--meta" /><div className="phase10-skeleton phase10-skeleton--line" /><div className="phase10-skeleton phase10-skeleton--line phase10-skeleton--short" /></div></article>
          <article className="phase10-message is-own"><div className="phase10-avatar phase10-skeleton" /><div className="phase10-message-body"><div className="phase10-skeleton phase10-skeleton--meta" /><div className="phase10-skeleton phase10-skeleton--line" /></div></article>
          <article className="phase10-message"><div className="phase10-avatar phase10-skeleton" /><div className="phase10-message-body"><div className="phase10-skeleton phase10-skeleton--meta" /><div className="phase10-skeleton phase10-skeleton--line phase10-skeleton--short" /></div></article>
        </div></div>
        <div className="phase10-composer phase10-skeleton-composer" />
      </section>
    </div>
  </div>;
}
