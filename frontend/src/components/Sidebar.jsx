import { NavLink } from "react-router-dom";

function Sidebar() {

  const links = [
    {
      path: "/",
      label: "Dashboard"
    },
    {
      path: "/courses",
      label: "Courses"
    },
    {
      path: "/study-timer",
      label: "Study Timer"
    },
    {
      path: "/progress",
      label: "Progress"
    },
    {
      path: "/settings",
      label: "Settings"
    }
  ];

  return (
    <aside className="sidebar">

      <div className="sidebar-logo">
        <h1>Cogniv</h1>
        <span>Learning OS</span>
      </div>

      <nav>

        {links.map((link) => (

          <NavLink
            key={link.path}
            to={link.path}
            className={({ isActive }) =>
              isActive
                ? "nav-link active"
                : "nav-link"
            }
          >
            {link.label}
          </NavLink>

        ))}

      </nav>

    </aside>
  );
}

export default Sidebar;
