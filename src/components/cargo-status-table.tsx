'use client';

import { useState, useEffect } from 'react';
import { secureLog } from '@/lib/secure-logger';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Package, 
  Truck, 
  Warehouse, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  Eye,
  FileText,
  MapPin
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api-client';

interface CargoStatus {
  _id: string;
  customer_name: string;
  receiver_name: string;
  origin_place: string;
  destination_place: string;
  shipment_type: string;
  weight?: number;
  delivery_status: 'PENDING' | 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED';
  status: 'DRAFT' | 'SUBMITTED' | 'IN_PROGRESS' | 'VERIFIED' | 'COMPLETED' | 'CANCELLED';
  invoice_generated_at?: string;
  invoice_amount?: number;
  createdAt: string;
  updatedAt: string;
}

const statusOptions = [
  { value: 'PENDING', label: 'Pending', icon: Clock, color: 'secondary' },
  { value: 'PICKED_UP', label: 'Picked Up', icon: Package, color: 'primary' },
  { value: 'IN_TRANSIT', label: 'In Transit', icon: Truck, color: 'warning' },
  { value: 'DELIVERED', label: 'Delivered', icon: CheckCircle, color: 'success' },
  { value: 'FAILED', label: 'Failed', icon: AlertCircle, color: 'destructive' },
];

const deliveryStatusOptions = [
  { value: 'PENDING', label: 'Pending', icon: Clock, color: 'secondary' },
  { value: 'PICKED_UP', label: 'Picked Up', icon: Package, color: 'default' },
  { value: 'IN_TRANSIT', label: 'In Transit', icon: Truck, color: 'warning' },
  { value: 'DELIVERED', label: 'Delivered', icon: CheckCircle, color: 'success' },
  { value: 'FAILED', label: 'Failed', icon: AlertCircle, color: 'destructive' },
];

export default function CargoStatusTable() {
  const [cargoList, setCargoList] = useState<CargoStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCargo, setSelectedCargo] = useState<CargoStatus | null>(null);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [newDeliveryStatus, setNewDeliveryStatus] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchCargoList();
  }, []);

  const fetchCargoList = async () => {
    try {
      setLoading(true);
      secureLog.debug('Fetching cargo list');
      
      const response = await apiClient.getInvoiceRequestsByStatus('VERIFIED');
      if (response.success && response.data) {
        secureLog.debug('Cargo list received', { count: Array.isArray(response.data) ? response.data.length : 0 });
        setCargoList(response.data as CargoStatus[]);
      } else {
        secureLog.debug('Failed to fetch cargo list', { success: response.success });
      }
    } catch (error) {
      secureLog.error('Error fetching cargo list', error);
      toast({
        title: "Error",
        description: "Failed to fetch cargo list",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = statusOptions.find(s => s.value === status);
    if (!statusConfig) return null;

    const Icon = statusConfig.icon;
    
    return (
      <Badge variant={statusConfig.color as any} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {statusConfig.label}
      </Badge>
    );
  };

  const getDeliveryStatusBadge = (status: string) => {
    const statusConfig = deliveryStatusOptions.find(s => s.value === status);
    if (!statusConfig) return null;

    const Icon = statusConfig.icon;
    
    return (
      <Badge variant={statusConfig.color as any} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {statusConfig.label}
      </Badge>
    );
  };

  const handleStatusChange = (cargo: CargoStatus) => {
    setSelectedCargo(cargo);
    setNewStatus(cargo.delivery_status);
    setNewDeliveryStatus(cargo.delivery_status);
    setNotes('');
    setStatusDialogOpen(true);
  };

  const handleViewInvoice = (cargo: CargoStatus) => {
    setSelectedCargo(cargo);
    setInvoiceDialogOpen(true);
  };

  const updateCargoStatus = async () => {
    if (!selectedCargo || !newStatus) return;

    try {
      secureLog.debug('Updating cargo status', {
        id: selectedCargo._id,
        delivery_status: newDeliveryStatus,
        notes: notes
      });

      const response = await apiClient.updateDeliveryStatus(selectedCargo._id, {
        delivery_status: newDeliveryStatus,
        notes: notes
      });

      if (response.success) {
        secureLog.debug('Status updated successfully', response.data);
        
        toast({
          title: "Status Updated",
          description: `Cargo status updated to ${newDeliveryStatus} successfully`,
        });

        setStatusDialogOpen(false);
        setSelectedCargo(null);
        setNewStatus('');
        setNewDeliveryStatus('');
        setNotes('');
        
        // Refresh the cargo list to show updated data
        await fetchCargoList();
      } else {
        throw new Error(response.error || 'Failed to update status');
      }
    } catch (error) {
      secureLog.error('Error updating cargo status', error);
      toast({
        title: "Error",
        description: `Failed to update cargo status: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading cargo status...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Cargo Status Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Receiver</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Weight</TableHead>
                <TableHead>Delivery Status</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cargoList.map((cargo) => (
                <TableRow key={cargo._id}>
                  <TableCell className="font-medium">{cargo.customer_name}</TableCell>
                  <TableCell>{cargo.receiver_name}</TableCell>
                  <TableCell className="flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs">
                      {cargo.origin_place} → {cargo.destination_place}
                    </span>
                  </TableCell>
                  <TableCell>
                    {cargo.weight ? `${cargo.weight}kg` : 'N/A'}
                  </TableCell>
                  <TableCell>{getDeliveryStatusBadge(cargo.delivery_status)}</TableCell>
                  <TableCell>
                    {cargo.invoice_generated_at ? (
                      <div className="flex items-center gap-2">
                        <Badge variant="default" className="flex items-center gap-1 bg-green-100 text-green-800 hover:bg-green-100">
                          <FileText className="h-3 w-3" />
                          Generated
                        </Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewInvoice(cargo)}
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          View
                        </Button>
                      </div>
                    ) : (
                      <Badge variant="secondary">Pending</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleStatusChange(cargo)}
                    >
                      Update Status
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {cargoList.length === 0 && !loading && (
            <div className="text-center py-8 text-muted-foreground">
              <div className="flex flex-col items-center space-y-2">
                <Package className="h-8 w-8 text-muted-foreground" />
                <p className="text-muted-foreground">No verified cargo requests right now</p>
                <p className="text-sm text-muted-foreground">
                  Verified invoice requests will appear here for status tracking
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status Update Dialog */}
      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Cargo Status</DialogTitle>
            <DialogDescription>
              Update the delivery status for {selectedCargo?.customer_name}'s cargo
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="delivery-status">Delivery Status</Label>
              <Select value={newDeliveryStatus} onValueChange={setNewDeliveryStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Select delivery status" />
                </SelectTrigger>
                <SelectContent>
                  {deliveryStatusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex items-center gap-2">
                        <option.icon className="h-4 w-4" />
                        {option.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                placeholder="Add any additional notes about the status update..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={updateCargoStatus}>
              Update Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice View Dialog */}
      <Dialog open={invoiceDialogOpen} onOpenChange={setInvoiceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invoice Details</DialogTitle>
            <DialogDescription>
              Invoice information for {selectedCargo?.customer_name}'s cargo
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {selectedCargo && (
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="font-medium">Invoice Amount:</span>
                  <span>${selectedCargo.invoice_amount?.toLocaleString() || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Generated Date:</span>
                  <span>
                    {selectedCargo.invoice_generated_at 
                      ? new Date(selectedCargo.invoice_generated_at).toLocaleDateString()
                      : 'N/A'
                    }
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Customer:</span>
                  <span>{selectedCargo.customer_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Receiver:</span>
                  <span>{selectedCargo.receiver_name}</span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvoiceDialogOpen(false)}>
              Close
            </Button>
            <Button>
              View Full Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
