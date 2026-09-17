import { Navigate } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader';
import SectionCard from '../components/common/SectionCard';
import StatCard from '../components/common/StatCard';
import { getRouteByKey } from '../data/appData';

function PlaceholderPage({ routeKey }) {
  const route = getRouteByKey(routeKey);

  if (!route) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={route.eyebrow}
        title={route.title}
        description={route.description}
        actions={route.actions}
      />

      {route.stats?.length ? (
        <section className="stats-grid" aria-label={`${route.title} metrics`}>
          {route.stats.map((stat) => (
            <StatCard
              key={`${route.key}-${stat.label}`}
              label={stat.label}
              value={stat.value}
              helper={stat.helper}
            />
          ))}
        </section>
      ) : null}

      <section className="content-grid">
        <article className="feature-panel">
          <div className="feature-panel__header">
            <p className="page-header__eyebrow">Module focus</p>
            <h2>Prepared component areas</h2>
          </div>
          <ul className="feature-list">
            {route.highlights?.map((highlight) => (
              <li key={`${route.key}-${highlight}`}>{highlight}</li>
            ))}
          </ul>
        </article>

        <div className="cards-grid">
          {route.cards?.map((card) => (
            <SectionCard
              key={`${route.key}-${card.title}`}
              title={card.title}
              body={card.body}
              footer={card.footer}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

export default PlaceholderPage;
