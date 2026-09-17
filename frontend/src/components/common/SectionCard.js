function SectionCard({ title, children, body, footer, action }) {
  return (
    <article className="section-card">
      {title ? (
        <div className="section-card__header">
          <h3 className="section-card__title">{title}</h3>
          {action && <div>{action}</div>}
        </div>
      ) : null}
      {children || (body ? <p>{body}</p> : null)}
      {footer ? <span className="section-card__footer">{footer}</span> : null}
    </article>
  );
}

export default SectionCard;
