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
import { Edit, Trash2, Package, Truck, CheckCircle, XCircle, FileText, ArrowRight, Phone, MapPin, AlertTriangle, Hash, Download, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
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
  const isFetchingRef = useRef(false); // Track if a fetch is currently in progress
  const pendingFilterChangeRef = useRef<string | null>(null); // Track pending filter changes
  const [showTaxInputDialog, setShowTaxInputDialog] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [loadingBooking, setLoadingBooking] = useState(false);
  const [showShipmentDetailsDialog, setShowShipmentDetailsDialog] = useState(false);
  const [loadingShipmentDetails, setLoadingShipmentDetails] = useState(false);
  const [fullRequestDetails, setFullRequestDetails] = useState<any>(null);
  const [showPrintView, setShowPrintView] = useState(false);
  const [bookingToPrint, setBookingToPrint] = useState<any>(null);
  const [hasDelivery, setHasDelivery] = useState(false); // Delivery required flag for PH TO UAE
  const [customerTRN, setCustomerTRN] = useState(''); // Optional customer TRN
  const [batchNumber, setBatchNumber] = useState(''); // Optional batch number
  const [pickupCharge, setPickupCharge] = useState(''); // Pickup charge when sender_delivery_option is "pickup"
  const [deliveryCharge, setDeliveryCharge] = useState(''); // Delivery charge when receiver_delivery_option is "delivery"
  const [deliveryBaseAmount, setDeliveryBaseAmount] = useState('20'); // Base delivery amount for PH_TO_UAE (default 20)
  const [totalKgInput, setTotalKgInput] = useState(''); // Total kilograms input for Finance (PH TO UAE)
  const router = useRouter();
  const getRequestServiceCode = (request?: any) =>
    request?.service_code ||
    request?.verification?.service_code ||
    request?.shipment?.service_code ||
    '';

  const { toast } = useToast();
  const { userProfile } = useAuth();
  const { clearCount } = useNotifications();
  const [insuranceOption, setInsuranceOption] = useState<'none' | 'percent'>('none');
  const [fixedInsuranceType, setFixedInsuranceType] = useState<'mobile' | 'laptop' | 'other'>('mobile');
  const [insuranceManualAmount, setInsuranceManualAmount] = useState('');
  const [isSpecialCustomer, setIsSpecialCustomer] = useState(false); // Special customer checkbox
  const [specialRate, setSpecialRate] = useState(''); // Special rate input (float)
  
  // Helper function to check if shipment is flomic
  const isFlomicShipment = (request?: any): boolean => {
    if (!request) return false;
    // Check verification boxes and shipment classification for flomic/personal
    const boxes =
      request.verification?.boxes ||
      request.request_id?.verification?.boxes ||
      request.booking?.verification?.boxes ||
      [];
    const boxIsFlomic =
      Array.isArray(boxes) &&
      boxes.length > 0 &&
      boxes.some((box: any) => {
        const classification = (box.classification || '').toUpperCase();
        return classification === 'FLOMIC' || classification === 'PERSONAL';
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
      (c) => c === 'PERSONAL' || c === 'FLOMIC'
    );

    return boxIsFlomic || hasPersonalClassification;
  };
  
  const getAutoTaxRate = (request?: any) => {
    if (!request) return 0;
    // If shipment is flomic, apply 5% VAT on subtotal
    if (isFlomicShipment(request)) {
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
  // For PH TO UAE: Check if delivery is required (old method)
  const isPhToUaeSelected = isPhToUaeService(selectedServiceCode);
  
  const needsPickupCharge = (isUaeToPhSelected && (senderDeliveryOption === 'pickup')) || 
                            (isPhToUaeSelected && (senderDeliveryOption === 'pickup'));
  const needsDeliveryCharge = isUaeToPhSelected && (receiverDeliveryOption === 'delivery');
  
  // For UAE TO PH: Show fields based on delivery option combinations
  // - sender="pickup" AND receiver="delivery" → show both fields
  // - sender="delivery" AND receiver="delivery" → show only delivery charge
  // - sender="pickup" AND receiver="pickup" → show only pickup charge
  // For PH TO UAE: Show pickup charge field if sender delivery option is "pickup" (pickup in Philippines)
  const showPickupChargeField = (isUaeToPhSelected && (senderDeliveryOption === 'pickup')) || 
                                 (isPhToUaeSelected && (senderDeliveryOption === 'pickup'));
  const showDeliveryChargeField = isUaeToPhSelected && (receiverDeliveryOption === 'delivery');
  
  // Get weight from selected request for PH TO UAE delivery check (fallback if user hasn't entered)
  const getRequestWeight = (request: any): number => {
    if (!request) return 0;
    
    // Priority: total_kg > chargeable_weight > actual_weight > weight
    if (request.verification?.total_kg) {
      const totalKg = request.verification.total_kg;
      return typeof totalKg === 'object' && totalKg.$numberDecimal 
        ? parseFloat(totalKg.$numberDecimal) 
        : parseFloat(totalKg.toString());
    }
    if (request.verification?.chargeable_weight) {
      const chargeableWeight = request.verification.chargeable_weight;
      return typeof chargeableWeight === 'object' && chargeableWeight.$numberDecimal 
        ? parseFloat(chargeableWeight.$numberDecimal) 
        : parseFloat(chargeableWeight.toString());
    }
    if (request.verification?.actual_weight) {
      const actualWeight = request.verification.actual_weight;
      return typeof actualWeight === 'object' && actualWeight.$numberDecimal 
        ? parseFloat(actualWeight.$numberDecimal) 
        : parseFloat(actualWeight.toString());
    }
    if (request.weight) {
      return typeof request.weight === 'object' && request.weight.$numberDecimal 
        ? parseFloat(request.weight.$numberDecimal) 
        : parseFloat(request.weight.toString());
    }
    return 0;
  };

  // Get total_kg directly from verification object in database (for delivery disable check)
  const getTotalKgFromDatabase = (request: any): number => {
    if (!request) {
      secureLog.debug('getTotalKgFromDatabase: No request provided');
      return 0;
    }
    
    // Priority: verification.total_kg (direct from database)
    // Check multiple possible paths for the verification object
    const verification = 
      request.verification ||
      request.request_id?.verification ||
      request.booking?.verification ||
      request.invoice_request?.verification;
    
    const verificationTotalKg = verification?.total_kg;
    
    secureLog.debug('getTotalKgFromDatabase: Checking weight', {
      hasVerification: !!verification,
      verificationTotalKg,
      requestKeys: Object.keys(request),
      verificationKeys: verification ? Object.keys(verification) : []
    });
    
    if (verificationTotalKg !== undefined && verificationTotalKg !== null) {
      let parsedValue = 0;
      if (typeof verificationTotalKg === 'object' && verificationTotalKg.$numberDecimal) {
        parsedValue = parseFloat(verificationTotalKg.$numberDecimal);
      } else if (typeof verificationTotalKg === 'number') {
        parsedValue = verificationTotalKg;
      } else {
        parsedValue = parseFloat(verificationTotalKg.toString());
      }
      
      if (!isNaN(parsedValue) && isFinite(parsedValue)) {
        secureLog.debug('getTotalKgFromDatabase: Found weight', { parsedValue });
        return parsedValue;
      }
    }
    
    secureLog.debug('getTotalKgFromDatabase: No valid weight found, returning 0');
    return 0;
  };

  // Use verification.total_kg directly from database for weight check
  // NOTE: Delivery checkbox is always enabled, but weight check is applied during invoice creation
  const requestWeight = selectedRequestForInvoice ? getTotalKgFromDatabase(selectedRequestForInvoice) : 0;
  const isWeight15kgOrMore = requestWeight >= 15;
  // Delivery checkbox is always enabled (no disabled state)
  const isDeliveryDisabled = false;
  
  // Debug logging for delivery disable check (only when dialog is open)
  useEffect(() => {
    if (showTaxInputDialog && isPhToUaeSelected && selectedRequestForInvoice) {
      const weight = getTotalKgFromDatabase(selectedRequestForInvoice);
      secureLog.debug('Delivery disable check (Dialog Open)', {
        requestWeight: weight,
        isWeight15kgOrMore: weight >= 15,
        isDeliveryDisabled: isPhToUaeSelected && weight >= 15,
        hasVerification: !!selectedRequestForInvoice.verification,
        totalKg: selectedRequestForInvoice.verification?.total_kg,
        serviceCode: selectedServiceCode,
        isPhToUaeSelected
      });
    }
  }, [showTaxInputDialog, isPhToUaeSelected, selectedRequestForInvoice, selectedServiceCode]);

  // PH TO UAE: Initialize total kg input with verification.total_kg from database
  // This runs when dialog opens (showTaxInputDialog) and data is loaded
  useEffect(() => {
    // Only initialize when dialog is open and we have the request data
    if (showTaxInputDialog && isPhToUaeSelected && selectedRequestForInvoice) {
      // Get total_kg from verification (check all possible paths)
      const verificationTotalKg = 
        selectedRequestForInvoice.verification?.total_kg ||
        selectedRequestForInvoice.request_id?.verification?.total_kg ||
        selectedRequestForInvoice.booking?.verification?.total_kg;
      
      secureLog.debug('Initializing total kg input', {
        hasVerification: !!selectedRequestForInvoice.verification,
        verificationTotalKg,
        type: typeof verificationTotalKg,
        isObject: typeof verificationTotalKg === 'object',
        hasDecimal: verificationTotalKg?.$numberDecimal,
        fullVerification: selectedRequestForInvoice.verification
      });
      
      let initialWeight = 0;
      
      if (verificationTotalKg !== undefined && verificationTotalKg !== null) {
        // Handle Decimal128 or number format
        if (typeof verificationTotalKg === 'object' && verificationTotalKg.$numberDecimal) {
          initialWeight = parseFloat(verificationTotalKg.$numberDecimal);
        } else if (typeof verificationTotalKg === 'number') {
          initialWeight = verificationTotalKg;
        } else {
          const parsed = parseFloat(verificationTotalKg.toString());
          if (!isNaN(parsed)) {
            initialWeight = parsed;
          }
        }
      }
      
      secureLog.debug('Parsed initial weight', { initialWeight, verificationTotalKg, isValid: initialWeight > 0 && !isNaN(initialWeight) });
      
      // Only set if we got a valid value from verification.total_kg
      if (initialWeight > 0 && !isNaN(initialWeight)) {
        const weightString = initialWeight.toString();
        setTotalKgInput(weightString);
        secureLog.debug('Set total kg input', { value: weightString });
      } else {
        // If no total_kg found, leave empty for user to enter
        setTotalKgInput('');
        secureLog.warn('No valid total_kg found, leaving input empty', { 
          verificationTotalKg,
          initialWeight 
        });
      }
    } else if (!isPhToUaeSelected || !showTaxInputDialog) {
      // Reset when not PH TO UAE or dialog is closed
      setTotalKgInput('');
    }
  }, [showTaxInputDialog, isPhToUaeSelected, selectedRequestForInvoice]);

  // PH TO UAE: Auto-disable delivery if weight >= 15kg
  useEffect(() => {
    if (isPhToUaeSelected && isWeight15kgOrMore) {
      setHasDelivery(false);
      setDeliveryBaseAmount('20'); // Reset to default
    }
  }, [isPhToUaeSelected, isWeight15kgOrMore]);

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
  // Note: This is a fallback - the Select's onValueChange handler also triggers fetches
  // The isFetchingRef prevents duplicate fetches
  useEffect(() => {
    // Only fetch if statusFilter is set, we've initialized, and no fetch is in progress
    if (statusFilter !== '' && hasInitializedRef.current && !isFetchingRef.current) {
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

  const fetchInvoiceRequests = useCallback(async (page: number = currentPage, useCache: boolean = true, filterOverride?: string) => {
    // If a fetch is already in progress, queue this request
    if (isFetchingRef.current) {
      // Store the pending request - use filterOverride if provided, otherwise use current statusFilter
      pendingFilterChangeRef.current = filterOverride !== undefined ? filterOverride : statusFilter;
      return;
    }

    try {
      isFetchingRef.current = true;
      setLoading(true);
      
      const essentialFields = getEssentialFields();
      
      // Use filterOverride if provided, otherwise use statusFilter
      const activeFilter = filterOverride !== undefined ? filterOverride : statusFilter;
      
      // Determine filters based on user-selected status filter or department default
      let filters: { status?: string; search?: string } | undefined = undefined;
      
      // If user has selected a status filter, use that (overrides department default)
      if (activeFilter && activeFilter !== 'all') {
        filters = { status: activeFilter };
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
      isFetchingRef.current = false;
      
      // If there's a pending filter change, process it now
      if (pendingFilterChangeRef.current !== null) {
        const pendingFilter = pendingFilterChangeRef.current;
        pendingFilterChangeRef.current = null;
        // Small delay to ensure backend has processed the previous update
        setTimeout(() => {
          // Only update statusFilter if it's different from current
          if (pendingFilter !== statusFilter) {
            setStatusFilter(pendingFilter);
          }
          fetchInvoiceRequests(1, false, pendingFilter);
        }, 150);
      }
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
      // Optimistic UI update - immediately update the local state
      if (action === 'start') {
        setInvoiceRequests(prevRequests => 
          prevRequests.map(request => 
            request._id === id 
              ? { ...request, status: 'IN_PROGRESS' }
              : request
          )
        );
      }
      
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
        
        // When status changes to IN_PROGRESS, reset to page 1 and use current filter
        // This ensures the updated item appears in the IN_PROGRESS filter immediately
        if (action === 'start') {
          setCurrentPage(1); // Reset to first page to show the new item
          // Use current statusFilter (or 'IN_PROGRESS' if filter is 'all' or empty)
          const filterToUse = statusFilter && statusFilter !== 'all' ? statusFilter : 'IN_PROGRESS';
          
          // Wait a bit longer to ensure backend has fully processed the update
          // This prevents race conditions and ensures the item appears in the correct filter
          setTimeout(() => {
            fetchInvoiceRequests(1, false, filterToUse); // Fetch page 1 with appropriate filter
          }, 500); // Increased delay to 500ms for better reliability
        } else {
          // For other actions, use current page
          setTimeout(() => {
            fetchInvoiceRequests(currentPage, false);
          }, 200);
        }
      } else {
        // Revert optimistic update on error
        if (action === 'start') {
          fetchInvoiceRequests(currentPage, false);
        }
      }
    } catch (error) {
      // Revert optimistic update on error
      if (action === 'start') {
        fetchInvoiceRequests(currentPage, false);
      }
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
      // CRITICAL: Fetch full invoice request details from backend to ensure ALL data is up-to-date
      // This MUST include verification object with total_kg, number_of_boxes, and all other fields
      secureLog.debug('Fetching full invoice request details from database', { 
        id: id?.substring(0, 20),
        note: 'This call bypasses cache to get fresh data from database'
      });
      
      // Force fresh fetch from database (no cache) to ensure we have latest verification data
      const result = await apiClient.getInvoiceRequestDetails(id, false);
      
      if (result.success && result.data) {
        const request = result.data as any; // Type assertion for API response
        
        // Validate that we have the essential data structure
        if (!request) {
          throw new Error('Invalid response: request data is null or undefined');
        }
        
        secureLog.debug('Full invoice request details loaded from database', { 
          hasVerification: !!request.verification,
          hasTotalKg: !!request.verification?.total_kg,
          totalKgValue: request.verification?.total_kg,
          numberOfBoxes: request.verification?.number_of_boxes,
          serviceCode: request.service_code || request.verification?.service_code,
          requestId: request._id || request.id,
          requestKeys: Object.keys(request),
          verificationKeys: request.verification ? Object.keys(request.verification) : [],
          // Check all possible paths for verification data
          hasRequestIdVerification: !!request.request_id?.verification,
          hasBookingVerification: !!request.booking?.verification,
          hasInvoiceRequestVerification: !!request.invoice_request?.verification
        });
        
        // Validate critical fields for PH TO UAE invoicing
        const serviceCode = request.service_code || 
                           request.verification?.service_code || 
                           request.shipment?.service_code || 
                           '';
        const isPhToUae = isPhToUaeService(serviceCode);
        
        if (isPhToUae) {
          // For PH TO UAE, we MUST have verification.total_kg from database
          const verificationTotalKg = 
            request.verification?.total_kg ||
            request.request_id?.verification?.total_kg ||
            request.booking?.verification?.total_kg ||
            request.invoice_request?.verification?.total_kg;
          
          if (verificationTotalKg === undefined || verificationTotalKg === null) {
            secureLog.warn('PH TO UAE invoice: verification.total_kg not found in database response', {
              serviceCode,
              requestId: request._id || request.id,
              availablePaths: {
                'request.verification': !!request.verification,
                'request.request_id.verification': !!request.request_id?.verification,
                'request.booking.verification': !!request.booking?.verification,
                'request.invoice_request.verification': !!request.invoice_request?.verification
              }
            });
          }
        }
        
        const existingBatch =
          request.batch_number ||
          request.invoice_number ||
          request.request_id?.batch_number ||
          '';
        
        // Set the full request data from database (this triggers re-render with fresh data)
        setSelectedRequestForInvoice(request);
        
        // Extract total_kg from verification - check all possible paths
        const verificationTotalKg = 
          request.verification?.total_kg ||
          request.request_id?.verification?.total_kg ||
          request.booking?.verification?.total_kg ||
          request.invoice_request?.verification?.total_kg;
        
        let initialWeight = 0;
        if (verificationTotalKg !== undefined && verificationTotalKg !== null) {
          if (typeof verificationTotalKg === 'object' && verificationTotalKg.$numberDecimal) {
            initialWeight = parseFloat(verificationTotalKg.$numberDecimal);
          } else if (typeof verificationTotalKg === 'number') {
            initialWeight = verificationTotalKg;
          } else {
            const parsed = parseFloat(verificationTotalKg.toString());
            if (!isNaN(parsed)) {
              initialWeight = parsed;
            }
          }
        }
        
        secureLog.debug('Extracted weight from database', { 
          verificationTotalKg, 
          initialWeight,
          isValid: initialWeight > 0 && !isNaN(initialWeight),
          willDisableDelivery: initialWeight >= 15 && isPhToUae
        });
        
        setShowTaxInputDialog(true);
        setCustomerTRN('');
        setBatchNumber(existingBatch);
        setPickupCharge('');
        setDeliveryCharge('');
        // Set total kg from database (used internally, not shown in UI)
        setTotalKgInput(initialWeight > 0 && !isNaN(initialWeight) ? initialWeight.toString() : '');
        // Reset delivery - will be disabled if weight >= 15kg (checked by isDeliveryDisabled)
        setHasDelivery(false);
        setDeliveryBaseAmount('20');
        // Reset special customer fields
        setIsSpecialCustomer(false);
        setSpecialRate('');
      } else {
        // Fallback to cached request if API fails
        const request = invoiceRequests.find((req: any) => req._id === id);
        if (request) {
          secureLog.warn('Failed to fetch full details, using cached request', result.error);
          toast({
            variant: 'destructive',
            title: 'Warning',
            description: 'Could not fetch latest data. Using cached information.',
          });
          
          const existingBatch =
            request.batch_number ||
            request.invoice_number ||
            request.request_id?.batch_number ||
            '';
          // Get total_kg from cached request
          const verificationTotalKg = 
            request.verification?.total_kg ||
            request.request_id?.verification?.total_kg ||
            request.booking?.verification?.total_kg;
          
          let initialWeight = 0;
          if (verificationTotalKg !== undefined && verificationTotalKg !== null) {
            if (typeof verificationTotalKg === 'object' && verificationTotalKg.$numberDecimal) {
              initialWeight = parseFloat(verificationTotalKg.$numberDecimal);
            } else if (typeof verificationTotalKg === 'number') {
              initialWeight = verificationTotalKg;
            } else {
              const parsed = parseFloat(verificationTotalKg.toString());
              if (!isNaN(parsed)) {
                initialWeight = parsed;
              }
            }
          }
          
          setSelectedRequestForInvoice(request);
          setShowTaxInputDialog(true);
          setCustomerTRN('');
          setBatchNumber(existingBatch);
          setPickupCharge('');
          setDeliveryCharge('');
          setTotalKgInput(initialWeight > 0 && !isNaN(initialWeight) ? initialWeight.toString() : '');
          setHasDelivery(false);
          setDeliveryBaseAmount('20');
          // Reset special customer fields
          setIsSpecialCustomer(false);
          setSpecialRate('');
        } else {
          toast({
            variant: 'destructive',
            title: 'Error',
            description: result.error || 'Failed to load invoice request details',
          });
        }
      }
    } catch (error) {
      secureLog.error('Error in handleFinanceAction', error);
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

    // Validate special rate if special customer is checked
    if (isSpecialCustomer) {
      const parsedSpecialRate = parseFloat(specialRate);
      if (!specialRate.trim() || isNaN(parsedSpecialRate) || parsedSpecialRate <= 0) {
        toast({
          variant: 'destructive',
          title: 'Special Rate Required',
          description: 'Please enter a valid special rate (greater than 0) when Special Customer is checked.',
        });
        return;
      }
    }

    // Validate pickup charge if needed
    if (needsPickupCharge) {
      const parsedPickup = parseFloat(pickupCharge);
      if (!pickupCharge.trim() || isNaN(parsedPickup) || parsedPickup < 0) {
        toast({
          variant: 'destructive',
          title: 'Pickup Charge Required',
          description: 'Please enter a valid pickup charge amount (0 or greater).',
        });
        return;
      }
    }

    // Validate delivery charge if needed
    if (needsDeliveryCharge) {
      const parsedDelivery = parseFloat(deliveryCharge);
      if (!deliveryCharge.trim() || isNaN(parsedDelivery) || parsedDelivery < 0) {
        toast({
          variant: 'destructive',
          title: 'Delivery Charge Required',
          description: 'Please enter a valid delivery charge amount (0 or greater).',
        });
        return;
      }
    }

    // For PH TO UAE, total_kg is automatically read from verification.total_kg in database
    // No user input required - it's fetched from backend when dialog opens

    try {
      const serviceCode = getRequestServiceCode(selectedRequestForInvoice);
      const isUaeToPh = isUaeToPhService(serviceCode);
      const taxRateForRequest = getAutoTaxRate(selectedRequestForInvoice);

      // Get pickup and delivery charges from user input (manual entry only)
      // For PH TO UAE: Pickup charge is for pickup in Philippines
      // For UAE TO PH: Pickup charge is for pickup in UAE
      const pickupChargeValue = needsPickupCharge ? parseFloat(pickupCharge) : 0;
      const deliveryChargeValue = needsDeliveryCharge ? parseFloat(deliveryCharge) : 0;
      
      // Debug: Log pickup charge for PH TO UAE
      if (isPhToUaeSelected && needsPickupCharge) {
        secureLog.debug('PH TO UAE Pickup Charge Input', {
          pickupChargeInput: pickupCharge,
          pickupChargeValue,
          needsPickupCharge,
          senderDeliveryOption: senderDeliveryOption,
          isPhToUaeSelected
        });
      }
      
      // Debug: Log pickup charge for PH TO UAE
      if (isPhToUaeSelected && needsPickupCharge) {
        secureLog.debug('PH TO UAE Pickup Charge', {
          pickupChargeInput: pickupCharge,
          pickupChargeValue,
          needsPickupCharge,
          senderDeliveryOption: senderDeliveryOption
        });
      }

      // Compute insurance charge based on user selection
      // IMPORTANT: User's explicit selection takes priority over database values
      let insuranceChargeValue = 0;
      if (insuranceOption === 'percent') {
        // User selected "1% insurance" - calculate it
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
      } else if (insuranceOption === 'none') {
        // User explicitly selected "no insurance" - force to 0 regardless of database
        insuranceChargeValue = 0;
      }
      // If insuranceOption is undefined/null, insuranceChargeValue remains 0
      
      // Convert request to invoice data
      // CRITICAL: For PH TO UAE, always pass pickupCharge if user entered a value (even if 0)
      // This ensures pickup charge in Philippines is included in invoice
      const invoiceData = convertRequestToInvoiceData(
        selectedRequestForInvoice,
        taxRateForRequest,
        undefined,
        { 
          batchNumber, 
          pickupCharge: isPhToUaeSelected && needsPickupCharge 
            ? pickupChargeValue  // For PH TO UAE: Pass value even if 0 (user explicitly entered it)
            : (pickupChargeValue > 0 ? pickupChargeValue : undefined), // For other routes: Only pass if > 0
          deliveryCharge: deliveryChargeValue > 0 ? deliveryChargeValue : undefined,
          // CRITICAL: Always pass insuranceCharge when user has made a selection
          // If user selected "none", pass 0 explicitly to override database
          // If user selected "percent", pass the calculated value
          // This ensures user's choice is respected, not database insured flag
          insuranceCharge: insuranceChargeValue, // Always pass (0 or calculated value)
          hasDelivery: isPhToUaeSelected && !isDeliveryDisabled ? hasDelivery : false, // Only for PH TO UAE, disabled if weight >= 15kg
          deliveryBaseAmount: isPhToUaeSelected && !isDeliveryDisabled && hasDelivery ? parseFloat(deliveryBaseAmount) || 20 : undefined, // Base delivery amount for PH_TO_UAE
          customerTRN: customerTRN || undefined, // Pass customer TRN to invoice data
          totalKg: isPhToUaeSelected && totalKgInput ? parseFloat(totalKgInput) : undefined // Pass user-entered total kg for PH TO UAE
        }
      );
      
      // Get request ID for logging
      const requestId = (selectedRequestForInvoice as any)?._id || 
                       (selectedRequestForInvoice as any)?.id || 
                       (selectedRequestForInvoice as any)?.request_id || 
                       'unknown';
      
      // Validate invoice data
      if (!invoiceData) {
        secureLog.error('Invoice data is null or undefined', { requestId });
        throw new Error('Failed to convert request to invoice data');
      }
      
      // Enhanced validation with detailed logging
      if (!invoiceData.lineItems) {
        secureLog.error('Invoice data lineItems is missing', {
          requestId,
          invoiceDataKeys: Object.keys(invoiceData),
          invoiceData: JSON.stringify(invoiceData, null, 2)
        });
        throw new Error('Invoice data line items are missing or invalid');
      }
      
      if (!Array.isArray(invoiceData.lineItems)) {
        secureLog.error('Invoice data lineItems is not an array', {
          requestId,
          lineItemsType: typeof invoiceData.lineItems,
          lineItemsValue: invoiceData.lineItems
        });
        throw new Error('Invoice data line items are missing or invalid');
      }
      
      if (invoiceData.lineItems.length === 0) {
        secureLog.error('Invoice data lineItems array is empty', {
          requestId,
          serviceCode: getRequestServiceCode(selectedRequestForInvoice),
          isPhToUae: isPhToUaeService(getRequestServiceCode(selectedRequestForInvoice)),
          invoiceData: JSON.stringify(invoiceData, null, 2)
        });
        throw new Error('Invoice data line items are missing or invalid');
      }
      
      secureLog.debug('Invoice data validation passed', {
        requestId,
        lineItemsCount: invoiceData.lineItems.length,
        lineItems: invoiceData.lineItems.map((item: any) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total
        }))
      });
      
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
          // Check if any box is FLOMIC or COMMERCIAL
          const hasFlomic = boxes.some((box: any) => {
            const classification = (box.classification || '').toUpperCase();
            return classification === 'FLOMIC' || classification === 'PERSONAL';
          });
          const hasCommercial = boxes.some((box: any) => {
            const classification = (box.classification || '').toUpperCase();
            return classification === 'COMMERCIAL';
          });
          
          if (hasCommercial) return 'COMMERCIAL';
          if (hasFlomic) return 'FLOMIC';
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
      
      // Calculate the invoice amount to send to backend
      // CRITICAL: Backend requires amount to be truthy (non-zero)
      // Extract shipping charge from line_items (backend uses this as fallback)
      // For PH_TO_UAE Tax Invoice: Shipping is hidden in display but still needed in amount field
      const isTaxInvoice = taxRateForRequest === 5;
      
      // Extract shipping charge from line_items
      const shippingItem = invoiceData.lineItems.find((item: any) => 
        item.description && item.description.toLowerCase().includes('shipping')
      );
      
      // Get shipping charge from line_items or fallback to charges object
      let invoiceAmountToSend = 0;
      if (shippingItem) {
        invoiceAmountToSend = shippingItem.total || shippingItem.unitPrice || 0;
      } else {
        // Fallback: Use shipping charge from charges object
        invoiceAmountToSend = invoiceData.charges?.shippingCharge || invoiceData.baseAmount || invoiceData.charges?.subtotal || 0;
      }
      
      // CRITICAL: Backend validation requires amount to be truthy (non-zero)
      // This applies to ALL invoice types (COD and Tax)
      if (invoiceAmountToSend <= 0) {
        // Last resort fallback - should never happen in normal flow
        invoiceAmountToSend = invoiceData.charges?.total || 0.01;
        secureLog.warn('Invoice amount was 0, using fallback', {
          shippingItem: shippingItem ? {
            description: shippingItem.description,
            total: shippingItem.total,
            unitPrice: shippingItem.unitPrice
          } : null,
          originalBaseAmount: invoiceData.baseAmount,
          originalSubtotal: invoiceData.charges?.subtotal,
          shippingCharge: invoiceData.charges?.shippingCharge,
          fallbackAmount: invoiceAmountToSend,
          lineItems: invoiceData.lineItems.map((item: any) => ({
            description: item.description,
            total: item.total
          }))
        });
      }
      
      // Determine has_delivery flag
      // For PH_TO_UAE: Use checkbox state (hasDelivery) - checkbox is always enabled
      // Weight check is applied during invoice calculation, not here
      // For UAE_TO_PH: Use receiver_delivery_option
      const hasDeliveryFlag = isPhToUaeSelected 
        ? hasDelivery // PH_TO_UAE: checkbox state (always enabled, weight check in calculation)
        : needsDeliveryCharge; // UAE_TO_PH: based on receiver_delivery_option
      
      // Determine delivery_base_amount
      // Required if has_delivery = true for PH_TO_UAE
      // Backend will use this to automatically calculate total_amount_cod
      const deliveryBaseAmountValue = isPhToUaeSelected && hasDeliveryFlag
        ? (parseFloat(deliveryBaseAmount) || 20) // PH_TO_UAE: user input or default 20
        : undefined; // Not required for other routes
      
      // Ensure delivery_base_amount is always sent for PH_TO_UAE when has_delivery is true
      // This allows backend to automatically calculate total_amount_cod
      if (isPhToUaeSelected && hasDeliveryFlag && !deliveryBaseAmountValue) {
        console.warn('⚠️ delivery_base_amount is missing for PH_TO_UAE with delivery enabled, using default 20');
      }
      
      // Determine pickup_base_amount for PH_TO_UAE
      // Required when sender_delivery_option is "pickup" for PH_TO_UAE
      // Backend will save this and use it in invoice calculations
      const pickupBaseAmountValue = isPhToUaeSelected && needsPickupCharge
        ? (parseFloat(pickupCharge) || 0) // PH_TO_UAE: user input (pickup in Philippines)
        : undefined; // Not required for other routes or when pickup is not needed
      
      // Debug: Log pickup base amount for PH TO UAE
      if (isPhToUaeSelected && needsPickupCharge) {
        secureLog.debug('PH TO UAE Pickup Base Amount', {
          pickupChargeInput: pickupCharge,
          pickupBaseAmountValue,
          needsPickupCharge,
          senderDeliveryOption: senderDeliveryOption
        });
      }
      
      // Get weight for COD invoice calculation (check if weight >= 15kg for free delivery)
      let weightForDeliveryCheck = 0;
      if (isPhToUaeSelected && !isTaxInvoice) {
        // Priority: totalKgInput (user input) > verification.total_kg > chargeable_weight
        if (totalKgInput) {
          weightForDeliveryCheck = parseFloat(totalKgInput) || 0;
        } else {
          const verificationTotalKg = (selectedRequestForInvoice as any)?.verification?.total_kg ||
                                     (selectedRequestForInvoice as any)?.request_id?.verification?.total_kg;
          if (verificationTotalKg) {
            weightForDeliveryCheck = typeof verificationTotalKg === 'object' && verificationTotalKg.$numberDecimal
              ? parseFloat(verificationTotalKg.$numberDecimal)
              : parseFloat(verificationTotalKg.toString());
          }
        }
      }
      
      // Calculate baseAmountWithDelivery for COD invoices
      // For weight < 15kg: shipping + delivery_base_amount
      // For weight >= 15kg: shipping only (free delivery)
      const isWeight15kgOrMore = weightForDeliveryCheck >= 15;
      const baseAmountWithDelivery = isPhToUaeSelected && !isTaxInvoice && hasDeliveryFlag
        ? (isWeight15kgOrMore 
            ? invoiceAmountToSend // Free delivery when weight >= 15kg
            : (invoiceAmountToSend + (deliveryBaseAmountValue || 0))) // Shipping + delivery_base_amount when weight < 15kg
        : 0;
      
      secureLog.debug('Creating invoice with API-compliant data', {
        invoiceAmountToSend,
        taxRate: taxRateForRequest,
        serviceCode,
        hasDeliveryFlag,
        deliveryBaseAmountValue,
        weightForDeliveryCheck,
        isWeight15kgOrMore,
        baseAmountWithDelivery,
        lineItemsCount: invoiceData.lineItems.length,
        isPhToUae: isPhToUaeSelected,
        isTaxInvoice: isTaxInvoice,
        isSpecialCustomer,
        specialRate: isSpecialCustomer ? parseFloat(specialRate) : undefined
      });
      
      // If special customer is checked, update the verification's amount and calculated_rate before creating invoice
      if (isSpecialCustomer && specialRate.trim()) {
        const specialRateValue = parseFloat(specialRate);
        if (!isNaN(specialRateValue) && specialRateValue > 0) {
          secureLog.debug('Updating verification with special rate', {
            requestId: (selectedRequestForInvoice as any)._id,
            specialRate: specialRateValue
          });
          
          // Get existing verification data to preserve required fields
          const verification = (selectedRequestForInvoice as any)?.verification || 
                              (selectedRequestForInvoice as any)?.request_id?.verification || {};
          
          // Parse existing weights (handle Decimal128 format)
          const parseWeight = (weight: any): number => {
            if (!weight) return 0;
            if (typeof weight === 'object' && weight.$numberDecimal) {
              return parseFloat(weight.$numberDecimal);
            }
            if (typeof weight === 'number') return weight;
            return parseFloat(weight.toString()) || 0;
          };
          
          const existingActualWeight = parseWeight(verification.actual_weight);
          const existingVolumetricWeight = parseWeight(verification.volumetric_weight);
          const existingChargeableWeight = parseWeight(verification.chargeable_weight || verification.weight);
          
          // Update verification with special rate, preserving all existing required fields
          const updateVerificationResult = await apiClient.updateVerification(
            (selectedRequestForInvoice as any)._id,
            {
              // Preserve existing required fields
              actual_weight: existingActualWeight > 0 ? existingActualWeight : verification.actual_weight || 0,
              volumetric_weight: existingVolumetricWeight > 0 ? existingVolumetricWeight : verification.volumetric_weight || 0,
              chargeable_weight: existingChargeableWeight > 0 ? existingChargeableWeight : verification.chargeable_weight || verification.weight || 0,
              weight: existingChargeableWeight > 0 ? existingChargeableWeight : verification.weight || 0,
              // Update rate fields with special rate
              amount: specialRateValue.toString(),
              calculated_rate: specialRateValue,
              // Preserve other existing fields if they exist
              ...(verification.invoice_number && { invoice_number: verification.invoice_number }),
              ...(verification.tracking_code && { tracking_code: verification.tracking_code }),
              ...(verification.service_code && { service_code: verification.service_code }),
              ...(verification.receiver_address && { receiver_address: verification.receiver_address }),
              ...(verification.receiver_phone && { receiver_phone: verification.receiver_phone }),
              ...(verification.agents_name && { agents_name: verification.agents_name }),
              ...(verification.shipment_classification && { shipment_classification: verification.shipment_classification }),
              ...(verification.weight_type && { weight_type: verification.weight_type }),
              ...(verification.cargo_service && { cargo_service: verification.cargo_service }),
              ...(verification.number_of_boxes && { number_of_boxes: verification.number_of_boxes }),
              ...(verification.total_kg && { total_kg: verification.total_kg }),
              ...(verification.sender_details_complete !== undefined && { sender_details_complete: verification.sender_details_complete }),
              ...(verification.receiver_details_complete !== undefined && { receiver_details_complete: verification.receiver_details_complete })
            }
          );
          
          if (!updateVerificationResult.success) {
            secureLog.error('Failed to update verification with special rate', updateVerificationResult.error);
            toast({
              variant: 'destructive',
              title: 'Warning',
              description: 'Failed to update special rate. Invoice will use default rate.',
            });
            // Continue with invoice generation even if update fails
          } else {
            secureLog.debug('Verification updated with special rate successfully');
            // Refresh the request data to get updated rate
            const refreshResult = await apiClient.getInvoiceRequestDetails((selectedRequestForInvoice as any)._id, false);
            if (refreshResult.success && refreshResult.data) {
              setSelectedRequestForInvoice(refreshResult.data);
            }
          }
        }
      }
      
      // Debug: Log line items before sending to backend (especially for PH TO UAE pickup charge)
      if (isPhToUaeSelected && needsPickupCharge) {
        secureLog.debug('PH TO UAE Invoice Creation - Line Items', {
          pickupChargeInput: pickupCharge,
          pickupChargeValue,
          needsPickupCharge,
          isPhToUaeSelected,
          pickupChargePassedToConvert: isPhToUaeSelected && needsPickupCharge ? pickupChargeValue : undefined,
          lineItems: invoiceData.lineItems,
          hasPickupChargeInLineItems: invoiceData.lineItems.some((item: any) => 
            item.description && item.description.toLowerCase().includes('pickup')
          ),
          lineItemsCount: invoiceData.lineItems.length,
          lineItemsDescriptions: invoiceData.lineItems.map((item: any) => item.description)
        });
      }
      
      const invoiceResult = await apiClient.createInvoiceUnified({
        request_id: (selectedRequestForInvoice as any)._id,
        client_id: clientId,
        amount: invoiceAmountToSend, // Shipping charge (fallback) - can be 0 for Tax Invoice
        line_items: invoiceData.lineItems.map(item => ({
          description: item.description, // REQUIRED - Used by backend to categorize charges
          quantity: item.quantity || 1, // REQUIRED - Default: 1
          unit_price: item.unitPrice, // REQUIRED - Price per unit
          total: item.total // REQUIRED - Total amount (quantity × unit_price)
        })),
        tax_rate: taxRateForRequest, // REQUIRED - 0 for COD, 5 for Tax
        service_code: serviceCode, // REQUIRED for PH_TO_UAE
        has_delivery: hasDeliveryFlag, // REQUIRED - Boolean indicating if delivery is enabled
        delivery_base_amount: deliveryBaseAmountValue, // REQUIRED if has_delivery = true for PH_TO_UAE
        pickup_base_amount: pickupBaseAmountValue, // REQUIRED if sender_delivery_option = "pickup" for PH_TO_UAE (pickup in Philippines)
        customer_trn: customerTRN || undefined,
        batch_number: batchNumber || undefined, // REQUIRED
        notes: invoiceData.notes,
        created_by: (userProfile as any)?.employee_id || (userProfile as any)?._id, // REQUIRED
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        // PH TO UAE: Send delivery_base_amount, pickup_base_amount, and calculated totals
        // NOTE: Backend should automatically calculate total_amount_cod using:
        // - amount (shipping) + pickup_base_amount + delivery_base_amount (when weight < 15kg)
        // - amount (shipping) + pickup_base_amount + 0 (when weight >= 15kg, free delivery)
        // Frontend sends calculated values as fallback, but backend calculation takes precedence
        ...(isPhToUaeSelected && {
          // For COD invoice: Send calculated baseAmountWithDelivery (backend will recalculate based on weight)
          // For Tax invoice: Use calculated totalAmountTaxInvoice
          total_amount_cod: !isTaxInvoice && baseAmountWithDelivery > 0 
            ? baseAmountWithDelivery 
            : ((invoiceData as any).totalAmountCod || 0), // Fallback to calculated value
          total_amount_tax_invoice: (invoiceData as any).totalAmountTaxInvoice || 0 // Tax Invoice total: Delivery + Tax
        })
      });
      
      secureLog.debug('Invoice creation result', { success: invoiceResult.success });
      
      if (invoiceResult.success) {
        // Automatically create delivery assignment with QR code for the invoice
        secureLog.debug('Creating delivery assignment with QR code');
        
        // Extract IDs properly (use different variable name to avoid conflict)
        const createdInvoiceData = invoiceResult.data as any;
        const invoiceId = createdInvoiceData?._id || createdInvoiceData?.invoice_id;
        
        // Get request_id from the invoice request (which links to shipment request)
        let requestId = (selectedRequestForInvoice as any)?.request_id;
        
        // If request_id doesn't exist, use invoice request _id as fallback
        // Some invoice requests may not have an associated shipment request
        if (!requestId) {
          console.warn('⚠️ No shipment request_id found, using invoice request _id as fallback');
          requestId = (selectedRequestForInvoice as any)._id;
        }
        
        // Get the total amount - use the original invoiceData (before API call) or response
        // Priority: response total_amount > response amount > original invoiceData totalAmount > original charges.total
        const invoiceTotalAmount = 
          createdInvoiceData?.total_amount || 
          createdInvoiceData?.amount || 
          createdInvoiceData?.totalAmount ||
          invoiceData?.totalAmount || 
          invoiceData?.charges?.total || 
          0;
        
        secureLog.debug('Invoice creation data', { 
          invoiceId, 
          requestId, 
          clientId, 
          invoiceTotalAmount,
          originalTotalAmount: invoiceData?.totalAmount,
          originalChargesTotal: invoiceData?.charges?.total,
          responseAmount: createdInvoiceData?.amount,
          responseTotalAmount: createdInvoiceData?.total_amount
        });
        
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
        
        // Validate amount is greater than 0
        if (invoiceTotalAmount <= 0) {
          secureLog.error('Invoice total amount is 0 or negative', {
            invoiceTotalAmount,
            originalTotalAmount: invoiceData?.totalAmount,
            originalChargesTotal: invoiceData?.charges?.total,
            responseAmount: createdInvoiceData?.amount
          });
          toast({
            variant: 'destructive',
            title: 'Error',
            description: 'Invoice amount is invalid. Please check the charges.'
          });
          return;
        }
        
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
            // Get client name from selected request or invoice data
            const clientName = (selectedRequestForInvoice as any)?.customer_name || 
                              (selectedRequestForInvoice as any)?.client_id?.company_name ||
                              'Unknown Client';
            const collectionResult = await apiClient.createCollection({
              invoice_id: invoiceId,
              client_name: clientName,
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
            setTotalKgInput(''); // Reset total kg input
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
            setTotalKgInput(''); // Reset total kg input
            setIsSpecialCustomer(false);
            setSpecialRate('');
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
      totalKg?: number; // User-entered total kilograms for PH TO UAE (overrides verification weight)
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
    
    // First priority: Use user-entered totalKg from options (for Finance invoice generation - PH TO UAE)
    if (options.totalKg !== undefined && options.totalKg > 0) {
      weight = options.totalKg;
    }
    // Second priority: Use manual total_kg from verification
    else if (request.verification?.total_kg) {
      const totalKg = request.verification.total_kg;
      weight = typeof totalKg === 'object' && totalKg.$numberDecimal ? 
        parseFloat(totalKg.$numberDecimal) : 
        parseFloat(totalKg.toString());
    }
    // Third priority: Use chargeable_weight (system-calculated)
    else if (request.verification?.chargeable_weight) {
      const chargeableWeight = request.verification.chargeable_weight;
      weight = typeof chargeableWeight === 'object' && chargeableWeight.$numberDecimal ? 
        parseFloat(chargeableWeight.$numberDecimal) : 
        parseFloat(chargeableWeight.toString());
    }
    // Fourth priority: Use actual_weight
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
    
    // Get rate from verification (calculated by Operations based on weight brackets)
    // Priority: verification.calculated_rate > verification.amount > base_rate > default 31.00
    let rate = 31.00; // Default fallback rate
    if (request.verification?.calculated_rate) {
      const calculatedRate = request.verification.calculated_rate;
      rate = typeof calculatedRate === 'object' && calculatedRate.$numberDecimal ? 
        parseFloat(calculatedRate.$numberDecimal) : 
        parseFloat(calculatedRate.toString());
    } else if (request.verification?.amount) {
      // verification.amount stores the rate per kg (from Operations verification)
      const amountRate = request.verification.amount;
      rate = typeof amountRate === 'object' && amountRate.$numberDecimal ? 
        parseFloat(amountRate.$numberDecimal) : 
        parseFloat(amountRate.toString());
    } else if (request.base_rate) {
      const baseRate = request.base_rate;
      rate = typeof baseRate === 'object' && baseRate.$numberDecimal ? 
        parseFloat(baseRate.$numberDecimal) : 
        parseFloat(baseRate.toString());
    }
    
    const shippingCharge = weight * rate;
    // Priority: verification.number_of_boxes (manual input) > shipment.number_of_boxes > request.number_of_boxes
    let numberOfBoxes = request.verification?.number_of_boxes || 
                       request.shipment?.number_of_boxes || 
                       request.number_of_boxes || 
                       1;
    numberOfBoxes = parseInt(numberOfBoxes, 10);
    if (!Number.isFinite(numberOfBoxes) || numberOfBoxes < 1) numberOfBoxes = 1;
    
    // Get pickup and delivery charges from options
    // For PH TO UAE: Include pickup charge if provided (even if 0, as user explicitly entered it)
    // For other routes: Only include if > 0
    let pickupChargeValue = 0;
    if (typeof options.pickupCharge === 'number') {
      if (isPhToUae) {
        // PH TO UAE: Always use the value if provided (even if 0, user explicitly entered it)
        pickupChargeValue = parseFloat(options.pickupCharge.toFixed(2));
        console.log('🔍 PH TO UAE Pickup Charge Extraction:', {
          optionsPickupCharge: options.pickupCharge,
          pickupChargeValue,
          isPhToUae,
          type: typeof options.pickupCharge
        });
      } else {
        // Other routes: Only use if > 0
        pickupChargeValue = options.pickupCharge > 0 ? parseFloat(options.pickupCharge.toFixed(2)) : 0;
      }
    } else if (options.pickupCharge !== undefined && options.pickupCharge !== null) {
      // Handle case where pickupCharge might be passed as string or other type
      const parsed = parseFloat(String(options.pickupCharge));
      if (!isNaN(parsed)) {
        pickupChargeValue = isPhToUae ? parsed : (parsed > 0 ? parsed : 0);
        if (isPhToUae) {
          console.log('🔍 PH TO UAE Pickup Charge Extraction (non-number):', {
            optionsPickupCharge: options.pickupCharge,
            parsed,
            pickupChargeValue
          });
        }
      }
    }
    const deliveryChargeValue = typeof options.deliveryCharge === 'number' && options.deliveryCharge > 0 
      ? parseFloat(options.deliveryCharge.toFixed(2)) 
      : 0;
    
    // Delivery charge calculation:
    // - UAE TO PH: Manual entry only (from user input)
    // - PH TO UAE: 
    //   * COD Invoice (Normal): Base amount only (user input, no box calculation)
    //     BUT: If verification.total_kg >= 15kg, delivery charge = 0 (free delivery)
    //   * Tax Invoice: Always calculate with boxes (base + (boxes-1) × 5) regardless of weight
    const hasDeliveryFlag = options.hasDelivery || false;
    const baseDeliveryAmount = options.deliveryBaseAmount || 20; // Default to 20 if not provided
    
    // Get total_kg directly from verification object for weight check (>= 15kg)
    // This is the PRIMARY source for weight check, not the calculated weight
    const verificationTotalKg = 
      request.verification?.total_kg ||
      request.request_id?.verification?.total_kg ||
      request.booking?.verification?.total_kg;
    
    let dbTotalKg = 0;
    if (verificationTotalKg !== undefined && verificationTotalKg !== null) {
      if (typeof verificationTotalKg === 'object' && verificationTotalKg.$numberDecimal) {
        dbTotalKg = parseFloat(verificationTotalKg.$numberDecimal);
      } else if (typeof verificationTotalKg === 'number') {
        dbTotalKg = verificationTotalKg;
      } else {
        const parsed = parseFloat(verificationTotalKg.toString());
        if (!isNaN(parsed)) {
          dbTotalKg = parsed;
        }
      }
    }
    
    // Use verification.total_kg from database for weight check
    const isWeight15kgOrMore = dbTotalKg >= 15;
    let deliveryCharge = 0;
    let calculatedDeliveryCharge = 0; // For tax invoice calculation with boxes
    
    if (isUaeToPh) {
      // UAE TO PH: Use manual entry
      deliveryCharge = deliveryChargeValue;
      calculatedDeliveryCharge = deliveryChargeValue;
    } else if (isPhToUae) {
      // PH TO UAE: Different calculation based on invoice mode
      if (isTaxMode) {
        // Tax Invoice: ALWAYS calculate delivery charge with boxes (regardless of weight)
        // Weight check does NOT apply to Tax Invoice
        if (hasDeliveryFlag) {
          calculatedDeliveryCharge = baseDeliveryAmount + ((numberOfBoxes - 1) * 5);
          deliveryCharge = calculatedDeliveryCharge; // Use calculated for tax invoice
        } else {
          deliveryCharge = 0;
          calculatedDeliveryCharge = 0;
        }
      } else {
        // COD Invoice (Normal): Check weight - if >= 15kg, delivery = 0 (free delivery)
        // Otherwise, use base amount only (no box calculation)
        if (hasDeliveryFlag) {
          if (isWeight15kgOrMore) {
            // Weight >= 15kg: Free delivery for COD Invoice
            deliveryCharge = 0;
            calculatedDeliveryCharge = 0;
          } else {
            // Weight < 15kg: Use base amount only (no box calculation)
            deliveryCharge = baseDeliveryAmount;
            calculatedDeliveryCharge = baseDeliveryAmount; // Same for consistency
          }
        } else {
          deliveryCharge = 0;
          calculatedDeliveryCharge = 0;
        }
      }
    }
    
    // Calculate insurance charge (PH→UAE: no insurance)
    let insuranceCharge = 0;
    if (!isPhToUae) {
      // IMPORTANT: If options.insuranceCharge is explicitly provided (even if 0), use it
      // This allows the user to override the database insured flag when they select "no insurance"
      if (typeof options.insuranceCharge === 'number') {
        // User has explicitly set insurance (could be 0 for "no insurance" or a value for "with insurance")
        insuranceCharge = parseFloat(options.insuranceCharge.toFixed(2));
      } else {
        // Only calculate from database if no explicit override provided
        const insured = request.insured || 
                       request.request_id?.insured ||
                       request.booking?.insured ||
                       request.sender?.insured ||
                       request.request_id?.sender?.insured ||
                       false;
        const declaredAmount = getDeclaredAmount(request);
        
        // Only add insurance if insured flag is true AND declared amount exists
        if (insured === true && declaredAmount > 0) {
          insuranceCharge = parseFloat((declaredAmount * 0.01).toFixed(2));
        }
      }
    }
    
    // PH TO UAE Special Logic:
    // - COD Invoice: shipping + base delivery (no tax)
    // - Tax Invoice: calculated delivery + tax on delivery only (no shipping shown)
    // IMPORTANT: For PH TO UAE, calculate BOTH totals (COD and Tax) regardless of current mode
    
    // Check if shipment is flomic
    const boxes = request.verification?.boxes || request.request_id?.verification?.boxes || [];
    const isFlomic = Array.isArray(boxes) && boxes.length > 0 && 
      boxes.some((box: any) => {
        const classification = (box.classification || '').toUpperCase();
        return classification === 'FLOMIC';
      });
    
    // Calculate tax and totals based on invoice type and route
    let taxAmount = 0;
    let taxRateForDelivery = 0;
    let displayShippingCharge = shippingCharge;
    let displaySubtotal = 0;
    let displayTaxAmount = 0;
    let displayTotal = 0;
    
    // PH TO UAE: Calculate BOTH COD and Tax Invoice totals (for backend storage)
    let totalAmountCod = 0; // COD Invoice total: Shipping + Delivery (no tax)
    let totalAmountTaxInvoice = 0; // Tax Invoice total: Delivery + Tax (shipping hidden)
    
    if (isPhToUae) {
      // Calculate COD Invoice total (always, regardless of current mode)
      // COD: Shipping + Base Delivery (no tax, no box calculation)
      // For weight < 15kg: Use baseDeliveryAmount (delivery_base_amount) directly
      // For weight >= 15kg: deliveryCharge is already 0 (free delivery)
      const codDeliveryAmount = isWeight15kgOrMore ? 0 : baseDeliveryAmount;
      totalAmountCod = shippingCharge + codDeliveryAmount; // Shipping + delivery_base_amount (or 0 if weight >= 15kg)
      
      // Calculate Tax Invoice total (always, regardless of current mode)
      // Tax: Calculated Delivery (with boxes) + Tax on Delivery
      const taxOnDelivery = calculatedDeliveryCharge > 0 ? (calculatedDeliveryCharge * 5) / 100 : 0;
      totalAmountTaxInvoice = calculatedDeliveryCharge + taxOnDelivery;
      
      // PH TO UAE specific logic for current display mode
      if (isTaxMode) {
        // Tax Invoice: Show only delivery (calculated) + tax on delivery (NO shipping shown)
        taxRateForDelivery = 5; // 5% VAT on delivery only
        taxAmount = calculatedDeliveryCharge > 0 ? (calculatedDeliveryCharge * taxRateForDelivery) / 100 : 0;
        displayShippingCharge = 0; // Hide shipping in tax invoice
        displaySubtotal = calculatedDeliveryCharge; // Subtotal = delivery charge only
        displayTaxAmount = taxAmount;
        displayTotal = totalAmountTaxInvoice; // Use pre-calculated Tax Invoice total
      } else {
        // COD Invoice: Show shipping + base delivery (NO tax)
        taxRateForDelivery = 0; // No tax on COD invoice
        taxAmount = 0;
        displayShippingCharge = shippingCharge; // Show shipping
        // Use codDeliveryAmount for consistency with totalAmountCod calculation
        displaySubtotal = shippingCharge + codDeliveryAmount; // Subtotal = shipping + delivery_base_amount (or 0 if weight >= 15kg)
        displayTaxAmount = 0;
        displayTotal = totalAmountCod; // Use pre-calculated COD total
      }
    } else {
      // UAE TO PH or other routes (existing logic)
      const subtotal = shippingCharge + pickupChargeValue + deliveryCharge + insuranceCharge;
      const fallbackTaxRate = isPhToUae ? 5 : 0;
      const effectiveTaxRate = typeof taxRateOverride === 'number' ? taxRateOverride : fallbackTaxRate;
      
      // Calculate tax:
      // - If flomic UAE to PH: 5% VAT included in subtotal (total = subtotal, VAT shown for display)
      // - Otherwise: Tax on delivery charge only (if present and PH to UAE)
      if (isFlomic && isUaeToPh && effectiveTaxRate > 0) {
        // Flomic UAE to PH: VAT is included in subtotal
        // Calculate VAT amount for display (5% of subtotal), but total = subtotal (VAT already included)
        taxAmount = (subtotal * effectiveTaxRate) / 100;
        taxRateForDelivery = effectiveTaxRate; // Store the rate for display
      } else if (isFlomic && effectiveTaxRate > 0) {
        // Flomic (non-UAE to PH): Apply 5% VAT on subtotal (add to total)
        taxAmount = (subtotal * effectiveTaxRate) / 100;
        taxRateForDelivery = effectiveTaxRate; // Store the rate for display
      } else {
        // Normal: Calculate tax on delivery charge only (pickup charge is typically not taxed)
        taxRateForDelivery = deliveryCharge > 0 ? effectiveTaxRate : 0;
        taxAmount = deliveryCharge > 0 && taxRateForDelivery > 0 ? (deliveryCharge * taxRateForDelivery) / 100 : 0;
      }
      
      // For flomic UAE to PH: total = subtotal (VAT already included)
      // For others: total = subtotal + taxAmount
      const total = (isFlomic && isUaeToPh) ? subtotal : (subtotal + taxAmount);
      
      displayShippingCharge = shippingCharge;
      displaySubtotal = subtotal;
      displayTaxAmount = taxAmount;
      displayTotal = total;
    }
    
    // Create base invoice data object (don't return yet - we need to add lineItems)
    const invoiceData = {
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
      _debugQR: qrCodeData ? 'QR data available' : 'QR data missing'
    };
    
    // Additional properties for invoice creation - lineItems MUST be created before return
    // PH TO UAE: Different line items based on invoice type
    let lineItems: any[] = [];
    
    if (isPhToUae) {
      if (isTaxMode) {
        // Tax Invoice: Only delivery charge (calculated with boxes) - NO shipping shown
        if (calculatedDeliveryCharge > 0) {
          lineItems.push({
            description: 'Delivery Charge',
            quantity: numberOfBoxes,
            unitPrice: parseFloat((calculatedDeliveryCharge / numberOfBoxes).toFixed(2)),
            total: calculatedDeliveryCharge
          });
        } else {
          // Fallback: If no delivery charge, add shipping charge as minimum
          // This should not happen in normal flow, but ensures lineItems is never empty
          lineItems.push({
            description: `Shipping - ${request.verification?.weight_type || 'ACTUAL'} weight`,
            quantity: 1,
            unitPrice: shippingCharge > 0 ? shippingCharge : 0,
            total: shippingCharge > 0 ? shippingCharge : 0
          });
        }
      } else {
        // COD Invoice: Shipping + base delivery (no tax, no box calculation)
        // Always include shipping charge (even if 0, to ensure lineItems is never empty)
        lineItems.push({
          description: `Shipping - ${request.verification?.weight_type || 'ACTUAL'} weight`,
          quantity: 1,
          unitPrice: shippingCharge,
          total: shippingCharge
        });
        if (deliveryCharge > 0) {
          lineItems.push({
            description: 'Delivery Charge',
            quantity: 1,
            unitPrice: deliveryCharge, // Base amount only (user input, no box calculation)
            total: deliveryCharge
          });
        }
      }
    } else {
      // UAE TO PH or other routes (existing logic)
      // Always include shipping charge (even if 0, to ensure lineItems is never empty)
      lineItems.push({
        description: `Shipping - ${request.verification?.weight_type || 'ACTUAL'} weight`,
        quantity: 1,
        unitPrice: shippingCharge,
        total: shippingCharge
      });
      // For PH TO UAE: Always add pickup charge if provided in options (user entered it)
      // For other routes: Only add if > 0
      const shouldAddPickupCharge = isPhToUae 
        ? (options.pickupCharge !== undefined && options.pickupCharge !== null) // PH TO UAE: Add if provided (even if 0)
        : (pickupChargeValue > 0); // Other routes: Only if > 0
      
      if (shouldAddPickupCharge) {
        console.log('✅ Adding Pickup Charge to lineItems:', {
          isPhToUae,
          pickupChargeValue,
          optionsPickupCharge: options.pickupCharge,
          shouldAddPickupCharge
        });
        lineItems.push({
          description: 'Pickup Charge',
          quantity: 1,
          unitPrice: pickupChargeValue,
          total: pickupChargeValue
        });
      } else if (isPhToUae) {
        console.log('❌ NOT Adding Pickup Charge to lineItems:', {
          isPhToUae,
          pickupChargeValue,
          optionsPickupCharge: options.pickupCharge,
          shouldAddPickupCharge,
          pickupChargeUndefined: options.pickupCharge === undefined,
          pickupChargeNull: options.pickupCharge === null
        });
      }
      if (deliveryCharge > 0) {
        lineItems.push({
          description: 'Delivery Charge',
          quantity: isUaeToPh ? 1 : numberOfBoxes,
          unitPrice: isUaeToPh ? deliveryCharge : parseFloat((deliveryCharge / numberOfBoxes).toFixed(2)),
          total: deliveryCharge
        });
      }
      if (insuranceCharge > 0) {
        lineItems.push({
          description: 'Insurance Charge',
          quantity: 1,
          unitPrice: insuranceCharge,
          total: insuranceCharge
        });
      }
    }
    
    // CRITICAL: Ensure lineItems is never empty (validation requirement)
    if (lineItems.length === 0) {
      secureLog.warn('Line items array is empty, adding fallback shipping charge', {
        serviceCode,
        isPhToUae,
        isTaxMode,
        shippingCharge,
        deliveryCharge,
        calculatedDeliveryCharge
      });
      lineItems.push({
        description: `Shipping - ${request.verification?.weight_type || 'ACTUAL'} weight`,
        quantity: 1,
        unitPrice: 0,
        total: 0
      });
    }
    
    // Base amount calculation for invoice.amount field (sent to backend)
    // IMPORTANT: This is the amount BEFORE tax that goes to invoice.amount
    let baseAmount = 0;
    if (isPhToUae) {
      if (isTaxMode) {
        // Tax Invoice: Base amount = delivery charge (if > 0), otherwise shipping charge
        // Even if delivery is disabled (weight >= 15kg), we still need to charge shipping
        baseAmount = calculatedDeliveryCharge > 0 ? calculatedDeliveryCharge : shippingCharge;
      } else {
        // COD Invoice: Base amount = shipping + delivery (if delivery > 0)
        baseAmount = shippingCharge + (deliveryCharge > 0 ? deliveryCharge : 0);
      }
    } else {
      baseAmount = shippingCharge; // Base shipping amount (for invoice.amount field)
    }
    
    // Ensure baseAmount is never 0 (at minimum, use shipping charge)
    if (baseAmount <= 0 && shippingCharge > 0) {
      baseAmount = shippingCharge;
    }
    
    // Final fallback: if everything is 0, set to 0.01 to prevent validation errors
    // (This should never happen in normal flow, but prevents backend validation errors)
    if (baseAmount <= 0) {
      secureLog.warn('Base amount is 0 or negative, setting to 0.01 as fallback', {
        serviceCode,
        isPhToUae,
        isTaxMode,
        shippingCharge,
        deliveryCharge,
        calculatedDeliveryCharge
      });
      baseAmount = 0.01;
    }
    
    // Ensure lineItems is set correctly (don't let invoiceData override it)
    const finalInvoiceData = {
      ...invoiceData,
      lineItems, // Explicitly set lineItems after spread to ensure it's not overwritten
      baseAmount,
      totalAmount: displayTotal, // Total amount with tax (for display)
      notes: `Invoice for request ${request.request_id || request._id}`
    };
    
    // Final validation before returning
    if (!finalInvoiceData.lineItems || !Array.isArray(finalInvoiceData.lineItems) || finalInvoiceData.lineItems.length === 0) {
      secureLog.error('CRITICAL: lineItems is invalid after return object creation', {
        serviceCode,
        isPhToUae,
        isTaxMode,
        lineItemsBeforeReturn: lineItems,
        invoiceDataKeys: Object.keys(invoiceData),
        finalInvoiceDataKeys: Object.keys(finalInvoiceData)
      });
      // Force add a line item as last resort
      finalInvoiceData.lineItems = [{
        description: `Shipping - ${request.verification?.weight_type || 'ACTUAL'} weight`,
        quantity: 1,
        unitPrice: shippingCharge > 0 ? shippingCharge : 0,
        total: shippingCharge > 0 ? shippingCharge : 0
      }];
    }
    
    secureLog.debug('Returning invoice data', {
      serviceCode,
      lineItemsCount: finalInvoiceData.lineItems.length,
      hasLineItems: !!finalInvoiceData.lineItems && Array.isArray(finalInvoiceData.lineItems)
    });
    
    return finalInvoiceData;
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
                  // If a fetch is in progress, queue the filter change
                  // Otherwise, fetch immediately with a small delay to allow any pending operations to complete
                  if (!isFetchingRef.current) {
                    setTimeout(() => {
                      fetchInvoiceRequests(1, false, value); // Fetch with new filter
                    }, 150);
                  } else {
                    // Queue the filter change - it will be processed after current fetch completes
                    pendingFilterChangeRef.current = value;
                  }
                }}
              >
                <SelectTrigger id="status-filter">
                  <SelectValue placeholder={userProfile?.department?.name === 'Finance' ? 'Select Status' : 'All Statuses'} />
                </SelectTrigger>
                <SelectContent>
                  {userProfile?.department?.name === 'Finance' ? (
                    <>
                      <SelectItem value="VERIFIED">VERIFIED</SelectItem>
                      <SelectItem value="COMPLETED">COMPLETED</SelectItem>
                    </>
                  ) : (
                    <>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="SUBMITTED">SUBMITTED</SelectItem>
                  <SelectItem value="IN_PROGRESS">IN_PROGRESS</SelectItem>
                  <SelectItem value="VERIFIED">VERIFIED</SelectItem>
                  <SelectItem value="COMPLETED">COMPLETED</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {statusFilter && statusFilter !== 'all' 
                  ? `Showing only ${statusFilter} requests` 
                  : userProfile?.department?.name === 'Operations' 
                    ? 'Default: IN_PROGRESS (Operations)' 
                    : userProfile?.department?.name === 'Finance'
                      ? 'Select VERIFIED or COMPLETED'
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-md max-h-[90vh] flex flex-col shadow-xl">
            <div className="p-6 pb-4 border-b border-gray-200 flex-shrink-0">
              <h2 className="text-xl font-bold mb-2">Invoice Generation</h2>
              <p className="text-gray-600 text-sm">
                Confirm whether delivery is required. VAT will be calculated automatically based on the service route.
              </p>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4">

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
                  {(() => {
                    const isPhToUae = isPhToUaeService(selectedServiceCode);
                    return isPhToUae 
                      ? 'Required when sender delivery option is "pickup" (pickup in Philippines).'
                      : 'Required when sender delivery option is "pickup".';
                  })()}
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

            {/* PH TO UAE: Delivery Required checkbox */}
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
                      ? (
                        <>
                          <span>For Tax Invoice: Delivery = {deliveryBaseAmount || 20} AED base + 5 AED per additional box (always calculated).</span>
                          <br />
                          <span>For COD Invoice: Fixed {deliveryBaseAmount || 20} AED (no box calculation). {isWeight15kgOrMore && <span className="text-amber-600 font-medium">Note: Will be free (0 AED) if weight ≥ 15kg.</span>}</span>
                        </>
                      )
                      : "No delivery charge will be applied"}
                  </p>
                  {/* Debug info - remove in production */}
                  {process.env.NODE_ENV === 'development' && (
                    <p className="text-xs text-gray-400 mt-1 ml-6">
                      Debug: Service={selectedServiceCode}, Weight={requestWeight}, Disabled={isDeliveryDisabled ? 'Yes' : 'No'}, HasRequest={!!selectedRequestForInvoice}
                    </p>
                  )}
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

            {/* Special Customer Checkbox and Special Rate Input */}
            <div className="mb-4">
              <label className="flex items-center space-x-2 cursor-pointer mb-2">
                <input
                  type="checkbox"
                  checked={isSpecialCustomer}
                  onChange={(e) => {
                    setIsSpecialCustomer(e.target.checked);
                    if (!e.target.checked) {
                      setSpecialRate(''); // Clear rate when unchecked
                    }
                  }}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  Special Customer
                </span>
              </label>
              {isSpecialCustomer && (
                <div className="mt-3 ml-6 p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <Label className="block text-sm font-medium text-gray-700 mb-2">
                    Special Rate (AED/kg) *
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={specialRate}
                    onChange={(e) => setSpecialRate(e.target.value)}
                    placeholder="Enter special rate (e.g., 29.00)"
                    className="w-full max-w-xs"
                    required={isSpecialCustomer}
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    This rate will override the calculated rate from weight brackets.
                    <br />
                    The backend will update the verification's amount and calculated_rate fields with this value.
                  </p>
                </div>
              )}
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
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Choose 1% of declared value for insurance.
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
            </div>
            <div className="p-6 pt-4 border-t border-gray-200 flex-shrink-0 flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowTaxInputDialog(false);
                  setSelectedRequestForInvoice(null);
                  setCustomerTRN('');
                  setBatchNumber('');
                  setPickupCharge('');
                  setIsSpecialCustomer(false);
                  setSpecialRate('');
                  setDeliveryCharge('');
                  setDeliveryBaseAmount('20'); // Reset to default
                  setTotalKgInput(''); // Reset total kg input
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
      {showShipmentDetailsDialog && (fullRequestDetails || selectedRequestForInvoice) && (() => {
        // Use full details if available, otherwise fallback to selectedRequestForInvoice
        const requestData = fullRequestDetails || selectedRequestForInvoice;
        
        if (!requestData) return null;
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
                  onClick={() => {
                    setShowShipmentDetailsDialog(false);
                    setFullRequestDetails(null);
                  }}
                >
                  <XCircle className="h-5 w-5" />
                </Button>
              </div>
              
              {loadingShipmentDetails && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  <span>Loading full details...</span>
                </div>
              )}

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
                      <p className="text-base">{requestData.customer_name || 'N/A'}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-600">Customer Phone</Label>
                      <p className="text-base">{requestData.customer_phone || 'N/A'}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-600">Customer Email</Label>
                      <p className="text-base">{requestData.customer_email || 'N/A'}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-600">Origin Place</Label>
                      <p className="text-base">{requestData.origin_place || 'N/A'}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-600">Sender Delivery Option</Label>
                      <div className="text-base">
                        <Badge variant={
                          (requestData.sender_delivery_option || 
                           requestData.request_id?.sender_delivery_option || 
                           requestData.booking?.sender_delivery_option) === 'pickup' 
                            ? 'default' 
                            : 'secondary'
                        }>
                          {(() => {
                            const senderOption = requestData.sender_delivery_option || 
                                                requestData.request_id?.sender_delivery_option || 
                                                requestData.booking?.sender_delivery_option || 
                                                'N/A';
                            if (senderOption === 'pickup') return 'Pickup';
                            if (senderOption === 'delivery') return 'Delivery';
                            return senderOption;
                          })()}
                        </Badge>
                      </div>
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
                      <p className="text-base">
                        {requestData.receiver_name ||
                         requestData.request_id?.receiver_name ||
                         requestData.verification?.receiver_name ||
                         requestData.booking?.receiver_name ||
                         requestData.receiver?.name ||
                         requestData.request_id?.receiver?.name ||
                         'N/A'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-600">Receiver Phone</Label>
                      <p className="text-base">{requestData.receiver_phone || requestData.verification?.receiver_phone || 'N/A'}</p>
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-sm font-semibold text-gray-600">Receiver Address</Label>
                      <p className="text-base">{requestData.destination_place || requestData.verification?.receiver_address || 'N/A'}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-600">Receiver Delivery Option</Label>
                      <div className="text-base">
                        <Badge variant={
                          (requestData.receiver_delivery_option || 
                           requestData.request_id?.receiver_delivery_option || 
                           requestData.booking?.receiver_delivery_option) === 'delivery' 
                            ? 'default' 
                            : 'secondary'
                        }>
                          {(() => {
                            const receiverOption = requestData.receiver_delivery_option || 
                                                  requestData.request_id?.receiver_delivery_option || 
                                                  requestData.booking?.receiver_delivery_option || 
                                                  'N/A';
                            if (receiverOption === 'delivery') return 'Delivery';
                            if (receiverOption === 'pickup') return 'Pickup';
                            return receiverOption;
                          })()}
                        </Badge>
                      </div>
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
                      <p className="text-base">
                        {formatServiceCode(
                          requestData.service_code ||
                          requestData.verification?.service_code ||
                          requestData.request_id?.service_code ||
                          requestData.booking?.service_code ||
                          'N/A'
                        )}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-600">Shipment Type</Label>
                      <p className="text-base">
                        {requestData.shipment_type ||
                         requestData.request_id?.shipment_type ||
                         requestData.booking?.shipment_type ||
                         requestData.verification?.shipment_type ||
                         'N/A'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-600">AWB Number</Label>
                      <p className="text-base">
                        {requestData.tracking_code ||
                         requestData.awb_number ||
                         requestData.awb ||
                         requestData.request_id?.tracking_code ||
                         requestData.request_id?.awb_number ||
                         requestData.request_id?.awb ||
                         requestData.booking?.awb_number ||
                         requestData.booking?.awb ||
                         requestData.verification?.awb_number ||
                         'N/A'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-600">Invoice Number</Label>
                      <p className="text-base">
                        {requestData.invoice_number ||
                         requestData.verification?.invoice_number ||
                         requestData.request_id?.invoice_number ||
                         requestData.invoice_id ||
                         requestData.request_id?.invoice_id ||
                         'N/A'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-600">Weight (kg)</Label>
                      <p className="text-base">
                        {formatWeight(
                          requestData.verification?.actual_weight ||
                          requestData.weight ||
                          requestData.weight_kg ||
                          requestData.request_id?.verification?.actual_weight ||
                          requestData.request_id?.weight ||
                          requestData.request_id?.weight_kg ||
                          requestData.request_id?.shipment?.weight ||
                          requestData.shipment?.weight
                        )}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-600">Weight Type</Label>
                      <p className="text-base">
                        {requestData.verification?.weight_type ||
                         requestData.request_id?.verification?.weight_type ||
                         requestData.request_id?.shipment?.weight_type ||
                         requestData.shipment?.weight_type ||
                         'N/A'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-600">Number of Boxes</Label>
                      <p className="text-base">
                        {(() => {
                          const boxes = parseNumericValue(
                            requestData.verification?.number_of_boxes ||
                            requestData.request_id?.verification?.number_of_boxes ||
                            requestData.request_id?.shipment?.number_of_boxes ||
                            requestData.shipment?.number_of_boxes ||
                            requestData.number_of_boxes
                          );
                          return boxes === 'N/A' ? 'N/A' : boxes.toString();
                        })()}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-600">Volumetric Weight (VM)</Label>
                      <p className="text-base">
                        {formatWeight(
                          requestData.verification?.total_vm ||
                          requestData.verification?.volumetric_weight ||
                          requestData.request_id?.verification?.total_vm ||
                          requestData.request_id?.verification?.volumetric_weight ||
                          requestData.request_id?.shipment?.volumetric_weight ||
                          requestData.shipment?.volumetric_weight ||
                          requestData.verification?.total_vm_weight ||
                          requestData.request_id?.verification?.total_vm_weight
                        )}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-600">Chargeable Weight</Label>
                      <p className="text-base">
                        {formatWeight(
                          requestData.verification?.actual_weight ||
                          requestData.weight ||
                          requestData.verification?.total_kg ||
                          requestData.verification?.chargeable_weight ||
                          requestData.request_id?.verification?.actual_weight ||
                          requestData.request_id?.verification?.total_kg ||
                          requestData.request_id?.verification?.chargeable_weight ||
                          requestData.request_id?.shipment?.chargeable_weight ||
                          requestData.shipment?.chargeable_weight
                        )}
                      </p>
                    </div>
                    {/* Insurance Information - Only for UAE TO PH/PINAS service when insured is true */}
                    {(() => {
                      const serviceCode = requestData.service_code || 
                                        requestData.verification?.service_code ||
                                        requestData.request_id?.service_code ||
                                        '';
                      const isUaeToPh = isUaeToPhService(serviceCode);
                      const insured = requestData.insured || 
                                     requestData.verification?.insured ||
                                     requestData.request_id?.insured ||
                                     requestData.booking?.insured ||
                                     false;
                      const declaredAmount = requestData.declaredAmount || 
                                            requestData.declared_amount ||
                                            requestData.verification?.declared_value ||
                                            requestData.request_id?.declaredAmount ||
                                            requestData.request_id?.declared_amount ||
                                            requestData.booking?.declaredAmount ||
                                            requestData.booking?.declared_amount ||
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
                          const rate = parseNumericValue(
                            requestData.verification?.calculated_rate ||
                            requestData.request_id?.verification?.calculated_rate ||
                            requestData.base_rate ||
                            requestData.request_id?.base_rate
                          );
                          if (rate === 'N/A') return 'N/A';
                          return typeof rate === 'number' ? rate.toFixed(2) : rate.toString();
                        })()}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Verification Details */}
                {requestData.verification && (
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
                        <p className="text-base">{requestData.verification.agents_name || 'N/A'}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-semibold text-gray-600">Shipment Classification</Label>
                        <p className="text-base">{requestData.verification.shipment_classification || 'N/A'}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-semibold text-gray-600">Cargo Service</Label>
                        <p className="text-base">{requestData.verification.cargo_service || 'N/A'}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-semibold text-gray-600">Rate Bracket</Label>
                        <p className="text-base">{requestData.verification.rate_bracket || 'N/A'}</p>
                      </div>
                      {requestData.verification.listed_commodities && (
                        <div className="md:col-span-2">
                          <Label className="text-sm font-semibold text-gray-600">Listed Commodities</Label>
                          <p className="text-base">{requestData.verification.listed_commodities}</p>
                        </div>
                      )}
                      {requestData.verification.verification_notes && (
                        <div className="md:col-span-2">
                          <Label className="text-sm font-semibold text-gray-600">Verification Notes</Label>
                          <p className="text-base">{requestData.verification.verification_notes}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Box Details */}
                {requestData.verification?.boxes && Array.isArray(requestData.verification.boxes) && requestData.verification.boxes.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Package className="h-5 w-5" />
                        Box Details
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {requestData.verification.boxes.map((box: any, index: number) => (
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
                      <Badge className={getDeliveryStatusBadgeColor(requestData.status)}>
                        {requestData.status}
                      </Badge>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-600">Delivery Status</Label>
                      <Badge className={getDeliveryStatusBadgeColor(requestData.delivery_status)}>
                        {requestData.delivery_status}
                      </Badge>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-600">Created At</Label>
                      <p className="text-base">
                        {requestData.createdAt 
                          ? new Date(requestData.createdAt).toLocaleString()
                          : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-600">Updated At</Label>
                      <p className="text-base">
                        {requestData.updatedAt 
                          ? new Date(requestData.updatedAt).toLocaleString()
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
