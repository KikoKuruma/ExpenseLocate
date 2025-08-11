import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { DollarSign, Calendar, AlertCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface ExpenseStats {
  currentQuarterExpenses: number;
  thisMonthExpenses: number;
}

// Helper function to get current quarter name
function getCurrentQuarterName(): string {
  const now = new Date();
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  return `Q${quarter} ${now.getFullYear()}`;
}

export default function StatsCards() {
  const { user } = useAuth();
  const { data: stats, isLoading } = useQuery<ExpenseStats>({
    queryKey: ["/api/expenses/stats"],
  });

  // Fetch pending expenses count for approvers/administrators
  const { data: pendingExpenses } = useQuery({
    queryKey: ["/api/expenses/pending"],
    enabled: !!user && (user.role === "admin" || user.role === "approver"),
  });

  // Determine grid columns based on user role
  const isApproverOrAdmin = user?.role === "admin" || user?.role === "approver";
  const gridCols = isApproverOrAdmin ? "lg:grid-cols-3" : "lg:grid-cols-2";

  if (isLoading) {
    const cardCount = isApproverOrAdmin ? 3 : 2;
    return (
      <div className={`grid grid-cols-1 md:grid-cols-2 ${gridCols} gap-6 mb-8`}>
        {[...Array(cardCount)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-12 bg-gray-200 rounded mb-4"></div>
              <div className="h-4 bg-gray-200 rounded mb-2"></div>
              <div className="h-8 bg-gray-200 rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // Base stats for all users - reordered with month first, then quarter
  const baseStats = [
    {
      title: "This Month",
      value: `$${(stats?.thisMonthExpenses ?? 0).toFixed(2)}`,
      icon: Calendar,
      bgColor: "bg-blue-100",
      iconColor: "text-blue-600",
      testId: "stat-month-expenses",
    },
    {
      title: getCurrentQuarterName(),
      value: `$${(stats?.currentQuarterExpenses ?? 0).toFixed(2)}`,
      icon: DollarSign,
      bgColor: "bg-ccw-yellow",
      iconColor: "text-ccw-yellow",
      testId: "stat-quarter-expenses",
    },
  ];

  // Add pending approvals card for approvers/administrators
  const statsData = isApproverOrAdmin
    ? [
        ...baseStats,
        {
          title: "Awaiting Action",
          value: Array.isArray(pendingExpenses) ? pendingExpenses.length.toString() : "0",
          icon: AlertCircle,
          bgColor: "bg-orange-100",
          iconColor: "text-orange-600",
          testId: "stat-pending-count",
          subtitle: "expense reports",
        },
      ]
    : baseStats;

  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 ${gridCols} gap-6 mb-8`}>
      {statsData.map((stat) => (
        <Card key={stat.title} className="bg-white shadow-sm border border-gray-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                <p 
                  className="text-2xl font-bold text-ccw-dark" 
                  data-testid={stat.testId}
                >
                  {stat.value}
                </p>
                {"subtitle" in stat && stat.subtitle && (
                  <p className="text-xs text-gray-500">{stat.subtitle}</p>
                )}
              </div>
              <div className={`w-12 h-12 ${stat.bgColor} bg-opacity-10 rounded-lg flex items-center justify-center`}>
                <stat.icon className={`w-6 h-6 ${stat.iconColor}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
