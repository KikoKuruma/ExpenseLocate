import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { 
  Database, 
  Download, 
  Upload, 
  Trash2, 
  AlertTriangle, 
  CheckCircle,
  Activity,
  Users,
  FileText,
  Tags,
  BarChart3
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import * as XLSX from 'xlsx';

interface DatabaseStats {
  totalExpenses: number;
  totalUsers: number;
  totalCategories: number;
  expensesByStatus: Array<{ status: string; count: number }>;
  recentActivity: Array<{ date: string; action: string; count: number }>;
}

const statusColors = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

export default function AdminDatabase() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importProgress, setImportProgress] = useState<number>(0);
  const [importResults, setImportResults] = useState<{ imported: number; errors: string[] } | null>(null);

  // Fetch database statistics
  const { data: stats, isLoading: statsLoading } = useQuery<DatabaseStats>({
    queryKey: ["/api/admin/database/stats"],
  });

  // Export expenses mutation
  const exportMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("GET", "/api/admin/export/expenses");
      return response.json();
    },
    onSuccess: (data: any) => {
      // Create Excel file from exported data
      const worksheet = XLSX.utils.json_to_sheet(data.data.map((expense: any) => ({
          'User ID': expense.userId,
          'Category ID': expense.categoryId,
          'Description': expense.description,
          'Amount': expense.amount,
          'Date': new Date(expense.date).toISOString().split('T')[0], // YYYY-MM-DD format
          'Status': expense.status,
          'Notes': expense.notes || '',
          'Receipt URL': expense.receiptUrl || '',
          'Submitted By ID': expense.submittedBy || expense.userId,
          // Additional reference columns for user convenience
          'Expense ID': expense.id,
          'Category Name': expense.category?.name || 'Unknown',
          'User Name': expense.user?.firstName && expense.user?.lastName 
            ? `${expense.user.firstName} ${expense.user.lastName}` 
            : expense.user?.email || 'Unknown',
          'Submitted By Name': expense.submittedByUser 
            ? `${expense.submittedByUser.firstName} ${expense.submittedByUser.lastName}`
            : 'Self',
          'Created At': new Date(expense.createdAt).toLocaleDateString(),
        })));

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Expenses');

      // Export file with timestamp
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `expense_export_${timestamp}.xlsx`;
      XLSX.writeFile(workbook, filename);

      toast({
        title: "Export Successful",
        description: `${data.recordCount} expense records exported to ${filename}`,
      });
    },
    onError: (error) => {
      toast({
        title: "Export Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Import expenses mutation
  const importMutation = useMutation({
    mutationFn: async (expenses: any[]) => {
      setImportProgress(10);
      const response = await apiRequest("POST", "/api/admin/import/expenses", { expenses });
      setImportProgress(100);
      return response.json();
    },
    onSuccess: (data: any) => {
      setImportResults(data);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/database/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      
      toast({
        title: "Import Completed",
        description: `${data.imported} expenses imported successfully`,
      });
      
      setImportFile(null);
      setImportProgress(0);
    },
    onError: (error) => {
      toast({
        title: "Import Failed",
        description: error.message,
        variant: "destructive",
      });
      setImportProgress(0);
    },
  });

  // Purge expenses mutation
  const purgeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", "/api/admin/purge/expenses");
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/database/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      
      toast({
        title: "Purge Completed",
        description: `${data.deletedCount} expense records have been permanently deleted`,
      });
    },
    onError: (error) => {
      toast({
        title: "Purge Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setImportFile(file);
      setImportResults(null);
    }
  };

  const handleImportExpenses = async () => {
    if (!importFile) return;

    // Validate file size (10MB limit)
    if (importFile.size > 10 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Please select a file smaller than 10MB.",
        variant: "destructive",
      });
      return;
    }

    try {
      const data = await importFile.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      
      if (!workbook.SheetNames.length) {
        toast({
          title: "Invalid File",
          description: "The file contains no worksheets.",
          variant: "destructive",
        });
        return;
      }

      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      if (!jsonData.length) {
        toast({
          title: "Empty File",
          description: "The file contains no data rows.",
          variant: "destructive",
        });
        return;
      }

      // Transform Excel data to expense format with enhanced field mapping
      const expenses = jsonData.map((row: any) => ({
        userId: row['User ID'] || row['userId'] || row['UserID'],
        categoryId: row['Category ID'] || row['categoryId'] || row['CategoryID'], 
        categoryName: row['Category Name'] || row['Category'] || row['categoryName'],
        description: row['Description'] || row['description'] || row['Desc'],
        amount: row['Amount'] || row['amount'] || row['Cost'] || row['Price'],
        date: row['Date'] || row['date'] || row['ExpenseDate'],
        status: row['Status'] || row['status'] || 'pending',
        notes: row['Notes'] || row['notes'] || row['Comments'] || row['Note'],
        submittedBy: row['Submitted By ID'] || row['submittedBy'] || row['SubmittedBy'],
        receiptUrl: row['Receipt URL'] || row['receiptUrl'] || row['ReceiptURL']
      }));

      importMutation.mutate(expenses);
    } catch (error: any) {
      console.error('Import processing error:', error);
      toast({
        title: "File Processing Error",
        description: error.message || "Failed to process the uploaded file. Please check the format.",
        variant: "destructive",
      });
    }
  };

  const handlePurgeExpenses = () => {
    const confirmed = confirm(
      "⚠️ WARNING: This action will permanently delete ALL expense records from the database. This cannot be undone. Are you absolutely sure you want to proceed?"
    );
    
    if (confirmed) {
      const doubleConfirmed = confirm(
        "This is your final confirmation. All expense data will be lost forever. Type 'DELETE' to confirm or cancel to abort."
      );
      
      if (doubleConfirmed) {
        purgeMutation.mutate();
      }
    }
  };

  const downloadTemplate = async () => {
    try {
      // Get current users and categories for the template
      const [usersResponse, categoriesResponse] = await Promise.all([
        apiRequest("GET", "/api/users"),
        apiRequest("GET", "/api/categories")
      ]);
      
      const users = await usersResponse.json();
      const categories = await categoriesResponse.json();
      
      // Create template data with examples
      const templateData = [
        {
          'User ID': users[0]?.id || 'user-id-here',
          'Category ID': categories[0]?.id || 'category-id-here', 
          'Description': 'Office Supplies',
          'Amount': 25.50,
          'Date': '2025-01-15',
          'Status': 'pending',
          'Notes': 'Stapler and paper clips',
          'Receipt URL': '',
          'Submitted By ID': users[0]?.id || 'user-id-here'
        },
        {
          'User ID': users[1]?.id || users[0]?.id || 'user-id-here',
          'Category ID': categories[1]?.id || categories[0]?.id || 'category-id-here',
          'Description': 'Travel Expenses',
          'Amount': 150.00,
          'Date': '2025-01-16', 
          'Status': 'pending',
          'Notes': 'Client meeting transportation',
          'Receipt URL': '',
          'Submitted By ID': users[1]?.id || users[0]?.id || 'user-id-here'
        }
      ];

      // Add reference sheet with available IDs
      const userReference = users.map((u: any) => ({
        'User ID': u.id,
        'Name': `${u.firstName} ${u.lastName}`,
        'Email': u.email,
        'Role': u.role
      }));

      const categoryReference = categories.map((c: any) => ({
        'Category ID': c.id,
        'Category Name': c.name,
        'Description': c.description || ''
      }));

      // Create workbook with multiple sheets
      const workbook = XLSX.utils.book_new();
      
      // Template sheet
      const templateWS = XLSX.utils.json_to_sheet(templateData);
      XLSX.utils.book_append_sheet(workbook, templateWS, 'Import Template');
      
      // Reference sheets
      const userWS = XLSX.utils.json_to_sheet(userReference);
      XLSX.utils.book_append_sheet(workbook, userWS, 'Available Users');
      
      const categoryWS = XLSX.utils.json_to_sheet(categoryReference);
      XLSX.utils.book_append_sheet(workbook, categoryWS, 'Available Categories');

      // Download the template
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `expense_import_template_${timestamp}.xlsx`;
      XLSX.writeFile(workbook, filename);

      toast({
        title: "Template Downloaded",
        description: "Import template with sample data and reference sheets has been downloaded.",
      });
    } catch (error) {
      toast({
        title: "Template Download Failed", 
        description: "Could not create import template. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Database Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Total Expenses</p>
                <p className="text-2xl font-bold text-gray-900" data-testid="text-total-expenses">
                  {statsLoading ? "..." : stats?.totalExpenses || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Total Users</p>
                <p className="text-2xl font-bold text-gray-900" data-testid="text-total-users">
                  {statsLoading ? "..." : stats?.totalUsers || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <Tags className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Categories</p>
                <p className="text-2xl font-bold text-gray-900" data-testid="text-total-categories">
                  {statsLoading ? "..." : stats?.totalCategories || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                <Activity className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Activity (7d)</p>
                <p className="text-2xl font-bold text-gray-900" data-testid="text-recent-activity">
                  {statsLoading ? "..." : stats?.recentActivity?.reduce((sum, day) => sum + day.count, 0) || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status Breakdown */}
      {stats?.expensesByStatus && stats.expensesByStatus.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-ccw-yellow" />
              Expense Status Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {stats.expensesByStatus.map((status) => (
                <Badge 
                  key={status.status} 
                  className={statusColors[status.status as keyof typeof statusColors] || "bg-gray-100 text-gray-800"}
                  data-testid={`badge-status-${status.status}`}
                >
                  {status.status.charAt(0).toUpperCase() + status.status.slice(1)}: {status.count}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Export/Import Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Export */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="w-5 h-5 text-ccw-yellow" />
              Export Database
            </CardTitle>
            <CardDescription>
              Download all expense records as an Excel file for backup or analysis
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Export includes all expense records with full details including user information, categories, and status.
              </AlertDescription>
            </Alert>
            
            <Button 
              onClick={() => exportMutation.mutate()}
              disabled={exportMutation.isPending}
              className="w-full"
              data-testid="button-export-expenses"
            >
              <Download className="w-4 h-4 mr-2" />
              {exportMutation.isPending ? "Exporting..." : "Export All Expenses"}
            </Button>
          </CardContent>
        </Card>

        {/* Import */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-ccw-yellow" />
              Import Database
            </CardTitle>
            <CardDescription>
              Upload an Excel file to import expense records into the database
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Required columns:</strong> User ID, Category ID (or Category Name), Description, Amount. 
                <br /><strong>Optional:</strong> Date, Status, Notes, Receipt URL.
                <br /><strong>Smart Features:</strong> Auto-creates missing categories, handles multiple column name formats.
              </AlertDescription>
            </Alert>
            
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>File Compatibility:</strong> Excel (.xlsx, .xls), CSV files. Max size: 10MB. 
                Works with exports from Reports page, Database Management, or custom formatted files.
              </AlertDescription>
            </Alert>

            <div className="flex gap-2 mb-4">
              <Button 
                onClick={() => downloadTemplate()}
                variant="outline"
                size="sm"
                data-testid="button-download-template"
              >
                <Download className="w-4 h-4 mr-1" />
                Download Template
              </Button>
            </div>

            <div className="space-y-3">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileSelect}
                className="w-full p-2 border border-gray-200 rounded-md"
                data-testid="input-import-file"
              />
              
              {importFile && (
                <p className="text-sm text-gray-600">
                  Selected: {importFile.name}
                </p>
              )}

              {importProgress > 0 && importProgress < 100 && (
                <div className="space-y-2">
                  <Progress value={importProgress} className="w-full" />
                  <p className="text-sm text-gray-600 text-center">Importing... {importProgress}%</p>
                </div>
              )}

              <Button 
                onClick={handleImportExpenses}
                disabled={!importFile || importMutation.isPending}
                className="w-full"
                data-testid="button-import-expenses"
              >
                <Upload className="w-4 h-4 mr-2" />
                {importMutation.isPending ? "Importing..." : "Import Expenses"}
              </Button>
            </div>

            {importResults && (
              <Alert className={importResults.errors.length > 0 ? "border-orange-200 bg-orange-50" : "border-green-200 bg-green-50"}>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <p><strong>Import completed:</strong> {importResults.imported} records imported successfully</p>
                    {importResults.errors.length > 0 && (
                      <div>
                        <p><strong>Issues found:</strong> {importResults.errors.length} rows skipped or failed</p>
                        <div className="max-h-32 overflow-y-auto border rounded p-2 bg-white">
                          <ul className="text-sm space-y-1">
                            {importResults.errors.map((error, index) => (
                              <li key={index} className="text-gray-700">{error}</li>
                            ))}
                          </ul>
                        </div>
                        <p className="text-xs text-gray-600 mt-2">
                          Tip: Download the template to see the correct format and available User/Category IDs
                        </p>
                      </div>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Purge Section */}
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <Trash2 className="w-5 h-5" />
            Danger Zone
          </CardTitle>
          <CardDescription>
            Irreversible database operations. Use with extreme caution.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="border-red-200 bg-red-50">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Warning:</strong> Purging will permanently delete ALL expense records from the database. 
              This action cannot be undone. Make sure to export your data first.
            </AlertDescription>
          </Alert>
          
          <Button 
            onClick={handlePurgeExpenses}
            disabled={purgeMutation.isPending}
            variant="destructive"
            className="w-full"
            data-testid="button-purge-expenses"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            {purgeMutation.isPending ? "Purging..." : "Purge All Expense Records"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}