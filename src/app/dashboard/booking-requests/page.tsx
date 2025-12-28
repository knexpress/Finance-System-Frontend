'use client';

import { useState, useEffect, useMemo, memo, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiClient } from '@/lib/api-client';
import { apiCache } from '@/lib/api-cache';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { Eye, CheckCircle, XCircle, Image as ImageIcon, Printer } from 'lucide-react';
import dynamic from 'next/dynamic';
import { createPortal } from 'react-dom';

// Dynamically import heavy modal components to reduce initial bundle size
const BookingReviewModal = dynamic(() => import('@/components/booking-review-modal'), {
  loading: () => <div className="flex items-center justify-center p-8">Loading...</div>,
  ssr: false
});

const BookingPrintView = dynamic(() => import('@/components/booking-print-view'), {
  loading: () => <div className="flex items-center justify-center p-8">Loading...</div>,
  ssr: false
});

export default function BookingRequestsPage() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('not reviewed'); // Default to showing only unreviewed
  const [awbSearch, setAwbSearch] = useState('');
  const [showAwbSuggestions, setShowAwbSuggestions] = useState(false);
  const awbInputRef = useRef<HTMLInputElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showPrintView, setShowPrintView] = useState(false);
  const [bookingToPrint, setBookingToPrint] = useState<any>(null);
  const [loadingBookingDetails, setLoadingBookingDetails] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50; // Show 50 items per page for better performance
  const { toast } = useToast();
  const { userProfile } = useAuth();

  // Helper function to normalize review status
  const normalizeReviewStatus = (status: any): string => {
    if (!status || status === null || status === undefined || status === '') {
      return 'not reviewed'; // Default to 'not reviewed' if status is missing
    }
    const normalized = String(status).toLowerCase().trim();
    // Handle various formats
    if (normalized === 'not reviewed' || normalized === 'not_reviewed' || normalized === 'pending' || normalized === 'notreviewed') {
      return 'not reviewed';
    }
    if (normalized === 'reviewed' || normalized === 'approved') {
      return 'reviewed';
    }
    if (normalized === 'rejected') {
      return 'rejected';
    }
    return normalized; // Return as-is if it's something else
  };

  useEffect(() => {
    fetchBookings();
  }, [filterStatus, awbSearch]);

  const fetchBookings = async (useCache: boolean = true) => {
    try {
      // Build cache key with filters
      const filters = {
        status: filterStatus === 'all' ? undefined : filterStatus,
        awb: awbSearch.trim() || undefined
      };
      const cacheKey = filterStatus === 'all' 
        ? `/bookings${filters.awb ? `?awb=${filters.awb}` : ''}` 
        : `/bookings/status/${filterStatus}${filters.awb ? `?awb=${filters.awb}` : ''}`;
      
      const cached = apiCache.get(cacheKey, {});
      
      if (cached && cached.success && cached.data && useCache) {
        // Show cached data immediately
        const bookingData = Array.isArray(cached.data) ? cached.data : [];
        setBookings(bookingData);
        setLoading(false);
        
        // Continue fetching fresh data in background (stale-while-revalidate)
        // Don't set loading to true to avoid flicker
      } else {
        setLoading(true);
      }

      let result;
      
      // Send filters to backend - backend will filter full database
      // Use getAllBookings methods to fetch all pages
      if (filterStatus === 'all') {
        result = await apiClient.getAllBookings(filters, useCache);
      } else {
        result = await apiClient.getAllBookingsByStatus(filterStatus, { awb: filters.awb }, useCache);
      }

      if (result.success) {
        const bookingData = Array.isArray(result.data) ? result.data : [];
        console.log(`📦 Fetched ${bookingData.length} bookings from backend (all pages, status: ${filterStatus}, awb: ${awbSearch || 'none'})`);
        setBookings(bookingData);
      } else {
        // Only show error if we don't have cached data
        if (!cached || !cached.success) {
          toast({
            variant: 'destructive',
            title: 'Error',
            description: (result as any).error || 'Failed to fetch bookings',
          });
        }
      }
    } catch (error) {
      console.error('Error fetching bookings:', error);
      // Only show error if we don't have cached data
      const filters = {
        status: filterStatus === 'all' ? undefined : filterStatus,
        awb: awbSearch.trim() || undefined
      };
      const cacheKey = filterStatus === 'all' 
        ? `/bookings${filters.awb ? `?awb=${filters.awb}` : ''}` 
        : `/bookings/status/${filterStatus}${filters.awb ? `?awb=${filters.awb}` : ''}`;
      const cached = apiCache.get(cacheKey, {});
      if (!cached || !cached.success) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to fetch bookings',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async (booking: any) => {
    try {
      setLoadingBookingDetails(true);
      // Fetch full booking details with all images from database
      const result = await apiClient.getBookingForReview(booking._id);
      if (result.success && result.data) {
        setSelectedBooking(result.data);
        setShowReviewModal(true);
      } else {
        // Fallback to using the booking from list if API fails
        toast({
          variant: 'destructive',
          title: 'Warning',
          description: (result as any).error || 'Failed to load full booking details. Showing cached data.',
        });
        setSelectedBooking(booking);
        setShowReviewModal(true);
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
    setShowReviewModal(true);
    } finally {
      setLoadingBookingDetails(false);
    }
  };

  const handleView = async (booking: any) => {
    try {
      setLoadingBookingDetails(true);
      // Fetch full booking details with all images from database
      const result = await apiClient.getBookingForReview(booking._id);
      if (result.success && result.data) {
        setSelectedBooking(result.data);
        setShowViewModal(true);
      } else {
        // Fallback to using the booking from list if API fails
        toast({
          variant: 'destructive',
          title: 'Warning',
          description: (result as any).error || 'Failed to load full booking details. Showing cached data.',
        });
        setSelectedBooking(booking);
        setShowViewModal(true);
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
    setShowViewModal(true);
    } finally {
      setLoadingBookingDetails(false);
    }
  };

  const handleReviewComplete = () => {
    setShowReviewModal(false);
    setSelectedBooking(null);
    // Invalidate all booking caches and fetch fresh data
    apiCache.invalidate('/bookings');
    fetchBookings(false); // Don't use cache, get fresh data
  };

  const handlePrint = async (booking: any) => {
    try {
      setLoadingBookingDetails(true);
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
          description: (result as any).error || 'Failed to load full booking details. Showing cached data.',
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
      setLoadingBookingDetails(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      'not reviewed': { label: 'Not Reviewed', variant: 'secondary' },
      'reviewed': { label: 'Reviewed', variant: 'default' },
    };

    const statusInfo = statusMap[status] || { label: status, variant: 'outline' };

    return (
      <Badge variant={statusInfo.variant}>
        {statusInfo.label}
      </Badge>
    );
  };

  // Memoized helper: get a field by trying multiple aliases (case-insensitive, supports loose matching)
  // Using useCallback to memoize the function
  const getField = useCallback((obj: any, aliases: string[]): any => {
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
  }, []);

  // Memoized helper: format any value into a safe, readable string for table cells
  const formatValue = useCallback((value: any): string => {
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
  }, []);

  // Helper function to extract AWB number from booking
  const getAwbNumber = useCallback((booking: any): string => {
    // Always check both awb and tracking_code fields
    // tracking_code can contain AWB when awb field is empty
    const awb = (
      booking.awb ||
      booking.awb_number ||
      booking.awbNumber ||
      booking.request_id?.awb ||
      booking.request_id?.awb_number ||
      booking.request_id?.awbNumber ||
      booking.booking?.awb ||
      booking.booking?.awb_number ||
      booking.booking?.awbNumber ||
      // If no awb found, use tracking_code as AWB
      booking.tracking_code ||
      booking.trackingCode ||
      booking.tracking_number ||
      booking.request_id?.tracking_code ||
      booking.request_id?.trackingCode ||
      booking.request_id?.tracking_number ||
      booking.booking?.tracking_code ||
      booking.booking?.trackingCode ||
      booking.booking?.tracking_number ||
      ''
    ).trim();
    
    // Don't return _id as AWB - return if it's not empty and not the _id
    if (awb && awb.trim() !== '' && awb !== booking._id?.toString()) {
      return awb.trim();
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

  // Filter AWB suggestions based on search input
  const awbSuggestions = useMemo(() => {
    return awbSearch.trim().length > 0
      ? availableAwbNumbers.filter(awb => 
          awb.includes(awbSearch.toLowerCase().trim())
        ).slice(0, 10) // Limit to 10 suggestions
      : [];
  }, [awbSearch, availableAwbNumbers]);

  // Backend handles filtering, so use bookings directly (already filtered)
  // Only apply pagination on frontend
  const filteredBookings = useMemo(() => {
    return bookings; // Backend already filtered by status and AWB
  }, [bookings]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredBookings.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedBookings = useMemo(() => {
    return filteredBookings.slice(startIndex, endIndex);
  }, [filteredBookings, startIndex, endIndex]);

  // Reset to page 1 when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filterStatus]);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Booking Requests</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative">
                <Label htmlFor="awb-search">Search by AWB Number</Label>
                <Input
                  ref={awbInputRef}
                  id="awb-search"
                  type="text"
                  placeholder="Enter AWB number..."
                  value={awbSearch}
                  onChange={(e) => {
                    setAwbSearch(e.target.value);
                    setShowAwbSuggestions(true);
                    // Update dropdown position
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
                    // Update dropdown position
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
                    // Delay hiding suggestions to allow click
                    setTimeout(() => setShowAwbSuggestions(false), 200);
                  }}
                />
              </div>
              
              <div>
                <Label htmlFor="status-filter">Review Status</Label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger id="status-filter">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="not reviewed">Not Reviewed</SelectItem>
                <SelectItem value="all">All (Excluding Reviewed)</SelectItem>
                <SelectItem value="reviewed">Reviewed (Archive)</SelectItem>
              </SelectContent>
            </Select>
          </div>
            </div>
          </div>

          {/* AWB Suggestions Dropdown Portal */}
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
                    <TableHead>AWB Number</TableHead>
                    <TableHead>Customer Name</TableHead>
                    <TableHead>Receiver Name</TableHead>
                    <TableHead>Origin</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Shipment Type</TableHead>
                    <TableHead>Review Status</TableHead>
                    <TableHead>Created At</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedBookings.map((booking) => {
                    // Extract AWB from various possible locations
                    // Always check awb first, then tracking_code as fallback (tracking_code can contain AWB when awb is empty)
                    let awbNumber: string = '';
                    
                    // Helper to check if value is valid (not empty, not null, not _id)
                    const isValidAwb = (val: any): boolean => {
                      if (!val) return false;
                      const str = String(val).trim();
                      return str !== '' && str !== booking._id?.toString() && str !== 'null' && str !== 'undefined';
                    };
                    
                    // Try awb fields first, then tracking_code as fallback (tracking_code can contain AWB)
                    const possibleFields = [
                      // First try awb variants
                      booking.awb,
                      booking.awb_number,
                      booking.awbNumber,
                      booking.request_id?.awb,
                      booking.request_id?.awb_number,
                      booking.request_id?.awbNumber,
                      booking.booking?.awb,
                      booking.booking?.awb_number,
                      booking.booking?.awbNumber,
                      // If no awb found, use tracking_code as AWB (tracking_code can contain AWB when awb is empty)
                      booking.tracking_code,
                      booking.trackingCode,
                      booking.tracking_number,
                      booking.request_id?.tracking_code,
                      booking.request_id?.trackingCode,
                      booking.request_id?.tracking_number,
                      booking.booking?.tracking_code,
                      booking.booking?.trackingCode,
                      booking.booking?.tracking_number,
                    ];
                    
                    // Find first valid AWB value
                    for (const field of possibleFields) {
                      if (isValidAwb(field)) {
                        awbNumber = String(field).trim();
                        break;
                      }
                    }
                    
                    // Debug log for first booking when showing N/A (only in development)
                    if (!awbNumber && paginatedBookings.indexOf(booking) === 0 && process.env.NODE_ENV === 'development') {
                      console.log('🔍 [AWB Debug] No AWB found for booking:', {
                        _id: booking._id,
                        review_status: booking.review_status,
                        filterStatus,
                        availableFields: {
                          tracking_code: booking.tracking_code,
                          trackingCode: booking.trackingCode,
                          awb: booking.awb,
                          awb_number: booking.awb_number,
                          awbNumber: booking.awbNumber,
                          request_id_type: typeof booking.request_id,
                          request_id_keys: booking.request_id ? Object.keys(booking.request_id) : null,
                          booking_keys: booking.booking ? Object.keys(booking.booking) : null
                        }
                      });
                    }
                    
                    // Don't show _id as AWB - show if it's not empty and not the _id
                    const displayAwb = awbNumber || 'N/A';
                    
                    return (
                    <TableRow key={booking._id}>
                      <TableCell className="font-mono text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="text-muted-foreground">#</span>
                          <span className="font-semibold">{displayAwb}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                      {formatValue(getField(booking, ['customer_name','customerName','name','full_name','sender_name','customer','sender']))}
                      </TableCell>
                      <TableCell>
                      {formatValue(getField(booking, ['receiver_name','receiverName','consignee_name','to_name','receiver','consignee']))}
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
                      {getStatusBadge(booking.review_status || 'not reviewed')}
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
                            onClick={() => handleView(booking)}
                            disabled={loadingBookingDetails}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            {loadingBookingDetails ? 'Loading...' : 'View'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePrint(booking)}
                            disabled={loadingBookingDetails}
                          >
                            <Printer className="h-4 w-4 mr-2" />
                            Print
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleReview(booking)}
                            disabled={booking.review_status === 'reviewed' || loadingBookingDetails}
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            {loadingBookingDetails ? 'Loading...' : 'Review'}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination Controls */}
          {!loading && filteredBookings.length > itemsPerPage && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground">
                Showing {startIndex + 1} to {Math.min(endIndex, filteredBookings.length)} of {filteredBookings.length} bookings
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <span className="text-sm">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {showReviewModal && selectedBooking && (
        <BookingReviewModal
          booking={selectedBooking}
          open={showReviewModal}
          onClose={() => {
            setShowReviewModal(false);
            setSelectedBooking(null);
          }}
          onReviewComplete={handleReviewComplete}
          currentUser={userProfile}
        />
      )}

      {showViewModal && selectedBooking && (
        <BookingReviewModal
          booking={selectedBooking}
          open={showViewModal}
          onClose={() => {
            setShowViewModal(false);
            setSelectedBooking(null);
          }}
          onReviewComplete={() => {
            setShowViewModal(false);
            setSelectedBooking(null);
          }}
          currentUser={userProfile}
          viewOnly={true}
        />
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

