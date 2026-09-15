import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";

function MainLayout() {

  return (
    <div className="app-layout">

      <Sidebar />

      <div className="main-content">

        <header className="topbar">

          <div>
            <strong>Cogniv</strong>
          </div>

          <div className="backend-status">
            ● Backend Connected
          </div>

        </header>

        <main>
          <Outlet />
        </main>

      </div>

    </div>
  );
}

export default MainLayout;
