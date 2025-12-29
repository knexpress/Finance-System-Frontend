'use client';

import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, FileCheck, Package } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { secureLog } from '@/lib/secure-logger';

interface VerificationFormProps {
  request: any;
  onVerificationComplete: () => void;
  currentUser: any;
}


// Weight bracket configuration
interface WeightBracket {
  min: number;
  max: number | null; // null means infinity
  rate: number;
  label: string;
}

const PH_TO_UAE_BRACKETS: WeightBracket[] = [
  { min: 1, max: 15, rate: 39, label: '1-15 KG' },
  { min: 16, max: 29, rate: 38, label: '16-29 KG' },
  { min: 30, max: 69, rate: 36, label: '30-69 KG' },
  { min: 70, max: 199, rate: 34, label: '70-199 KG' },
  { min: 200, max: 299, rate: 31, label: '200-299 KG' },
  { min: 300, max: null, rate: 30, label: '300+ KG' },
  { min: 0, max: null, rate: 29, label: 'SPECIAL RATE' }, // Special rate (can be manually selected)
];

const UAE_TO_PH_BRACKETS: WeightBracket[] = [
  { min: 1, max: 15, rate: 39, label: '1-15 KG' },
  { min: 16, max: 29, rate: 38, label: '16-29 KG' },
  { min: 30, max: 69, rate: 36, label: '30-69 KG' },
  { min: 70, max: 99, rate: 34, label: '70-99 KG' },
  { min: 100, max: 199, rate: 31, label: '100-199 KG' },
  { min: 200, max: null, rate: 30, label: '200+ KG' },
  { min: 0, max: null, rate: 29, label: 'SPECIAL RATE' }, // Special rate (can be manually selected)
  { min: 1000, max: null, rate: 28, label: '1 TON UP' }, // 1 ton = 1000 kg
];

// Function to get rate based on weight and route
const getRateForWeight = (weight: number, route: 'PH_TO_UAE' | 'UAE_TO_PH' | string): { rate: number; bracket: WeightBracket | null } => {
  if (!weight || weight <= 0 || !route) {
    secureLog.warn('Invalid weight or route for rate calculation', { weight, route: route?.substring(0, 20) });
    return { rate: 0, bracket: null };
  }

  // Normalize route to uppercase for comparison
  const normalizedRoute = route.toUpperCase();
  const isPHToUAE = normalizedRoute.includes('PH_TO_UAE');
  const isUAETOPH = normalizedRoute.includes('UAE_TO_PH');
  
  if (!isPHToUAE && !isUAETOPH) {
    secureLog.warn('Invalid route for rate calculation', { route: route?.substring(0, 20) });
    return { rate: 0, bracket: null };
  }

  const brackets = isPHToUAE ? PH_TO_UAE_BRACKETS : UAE_TO_PH_BRACKETS;
  
  // Filter out special rate and sort brackets by min weight (descending) to check higher brackets first
  // This ensures "1 TON UP" (1000+) is checked before "200+ KG" for weights >= 1000
  // Filter out special rate
  const availableBrackets = brackets.filter(b => b.label !== 'SPECIAL RATE');
  
  // Separate closed and open-ended brackets
  const closedBrackets = availableBrackets.filter(b => b.max !== null).sort((a, b) => a.min - b.min); // Sort by min ascending
  const openEndedBrackets = availableBrackets.filter(b => b.max === null).sort((a, b) => b.min - a.min); // Sort by min descending (higher first)
  
  secureLog.debug('Calculating rate', { route: normalizedRoute, weight });
  
  // Find the matching bracket
  // Strategy: Check closed brackets first (more specific), then open-ended brackets
  let matchingBracket = null;
  
  // First, try to find a closed bracket match (check all, order doesn't matter for matching)
  for (const bracket of closedBrackets) {
    // bracket.max is guaranteed to be non-null for closed brackets
    if (bracket.max !== null && weight >= bracket.min && weight <= bracket.max) {
      matchingBracket = bracket;
      secureLog.debug('Matched weight bracket', { bracket: bracket.label, weight });
      break;
    }
  }
  
  // If no closed bracket matched, try open-ended brackets (check higher min first)
  if (!matchingBracket) {
    for (const bracket of openEndedBrackets) {
      if (weight >= bracket.min) {
        matchingBracket = bracket;
        secureLog.debug('Matched open-ended bracket', { bracket: bracket.label, weight });
        break;
      }
    }
  }

  if (matchingBracket) {
    secureLog.debug('Rate calculated', { rate: matchingBracket.rate, bracket: matchingBracket.label });
    return { rate: matchingBracket.rate, bracket: matchingBracket };
  }

  // If no bracket matches, find the best fallback bracket
  // This should rarely happen, but handle edge cases
  secureLog.warn('No bracket matched, using fallback', { weight, route: normalizedRoute });
  
  // Find the lowest min bracket (for weights below minimum, e.g., 0.5 kg)
  const lowestBracket = availableBrackets.reduce((lowest, current) => {
    return current.min < lowest.min ? current : lowest;
  }, availableBrackets[0]);
  
  // Find the highest min open-ended bracket (for weights above maximum)
  const highestOpenBracket = openEndedBrackets.length > 0 
    ? openEndedBrackets[0] // Already sorted descending, so first is highest
    : null;
  
  // If weight is less than the lowest bracket min, use lowest bracket
  // If weight is greater than all closed brackets, use highest open-ended bracket
  const fallbackBracket = weight < lowestBracket.min 
    ? lowestBracket 
    : (highestOpenBracket || (closedBrackets.length > 0 ? closedBrackets[closedBrackets.length - 1] : null) || availableBrackets[0]);
  
  secureLog.warn('Using fallback bracket', { bracket: fallbackBracket.label, rate: fallbackBracket.rate });
  return { rate: fallbackBracket.rate, bracket: fallbackBracket };
};

export default function VerificationForm({ request, onVerificationComplete, currentUser }: VerificationFormProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingFullData, setIsLoadingFullData] = useState(false);
  const [fullRequestData, setFullRequestData] = useState<any>(null);
  const { toast } = useToast();
  
  // Fetch full request data when dialog opens (lazy loading)
  useEffect(() => {
    if (!isDialogOpen) return;
    
    // Get AWB number from request
    const awb = request.tracking_code || 
                request.awb_number || 
                request.awb ||
                request.invoice_number ||
                '';
    
    if (!awb) {
      secureLog.warn('No AWB found in request, using provided data');
      setFullRequestData(request);
      return;
    }
    
    // Check if we already have full data (all required fields present)
    const hasFullData = request.booking && 
                       request.verification && 
                       (request.request_id || request.booking_id);
    
    if (hasFullData) {
      secureLog.debug('Request already has full data, skipping fetch');
      setFullRequestData(request);
      return;
    }
    
    // Fetch full data from backend
    const fetchFullData = async () => {
      setIsLoadingFullData(true);
      try {
        secureLog.debug('Fetching full invoice request data by AWB', { awb: awb.substring(0, 20) });
        const result = await apiClient.getInvoiceRequestByAwb(awb);
        
        if (result.success && result.data) {
          secureLog.debug('Full invoice request data loaded');
          setFullRequestData(result.data);
        } else {
          secureLog.warn('Failed to fetch full data, using provided request data', result.error);
          setFullRequestData(request); // Fallback to provided data
        }
      } catch (error) {
        secureLog.error('Error fetching full invoice request data', error);
        setFullRequestData(request); // Fallback to provided data
      } finally {
        setIsLoadingFullData(false);
      }
    };
    
    fetchFullData();
  }, [isDialogOpen, request]);
  
  // Use fullRequestData if available, otherwise use request
  const requestData = fullRequestData || request;


  // Get service code from booking if available, otherwise use request data
  const getServiceCodeFromBooking = () => {
    const req = requestData || request; // Use full data if available
    // Check multiple possible paths for booking data
    const booking = 
      req.booking_id || 
      req.booking || 
      req.request_id?.booking_id || 
      req.request_id?.booking ||
      req.booking_id?.service ? req.booking_id : null;
    
    // Helper function to normalize and map service codes
    const normalizeAndMapService = (serviceValue: string): string | null => {
      if (!serviceValue) return null;
      
      const service = String(serviceValue).toLowerCase().trim();
      
      // PH to UAE variations
      if (service === 'ph-to-uae' || service === 'ph_to_uae' || service === 'ph-to-pinas') {
        return service.includes('express') ? 'PH_TO_UAE_EXPRESS' : 
               service.includes('standard') ? 'PH_TO_UAE_STANDARD' : 'PH_TO_UAE';
      }
      
      // UAE to PH variations (including "pinas")
      if (service === 'uae-to-ph' || service === 'uae_to_ph' || 
          service === 'uae-to-pinas' || service === 'uae_to_pinas' ||
          service.includes('uae') && (service.includes('pinas') || service.includes('ph'))) {
        if (service.includes('to') || service.includes('_to_')) {
          return service.includes('express') ? 'UAE_TO_PH_EXPRESS' : 
                 service.includes('standard') ? 'UAE_TO_PH_STANDARD' : 'UAE_TO_PH';
        }
      }
      
      // Try to match other variations with "to" keyword
      if (service.includes('to') || service.includes('_to_')) {
        // Check for PH to UAE
        if ((service.includes('ph') || service.includes('pinas')) && service.includes('uae')) {
          return service.includes('express') ? 'PH_TO_UAE_EXPRESS' : 
                 service.includes('standard') ? 'PH_TO_UAE_STANDARD' : 'PH_TO_UAE';
        }
        // Check for UAE to PH/Pinas
        if (service.includes('uae') && (service.includes('ph') || service.includes('pinas'))) {
          return service.includes('express') ? 'UAE_TO_PH_EXPRESS' : 
                 service.includes('standard') ? 'UAE_TO_PH_STANDARD' : 'UAE_TO_PH';
        }
      }
      
      return null;
    };
    
    // Check if booking has service field
    if (booking?.service) {
      const mappedService = normalizeAndMapService(booking.service);
      if (mappedService) {
        secureLog.debug('Mapped booking service', { from: booking.service?.substring(0, 30), to: mappedService });
        return mappedService;
      }
    }
    
    // Also check if service is directly on request (from booking)
    if (req.service) {
      const mappedService = normalizeAndMapService(req.service);
      if (mappedService) {
        secureLog.debug('Mapped request service', { from: req.service?.substring(0, 30), to: mappedService });
        return mappedService;
      }
    }
    
    // Check nested request_id paths
    if (req.request_id?.service) {
      const mappedService = normalizeAndMapService(req.request_id.service);
      if (mappedService) {
        secureLog.debug('Mapped request_id service', { from: req.request_id.service?.substring(0, 30), to: mappedService });
        return mappedService;
      }
    }
    
    // Check booking service in nested paths
    if (req.request_id?.booking?.service) {
      const mappedService = normalizeAndMapService(req.request_id.booking.service);
      if (mappedService) {
        secureLog.debug('Mapped request_id.booking service', { from: req.request_id.booking.service?.substring(0, 30), to: mappedService });
        return mappedService;
      }
    }
    
    // Fallback to existing logic
    const fallbackCode = req.service_code || 
                         req.verification?.service_code || 
                         req.request_id?.service_code || '';
    if (fallbackCode) {
      // Try to normalize the fallback code as well
      const mappedFallback = normalizeAndMapService(fallbackCode);
      if (mappedFallback) {
        secureLog.debug('Mapped fallback service code', { from: fallbackCode?.substring(0, 30), to: mappedFallback });
        return mappedFallback;
      }
    }
    
    return fallbackCode;
  };

  // Get initial service code
  const initialServiceCode = getServiceCodeFromBooking();
  const req = requestData || request; // Use full data if available
  secureLog.debug('Initial service code from booking', {
    requestService: req.service,
    requestServiceCode: req.service_code,
    bookingService: req.booking?.service || req.booking_id?.service,
    requestIdService: req.request_id?.service
  });

  // Determine initial route for classification default
  const initialServiceCodeForRoute = initialServiceCode || req.service_code || req.verification?.service_code || '';
  const isInitialPhToUae = initialServiceCodeForRoute.toUpperCase().includes('PH_TO_UAE');

  // Get insured and declared_value from request/booking/verification/sender
  const getInsuredValue = () => {
    const req = requestData || request; // Use full data if available
    // Check multiple paths and handle both boolean and string values
    const checkInsured = (value: any): boolean => {
      return value === true || value === 'true' || value === 1 || value === '1';
    };
    
    // Priority order based on collection structure:
    // 1. Top-level insured (most common location)
    if (checkInsured(req.insured)) return true;
    // 2. booking_snapshot (as shown in collection structure)
    if (checkInsured(req.booking_snapshot?.insured)) return true;
    // 3. booking_data (as shown in collection structure)
    if (checkInsured(req.booking_data?.insured)) return true;
    // 4. booking object
    if (checkInsured(req.booking?.insured)) return true;
    // 5. verification
    if (checkInsured(req.verification?.insured)) return true;
    // 6. sender
    if (checkInsured(req.sender?.insured)) return true;
    // 7. request_id
    if (checkInsured(req.request_id?.insured)) return true;
    // 8. request_id.booking
    if (checkInsured(req.request_id?.booking?.insured)) return true;
    // 9. request_id.sender
    if (checkInsured(req.request_id?.sender?.insured)) return true;
    // 10. request_id.booking_id (if populated as object)
    if (req.request_id?.booking_id && typeof req.request_id.booking_id === 'object' && checkInsured(req.request_id.booking_id.insured)) return true;
    // 11. booking_id (if populated as object)
    if (req.booking_id && typeof req.booking_id === 'object' && checkInsured(req.booking_id.insured)) return true;
    
    return false;
  };

  const getDeclaredValue = () => {
    const req = requestData || request; // Use full data if available
    const declaredValue = req.declared_value || 
                         req.declaredAmount ||
                         req.booking?.declared_value || 
                         req.booking?.declaredAmount ||
                         req.request_id?.declared_value ||
                         req.request_id?.declaredAmount ||
                         req.request_id?.booking?.declared_value ||
                         req.request_id?.booking?.declaredAmount ||
                         0;
    
    // Handle MongoDB Decimal128 format
    if (typeof declaredValue === 'object' && declaredValue.$numberDecimal) {
      return parseFloat(declaredValue.$numberDecimal).toString();
    }
    return declaredValue ? declaredValue.toString() : '';
  };

  // Update verificationData when fullRequestData is loaded
  useEffect(() => {
    if (!fullRequestData) return;
    const req = fullRequestData;
    setVerificationData(prev => ({
      ...prev,
      invoice_number: req.invoice_number || req.verification?.invoice_number || prev.invoice_number,
      tracking_code: req.tracking_code || req.verification?.tracking_code || prev.tracking_code,
      service_code: initialServiceCode || prev.service_code,
      amount: req.amount?.toString() || req.verification?.amount?.toString() || prev.amount,
      actual_weight: req.weight?.toString() || req.verification?.actual_weight?.toString() || prev.actual_weight,
      volumetric_weight: req.verification?.volumetric_weight?.toString() || prev.volumetric_weight,
      volume_cbm: req.volume_cbm?.toString() || req.verification?.volume_cbm?.toString() || prev.volume_cbm,
      receiver_address: req.receiver_address || req.verification?.receiver_address || prev.receiver_address,
      receiver_phone: req.receiver_phone || req.verification?.receiver_phone || prev.receiver_phone,
      agents_name: req.verification?.agents_name || req.created_by_employee_id?.full_name || prev.agents_name,
      shipment_classification: req.verification?.shipment_classification || (isInitialPhToUae ? 'GENERAL' : prev.shipment_classification),
      weight_type: req.verification?.weight_type || prev.weight_type,
      cargo_service: req.verification?.cargo_service || prev.cargo_service,
      sender_details_complete: req.verification?.sender_details_complete ?? prev.sender_details_complete,
      receiver_details_complete: req.verification?.receiver_details_complete ?? prev.receiver_details_complete,
      number_of_boxes: req.verification?.number_of_boxes || prev.number_of_boxes,
      total_kg: req.verification?.total_kg?.toString() || prev.total_kg,
      verification_notes: req.verification?.verification_notes || prev.verification_notes,
      declared_value: req.verification?.declared_value?.toString() || getDeclaredValue() || prev.declared_value,
      insured: getInsuredValue() || prev.insured,
    }));
  }, [fullRequestData, initialServiceCode, isInitialPhToUae]);

  const [verificationData, setVerificationData] = useState(() => {
    const req = request;
    return {
      invoice_number: req.invoice_number || req.verification?.invoice_number || '',
      tracking_code: req.tracking_code || req.verification?.tracking_code || '',
    service_code: initialServiceCode,
      amount: req.amount?.toString() || req.verification?.amount?.toString() || '',
      actual_weight: req.weight?.toString() || req.verification?.actual_weight?.toString() || '',
      volumetric_weight: req.verification?.volumetric_weight?.toString() || '',
      volume_cbm: req.volume_cbm?.toString() || req.verification?.volume_cbm?.toString() || '',
      receiver_address: req.receiver_address || req.verification?.receiver_address || '',
      receiver_phone: req.receiver_phone || req.verification?.receiver_phone || '',
      agents_name: req.verification?.agents_name || req.created_by_employee_id?.full_name || '',
      shipment_classification: req.verification?.shipment_classification || (isInitialPhToUae ? 'GENERAL' : ''),
      weight_type: req.verification?.weight_type || '',
      cargo_service: req.verification?.cargo_service || '',
      sender_details_complete: req.verification?.sender_details_complete || false,
      receiver_details_complete: req.verification?.receiver_details_complete || false,
      number_of_boxes: req.verification?.number_of_boxes || '',
      total_kg: req.verification?.total_kg?.toString() || '',
      verification_notes: req.verification?.verification_notes || '',
      declared_value: req.verification?.declared_value?.toString() || getDeclaredValue() || '',
    insured: getInsuredValue(),
    };
  });

  // Calculate actual weight
  const actualWeight = useMemo(() => {
    return parseFloat(verificationData.actual_weight) || 0;
  }, [verificationData.actual_weight]);

  // Calculate volumetric weight from input
  const volumetricWeight = useMemo(() => {
    return parseFloat(verificationData.volumetric_weight) || 0;
  }, [verificationData.volumetric_weight]);

  // Auto-determine weight type and chargeable weight (comparing actual vs volumetric)
  const { chargeableWeight, determinedWeightType } = useMemo(() => {
    const volWeight = volumetricWeight;
    const actWeight = actualWeight;
    
    if (actWeight === 0 && volWeight === 0) {
      return { chargeableWeight: 0, determinedWeightType: '' };
    }
    
    if (actWeight >= volWeight) {
      return { 
        chargeableWeight: actWeight, 
        determinedWeightType: 'ACTUAL'
      };
    } else {
      return { 
        chargeableWeight: volWeight, 
        determinedWeightType: 'VOLUMETRIC'
      };
    }
  }, [actualWeight, volumetricWeight]);

  // Update service code when booking data is available
  useEffect(() => {
    const bookingServiceCode = getServiceCodeFromBooking();
    if (bookingServiceCode && bookingServiceCode !== verificationData.service_code) {
      secureLog.debug('Updating service code', { from: verificationData.service_code?.substring(0, 30), to: bookingServiceCode?.substring(0, 30) });
      setVerificationData(prev => ({
        ...prev,
        service_code: bookingServiceCode
      }));
    }
  }, [
    requestData?.booking_id, 
    requestData?.booking, 
    requestData?.service, 
    requestData?.service_code,
    requestData?.request_id?.booking_id, 
    requestData?.request_id?.booking,
    requestData?.request_id?.service,
    requestData?.request_id?.service_code,
    request.booking_id, 
    request.booking, 
    request.service, 
    request.service_code,
    request.request_id?.booking_id, 
    request.request_id?.booking,
    request.request_id?.service,
    request.request_id?.service_code
  ]);

  // Determine route from service code (case-insensitive)
  const route = useMemo(() => {
    const req = requestData || request;
    const serviceCode = (verificationData.service_code || req.service_code || '').toUpperCase().trim();
    secureLog.debug('Determining route', { serviceCode: serviceCode?.substring(0, 30) });
    
    if (!serviceCode) {
      secureLog.warn('Service code is empty, cannot determine route');
      return '';
    }
    
    if (serviceCode.includes('PH_TO_UAE')) {
      secureLog.debug('Route determined: PH_TO_UAE');
      return 'PH_TO_UAE';
    } else if (serviceCode.includes('UAE_TO_PH')) {
      secureLog.debug('Route determined: UAE_TO_PH');
      return 'UAE_TO_PH';
    }
    
    secureLog.warn('No route found for service code', { serviceCode: serviceCode?.substring(0, 30) });
    return '';
  }, [verificationData.service_code, requestData?.service_code, request.service_code]);

  const isPhToUaeRoute = route === 'PH_TO_UAE';

  // Auto-set classification to GENERAL for PH→UAE routes
  useEffect(() => {
    if (route === 'PH_TO_UAE' && verificationData.shipment_classification !== 'GENERAL') {
    setVerificationData(prev => ({
      ...prev,
        shipment_classification: 'GENERAL'
    }));
    }
  }, [route, verificationData.shipment_classification]);


  // Auto-calculate amount per kg based on chargeable weight and route
  const { calculatedRate, rateBracket } = useMemo(() => {
    // Use the route from the useMemo above
    const currentRoute = route;
    
    secureLog.debug('Calculating rate', { chargeableWeight, route: currentRoute?.substring(0, 20) });
    
    // Only calculate if we have both chargeable weight > 0 AND a valid route
    if (chargeableWeight > 0 && currentRoute) {
      const result = getRateForWeight(chargeableWeight, currentRoute);
      
      if (result.rate > 0 && result.bracket) {
        secureLog.debug('Rate calculated', { rate: result.rate, bracket: result.bracket.label, weight: chargeableWeight });
        return { calculatedRate: result.rate, rateBracket: result.bracket };
      } else {
        secureLog.warn('Rate calculation returned invalid result', { rate: result.rate });
      }
    }
    
    secureLog.debug('Rate calculation returning 0', { chargeableWeight, route: currentRoute?.substring(0, 20) });
    return { calculatedRate: 0, rateBracket: null };
  }, [chargeableWeight, route]);
  
  // Compute the input value directly from calculatedRate or fallback to verificationData
  // This ensures the input always displays the correct value
  const inputValue = useMemo(() => {
    if (calculatedRate > 0) {
      const value = calculatedRate.toFixed(2);
      secureLog.debug('Input value from calculated rate', { value });
      return value;
    }
    const value = verificationData.amount || '';
    secureLog.debug('Input value from verification data', { value: value?.substring(0, 20) });
    return value;
  }, [calculatedRate, verificationData.amount]);

  // Update amount per kg automatically when rate changes - always override with calculated rate
  useEffect(() => {
    if (calculatedRate > 0) {
      // Always use calculated rate when available - cannot be manually changed
      const rateString = calculatedRate.toFixed(2);
      setVerificationData(prev => {
        // Always update if calculatedRate is available, even if it matches
        secureLog.debug('Updating amount field', { oldAmount: prev.amount?.substring(0, 20), newAmount: rateString, bracket: rateBracket?.label });
        return { ...prev, amount: rateString };
      });
    } else if (calculatedRate === 0 && chargeableWeight > 0 && route) {
      // If we have weight and route but no rate, there might be an issue
      secureLog.warn('Weight and route exist but rate is 0', { chargeableWeight, route: route?.substring(0, 20), serviceCode: (verificationData.service_code || request.service_code)?.substring(0, 30) });
    }
  }, [calculatedRate, rateBracket]);

  // Update weight_type automatically when values change
  useEffect(() => {
    if (determinedWeightType) {
      setVerificationData(prev => ({ ...prev, weight_type: determinedWeightType }));
    }
  }, [determinedWeightType]);


  // Validation function to check if all required fields are completed
  const isVerificationComplete = () => {
    // Check if actual weight is provided
    const hasActualWeight = actualWeight > 0;
    // Check if volumetric weight is provided
    const hasVolumetricWeight = volumetricWeight > 0;
    // Check if classification is set (GENERAL for PH→UAE, or FLOWMIC/COMMERCIAL for UAE→PH)
    const hasClassification = verificationData.shipment_classification !== '';
    
    // Check if insurance fields are required
    const isUaeToPinas = route === 'UAE_TO_PH' || 
                        (verificationData.service_code || '').toUpperCase().includes('UAE_TO_PH') ||
                        (verificationData.service_code || '').toUpperCase().includes('UAE_TO_PINAS');
    // Check insured from database (request/booking/verification/sender), not from form state
    // Handle both boolean true and string "true"
    const checkInsured = (value: any): boolean => {
      return value === true || value === 'true' || value === 1 || value === '1';
    };
    
    const isInsuredInDb = 
      checkInsured(req.insured) ||
      checkInsured(req.verification?.insured) ||
      checkInsured(req.booking?.insured) ||
      checkInsured(req.sender?.insured) ||
      checkInsured(req.request_id?.insured) ||
      checkInsured(req.request_id?.booking?.insured) ||
      checkInsured(req.request_id?.sender?.insured) ||
      (req.request_id?.booking_id && typeof req.request_id.booking_id === 'object' && checkInsured(req.request_id.booking_id.insured)) ||
      (req.booking_id && typeof req.booking_id === 'object' && checkInsured(req.booking_id.insured));
    const hasDeclaredValue = verificationData.declared_value && parseFloat(verificationData.declared_value) > 0;
    
    // If UAE_TO_PH/PINAS + insured in database, declared_value is required (any classification)
    const insuranceFieldsValid = !(isUaeToPinas && isInsuredInDb) || hasDeclaredValue;

    return (
      verificationData.invoice_number &&
      verificationData.tracking_code &&
      verificationData.service_code &&
      verificationData.amount &&
      hasActualWeight &&
      hasVolumetricWeight &&
      verificationData.receiver_address &&
      verificationData.receiver_phone &&
      verificationData.agents_name &&
      hasClassification &&
      determinedWeightType && // Auto-determined weight type
      verificationData.cargo_service &&
      verificationData.number_of_boxes &&
      verificationData.total_kg && // Total kilograms is required
      parseFloat(verificationData.total_kg) > 0 && // Must be greater than 0
      verificationData.sender_details_complete &&
      verificationData.receiver_details_complete &&
      insuranceFieldsValid // Insurance fields validation
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Validate all required fields
    if (!isVerificationComplete()) {
      toast({
        variant: 'destructive',
        title: 'Incomplete Verification',
        description: 'Please complete all required verification points before submitting.',
      });
      setIsSubmitting(false);
      return;
    }

    try {
      // Use calculated rate or the amount from verificationData (if manually overridden)
      const finalAmount = calculatedRate > 0 ? calculatedRate.toString() : verificationData.amount;

      // Check if insurance fields are required
      const isUaeToPinas = route === 'UAE_TO_PH' || 
                          (verificationData.service_code || '').toUpperCase().includes('UAE_TO_PH') ||
                          (verificationData.service_code || '').toUpperCase().includes('UAE_TO_PINAS');
      // Check insured from database (request/booking/verification/sender), not from form state
      // Handle both boolean true and string "true"
      const checkInsured = (value: any): boolean => {
        return value === true || value === 'true' || value === 1 || value === '1';
      };
      
    const req = requestData || request;
    const isInsuredInDb = 
      checkInsured(req.insured) ||
      checkInsured(req.verification?.insured) ||
      checkInsured(req.booking?.insured) ||
      checkInsured(req.sender?.insured) ||
      checkInsured(req.request_id?.insured) ||
      checkInsured(req.request_id?.booking?.insured) ||
      checkInsured(req.request_id?.sender?.insured) ||
      (req.request_id?.booking_id && typeof req.request_id.booking_id === 'object' && checkInsured(req.request_id.booking_id.insured)) ||
      (req.booking_id && typeof req.booking_id === 'object' && checkInsured(req.booking_id.insured));
      
      // Prepare update data
      const updateData: any = {
        ...verificationData,
        shipment_classification: verificationData.shipment_classification, // Use selected classification
        amount: finalAmount, // Use auto-calculated amount
        boxes: [], // Box list is disregarded for now
        total_vm: volumetricWeight, // Use volumetric weight input
        actual_weight: actualWeight,
        volumetric_weight: volumetricWeight,
        chargeable_weight: chargeableWeight,
        weight_type: determinedWeightType, // Auto-determined weight type
        rate_bracket: rateBracket?.label || '', // Store the bracket label
        calculated_rate: calculatedRate, // Store the calculated rate
        number_of_boxes: parseInt(verificationData.number_of_boxes) || 1,
        total_kg: parseFloat(verificationData.total_kg) || 0, // Manual total kilograms input
        weight: chargeableWeight, // Store the chargeable weight (higher of actual or volumetric)
        listed_commodities: '', // Empty for now since boxes are disregarded
      };

      // Add insurance fields for UAE_TO_PH/PINAS + insured = true in database (any classification)
      if (isUaeToPinas && isInsuredInDb && verificationData.declared_value) {
        updateData.declared_value = parseFloat(verificationData.declared_value) || 0;
        updateData.insured = true;
      }

      // First update verification details
      const updateResult = await apiClient.updateVerification(request._id, updateData);

      if (updateResult.success) {
        // Then complete verification
        const completeResult = await apiClient.completeVerification(request._id, {
          verified_by_employee_id: currentUser.employee_id || '68f3601fc0b09b8567b1ba8d',
          verification_notes: verificationData.verification_notes,
        });

        if (completeResult.success) {
          toast({
            title: 'Verification Complete',
            description: 'All verification points checked and request sent for invoice generation',
          });
          setIsDialogOpen(false);
          onVerificationComplete();
        } else {
          toast({
            variant: 'destructive',
            title: 'Error',
            description: completeResult.error || 'Failed to complete verification',
          });
        }
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: updateResult.error || 'Failed to update verification details',
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to complete verification',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileCheck className="mr-2 h-4 w-4" />
          Verify Details
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Operations Verification - 6 Mandatory Checks</DialogTitle>
          <DialogDescription>
            Complete all 6 verification points before sending to Finance for invoice generation.
          </DialogDescription>
        </DialogHeader>
        {isLoadingFullData && (
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
              <p className="text-sm text-muted-foreground">Loading full request details...</p>
            </div>
          </div>
        )}
        {!isLoadingFullData && (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Progress Indicator */}
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-blue-900">Verification Progress</h3>
              <span className="text-sm text-blue-700">
                {isVerificationComplete() ? '✅ Complete' : '⚠️ Incomplete'}
              </span>
            </div>
            <div className="text-sm text-blue-800">
              All 6 verification points must be completed before sending to Finance
            </div>
          </div>

          {/* Invoice & Tracking Verification */}
          <div className="border-l-4 border-purple-500 pl-4 space-y-4">
            <h3 className="font-semibold text-lg mb-4 text-purple-900">Invoice & Tracking Information</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="invoice_number">Invoice Number *</Label>
                <Input
                  id="invoice_number"
                  value={verificationData.invoice_number}
                  readOnly
                  className="bg-muted cursor-not-allowed text-muted-foreground"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">Auto-generated and locked for operations</p>
              </div>
              
              <div>
                <Label htmlFor="tracking_code">Tracking Code *</Label>
                <Input
                  id="tracking_code"
                  value={verificationData.tracking_code}
                  readOnly
                  className="bg-muted cursor-not-allowed text-muted-foreground"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">Matches AWB and cannot be edited here</p>
              </div>
              </div>
              
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="service_code">Service Code *</Label>
                <Select
                  value={verificationData.service_code || undefined}
                  onValueChange={(value) => setVerificationData({ ...verificationData, service_code: value })}
                  required
                  disabled
                >
                  <SelectTrigger className="bg-muted cursor-not-allowed text-muted-foreground">
                    <SelectValue placeholder={verificationData.service_code || "Select service code"} />
                  </SelectTrigger>
                  <SelectContent className="max-h-[400px]">
                    {/* PH to UAE Options */}
                    <SelectItem value="PH_TO_UAE">
                      <div className="flex flex-col py-1">
                        <span className="font-semibold">PH to UAE</span>
                        {chargeableWeight > 0 && route === 'PH_TO_UAE' && rateBracket && (
                          <span className="text-xs text-blue-600 font-medium">
                            Active: {rateBracket.label} → {calculatedRate} AED/kg
                          </span>
                        )}
                      </div>
                    </SelectItem>
                    <SelectItem value="PH_TO_UAE_EXPRESS">
                      <div className="flex flex-col py-1">
                        <span className="font-semibold">PH to UAE Express</span>
                        {chargeableWeight > 0 && route === 'PH_TO_UAE' && rateBracket && (
                          <span className="text-xs text-blue-600 font-medium">
                            Active: {rateBracket.label} → {calculatedRate} AED/kg
                          </span>
                        )}
                      </div>
                    </SelectItem>
                    <SelectItem value="PH_TO_UAE_STANDARD">
                      <div className="flex flex-col py-1">
                        <span className="font-semibold">PH to UAE Standard</span>
                        {chargeableWeight > 0 && route === 'PH_TO_UAE' && rateBracket && (
                          <span className="text-xs text-blue-600 font-medium">
                            Active: {rateBracket.label} → {calculatedRate} AED/kg
                          </span>
                        )}
                      </div>
                    </SelectItem>
                    {/* UAE to PH Options */}
                    <SelectItem value="UAE_TO_PH">
                      <div className="flex flex-col py-1">
                        <span className="font-semibold">UAE to PH</span>
                        {chargeableWeight > 0 && route === 'UAE_TO_PH' && rateBracket && (
                          <span className="text-xs text-blue-600 font-medium">
                            Active: {rateBracket.label} → {calculatedRate} AED/kg
                          </span>
                        )}
                      </div>
                    </SelectItem>
                    <SelectItem value="UAE_TO_PH_EXPRESS">
                      <div className="flex flex-col py-1">
                        <span className="font-semibold">UAE to PH Express</span>
                        {chargeableWeight > 0 && route === 'UAE_TO_PH' && rateBracket && (
                          <span className="text-xs text-blue-600 font-medium">
                            Active: {rateBracket.label} → {calculatedRate} AED/kg
                          </span>
                        )}
                      </div>
                    </SelectItem>
                    <SelectItem value="UAE_TO_PH_STANDARD">
                      <div className="flex flex-col py-1">
                        <span className="font-semibold">UAE to PH Standard</span>
                        {chargeableWeight > 0 && route === 'UAE_TO_PH' && rateBracket && (
                          <span className="text-xs text-blue-600 font-medium">
                            Active: {rateBracket.label} → {calculatedRate} AED/kg
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                {/* Show bracket information */}
                {route && chargeableWeight > 0 && rateBracket && (
                  <div className="mt-2 p-2 bg-blue-50 rounded-md border border-blue-200">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-blue-600 flex-shrink-0" />
                      <div className="text-xs text-blue-700">
                        <span className="font-semibold">Active Bracket:</span> {rateBracket.label} 
                        <span className="ml-2">({chargeableWeight.toFixed(2)} kg)</span>
                        <span className="ml-2">→</span>
                        <span className="font-bold ml-2">{calculatedRate} AED/kg</span>
                      </div>
                    </div>
                  </div>
                )}
                {route && chargeableWeight === 0 && (
                  <p className="text-xs text-amber-600 mt-1">
                    Enter Actual Weight and Volumetric Weight to calculate rate bracket
                  </p>
                )}
                {!route && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Select service code to enable rate calculation
                  </p>
                )}
                {/* Important note about weight brackets */}
                {route && (
                  <p className="text-xs text-muted-foreground mt-2 italic">
                    Note: Rate is automatically calculated based on chargeable weight (actual or volumetric, whichever is higher) according to weight brackets.
                  </p>
                )}
              </div>
              
              <div>
                <Label htmlFor="shipment_classification">
                  Classification * {isPhToUaeRoute ? '(Auto: General for PH→UAE)' : '(UAE→Pinas: Flowmic/Commercial)'}
                </Label>
                {isPhToUaeRoute ? (
                  <div className="p-2 bg-muted rounded border text-sm text-gray-600">
                    General shipment (PH → UAE)
                  </div>
                ) : (
                  <Select
                    value={verificationData.shipment_classification}
                    onValueChange={(value) => setVerificationData({ ...verificationData, shipment_classification: value })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select classification" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FLOWMIC">Flowmic</SelectItem>
                      <SelectItem value="COMMERCIAL">Commercial</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {isPhToUaeRoute 
                    ? 'PH → UAE shipments default to General classification'
                    : 'Select Flowmic (Personal) or Commercial for UAE → Pinas shipments'}
                </p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="amount">Amount per kg (AED) * (Auto-Calculated)</Label>
                <div className="space-y-1">
                  <div className="relative">
                    <Input
                      id="amount"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={inputValue}
                      onChange={(e) => {
                        // Only allow editing if rate is not calculated yet
                        if (calculatedRate === 0) {
                          const value = e.target.value;
                          if (value === '' || parseFloat(value) >= 0) {
                            setVerificationData(prev => ({ ...prev, amount: value }));
                          }
                        }
                      }}
                      disabled={calculatedRate > 0}
                      readOnly={calculatedRate > 0}
                      className={calculatedRate > 0 ? 'bg-blue-50 border-blue-300 cursor-not-allowed font-semibold text-blue-900 pr-20' : ''}
                      required
                      key={`amount-${calculatedRate}-${chargeableWeight}`}
                    />
                    {calculatedRate > 0 && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                        <CheckCircle className="h-4 w-4 text-blue-600" />
                      </div>
                    )}
                  </div>
                  {calculatedRate > 0 && rateBracket && (
                    <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 p-2 rounded border border-blue-200">
                      <CheckCircle className="h-3 w-3 flex-shrink-0" />
                      <span>
                        <span className="font-semibold">Auto-calculated:</span> {rateBracket.label} bracket 
                        <span className="mx-1">({chargeableWeight.toFixed(2)} kg)</span>
                        <span>→</span>
                        <span className="font-bold ml-1">{calculatedRate.toFixed(2)} AED/kg</span>
                        <span className="text-blue-500 ml-2">(Cannot be changed manually)</span>
                      </span>
                    </div>
                  )}
                  {calculatedRate === 0 && route && chargeableWeight === 0 && (
                    <div className="text-xs space-y-1">
                      <p className="text-amber-600 font-medium">
                        ⚠️ Enter Actual Weight and Volumetric Weight to calculate rate
                      </p>
                      <p className="text-muted-foreground">
                        Current: Actual Weight = {actualWeight.toFixed(2)} kg, Volumetric Weight = {volumetricWeight.toFixed(2)} kg
                      </p>
                    </div>
                  )}
                  {calculatedRate === 0 && !route && (
                    <p className="text-xs text-amber-600 font-medium">
                      ⚠️ Select service code to enable auto-calculation
                    </p>
                  )}
                  {calculatedRate === 0 && route && chargeableWeight > 0 && (
                    <div className="text-xs space-y-1">
                      <p className="text-red-600 font-medium">
                        ⚠️ Error: Could not calculate rate for {chargeableWeight.toFixed(2)} kg on route {route}
                      </p>
                      <p className="text-muted-foreground">
                        Please check the browser console for details. This might indicate a bracket configuration issue.
                      </p>
                    </div>
                  )}
                </div>
              </div>
              
              <div>
                <Label htmlFor="actual_weight">Actual Weight (kg) *</Label>
                <Input
                  id="actual_weight"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={verificationData.actual_weight}
                  onChange={(e) => setVerificationData({ ...verificationData, actual_weight: e.target.value })}
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="volumetric_weight">Volumetric Weight (kg) *</Label>
                <Input
                  id="volumetric_weight"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={verificationData.volumetric_weight}
                  onChange={(e) => setVerificationData({ ...verificationData, volumetric_weight: e.target.value })}
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Enter the calculated volumetric weight
                </p>
              </div>
              
              <div>
                <Label htmlFor="volume_cbm">Volume (CBM)</Label>
                <Input
                  id="volume_cbm"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={verificationData.volume_cbm}
                  onChange={(e) => setVerificationData({ ...verificationData, volume_cbm: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Delivery Options */}
          <div className="border-l-4 border-amber-500 pl-4 space-y-4 bg-amber-50 p-4 rounded-lg">
            <h3 className="font-semibold text-lg mb-4 text-amber-900">Delivery Options</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-semibold text-gray-700">Sender Delivery Option</Label>
                <div className="mt-1 p-2 bg-white rounded border">
                  <Badge variant={
                    (request.sender_delivery_option || request.request_id?.sender_delivery_option || request.booking?.sender_delivery_option) === 'pickup' 
                      ? 'default' 
                      : 'secondary'
                  } className="text-sm">
                    {(() => {
                      const senderOption = request.sender_delivery_option || 
                                          request.request_id?.sender_delivery_option || 
                                          request.booking?.sender_delivery_option || 
                                          'N/A';
                      if (senderOption === 'pickup') return 'Pickup';
                      if (senderOption === 'delivery') return 'Delivery';
                      return senderOption;
                    })()}
                  </Badge>
                </div>
              </div>
              
              <div>
                <Label className="text-sm font-semibold text-gray-700">Receiver Delivery Option</Label>
                <div className="mt-1 p-2 bg-white rounded border">
                  <Badge variant={
                    (request.receiver_delivery_option || request.request_id?.receiver_delivery_option || request.booking?.receiver_delivery_option) === 'delivery' 
                      ? 'default' 
                      : 'secondary'
                  } className="text-sm">
                    {(() => {
                      const receiverOption = request.receiver_delivery_option || 
                                            request.request_id?.receiver_delivery_option || 
                                            request.booking?.receiver_delivery_option || 
                                            'N/A';
                      if (receiverOption === 'delivery') return 'Delivery';
                      if (receiverOption === 'pickup') return 'Pickup';
                      return receiverOption;
                    })()}
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Receiver Information Verification */}
          <div className="border-l-4 border-green-500 pl-4 space-y-4">
            <h3 className="font-semibold text-lg mb-4 text-green-900">Receiver Information Verification</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="receiver_address">Receiver Address *</Label>
                <Input
                  id="receiver_address"
                  value={verificationData.receiver_address}
                  onChange={(e) => setVerificationData({ ...verificationData, receiver_address: e.target.value })}
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="receiver_phone">Receiver Phone *</Label>
                <Input
                  id="receiver_phone"
                  value={verificationData.receiver_phone}
                  onChange={(e) => setVerificationData({ ...verificationData, receiver_phone: e.target.value })}
                  required
                />
              </div>
            </div>
          </div>

          {/* Agent Information */}
          <div className="border-l-4 border-blue-500 pl-4">
            <h3 className="font-semibold text-lg mb-4 text-blue-900">Agent Information</h3>
            <div>
              <Label htmlFor="agents_name">Agent's Name *</Label>
              <Input
                id="agents_name"
                value={verificationData.agents_name}
                onChange={(e) => setVerificationData({ ...verificationData, agents_name: e.target.value })}
                required
              />
            </div>
          </div>

          {/* Insurance Information - Only for UAE_TO_PH/PINAS + insured = true in database */}
          {(() => {
            const isUaeToPinas = route === 'UAE_TO_PH' || 
                                (verificationData.service_code || '').toUpperCase().includes('UAE_TO_PH') ||
                                (verificationData.service_code || '').toUpperCase().includes('UAE_TO_PINAS');
            // Check insured from database (request/booking/verification/sender), not from form state
            // Check multiple possible paths including nested structures
            // Priority: Top-level insured field first (most common location based on collection structure)
            const checkInsuredValue = (value: any): boolean => {
              return value === true || value === 'true' || value === 1 || value === '1';
            };
            
            const req = requestData || request;
            const isInsuredInDb = 
              // Direct on request (TOP PRIORITY - this is where it's stored in the collection)
              checkInsuredValue(req.insured) ||
              // In booking_snapshot (if booking data is stored here)
              checkInsuredValue(req.booking_snapshot?.insured) ||
              // In booking_data (if booking data is stored here)
              checkInsuredValue(req.booking_data?.insured) ||
              // In booking (if booking is populated as an object)
              checkInsuredValue(req.booking?.insured) ||
              // In verification
              checkInsuredValue(req.verification?.insured) ||
              // In sender
              checkInsuredValue(req.sender?.insured) ||
              // In request_id
              checkInsuredValue(req.request_id?.insured) ||
              // In request_id.booking
              checkInsuredValue(req.request_id?.booking?.insured) ||
              // In request_id.sender
              checkInsuredValue(req.request_id?.sender?.insured) ||
              // In request_id.booking_id (if it's populated as an object)
              (req.request_id?.booking_id && typeof req.request_id.booking_id === 'object' && checkInsuredValue(req.request_id.booking_id.insured)) ||
              // In booking_id (if it's populated as an object)
              (req.booking_id && typeof req.booking_id === 'object' && checkInsuredValue(req.booking_id.insured));
            
            // Secure logging - only log useful info in development
            secureLog.debug('Insurance field check', {
              route,
              serviceCode: verificationData.service_code,
              isUaeToPinas,
              isInsuredInDb,
              insuredFound: isInsuredInDb,
              shouldShowField: isUaeToPinas && isInsuredInDb
            });
            
            // Show declared value field when: UAE_TO_PH/PINAS + insured = true in database (any classification)
            if (isUaeToPinas && isInsuredInDb) {
              return (
                <div className="border-l-4 border-indigo-500 pl-4 space-y-4 bg-indigo-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-lg mb-4 text-indigo-900">Insurance Information</h3>
                  <p className="text-sm text-indigo-800 mb-4">
                    This shipment has service <strong>UAE to PH/PINAS</strong> and is <strong>insured</strong> in the database. Please enter the declared value.
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="insured_checkbox" className="text-sm font-semibold text-gray-700">Insured Status</Label>
                      <div className="mt-1 p-2 bg-white rounded border">
                        <Badge variant="default" className="bg-green-100 text-green-800">
                          ✓ Insured (from database)
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        This shipment is marked as insured in the booking/request
                      </p>
                    </div>
                    
                    <div>
                      <Label htmlFor="declared_value">Declared Value (AED) *</Label>
                      <Input
                        id="declared_value"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={verificationData.declared_value}
                        onChange={(e) => setVerificationData({ ...verificationData, declared_value: e.target.value })}
                        required
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Enter the declared value for insurance calculation (1% of declared value)
                      </p>
                      {verificationData.declared_value && parseFloat(verificationData.declared_value) > 0 && (
                        <p className="text-xs text-blue-600 font-medium mt-1">
                          Insurance Charge: {(parseFloat(verificationData.declared_value) * 0.01).toFixed(2)} AED
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            }
            return null;
          })()}


          {/* Weight Comparison and Auto-Determination */}
          {actualWeight > 0 && volumetricWeight > 0 && (
            <Card className={`border-2 ${
              determinedWeightType === 'ACTUAL' 
                ? 'bg-blue-50 border-blue-300' 
                : 'bg-purple-50 border-purple-300'
            }`}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Weight Comparison & Auto-Determination
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white p-3 rounded-md border">
                    <div className="text-sm font-medium text-gray-700">Actual Weight</div>
                    <div className="text-lg font-bold text-gray-900">{actualWeight.toFixed(2)} kg</div>
                  </div>
                  <div className="bg-white p-3 rounded-md border">
                    <div className="text-sm font-medium text-gray-700">Volumetric Weight (VM)</div>
                    <div className="text-lg font-bold text-gray-900">{volumetricWeight.toFixed(2)} kg</div>
                  </div>
                </div>
                <div className={`p-4 rounded-md ${
                  determinedWeightType === 'ACTUAL' 
                    ? 'bg-blue-100 border-2 border-blue-400' 
                    : 'bg-purple-100 border-2 border-purple-400'
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">
                        Auto-Determined Weight Type: <span className="uppercase">{determinedWeightType}</span>
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        {determinedWeightType === 'ACTUAL' 
                          ? `Actual Weight (${actualWeight.toFixed(2)} kg) is higher than Volumetric Weight (${volumetricWeight.toFixed(2)} kg)`
                          : `Volumetric Weight (${volumetricWeight.toFixed(2)} kg) is higher than Actual Weight (${actualWeight.toFixed(2)} kg)`
                        }
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-600">Chargeable Weight</div>
                      <div className="text-2xl font-bold text-gray-900">
                        {chargeableWeight.toFixed(2)} kg
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Weight Type (Read-Only) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            <div>
              <Label htmlFor="weight_type">Weight Type * (Auto-Determined - Cannot be changed)</Label>
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-3 bg-muted rounded-md border-2">
                  <CheckCircle className={`h-5 w-5 ${
                    determinedWeightType === 'ACTUAL' ? 'text-blue-600' : 'text-purple-600'
                  }`} />
                  <div className="flex-1">
                    <div className="text-sm font-semibold">
                      {determinedWeightType === 'ACTUAL' ? 'ACTUAL WEIGHT' : 'VOLUMETRIC WEIGHT'}
                    </div>
                    {actualWeight > 0 && volumetricWeight > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {determinedWeightType === 'ACTUAL' 
                          ? `Actual Weight (${actualWeight.toFixed(2)} kg) ≥ Volumetric Weight (${volumetricWeight.toFixed(2)} kg)`
                          : `Volumetric Weight (${volumetricWeight.toFixed(2)} kg) > Actual Weight (${actualWeight.toFixed(2)} kg)`
                        }
                      </div>
                    )}
                  </div>
                  {actualWeight > 0 && volumetricWeight > 0 && (
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Chargeable</div>
                      <div className="text-lg font-bold">
                        {chargeableWeight.toFixed(2)} kg
                      </div>
                    </div>
                  )}
                </div>
                {actualWeight === 0 || volumetricWeight === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Enter Actual Weight and Volumetric Weight to auto-determine weight type
                  </p>
                ) : (
                  <p className="text-xs text-amber-600 font-medium">
                    ⚠️ Weight type is automatically determined and cannot be manually changed. The system uses the higher value: {chargeableWeight.toFixed(2)} kg ({determinedWeightType}).
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Cargo Service and Number of Boxes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="cargo_service">Cargo Service *</Label>
              <Select
                value={verificationData.cargo_service}
                onValueChange={(value) => setVerificationData({ ...verificationData, cargo_service: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select cargo service" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SEA">Sea Cargo</SelectItem>
                  <SelectItem value="AIR">Air Cargo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="number_of_boxes">Total Number of Boxes *</Label>
              <Input
                id="number_of_boxes"
                type="number"
                min="1"
                step="1"
                value={verificationData.number_of_boxes}
                onChange={(e) => setVerificationData({ ...verificationData, number_of_boxes: e.target.value })}
                placeholder="Enter number of boxes"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                Enter the total number of boxes manually
              </p>
            </div>
            
            <div>
              <Label htmlFor="total_kg">Total Kilograms (kg) *</Label>
              <Input
                id="total_kg"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={verificationData.total_kg}
                onChange={(e) => setVerificationData({ ...verificationData, total_kg: e.target.value })}
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                Enter the total weight in kilograms manually. This will be used by Finance for invoice generation.
              </p>
            </div>
          </div>

          {/* Verification Checkboxes */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Verification Checklist</h3>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="sender_details_complete"
                checked={verificationData.sender_details_complete}
                onCheckedChange={(checked) => setVerificationData({ ...verificationData, sender_details_complete: checked as boolean })}
              />
              <Label htmlFor="sender_details_complete">Sender details are complete and correct</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="receiver_details_complete"
                checked={verificationData.receiver_details_complete}
                onCheckedChange={(checked) => setVerificationData({ ...verificationData, receiver_details_complete: checked as boolean })}
              />
              <Label htmlFor="receiver_details_complete">Receiver details are complete and correct</Label>
            </div>
          </div>

          {/* Verification Notes */}
          <div>
            <Label htmlFor="verification_notes">Verification Notes</Label>
            <Textarea
              id="verification_notes"
              placeholder="Any additional notes or observations..."
              value={verificationData.verification_notes}
              onChange={(e) => setVerificationData({ ...verificationData, verification_notes: e.target.value })}
              rows={3}
            />
          </div>

          {/* Submit Button */}
          <div className="flex justify-end space-x-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !isVerificationComplete()}>
              {isSubmitting ? 'Completing...' : 'Complete Verification & Send to Finance'}
            </Button>
          </div>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
