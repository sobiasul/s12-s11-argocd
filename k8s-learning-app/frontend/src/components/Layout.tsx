import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";

const NAV = [
  { to: "/", label: "Dashboard", icon: "◈", end: true },
  { to: "/objects", label: "Objects", icon: "⬢" },
  { to: "/commands", label: "kubectl", icon: "❯" },
  { to: "/search", label: "Search", icon: "⌕" },
];

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [theme, setTheme] = useState<"light" | "dark">(
    () => (localStorage.getItem("theme") as "light" | "dark") ?? "light",
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const initials = (user?.display_name ?? "?")
    .split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="mark" aria-hidden>☸</div>
          <div>
            <b>Kubernetes Study</b>
            <span>objects &amp; commands</span>
          </div>
        </div>

        <nav className="nav">
          <div className="nav-label">Learn</div>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
                     className={({ isActive }) => (isActive ? "active" : "")}>
              <span className="ico" aria-hidden>{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          <button className="btn btn-sm" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
            {theme === "light" ? "◐ Dark" : "◑ Light"}
          </button>
          <div className="userbox">
            <div className="avatar" aria-hidden>{initials}</div>
            <div className="who">
              <b>{user?.display_name}</b>
              <span>{user?.email}</span>
            </div>
          </div>
          <button className="btn btn-sm" onClick={async () => { await logout(); navigate("/login"); }}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="main">
        <div className="container"><Outlet /></div>
      </main>
    </div>
  );
}
