'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { secureLog } from '@/lib/secure-logger';
import { PlusCircle, Trash2, Edit, UserCheck, UserX, KeyRound } from 'lucide-react';

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
  department_id: {
    _id: string;
    name: string;
  };
  employee_id?: {
    _id: string;
    full_name: string;
  };
  role: 'SUPERADMIN' | 'ADMIN' | 'USER';
  isActive: boolean;
  lastLogin?: string;
}

export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [availableEmployees, setAvailableEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('users');
  const { toast } = useToast();

  // Reset password form state
  const [resetPasswordData, setResetPasswordData] = useState({
    userId: '',
    password: '',
  });
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    employee_id: '',
    role: 'USER' as 'SUPERADMIN' | 'ADMIN' | 'USER',
    department_id: '',
  });

  // Edit form state
  const [editFormData, setEditFormData] = useState({
    email: '',
    full_name: '',
    role: 'USER' as 'SUPERADMIN' | 'ADMIN' | 'USER',
    department_id: '',
    isActive: true,
  });

  useEffect(() => {
    fetchUsers();
    fetchAvailableEmployees();
    fetchDepartments();
  }, []);

  const fetchUsers = async () => {
    try {
      const result = await apiClient.getUsers();
      if (result.success) {
        const usersData = Array.isArray(result.data) ? result.data : [];
        setUsers(usersData);
      } else {
        secureLog.error('Error fetching users', (result as any).error);
      }
    } catch (error) {
      secureLog.error('Error fetching users', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableEmployees = async () => {
    try {
      const result = await apiClient.getAvailableEmployees();
      secureLog.debug('Available employees result', { success: result.success });
      if (result.success) {
        const employees = Array.isArray(result.data) ? result.data : [];
        setAvailableEmployees(employees);
        if (employees.length === 0) {
          toast({
            variant: 'default',
            title: 'No Available Employees',
            description: 'All employees already have user accounts. Create a new employee first.',
          });
        }
      } else {
        secureLog.error('Error fetching available employees', result.error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.error || 'Failed to fetch available employees',
        });
      }
    } catch (error) {
      secureLog.error('Error fetching available employees', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to fetch available employees. Please check the console for details.',
      });
    }
  };

  const fetchDepartments = async () => {
    try {
      const result = await apiClient.getDepartments();
      if (result.success) {
        const departmentsData = Array.isArray(result.data) ? result.data : [];
        setDepartments(departmentsData);
      } else {
        secureLog.error('Error fetching departments', (result as any).error);
      }
    } catch (error) {
      secureLog.error('Error fetching departments', error);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const result = await apiClient.createUser(formData);

      if (result.success) {
        toast({
          title: 'Success',
          description: 'User created successfully',
        });
        setIsCreateDialogOpen(false);
        setFormData({ email: '', password: '', full_name: '', employee_id: '', role: 'USER', department_id: '' });
        fetchUsers();
        fetchAvailableEmployees();
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.error || 'Failed to create user',
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to create user',
      });
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
      const result = await apiClient.deleteUser(userId);

      if (result.success) {
        toast({
          title: 'Success',
          description: 'User deleted successfully',
        });
        fetchUsers();
        fetchAvailableEmployees();
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.error || 'Failed to delete user',
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to delete user',
      });
    }
  };

  const handleToggleUserStatus = async (userId: string, currentStatus: boolean) => {
    try {
      const result = await apiClient.updateUser(userId, { isActive: !currentStatus });

      if (result.success) {
        toast({
          title: 'Success',
          description: `User ${!currentStatus ? 'activated' : 'deactivated'} successfully`,
        });
        fetchUsers();
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.error || 'Failed to update user',
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to update user',
      });
    }
  };

  const handleOpenEditDialog = (user: User) => {
    setSelectedUser(user);
    setEditFormData({
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      department_id: user.department_id?._id || '',
      isActive: user.isActive,
    });
    setIsEditDialogOpen(true);
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    try {
      const result = await apiClient.updateUser(selectedUser._id, editFormData);

      if (result.success) {
        toast({
          title: 'Success',
          description: 'User updated successfully',
        });
        setIsEditDialogOpen(false);
        setSelectedUser(null);
        fetchUsers();
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.error || 'Failed to update user',
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to update user',
      });
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!resetPasswordData.userId) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Please select a user',
      });
      return;
    }

    setIsResettingPassword(true);
    try {
      // Get the password value - if empty, send undefined to use default
      const passwordValue = resetPasswordData.password.trim();
      const password = passwordValue.length > 0 ? passwordValue : undefined;
      secureLog.debug('Resetting password', { userId: resetPasswordData.userId, hasCustomPassword: !!password });

      const result = await apiClient.resetUserPassword(resetPasswordData.userId, password);

      if (result.success) {
        toast({
          title: 'Success',
          description: password 
            ? `Password reset successfully for user` 
            : 'Password reset to default (password123)',
        });
        setResetPasswordData({ userId: '', password: '' });
        // Invalidate users cache to refresh data
        apiClient.invalidateCache('/users');
      } else {
        secureLog.error('Password reset failed', result.error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.error || 'Failed to reset password',
        });
      }
    } catch (error: any) {
      secureLog.error('Password reset error', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to reset password. Please try again.',
      });
    } finally {
      setIsResettingPassword(false);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'SUPERADMIN':
        return 'bg-red-500 text-white';
      case 'ADMIN':
        return 'bg-blue-500 text-white';
      case 'USER':
        return 'bg-green-500 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">User Management</h1>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="reset-password">Reset Password</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-6">
          <div className="flex justify-end">
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" />
              Create User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <Label htmlFor="employee_id">Select Employee</Label>
                <Select
                  value={formData.employee_id}
                  onValueChange={(value) => {
                    const employee = availableEmployees.find(emp => emp._id === value);
                    setFormData({ 
                      ...formData, 
                      employee_id: value,
                      full_name: employee?.full_name || '',
                      department_id: employee?.department_id._id || '',
                      email: employee?.email || ''
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={
                      availableEmployees.length === 0 
                        ? "No available employees" 
                        : "Select an employee"
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    {availableEmployees.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        No employees available. All employees have user accounts.
                      </div>
                    ) : (
                      availableEmployees.map((employee) => (
                        <SelectItem key={employee._id} value={employee._id}>
                          {employee.full_name} - {employee.department_id?.name || 'No Department'}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {availableEmployees.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Create a new employee in the Employee Management page first.
                  </p>
                )}
              </div>
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
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="role">Role</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value: 'SUPERADMIN' | 'ADMIN' | 'USER') => 
                    setFormData({ ...formData, role: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USER">User</SelectItem>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                    <SelectItem value="SUPERADMIN">Superadmin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full">
                Create User
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Edit User Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit User</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleEditUser} className="space-y-4">
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
                <Label htmlFor="edit_department">Department</Label>
                <Select
                  value={editFormData.department_id}
                  onValueChange={(value) => setEditFormData({ ...editFormData, department_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
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
              <div>
                <Label htmlFor="edit_role">Role</Label>
                <Select
                  value={editFormData.role}
                  onValueChange={(value: 'SUPERADMIN' | 'ADMIN' | 'USER') => 
                    setEditFormData({ ...editFormData, role: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USER">User</SelectItem>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                    <SelectItem value="SUPERADMIN">Superadmin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="edit_isActive"
                  checked={editFormData.isActive}
                  onChange={(e) => setEditFormData({ ...editFormData, isActive: e.target.checked })}
                  className="rounded"
                />
                <Label htmlFor="edit_isActive">Active</Label>
              </div>
              <div className="flex gap-2">
                <Button type="submit" className="flex-1">
                  Update User
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsEditDialogOpen(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
          </div>

          <Card>
        <CardHeader>
          <CardTitle>Users ({users.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user._id}>
                  <TableCell className="font-medium">{user.full_name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.department_id?.name || 'N/A'}</TableCell>
                  <TableCell>
                    <Badge className={getRoleBadgeColor(user.role)}>
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.isActive ? 'default' : 'secondary'}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {user.lastLogin 
                      ? new Date(user.lastLogin).toLocaleDateString()
                      : 'Never'
                    }
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenEditDialog(user)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleUserStatus(user._id, user.isActive)}
                      >
                        {user.isActive ? (
                          <UserX className="h-4 w-4" />
                        ) : (
                          <UserCheck className="h-4 w-4" />
                        )}
                      </Button>
                      {user.role !== 'SUPERADMIN' && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeleteUser(user._id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="reset-password" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5" />
                Reset User Password
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <Label htmlFor="reset_user">Select User</Label>
                  <Select
                    value={resetPasswordData.userId}
                    onValueChange={(value) => setResetPasswordData({ ...resetPasswordData, userId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a user to reset password" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((user) => (
                        <SelectItem key={user._id} value={user._id}>
                          {user.full_name} ({user.email}) - {user.role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="reset_password">New Password (Optional)</Label>
                  <Input
                    id="reset_password"
                    type="password"
                    value={resetPasswordData.password}
                    onChange={(e) => setResetPasswordData({ ...resetPasswordData, password: e.target.value })}
                    placeholder="Leave empty to reset to default password (password123)"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    If left empty, password will be reset to the default: <strong>password123</strong>
                  </p>
                </div>
                <Button type="submit" disabled={isResettingPassword || !resetPasswordData.userId} className="w-full">
                  {isResettingPassword ? 'Resetting...' : 'Reset Password'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
