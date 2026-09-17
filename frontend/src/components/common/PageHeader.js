import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';

function PageHeader({ eyebrow, title, subtitle, description, actions = [], children }) {
  return (
    <section className="page-header page-header--accent">
      {eyebrow ? <p className="page-header__eyebrow"><Sparkles size={14} /> {eyebrow}</p> : null}
      <div className="page-header__content">
        <div>
          <h1>{title}</h1>
          {(subtitle || description) ? <p>{subtitle || description}</p> : null}
        </div>
        {(children || actions.length > 0) && (
          <div className="page-header__actions">
            {children}
            {actions.map((action) => (
              <Link key={action.to} className="button button--primary" to={action.to}>
                {action.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default PageHeader;
