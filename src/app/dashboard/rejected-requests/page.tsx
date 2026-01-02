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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiClient } from '@/lib/api-client';
import { apiCache } from '@/lib/api-cache';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { XCircle, Printer, Eye, AlertCircle } from 'lucide-react';
import BookingPrintView from '@/components/booking-print-view';

export default function RejectedRequestsPage() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showPrintView, setShowPrintView] = useState(false);
  const [bookingToPrint, setBookingToPrint] = useState<any>(null);
  const { toast } = useToast();
  const { userProfile } = useAuth();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    await Promise.all([
      fetchRejectedBookings(),
      fetchEmployees(),
    ]);
  };

  const fetchEmployees = async () => {
    try {
      const result = await apiClient.getEmployees(true);
      if (result.success) {
        const employeeData = Array.isArray(result.data) ? result.data : [];
        setEmployees(employeeData);
      }
    } catch (error) {
      console.error('Error fetching employees:', error);
    }
  };

  const fetchRejectedBookings = async (useCache: boolean = true) => {
    try {
      // Check cache first for instant display
      const cacheKey = '/bookings/status/rejected';
      const cached = apiCache.get(cacheKey, {});
      
      if (cached && cached.success && cached.data && useCache) {
        // Show cached data immediately
        const bookingData = Array.isArray(cached.data) ? cached.data : [];
        setBookings(bookingData);
        setLoading(false);
      } else {
        setLoading(true);
      }

      const result = await apiClient.getBookingsByStatus('rejected', undefined, useCache);

      if (result.success) {
        const bookingData = Array.isArray(result.data) ? result.data : [];
        setBookings(bookingData);
      } else {
        // Only show error if we don't have cached data
        if (!cached || !cached.success) {
          toast({
            variant: 'destructive',
            title: 'Error',
            description: result.error || 'Failed to fetch rejected bookings',
          });
        }
      }
    } catch (error) {
      console.error('Error fetching rejected bookings:', error);
      const cacheKey = '/bookings/status/rejected';
      const cached = apiCache.get(cacheKey, {});
      if (!cached || !cached.success) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to fetch rejected bookings',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (booking: any) => {
    try {
      setLoading(true);
      // Fetch full booking details with all images from database
      const result = await apiClient.getBookingForReview(booking._id);
      if (result.success && result.data) {
        setSelectedBooking(result.data);
        setShowDetailsModal(true);
      } else {
        // Fallback to using the booking from list if API fails
        toast({
          variant: 'destructive',
          title: 'Warning',
          description: result.error || 'Failed to load full booking details. Showing cached data.',
        });
        setSelectedBooking(booking);
        setShowDetailsModal(true);
      }
    } catch (error) {
      console.error('Error fetching booking details:', error);
      // Fallback to using the booking from list
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load full booking details. Showing cached data.',
      });
      setSelectedBooking(booking);
      setShowDetailsModal(true);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = async (booking: any) => {
    try {
      setLoading(true);
      // Fetch full booking details with all images from database
      const result = await apiClient.getBookingForReview(booking._id);
      if (result.success && result.data) {
        setBookingToPrint(result.data);
        setShowPrintView(true);
      } else {
        // Fallback to using the booking from list if API fails
        toast({
          variant: 'destructive',
          title: 'Warning',
          description: result.error || 'Failed to load full booking details. Showing cached data.',
        });
        setBookingToPrint(booking);
        setShowPrintView(true);
      }
    } catch (error) {
      console.error('Error fetching booking details:', error);
      // Fallback to using the booking from list
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load full booking details. Showing cached data.',
      });
      setBookingToPrint(booking);
      setShowPrintView(true);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    return (
      <Badge variant="destructive" className="flex items-center gap-1">
        <XCircle className="h-3 w-3" />
        Rejected
      </Badge>
    );
  };

  // Helper: get a field by trying multiple aliases (case-insensitive, supports loose matching)
  const getField = (obj: any, aliases: string[]): any => {
    if (!obj || typeof obj !== 'object') return undefined;
    
    // Try exact matches first (all variations)
    for (const alias of aliases) {
      if (obj[alias] !== undefined && obj[alias] !== null && obj[alias] !== '') {
        return obj[alias];
      }
    }
    
    // Try case-insensitive matches
    const objKeys = Object.keys(obj);
    for (const alias of aliases) {
      const lowerAlias = alias.toLowerCase();
      const foundKey = objKeys.find(k => k.toLowerCase() === lowerAlias);
      if (foundKey && obj[foundKey] !== undefined && obj[foundKey] !== null && obj[foundKey] !== '') {
        return obj[foundKey];
      }
    }
    
    // Try partial matches (contains)
    for (const alias of aliases) {
      const parts = alias.toLowerCase().split('_');
      for (const part of parts) {
        const foundKey = objKeys.find(k => k.toLowerCase().includes(part));
        if (foundKey && obj[foundKey] !== undefined && obj[foundKey] !== null && obj[foundKey] !== '') {
          return obj[foundKey];
        }
      }
    }
    
    return undefined;
  };

  // Helper: get agent name from booking
  const getAgentName = (booking: any): string => {
    // Try direct name fields first
    const directName = getField(booking, [
      'agent_name', 'agentName', 'created_by_employee_name', 
      'createdByEmployeeName', 'submitted_by_name', 'submittedByName',
      'employee_name', 'employeeName'
    ]);
    if (directName) return formatValue(directName);

    // Try populated employee object
    const employeeObj = booking.created_by_employee || booking.createdByEmployee || 
                        booking.submitted_by_employee || booking.submittedByEmployee ||
                        booking.employee || booking.created_by || booking.createdBy;
    
    if (employeeObj) {
      if (typeof employeeObj === 'string') {
        // It's an ID, look it up in employees array
        const employee = employees.find(emp => 
          emp._id === employeeObj || emp.id === employeeObj
        );
        if (employee) {
          return formatValue(employee.full_name || employee.fullName || employee.name);
        }
      } else if (typeof employeeObj === 'object') {
        // It's a populated object
        return formatValue(employeeObj.full_name || employeeObj.fullName || employeeObj.name);
      }
    }

    // Try employee ID fields and look up
    const employeeId = booking.created_by || booking.createdBy || 
                       booking.submitted_by || booking.submittedBy ||
                       booking.employee_id || booking.employeeId ||
                       booking.created_by_employee_id || booking.createdByEmployeeId;
    
    if (employeeId) {
      const employee = employees.find(emp => 
        emp._id === employeeId || emp.id === employeeId ||
        String(emp._id) === String(employeeId) || String(emp.id) === String(employeeId)
      );
      if (employee) {
        return formatValue(employee.full_name || employee.fullName || employee.name);
      }
    }

    return 'N/A';
  };

  // Helper: format any value into a safe, readable string for table cells
  const formatValue = (value: any): string => {
    if (value === undefined || value === null) return 'N/A';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (value instanceof Date) return value.toLocaleString();

    // If it's an object, try common readable fields
    if (typeof value === 'object') {
      const obj = value as Record<string, any>;
      // Common person/company fields
      if (obj.fullName) return String(obj.fullName);
      if (obj.name) return String(obj.name);
      if (obj.firstName || obj.lastName) return [obj.firstName, obj.lastName].filter(Boolean).join(' ').trim() || 'N/A';
      if (obj.company || obj.companyName) return String(obj.company || obj.companyName);
      if (obj.email || obj.emailAddress) return String(obj.email || obj.emailAddress);
      if (obj.contactNo || obj.phone || obj.phoneNumber) return String(obj.contactNo || obj.phone || obj.phoneNumber);
      if (obj.completeAddress || obj.address) return String(obj.completeAddress || obj.address);

      // If numbers/strings inside, try to build a compact string
      const primitiveEntries = Object.entries(obj)
        .filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v))
        .slice(0, 3)
        .map(([k, v]) => `${k}: ${v}`);
      if (primitiveEntries.length > 0) return primitiveEntries.join(', ');

      // Fallback to compact JSON
      try {
        const s = JSON.stringify(obj);
        return s.length > 120 ? s.slice(0, 117) + '...' : s;
      } catch {
        return 'Object';
      }
    }

    // Arrays or other types
    try {
      const s = JSON.stringify(value);
      return s.length > 120 ? s.slice(0, 117) + '...' : s;
    } catch {
      return String(value);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              Rejected Requests
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                apiCache.invalidate('/bookings/status/rejected');
                fetchRejectedBookings(false);
              }}
            >
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-muted-foreground">Loading rejected bookings...</p>
            </div>
          ) : bookings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-lg">No rejected bookings found</p>
              <p className="text-sm text-muted-foreground mt-2">
                Rejected booking requests will appear here
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer Name</TableHead>
                    <TableHead>Receiver Name</TableHead>
                    <TableHead>Agent Name</TableHead>
                    <TableHead>Origin</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Shipment Type</TableHead>
                    <TableHead>Rejection Reason</TableHead>
                    <TableHead>Rejected At</TableHead>
                    <TableHead>Created At</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bookings.map((booking) => (
                    <TableRow key={booking._id}>
                      <TableCell className="font-medium">
                        {formatValue(getField(booking, ['customer_name','customerName','name','full_name','sender_name','customer','sender']))}
                      </TableCell>
                      <TableCell>
                        {formatValue(getField(booking, ['receiver_name','receiverName','consignee_name','to_name','receiver','consignee']))}
                      </TableCell>
                      <TableCell>
                        {getAgentName(booking)}
                      </TableCell>
                      <TableCell>
                        {formatValue(
                          getField(booking, ['origin_place','origin','from','pickup_location','pickup_city','pickup'])
                          || booking.sender?.completeAddress
                          || booking.sender?.address
                          || booking.sender?.city
                        )}
                      </TableCell>
                      <TableCell>
                        {formatValue(
                          getField(booking, ['destination_place','destination','to','delivery_location','delivery_city','dropoff','delivery'])
                          || booking.receiver?.completeAddress
                          || booking.receiver?.address
                          || booking.receiver?.city
                        )}
                      </TableCell>
                      <TableCell>
                        {formatValue(getField(booking, ['shipment_type','shipmentType','service_type','service']))}
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[200px]">
                          {booking.reason ? (
                            <p className="text-sm text-muted-foreground truncate" title={booking.reason}>
                              {booking.reason}
                            </p>
                          ) : (
                            <span className="text-sm text-muted-foreground">No reason provided</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {booking.reviewedAt
                          ? new Date(booking.reviewedAt).toLocaleDateString()
                          : booking.updatedAt
                          ? new Date(booking.updatedAt).toLocaleDateString()
                          : booking.updated_at
                          ? new Date(booking.updated_at).toLocaleDateString()
                          : 'N/A'}
                      </TableCell>
                      <TableCell>
                        {booking.submittedAt
                          ? new Date(booking.submittedAt).toLocaleDateString()
                          : booking.createdAt
                          ? new Date(booking.createdAt).toLocaleDateString()
                          : booking.created_at
                          ? new Date(booking.created_at).toLocaleDateString()
                          : 'N/A'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePrint(booking)}
                          >
                            <Printer className="h-4 w-4 mr-2" />
                            Print
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewDetails(booking)}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {showDetailsModal && selectedBooking && (
        <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Booking Details</DialogTitle>
              <DialogDescription>
                View complete details of the rejected booking request
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Customer Name</p>
                  <p className="text-sm">
                    {formatValue(getField(selectedBooking, ['customer_name','customerName','name','full_name','sender_name','customer','sender']))}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Receiver Name</p>
                  <p className="text-sm">
                    {formatValue(getField(selectedBooking, ['receiver_name','receiverName','consignee_name','to_name','receiver','consignee']))}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Agent Name</p>
                  <p className="text-sm">
                    {getAgentName(selectedBooking)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Origin</p>
                  <p className="text-sm">
                    {formatValue(
                      getField(selectedBooking, ['origin_place','origin','from','pickup_location','pickup_city','pickup'])
                      || selectedBooking.sender?.completeAddress
                      || selectedBooking.sender?.address
                      || selectedBooking.sender?.city
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Destination</p>
                  <p className="text-sm">
                    {formatValue(
                      getField(selectedBooking, ['destination_place','destination','to','delivery_location','delivery_city','dropoff','delivery'])
                      || selectedBooking.receiver?.completeAddress
                      || selectedBooking.receiver?.address
                      || selectedBooking.receiver?.city
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Shipment Type</p>
                  <p className="text-sm">
                    {formatValue(getField(selectedBooking, ['shipment_type','shipmentType','service_type','service']))}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Status</p>
                  <div className="mt-1">
                    {getStatusBadge(selectedBooking.review_status || 'rejected')}
                  </div>
                </div>
              </div>
              {selectedBooking.reason && (
                <div className="border-t pt-4">
                  <p className="text-sm font-medium text-muted-foreground mb-2">Rejection Reason</p>
                  <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3">
                    <p className="text-sm text-foreground">{selectedBooking.reason}</p>
                  </div>
                </div>
              )}
              <div className="border-t pt-4">
                <p className="text-sm font-medium text-muted-foreground mb-2">Timeline</p>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Created:</span>
                    <span>
                      {selectedBooking.submittedAt
                        ? new Date(selectedBooking.submittedAt).toLocaleString()
                        : selectedBooking.createdAt
                        ? new Date(selectedBooking.createdAt).toLocaleString()
                        : selectedBooking.created_at
                        ? new Date(selectedBooking.created_at).toLocaleString()
                        : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Rejected:</span>
                    <span>
                      {selectedBooking.reviewedAt
                        ? new Date(selectedBooking.reviewedAt).toLocaleString()
                        : selectedBooking.updatedAt
                        ? new Date(selectedBooking.updatedAt).toLocaleString()
                        : selectedBooking.updated_at
                        ? new Date(selectedBooking.updated_at).toLocaleString()
                        : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {showPrintView && bookingToPrint && (
        <div className="fixed inset-0 z-50 bg-white overflow-auto">
          <div className="absolute top-4 right-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowPrintView(false);
                setBookingToPrint(null);
              }}
            >
              Close
            </Button>
          </div>
          <BookingPrintView booking={bookingToPrint} onClose={() => {
            setShowPrintView(false);
            setBookingToPrint(null);
          }} />
        </div>
      )}
    </div>
  );
}

