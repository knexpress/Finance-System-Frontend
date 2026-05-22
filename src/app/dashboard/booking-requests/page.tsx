'use client';

import { useState, useEffect, useMemo, memo, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import { Eye, CheckCircle, XCircle, Image as ImageIcon, Download, Loader2, Zap } from 'lucide-react';
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
import dynamic from 'next/dynamic';
import { createPortal } from 'react-dom';
import {
  generateBookingPDF,
  normalizeReceiverDeliveryOptionForPdf,
  parseDeclaredAmountFromBooking,
  pickUaePassUserInfoFromBooking,
  type BookingPDFData,
} from '../../../../pdfGenerator';
import { secureLog } from '@/lib/secure-logger';

// Dynamically import heavy modal components to reduce initial bundle size
const BookingReviewModal = dynamic(() => import('@/components/booking-review-modal'), {
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
  const [loadingBookingDetails, setLoadingBookingDetails] = useState(false);
  const [generatingPDFBookingId, setGeneratingPDFBookingId] = useState<string | null>(null);
  const [autoReviewEnabled, setAutoReviewEnabled] = useState(false);
  const [autoReviewSettingsLoading, setAutoReviewSettingsLoading] = useState(false);
  const [autoReviewSaving, setAutoReviewSaving] = useState(false);
  const [autoReviewRunning, setAutoReviewRunning] = useState(false);
  const [autoReviewProgress, setAutoReviewProgress] = useState<{ current: number; total: number } | null>(null);
  const [showAutoReviewConfirm, setShowAutoReviewConfirm] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50; // Show 50 items per page for better performance
  const { toast } = useToast();
  const { userProfile, loading: authLoading } = useAuth();

  const AUTO_REVIEW_FAIL_COOLDOWN_MS = 2 * 60_000;

  /** Hidden system control — not shown to Sales / Operations / etc. */
  const canManageSystemAutoReview =
    userProfile?.role === 'ADMIN' ||
    userProfile?.role === 'SUPERADMIN' ||
    userProfile?.department?.name === 'Management';

  const canBatchApprovePending = canManageSystemAutoReview;

  const autoReviewInFlightRef = useRef(false);
  const autoReviewCooldownRef = useRef<Map<string, number>>(new Map());
  const fetchBookingsRef = useRef<(useCache?: boolean) => Promise<void>>(async () => {});

  // Helper function to normalize review status
  const normalizeReviewStatus = (status: any): string => {
    if (!status || status === null || status === undefined || status === '') {
      return 'not reviewed';
    }
    const normalized = String(status).toLowerCase().trim();
    if (normalized === 'not reviewed' || normalized === 'not_reviewed' || normalized === 'pending' || normalized === 'notreviewed') {
      return 'not reviewed';
    }
    if (normalized === 'reviewed' || normalized === 'approved') {
      return 'reviewed';
    }
    if (normalized === 'rejected') {
      return 'rejected';
    }
    return normalized;
  };

  const isExcludedFromAutoReview = useCallback(
    (booking: (typeof bookings)[number]) => booking?.skip_auto_review === true,
    []
  );

  const pendingBookingsCount = useMemo(
    () =>
      bookings.filter(
        (b) =>
          normalizeReviewStatus(b.review_status) === 'not reviewed' &&
          !isExcludedFromAutoReview(b)
      ).length,
    [bookings, isExcludedFromAutoReview]
  );

  const getPendingBookingIds = useCallback(
    (source: typeof bookings, excludeCooldown = true) => {
      const now = Date.now();
      return source
        .filter((b) => normalizeReviewStatus(b.review_status) === 'not reviewed')
        .filter((b) => !isExcludedFromAutoReview(b))
        .map((b) => b._id)
        .filter((id): id is string => {
          if (!id) return false;
          if (!excludeCooldown) return true;
          const failedAt = autoReviewCooldownRef.current.get(id);
          if (failedAt && now - failedAt < AUTO_REVIEW_FAIL_COOLDOWN_MS) return false;
          return true;
        });
    },
    [isExcludedFromAutoReview]
  );

  const runAutoReview = useCallback(
    async (options?: { bookingIds?: string[]; silent?: boolean; manual?: boolean }) => {
      if (autoReviewInFlightRef.current) return;

      const reviewedBy = userProfile?.employee_id || userProfile?._id;
      if (!reviewedBy) {
        if (!options?.silent) {
          toast({
            variant: 'destructive',
            title: 'Error',
            description: 'Your user profile is missing employee information.',
          });
        }
        return;
      }

      const pendingIds =
        options?.bookingIds ?? getPendingBookingIds(bookings, !options?.manual);

      if (pendingIds.length === 0) {
        if (!options?.silent) {
          toast({
            title: 'Nothing to approve',
            description: 'There are no pending bookings in the current list.',
          });
        }
        return;
      }

      if (options?.manual) {
        setShowAutoReviewConfirm(false);
      }

      autoReviewInFlightRef.current = true;
      setAutoReviewRunning(true);
      setAutoReviewProgress({ current: 0, total: pendingIds.length });

      try {
        const result = await apiClient.autoReviewBookingsBatch({
          reviewed_by_employee_id: reviewedBy,
          limit: 100,
          booking_ids: pendingIds,
        });

        if (result.success) {
          const summary = (result as {
            summary?: { succeeded?: number; failed?: number; processed?: number };
            failed?: Array<{ booking_id?: string }>;
          }).summary;
          const succeeded = summary?.succeeded ?? 0;
          const failed = summary?.failed ?? 0;
          const failedRows = (result as { failed?: Array<{ booking_id?: string }> }).failed ?? [];

          failedRows.forEach((row) => {
            if (row.booking_id) {
              autoReviewCooldownRef.current.set(row.booking_id, Date.now());
            }
          });

          pendingIds.forEach((id) => {
            if (!failedRows.some((f) => f.booking_id === id)) {
              autoReviewCooldownRef.current.delete(id);
            }
          });

          if (options?.silent) {
            if (succeeded > 0) {
              toast({
                title: 'Auto-approved',
                description:
                  succeeded === 1
                    ? '1 new booking request was reviewed and approved.'
                    : `${succeeded} new booking requests were reviewed and approved.`,
              });
            }
          } else {
            toast({
              title: 'Auto-review complete',
              description:
                failed > 0
                  ? `Approved ${succeeded} booking(s). ${failed} failed — will retry later or use manual review.`
                  : `Successfully auto-approved ${succeeded} booking(s).`,
            });
          }

          apiCache.invalidate('/bookings');
          await fetchBookingsRef.current(false);
        } else if (!options?.silent) {
          toast({
            variant: 'destructive',
            title: 'Auto-review failed',
            description: (result as { error?: string }).error || 'Could not complete auto-review.',
          });
        }
      } catch (error) {
        secureLog.error('Auto-review batch error', error);
        if (!options?.silent) {
          toast({
            variant: 'destructive',
            title: 'Error',
            description: 'Failed to run auto-review. Please try again.',
          });
        }
      } finally {
        autoReviewInFlightRef.current = false;
        setAutoReviewRunning(false);
        setAutoReviewProgress(null);
      }
    },
    [bookings, getPendingBookingIds, toast, userProfile]
  );

  useEffect(() => {
    if (authLoading || !canManageSystemAutoReview) return;
    let cancelled = false;
    (async () => {
      setAutoReviewSettingsLoading(true);
      const result = await apiClient.getSystemSettings();
      if (!cancelled && result.success && result.data) {
        setAutoReviewEnabled(
          !!(result.data as { booking_auto_review_enabled?: boolean }).booking_auto_review_enabled
        );
      }
      if (!cancelled) setAutoReviewSettingsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, canManageSystemAutoReview]);

  const handleSystemAutoReviewToggle = async (enabled: boolean) => {
    setAutoReviewSaving(true);
    try {
      const result = await apiClient.setBookingAutoReview(enabled);
      if (result.success) {
        setAutoReviewEnabled(enabled);
        toast({
          title: enabled ? 'System auto-approve ON' : 'System auto-approve OFF',
          description: enabled
            ? 'New bookings are approved on the server when saved. No page needs to stay open.'
            : 'New bookings will remain pending until reviewed.',
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Could not update',
          description: (result as { error?: string }).error || 'Try again.',
        });
      }
    } catch (error) {
      secureLog.error('setBookingAutoReview failed', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to update system auto-approve.',
      });
    } finally {
      setAutoReviewSaving(false);
    }
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
        secureLog.debug('Fetched bookings from backend', { count: bookingData.length, filterStatus, awb: awbSearch || 'none' });
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
      secureLog.error('Error fetching bookings', error);
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

  fetchBookingsRef.current = fetchBookings;

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
      secureLog.error('Error fetching booking details', error);
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
      secureLog.error('Error fetching booking details', error);
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

  const handleDownloadPDF = async (booking: any) => {
    try {
      setGeneratingPDFBookingId(booking._id);

      // Fetch full booking data from backend (invoiceRequestCollection)
      const result = await apiClient.getBookingForReview(booking._id);
      const fullBooking = result.success && result.data ? result.data : booking;

      // Extract sender and receiver data
      const senderData = fullBooking.sender || {};
      const receiverData = fullBooking.receiver || {};

      // Get service code
      const serviceCode = fullBooking.service || 
                         fullBooking.service_code ||
                         fullBooking.request_id?.service ||
                         fullBooking.request_id?.service_code ||
                         '';

      // Get AWB number
      const awbNumber = fullBooking.awb ||
                       fullBooking.awb_number ||
                       fullBooking.awbNumber ||
                       fullBooking.request_id?.awb ||
                       fullBooking.request_id?.awb_number ||
                       fullBooking.booking?.awb_number ||
                       '';

      // Get reference number (booking ID or invoice request ID)
      const referenceNumber = fullBooking._id?.toString() ||
                             fullBooking.request_id?._id?.toString() ||
                             fullBooking.booking_id ||
                             '';

      // Extract items
      const bookingItems = Array.isArray(fullBooking.items) ? fullBooking.items :
                           Array.isArray(fullBooking.orderItems) ? fullBooking.orderItems :
                           Array.isArray(fullBooking.listedItems) ? fullBooking.listedItems :
                           [];

      // Map items to PDF format
      const pdfItems = bookingItems.map((item: any, index: number) => ({
        id: item?.id || item?._id?.toString() || `item-${index}`,
        commodity: item?.commodity || item?.name || item?.description || item?.item || item?.title || 'N/A',
        qty: item?.qty || item?.quantity || item?.count || 1
      }));

      // Get images from identityDocuments (primary source) or fallback locations
      const getImageSrc = (imageField: string | undefined): string | undefined => {
        if (!imageField) return undefined;
        if (imageField.startsWith('data:image') || imageField.startsWith('http')) {
          return imageField;
        }
        return imageField;
      };

      const eidFrontImage = getImageSrc(
        fullBooking.identityDocuments?.eidFrontImage ||
        fullBooking.collections?.identityDocuments?.eidFrontImage ||
        fullBooking.id_front_image ||
        fullBooking.idFrontImage
      );

      const eidBackImage = getImageSrc(
        fullBooking.identityDocuments?.eidBackImage ||
        fullBooking.collections?.identityDocuments?.eidBackImage ||
        fullBooking.id_back_image ||
        fullBooking.idBackImage
      );

      const philippinesIdFront = getImageSrc(
        fullBooking.identityDocuments?.philippinesIdFront ||
        fullBooking.collections?.identityDocuments?.philippinesIdFront ||
        fullBooking.philippinesIdFront ||
        fullBooking.philippines_id_front
      );

      const philippinesIdBack = getImageSrc(
        fullBooking.identityDocuments?.philippinesIdBack ||
        fullBooking.collections?.identityDocuments?.philippinesIdBack ||
        fullBooking.philippinesIdBack ||
        fullBooking.philippines_id_back
      );

      // Collect customer images
      const allCustomerImages: string[] = [];
      if (Array.isArray(fullBooking.identityDocuments?.customerImages)) {
        allCustomerImages.push(...fullBooking.identityDocuments.customerImages);
      }
      if (Array.isArray(fullBooking.collections?.identityDocuments?.customerImages)) {
        allCustomerImages.push(...fullBooking.collections.identityDocuments.customerImages);
      }
      if (Array.isArray(fullBooking.customerImages)) {
        allCustomerImages.push(...fullBooking.customerImages);
      }
      const singularCustomerImage = fullBooking.identityDocuments?.customerImage ||
                                   fullBooking.collections?.identityDocuments?.customerImage ||
                                   fullBooking.customerImage;
      const customerImages = singularCustomerImage && !allCustomerImages.includes(singularCustomerImage)
        ? [...allCustomerImages, singularCustomerImage]
        : allCustomerImages.filter(Boolean);

      // Get delivery options
      const senderDeliveryOption = senderData.deliveryOption ||
                                  senderData.delivery_option ||
                                  fullBooking.sender_delivery_option ||
                                  fullBooking.sender?.deliveryOption ||
                                  fullBooking.sender?.delivery_option ||
                                  'warehouse';
      
      const receiverDeliveryOption = receiverData.deliveryOption ||
                                    receiverData.delivery_option ||
                                    fullBooking.receiver_delivery_option ||
                                    fullBooking.receiver?.deliveryOption ||
                                    fullBooking.receiver?.delivery_option ||
                                    'warehouse';

      // Get declaration text
      const declarationText = fullBooking.declarationText ||
                             fullBooking.declaration_text ||
                             fullBooking.notes ||
                             undefined;

      // Get submission timestamp
      const submissionTimestamp = fullBooking.createdAt ||
                                 fullBooking.created_at ||
                                 fullBooking.submissionTimestamp ||
                                 undefined;

      // Get additional documents
      const confirmationForm = fullBooking.identityDocuments?.confirmationForm ||
                              fullBooking.collections?.identityDocuments?.confirmationForm ||
                              undefined;
      const tradeLicense = fullBooking.identityDocuments?.tradeLicense ||
                          fullBooking.collections?.identityDocuments?.tradeLicense ||
                          undefined;

      // Map to PDF data format
      const pdfData: BookingPDFData = {
        referenceNumber: referenceNumber,
        bookingId: fullBooking._id?.toString(),
        awb: awbNumber || undefined,
        service: serviceCode,
        sender: {
          fullName: senderData.fullName ||
                   senderData.name ||
                   fullBooking.customer_name ||
                   fullBooking.name ||
                   '',
          completeAddress: senderData.completeAddress ||
                          senderData.address ||
                          fullBooking.sender_address ||
                          fullBooking.senderAddress ||
                          fullBooking.origin_place ||
                          fullBooking.origin ||
                          '',
          contactNo: senderData.contactNo ||
                    senderData.phone ||
                    senderData.phoneNumber ||
                    fullBooking.customer_phone ||
                    fullBooking.phone ||
                    '',
          emailAddress: senderData.emailAddress ||
                      senderData.email ||
                      fullBooking.customer_email ||
                      fullBooking.email ||
                      '',
          agentName: senderData.agentName ||
                   fullBooking.sales_agent_name ||
                   fullBooking.agentName ||
                   fullBooking.agent?.name ||
                   fullBooking.agent?.full_name ||
                   fullBooking.created_by_employee?.full_name ||
                   '',
          deliveryOption: (senderDeliveryOption === 'pickup' || senderDeliveryOption === 'warehouse') 
                         ? senderDeliveryOption 
                         : 'warehouse'
        },
        receiver: {
          fullName: receiverData.fullName ||
                   receiverData.name ||
                   fullBooking.receiver_name ||
                   fullBooking.receiverName ||
                   '',
          completeAddress: receiverData.completeAddress ||
                          receiverData.address ||
                          fullBooking.receiver_address ||
                          fullBooking.receiverAddress ||
                          '',
          contactNo: receiverData.contactNo ||
                    receiverData.phone ||
                    receiverData.phoneNumber ||
                    fullBooking.receiver_phone ||
                    fullBooking.receiverPhone ||
                    '',
          emailAddress: receiverData.emailAddress ||
                       receiverData.email ||
                       fullBooking.receiver_email ||
                       fullBooking.receiverEmail ||
                       '',
          deliveryOption: normalizeReceiverDeliveryOptionForPdf(receiverDeliveryOption),
          numberOfBoxes: fullBooking.number_of_boxes ||
                        fullBooking.numberOfBoxes ||
                        fullBooking.receiver?.numberOfBoxes ||
                        undefined
        },
        items: pdfItems,
        eidFrontImage: eidFrontImage,
        eidBackImage: eidBackImage,
        philippinesIdFront: philippinesIdFront,
        philippinesIdBack: philippinesIdBack,
        confirmationForm: confirmationForm,
        tradeLicense: tradeLicense,
        customerImage: customerImages.length > 0 ? customerImages[0] : undefined,
        customerImages: customerImages.length > 0 ? customerImages : undefined,
        submissionTimestamp: submissionTimestamp,
        declarationText: declarationText,
        insured: !!(fullBooking.insured || fullBooking.isInsured),
        declaredAmount: parseDeclaredAmountFromBooking(fullBooking),
        uaePassUserInfo: pickUaePassUserInfoFromBooking(fullBooking),
      };

      // Generate and download PDF
      await generateBookingPDF(pdfData);

        toast({
        title: 'Success',
        description: 'PDF generated and downloaded successfully',
        });
    } catch (error) {
      secureLog.error('Error generating PDF', error);
      secureLog.error('Error generating PDF', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to generate PDF. Please try again.',
      });
    } finally {
      setGeneratingPDFBookingId(null);
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
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Booking Requests</CardTitle>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          {canManageSystemAutoReview && (
            <div className="flex items-center gap-3 rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-2">
              <Switch
                id="system-auto-approve"
                checked={autoReviewEnabled}
                onCheckedChange={handleSystemAutoReviewToggle}
                disabled={autoReviewSettingsLoading || autoReviewSaving}
              />
              <Label htmlFor="system-auto-approve" className="cursor-pointer text-sm font-medium leading-tight">
                System auto-approve
                <span className="block text-xs font-normal text-muted-foreground">
                  {autoReviewSettingsLoading
                    ? 'Loading…'
                    : autoReviewEnabled
                      ? 'ON — runs on server when bookings are created'
                      : 'OFF'}
                </span>
              </Label>
            </div>
          )}
          {canBatchApprovePending && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={
                autoReviewRunning ||
                pendingBookingsCount === 0 ||
                filterStatus === 'reviewed'
              }
              onClick={() => setShowAutoReviewConfirm(true)}
              className="shrink-0"
              title="Approve all pending bookings in the current list"
            >
              {autoReviewRunning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {autoReviewProgress
                    ? `Approving ${autoReviewProgress.current}/${autoReviewProgress.total}…`
                    : 'Approving…'}
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  Approve all pending ({pendingBookingsCount})
                </>
              )}
            </Button>
          )}
          </div>
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
                      secureLog.debug('[AWB Debug] No AWB found for booking', {
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
                            onClick={() => handleDownloadPDF(booking)}
                            disabled={loadingBookingDetails || generatingPDFBookingId === booking._id}
                          >
                            {generatingPDFBookingId === booking._id ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Generating...
                              </>
                            ) : (
                              <>
                                <Download className="h-4 w-4 mr-2" />
                                Download PDF
                              </>
                            )}
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

      <AlertDialog open={showAutoReviewConfirm} onOpenChange={setShowAutoReviewConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Auto-approve pending bookings?</AlertDialogTitle>
            <AlertDialogDescription>
              This will immediately review and approve {pendingBookingsCount} pending booking(s) in
              the current list. New bookings are auto-approved on the server only when system
              auto-approve is enabled (Admin / Management).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={autoReviewRunning}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={autoReviewRunning}
              onClick={(e) => {
                e.preventDefault();
                runAutoReview({
                  manual: true,
                  bookingIds: getPendingBookingIds(bookings, false),
                });
              }}
            >
              Approve {pendingBookingsCount} booking(s)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}

