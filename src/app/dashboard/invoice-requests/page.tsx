'use client';

import { useState, useEffect, memo, type ReactNode, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { useNotifications } from '@/contexts/NotificationContext';
import { secureLog } from '@/lib/secure-logger';
// Dynamically import heavy form components to reduce initial bundle size
const InvoiceRequestForm = dynamic(() => import('@/components/invoice-request-form'), {
  ssr: false
});
const VerificationForm = dynamic(() => import('@/components/verification-form'), {
  ssr: false
});
const BookingPrintView = dynamic(() => import('@/components/booking-print-view'), {
  ssr: false
});
import { Edit, Trash2, Package, Truck, CheckCircle, XCircle, FileText, ArrowRight, Phone, MapPin, AlertTriangle, Hash, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import BookingReviewModal from '@/components/booking-review-modal';

const normalizeServiceCode = (code?: string | null) =>
  (code || '')
    .toString()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');

const isPhToUaeService = (code?: string | null) => {
  const normalized = normalizeServiceCode(code);
  return normalized === 'PH_TO_UAE' || normalized.startsWith('PH_TO_UAE_');
};

const isUaeToPhService = (code?: string | null) => {
  const normalized = normalizeServiceCode(code);
  // Check for UAE_TO_PH, UAE_TO_PINAS, and variations
  return normalized === 'UAE_TO_PH' || 
         normalized === 'UAE_TO_PINAS' ||
         normalized.startsWith('UAE_TO_PH_') ||
         normalized.startsWith('UAE_TO_PINAS_') ||
         normalized.includes('UAE_TO_PINAS');
};

// Helper function to extract AWB number from request (moved outside component for performance)
const getAwbNumber = (request: any): string => {
  const awb = (
    request.awb ||
    request.tracking_code ||
    request.awb_number ||
    request.request_id?.awb ||
    request.request_id?.tracking_code ||
    request.request_id?.awb_number ||
    request.booking?.awb ||
    request.booking?.tracking_code ||
    request.booking?.awb_number ||
    ''
  ).toString().trim();
  
  // Don't return _id as AWB - only return if it's actually an AWB format
  // Made less strict: allow shorter AWBs and be more lenient with format
  if (awb && awb !== request._id?.toString()) {
    // Allow if it looks like an AWB (alphanumeric, reasonable length)
    if (awb.length >= 3 && /^[A-Z0-9\-_]+$/i.test(awb)) {
      return awb;
    }
  }
  
  return '';
};

// Memoized Invoice Request Card Component - Only re-renders when its props change
interface InvoiceRequestCardProps {
  request: any;
  userProfile: any;
  formatWeightValue: (value: any) => string | null;
  formatDateLabel: (date: string | Date) => string;
  formatServiceCode: (code?: string | null) => string;
  getStatusBadgeColor: (status: string) => string;
  getDeliveryStatusBadgeColor: (status?: string) => string;
  renderActionControls: (request: any) => ReactNode;
  fetchInvoiceRequests: () => void;
  onBadgeClick?: (request: any) => void;
}

const InvoiceRequestCard = memo(({
  request,
  userProfile,
  formatWeightValue,
  formatDateLabel,
  formatServiceCode,
  getStatusBadgeColor,
  getDeliveryStatusBadgeColor,
  renderActionControls,
  fetchInvoiceRequests,
  onBadgeClick,
}: InvoiceRequestCardProps) => {
  const shortId =
    request.invoice_number ||
    request.tracking_code ||
    (request._id ? request._id.slice(-8) : 'REQUEST');
  
  // Extract AWB number from request
  const awbNumber = 
    request.tracking_code ||
    request.awb_number ||
    request.request_id?.tracking_code ||
    request.request_id?.awb_number ||
    'N/A';
  
  const weightDisplay =
    formatWeightValue(request.weight) ||
    formatWeightValue(request.weight_kg) ||
    formatWeightValue(request.verification?.actual_weight);
  const routeFrom = request.origin_place || 'Not set';
  const routeTo = request.destination_place || 'Not set';
  const createdLabel = formatDateLabel(request.createdAt);
  const totalBoxes =
    request.verification?.number_of_boxes ||
    request.number_of_boxes ||
    request.verification?.boxes?.length;
  const actions = renderActionControls(request);

  // Check if invoice is generated
  const hasInvoice = !!(request.invoice_id || request.invoice_number);
  
  return (
    <div
      key={request._id}
      className={`rounded-2xl border p-4 shadow-sm transition ${
        hasInvoice 
          ? 'border-green-500/50 bg-green-50/30 hover:border-green-500/70' 
          : 'border-border/60 bg-card hover:border-primary/40'
      }`}
    >
      <div className="flex flex-col gap-3 border-b border-dashed pb-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <Badge 
            variant="outline" 
            className={`font-mono text-xs uppercase ${userProfile?.department?.name === 'Sales' && onBadgeClick ? 'cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors' : ''}`}
            onClick={() => {
              if (userProfile?.department?.name === 'Sales' && onBadgeClick) {
                onBadgeClick(request);
              }
            }}
          >
            {shortId}
          </Badge>
          <span className="text-xs text-muted-foreground">
            Created {createdLabel}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className={getStatusBadgeColor(request.status)}>
            {request.status}
          </Badge>
          <Badge className={getDeliveryStatusBadgeColor(request.delivery_status)}>
            {request.delivery_status}
          </Badge>
          {request.has_delivery && (
            <Badge variant="secondary">Delivery</Badge>
          )}
        </div>
      </div>

      <div className="grid gap-4 pt-4 md:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">AWB Number</p>
          <div className="flex items-center gap-1.5">
            <Hash className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="font-mono font-semibold text-foreground text-sm">{awbNumber}</p>
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Customer</p>
          <p className="font-semibold text-foreground">{request.customer_name}</p>
          {request.customer_phone && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Phone className="h-3.5 w-3.5" />
              <span>{request.customer_phone}</span>
            </div>
          )}
        </div>

        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Receiver</p>
          <p className="font-semibold text-foreground">{request.receiver_name}</p>
          {request.receiver_company && (
            <p className="text-sm text-muted-foreground">{request.receiver_company}</p>
          )}
          {request.receiver_phone && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Phone className="h-3.5 w-3.5" />
              <span>{request.receiver_phone}</span>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Route</p>
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <div className="flex-1 space-y-1">
              <div className="flex items-start gap-1 font-medium text-foreground">
                <MapPin className="mt-0.5 h-3.5 w-3.5 text-primary" />
                <span className="break-words">{routeFrom}</span>
              </div>
              <p className="text-xs uppercase tracking-wide opacity-80">Origin</p>
            </div>
            <ArrowRight className="mt-1 h-4 w-4 text-primary" />
            <div className="flex-1 space-y-1">
              <div className="flex items-start gap-1 font-medium text-foreground">
                <MapPin className="mt-0.5 h-3.5 w-3.5 text-orange-500" />
                <span className="break-words">{routeTo}</span>
              </div>
              <p className="text-xs uppercase tracking-wide opacity-80">Destination</p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Shipment</p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              {request.shipment_type === 'DOCUMENT' ? 'Document' : 'Non-Document'}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Weight:{' '}
            {weightDisplay ? (
              <span className="font-semibold text-foreground">{weightDisplay} kg</span>
            ) : (
              'Not set'
            )}
          </p>
          {totalBoxes && (
            <p className="text-sm text-muted-foreground">
              Boxes:{' '}
              <span className="font-semibold text-foreground">{totalBoxes}</span>
            </p>
          )}
        </div>
      </div>

      {userProfile.department.name === 'Operations' && request.status === 'IN_PROGRESS' && (
        <div className="mt-4 rounded-lg border border-dashed border-orange-200 bg-orange-50 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-orange-700">
            <AlertTriangle className="h-4 w-4" />
            <span>Complete the 6-point verification before sending to Finance</span>
          </div>
          <div className="mt-3">
            <VerificationForm
              request={request}
              onVerificationComplete={fetchInvoiceRequests}
              currentUser={userProfile}
            />
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3 border-t pt-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Service:</span>
          <Badge variant="outline">{formatServiceCode(request.service_code)}</Badge>
          {request.has_delivery && <Badge variant="secondary">Delivery Required</Badge>}
          {request.is_leviable && <Badge variant="outline">VAT applicable</Badge>}
        </div>
        {actions ? (
          <div className="flex flex-wrap gap-2">{actions}</div>
        ) : (
          <div className="text-xs text-muted-foreground">No actions available</div>
        )}
      </div>
    </div>
  );
});

InvoiceRequestCard.displayName = 'InvoiceRequestCard';

export default function InvoiceRequestsPage() {
  const [invoiceRequests, setInvoiceRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageLimit] = useState(20); // Reduced limit for faster loading (20 items per page)
  const [statusFilter, setStatusFilter] = useState<string>(''); // Status filter dropdown
  const [awbSearch, setAwbSearch] = useState('');
  const [showAwbSuggestions, setShowAwbSuggestions] = useState(false);
  const [searchingBookings, setSearchingBookings] = useState(false);
  const [foundBookings, setFoundBookings] = useState<any[]>([]);
  const [awbSuggestions, setAwbSuggestions] = useState<string[]>([]);
  const awbInputRef = useRef<HTMLInputElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  
  // Name search state (single field for intelligent search)
  const [nameSearch, setNameSearch] = useState('');
  const [searchingByName, setSearchingByName] = useState(false);
  const [nameSearchResults, setNameSearchResults] = useState<any[]>([]);
  const [nameSearchAwbs, setNameSearchAwbs] = useState<string[]>([]);
  const [showInvoicePreview, setShowInvoicePreview] = useState(false);
  const [selectedRequestForInvoice, setSelectedRequestForInvoice] = useState<any>(null);
  const hasInitializedRef = useRef(false); // Track if initial load has happened
  const isInitializingRef = useRef(false); // Prevent concurrent initialization
  const [showTaxInputDialog, setShowTaxInputDialog] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [loadingBooking, setLoadingBooking] = useState(false);
  const [showShipmentDetailsDialog, setShowShipmentDetailsDialog] = useState(false);
  const [showPrintView, setShowPrintView] = useState(false);
  const [bookingToPrint, setBookingToPrint] = useState<any>(null);
  const [hasDelivery, setHasDelivery] = useState(false); // Delivery required flag for PH TO UAE
  const [customerTRN, setCustomerTRN] = useState(''); // Optional customer TRN
  const [batchNumber, setBatchNumber] = useState(''); // Optional batch number
  const [pickupCharge, setPickupCharge] = useState(''); // Pickup charge when sender_delivery_option is "pickup"
  const [deliveryCharge, setDeliveryCharge] = useState(''); // Delivery charge when receiver_delivery_option is "delivery"
  const [deliveryBaseAmount, setDeliveryBaseAmount] = useState('20'); // Base delivery amount for PH_TO_UAE (default 20)
  const router = useRouter();
  const getRequestServiceCode = (request?: any) =>
    request?.service_code ||
    request?.verification?.service_code ||
    request?.shipment?.service_code ||
    '';

  const { toast } = useToast();
  const { userProfile } = useAuth();
  const { clearCount } = useNotifications();
  const [insuranceOption, setInsuranceOption] = useState<'none' | 'percent' | 'fixed'>('none');
  const [fixedInsuranceType, setFixedInsuranceType] = useState<'mobile' | 'laptop' | 'other'>('mobile');
  const [insuranceManualAmount, setInsuranceManualAmount] = useState('');
  
  // Helper function to check if shipment is flowmic
  const isFlowmicShipment = (request?: any): boolean => {
    if (!request) return false;
    // Check verification boxes and shipment classification for flowmic/personal
    const boxes =
      request.verification?.boxes ||
      request.request_id?.verification?.boxes ||
      request.booking?.verification?.boxes ||
      [];
    const boxIsFlowmic =
      Array.isArray(boxes) &&
      boxes.length > 0 &&
      boxes.some((box: any) => {
        const classification = (box.classification || '').toUpperCase();
        return classification === 'FLOWMIC' || classification === 'PERSONAL';
      });

    // Check shipment classification fields as a fallback
    const classificationFields = [
      request.verification?.shipment_classification,
      request.request_id?.verification?.shipment_classification,
      request.shipment?.classification,
      request.request_id?.shipment?.classification,
      request.classification,
    ]
      .map((c: any) => (c || '').toString().toUpperCase())
      .filter(Boolean);

    const hasPersonalClassification = classificationFields.some(
      (c) => c === 'PERSONAL' || c === 'FLOWMIC'
    );

    return boxIsFlowmic || hasPersonalClassification;
  };
  
  const getAutoTaxRate = (request?: any) => {
    if (!request) return 0;
    // If shipment is flowmic, apply 5% VAT on subtotal
    if (isFlowmicShipment(request)) {
      return 5;
    }
    const serviceCode = getRequestServiceCode(request);
    // Tax is calculated on delivery charge if present (PH to UAE = 5%, others = 0%)
    return isPhToUaeService(serviceCode) ? 5 : 0;
  };

  // Helper to extract declared amount as number
  const getDeclaredAmount = (request: any): number => {
    // Priority 1: verification.declared_value (from invoiceRequests collection)
    const declaredAmount = request?.verification?.declared_value ||
      request?.request_id?.verification?.declared_value ||
      request?.booking?.verification?.declared_value ||
      // Priority 2: Other declared amount fields
      request?.declaredAmount ||
      request?.declared_amount ||
      request?.request_id?.declaredAmount ||
      request?.request_id?.declared_amount ||
      request?.booking?.declaredAmount ||
      request?.booking?.declared_amount ||
      request?.sender?.declaredAmount ||
      request?.sender?.declared_amount ||
      request?.request_id?.sender?.declaredAmount ||
      request?.request_id?.sender?.declared_amount ||
      0;

    if (!declaredAmount) return 0;
    if (typeof declaredAmount === 'object' && declaredAmount.$numberDecimal) {
      return parseFloat(declaredAmount.$numberDecimal) || 0;
    }
    const parsed = typeof declaredAmount === 'number' ? declaredAmount : parseFloat(declaredAmount.toString());
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const selectedRequestTaxRate = getAutoTaxRate(selectedRequestForInvoice || undefined);
  const selectedServiceCode = getRequestServiceCode(selectedRequestForInvoice || undefined);
  const isUaeToPhSelected = isUaeToPhService(selectedServiceCode);
  
  // Get delivery options from request (check multiple possible locations)
  // Normalize to lowercase for case-insensitive comparison
  const senderDeliveryOptionRaw = selectedRequestForInvoice?.sender_delivery_option || 
                                   selectedRequestForInvoice?.request_id?.sender_delivery_option || 
                                   selectedRequestForInvoice?.booking?.sender_delivery_option ||
                                   selectedRequestForInvoice?.sender?.delivery_option ||
                                   selectedRequestForInvoice?.request_id?.sender?.delivery_option ||
                                   selectedRequestForInvoice?.request_id?.booking?.sender_delivery_option ||
                                   '';
  const receiverDeliveryOptionRaw = selectedRequestForInvoice?.receiver_delivery_option || 
                                    selectedRequestForInvoice?.request_id?.receiver_delivery_option || 
                                    selectedRequestForInvoice?.booking?.receiver_delivery_option ||
                                    selectedRequestForInvoice?.receiver?.delivery_option ||
                                    selectedRequestForInvoice?.request_id?.receiver?.delivery_option ||
                                    selectedRequestForInvoice?.request_id?.booking?.receiver_delivery_option ||
                                    '';
  
  // Normalize to lowercase for case-insensitive matching
  const senderDeliveryOption = senderDeliveryOptionRaw?.toString().toLowerCase().trim() || '';
  const receiverDeliveryOption = receiverDeliveryOptionRaw?.toString().toLowerCase().trim() || '';
  
  // Secure logging - Only in development
  if (selectedRequestForInvoice) {
    secureLog.debug('Invoice Generation Dialog', {
      serviceCode: selectedServiceCode?.substring(0, 30),
      isUaeToPh: isUaeToPhSelected,
      senderOption: senderDeliveryOption?.substring(0, 20),
      receiverOption: receiverDeliveryOption?.substring(0, 20)
    });
  }
  
  // For UAE TO PH: Use manual entry based on delivery options
  // For PH TO UAE: Use old automatic calculation method
  // Use case-insensitive comparison
  const needsPickupCharge = isUaeToPhSelected && (senderDeliveryOption === 'pickup');
  const needsDeliveryCharge = isUaeToPhSelected && (receiverDeliveryOption === 'delivery');
  
  // For UAE TO PH: Show fields based on delivery option combinations
  // - sender="pickup" AND receiver="delivery" → show both fields
  // - sender="delivery" AND receiver="delivery" → show only delivery charge
  // - sender="pickup" AND receiver="pickup" → show only pickup charge
  const showPickupChargeField = isUaeToPhSelected && (senderDeliveryOption === 'pickup');
  const showDeliveryChargeField = isUaeToPhSelected && (receiverDeliveryOption === 'delivery');
  
  // For PH TO UAE: Check if delivery is required (old method)
  const isPhToUaeSelected = isPhToUaeService(selectedServiceCode);
  
  // PH TO UAE: Always disable insurance (no insurance offered)
  useEffect(() => {
    if (isPhToUaeSelected) {
      setInsuranceOption('none');
      setFixedInsuranceType('mobile');
      setInsuranceManualAmount('');
    }
  }, [isPhToUaeSelected]);
  
  const generateDisabled =
    !batchNumber.trim() ||
    (needsPickupCharge && !pickupCharge.trim()) ||
    (needsDeliveryCharge && !deliveryCharge.trim());
  // Manual charges are now handled via pickupCharge and deliveryCharge based on delivery options

  // Determine which requests to show based on department and status filter
  const getVisibleRequests = () => {
    if (!userProfile) {
      secureLog.warn('No user profile available');
      return [];
    }
    
    // Ensure invoiceRequests is always an array
    const safeInvoiceRequests = Array.isArray(invoiceRequests) ? invoiceRequests : [];
    secureLog.debug('Invoice requests loaded', { count: safeInvoiceRequests.length });
    
    const department = userProfile.department.name;
    secureLog.debug('Filtering requests', { department, statusFilter });
    
    let filtered: any[] = [];
    
    // If user has selected a specific status filter, apply it first
    if (statusFilter && statusFilter !== 'all') {
      filtered = safeInvoiceRequests.filter(request => {
        const status = request.status;
        // Match the selected status exactly
        return status === statusFilter;
      });
      secureLog.debug('Filtered by status', { statusFilter, count: filtered.length });
      return filtered;
    }
    
    // Otherwise, apply department-based filtering
    switch (department) {
      case 'Sales':
        // Sales can see all invoice requests without filtering
        filtered = safeInvoiceRequests;
        break;
      
      case 'Operations':
        // Operations can see SUBMITTED, IN_PROGRESS, and VERIFIED requests
        // Also show requests without status (might be new/incomplete data)
        filtered = safeInvoiceRequests.filter(request => {
          const status = request.status;
          // If no status, include it (might be new data)
          if (!status || status === undefined || status === null) {
            return true;
          }
          const matches = status === 'SUBMITTED' || 
                         status === 'IN_PROGRESS' || 
                         status === 'VERIFIED';
          return matches;
        });
        secureLog.debug('Operations filtered', { count: filtered.length });
        break;
      
      case 'Finance':
        // Finance only sees VERIFIED requests (already filtered by backend query)
        // Only exclude cancelled shipments from the already-filtered VERIFIED requests
        filtered = safeInvoiceRequests.filter(request => {
          // Backend already returns only VERIFIED status, so we just need to exclude cancelled
          // Exclude if delivery status is cancelled
          if (request.delivery_status === 'CANCELLED') return false;
          
          // Exclude if related shipment request is cancelled
          if (request.request_id?.status === 'CANCELLED') return false;
          if (request.request_id?.delivery_status === 'CANCELLED') return false;
          
          return true;
        });
        secureLog.debug('Finance filtered', { count: filtered.length });
        break;
      
      default:
        secureLog.warn('Unknown department', { department });
        filtered = [];
    }
    
    return filtered;
  };

  useEffect(() => {
    // Only initialize once when userProfile is first loaded
    if (hasInitializedRef.current || !userProfile || isInitializingRef.current) {
      return;
    }
    
    isInitializingRef.current = true;
    
    // Clear invoice requests notification count when page is visited
    clearCount('invoiceRequests');
    
    // Set default status filter based on department
    if (userProfile.department?.name === 'Operations') {
      setStatusFilter('IN_PROGRESS');
    } else if (userProfile.department?.name === 'Finance') {
      setStatusFilter('VERIFIED');
    } else {
      setStatusFilter('all'); // Sales can see all
    }
    
    hasInitializedRef.current = true;
    isInitializingRef.current = false;
  }, [userProfile, clearCount]);

  // Fetch data when status filter changes (after initial load)
  useEffect(() => {
    // Only fetch if statusFilter is set and we've initialized
    if (statusFilter !== '' && hasInitializedRef.current) {
      fetchInvoiceRequests(1, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]); // Only depend on statusFilter, fetchInvoiceRequests is stable now

  // Auto-refresh removed - page will only refresh when user manually triggers it

  // Debounce search inputs to prevent excessive API calls
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      if (awbSearch.trim() || nameSearch.trim()) {
        // Search will trigger filtering on frontend, no need to refetch
        // Only refetch if we need to search backend
      }
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [awbSearch, nameSearch]);

  // Update dropdown position on scroll and resize
  useEffect(() => {
    if (!showAwbSuggestions || !awbInputRef.current) return;

    const updatePosition = () => {
      if (awbInputRef.current) {
        const rect = awbInputRef.current.getBoundingClientRect();
        setDropdownPosition({
          top: rect.bottom + window.scrollY + 4,
          left: rect.left + window.scrollX,
          width: rect.width,
        });
      }
    };

    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [showAwbSuggestions]);

  // Optimized field list for Operations list view (reduces payload by 70-80%)
  // Optimized: Only fetch fields needed for list view display
  const getEssentialFields = () => [
    // Core identifiers
    '_id', 'invoice_id', 'invoice_number',
    // Status and dates
    'status', 'delivery_status', 'createdAt',
    // AWB/Tracking
    'tracking_code', 'awb_number', 'awb',
    // Customer info (minimal for list)
    'customer_name', 'customer_phone',
    // Receiver info (minimal for list)
    'receiver_name', 'receiver_company', 'receiver_phone',
    // Route info
    'origin_place', 'destination_place', 'service_code',
    // Weight and boxes (minimal)
    'weight', 'weight_kg', 'number_of_boxes',
    'verification.actual_weight', 'verification.number_of_boxes',
    // Shipment type (for Document/Non-Document badge)
    'shipment_type',
    // Flags
    'has_delivery', 'is_leviable',
    // Delivery options (needed for invoice generation)
    'sender_delivery_option', 'receiver_delivery_option',
    // Minimal verification data (only what's displayed)
    'verification.insured', 'verification.declared_value',
    // Request reference (minimal)
    'request_id._id', 'request_id.status', 'request_id.tracking_code'
  ];
  
  // Full fields for detailed views (when opening modals/dialogs)
  const getFullFields = () => [
    ...getEssentialFields(),
    'updatedAt', 'customer_email', 'receiver_address',
    'verification.chargeable_weight', 'verification.total_kg', 
    'verification.shipment_classification', 'verification.volumetric_weight',
    'insured', 'declaredAmount', 'declared_amount',
    'booking', 'booking_snapshot', 'booking_data',
    'request_id'
  ];

  const fetchInvoiceRequests = useCallback(async (page: number = currentPage, useCache: boolean = true) => {
    try {
      setLoading(true);
      
      const essentialFields = getEssentialFields();
      
      // Determine filters based on user-selected status filter or department default
      let filters: { status?: string; search?: string } | undefined = undefined;
      
      // If user has selected a status filter, use that (overrides department default)
      if (statusFilter && statusFilter !== 'all') {
        filters = { status: statusFilter };
      } else {
        // Otherwise, use department defaults
        if (userProfile?.department?.name === 'Finance') {
          // Finance: Only VERIFIED status
          filters = { status: 'VERIFIED' };
        } else if (userProfile?.department?.name === 'Operations') {
          // Operations: Only IN_PROGRESS status for better performance
          filters = { status: 'IN_PROGRESS' };
        }
        // Sales: No status filter (can see all)
      }
      
      // Use optimized single-page fetch instead of loading all pages
      const result = await apiClient.getInvoiceRequestsPage(page, pageLimit, filters, useCache, essentialFields);
      
      if (result.success) {
        const data = (result.data as any[]) || [];
        secureLog.debug('API response received', { requestCount: data.length, page, hasPagination: !!result.pagination });
        setInvoiceRequests(data);
        setPagination(result.pagination);
        // Only update currentPage if it's different to avoid unnecessary re-renders
        setCurrentPage(prev => {
          if (prev !== page) {
            return page;
          }
          return prev;
        });
      } else {
        // Handle rate limiting gracefully
        if (result.error === 'Rate limited') {
          secureLog.warn('Rate limited, will retry later');
          setInvoiceRequests([]);
        } else {
          secureLog.error('Error fetching invoice requests', result.error);
          toast({
            variant: 'destructive',
            title: 'Error',
            description: 'Failed to fetch invoice requests',
          });
        }
      }
    } catch (error) {
      secureLog.error('Error fetching invoice requests', error);
      setInvoiceRequests([]);
      if (!(error as any)?.message?.includes('429')) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to fetch invoice requests',
        });
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter, userProfile?.department?.name, pageLimit]); // Don't include toast or currentPage to prevent unnecessary re-renders

  const handleStatusUpdate = async (id: string, newStatus: string) => {
    try {
      const result = await apiClient.updateInvoiceRequestStatus(id, { status: newStatus });
      if (result.success) {
        toast({
          title: 'Success',
          description: 'Status updated successfully',
        });
        apiClient.invalidateCache('/invoice-requests');
        fetchInvoiceRequests(currentPage, false); // Skip cache after status update
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.error || 'Failed to update status',
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to update status',
      });
    }
  };

  const handleDeliveryStatusUpdate = async (id: string, newDeliveryStatus: string) => {
    try {
      const result = await apiClient.updateDeliveryStatus(id, { delivery_status: newDeliveryStatus });
      if (result.success) {
        toast({
          title: 'Success',
          description: 'Delivery status updated successfully',
        });
        apiClient.invalidateCache('/invoice-requests');
        fetchInvoiceRequests(currentPage, false); // Skip cache after status update
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.error || 'Failed to update delivery status',
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to update delivery status',
      });
    }
  };

  const handleWeightUpdate = async (id: string, weight: number) => {
    try {
      const result = await apiClient.updateWeight(id, { weight });
      if (result.success) {
        toast({
          title: 'Success',
          description: 'Weight updated successfully',
        });
        apiClient.invalidateCache('/invoice-requests');
        fetchInvoiceRequests(currentPage, false); // Skip cache after verification complete
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.error || 'Failed to update weight',
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to update weight',
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to cancel and delete this invoice request? This action cannot be undone.')) return;

    try {
      const result = await apiClient.deleteInvoiceRequest(id);
      if (result.success) {
        toast({
          title: 'Success',
          description: 'Invoice request cancelled and deleted successfully',
        });
        apiClient.invalidateCache('/invoice-requests');
        fetchInvoiceRequests(currentPage, false); // Skip cache after verification complete
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.error || 'Failed to delete invoice request',
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to delete invoice request',
      });
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return 'bg-gray-500 text-white';
      case 'SUBMITTED':
        return 'bg-blue-500 text-white';
      case 'IN_PROGRESS':
        return 'bg-yellow-500 text-white';
      case 'VERIFIED':
        return 'bg-purple-500 text-white';
      case 'COMPLETED':
        return 'bg-green-500 text-white';
      case 'CANCELLED':
        return 'bg-red-500 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  const getDeliveryStatusBadgeColor = (deliveryStatus?: string) => {
    if (!deliveryStatus) return 'bg-gray-500 text-white';
    switch (deliveryStatus) {
      case 'PENDING':
        return 'bg-gray-500 text-white';
      case 'DELIVERED':
        return 'bg-green-500 text-white';
      case 'CANCELLED':
        return 'bg-red-500 text-white';
      // Handle legacy statuses for backward compatibility
      case 'PICKED_UP':
      case 'IN_TRANSIT':
        return 'bg-blue-500 text-white';
      case 'FAILED':
        return 'bg-red-500 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  // Memoize visible requests to avoid recalculating on every render
  const visibleRequests = useMemo(() => {
    return getVisibleRequests();
  }, [invoiceRequests, statusFilter, userProfile?.department?.name]);
  
  // Ensure visibleRequests is always an array
  const safeVisibleRequests = Array.isArray(visibleRequests) ? visibleRequests : [];
  
  // Search bookings by AWB when user types
  useEffect(() => {
      if (!awbSearch.trim()) {
        setFoundBookings([]);
        setAwbSuggestions([]);
        return;
      }

      // Debounce search
      const timeoutId = setTimeout(async () => {
        try {
          setSearchingBookings(true);
          const result = await apiClient.searchBookingsByAwb(awbSearch.trim());
          if (result.success && result.data) {
            const bookings = Array.isArray(result.data) ? result.data : [];
            setFoundBookings(bookings);
            
            // Extract AWB numbers for suggestions
            const awbNumbers = bookings
              .map((booking: any) => 
                booking.awb || 
                booking.tracking_code || 
                booking.awb_number || 
                ''
              )
              .filter((awb: string) => awb && awb.toLowerCase().includes(awbSearch.toLowerCase().trim()))
              .slice(0, 10);
            setAwbSuggestions(awbNumbers);
          } else {
            setFoundBookings([]);
            setAwbSuggestions([]);
          }
        } catch (error) {
        secureLog.error('Error searching bookings by AWB', error);
          setFoundBookings([]);
          setAwbSuggestions([]);
        } finally {
          setSearchingBookings(false);
        }
      }, 300); // 300ms debounce

      return () => clearTimeout(timeoutId);
  }, [awbSearch]);

  // Intelligent name search - automatically filters as user types
  useEffect(() => {
    const searchByName = async () => {
      if (!nameSearch.trim() || nameSearch.trim().length < 2) {
        setNameSearchResults([]);
        setNameSearchAwbs([]);
        return;
      }

      try {
        setSearchingByName(true);
        
        // Intelligently split name: first word = firstName, rest = lastName
        const nameParts = nameSearch.trim().split(/\s+/);
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || nameParts[0] || ''; // If only one word, use it for both
        
        const result = await apiClient.searchAwbByName(
          firstName,
          lastName
        );

        if (result.success && result.data) {
          const bookings = Array.isArray(result.data) ? result.data : [];
          setNameSearchResults(bookings);
          
          // Extract AWB numbers from search results
          const awbs = bookings
            .map((booking: any) => {
              return (
                booking.awb ||
                booking.tracking_code ||
                booking.awb_number ||
                booking.request_id?.awb ||
                booking.request_id?.tracking_code ||
                booking.request_id?.awb_number ||
                null
              );
            })
            .filter((awb: string | null) => awb && awb.trim() !== '');
          
          setNameSearchAwbs(awbs as string[]);
          secureLog.debug('Name search results', { awbCount: awbs.length, bookingCount: bookings.length });
        } else {
          setNameSearchResults([]);
          setNameSearchAwbs([]);
        }
      } catch (error) {
        secureLog.error('Error searching by name', error);
        setNameSearchResults([]);
        setNameSearchAwbs([]);
      } finally {
        setSearchingByName(false);
      }
    };

    // Debounce the search (300ms for faster response)
    const timer = setTimeout(() => {
      searchByName();
    }, 300);

    return () => clearTimeout(timer);
  }, [nameSearch]);

  // Memoize filtered requests to avoid expensive filtering on every render
  const filteredRequests = useMemo(() => {
    // Early return if no search filters are active
    if (!awbSearch.trim() && !nameSearch.trim()) {
      return safeVisibleRequests;
    }

    return safeVisibleRequests.filter(request => {
    // If AWB search is active, filter by found bookings
    if (awbSearch.trim() && foundBookings.length > 0) {
      const requestAwb = getAwbNumber(request).toLowerCase().trim();
      const matchesAwb = foundBookings.some((booking: any) => {
        const bookingAwb = (
          booking.awb || 
          booking.tracking_code || 
          booking.awb_number || 
          ''
        ).toLowerCase().trim();
        return bookingAwb === requestAwb;
      });
      
      // If name search is also active, check both
      if (nameSearch.trim()) {
        const requestAwbForName = getAwbNumber(request).toLowerCase();
        const matchesName = nameSearchAwbs.length > 0 && nameSearchAwbs.some(awb => 
          requestAwbForName === awb.toLowerCase()
        );
        return matchesAwb && matchesName;
      }
      
      return matchesAwb;
    }
    
    // Fallback to frontend filtering if no backend results
    const awbMatch = !awbSearch.trim() || 
      getAwbNumber(request).toLowerCase().includes(awbSearch.toLowerCase().trim());
    
    // Name search filter - check customer name directly first, then AWB matching
    const nameMatch = !nameSearch.trim() || 
      // Primary: Direct customer name matching (most reliable)
      (request.customer_name && request.customer_name.toLowerCase().includes(nameSearch.toLowerCase().trim())) ||
      // Secondary: Check if request AWB is in the name search results
      (nameSearchAwbs.length > 0 && nameSearchAwbs.some(awb => {
        const requestAwb = getAwbNumber(request).toLowerCase().trim();
        const searchAwb = awb.toLowerCase().trim();
        
        // Try exact match first
        if (requestAwb === searchAwb) return true;
        // Try partial match (in case of formatting differences)
        if (requestAwb && searchAwb && (requestAwb.includes(searchAwb) || searchAwb.includes(requestAwb))) {
          return true;
        }
        return false;
      })) ||
      // Fallback: Also check receiver name
      (request.receiver_name && request.receiver_name.toLowerCase().includes(nameSearch.toLowerCase().trim()));
    
    return awbMatch && nameMatch;
  });
  }, [safeVisibleRequests, awbSearch, nameSearch, foundBookings, nameSearchAwbs]);

  // Department-specific actions
  const handleOperationsAction = async (id: string, action: string) => {
    try {
      let result;
      if (action === 'start') {
        result = await apiClient.updateInvoiceRequestStatus(id, { status: 'IN_PROGRESS' });
      } else if (action === 'complete') {
        result = await apiClient.updateInvoiceRequestStatus(id, { status: 'IN_PROGRESS' });
        await apiClient.updateDeliveryStatus(id, { delivery_status: 'DELIVERED' });
      }
      
      if (result?.success) {
        toast({
          title: 'Success',
          description: 'Request updated successfully',
        });
        apiClient.invalidateCache('/invoice-requests');
        fetchInvoiceRequests(currentPage, false); // Skip cache after verification complete
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to update request',
      });
    }
  };

  // Handle badge click for Sales users to view booking details
  const handleBadgeClick = async (request: any) => {
    if (userProfile?.department?.name !== 'Sales') return;
    
    setLoadingBooking(true);
    setShowBookingModal(true);
    
    try {
      // First, check if booking data is already embedded in the request
      let bookingData = null;
      
      // Check various locations for embedded booking data
      if (request.booking && typeof request.booking === 'object') {
        bookingData = request.booking;
      } else if (request.request_id && typeof request.request_id === 'object') {
        // request_id might be the booking object
        if (request.request_id.sender || request.request_id.receiver || request.request_id.service) {
          bookingData = request.request_id;
        }
      }
      
      // If we have booking data, use it directly
      if (bookingData) {
        secureLog.debug('Using embedded booking data');
        setSelectedBooking(bookingData);
        setLoadingBooking(false);
        return;
      }
      
      // Otherwise, try to fetch booking by ID
      // Try to get booking ID from various possible locations
      const bookingId = 
        request.booking_id ||
        request.request_id?.booking_id ||
        request.request_id?._id ||
        request.booking?._id;
      
      // If no booking ID found, use request as booking data
      if (!bookingId) {
        secureLog.debug('No booking ID found, using request data');
        setSelectedBooking(request);
        setLoadingBooking(false);
        return;
      }
      
      // Validate booking ID format (should be a valid MongoDB ObjectId or string)
      if (typeof bookingId !== 'string' || bookingId.trim().length === 0) {
        secureLog.warn('Invalid booking ID format, using request data');
        setSelectedBooking(request);
        setLoadingBooking(false);
        return;
      }
      
      secureLog.debug('Fetching booking', { bookingId: bookingId?.substring(0, 20) });
      const result = await apiClient.getBooking(bookingId.trim());
      
      if (result.success && result.data) {
        setSelectedBooking(result.data);
      } else {
        // If booking not found via API, try using embedded data
        let fallbackData = null;
        
        if (request.request_id && typeof request.request_id === 'object') {
          // Check if request_id looks like booking data
          if (request.request_id.sender || request.request_id.receiver || request.request_id.service) {
            fallbackData = request.request_id;
          }
        }
        
        if (!fallbackData) {
          // Use request as booking data (some requests are bookings)
          fallbackData = request;
        }
        
        setSelectedBooking(fallbackData);
        
        // Only show warning if it's not a 404 (not found is expected sometimes)
        const errorMsg = result.error || '';
        if (errorMsg && !errorMsg.includes('404') && !errorMsg.includes('Not Found') && !errorMsg.includes('Request failed')) {
          toast({
            variant: 'destructive',
            title: 'Warning',
            description: errorMsg,
          });
        }
      }
    } catch (error: any) {
      secureLog.error('Error fetching booking', error);
      
      // Try to use request data as fallback
      if (request.request_id && typeof request.request_id === 'object') {
        setSelectedBooking(request.request_id);
      } else {
        setSelectedBooking(request);
      }
      
      // Only show error if we can't use fallback data
      const errorMessage = error?.message || error?.error || 'Failed to fetch booking details';
      if (!errorMessage.includes('404') && !errorMessage.includes('Not Found')) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: errorMessage,
        });
      }
    } finally {
      setLoadingBooking(false);
    }
  };

  const handleFinanceAction = async (id: string) => {
    try {
      // Find the request first
      const request = invoiceRequests.find((req: any) => req._id === id);
      if (request) {
        const existingBatch =
          request.batch_number ||
          request.invoice_number ||
          request.request_id?.batch_number ||
          '';
        setSelectedRequestForInvoice(request);
        setShowTaxInputDialog(true);
        setCustomerTRN('');
        setBatchNumber(existingBatch);
        setPickupCharge('');
        setDeliveryCharge('');
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to prepare invoice generation',
      });
    }
  };

  const handleDeliveryToggle = (checked: boolean) => {
    setHasDelivery(checked);
  };

  const formatWeightValue = (weight: any) => {
    if (weight === null || weight === undefined) return null;
    try {
      let parsed;
      if (typeof weight === 'object') {
        if ('$numberDecimal' in weight) {
          parsed = parseFloat(weight.$numberDecimal);
        } else if (typeof weight.toString === 'function') {
          parsed = parseFloat(weight.toString());
        } else {
          parsed = parseFloat(String(weight));
        }
      } else {
        parsed = parseFloat(String(weight));
      }
      if (!isFinite(parsed) || isNaN(parsed)) {
        return null;
      }
      return parsed.toFixed(2);
    } catch (error) {
      secureLog.error('Error parsing weight', error);
      return null;
    }
  };

  const formatDateLabel = (value?: string | Date) => {
    if (!value) return '—';
    try {
      const date = typeof value === 'string' ? new Date(value) : value;
      if (isNaN(date.getTime())) return '—';
      return date.toLocaleDateString(undefined, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return typeof value === 'string' ? value : '—';
    }
  };

  const formatServiceCode = (code?: string | null) => {
    if (!code) return 'N/A';
    return code
      .toString()
      .trim()
      .replace(/_/g, ' → ')
      .replace(/\s+/g, ' ');
  };

  const handleExportToExcel = async () => {
    try {
      // Dynamically import XLSX only when needed
      const XLSX = await import('xlsx');
      
      secureLog.debug('Exporting invoice requests to Excel');
      
      // Prepare data for export
      const dataToExport = filteredRequests.map((request) => {
        // Extract invoice number
        let invoiceNumber = 
          request.invoice_number ||
          request.tracking_code ||
          (request._id ? request._id.slice(-8) : '');
        
        // Format invoice number with INV- prefix
        let formattedInvoiceNumber = 'N/A';
        if (invoiceNumber && invoiceNumber !== 'N/A') {
          if (invoiceNumber.startsWith('INV-')) {
            formattedInvoiceNumber = invoiceNumber;
          } else {
            // Extract numeric part or use last 6 characters
            const numericPart = invoiceNumber.replace(/\D/g, '').slice(-6) || invoiceNumber.slice(-6);
            formattedInvoiceNumber = `INV-${numericPart.padStart(6, '0')}`;
          }
        }
        
        // Format created date
        const createdDate = formatDateLabel(request.createdAt);
        
        // Extract AWB number
        const awbNumber = 
          request.tracking_code ||
          request.awb_number ||
          request.request_id?.tracking_code ||
          request.request_id?.awb_number ||
          'N/A';
        
        // Extract customer name
        const customer = request.customer_name || 'N/A';
        
        // Extract sender phone number
        const senderPhone = 
          request.customer_phone ||
          request.sender_phone ||
          'N/A';
        
        // Extract receiver name
        const receiver = request.receiver_name || 'N/A';
        
        // Extract receiver phone number
        const receiverPhone = 
          request.receiver_phone ||
          request.verification?.receiver_phone ||
          'N/A';
        
        // Extract route (origin to destination)
        const routeFrom = request.origin_place || 'Not set';
        const routeTo = request.destination_place || 'Not set';
        const route = `${routeFrom} → ${routeTo}`;
        
        // Extract shipment type
        const shipmentType = request.shipment_type === 'DOCUMENT' ? 'Document' : 'Non-Document';
        
        // Extract weight
        const weight = formatWeightValue(request.weight) ||
                     formatWeightValue(request.weight_kg) ||
                     formatWeightValue(request.verification?.actual_weight) ||
                     'N/A';
        
        // Extract boxes
        const boxes = 
          request.verification?.number_of_boxes ||
          request.number_of_boxes ||
          request.verification?.boxes?.length ||
          'N/A';
        
        return {
          'Invoice Number': formattedInvoiceNumber,
          'Created Date': createdDate,
          'Status': request.status || 'N/A',
          'Delivery Status': request.delivery_status || 'PENDING',
          'AWB Number': awbNumber,
          'Customer': customer,
          'Sender Phone': senderPhone,
          'Receiver': receiver,
          'Receiver Phone': receiverPhone,
          'Route': route,
          'Shipment': shipmentType,
          'Non-Document': shipmentType === 'Non-Document' ? 'Yes' : 'No',
          'Weight': weight !== 'N/A' ? `${weight} kg` : 'N/A',
          'Boxes': boxes,
        };
      });
      
      // Create worksheet
      const ws = XLSX.utils.json_to_sheet(dataToExport);
      
      // Create workbook
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Invoice Requests');
      
      // Generate filename with timestamp
      const filename = `invoice-requests-${new Date().toISOString().split('T')[0]}.xlsx`;
      
      // Export file
      XLSX.writeFile(wb, filename);
      
      toast({
        title: "Export Successful",
        description: `${dataToExport.length} invoice requests have been exported to ${filename}`,
      });
    } catch (error) {
      secureLog.error('Failed to export Excel file', error);
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: "There was an error exporting the Excel file.",
      });
    }
  };

  const renderActionControls = (request: any) => {
    if (!userProfile) return null;
    const departmentName = userProfile.department.name;

    if (departmentName === 'Sales') {
      return (
        <>
          {request.status === 'DRAFT' && (
            <Button
              size="sm"
              onClick={() => handleStatusUpdate(request._id, 'SUBMITTED')}
            >
              Submit
            </Button>
          )}
          {request.status !== 'COMPLETED' && request.status !== 'CANCELLED' && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => handleDelete(request._id)}
            >
              Cancel & Delete
            </Button>
          )}
        </>
      );
    }

    if (departmentName === 'Operations') {
      return (
        <>
          {request.status === 'SUBMITTED' && (
            <Button
              size="sm"
              onClick={() => handleOperationsAction(request._id, 'start')}
            >
              Start Processing
            </Button>
          )}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Delivery</span>
            <Select
              value={request.delivery_status}
              onValueChange={(value) => handleDeliveryStatusUpdate(request._id, value)}
            >
              <SelectTrigger className="h-9 w-32 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="DELIVERED">Delivered</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      );
    }

    if (departmentName === 'Finance' && request.status === 'VERIFIED') {
      return (
        <Button size="sm" onClick={() => handleFinanceAction(request._id)}>
          Generate Invoice
        </Button>
      );
    }

    return null;
  };

  const handleGenerateInvoices = async () => {
    if (!selectedRequestForInvoice) return;
    if (!batchNumber.trim()) {
      toast({
        variant: 'destructive',
        title: 'Batch Number Required',
        description: 'Please enter a batch number before generating the invoice.',
      });
      return;
    }

    // Validate pickup charge if needed
    if (needsPickupCharge) {
      const parsedPickup = parseFloat(pickupCharge);
      if (!pickupCharge.trim() || isNaN(parsedPickup) || parsedPickup <= 0) {
        toast({
          variant: 'destructive',
          title: 'Pickup Charge Required',
          description: 'Please enter a positive pickup charge amount.',
        });
        return;
      }
    }

    // Validate delivery charge if needed
    if (needsDeliveryCharge) {
      const parsedDelivery = parseFloat(deliveryCharge);
      if (!deliveryCharge.trim() || isNaN(parsedDelivery) || parsedDelivery <= 0) {
        toast({
          variant: 'destructive',
          title: 'Delivery Charge Required',
          description: 'Please enter a positive delivery charge amount.',
        });
        return;
      }
    }

    try {
      const serviceCode = getRequestServiceCode(selectedRequestForInvoice);
      const isUaeToPh = isUaeToPhService(serviceCode);
      const taxRateForRequest = getAutoTaxRate(selectedRequestForInvoice);

      // Get pickup and delivery charges from user input (manual entry only)
      const pickupChargeValue = needsPickupCharge ? parseFloat(pickupCharge) : 0;
      const deliveryChargeValue = needsDeliveryCharge ? parseFloat(deliveryCharge) : 0;

      // Compute insurance charge based on selection
      let insuranceChargeValue = 0;
      if (insuranceOption === 'percent') {
        const declared = getDeclaredAmount(selectedRequestForInvoice);
        if (declared <= 0) {
          toast({
            variant: 'destructive',
            title: 'Declared Amount Required',
            description: 'Declared amount is required to calculate 1% insurance.',
          });
          return;
        }
        insuranceChargeValue = parseFloat((declared * 0.01).toFixed(2));
      } else if (insuranceOption === 'fixed') {
        if (fixedInsuranceType === 'mobile') {
          insuranceChargeValue = 300;
        } else if (fixedInsuranceType === 'laptop') {
          insuranceChargeValue = 450;
        } else {
          const manual = parseFloat(insuranceManualAmount);
          if (!insuranceManualAmount.trim() || isNaN(manual) || manual <= 0) {
            toast({
              variant: 'destructive',
              title: 'Insurance Amount Required',
              description: 'Enter a positive insurance amount for Other.',
            });
            return;
          }
          insuranceChargeValue = parseFloat(manual.toFixed(2));
        }
      }
      
      // Convert request to invoice data
      const invoiceData = convertRequestToInvoiceData(
        selectedRequestForInvoice,
        taxRateForRequest,
        undefined,
        { 
          batchNumber, 
          pickupCharge: pickupChargeValue > 0 ? pickupChargeValue : undefined,
          deliveryCharge: deliveryChargeValue > 0 ? deliveryChargeValue : undefined,
          insuranceCharge: insuranceChargeValue > 0 ? insuranceChargeValue : undefined,
          hasDelivery: isPhToUaeSelected ? hasDelivery : false, // Only for PH TO UAE
          deliveryBaseAmount: isPhToUaeSelected && hasDelivery ? parseFloat(deliveryBaseAmount) || 20 : undefined, // Base delivery amount for PH_TO_UAE
          customerTRN: customerTRN || undefined // Pass customer TRN to invoice data
        }
      );
      
      // Validate invoice data
      if (!invoiceData) {
        throw new Error('Failed to convert request to invoice data');
      }
      
      if (!invoiceData.lineItems || !Array.isArray(invoiceData.lineItems)) {
        throw new Error('Invoice data line items are missing or invalid');
      }
      
      // Create invoice in database
      console.log('Selected request for invoice:', selectedRequestForInvoice);
      console.log('Client ID from request:', (selectedRequestForInvoice as any).client_id);
      
      // For now, we'll create a client record from the customer information
      // In the future, you might want to add client_id to the InvoiceRequest schema
      const clientData = {
        company_name: (selectedRequestForInvoice as any).customer_name,
        contact_name: (selectedRequestForInvoice as any).customer_name,
        email: (selectedRequestForInvoice as any).customer_email || 'customer@example.com',
        phone: (selectedRequestForInvoice as any).customer_phone || '+971XXXXXXXXX',
        address: (selectedRequestForInvoice as any).origin_place || 'Address not provided',
        city: (selectedRequestForInvoice as any).origin_place || 'Dubai', // Use origin place as city
        country: 'UAE' // Default to UAE since this is a UAE-based company
      };
      
      // Create client first
      secureLog.debug('Creating client', { companyName: clientData.company_name?.substring(0, 30) });
      const clientResult = await apiClient.createClient(clientData);
      
      if (!clientResult.success) {
        secureLog.error('Client creation failed', clientResult.error);
        toast({
          variant: 'destructive',
          title: 'Client Creation Failed',
          description: clientResult.error || 'Failed to create client'
        });
        throw new Error('Failed to create client: ' + clientResult.error);
      }
      
      // Extract client ID from the result
      const clientResultData = clientResult.data as any;
      const clientId = clientResultData?.data?._id || clientResultData?._id || clientResultData?.id;
      
      if (!clientId) {
        secureLog.error('No client ID found in result');
        toast({
          variant: 'destructive',
          title: 'Client Creation Failed',
          description: 'Client was created but no ID was returned'
        });
        throw new Error('Client was created but no ID was returned');
      }
      
      console.log('Client created successfully with ID:', clientId);
      
      // Extract shipment classification for tax calculation
      const getShipmentClassification = (request: any): string | undefined => {
        // First, try to get from verification.shipment_classification
        const verificationClassification = 
          request.verification?.shipment_classification ||
          request.request_id?.verification?.shipment_classification;
        
        if (verificationClassification) {
          return verificationClassification.toUpperCase();
        }
        
        // If not found, check boxes for classification
        const boxes = request.verification?.boxes || request.request_id?.verification?.boxes || [];
        if (Array.isArray(boxes) && boxes.length > 0) {
          // Check if any box is FLOWMIC or COMMERCIAL
          const hasFlowmic = boxes.some((box: any) => {
            const classification = (box.classification || '').toUpperCase();
            return classification === 'FLOWMIC' || classification === 'PERSONAL';
          });
          const hasCommercial = boxes.some((box: any) => {
            const classification = (box.classification || '').toUpperCase();
            return classification === 'COMMERCIAL';
          });
          
          if (hasCommercial) return 'COMMERCIAL';
          if (hasFlowmic) return 'FLOWMIC';
        }
        
        // Check top-level shipment classification
        const topLevelClassification = 
          request.shipment?.classification ||
          request.request_id?.shipment?.classification ||
          request.classification;
        
        if (topLevelClassification) {
          return topLevelClassification.toUpperCase();
        }
        
        // For PH_TO_UAE, default to GENERAL
        if (isPhToUaeSelected) {
          return 'GENERAL';
        }
        
        return undefined;
      };
      
      const shipmentClassification = getShipmentClassification(selectedRequestForInvoice);
      console.log('📦 Extracted shipment classification:', shipmentClassification);
      console.log('🚚 Service code (already extracted):', serviceCode);
      
      const invoiceResult = await apiClient.createInvoiceUnified({
        request_id: (selectedRequestForInvoice as any)._id,
        client_id: clientId,
        amount: invoiceData.baseAmount || invoiceData.charges.subtotal, // Use base amount WITHOUT tax
        line_items: invoiceData.lineItems.map(item => ({
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          total: item.total
        })),
        tax_rate: taxRateForRequest,
        service_code: serviceCode, // Send service code for backend route detection and tax calculation
        shipment_classification: shipmentClassification, // Send classification for backend tax calculation
        has_delivery: needsDeliveryCharge, // Pass delivery flag based on receiver_delivery_option
        delivery_base_amount: isPhToUaeSelected && hasDelivery ? (parseFloat(deliveryBaseAmount) || 20) : undefined, // Base delivery amount for PH_TO_UAE
        customer_trn: customerTRN || undefined,
        batch_number: batchNumber || undefined,
        notes: invoiceData.notes,
        created_by: (userProfile as any)?.employee_id || (userProfile as any)?._id,
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
      });
      
      secureLog.debug('Invoice creation result', { success: invoiceResult.success });
      
      if (invoiceResult.success) {
        // Automatically create delivery assignment with QR code for the invoice
        secureLog.debug('Creating delivery assignment with QR code');
        
        // Extract IDs properly
        const invoiceData = invoiceResult.data as any;
        const invoiceId = invoiceData?._id || invoiceData?.invoice_id;
        
        // Get request_id from the invoice request (which links to shipment request)
        let requestId = (selectedRequestForInvoice as any)?.request_id;
        
        // If request_id doesn't exist, use invoice request _id as fallback
        // Some invoice requests may not have an associated shipment request
        if (!requestId) {
          console.warn('⚠️ No shipment request_id found, using invoice request _id as fallback');
          requestId = (selectedRequestForInvoice as any)._id;
        }
        
        secureLog.debug('Invoice creation data', { invoiceId, requestId, clientId, hasAmount: !!invoiceData.totalAmount });
        
        // Validate IDs
        if (!invoiceId) {
          secureLog.error('Invoice ID is missing');
          toast({
            variant: 'destructive',
            title: 'Error',
            description: 'Invoice ID not found in response'
          });
          return;
        }
        
        if (!clientId) {
          secureLog.error('Client ID is missing');
          toast({
            variant: 'destructive',
            title: 'Error',
            description: 'Client information missing'
          });
          return;
        }
        
        // Get the actual total amount from the created invoice
        const invoiceTotalAmount = invoiceData?.total_amount || invoiceData?.amount || invoiceData?.totalAmount || 0;
        
        const deliveryAssignmentData = {
          request_id: requestId,
          driver_id: '', // No driver assigned - anyone can collect payment
          invoice_id: invoiceId,
          client_id: clientId,
          amount: invoiceTotalAmount,
          delivery_type: 'COD',
          delivery_address: (selectedRequestForInvoice as any).receiver?.address || 'Address to be confirmed',
          delivery_instructions: 'Deliver to customer address. Driver will use QR code for payment verification.'
        };

        secureLog.debug('Creating delivery assignment', { invoiceId, requestId, amount: invoiceTotalAmount });
        
        const assignmentResult = await apiClient.createDeliveryAssignment(deliveryAssignmentData);
        
        if (assignmentResult.success) {
          const assignmentData = assignmentResult.data as any;
          secureLog.success('Delivery assignment created', { hasQrUrl: !!assignmentData?.qr_url });

          // Create collection entry for payment tracking
          try {
            const collectionResult = await apiClient.createCollection({
              invoice_id: invoiceId,
              client_name: invoiceData?.client_id?.company_name || 'Unknown Client',
              amount: invoiceData?.totalAmount || invoiceTotalAmount,
              due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
              invoice_request_id: (selectedRequestForInvoice as any)?._id
            });
            
            if (collectionResult.success) {
              secureLog.success('Collection entry created');
            }
          } catch (collectionError) {
            secureLog.error('Failed to create collection entry', collectionError);
          }

          // Update shipment status
          try {
            if (requestId) {
              await apiClient.updateShipmentStatus(requestId, {
              delivery_status: 'DELIVERED'
            });
            secureLog.success('Shipment status updated');
            } else {
              console.warn('⚠️ Skipping shipment status update: requestId is missing');
            }
          } catch (statusError) {
            console.error('❌ Failed to update shipment status:', statusError);
          }
        } else {
          console.error('❌ Failed to create delivery assignment:', assignmentResult);
          console.error('❌ Error details:', assignmentResult.error);
          console.error('❌ Full response:', JSON.stringify(assignmentResult, null, 2));
          
          toast({
            variant: 'destructive',
            title: 'Warning',
            description: `Invoice created but QR code generation failed: ${assignmentResult.error || 'Unknown error'}. You can generate QR code later.`,
          });
        }

        // Update invoice request status to completed (delivery status stays as is)
        const result = await apiClient.updateInvoiceRequestStatus((selectedRequestForInvoice as any)._id, { 
          status: 'COMPLETED'
        });
        if (result.success) {
          toast({
            title: 'Success',
            description: 'Invoice created with QR code and request completed successfully',
          });
          
          // Get invoice ID and redirect to invoice page
          const invoiceDataResult = invoiceResult.data as any;
          const invoiceId = invoiceDataResult?._id || invoiceDataResult?.invoice_id;
          if (invoiceId) {
            setShowTaxInputDialog(false);
            setCustomerTRN('');
            setBatchNumber('');
            setPickupCharge('');
            setDeliveryCharge('');
            fetchInvoiceRequests(currentPage, false); // Skip cache to get fresh data after invoice generation
            // Redirect to invoice page
            router.push(`/dashboard/invoices/${invoiceId}`);
          } else {
            toast({
              variant: 'destructive',
              title: 'Error',
              description: 'Invoice created but could not redirect. Please find the invoice manually.',
            });
            setShowTaxInputDialog(false);
            setCustomerTRN('');
            setBatchNumber('');
            setPickupCharge('');
            setDeliveryCharge('');
            fetchInvoiceRequests(currentPage, false); // Skip cache to get fresh data after invoice generation
          }
        }
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to create invoice in database',
        });
      }
    } catch (error) {
      console.error('Error generating invoices:', error);
      
      let errorMessage = 'Failed to complete request';
      
      // Check if it's a duplicate invoice error
      if (error instanceof Error && (error.message.includes('duplicate') || error.message.includes('already exists'))) {
        errorMessage = 'An invoice for this request already exists';
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      toast({
        variant: 'destructive',
        title: 'Error',
        description: errorMessage,
      });
    }
  };

  const convertRequestToInvoiceData = (
    request: any,
    taxRateOverride?: number,
    qrCodeData?: any,
    options: { 
      mode?: 'normal' | 'tax'; 
      batchNumber?: string; 
      pickupCharge?: number;
      deliveryCharge?: number;
      insuranceCharge?: number;
      hasDelivery?: boolean; // For PH TO UAE automatic calculation
      deliveryBaseAmount?: number; // Base delivery amount for PH_TO_UAE (default 20)
      customerTRN?: string; // Customer TRN from invoice generation
    } = {}
  ) => {
    console.log('🔄 Converting request to invoice data...');
    console.log('📋 Request data:', request);
    console.log('💰 Tax rate override:', taxRateOverride);
    console.log('🔗 QR Code data:', qrCodeData);
    console.log('🧾 Options:', options);
    const fallbackId = (request._id || Date.now().toString()).toString();
    const invoiceNumber =
      request.invoice_number ||
      request.invoice_id ||
      request.request_id ||
      `INV-${fallbackId.slice(-6).padStart(6, '0')}`;
    const awbNumber =
      request.tracking_code ||
      request.awb_number ||
      request.request_id?.tracking_code ||
      `AWB-${fallbackId.slice(-6)}`;
    const trackingNumber = awbNumber;
    const senderName =
      request.customer_name ||
      request.sender_name ||
      request.client_id?.company_name ||
      'N/A';
    const senderAddress =
      request.origin_place ||
      request.sender_address ||
      request.verification?.sender_address ||
      'N/A';
    const senderPhone =
      request.customer_phone ||
      request.sender_phone ||
      request.client_id?.contact_phone ||
      request.client_id?.phone ||
      '+971XXXXXXXXX';
    const senderEmail =
      request.customer_email ||
      request.sender_email ||
      request.client_id?.contact_email ||
      request.client_id?.email ||
      '';
    
    // Calculate charges based on weight and rate
    // Priority: verification.total_kg (manual input) > chargeable_weight > actual_weight > weight
    // Convert Decimal128 to number if needed
    let weight = 0;
    
    // First priority: Use manual total_kg from verification (for Finance invoice generation)
    if (request.verification?.total_kg) {
      const totalKg = request.verification.total_kg;
      weight = typeof totalKg === 'object' && totalKg.$numberDecimal ? 
        parseFloat(totalKg.$numberDecimal) : 
        parseFloat(totalKg.toString());
    }
    // Second priority: Use chargeable_weight (system-calculated)
    else if (request.verification?.chargeable_weight) {
      const chargeableWeight = request.verification.chargeable_weight;
      weight = typeof chargeableWeight === 'object' && chargeableWeight.$numberDecimal ? 
        parseFloat(chargeableWeight.$numberDecimal) : 
        parseFloat(chargeableWeight.toString());
    }
    // Third priority: Use actual_weight
    else if (request.verification?.actual_weight) {
      const actualWeight = request.verification.actual_weight;
      weight = typeof actualWeight === 'object' && actualWeight.$numberDecimal ? 
        parseFloat(actualWeight.$numberDecimal) : 
        parseFloat(actualWeight.toString());
    }
    // Fallback: Use request.weight
    else if (request.weight) {
      weight = typeof request.weight === 'object' && request.weight.$numberDecimal ? 
        parseFloat(request.weight.$numberDecimal) : 
        parseFloat(request.weight.toString());
    }
    const serviceCode = getRequestServiceCode(request);
    const isPhToUae = isPhToUaeService(serviceCode);
    const isUaeToPh = isUaeToPhService(serviceCode);
    const mode = options.mode || 'normal';
    const providedBatchNumber = options.batchNumber;
    const isTaxMode = mode === 'tax';
    const rate = 31.00; // Default rate, you might want to make this configurable
    const shippingCharge = weight * rate;
    // Priority: verification.number_of_boxes (manual input) > shipment.number_of_boxes > request.number_of_boxes
    let numberOfBoxes = request.verification?.number_of_boxes || 
                       request.shipment?.number_of_boxes || 
                       request.number_of_boxes || 
                       1;
    numberOfBoxes = parseInt(numberOfBoxes, 10);
    if (!Number.isFinite(numberOfBoxes) || numberOfBoxes < 1) numberOfBoxes = 1;
    
    // Get pickup and delivery charges from options
    const pickupChargeValue = typeof options.pickupCharge === 'number' && options.pickupCharge > 0 
      ? parseFloat(options.pickupCharge.toFixed(2)) 
      : 0;
    const deliveryChargeValue = typeof options.deliveryCharge === 'number' && options.deliveryCharge > 0 
      ? parseFloat(options.deliveryCharge.toFixed(2)) 
      : 0;
    
    // Delivery charge calculation:
    // - UAE TO PH: Manual entry only (from user input)
    // - PH TO UAE: 
    //   * Normal Invoice: Fixed 25 AED
    //   * Tax Invoice: Automatic calculation based on weight and boxes with custom base amount
    const hasDeliveryFlag = options.hasDelivery || false;
    const baseDeliveryAmount = options.deliveryBaseAmount || 20; // Default to 20 if not provided
    let deliveryCharge = 0;
    if (isUaeToPh) {
      // UAE TO PH: Use manual entry
      deliveryCharge = deliveryChargeValue;
    } else if (isPhToUae) {
      // PH TO UAE: Different calculation based on invoice mode
      if (isTaxMode) {
        // Tax Invoice: Box-based calculation with custom base amount (only if delivery is required)
        if (hasDeliveryFlag) {
          deliveryCharge = weight > 30 ? 0 : (numberOfBoxes <= 1 ? baseDeliveryAmount : baseDeliveryAmount + ((numberOfBoxes - 1) * 5));
        } else {
          deliveryCharge = 0;
        }
      } else {
        // Normal Invoice: Use custom base amount (only if delivery is required)
        if (hasDeliveryFlag) {
          deliveryCharge = baseDeliveryAmount;
        } else {
          deliveryCharge = 0;
        }
      }
    }
    
    // Calculate insurance charge (PH→UAE: no insurance)
    let insuranceCharge = 0;
    if (!isPhToUae) {
      const insured = request.insured || 
                     request.request_id?.insured ||
                     request.booking?.insured ||
                     request.sender?.insured ||
                     request.request_id?.sender?.insured ||
                     false;
      const declaredAmount = getDeclaredAmount(request);
      
      // Calculate insurance charge (override wins): 
      // - If options.insuranceCharge provided, use it
      // - Else: 1% of declaredAmount if insured flag is true
      insuranceCharge = typeof options.insuranceCharge === 'number'
        ? parseFloat(options.insuranceCharge.toFixed(2))
        : (insured === true && declaredAmount > 0) 
          ? parseFloat((declaredAmount * 0.01).toFixed(2)) 
          : 0;
    }
    
    const subtotal = shippingCharge + pickupChargeValue + deliveryCharge + insuranceCharge;
    const fallbackTaxRate = isPhToUae ? 5 : 0;
    const effectiveTaxRate = typeof taxRateOverride === 'number' ? taxRateOverride : fallbackTaxRate;
    
    // Check if shipment is flowmic
    const boxes = request.verification?.boxes || request.request_id?.verification?.boxes || [];
    const isFlowmic = Array.isArray(boxes) && boxes.length > 0 && 
      boxes.some((box: any) => {
        const classification = (box.classification || '').toUpperCase();
        return classification === 'FLOWMIC';
      });
    
    // Calculate tax:
    // - If flowmic UAE to PH: 5% VAT included in subtotal (total = subtotal, VAT shown for display)
    // - Otherwise: Tax on delivery charge only (if present and PH to UAE)
    let taxAmount = 0;
    let taxRateForDelivery = 0;
    
    if (isFlowmic && isUaeToPh && effectiveTaxRate > 0) {
      // Flowmic UAE to PH: VAT is included in subtotal
      // Calculate VAT amount for display (5% of subtotal), but total = subtotal (VAT already included)
      taxAmount = (subtotal * effectiveTaxRate) / 100;
      taxRateForDelivery = effectiveTaxRate; // Store the rate for display
    } else if (isFlowmic && effectiveTaxRate > 0) {
      // Flowmic (non-UAE to PH): Apply 5% VAT on subtotal (add to total)
      taxAmount = (subtotal * effectiveTaxRate) / 100;
      taxRateForDelivery = effectiveTaxRate; // Store the rate for display
    } else {
      // Normal: Calculate tax on delivery charge only (pickup charge is typically not taxed)
      taxRateForDelivery = deliveryCharge > 0 ? effectiveTaxRate : 0;
      taxAmount = deliveryCharge > 0 && taxRateForDelivery > 0 ? (deliveryCharge * taxRateForDelivery) / 100 : 0;
    }
    
    // For flowmic UAE to PH: total = subtotal (VAT already included)
    // For others: total = subtotal + taxAmount
    const total = (isFlowmic && isUaeToPh) ? subtotal : (subtotal + taxAmount);

    const shouldShowDeliveryOnly = isTaxMode && isPhToUae && !isFlowmic; // Don't show delivery only for flowmic
    const displayShippingCharge = shouldShowDeliveryOnly ? 0 : shippingCharge;
    // For tax mode showing delivery only, insurance charge should still be included in subtotal
    const displaySubtotal = shouldShowDeliveryOnly ? (deliveryCharge + insuranceCharge) : subtotal;
    // For flowmic UAE to PH, tax is included in subtotal (total = subtotal)
    // For other flowmic, tax is calculated on subtotal (total = subtotal + tax)
    // For tax mode (non-flowmic), calculate tax on delivery charge only
    const displayTaxAmount = shouldShowDeliveryOnly 
      ? (deliveryCharge > 0 ? (deliveryCharge * taxRateForDelivery) / 100 : 0) 
      : taxAmount;
    // For flowmic UAE to PH: displayTotal = displaySubtotal (VAT already included)
    // For others: use the calculated total
    const displayTotal = (isFlowmic && isUaeToPh) 
      ? displaySubtotal 
      : (shouldShowDeliveryOnly ? (deliveryCharge + insuranceCharge) + displayTaxAmount : total);
    
    return {
      invoiceNumber,
      awbNumber,
      batchNumber: providedBatchNumber || request.batch_number || request.request_id?.batch_number || '',
      trackingNumber,
      date: new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }),
      receiverInfo: {
        name: request.receiver_name?.toUpperCase() || 'N/A',
        address: `${request.destination_place || request.verification?.receiver_address || 'N/A'}`,
        emirate: (() => {
          const destination = request.destination_place || request.verification?.receiver_address || '';
          const parts = destination.split(',').map((p: string) => p.trim()).filter(Boolean);
          if (parts.length >= 2) {
            return parts[parts.length - 2];
          }
          if (parts.length === 1) return parts[0];
          return 'N/A';
        })(),
        mobile: request.receiver_phone || request.verification?.receiver_phone || request.customer_phone || '+971XXXXXXXXX',
        trn: request.customer_trn || request.request_id?.customer_trn || options.customerTRN || undefined
      },
      senderInfo: {
        name: senderName,
        address: senderAddress,
        email: senderEmail || undefined,
        phone: senderPhone
      },
      shipmentDetails: {
        numberOfBoxes: numberOfBoxes,
        weight: weight,
        weightType: request.verification?.weight_type || 'ACTUAL',
        rate: rate
      },
      charges: {
        shippingCharge: displayShippingCharge,
        pickupCharge: pickupChargeValue,
        deliveryCharge: deliveryCharge,
        insuranceCharge: insuranceCharge,
        subtotal: displaySubtotal,
        taxRate: taxRateForDelivery,
        taxAmount: displayTaxAmount,
        total: displayTotal
      },
      remarks: {
        boxNumbers: request.verification?.listed_commodities || 'N/A',
        agent: request.verification?.agents_name || 'N/A',
        items: request.verification?.listed_commodities || 'N/A'
      },
      termsAndConditions: 'Cash Upon Receipt of Goods',
      qrCode: qrCodeData ? {
        url: qrCodeData.qr_url,
        code: qrCodeData.qr_code
      } : undefined,
      
      // Debug log
      _debugQR: qrCodeData ? 'QR data available' : 'QR data missing',
      // Additional properties for invoice creation
      lineItems: [
        {
          description: `Shipping - ${request.verification?.weight_type || 'ACTUAL'} weight`,
          quantity: 1,
          unitPrice: shippingCharge,
          total: shippingCharge
        },
        ...(pickupChargeValue > 0 ? [{
          description: 'Pickup Charge',
          quantity: 1,
          unitPrice: pickupChargeValue,
          total: pickupChargeValue
        }] : []),
        ...(deliveryCharge > 0 ? [{
          description: 'Delivery Charge',
          quantity: isUaeToPh ? 1 : (isPhToUae && !isTaxMode ? 1 : numberOfBoxes), // PH TO UAE Normal Invoice: 1, Tax Invoice: numberOfBoxes
          unitPrice: isUaeToPh ? deliveryCharge : (isPhToUae && !isTaxMode ? deliveryCharge : parseFloat((deliveryCharge / numberOfBoxes).toFixed(2))), // PH TO UAE Normal Invoice: fixed 25, Tax Invoice: divides by boxes
          total: deliveryCharge
        }] : []),
        ...(insuranceCharge > 0 ? [{
          description: 'Insurance Charge',
          quantity: 1,
          unitPrice: insuranceCharge,
          total: insuranceCharge
        }] : [])
      ],
      baseAmount: shippingCharge, // Base shipping amount (for invoice.amount field)
      totalAmount: shouldShowDeliveryOnly ? displayTotal : total, // Total amount with tax (for display)
      notes: `Invoice for request ${request.request_id || request._id}`
    };
  };

  if (!userProfile) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading invoice requests...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Invoice Requests</h1>
          <p className="text-muted-foreground">
            {userProfile.department.name === 'Sales' && 'Create and track your invoice requests'}
            {userProfile.department.name === 'Operations' && 'Process submitted invoice requests'}
            {userProfile.department.name === 'Finance' && 'Generate invoices for completed requests'}
          </p>
        </div>
        {userProfile.department.name === 'Sales' && (
          <InvoiceRequestForm 
            onRequestCreated={fetchInvoiceRequests}
            currentUser={userProfile}
          />
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="status-filter">Filter by Status</Label>
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value);
                  setCurrentPage(1); // Reset to first page when filter changes
                  fetchInvoiceRequests(1, false); // Fetch with new filter
                }}
              >
                <SelectTrigger id="status-filter">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="SUBMITTED">SUBMITTED</SelectItem>
                  <SelectItem value="IN_PROGRESS">IN_PROGRESS</SelectItem>
                  <SelectItem value="VERIFIED">VERIFIED</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {statusFilter && statusFilter !== 'all' 
                  ? `Showing only ${statusFilter} requests` 
                  : userProfile?.department?.name === 'Operations' 
                    ? 'Default: IN_PROGRESS (Operations)' 
                    : userProfile?.department?.name === 'Finance'
                      ? 'Default: VERIFIED (Finance)'
                      : 'Showing all statuses'}
              </p>
            </div>
            
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    setShowAwbSuggestions(false);
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
            <div className="relative">
              <Label htmlFor="name-search">Search by Customer Name</Label>
              <Input
                id="name-search"
                type="text"
                placeholder="Enter customer name (e.g., John Doe or John)..."
                value={nameSearch}
                onChange={(e) => setNameSearch(e.target.value)}
              />
              {searchingByName && (
                <p className="text-xs text-muted-foreground mt-1">Searching...</p>
              )}
              {!searchingByName && nameSearch.trim().length >= 2 && nameSearchAwbs.length > 0 && (
                <div className="mt-1 space-y-1">
                  <p className="text-xs text-green-600">
                  Found {nameSearchAwbs.length} AWB{nameSearchAwbs.length !== 1 ? 's' : ''}
                </p>
                  <div className="text-xs text-muted-foreground">
                    {nameSearchAwbs.map((awb, idx) => (
                      <p key={idx} className="font-mono">AWB: {awb}</p>
                    ))}
                  </div>
                  {filteredRequests.length === 0 && (
                    <p className="text-xs text-orange-600 mt-1">
                      No matching invoice requests found. The AWB may not be linked to an invoice request yet.
                    </p>
                  )}
                </div>
              )}
              {!searchingByName && nameSearch.trim().length >= 2 && nameSearchAwbs.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  No bookings found for this name
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AWB Suggestions Dropdown Portal */}
      {typeof window !== 'undefined' && showAwbSuggestions && (awbSuggestions.length > 0 || searchingBookings) && createPortal(
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
            {searchingBookings ? (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">Searching bookings...</div>
            ) : awbSuggestions.length === 0 && awbSearch.trim() ? (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">No bookings found</div>
            ) : (
              awbSuggestions.map((awb, index) => (
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
              ))
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Invoice Requests Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <CardTitle>
                Invoice Requests {pagination ? `(${pagination.displayText || `${pagination.startRecord || 0}-${pagination.endRecord || 0} of ${pagination.total || 0}`})` : `(${filteredRequests.length})`}
              </CardTitle>
              {pagination && (
                <p className="text-xs text-muted-foreground">
                  Optimized: Page {pagination.page || currentPage} of {pagination.pages || 1} 
                  {statusFilter && statusFilter !== 'all' ? ` (${statusFilter} status)` : 
                   userProfile?.department?.name === 'Operations' ? ' (IN_PROGRESS status)' :
                   userProfile?.department?.name === 'Finance' ? ' (VERIFIED status)' : ''}
                </p>
              )}
            </div>
            {filteredRequests.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportToExcel}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Download Excel
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="text-lg">Loading invoice requests...</div>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="flex flex-col items-center space-y-2 py-12 text-center">
              <Package className="h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground">No invoice requests right now</p>
              {userProfile.department.name === 'Sales' && (
                <p className="text-sm text-muted-foreground">
                  Create your first invoice request using the button above
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredRequests.map((request) => (
                <InvoiceRequestCard
                  key={request._id}
                  request={request}
                  userProfile={userProfile}
                  formatWeightValue={formatWeightValue}
                  formatDateLabel={formatDateLabel}
                  formatServiceCode={formatServiceCode}
                  getStatusBadgeColor={getStatusBadgeColor}
                  getDeliveryStatusBadgeColor={getDeliveryStatusBadgeColor}
                  renderActionControls={renderActionControls}
                  fetchInvoiceRequests={() => fetchInvoiceRequests(currentPage, false)}
                  onBadgeClick={handleBadgeClick}
                />
              ))}
            </div>
          )}
          
          {/* Pagination Controls */}
          {pagination && pagination.pages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                Showing {pagination.startRecord || ((currentPage - 1) * pageLimit + 1)} to {pagination.endRecord || (currentPage * pageLimit)} of {pagination.total || 0} results
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchInvoiceRequests(currentPage - 1, false)}
                  disabled={!pagination.hasPreviousPage || currentPage === 1 || loading}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <div className="text-sm text-muted-foreground px-2">
                  Page {currentPage} of {pagination.pages}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchInvoiceRequests(currentPage + 1, false)}
                  disabled={!pagination.hasNextPage || currentPage >= pagination.pages || loading}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tax Input Dialog */}
      {showTaxInputDialog && selectedRequestForInvoice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Invoice Generation</h2>
            <p className="text-gray-600 mb-4">
              Confirm whether delivery is required. VAT will be calculated automatically based on the service route.
            </p>

            {/* Pickup Charge - Shown only if sender_delivery_option is "pickup" */}
            {showPickupChargeField && (
              <div className="mb-4">
                <Label className="block text-sm font-medium text-gray-700 mb-2">
                  Pickup Charge (AED) *
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={pickupCharge}
                  onChange={(e) => setPickupCharge(e.target.value)}
                  placeholder="Enter pickup charge amount"
                  className="w-full"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Required when sender delivery option is "pickup".
                </p>
              </div>
            )}

            {/* Delivery Charge - Shown only if receiver_delivery_option is "delivery" */}
            {showDeliveryChargeField && (
              <div className="mb-4">
                <Label className="block text-sm font-medium text-gray-700 mb-2">
                  Delivery Charge (AED) *
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={deliveryCharge}
                  onChange={(e) => setDeliveryCharge(e.target.value)}
                  placeholder="Enter delivery charge amount"
                  className="w-full"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Required when receiver delivery option is "delivery".
                </p>
              </div>
            )}

            {/* PH TO UAE: Legacy Delivery Required checkbox (old method) */}
            {isPhToUaeSelected && (
              <div className="mb-4">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasDelivery}
                    onChange={(e) => handleDeliveryToggle(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Delivery Required
                  </span>
                </label>
                {hasDelivery && (
                  <div className="mt-3 ml-6 p-3 bg-blue-50 border border-blue-200 rounded-md">
                    <Label className="block text-sm font-medium text-gray-700 mb-2">
                      Base Delivery Amount (AED)
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={deliveryBaseAmount}
                      onChange={(e) => setDeliveryBaseAmount(e.target.value)}
                      placeholder="20"
                      className="w-full max-w-xs"
                    />
                    <p className="text-xs text-gray-500 mt-2">
                      Base amount for first box. Additional boxes: +5 AED each.
                      <br />
                      Example: Base 20 = 1 box (20), 2 boxes (25), 3 boxes (30)
                      <br />
                      Example: Base 27 = 1 box (27), 2 boxes (32), 3 boxes (37)
                    </p>
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-1 ml-6">
                  {hasDelivery 
                    ? `Delivery charge will be calculated based on weight and number of boxes (FREE if weight > 30kg, otherwise ${deliveryBaseAmount || 20} AED + 5 AED per additional box)`
                    : "No delivery charge will be applied"}
                </p>
              </div>
            )}

            <div className="mb-4">
              <Label className="block text-sm font-medium text-gray-700 mb-2">
                Customer TRN (optional)
              </Label>
              <Input
                value={customerTRN}
                onChange={(e) => setCustomerTRN(e.target.value.trim())}
                placeholder="Enter customer's TRN"
                className="w-full"
              />
              <p className="text-xs text-gray-500 mt-1">
                If provided, this TRN will be stored on the generated invoice.
              </p>
            </div>

            {!isPhToUaeSelected && (
              <div className="mb-4">
                <Label className="block text-sm font-medium text-gray-700 mb-2">
                  Insurance Amount
                </Label>
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="insurance-option"
                        value="none"
                        checked={insuranceOption === 'none'}
                        onChange={() => setInsuranceOption('none')}
                        className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                      />
                      <span className="text-sm">No insurance</span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="insurance-option"
                        value="percent"
                        checked={insuranceOption === 'percent'}
                        onChange={() => setInsuranceOption('percent')}
                        className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                      />
                      <span className="text-sm">1% of declared amount</span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="insurance-option"
                        value="fixed"
                        checked={insuranceOption === 'fixed'}
                        onChange={() => setInsuranceOption('fixed')}
                        className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                      />
                      <span className="text-sm">Fixed amount</span>
                    </label>
                  </div>

                  {insuranceOption === 'fixed' && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <button
                          type="button"
                          className={`border rounded px-3 py-2 text-sm ${fixedInsuranceType === 'mobile' ? 'border-green-600 text-green-700 font-semibold' : 'border-gray-300 text-gray-700'}`}
                          onClick={() => setFixedInsuranceType('mobile')}
                        >
                          Mobile (300 AED)
                        </button>
                        <button
                          type="button"
                          className={`border rounded px-3 py-2 text-sm ${fixedInsuranceType === 'laptop' ? 'border-green-600 text-green-700 font-semibold' : 'border-gray-300 text-gray-700'}`}
                          onClick={() => setFixedInsuranceType('laptop')}
                        >
                          Laptop (450 AED)
                        </button>
                        <button
                          type="button"
                          className={`border rounded px-3 py-2 text-sm ${fixedInsuranceType === 'other' ? 'border-green-600 text-green-700 font-semibold' : 'border-gray-300 text-gray-700'}`}
                          onClick={() => setFixedInsuranceType('other')}
                        >
                          Other
                        </button>
                      </div>
                      {fixedInsuranceType === 'other' && (
                        <div>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={insuranceManualAmount}
                            onChange={(e) => setInsuranceManualAmount(e.target.value)}
                            placeholder="Enter insurance amount (AED)"
                            className="w-full"
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Enter a custom insurance amount.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Choose 1% of declared value or a fixed amount (mobile 300, laptop 450, or custom).
                </p>
              </div>
            )}

            <div className="mb-4">
              <Label className="block text-sm font-medium text-gray-700 mb-2">
                Batch Number (required)
              </Label>
              <Input
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value.trim())}
                placeholder="Enter batch number"
                required
                className="w-full"
              />
              <p className="text-xs text-gray-500 mt-1">
                This value is mandatory and appears beneath the invoice number on previews/PDFs.
              </p>
            </div>

            {isUaeToPhSelected && (
              <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                UAE → PH shipments always use 0% VAT. Delivery charges must be entered manually based on delivery options.
              </div>
            )}
            
            {isPhToUaeSelected && (
              <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                PH → UAE shipments use automatic delivery charge calculation based on weight and number of boxes.
              </div>
            )}

            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowTaxInputDialog(false);
                  setSelectedRequestForInvoice(null);
                  setCustomerTRN('');
                  setBatchNumber('');
                  setPickupCharge('');
                  setDeliveryCharge('');
                  setDeliveryBaseAmount('20'); // Reset to default
                  setInsuranceOption('none');
                  setFixedInsuranceType('mobile');
                  setInsuranceManualAmount('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowShipmentDetailsDialog(true)}
                className="flex items-center gap-2"
              >
                <FileText className="h-4 w-4" />
                View
              </Button>
              <Button
                onClick={handleGenerateInvoices}
                className="bg-green-600 hover:bg-green-700"
                disabled={generateDisabled}
              >
                Generate Both Invoices
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Shipment Details Dialog */}
      {showShipmentDetailsDialog && selectedRequestForInvoice && (() => {
        // Helper function to safely parse Decimal128 and other numeric values
        const parseNumericValue = (value: any): number | string => {
          if (value === null || value === undefined || value === '') {
            return 'N/A';
          }
          if (typeof value === 'number') {
            return value;
          }
          if (typeof value === 'string') {
            const parsed = parseFloat(value);
            return isNaN(parsed) ? 'N/A' : parsed;
          }
          if (value && typeof value === 'object') {
            // Handle MongoDB Decimal128 format
            if (value.$numberDecimal) {
              return parseFloat(value.$numberDecimal);
            }
            if (typeof value.toString === 'function') {
              const parsed = parseFloat(value.toString());
              return isNaN(parsed) ? 'N/A' : parsed;
            }
          }
          return 'N/A';
        };

        const formatWeight = (value: any): string => {
          const parsed = parseNumericValue(value);
          if (parsed === 'N/A') return 'N/A';
          return `${typeof parsed === 'number' ? parsed.toFixed(2) : parsed} kg`;
        };

        return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Shipment Details</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowShipmentDetailsDialog(false)}
                >
                  <XCircle className="h-5 w-5" />
                </Button>
              </div>

              <div className="space-y-6">
                {/* Customer Information */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Package className="h-5 w-5" />
                      Customer Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-semibold text-gray-600">Customer Name</Label>
                      <p className="text-base">{selectedRequestForInvoice.customer_name || 'N/A'}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-600">Customer Phone</Label>
                      <p className="text-base">{selectedRequestForInvoice.customer_phone || 'N/A'}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-600">Customer Email</Label>
                      <p className="text-base">{selectedRequestForInvoice.customer_email || 'N/A'}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-600">Origin Place</Label>
                      <p className="text-base">{selectedRequestForInvoice.origin_place || 'N/A'}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-600">Sender Delivery Option</Label>
                      <p className="text-base">
                        <Badge variant={
                          (selectedRequestForInvoice.sender_delivery_option || 
                           selectedRequestForInvoice.request_id?.sender_delivery_option || 
                           selectedRequestForInvoice.booking?.sender_delivery_option) === 'pickup' 
                            ? 'default' 
                            : 'secondary'
                        }>
                          {(() => {
                            const senderOption = selectedRequestForInvoice.sender_delivery_option || 
                                                selectedRequestForInvoice.request_id?.sender_delivery_option || 
                                                selectedRequestForInvoice.booking?.sender_delivery_option || 
                                                'N/A';
                            if (senderOption === 'pickup') return 'Pickup';
                            if (senderOption === 'delivery') return 'Delivery';
                            return senderOption;
                          })()}
                        </Badge>
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Receiver Information */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="h-5 w-5" />
                      Receiver Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-semibold text-gray-600">Receiver Name</Label>
                      <p className="text-base">{selectedRequestForInvoice.receiver_name || 'N/A'}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-600">Receiver Phone</Label>
                      <p className="text-base">{selectedRequestForInvoice.receiver_phone || selectedRequestForInvoice.verification?.receiver_phone || 'N/A'}</p>
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-sm font-semibold text-gray-600">Receiver Address</Label>
                      <p className="text-base">{selectedRequestForInvoice.destination_place || selectedRequestForInvoice.verification?.receiver_address || 'N/A'}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-600">Receiver Delivery Option</Label>
                      <p className="text-base">
                        <Badge variant={
                          (selectedRequestForInvoice.receiver_delivery_option || 
                           selectedRequestForInvoice.request_id?.receiver_delivery_option || 
                           selectedRequestForInvoice.booking?.receiver_delivery_option) === 'delivery' 
                            ? 'default' 
                            : 'secondary'
                        }>
                          {(() => {
                            const receiverOption = selectedRequestForInvoice.receiver_delivery_option || 
                                                  selectedRequestForInvoice.request_id?.receiver_delivery_option || 
                                                  selectedRequestForInvoice.booking?.receiver_delivery_option || 
                                                  'N/A';
                            if (receiverOption === 'delivery') return 'Delivery';
                            if (receiverOption === 'pickup') return 'Pickup';
                            return receiverOption;
                          })()}
                        </Badge>
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Shipment Details */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Truck className="h-5 w-5" />
                      Shipment Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-semibold text-gray-600">Service Code</Label>
                      <p className="text-base">{formatServiceCode(selectedRequestForInvoice.service_code || selectedRequestForInvoice.verification?.service_code || 'N/A')}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-600">Shipment Type</Label>
                      <p className="text-base">{selectedRequestForInvoice.shipment_type || 'N/A'}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-600">AWB Number</Label>
                      <p className="text-base">{selectedRequestForInvoice.tracking_code || selectedRequestForInvoice.awb_number || 'N/A'}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-600">Invoice Number</Label>
                      <p className="text-base">{selectedRequestForInvoice.invoice_number || selectedRequestForInvoice.verification?.invoice_number || 'N/A'}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-600">Weight (kg)</Label>
                      <p className="text-base">
                        {formatWeight(selectedRequestForInvoice.verification?.actual_weight || 
                         selectedRequestForInvoice.weight)}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-600">Weight Type</Label>
                      <p className="text-base">{selectedRequestForInvoice.verification?.weight_type || 'N/A'}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-600">Number of Boxes</Label>
                      <p className="text-base">
                        {(() => {
                          const boxes = parseNumericValue(selectedRequestForInvoice.verification?.number_of_boxes);
                          return boxes === 'N/A' ? 'N/A' : boxes.toString();
                        })()}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-600">Volumetric Weight (VM)</Label>
                      <p className="text-base">
                        {formatWeight(selectedRequestForInvoice.verification?.total_vm)}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-600">Chargeable Weight</Label>
                      <p className="text-base">
                        {formatWeight(selectedRequestForInvoice.verification?.chargeable_weight)}
                      </p>
                    </div>
                    {/* Insurance Information - Only for UAE TO PH/PINAS service when insured is true */}
                    {(() => {
                      const serviceCode = selectedRequestForInvoice.service_code || 
                                        selectedRequestForInvoice.verification?.service_code ||
                                        selectedRequestForInvoice.request_id?.service_code ||
                                        '';
                      const isUaeToPh = isUaeToPhService(serviceCode);
                      const insured = selectedRequestForInvoice.insured || 
                                     selectedRequestForInvoice.verification?.insured ||
                                     selectedRequestForInvoice.request_id?.insured ||
                                     selectedRequestForInvoice.booking?.insured ||
                                     false;
                      const declaredAmount = selectedRequestForInvoice.declaredAmount || 
                                            selectedRequestForInvoice.declared_amount ||
                                            selectedRequestForInvoice.verification?.declared_value ||
                                            selectedRequestForInvoice.request_id?.declaredAmount ||
                                            selectedRequestForInvoice.request_id?.declared_amount ||
                                            selectedRequestForInvoice.booking?.declaredAmount ||
                                            selectedRequestForInvoice.booking?.declared_amount ||
                                            null;
                      
                      if (isUaeToPh && insured === true) {
                        const amount = declaredAmount ? parseNumericValue(declaredAmount) : null;
                        return (
                          <div>
                            <Label className="text-sm font-semibold text-gray-600">Insured Declared Value</Label>
                            <p className="text-base">
                              {amount && amount !== 'N/A' 
                                ? `${typeof amount === 'number' ? amount.toFixed(2) : amount} AED`
                                : 'Not set'}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    })()}
                    <div>
                      <Label className="text-sm font-semibold text-gray-600">Calculated Rate (AED/kg)</Label>
                      <p className="text-base">
                        {(() => {
                          const rate = parseNumericValue(selectedRequestForInvoice.verification?.calculated_rate);
                          if (rate === 'N/A') return 'N/A';
                          return typeof rate === 'number' ? rate.toFixed(2) : rate.toString();
                        })()}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Verification Details */}
                {selectedRequestForInvoice.verification && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <CheckCircle className="h-5 w-5" />
                        Verification Details
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm font-semibold text-gray-600">Agent Name</Label>
                        <p className="text-base">{selectedRequestForInvoice.verification.agents_name || 'N/A'}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-semibold text-gray-600">Shipment Classification</Label>
                        <p className="text-base">{selectedRequestForInvoice.verification.shipment_classification || 'N/A'}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-semibold text-gray-600">Cargo Service</Label>
                        <p className="text-base">{selectedRequestForInvoice.verification.cargo_service || 'N/A'}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-semibold text-gray-600">Rate Bracket</Label>
                        <p className="text-base">{selectedRequestForInvoice.verification.rate_bracket || 'N/A'}</p>
                      </div>
                      {selectedRequestForInvoice.verification.listed_commodities && (
                        <div className="md:col-span-2">
                          <Label className="text-sm font-semibold text-gray-600">Listed Commodities</Label>
                          <p className="text-base">{selectedRequestForInvoice.verification.listed_commodities}</p>
                        </div>
                      )}
                      {selectedRequestForInvoice.verification.verification_notes && (
                        <div className="md:col-span-2">
                          <Label className="text-sm font-semibold text-gray-600">Verification Notes</Label>
                          <p className="text-base">{selectedRequestForInvoice.verification.verification_notes}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Box Details */}
                {selectedRequestForInvoice.verification?.boxes && Array.isArray(selectedRequestForInvoice.verification.boxes) && selectedRequestForInvoice.verification.boxes.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Package className="h-5 w-5" />
                        Box Details
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {selectedRequestForInvoice.verification.boxes.map((box: any, index: number) => (
                          <div key={index} className="border rounded-lg p-4">
                            <h4 className="font-semibold mb-3">Box {index + 1} {box.quantity > 1 && `(×${box.quantity})`}</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <Label className="text-sm font-semibold text-gray-600">Classification</Label>
                                <p className="text-base">{box.classification || 'N/A'}</p>
                              </div>
                              <div>
                                <Label className="text-sm font-semibold text-gray-600">Items</Label>
                                <p className="text-base">{box.items || 'N/A'}</p>
                              </div>
                              <div>
                                <Label className="text-sm font-semibold text-gray-600">Dimensions (L × W × H cm)</Label>
                                <p className="text-base">
                                  {(() => {
                                    const length = parseNumericValue(box.length);
                                    const width = parseNumericValue(box.width);
                                    const height = parseNumericValue(box.height);
                                    if (length === 'N/A' || width === 'N/A' || height === 'N/A') {
                                      return 'N/A';
                                    }
                                    const l = typeof length === 'number' ? length.toFixed(2) : length;
                                    const w = typeof width === 'number' ? width.toFixed(2) : width;
                                    const h = typeof height === 'number' ? height.toFixed(2) : height;
                                    return `${l} × ${w} × ${h}`;
                                  })()}
                                </p>
                              </div>
                              <div>
                                <Label className="text-sm font-semibold text-gray-600">Volumetric Weight (VM)</Label>
                                <p className="text-base">
                                  {formatWeight(box.vm)}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Status Information */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Status Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-semibold text-gray-600">Request Status</Label>
                      <Badge className={getDeliveryStatusBadgeColor(selectedRequestForInvoice.status)}>
                        {selectedRequestForInvoice.status}
                      </Badge>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-600">Delivery Status</Label>
                      <Badge className={getDeliveryStatusBadgeColor(selectedRequestForInvoice.delivery_status)}>
                        {selectedRequestForInvoice.delivery_status}
                      </Badge>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-600">Created At</Label>
                      <p className="text-base">
                        {selectedRequestForInvoice.createdAt 
                          ? new Date(selectedRequestForInvoice.createdAt).toLocaleString()
                          : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-600">Updated At</Label>
                      <p className="text-base">
                        {selectedRequestForInvoice.updatedAt 
                          ? new Date(selectedRequestForInvoice.updatedAt).toLocaleString()
                          : 'N/A'}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="mt-6 flex justify-end">
                <Button
                  variant="outline"
                  onClick={() => setShowShipmentDetailsDialog(false)}
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Booking Details Modal for Sales Users */}
      {selectedBooking && (
        <BookingReviewModal
          booking={selectedBooking}
          open={showBookingModal}
          onClose={() => {
            setShowBookingModal(false);
            setSelectedBooking(null);
          }}
          onReviewComplete={() => {
            // Refresh data if needed
            apiClient.invalidateCache('/invoice-requests');
        fetchInvoiceRequests(currentPage, false); // Skip cache after verification complete
          }}
          currentUser={userProfile}
          viewOnly={true}
          onPrint={(booking) => {
            setBookingToPrint(booking);
            setShowPrintView(true);
          }}
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
          <BookingPrintView
            booking={bookingToPrint}
            onClose={() => {
              setShowPrintView(false);
              setBookingToPrint(null);
            }}
          />
        </div>
      )}

    </div>
  );
}
