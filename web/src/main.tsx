import Homework from './pages/Homework';
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./index.css";
import Library from "./pages/Library";
import Study from "./pages/Study";
import Summary from "./pages/Summary";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/homework/:id" element={<Homework />} />
        <Route path="/" element={<Library />} />
        <Route path="/study/:id" element={<Study />} />
        <Route path="/study/:id/summary" element={<Summary />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
