'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus, Eye, QrCode, MapPin, Package, User, Clock, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { secureLog } from '@/lib/secure-logger';

interface DeliveryAssignment {
  _id: string;
  assignment_id: string;
  request_id?: {
    request_id?: string;
    customer?: {
      name?: string;
      company?: string;
    };
    receiver?: {
      name?: string;
      address?: string;
      city?: string;
      country?: string;
      phone?: string;
    };
  };
  driver_id?: {
    _id?: string;
    name?: string;
    phone?: string;
    vehicle_type?: string;
    vehicle_number?: string;
  };
  invoice_id?: {
    invoice_id?: string;
    total_amount?: string;
  };
  client_id?: {
    company_name?: string;
    contact_name?: string;
  };
  amount: string | number;
  delivery_type: string;
  status: string;
  delivery_address: string;
  delivery_instructions?: string;
  qr_code: string;
  qr_url: string;
  qr_expires_at: string;
  qr_used: boolean;
  payment_collected: boolean;
  payment_method?: string;
  payment_reference?: string;
  payment_notes?: string;
  pickup_date?: string;
  delivery_date?: string;
  created_at: string;
  // New fields from CSV
  receiver_name?: string;
  receiver_address?: string;
  receiver_phone?: string;
}

interface Driver {
  _id: string;
  driver_id: string;
  name: string;
  phone: string;
  vehicle_type: string;
  vehicle_number: string;
  is_active: boolean;
}

export default function DeliveryAssignmentsPage() {
  const { toast } = useToast();
  const { userProfile } = useAuth();
  const isOperations = userProfile?.department?.name === 'Operations';
  
  const [assignments, setAssignments] = useState<DeliveryAssignment[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<DeliveryAssignment | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  
  // Create assignment form state
  const [formData, setFormData] = useState({
    request_id: '',
    driver_id: '',
    invoice_id: '',
    client_id: '',
    amount: '',
    delivery_type: 'COD',
    delivery_address: '',
    delivery_instructions: ''
  });

  useEffect(() => {
    if (!userProfile) return;
    if (isOperations) {
      setLoading(false);
      return;
    }
    fetchAssignments();
    fetchDrivers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile, isOperations]);

  if (isOperations) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-muted-foreground">Access denied.</div>
      </div>
    );
  }

  const fetchAssignments = async () => {
    try {
      setLoading(true);
      const result = await apiClient.getDeliveryAssignments();
      secureLog.debug('Delivery assignments API result', { success: result.success });

      if (result.success && result.data) {
        // Ensure data is an array before setting
        const dataArray = Array.isArray(result.data) ? result.data : [];
        setAssignments(dataArray);
      } else {
        secureLog.debug('No data or unsuccessful response', { success: result.success });
        setAssignments([]); // Set empty array instead of undefined
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.error || 'Failed to load delivery assignments'
        });
      }
    } catch (error) {
      secureLog.error('Error fetching assignments', error);
      setAssignments([]); // Set empty array on error
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load delivery assignments'
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchDrivers = async () => {
    try {
      const result = await apiClient.getDrivers();
      secureLog.debug('Drivers API result', { success: result.success });

      if (result.success && result.data) {
        // Ensure data is an array before setting
        const dataArray = Array.isArray(result.data) ? result.data : [];
        setDrivers(dataArray);
      } else {
        secureLog.debug('No drivers data or unsuccessful response', { success: result.success });
        setDrivers([]); // Set empty array instead of undefined
      }
    } catch (error) {
      secureLog.error('Error fetching drivers', error);
      setDrivers([]); // Set empty array on error
    }
  };

  const handleCreateAssignment = async () => {
    try {
      const result = await apiClient.createDeliveryAssignment(formData);
      
      if (result.success) {
        toast({
          title: 'Success',
          description: 'Delivery assignment created successfully'
        });
        setShowCreateDialog(false);
        setFormData({
          request_id: '',
          driver_id: '',
          invoice_id: '',
          client_id: '',
          amount: '',
          delivery_type: 'COD',
          delivery_address: '',
          delivery_instructions: ''
        });
        fetchAssignments();
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.error || 'Failed to create assignment'
        });
      }
    } catch (error) {
      secureLog.error('Error creating assignment', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to create assignment'
      });
    }
  };

  const handleStatusUpdate = async (assignmentId: string, newStatus: string) => {
    try {
      const result = await apiClient.updateDeliveryAssignment(assignmentId, { status: newStatus });
      
      if (result.success) {
        toast({
          title: 'Success',
          description: 'Assignment status updated successfully'
        });
        fetchAssignments();
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.error || 'Failed to update status'
        });
      }
    } catch (error) {
      secureLog.error('Error updating status', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to update status'
      });
    }
  };

  const formatCurrency = (amount: string | number | any) => {
    let numAmount = 0;
    
    // Handle different input types
    if (typeof amount === 'string') {
      numAmount = parseFloat(amount);
    } else if (typeof amount === 'number') {
      numAmount = amount;
    } else if (typeof amount === 'object' && amount !== null) {
      // Handle Decimal128 from MongoDB
      if (amount.$numberDecimal) {
        numAmount = parseFloat(amount.$numberDecimal);
      } else if (typeof amount.toString === 'function') {
        numAmount = parseFloat(amount.toString());
      }
    }
    
    // Check if number is valid
    if (isNaN(numAmount) || !isFinite(numAmount)) {
      secureLog.warn('Invalid amount for formatting', { amount });
      return 'AED 0.00';
    }
    
    return new Intl.NumberFormat('en-AE', {
      style: 'currency',
      currency: 'AED',
    }).format(numAmount);
  };

  const normalizeStatus = (status?: string) => {
    if (status === 'DELIVERED') return 'DELIVERED';
    if (status === 'CANCELLED') return 'CANCELLED';
    return 'NOT_DELIVERED';
  };

  const getStatusColor = (status: string) => {
    if (status === 'DELIVERED') return 'bg-green-500';
    if (status === 'CANCELLED') return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getStatusLabel = (status: string) => {
    if (status === 'DELIVERED') return 'Delivered';
    if (status === 'CANCELLED') return 'Cancelled';
    return 'Not Delivered';
  };

  const getPaymentMethodColor = (method: string | undefined) => {
    if (!method || method === 'NOT_DEFINED_YET') return 'bg-gray-100 text-gray-800';
    switch (method) {
      case 'COD': return 'bg-red-100 text-red-800';
      case 'TABBY': return 'bg-purple-100 text-purple-800';
      case 'BANK_TRANSFER': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getDeliveryTypeColor = (type: string) => {
    switch (type) {
      case 'COD': return 'bg-red-100 text-red-800';
      case 'PREPAID': return 'bg-green-100 text-green-800';
      case 'BANK_TRANSFER': return 'bg-blue-100 text-blue-800';
      case 'WAREHOUSE_PICKUP': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const copyQRUrl = (qrUrl: string) => {
    navigator.clipboard.writeText(qrUrl);
    toast({
      title: 'Success',
      description: 'QR URL copied to clipboard'
    });
  };

  if (loading) return <Loader2 className="h-8 w-8 animate-spin" />;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Delivery Assignments</h1>
          <p className="text-gray-600">Manage driver assignments and QR payment collection</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={fetchAssignments}
            disabled={loading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Assignment
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create Delivery Assignment</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="request_id">Request ID</Label>
                    <Input
                      id="request_id"
                      value={formData.request_id}
                      onChange={(e) => setFormData(prev => ({ ...prev, request_id: e.target.value }))}
                      placeholder="SR-000001"
                    />
                  </div>
                  <div>
                    <Label htmlFor="driver_id">Driver</Label>
                    <Select value={formData.driver_id} onValueChange={(value) => setFormData(prev => ({ ...prev, driver_id: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select driver" />
                      </SelectTrigger>
                      <SelectContent>
                        {(Array.isArray(drivers) ? drivers : []).map((driver) => (
                          <SelectItem key={driver._id} value={driver._id}>
                            {driver.name} - {driver.vehicle_type} ({driver.vehicle_number})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="invoice_id">Invoice ID</Label>
                    <Input
                      id="invoice_id"
                      value={formData.invoice_id}
                      onChange={(e) => setFormData(prev => ({ ...prev, invoice_id: e.target.value }))}
                      placeholder="INV-000001"
                    />
                  </div>
                  <div>
                    <Label htmlFor="client_id">Client ID</Label>
                    <Input
                      id="client_id"
                      value={formData.client_id}
                      onChange={(e) => setFormData(prev => ({ ...prev, client_id: e.target.value }))}
                      placeholder="CLI-000001"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="amount">Amount</Label>
                    <Input
                      id="amount"
                      type="number"
                      step="0.01"
                      value={formData.amount}
                      onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <Label htmlFor="delivery_type">Delivery Type</Label>
                    <Select value={formData.delivery_type} onValueChange={(value) => setFormData(prev => ({ ...prev, delivery_type: value }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="COD">COD</SelectItem>
                        <SelectItem value="PREPAID">Prepaid</SelectItem>
                        <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                        <SelectItem value="WAREHOUSE_PICKUP">Warehouse Pickup</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="delivery_address">Delivery Address</Label>
                  <Textarea
                    id="delivery_address"
                    value={formData.delivery_address}
                    onChange={(e) => setFormData(prev => ({ ...prev, delivery_address: e.target.value }))}
                    placeholder="Full delivery address"
                    rows={3}
                  />
                </div>

                <div>
                  <Label htmlFor="delivery_instructions">Delivery Instructions</Label>
                  <Textarea
                    id="delivery_instructions"
                    value={formData.delivery_instructions}
                    onChange={(e) => setFormData(prev => ({ ...prev, delivery_instructions: e.target.value }))}
                    placeholder="Special delivery instructions"
                    rows={2}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateAssignment}>
                    Create Assignment
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Assignments</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Assignment ID</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Receiver</TableHead>
                <TableHead>Receiver Phone</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Payment Method</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>QR Code</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(Array.isArray(assignments) ? assignments : []).map((assignment) => (
                <TableRow key={assignment._id}>
                  <TableCell className="font-mono text-xs">{assignment.assignment_id}</TableCell>
                  <TableCell>
                    {assignment.driver_id ? (
                      <div>
                        <p className="font-medium">{assignment.driver_id.name}</p>
                        <p className="text-sm text-gray-500">{assignment.driver_id.phone}</p>
                      </div>
                    ) : (
                      <p className="text-gray-400 text-sm">No driver assigned</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="text-sm font-medium text-gray-700">{assignment.client_id?.company_name || 'N/A'}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{assignment.receiver_name || assignment.request_id?.receiver?.name || 'N/A'}</p>
                  </TableCell>
                  <TableCell>{assignment.receiver_phone || assignment.request_id?.receiver?.phone || 'N/A'}</TableCell>
                  <TableCell className="font-medium">{formatCurrency(assignment.amount)}</TableCell>
                  <TableCell>
                    <Select
                      value={assignment.payment_method || 'NOT_DEFINED_YET'}
                      onValueChange={async (value) => {
                        try {
                          const result = await apiClient.updateDeliveryAssignment(assignment._id, {
                            payment_method: value === 'NOT_DEFINED_YET' ? undefined : value
                          });
                          if (result.success) {
                            toast({
                              title: 'Success',
                              description: 'Payment method updated successfully',
                            });
                            fetchAssignments();
                          } else {
                            toast({
                              variant: 'destructive',
                              title: 'Error',
                              description: result.error || 'Failed to update payment method',
                            });
                          }
                        } catch (error) {
                          toast({
                            variant: 'destructive',
                            title: 'Error',
                            description: 'Failed to update payment method',
                          });
                        }
                      }}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NOT_DEFINED_YET">Not Defined Yet</SelectItem>
                        <SelectItem value="TABBY">Tabby</SelectItem>
                        <SelectItem value="COD">COD</SelectItem>
                        <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  {(() => {
                    const normalizedStatus = normalizeStatus(assignment.status);
                    return (
                      <TableCell>
                        <Badge className={`${getStatusColor(normalizedStatus)} text-white`}>
                          {getStatusLabel(normalizedStatus)}
                        </Badge>
                      </TableCell>
                    );
                  })()}
                  <TableCell>
                    <Select
                      value={assignment.payment_collected ? 'collected' : 'pending'}
                      onValueChange={async (value) => {
                        const collected = value === 'collected';
                        try {
                          const result = await apiClient.updateDeliveryAssignment(assignment._id, {
                            payment_collected: collected,
                          });
                          if (result.success) {
                            toast({
                              title: 'Success',
                              description: collected ? 'Marked as Collected' : 'Marked as Pending',
                            });
                            fetchAssignments();
                          } else {
                            toast({
                              variant: 'destructive',
                              title: 'Error',
                              description: result.error || 'Failed to update payment status',
                            });
                          }
                        } catch (error) {
                          secureLog.error('Error updating payment status', error);
                          toast({
                            variant: 'destructive',
                            title: 'Error',
                            description: 'Failed to update payment status',
                          });
                        }
                      }}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">
                          <span className="flex items-center gap-2">
                            <XCircle className="h-4 w-4 text-red-500 shrink-0" aria-hidden />
                            Pending
                          </span>
                        </SelectItem>
                        <SelectItem value="collected">
                          <span className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-500 shrink-0" aria-hidden />
                            Collected
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyQRUrl(assignment.qr_url)}
                      >
                        <QrCode className="h-4 w-4" />
                      </Button>
                      <span className="text-xs text-gray-500">
                        {assignment.qr_used ? 'Used' : 'Active'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedAssignment(assignment);
                          setShowDetailsDialog(true);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {(() => {
                        const normalizedStatus = normalizeStatus(assignment.status);
                        return (
                          <Select
                            value={normalizedStatus}
                            onValueChange={(value) => handleStatusUpdate(assignment._id, value)}
                          >
                            <SelectTrigger className="w-36">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="NOT_DELIVERED">Not Delivered</SelectItem>
                              <SelectItem value="DELIVERED">Delivered</SelectItem>
                              <SelectItem value="CANCELLED">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                        );
                      })()}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(!Array.isArray(assignments) || assignments.length === 0) && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center">No delivery assignments found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Assignment Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Assignment Details</DialogTitle>
          </DialogHeader>
          {selectedAssignment && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold mb-3">Assignment Information</h3>
                  <div className="space-y-2">
                    <div>
                      <Label className="text-sm text-gray-500">Assignment ID</Label>
                      <p className="font-mono text-sm">{selectedAssignment.assignment_id}</p>
                    </div>
                    <div>
                      <Label className="text-sm text-gray-500">Request ID</Label>
                      <p className="font-mono text-sm">{selectedAssignment.request_id?.request_id || 'N/A'}</p>
                    </div>
                    <div>
                      <Label className="text-sm text-gray-500">Invoice ID</Label>
                      <p className="font-mono text-sm">{selectedAssignment.invoice_id?.invoice_id || 'N/A'}</p>
                    </div>
                    <div>
                      <Label className="text-sm text-gray-500">Amount</Label>
                      <p className="font-semibold">{formatCurrency(selectedAssignment.amount)}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-3">Driver Information</h3>
                  <div className="space-y-2">
                    {selectedAssignment.driver_id ? (
                      <>
                        <div>
                          <Label className="text-sm text-gray-500">Driver Name</Label>
                          <p className="font-medium">{selectedAssignment.driver_id.name}</p>
                        </div>
                        <div>
                          <Label className="text-sm text-gray-500">Phone</Label>
                          <p className="text-sm">{selectedAssignment.driver_id.phone}</p>
                        </div>
                        <div>
                          <Label className="text-sm text-gray-500">Vehicle</Label>
                          <p className="text-sm">
                            {selectedAssignment.driver_id.vehicle_type} - {selectedAssignment.driver_id.vehicle_number}
                          </p>
                        </div>
                      </>
                    ) : (
                      <p className="text-gray-400 text-sm">No driver assigned</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold mb-3">Customer Information</h3>
                  <div className="space-y-2">
                    <div>
                      <Label className="text-sm text-gray-500">Customer Name</Label>
                      <p className="font-medium">{selectedAssignment.request_id?.customer?.name || selectedAssignment.client_id?.contact_name || 'N/A'}</p>
                    </div>
                    <div>
                      <Label className="text-sm text-gray-500">Company</Label>
                      <p className="text-sm">{selectedAssignment.client_id?.company_name || 'N/A'}</p>
                    </div>
                    <div>
                      <Label className="text-sm text-gray-500">Delivery Address</Label>
                      <p className="text-sm">{selectedAssignment.delivery_address || 'N/A'}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-3">Payment Information</h3>
                  <div className="space-y-2">
                    <div>
                      <Label className="text-sm text-gray-500">Payment Status</Label>
                      <div className="flex items-center gap-2">
                        {selectedAssignment.payment_collected ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                        <span className="text-sm">
                          {selectedAssignment.payment_collected ? 'Collected' : 'Pending'}
                        </span>
                      </div>
                    </div>
                    {selectedAssignment.payment_method && (
                      <div>
                        <Label className="text-sm text-gray-500">Payment Method</Label>
                        <p className="text-sm">{selectedAssignment.payment_method}</p>
                      </div>
                    )}
                    {selectedAssignment.payment_reference && (
                      <div>
                        <Label className="text-sm text-gray-500">Reference</Label>
                        <p className="text-sm">{selectedAssignment.payment_reference}</p>
                      </div>
                    )}
                    <div>
                      <Label className="text-sm text-gray-500">QR Code Status</Label>
                      <div className="flex items-center gap-2">
                        {selectedAssignment.qr_used ? (
                          <XCircle className="h-4 w-4 text-red-500" />
                        ) : (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        )}
                        <span className="text-sm">
                          {selectedAssignment.qr_used ? 'Used' : 'Active'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold mb-2">QR Payment URL</h3>
                <div className="flex items-center gap-2">
                  <Input
                    value={selectedAssignment.qr_url}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyQRUrl(selectedAssignment.qr_url)}
                  >
                    Copy
                  </Button>
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  Expires: {new Date(selectedAssignment.qr_expires_at).toLocaleString()}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
  </div>
  );
}
