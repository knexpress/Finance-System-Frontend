'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { secureLog } from '@/lib/secure-logger';
import { CheckCircle, X, Loader2, Image as ImageIcon, XCircle, Download } from 'lucide-react';
import { generateBookingPDF, normalizeReceiverDeliveryOptionForPdf, type BookingPDFData } from '../../pdfGenerator';

interface BookingReviewModalProps {
  booking: any;
  open: boolean;
  onClose: () => void;
  onReviewComplete: () => void;
  currentUser: any;
  viewOnly?: boolean; // If true, hide approve/reject buttons and make it view-only
}

export default function BookingReviewModal({
  booking,
  open,
  onClose,
  onReviewComplete,
  currentUser,
  viewOnly = false,
}: BookingReviewModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [viewingImageTitle, setViewingImageTitle] = useState<string>('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const { toast } = useToast();

  // Helpers to safely format nested values
  const formatValue = (value: any): string => {
    if (value === undefined || value === null) return 'N/A';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (typeof value === 'object') {
      const obj = value as Record<string, any>;
      if (obj.fullName) return String(obj.fullName);
      if (obj.name) return String(obj.name);
      if (obj.completeAddress || obj.address) return String(obj.completeAddress || obj.address);
      if (obj.emailAddress || obj.email) return String(obj.emailAddress || obj.email);
      if (obj.contactNo || obj.phone || obj.phoneNumber) return String(obj.contactNo || obj.phone || obj.phoneNumber);
      try { const s = JSON.stringify(obj); return s.length > 120 ? s.slice(0,117)+'...' : s; } catch { return 'Object'; }
    }
    return String(value);
  };

  const sender = booking.sender || {};
  const receiver = booking.receiver || {};
  const items: any[] = (
    Array.isArray(booking.items) ? booking.items :
    Array.isArray(booking.orderItems) ? booking.orderItems :
    Array.isArray(booking.listedItems) ? booking.listedItems :
    []
  ).filter(Boolean);

  // Helper function to normalize service code
  const normalizeServiceCode = (code?: string | null) =>
    (code || '')
      .toString()
      .toUpperCase()
      .replace(/[\s-]+/g, '_');

  // Helper function to check if service is UAE TO PINAS
  const isUaeToPinasService = (code?: string | null) => {
    const normalized = normalizeServiceCode(code);
    return normalized === 'UAE_TO_PH' || 
           normalized === 'UAE_TO_PINAS' ||
           normalized.startsWith('UAE_TO_PH_') ||
           normalized.startsWith('UAE_TO_PINAS_') ||
           normalized.includes('UAE_TO_PINAS');
  };

  // Helper function to parse numeric values (for declaredAmount)
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


  const handleApprove = async () => {
    try {
      setIsSubmitting(true);

      if (!currentUser?.employee_id && !currentUser?.uid) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'User information not found',
        });
        return;
      }

      // Review and approve booking (converts to invoice request)
      const result = await apiClient.reviewBooking(booking._id, {
        reviewed_by_employee_id: currentUser.employee_id || currentUser.uid,
      });

      if (result.success) {
        toast({
          title: 'Success',
          description: 'Booking reviewed and converted to invoice request successfully',
        });
        onReviewComplete();
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.error || 'Failed to review booking',
        });
      }
    } catch (error) {
      secureLog.error('Error reviewing booking', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to review booking',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Please provide a rejection reason',
      });
      return;
    }

    try {
      setIsSubmitting(true);

      if (!currentUser?.employee_id && !currentUser?.uid) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'User information not found',
        });
        return;
      }

      // Update booking status to rejected with reason
      const result = await apiClient.updateBookingStatus(booking._id, {
        review_status: 'rejected',
        reviewed_by_employee_id: currentUser.employee_id || currentUser.uid,
        reason: rejectionReason.trim(),
      });

      if (result.success) {
        toast({
          title: 'Success',
          description: 'Booking has been rejected',
        });
        setShowRejectModal(false);
        setRejectionReason('');
        onReviewComplete();
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.error || 'Failed to reject booking',
        });
      }
    } catch (error) {
      secureLog.error('Error rejecting booking', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to reject booking',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      setIsGeneratingPDF(true);

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

      // Helper function to decode HTML entities (e.g., &#x2F; -> /)
      const decodeHtmlEntities = (str: string): string => {
        const textarea = document.createElement('textarea');
        textarea.innerHTML = str;
        return textarea.value;
      };

      // Get images from identityDocuments (primary source) or fallback locations
      const getImageSrc = (imageField: string | undefined): string | undefined => {
        if (!imageField) return undefined;
        
        // Decode HTML entities (fix for data stored with HTML encoding like &#x2F; instead of /)
        let decodedField = imageField;
        if (typeof imageField === 'string' && imageField.includes('&#x')) {
          decodedField = decodeHtmlEntities(imageField);
        }
        
        if (decodedField.startsWith('data:image') || decodedField.startsWith('http')) {
          return decodedField;
        }
        return decodedField;
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
        insured: fullBooking.insured || fullBooking.isInsured || false,
        declaredAmount: fullBooking.declaredAmount || fullBooking.declared_amount || undefined
      };

      // Generate and download PDF
      await generateBookingPDF(pdfData);

      toast({
        title: 'Success',
        description: 'PDF generated and downloaded successfully',
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      secureLog.error('Error generating PDF', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to generate PDF. Please try again.',
      });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // Helper function to decode HTML entities (e.g., &#x2F; -> /)
  const decodeHtmlEntities = (str: string): string => {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = str;
    return textarea.value;
  };

  // Helper function to get image source
  const getImageSrc = (imageField: string | undefined) => {
    if (!imageField) return null;
    
    // Decode HTML entities (fix for data stored with HTML encoding like &#x2F; instead of /)
    let decodedField = imageField;
    if (typeof imageField === 'string' && imageField.includes('&#x')) {
      decodedField = decodeHtmlEntities(imageField);
    }
    
    // If it's a base64 string
    if (decodedField.startsWith('data:image')) {
      return decodedField;
    }
    
    // If it's a URL
    if (decodedField.startsWith('http')) {
      return decodedField;
    }
    
    // Otherwise return as is (might be a path)
    return decodedField;
  };

  // Helper function to open image viewer
  const openImageViewer = (imageSrc: string, title: string) => {
    setViewingImage(imageSrc);
    setViewingImageTitle(title);
  };

  // Check images in order: identityDocuments (primary source) -> top-level -> collections (fallback)
  const idFrontImage = getImageSrc(
    booking.identityDocuments?.eidFrontImage
    || booking.collections?.identityDocuments?.eidFrontImage
    || booking.id_front_image 
    || booking.idFrontImage
  );
  const idBackImage = getImageSrc(
    booking.identityDocuments?.eidBackImage
    || booking.collections?.identityDocuments?.eidBackImage
    || booking.id_back_image 
    || booking.idBackImage
  );
  const philippinesIdFront = getImageSrc(
    booking.identityDocuments?.philippinesIdFront
    || booking.collections?.identityDocuments?.philippinesIdFront
    || booking.philippinesIdFront 
    || booking.philippines_id_front
  );
  const philippinesIdBack = getImageSrc(
    booking.identityDocuments?.philippinesIdBack
    || booking.collections?.identityDocuments?.philippinesIdBack
    || booking.philippinesIdBack 
    || booking.philippines_id_back
  );
  const faceScanImage = getImageSrc(
    booking.face_scan_image 
    || booking.faceScanImage
  );

  // Get additional documents
  const confirmationForm = getImageSrc(
    booking.identityDocuments?.confirmationForm
    || booking.collections?.identityDocuments?.confirmationForm
  );
  const tradeLicense = getImageSrc(
    booking.identityDocuments?.tradeLicense
    || booking.collections?.identityDocuments?.tradeLicense
  );

  // Collect customer images from all possible locations, prioritizing identityDocuments (primary source)
  const allCustomerImages: string[] = [];
  
  // First, add from identityDocuments (primary source based on actual data structure)
  if (Array.isArray(booking.identityDocuments?.customerImages)) {
    allCustomerImages.push(...booking.identityDocuments.customerImages);
  }
  
  // Then add from collections
  if (Array.isArray(booking.collections?.identityDocuments?.customerImages)) {
    allCustomerImages.push(...booking.collections.identityDocuments.customerImages);
  }
  
  // Then add from top-level customerImages
  if (Array.isArray(booking.customerImages)) {
    allCustomerImages.push(...booking.customerImages);
  }
  
  // Add singular customerImage if it exists and is not already in the array
  // Prioritize identityDocuments.customerImage (where the actual data is)
  const singularCustomerImage = booking.identityDocuments?.customerImage 
    || booking.collections?.identityDocuments?.customerImage
    || booking.customerImage;
  const customerImages: string[] = singularCustomerImage && !allCustomerImages.includes(singularCustomerImage)
    ? [...allCustomerImages, singularCustomerImage]
    : allCustomerImages.filter(Boolean);

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
            <DialogTitle>{viewOnly ? 'View Booking Request' : 'Review Booking Request'}</DialogTitle>
            <DialogDescription>
              Review booking details and images before approving
            </DialogDescription>
            <p className="text-sm font-bold text-center mt-3 px-4 py-2 bg-primary/10 text-primary rounded-md">
              Service: {formatValue(
                booking.service || 
                booking.service_code ||
                booking.request_id?.service ||
                booking.request_id?.service_code ||
                'N/A'
              ).toUpperCase()}
            </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-1"
                onClick={handleDownloadPDF}
                disabled={isGeneratingPDF}
              >
                {isGeneratingPDF ? (
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
            </div>
          </DialogHeader>

          <div className="space-y-6 mt-4">
          {/* Booking Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Booking Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-semibold">Customer Name</Label>
                  <p className="text-sm mt-1">
                    {formatValue(booking.customer_name || booking.name || sender.fullName || sender.name)}
                  </p>
                </div>
                <div>
                  <Label className="text-sm font-semibold">Customer Last Name</Label>
                  <p className="text-sm mt-1">
                    {formatValue(
                      booking.customer_last_name || 
                      booking.lastName || 
                      sender.lastName || 
                      (() => {
                        const fullName = booking.customer_name || booking.name || sender.fullName || sender.name || '';
                        const parts = String(fullName).split(' ');
                        return parts.length > 1 ? parts.slice(1).join(' ') : 'N/A';
                      })()
                    )}
                  </p>
                </div>
                <div>
                  <Label className="text-sm font-semibold">Customer Phone</Label>
                  <p className="text-sm mt-1">
                    {formatValue(booking.customer_phone || booking.phone || sender.contactNo || sender.phone)}
                  </p>
                </div>
                <div>
                  <Label className="text-sm font-semibold">Sender Address</Label>
                  <p className="text-sm mt-1">
                    {formatValue(
                      booking.sender_address || 
                      booking.senderAddress || 
                      sender.completeAddress || 
                      sender.address ||
                      booking.origin_place || 
                      booking.origin
                    )}
                  </p>
                </div>
                <div>
                  <Label className="text-sm font-semibold">Receiver Name</Label>
                  <p className="text-sm mt-1">
                    {formatValue(booking.receiver_name || booking.receiverName || receiver.fullName || receiver.name)}
                  </p>
                </div>
                <div>
                  <Label className="text-sm font-semibold">Receiver Address</Label>
                  <p className="text-sm mt-1">
                    {formatValue(booking.receiver_address || booking.receiverAddress || receiver.completeAddress || receiver.address)}
                  </p>
                </div>
                <div>
                  <Label className="text-sm font-semibold">Receiver Phone</Label>
                  <p className="text-sm mt-1">
                    {formatValue(booking.receiver_phone || booking.receiverPhone || receiver.contactNo || receiver.phone)}
                  </p>
                </div>
                <div>
                  <Label className="text-sm font-semibold">Sender Email</Label>
                  <p className="text-sm mt-1">
                    {formatValue(booking.customer_email || booking.email || sender.emailAddress || sender.email || 'N/A')}
                  </p>
                </div>
                <div>
                  <Label className="text-sm font-semibold">Receiver Email</Label>
                  <p className="text-sm mt-1">
                    {formatValue(booking.receiver_email || booking.receiverEmail || receiver.emailAddress || receiver.email || 'N/A')}
                  </p>
                </div>
                <div>
                  <Label className="text-sm font-semibold">Sales Agent Name</Label>
                  <p className="text-sm mt-1">
                    {formatValue(
                      sender.agentName ||
                      booking.sales_agent_name || 
                      booking.agentName || 
                      booking.agent?.name || 
                      booking.agent?.full_name || 
                      booking.agent?.fullName ||
                      booking.salesAgent?.name ||
                      booking.salesAgent?.full_name ||
                      booking.salesAgent?.fullName ||
                      booking.created_by_employee?.full_name ||
                      booking.created_by_employee?.fullName ||
                      booking.created_by_employee?.name ||
                      booking.createdByEmployee?.full_name ||
                      booking.createdByEmployee?.fullName ||
                      booking.createdByEmployee?.name ||
                      'N/A'
                    )}
                  </p>
                </div>
                {/* Insurance Information - Only for UAE TO PINAS service when insured is true */}
                {(() => {
                  const serviceCode = booking.service || 
                                    booking.service_code ||
                                    booking.request_id?.service ||
                                    booking.request_id?.service_code ||
                                    '';
                  const isUaeToPinas = isUaeToPinasService(serviceCode);
                  // Check insured in multiple locations: sender object, booking object, request_id
                  const insured = sender.insured || 
                                 booking.insured || 
                                 booking.request_id?.insured ||
                                 booking.request_id?.sender?.insured ||
                                 false;
                  // Check declaredAmount in multiple locations: sender object, booking object, request_id
                  const declaredAmount = sender.declaredAmount || 
                                       sender.declared_amount ||
                                       booking.declaredAmount || 
                                       booking.declared_amount ||
                                       booking.request_id?.declaredAmount ||
                                       booking.request_id?.declared_amount ||
                                       booking.request_id?.sender?.declaredAmount ||
                                       booking.request_id?.sender?.declared_amount ||
                                       null;
                  
                  if (isUaeToPinas && insured === true && declaredAmount) {
                    const amount = parseNumericValue(declaredAmount);
                    return (
                      <div>
                        <Label className="text-sm font-semibold">Insurance</Label>
                        <p className="text-sm mt-1">
                          {amount === 'N/A' ? 'N/A' : `${typeof amount === 'number' ? amount.toFixed(2) : amount} AED`}
                        </p>
                      </div>
                    );
                  }
                  return null;
                })()}
                {/* OTP Verification */}
                {booking.otpVerification && (
                  <div>
                    <Label className="text-sm font-semibold">OTP Code</Label>
                    <p className="text-sm mt-1">
                      {formatValue(booking.otpVerification.otp || 'N/A')}
                    </p>
                  </div>
                )}
              </div>
              {booking.notes && (
                <div>
                  <Label className="text-sm font-semibold">Notes</Label>
                  <p className="text-sm mt-1">{booking.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>


        {/* Commodities */}
        {items.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Commodities</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left p-2">Commodity</th>
                      <th className="text-left p-2">Quantity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, idx) => {
                      const commodity = it?.commodity || it?.name || it?.description || it?.item || it?.title || 'N/A';
                      const qty = it?.qty || it?.quantity || it?.count || 'N/A';
                      return (
                        <tr key={it?.id || idx} className="border-t">
                          <td className="p-2">{formatValue(commodity)}</td>
                          <td className="p-2">{formatValue(qty)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

          {/* Images */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Verification Images</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* ID Front Image */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <ImageIcon className="h-4 w-4" />
                    ID Front
                  </Label>
                  {idFrontImage ? (
                    <div 
                      className="relative w-full aspect-video border rounded-md overflow-hidden cursor-zoom-in"
                      onClick={() => openImageViewer(idFrontImage, 'ID Front')}
                    >
                      <img
                        src={idFrontImage}
                        alt="ID Front"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="w-full aspect-video border rounded-md flex items-center justify-center text-muted-foreground">
                      <p className="text-sm">No image available</p>
                    </div>
                  )}
                </div>

                {/* ID Back Image */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <ImageIcon className="h-4 w-4" />
                    ID Back
                  </Label>
                  {idBackImage ? (
                    <div 
                      className="relative w-full aspect-video border rounded-md overflow-hidden cursor-zoom-in"
                      onClick={() => openImageViewer(idBackImage, 'ID Back')}
                    >
                      <img
                        src={idBackImage}
                        alt="ID Back"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="w-full aspect-video border rounded-md flex items-center justify-center text-muted-foreground">
                      <p className="text-sm">No image available</p>
                    </div>
                  )}
                </div>

                {/* Philippines ID Front Image */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <ImageIcon className="h-4 w-4" />
                    Philippines ID Front
                  </Label>
                  {philippinesIdFront ? (
                    <div 
                      className="relative w-full aspect-video border rounded-md overflow-hidden cursor-zoom-in"
                      onClick={() => openImageViewer(philippinesIdFront, 'Philippines ID Front')}
                    >
                      <img
                        src={philippinesIdFront}
                        alt="Philippines ID Front"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="w-full aspect-video border rounded-md flex items-center justify-center text-muted-foreground">
                      <p className="text-sm">No image available</p>
                    </div>
                  )}
                </div>

                {/* Philippines ID Back Image */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <ImageIcon className="h-4 w-4" />
                    Philippines ID Back
                  </Label>
                  {philippinesIdBack ? (
                    <div 
                      className="relative w-full aspect-video border rounded-md overflow-hidden cursor-zoom-in"
                      onClick={() => openImageViewer(philippinesIdBack, 'Philippines ID Back')}
                    >
                      <img
                        src={philippinesIdBack}
                        alt="Philippines ID Back"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="w-full aspect-video border rounded-md flex items-center justify-center text-muted-foreground">
                      <p className="text-sm">No image available</p>
                    </div>
                  )}
                </div>

                {/* Face Scan Image - Only show if image exists */}
                {faceScanImage && (
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold flex items-center gap-2">
                      <ImageIcon className="h-4 w-4" />
                      Face Scan
                    </Label>
                    <div 
                      className="relative w-full aspect-video border rounded-md overflow-hidden cursor-zoom-in"
                      onClick={() => openImageViewer(faceScanImage, 'Face Scan')}
                    >
                      <img
                        src={faceScanImage}
                        alt="Face Scan"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  </div>
                )}

                {/* Client Face Images (Multiple) */}
                <div className="space-y-2 md:col-span-3">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <ImageIcon className="h-4 w-4" />
                    Client Face Images
                  </Label>
                  {customerImages.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {customerImages.map((img, idx) => (
                        <div 
                          key={idx}
                          className="relative w-full aspect-video border rounded-md overflow-hidden cursor-zoom-in"
                          onClick={() => openImageViewer(img, `Client Face ${idx + 1}`)}
                        >
                          <img
                            src={img}
                            alt={`Client Face ${idx + 1}`}
                            className="w-full h-full object-contain"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="w-full border rounded-md flex items-center justify-center text-muted-foreground py-6">
                      <p className="text-sm">No client face images</p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Additional Documents Section */}
          {(confirmationForm || tradeLicense) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Additional Documents</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Confirmation Form */}
                  {confirmationForm && (
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold flex items-center gap-2">
                        <ImageIcon className="h-4 w-4" />
                        Confirmation Form
                      </Label>
                      <div 
                        className="relative w-full aspect-video border rounded-md overflow-hidden cursor-zoom-in"
                        onClick={() => openImageViewer(confirmationForm, 'Confirmation Form')}
                      >
                        <img
                          src={confirmationForm}
                          alt="Confirmation Form"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    </div>
                  )}

                  {/* Trade License */}
                  {tradeLicense && (
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold flex items-center gap-2">
                        <ImageIcon className="h-4 w-4" />
                        Trade License
                      </Label>
                      <div 
                        className="relative w-full aspect-video border rounded-md overflow-hidden cursor-zoom-in"
                        onClick={() => openImageViewer(tradeLicense, 'Trade License')}
                      >
                        <img
                          src={tradeLicense}
                          alt="Trade License"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          {!viewOnly && (
            <div className="flex justify-end gap-4 pt-4">
              <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => setShowRejectModal(true)}
                disabled={isSubmitting || booking.review_status === 'reviewed' || booking.review_status === 'rejected'}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Reject
              </Button>
              <Button
                onClick={handleApprove}
                disabled={isSubmitting || booking.review_status === 'reviewed' || booking.review_status === 'rejected'}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Approve & Convert to Invoice Request
                  </>
                )}
              </Button>
            </div>
          )}
          {viewOnly && (
            <div className="flex justify-end gap-4 pt-4">
              {/* New button placeholder - functionality to be added */}
              <Button variant="outline" onClick={onClose}>
                <X className="h-4 w-4 mr-2" />
                Close
              </Button>
            </div>
          )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Image Viewer Modal */}
      <Dialog open={!!viewingImage} onOpenChange={() => setViewingImage(null)}>
        <DialogContent className="max-w-5xl max-h-[95vh] p-0">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle>{viewingImageTitle}</DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6">
            {viewingImage && (
              <div className="relative w-full h-[calc(95vh-120px)] flex items-center justify-center bg-black/5 rounded-md overflow-hidden">
                <img
                  src={viewingImage}
                  alt={viewingImageTitle}
                  className="max-w-full max-h-full object-contain"
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Rejection Reason Modal */}
      <Dialog open={showRejectModal} onOpenChange={setShowRejectModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Booking</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this booking request.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rejection-reason">Rejection Reason *</Label>
              <Textarea
                id="rejection-reason"
                placeholder="Enter the reason for rejection..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={5}
                className="resize-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setShowRejectModal(false);
                setRejectionReason('');
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={isSubmitting || !rejectionReason.trim()}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 mr-2" />
                  Submit Rejection
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

