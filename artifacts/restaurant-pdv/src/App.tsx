import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Orders from "@/pages/orders";
import NewOrder from "@/pages/new-order";
import OrderDetail from "@/pages/order-detail";
import Tables from "@/pages/tables";
import Kitchen from "@/pages/kitchen";
import Menu from "@/pages/menu";
import Customers from "@/pages/customers";
import Payment from "@/pages/payment";
import Cash from "@/pages/cash";
import Routes from "@/pages/routes";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/orders/new" component={NewOrder} />
      <Route path="/orders/:id" component={OrderDetail} />
      <Route path="/orders" component={Orders} />
      <Route path="/tables" component={Tables} />
      <Route path="/kitchen" component={Kitchen} />
      <Route path="/menu" component={Menu} />
      <Route path="/customers" component={Customers} />
      <Route path="/payments/:orderId" component={Payment} />
      <Route path="/cash" component={Cash} />
      <Route path="/routes" component={Routes} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
