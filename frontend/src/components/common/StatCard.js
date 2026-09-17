import { Activity, CalendarDays, ClipboardList, FileText, HeartPulse, Users } from 'lucide-react';

const iconByLabel = {
  appointments: CalendarDays,
  patients: Users,
  reports: FileText,
  records: ClipboardList,
  prescriptions: ClipboardList,
};

function StatCard({ label, value, helper }) {
  const Icon = Object.entries(iconByLabel).find(([key]) => label.toLowerCase().includes(key))?.[1] || HeartPulse;
  return (
    <article className="stat-card">
      <span className="stat-card__icon"><Icon size={20} strokeWidth={2.25} /></span>
      <p className="stat-card__label">{label}</p>
      <strong className="stat-card__value">{value}</strong>
      {helper ? <p className="stat-card__helper">{helper}</p> : <span className="stat-card__trend"><Activity size={14} /> Live overview</span>}
    </article>
  );
}

export default StatCard;
