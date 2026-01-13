'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { Package, Truck, Plane, MapPin, CheckCircle, Search, Layers, Hash, Filter } from 'lucide-react';
import { createPortal } from 'react-dom';

// Helper function to normalize service code
const normalizeServiceCode = (code?: string | null) =>
  (code || '')
    .toString()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');

// Helper function to check if service is PH to UAE
const isPhToUaeService = (code?: string | null) => {
  const normalized = normalizeServiceCode(code);
  return normalized === 'PH_TO_UAE' || normalized.startsWith('PH_TO_UAE_');
};

// Get shipment statuses based on service code
const getShipmentStatuses = (serviceCode?: string | null) => {
  const isPhToUae = isPhToUaeService(serviceCode);
  
  return [
    { value: 'SHIPMENT_RECEIVED', label: 'Shipment Received', icon: Package, color: 'default' },
    { value: 'SHIPMENT_PROCESSING', label: 'Shipment Processing', icon: Package, color: 'default' },
    { 
      value: 'DEPARTED_FROM_MANILA', 
      label: isPhToUae ? 'Departed from Manila' : 'Departed from UAE', 
      icon: Plane, 
      color: 'default' 
    },
    { 
      value: 'IN_TRANSIT_TO_DUBAI', 
      label: isPhToUae ? 'In Transit going to Dubai Airport' : 'In Transit going to Manila Airport', 
      icon: Truck, 
      color: 'default' 
    },
    { 
      value: 'ARRIVED_AT_DUBAI', 
      label: isPhToUae ? 'Arrived at Dubai Airport' : 'Arrived at Manila Airport', 
      icon: MapPin, 
      color: 'default' 
    },
    { value: 'SHIPMENT_CLEARANCE', label: 'Shipment Clearance', icon: CheckCircle, color: 'default' },
    { value: 'OUT_FOR_DELIVERY', label: 'Out for Delivery', icon: Truck, color: 'default' },
    { value: 'DELIVERED', label: 'Delivered', icon: CheckCircle, color: 'success' },
  ];
};

interface Booking {
  _id: string;
  awb?: string;
  tracking_code?: string;
  awb_number?: string;
  customer_name?: string;
  receiver_name?: string;
  origin_place?: string;
  destination_place?: string;
  shipment_status?: string;
  batch_no?: string; // Legacy field, will be replaced by invoice.batch_number
  invoice_id?: string;
  invoice_number?: string;
  invoice?: {
    batch_number?: string; // Batch number from invoices collection
  };
  service_code?: string;
  service?: string;
  createdAt?: string;
  updatedAt?: string;
  sender?: {
    completeAddress?: string;
    country?: string;
  };
  receiver?: {
    completeAddress?: string;
    country?: string;
  };
  request_id?: {
    service_code?: string;
    service?: string;
  };
  booking?: {
    service_code?: string;
    service?: string;
  };
}

export default function ReviewRequestsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [awbSearch, setAwbSearch] = useState('');
  const [showAwbSuggestions, setShowAwbSuggestions] = useState(false);
  const [selectedBookings, setSelectedBookings] = useState<Set<string>>(new Set());
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [statusNotes, setStatusNotes] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const awbInputRef = useRef<HTMLInputElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const { toast } = useToast();
  const { userProfile } = useAuth();

  // Fetch bookings with verified invoices
  // Optimized to only fetch required fields for display
  const fetchBookings = useCallback(async () => {
    try {
      setLoading(true);
      // Request only the fields needed for display to reduce payload size
      const result = await apiClient.getBookingsWithVerifiedInvoices(false);
      if (result.success && result.data) {
        const bookingData = Array.isArray(result.data) ? result.data : [];
        // Minimal processing: only set default shipment_status if missing
        // Avoid deep cloning or unnecessary transformations
        const bookingsWithDefaults = bookingData.map(booking => {
          // Only create new object if shipment_status is missing to avoid unnecessary object creation
          if (!booking.shipment_status) {
            return { ...booking, shipment_status: 'SHIPMENT_RECEIVED' };
          }
          return booking; // Return original object if no changes needed
        });
        setBookings(bookingsWithDefaults);
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.error || 'Failed to fetch bookings',
        });
      }
    } catch (error) {
      console.error('Error fetching bookings:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to fetch bookings',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  // Helper function to extract AWB number from booking
  // Optimized to check most common fields first and avoid unnecessary property access
  const getAwbNumber = useCallback((booking: Booking): string => {
    // Check direct fields first (most common case)
    let awb = booking.awb || booking.tracking_code || booking.awb_number || '';
    
    // Only check nested objects if direct fields are empty
    if (!awb) {
      const requestId = (booking as any).request_id;
      if (requestId) {
        awb = requestId.awb || requestId.tracking_code || requestId.awb_number || '';
      }
    }
    
    // Only check booking nested object if still empty
    if (!awb) {
      const nestedBooking = (booking as any).booking;
      if (nestedBooking) {
        awb = nestedBooking.awb || nestedBooking.tracking_code || nestedBooking.awb_number || '';
      }
    }
    
    awb = awb.trim();
    
    // Don't return _id as AWB - only return if it's actually an AWB format
    if (awb && awb !== booking._id?.toString() && (awb.length > 10 || /^[A-Z0-9]+$/i.test(awb))) {
      return awb;
    }
    
    return '';
  }, []);

  // Get unique AWB numbers from bookings for autocomplete
  const availableAwbNumbers = useMemo(() => {
    return Array.from(
      new Set(
        bookings
          .map(getAwbNumber)
          .filter(awb => awb.length > 0)
      )
    ).sort();
  }, [bookings, getAwbNumber]);

  // Get unique batch numbers with counts
  const batchNumbersWithCounts = useMemo(() => {
    const batchMap = new Map<string, { count: number; bookingIds: string[] }>();
    
    bookings.forEach(booking => {
      const batchNumber = booking.invoice?.batch_number || booking.batch_no;
      if (batchNumber) {
        if (!batchMap.has(batchNumber)) {
          batchMap.set(batchNumber, { count: 0, bookingIds: [] });
        }
        const batchInfo = batchMap.get(batchNumber)!;
        batchInfo.count++;
        batchInfo.bookingIds.push(booking._id);
      }
    });
    
    // Convert to array and sort by batch number
    return Array.from(batchMap.entries())
      .map(([batchNumber, info]) => ({
        batchNumber,
        count: info.count,
        bookingIds: info.bookingIds
      }))
      .sort((a, b) => a.batchNumber.localeCompare(b.batchNumber));
  }, [bookings]);

  // Filter AWB suggestions based on search input
  const awbSuggestions = useMemo(() => {
    return awbSearch.trim().length > 0
      ? availableAwbNumbers.filter(awb => 
          awb.toLowerCase().includes(awbSearch.toLowerCase().trim())
        ).slice(0, 10)
      : [];
  }, [awbSearch, availableAwbNumbers]);

  // Filter bookings based on AWB search
  const filteredBookings = useMemo(() => {
    if (!awbSearch.trim()) {
      return bookings;
    }
    const searchLower = awbSearch.toLowerCase().trim();
    return bookings.filter(booking => 
      getAwbNumber(booking).toLowerCase().includes(searchLower)
    );
  }, [bookings, awbSearch, getAwbNumber]);

  // Toggle booking selection
  const toggleBookingSelection = (bookingId: string) => {
    setSelectedBookings(prev => {
      const newSet = new Set(prev);
      if (newSet.has(bookingId)) {
        newSet.delete(bookingId);
      } else {
        newSet.add(bookingId);
      }
      return newSet;
    });
  };

  // Toggle all bookings selection
  const toggleAllBookings = () => {
    if (selectedBookings.size === filteredBookings.length) {
      setSelectedBookings(new Set());
    } else {
      setSelectedBookings(new Set(filteredBookings.map(b => b._id)));
    }
  };

  // Select all bookings with a specific batch number
  const selectBatchBookings = (batchNumber: string) => {
    const batchInfo = batchNumbersWithCounts.find(b => b.batchNumber === batchNumber);
    if (batchInfo) {
      setSelectedBookings(prev => {
        const newSet = new Set(prev);
        // Toggle: if all are selected, deselect; otherwise, select all
        const allSelected = batchInfo.bookingIds.every(id => newSet.has(id));
        if (allSelected) {
          batchInfo.bookingIds.forEach(id => newSet.delete(id));
        } else {
          batchInfo.bookingIds.forEach(id => newSet.add(id));
        }
        return newSet;
      });
    }
  };

  // Get service code from booking
  // Optimized to check most common fields first
  const getServiceCode = useCallback((booking: Booking): string | null => {
    // Check direct fields first (most common case)
    const serviceCode = booking.service_code || booking.service;
    if (serviceCode) return serviceCode;
    
    // Only check nested objects if direct fields are empty
    const requestId = booking.request_id;
    if (requestId) {
      const requestService = requestId.service_code || requestId.service;
      if (requestService) return requestService;
    }
    
    // Only check booking nested object if still empty
    const nestedBooking = booking.booking;
    if (nestedBooking) {
      const bookingService = nestedBooking.service_code || nestedBooking.service;
      if (bookingService) return bookingService;
    }
    
    return null;
  }, []);

  // Get status badge with dynamic labels based on service
  const getStatusBadge = (booking: Booking) => {
    // Default to SHIPMENT_RECEIVED if status is missing
    const status = booking.shipment_status || 'SHIPMENT_RECEIVED';
    const serviceCode = getServiceCode(booking);
    const statuses = getShipmentStatuses(serviceCode);
    const statusConfig = statuses.find(s => s.value === status);
    if (!statusConfig) {
      return <Badge variant="outline">{status}</Badge>;
    }
    const Icon = statusConfig.icon;
    return (
      <Badge variant={statusConfig.color as any} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {statusConfig.label}
      </Badge>
    );
  };

  // Handle single booking status update
  const handleStatusUpdate = async (bookingId: string, status: string) => {
    try {
      setIsUpdating(true);
      const result = await apiClient.updateBookingShipmentStatus(bookingId, {
        shipment_status: status,
        updated_by: userProfile?.employee_id || userProfile?.email || 'unknown',
        notes: statusNotes,
      });

      if (result.success) {
        toast({
          title: 'Success',
          description: 'Shipment status updated successfully',
        });
        setShowStatusDialog(false);
        setSelectedStatus('');
        setStatusNotes('');
        await fetchBookings();
      } else {
        throw new Error(result.error || 'Failed to update status');
      }
    } catch (error) {
      console.error('Error updating status:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update status',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle batch status update
  const handleBatchStatusUpdate = async () => {
    if (selectedBookings.size === 0) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Please select at least one booking',
      });
      return;
    }

    if (!selectedStatus) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Please select a status',
      });
      return;
    }

    try {
      setIsUpdating(true);
      const bookingIds = Array.from(selectedBookings);
      const result = await apiClient.batchUpdateShipmentStatus(bookingIds, {
        shipment_status: selectedStatus,
        updated_by: userProfile?.employee_id || userProfile?.email || 'unknown',
        notes: statusNotes,
      });

      if (result.success) {
        toast({
          title: 'Success',
          description: `Status updated for ${bookingIds.length} booking(s)`,
        });
        setShowStatusDialog(false);
        setSelectedStatus('');
        setStatusNotes('');
        setSelectedBookings(new Set());
        await fetchBookings();
      } else {
        throw new Error(result.error || 'Failed to update status');
      }
    } catch (error) {
      console.error('Error updating batch status:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update status',
      });
    } finally {
      setIsUpdating(false);
    }
  };


  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Cargo Status Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 mb-4">
            {/* Search and Actions Bar */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="relative">
                <Label htmlFor="awb-search">Search by AWB Number</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    ref={awbInputRef}
                    id="awb-search"
                    type="text"
                    placeholder="Enter AWB number..."
                    value={awbSearch}
                    className="pl-9"
                    onChange={(e) => {
                      setAwbSearch(e.target.value);
                      setShowAwbSuggestions(true);
                      if (awbInputRef.current) {
                        const rect = awbInputRef.current.getBoundingClientRect();
                        setDropdownPosition({
                          top: rect.bottom + window.scrollY + 4,
                          left: rect.left + window.scrollX,
                          width: rect.width,
                        });
                      }
                    }}
                    onFocus={() => {
                      setShowAwbSuggestions(true);
                      if (awbInputRef.current) {
                        const rect = awbInputRef.current.getBoundingClientRect();
                        setDropdownPosition({
                          top: rect.bottom + window.scrollY + 4,
                          left: rect.left + window.scrollX,
                          width: rect.width,
                        });
                      }
                    }}
                    onBlur={() => {
                      setTimeout(() => setShowAwbSuggestions(false), 200);
                    }}
                  />
                </div>
              </div>

              <div className="flex items-end gap-2">
                <Button
                  variant="default"
                  onClick={() => setShowStatusDialog(true)}
                  disabled={selectedBookings.size === 0}
                  className="flex items-center gap-2"
                >
                  <Truck className="h-4 w-4" />
                  Update Status ({selectedBookings.size})
                </Button>
              </div>
            </div>

            {/* AWB Suggestions Dropdown */}
            {typeof window !== 'undefined' && showAwbSuggestions && awbSuggestions.length > 0 && createPortal(
              <div
                className="fixed z-[9999] max-h-60 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
                style={{
                  top: `${dropdownPosition.top}px`,
                  left: `${dropdownPosition.left}px`,
                  width: `${dropdownPosition.width}px`,
                }}
                onMouseDown={(e) => e.preventDefault()}
              >
                <div className="p-1 max-h-60 overflow-auto">
                  {awbSuggestions.map((awb, index) => (
                    <div
                      key={index}
                      className="relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 px-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setAwbSearch(awb);
                        setShowAwbSuggestions(false);
                      }}
                    >
                      {awb}
                    </div>
                  ))}
                </div>
              </div>,
              document.body
            )}

            {/* Batch Number Selection */}
            {batchNumbersWithCounts.length > 0 && (
              <div className="rounded-md border p-4 bg-muted/30">
                <div className="flex items-center gap-2 mb-3">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-semibold">Select by Batch Number</Label>
                </div>
                <div className="flex flex-wrap gap-2">
                  {batchNumbersWithCounts.map(({ batchNumber, count, bookingIds }) => {
                    const allSelected = bookingIds.every(id => selectedBookings.has(id));
                    const someSelected = bookingIds.some(id => selectedBookings.has(id));
                    return (
                      <Button
                        key={batchNumber}
                        variant={allSelected ? "default" : someSelected ? "secondary" : "outline"}
                        size="sm"
                        onClick={() => selectBatchBookings(batchNumber)}
                        className="flex items-center gap-2"
                      >
                        <Layers className="h-3 w-3" />
                        <span>{batchNumber}</span>
                        <Badge variant="outline" className="ml-1">
                          {count}
                        </Badge>
                        {allSelected && (
                          <CheckCircle className="h-3 w-3" />
                        )}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Selected Count */}
            {selectedBookings.size > 0 && (
              <div className="flex items-center justify-between p-2 bg-muted rounded-md">
                <span className="text-sm font-medium">
                  {selectedBookings.size} booking(s) selected
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedBookings(new Set())}
                >
                  Clear Selection
                </Button>
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-muted-foreground">Loading bookings...</p>
            </div>
          ) : filteredBookings.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-muted-foreground">No bookings found</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedBookings.size === filteredBookings.length && filteredBookings.length > 0}
                        onCheckedChange={toggleAllBookings}
                      />
                    </TableHead>
                    <TableHead>AWB Number</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Receiver</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead>Batch No</TableHead>
                    <TableHead>Shipment Status</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBookings.map((booking) => {
                    const awbNumber = getAwbNumber(booking);
                    const isSelected = selectedBookings.has(booking._id);
                    
                    return (
                      <TableRow key={booking._id}>
                        <TableCell>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleBookingSelection(booking._id)}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          <div className="flex items-center gap-1.5">
                            <Hash className="h-3 w-3 text-muted-foreground" />
                            <span className="font-semibold">{awbNumber || 'N/A'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          {booking.customer_name || 'N/A'}
                        </TableCell>
                        <TableCell>
                          {booking.receiver_name || 'N/A'}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-2 min-w-[280px] max-w-[350px]">
                            {/* Origin */}
                            <div className="flex items-start gap-2">
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <div className="h-2 w-2 rounded-full bg-green-500" />
                                <MapPin className="h-3 w-3 text-green-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-green-700 mb-0.5">Origin</p>
                                <p 
                                  className="text-xs text-foreground truncate" 
                                  title={booking.sender?.completeAddress || booking.origin_place || 'N/A'}
                                >
                                  {booking.sender?.completeAddress || booking.origin_place || 'N/A'}
                                </p>
                                {booking.sender?.country && (
                                  <p className="text-xs text-muted-foreground">{booking.sender.country}</p>
                                )}
                              </div>
                            </div>
                            
                            {/* Arrow */}
                            <div className="flex items-center gap-2 pl-4">
                              <div className="h-px flex-1 bg-border" />
                              <Truck className="h-3 w-3 text-muted-foreground" />
                              <div className="h-px flex-1 bg-border" />
                            </div>
                            
                            {/* Destination */}
                            <div className="flex items-start gap-2">
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <div className="h-2 w-2 rounded-full bg-orange-500" />
                                <MapPin className="h-3 w-3 text-orange-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-orange-700 mb-0.5">Destination</p>
                                <p 
                                  className="text-xs text-foreground truncate" 
                                  title={booking.receiver?.completeAddress || booking.destination_place || 'N/A'}
                                >
                                  {booking.receiver?.completeAddress || booking.destination_place || 'N/A'}
                                </p>
                                {booking.receiver?.country && (
                                  <p className="text-xs text-muted-foreground">{booking.receiver.country}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {/* Batch number fetched from invoices collection */}
                          {(() => {
                            const batchNumber = booking.invoice?.batch_number || booking.batch_no;
                            return batchNumber ? (
                              <Badge variant="outline" className="flex items-center gap-1">
                                <Layers className="h-3 w-3" />
                                {batchNumber}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(booking)}
                        </TableCell>
                        <TableCell>
                          {booking.invoice_number ? (
                            <Badge variant="default" className="bg-green-100 text-green-800">
                              {booking.invoice_number}
                            </Badge>
                          ) : (
                            <Badge variant="secondary">N/A</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedBookings(new Set([booking._id]));
                              setSelectedStatus(booking.shipment_status || 'SHIPMENT_RECEIVED');
                              setShowStatusDialog(true);
                            }}
                          >
                            Update Status
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status Update Dialog */}
      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Update Shipment Status</DialogTitle>
            <DialogDescription>
              {selectedBookings.size > 1
                ? `Update status for ${selectedBookings.size} selected bookings`
                : 'Update the shipment status for this booking'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="status-select">Shipment Status *</Label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger id="status-select">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    // Get service code from first selected booking for dynamic labels
                    const firstSelectedBooking = filteredBookings.find(b => selectedBookings.has(b._id));
                    const serviceCode = firstSelectedBooking ? getServiceCode(firstSelectedBooking) : null;
                    const statuses = getShipmentStatuses(serviceCode);
                    
                    return statuses.map((status) => {
                      const Icon = status.icon;
                      return (
                        <SelectItem key={status.value} value={status.value}>
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4" />
                            {status.label}
                          </div>
                        </SelectItem>
                      );
                    });
                  })()}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="status-notes">Notes (Optional)</Label>
              <Textarea
                id="status-notes"
                placeholder="Add any additional notes..."
                value={statusNotes}
                onChange={(e) => setStatusNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowStatusDialog(false);
              setSelectedStatus('');
              setStatusNotes('');
            }}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!selectedStatus) {
                  toast({
                    variant: 'destructive',
                    title: 'Error',
                    description: 'Please select a status',
                  });
                  return;
                }

                // Determine which endpoint to call based on selection count
                if (selectedBookings.size === 1) {
                  // Single booking: Call PUT /api/bookings/:id/shipment-status
                  const bookingId = Array.from(selectedBookings)[0];
                  if (bookingId) {
                    await handleStatusUpdate(bookingId, selectedStatus);
                  }
                } else if (selectedBookings.size > 1) {
                  // Multiple bookings: Call PUT /api/bookings/batch/shipment-status
                  await handleBatchStatusUpdate();
                } else {
                  toast({
                    variant: 'destructive',
                    title: 'Error',
                    description: 'Please select at least one booking',
                  });
                }
              }}
              disabled={!selectedStatus || isUpdating || selectedBookings.size === 0}
            >
              {isUpdating ? 'Updating...' : 'Update Status'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
