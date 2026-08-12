import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Router, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import BackupPage from "./pages/BackupPage";
import Dashboard from "./pages/Dashboard";
import IncidentListPage from "./pages/IncidentListPage";
import IncidentReviewPage from "./pages/IncidentReviewPage";
import MonthlyReportPage from "./pages/MonthlyReportPage";
import UploadPage from "./pages/UploadPage";

function AppRoutes() {
  return <DashboardLayout><Switch><Route path="/" component={Dashboard} /><Route path="/upload" component={UploadPage} /><Route path="/incidents" component={IncidentListPage} /><Route path="/incidents/:id" component={IncidentReviewPage} /><Route path="/monthly-report" component={MonthlyReportPage} /><Route path="/backup" component={BackupPage} /><Route component={NotFound} /></Switch></DashboardLayout>;
}

export default function App() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster richColors position="top-right" /><Router base={base}><AppRoutes /></Router></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
