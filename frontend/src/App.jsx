import {
  BrowserRouter,
  Routes,
  Route
} from "react-router-dom";

import MainLayout from "./layouts/MainLayout";

import Dashboard from "./pages/Dashboard";
import Courses from "./pages/Courses";
import CourseDetails from "./pages/CourseDetails";
import StudyTimer from "./pages/StudyTimer";
import Progress from "./pages/Progress";
import Settings from "./pages/Settings";


function App() {

  return (

    <BrowserRouter>

      <Routes>

        <Route
          element={<MainLayout />}
        >

          <Route
            path="/"
            element={<Dashboard />}
          />

          <Route
            path="/courses"
            element={<Courses />}
          />

          <Route
            path="/courses/:courseId"
            element={<CourseDetails />}
          />

          <Route
            path="/study-timer"
            element={<StudyTimer />}
          />

          <Route
            path="/progress"
            element={<Progress />}
          />

          <Route
            path="/settings"
            element={<Settings />}
          />

        </Route>

      </Routes>

    </BrowserRouter>
  );
}

export default App;
