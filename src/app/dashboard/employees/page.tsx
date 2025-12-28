'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { PlusCircle, Trash2, Edit, UserCheck, UserX, Users, Loader2 } from 'lucide-react';

interface Employee {
  _id: string;
  full_name: string;
  email: string;
  department_id: {
    _id: string;
    name: string;
  };
}

interface User {
  _id: string;
  email: string;
  full_name: string;
  employee_id?: {
    _id: string;
  };
  role: 'SUPERADMIN' | 'ADMIN' | 'USER';
  isActive: boolean;
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isCreateUserDialogOpen, setIsCreateUserDialogOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { userProfile } = useAuth();

  // Check if user has permission (SUPERADMIN or ADMIN)
  const canManage = userProfile?.role === 'SUPERADMIN' || userProfile?.role === 'ADMIN';

  // Form state
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    department_id: '',
  });

  // Edit form state
  const [editFormData, setEditFormData] = useState({
    full_name: '',
    email: '',
    department_id: '',
  });

  // Create user form state
  const [userFormData, setUserFormData] = useState({
    password: '',
    role: 'USER' as 'SUPERADMIN' | 'ADMIN' | 'USER',
  });

  useEffect(() => {
    if (canManage) {
      // Fetch all data in parallel for faster loading
      Promise.all([
        fetchEmployees(),
        fetchUsers(),
        fetchDepartments(),
      ]).catch((error) => {
        console.error('Error loading initial data:', error);
      });
    } else {
      setLoading(false);
    }
  }, [canManage]);

  const fetchEmployees = async () => {
    try {
      const result = await apiClient.getEmployees(true); // Use cache
      if (result.success) {
        const employeesData = Array.isArray(result.data) ? result.data : [];
        setEmployees(employeesData);
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: (result as any).error || 'Failed to fetch employees',
        });
      }
    } catch (error) {
      console.error('Error fetching employees:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to fetch employees',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const result = await apiClient.getUsers(true); // Use cache
      if (result.success) {
        const usersData = Array.isArray(result.data) ? result.data : [];
        setUsers(usersData);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchDepartments = async () => {
    try {
      const result = await apiClient.getDepartments(true); // Use cache (departments rarely change)
      if (result.success) {
        const departmentsData = Array.isArray(result.data) ? result.data : [];
        setDepartments(departmentsData);
      }
    } catch (error) {
      console.error('Error fetching departments:', error);
    }
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const result = await apiClient.createEmployee(formData);

      if (result.success) {
        toast({
          title: 'Success',
          description: 'Employee created successfully',
        });
        setIsCreateDialogOpen(false);
        setFormData({ full_name: '', email: '', department_id: '' });
        // Invalidate cache and fetch fresh data
        apiClient.invalidateCache('/employees');
        fetchEmployees();
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.error || 'Failed to create employee',
        });
      }
    } catch (error) {
      console.error('Error creating employee:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to create employee',
      });
    }
  };

  const handleEditEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedEmployee) return;

    try {
      const result = await apiClient.updateEmployee(selectedEmployee._id, editFormData);

      if (result.success) {
        toast({
          title: 'Success',
          description: 'Employee updated successfully',
        });
        setIsEditDialogOpen(false);
        setSelectedEmployee(null);
        // Invalidate caches and fetch fresh data
        apiClient.invalidateCache('/employees');
        apiClient.invalidateCache('/users');
        fetchEmployees();
        fetchUsers(); // Refresh users to reflect employee changes
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.error || 'Failed to update employee',
        });
      }
    } catch (error) {
      console.error('Error updating employee:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to update employee',
      });
    }
  };

  const handleDeleteEmployee = async () => {
    if (!selectedEmployee) return;

    try {
      // Check if employee has a user account
      const hasUser = users.some(user => user.employee_id?._id === selectedEmployee._id);
      
      if (hasUser) {
        toast({
          variant: 'destructive',
          title: 'Cannot Delete',
          description: 'This employee has a user account. Please delete the user account first.',
        });
        setIsDeleteDialogOpen(false);
        return;
      }

      const result = await apiClient.deleteEmployee(selectedEmployee._id);

      if (result.success) {
        toast({
          title: 'Success',
          description: 'Employee deleted successfully',
        });
        setIsDeleteDialogOpen(false);
        setSelectedEmployee(null);
        // Invalidate cache and fetch fresh data
        apiClient.invalidateCache('/employees');
        fetchEmployees();
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.error || 'Failed to delete employee',
        });
      }
    } catch (error) {
      console.error('Error deleting employee:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to delete employee',
      });
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedEmployee) return;

    try {
      const result = await apiClient.createUser({
        employee_id: selectedEmployee._id,
        email: selectedEmployee.email,
        full_name: selectedEmployee.full_name,
        department_id: selectedEmployee.department_id._id,
        password: userFormData.password,
        role: userFormData.role,
      });

      if (result.success) {
        toast({
          title: 'Success',
          description: 'User account created successfully',
        });
        setIsCreateUserDialogOpen(false);
        setSelectedEmployee(null);
        setUserFormData({ password: '', role: 'USER' });
        // Invalidate caches and fetch fresh data
        apiClient.invalidateCache('/users');
        apiClient.invalidateCache('/employees/available');
        fetchUsers();
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.error || 'Failed to create user account',
        });
      }
    } catch (error) {
      console.error('Error creating user:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to create user account',
      });
    }
  };

  const openEditDialog = (employee: Employee) => {
    setSelectedEmployee(employee);
    setEditFormData({
      full_name: employee.full_name,
      email: employee.email,
      department_id: employee.department_id._id,
    });
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (employee: Employee) => {
    setSelectedEmployee(employee);
    setIsDeleteDialogOpen(true);
  };

  const openCreateUserDialog = (employee: Employee) => {
    setSelectedEmployee(employee);
    setUserFormData({ password: '', role: 'USER' });
    setIsCreateUserDialogOpen(true);
  };

  const hasUserAccount = (employeeId: string) => {
    return users.some(user => user.employee_id?._id === employeeId);
  };

  const getUserAccount = (employeeId: string) => {
    return users.find(user => user.employee_id?._id === employeeId);
  };

  if (!canManage) {
    return (
        <Card>
            <CardHeader>
          <CardTitle>Access Denied</CardTitle>
            </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            You do not have permission to access this page. Only SuperAdmin and Manager roles can manage employees.
          </p>
            </CardContent>
        </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Employee Management
              </CardTitle>
              <CardDescription>
                Manage employees and create user accounts. Changes to employees will reflect in their user accounts.
              </CardDescription>
            </div>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <PlusCircle className="h-4 w-4 mr-2" />
                  Add Employee
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Employee</DialogTitle>
                  <DialogDescription>
                    Add a new employee to the system. You can create a user account for them later.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreateEmployee} className="space-y-4">
                  <div>
                    <Label htmlFor="full_name">Full Name</Label>
                    <Input
                      id="full_name"
                      type="text"
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="department_id">Department</Label>
                    <Select
                      value={formData.department_id}
                      onValueChange={(value) => setFormData({ ...formData, department_id: value })}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a department" />
                      </SelectTrigger>
                      <SelectContent>
                        {departments.map((dept) => (
                          <SelectItem key={dept._id} value={dept._id}>
                            {dept.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsCreateDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit">Create Employee</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>User Account</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No employees found. Create your first employee to get started.
                  </TableCell>
                </TableRow>
              ) : (
                employees.map((employee) => {
                  const hasUser = hasUserAccount(employee._id);
                  const userAccount = getUserAccount(employee._id);
                  
                  return (
                    <TableRow key={employee._id}>
                      <TableCell className="font-medium">{employee.full_name}</TableCell>
                      <TableCell>{employee.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{employee.department_id.name}</Badge>
                      </TableCell>
                      <TableCell>
                        {hasUser && userAccount ? (
                          <div className="flex items-center gap-2">
                            <UserCheck className="h-4 w-4 text-green-600" />
                            <Badge variant="secondary">{userAccount.role}</Badge>
                            {!userAccount.isActive && (
                              <Badge variant="destructive" className="text-xs">Inactive</Badge>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <UserX className="h-4 w-4 text-gray-400" />
                            <span className="text-sm text-muted-foreground">No account</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditDialog(employee)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {!hasUser && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openCreateUserDialog(employee)}
                            >
                              <UserCheck className="h-4 w-4 mr-1" />
                              Create User
                            </Button>
                          )}
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => openDeleteDialog(employee)}
                            disabled={hasUser}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Employee Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Employee</DialogTitle>
            <DialogDescription>
              Update employee information. Changes will reflect in their user account if they have one.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditEmployee} className="space-y-4">
            <div>
              <Label htmlFor="edit_full_name">Full Name</Label>
              <Input
                id="edit_full_name"
                type="text"
                value={editFormData.full_name}
                onChange={(e) => setEditFormData({ ...editFormData, full_name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="edit_email">Email</Label>
              <Input
                id="edit_email"
                type="email"
                value={editFormData.email}
                onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="edit_department_id">Department</Label>
              <Select
                value={editFormData.department_id}
                onValueChange={(value) => setEditFormData({ ...editFormData, department_id: value })}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a department" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept._id} value={dept._id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Update Employee</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Employee Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the employee "{selectedEmployee?.full_name}". 
              This action cannot be undone. Employees with user accounts cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteEmployee}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create User Dialog */}
      <Dialog open={isCreateUserDialogOpen} onOpenChange={setIsCreateUserDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create User Account</DialogTitle>
            <DialogDescription>
              Create a user account for {selectedEmployee?.full_name}. 
              The user will be able to log in with their email and the password you set.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={userFormData.password}
                onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                required
                minLength={4}
              />
            </div>
            <div>
              <Label htmlFor="role">Role</Label>
              <Select
                value={userFormData.role}
                onValueChange={(value: 'SUPERADMIN' | 'ADMIN' | 'USER') => 
                  setUserFormData({ ...userFormData, role: value })
                }
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {userProfile?.role === 'SUPERADMIN' && (
                    <SelectItem value="SUPERADMIN">SuperAdmin</SelectItem>
                  )}
                  <SelectItem value="ADMIN">Admin (Manager)</SelectItem>
                  <SelectItem value="USER">User</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateUserDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Create User Account</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
    );
}
