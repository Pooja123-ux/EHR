import { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Activity, ChevronRight, LogOut, Menu, X } from 'lucide-react';
import { getNavigationForRole, getRoleFromPath, getRouteByPath } from '../../data/appData';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';

function MainLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const role = getRoleFromPath(location.pathname);
  const navigation = getNavigationForRole(role);
  const currentRoute = getRouteByPath(location.pathname);
  const isPublic = role === 'public';
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (!user) return;
    if (role === 'patient') {
      api.patientNotifications()
        .then(setNotifications)
        .catch(() => {});
      api.patientProfile()
        .then(setProfile)
        .catch(() => {});
    } else if (role === 'doctor') {
      api.doctorNotifications()
        .then(setNotifications)
        .catch(() => {});
      api.doctorProfile()
        .then(setProfile)
        .catch(() => {});
    } else if (role === 'lab') {
      api.labProfile()
        .then(setProfile)
        .catch(() => {});
    }
  }, [role, user]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const closeMenu = () => setMenuOpen(false);

  const unread = notifications.filter((n) => !n.is_read).length;

  const getInitials = () => {
    const name = profile?.full_name || profile?.lab_name || role;
    if (!name) return role.charAt(0).toUpperCase();
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

  const getDisplayName = () => {
    if (profile?.full_name) return profile.full_name;
    if (profile?.lab_name) return profile.lab_name;
    return role.charAt(0).toUpperCase() + role.slice(1);
  };

  /* ── Public pages: show top navbar only ── */
  if (isPublic) {
    return (
      <div className="app-shell app-shell--public">
        <main className="main-content">{children}</main>
      </div>
    );
  }

  /* ── Authenticated pages: sidebar only, no top navbar ── */
  return (
    <div className="app-shell">
      <div className="workspace">
        <button
          type="button"
          className="mobile-menu-button"
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={menuOpen}
          aria-controls="primary-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        {menuOpen && <button type="button" className="sidebar-backdrop" aria-label="Close navigation menu" onClick={closeMenu} />}
        <aside id="primary-navigation" className={`sidebar ${menuOpen ? 'sidebar--open' : ''}`}>
          <NavLink to={`/${role}/dashboard`} className="sidebar__brand-link">
            <span className="sidebar__brand-logo"><Activity size={19} strokeWidth={2.5} /></span>
            <span><strong>Hospital</strong><small>Care Portal</small></span>
          </NavLink>
          {/* Role badge */}
          <div className="sidebar__role-badge">
            <span className="sidebar__role-icon">
              {role === 'patient' ? '🧑‍⚕️' : role === 'doctor' ? '👨‍⚕️' : role === 'lab' ? '🧪' : '🛡️'}
            </span>
            <div>
              <div className="sidebar__role-name">{role.charAt(0).toUpperCase() + role.slice(1)}</div>
              <div className="sidebar__role-sub">{currentRoute ? currentRoute.title : 'Dashboard'}</div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="sidebar__nav" aria-label={`${role} sections`}>
            {navigation.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={closeMenu}
                className={({ isActive }) =>
                  isActive ? 'sidebar__link sidebar__link--active' : 'sidebar__link'
                }
              >
                <span className="sidebar__nav-icon"><ChevronRight size={16} /></span>
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Notifications */}
          <div className="sidebar__notifications">
            <button
              onClick={() => setNotificationsOpen(!notificationsOpen)}
              className="sidebar__notif-btn"
            >
              <span>🔔</span>
              <span>Notifications</span>
              {unread > 0 && <span className="sidebar__notif-badge">{unread}</span>}
            </button>
            {notificationsOpen && (
              <div className="sidebar__notif-dropdown">
                <div className="sidebar__notif-header">Notifications</div>
                <div className="sidebar__notif-list">
                  {notifications.length === 0 ? (
                    <div className="sidebar__notif-empty">No notifications</div>
                  ) : notifications.map((n) => (
                    <div key={n.notification_id} className={`sidebar__notif-item ${!n.is_read ? 'unread' : ''}`}>
                      <div className="sidebar__notif-title">{n.title}</div>
                      <div className="sidebar__notif-msg">{n.message}</div>
                      <div className="sidebar__notif-time">
                        {n.created_at ? new Date(n.created_at).toLocaleString() : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Logout */}
          <div className="sidebar__footer">
          <div className="sidebar__profile-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div className="avatar-circle avatar-circle--sm">{getInitials()}</div>
              <div style={{ minWidth: 0, overflow: 'hidden' }}>
                <div className="sidebar__profile-card__name">{getDisplayName()}</div>
                <div className="sidebar__profile-card__role">{role} Account</div>
              </div>
            </div>
          </div>
            <button onClick={handleLogout} className="sidebar__logout-btn">
              <LogOut size={17} />
              🚪 Logout
            </button>
          </div>
        </aside>

        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}

export default MainLayout;
