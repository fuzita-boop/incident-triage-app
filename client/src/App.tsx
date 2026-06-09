import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import UploadPage from "./pages/UploadPage";
import IncidentListPage from "./pages/IncidentListPage";
import IncidentReviewPage from "./pages/IncidentReviewPage";
import BatchReviewPage from "./pages/BatchReviewPage";
import MonthlyReportPage from "./pages/MonthlyReportPage";

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/upload" component={UploadPage} />
        <Route path="/incidents" component={IncidentListPage} />
        <Route path="/incidents/:id" component={IncidentReviewPage} />
        <Route path="/review-group/:uploadGroupId" component={BatchReviewPage} />
        <Route path="/monthly-report" component={MonthlyReportPage} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster richColors position="top-right" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
