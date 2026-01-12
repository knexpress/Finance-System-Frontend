'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
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
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Download, Loader2, CheckCircle, Trash2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { generateBookingPDF, type BookingPDFData } from '../../pdfGenerator';

interface SalesBookingFormProps {
  onBookingCreated: () => void;
  currentUser: any;
}


type BookingType = 'uae_to_pinas' | 'pinas_to_uae';

export default function SalesBookingForm({ onBookingCreated, currentUser }: SalesBookingFormProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [bookingType, setBookingType] = useState<BookingType>('uae_to_pinas');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [createdBooking, setCreatedBooking] = useState<any>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const { toast } = useToast();

  // Debug: Log dialog state changes
  useEffect(() => {
    console.log('[SalesBookingForm] Dialog state changed:', {
      showSuccessDialog,
      hasBooking: !!createdBooking,
      bookingAWB: createdBooking?.awb || createdBooking?.awb_number || createdBooking?.tracking_code
    });
  }, [showSuccessDialog, createdBooking]);

  // Sender Information (UAE)
  const [senderFirstName, setSenderFirstName] = useState('');
  const [senderLastName, setSenderLastName] = useState('');
  const [senderAddress, setSenderAddress] = useState('');
  const [senderDeliveryOption, setSenderDeliveryOption] = useState<'pickup' | 'warehouse'>('pickup');
  const [senderPhone, setSenderPhone] = useState('');
  const [senderEmail, setSenderEmail] = useState('');
  const [agentName, setAgentName] = useState('');
  const [isInsured, setIsInsured] = useState(false);
  const [declaredValue, setDeclaredValue] = useState('');

  // Receiver Information (PINAS)
  const [receiverFirstName, setReceiverFirstName] = useState('');
  const [receiverLastName, setReceiverLastName] = useState('');
  const [receiverAddress, setReceiverAddress] = useState('');
  const [receiverDeliveryOption, setReceiverDeliveryOption] = useState<'pickup' | 'delivery'>('pickup');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [receiverEmail, setReceiverEmail] = useState('');

  // Items - Array of items
  interface Item {
    id: string;
    name: string;
    quantity: number;
  }
  const [items, setItems] = useState<Item[]>([{ id: '1', name: '', quantity: 1 }]);

  // Identity Documents
  const [uaeIdFront, setUaeIdFront] = useState<File | null>(null);
  const [uaeIdBack, setUaeIdBack] = useState<File | null>(null);
  const [pinasIdFront, setPinasIdFront] = useState<File | null>(null);
  const [pinasIdBack, setPinasIdBack] = useState<File | null>(null);

  // Additional Documents (for UAE to Pinas and Pinas to UAE)
  const [confirmationForm, setConfirmationForm] = useState<File | null>(null);
  const [tradeLicense, setTradeLicense] = useState<File | null>(null);

  // Image previews
  const [uaeIdFrontPreview, setUaeIdFrontPreview] = useState<string | null>(null);
  const [uaeIdBackPreview, setUaeIdBackPreview] = useState<string | null>(null);
  const [pinasIdFrontPreview, setPinasIdFrontPreview] = useState<string | null>(null);
  const [pinasIdBackPreview, setPinasIdBackPreview] = useState<string | null>(null);
  const [confirmationFormPreview, setConfirmationFormPreview] = useState<string | null>(null);
  const [tradeLicensePreview, setTradeLicensePreview] = useState<string | null>(null);

  // Create preview URLs when files are selected
  useEffect(() => {
    if (uaeIdFront) {
      const url = URL.createObjectURL(uaeIdFront);
      setUaeIdFrontPreview(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setUaeIdFrontPreview(null);
    }
  }, [uaeIdFront]);

  useEffect(() => {
    if (uaeIdBack) {
      const url = URL.createObjectURL(uaeIdBack);
      setUaeIdBackPreview(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setUaeIdBackPreview(null);
    }
  }, [uaeIdBack]);

  useEffect(() => {
    if (pinasIdFront) {
      const url = URL.createObjectURL(pinasIdFront);
      setPinasIdFrontPreview(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPinasIdFrontPreview(null);
    }
  }, [pinasIdFront]);

  useEffect(() => {
    if (pinasIdBack) {
      const url = URL.createObjectURL(pinasIdBack);
      setPinasIdBackPreview(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPinasIdBackPreview(null);
    }
  }, [pinasIdBack]);


  const convertFileToBase64 = (file: File, imageName: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      try {
        // Log image file info before conversion
        const fileSizeKB = (file.size / 1024).toFixed(2);
        const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
        console.log(`[Image Upload] Converting ${imageName}:`, {
          fileName: file.name,
          fileType: file.type,
          fileSize: `${fileSizeKB} KB (${fileSizeMB} MB)`,
        });

        // Warn if image is very large (base64 increases size by ~33%)
        const maxSizeMB = 5;
        if (file.size > maxSizeMB * 1024 * 1024) {
          console.warn(`[Image Upload] Warning: ${imageName} is large (${fileSizeMB} MB). Base64 encoding will increase size by ~33%.`);
        }

        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
          try {
            // Keep the full data URL including data:image/...;base64, prefix as per schema
            const base64String = reader.result as string;
            const base64SizeKB = (base64String.length * 0.75 / 1024).toFixed(2); // Approximate original size
            const base64SizeMB = (base64String.length * 0.75 / (1024 * 1024)).toFixed(2);
            
            console.log(`[Image Upload] Successfully converted ${imageName}:`, {
              base64Length: base64String.length,
              estimatedOriginalSize: `${base64SizeKB} KB (${base64SizeMB} MB)`,
              dataUrlPrefix: base64String.substring(0, 30) + '...', // Show prefix format
            });

            resolve(base64String);
          } catch (error) {
            console.error(`[Image Upload] Error processing result for ${imageName}:`, error);
            reject(new Error(`Failed to process image ${imageName}: ${error instanceof Error ? error.message : 'Unknown error'}`));
          }
        };
        reader.onerror = (error) => {
          console.error(`[Image Upload] FileReader error for ${imageName}:`, error);
          reject(new Error(`Failed to read image file ${imageName}: ${error instanceof Error ? error.message : 'FileReader error'}`));
        };
      } catch (error) {
        console.error(`[Image Upload] Unexpected error converting ${imageName}:`, error);
        reject(new Error(`Unexpected error converting image ${imageName}: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    });
  };

  // Generate AWB number based on pattern: [A-Z]{3}[0-9]{1}[A-Z]{2}[0-9]{1}[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{1}[A-Z]{1}
  // Total: 15 characters
  // Pattern breakdown:
  // - 3 uppercase letters (prefix)
  // - 1 digit
  // - 2 uppercase letters
  // - 1 digit
  // - 2 uppercase letters
  // - 2 digits
  // - 2 uppercase letters
  // - 1 digit
  // - 1 uppercase letter
  const generateAWB = (prefix: string): string => {
    // Ensure prefix is uppercase and max 3 characters
    let awbPrefix = prefix.toUpperCase();
    if (awbPrefix.length > 3) {
      awbPrefix = awbPrefix.substring(0, 3);
    }

    // Generate random uppercase letter
    const randomLetter = () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
    // Generate random digit
    const randomDigit = () => Math.floor(Math.random() * 10).toString();

    // Build AWB: [A-Z]{3}[0-9]{1}[A-Z]{2}[0-9]{1}[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{1}[A-Z]{1}
    // Pad prefix to exactly 3 characters with random letters if needed
    let prefixPart = awbPrefix;
    while (prefixPart.length < 3) {
      prefixPart += randomLetter();
    }

    const awb = 
      prefixPart +                          // 3 letters (padded if needed)
      randomDigit() +                       // 1 digit
      randomLetter() + randomLetter() +     // 2 letters
      randomDigit() +                       // 1 digit
      randomLetter() + randomLetter() +     // 2 letters
      randomDigit() + randomDigit() +       // 2 digits
      randomLetter() + randomLetter() +     // 2 letters
      randomDigit() +                       // 1 digit
      randomLetter();                       // 1 letter

    return awb;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Validation
    if (!senderFirstName.trim() || !senderLastName.trim()) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Sender first name and last name are required',
      });
      setIsSubmitting(false);
      return;
    }

    if (!receiverFirstName.trim() || !receiverLastName.trim()) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Receiver first name and last name are required',
      });
      setIsSubmitting(false);
      return;
    }

    if (!senderAddress.trim()) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Sender address is required',
      });
      setIsSubmitting(false);
      return;
    }

    if (!receiverAddress.trim()) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Receiver address is required',
      });
      setIsSubmitting(false);
      return;
    }

    if (!senderPhone.trim()) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Sender phone number is required',
      });
      setIsSubmitting(false);
      return;
    }

    if (!receiverPhone.trim()) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Receiver phone number is required',
      });
      setIsSubmitting(false);
      return;
    }

    if (isInsured && (!declaredValue.trim() || parseFloat(declaredValue) <= 0)) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Declared value is required when insurance is selected',
      });
      setIsSubmitting(false);
      return;
    }

    // Validate all items
    const validItems = items.filter(item => item.name.trim() && item.quantity > 0);
    if (validItems.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'At least one item with name and quantity is required',
      });
      setIsSubmitting(false);
      return;
    }

    // Check for items with empty names or invalid quantities
    for (let i = 0; i < items.length; i++) {
      if (items[i].name.trim() && (!items[i].quantity || items[i].quantity < 1)) {
        toast({
          variant: 'destructive',
          title: 'Validation Error',
          description: `Item ${i + 1}: Quantity must be at least 1`,
        });
        setIsSubmitting(false);
        return;
      }
      if (!items[i].name.trim() && items[i].quantity > 0) {
        toast({
          variant: 'destructive',
          title: 'Validation Error',
          description: `Item ${i + 1}: Item name is required`,
        });
        setIsSubmitting(false);
        return;
      }
    }

    // Determine countries and service based on booking type for validation
    const isUaeToPinas = bookingType === 'uae_to_pinas';

    // Validation based on booking type
    if (isUaeToPinas) {
      // For UAE_TO_PH: All 4 images required
      if (!uaeIdFront || !uaeIdBack) {
        toast({
          variant: 'destructive',
          title: 'Validation Error',
          description: 'UAE ID front and back images are required',
        });
        setIsSubmitting(false);
        return;
      }
    }

    // Philippines ID is always required for both booking types
    if (!pinasIdFront || !pinasIdBack) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Philippines ID front and back images are required',
      });
      setIsSubmitting(false);
      return;
    }

    try {
      console.log('[Booking Creation] Starting image conversion process...');
      
      // Convert images to base64 (only if provided)
      let uaeIdFrontBase64: string | null = null;
      let uaeIdBackBase64: string | null = null;
      let pinasIdFrontBase64: string | null = null;
      let pinasIdBackBase64: string | null = null;
      let confirmationFormBase64: string | null = null;
      let tradeLicenseBase64: string | null = null;

      try {
        if (uaeIdFront) {
          uaeIdFrontBase64 = await convertFileToBase64(uaeIdFront, 'UAE ID Front');
        } else {
          console.log('[Image Upload] UAE ID Front: Not provided (optional for PH_TO_UAE)');
        }
      } catch (error) {
        console.error('[Image Upload] Failed to convert UAE ID Front:', error);
        toast({
          variant: 'destructive',
          title: 'Image Conversion Error',
          description: `Failed to convert UAE ID Front image: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
        setIsSubmitting(false);
        return;
      }

      try {
        if (uaeIdBack) {
          uaeIdBackBase64 = await convertFileToBase64(uaeIdBack, 'UAE ID Back');
        } else {
          console.log('[Image Upload] UAE ID Back: Not provided (optional for PH_TO_UAE)');
        }
      } catch (error) {
        console.error('[Image Upload] Failed to convert UAE ID Back:', error);
        toast({
          variant: 'destructive',
          title: 'Image Conversion Error',
          description: `Failed to convert UAE ID Back image: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
        setIsSubmitting(false);
        return;
      }

      try {
        pinasIdFrontBase64 = await convertFileToBase64(pinasIdFront, 'Philippines ID Front');
      } catch (error) {
        console.error('[Image Upload] Failed to convert Philippines ID Front:', error);
        toast({
          variant: 'destructive',
          title: 'Image Conversion Error',
          description: `Failed to convert Philippines ID Front image: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
        setIsSubmitting(false);
        return;
      }

      try {
        pinasIdBackBase64 = await convertFileToBase64(pinasIdBack, 'Philippines ID Back');
      } catch (error) {
        console.error('[Image Upload] Failed to convert Philippines ID Back:', error);
        toast({
          variant: 'destructive',
          title: 'Image Conversion Error',
          description: `Failed to convert Philippines ID Back image: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
        setIsSubmitting(false);
        return;
      }

      // Convert additional documents (optional)
      try {
        if (confirmationForm) {
          confirmationFormBase64 = await convertFileToBase64(confirmationForm, 'Confirmation Form');
        }
      } catch (error) {
        console.error('[Image Upload] Failed to convert Confirmation Form:', error);
        toast({
          variant: 'destructive',
          title: 'Image Conversion Error',
          description: `Failed to convert Confirmation Form: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
        setIsSubmitting(false);
        return;
      }

      try {
        if (tradeLicense) {
          tradeLicenseBase64 = await convertFileToBase64(tradeLicense, 'Trade License');
        }
      } catch (error) {
        console.error('[Image Upload] Failed to convert Trade License:', error);
        toast({
          variant: 'destructive',
          title: 'Image Conversion Error',
          description: `Failed to convert Trade License: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
        setIsSubmitting(false);
        return;
      }

      console.log('[Booking Creation] All images converted successfully');

      // Determine countries and service based on booking type
      const isUaeToPinas = bookingType === 'uae_to_pinas';
      const senderCountry = isUaeToPinas ? 'UNITED ARAB EMIRATES' : 'PHILIPPINES';
      const receiverCountry = isUaeToPinas ? 'PHILIPPINES' : 'UNITED ARAB EMIRATES';
      const senderCountryName = isUaeToPinas ? 'United Arab Emirates' : 'Philippines';
      const receiverCountryName = isUaeToPinas ? 'Philippines' : 'United Arab Emirates';
      const service = isUaeToPinas ? 'uae-to-pinas' : 'ph-to-uae';
      const serviceCode = isUaeToPinas ? 'UAE_TO_PH' : 'PH_TO_UAE';

      // Generate AWB number with appropriate prefix
      // UAE_TO_PINAS: prefix "AE" (will be padded to 3 chars with random letter)
      // PINAS_TO_UAE: prefix "PHL" (already 3 characters)
      const awbPrefix = isUaeToPinas ? 'AE' : 'PHL';
      const awbNumber = generateAWB(awbPrefix);

      // Prepare sender object
      const senderObject: any = {
        firstName: senderFirstName.trim(),
        lastName: senderLastName.trim(),
        fullName: `${senderFirstName.trim()} ${senderLastName.trim()}`,
        name: `${senderFirstName.trim()} ${senderLastName.trim()}`,
        country: senderCountry,
        address: senderAddress.trim(),
        addressLine1: senderAddress.trim(),
        completeAddress: `${senderAddress.trim()}, ${senderCountryName}`,
        deliveryOption: senderDeliveryOption,
        phone: senderPhone.trim(),
        phoneNumber: senderPhone.trim(),
        contactNo: senderPhone.trim(),
        email: senderEmail.trim() || undefined,
        emailAddress: senderEmail.trim() || undefined,
      };

      // Only include agentName for UAE sender (UAE_TO_PH)
      if (isUaeToPinas && agentName.trim()) {
        senderObject.agentName = agentName.trim();
      }

      // Prepare identity documents based on booking type
      const identityDocuments: any = {
        philippinesIdFront: pinasIdFrontBase64,
        philippinesIdBack: pinasIdBackBase64,
      };

      if (isUaeToPinas) {
        // For UAE_TO_PH: All 4 images required
        identityDocuments.eidFrontImage = uaeIdFrontBase64;
        identityDocuments.eidBackImage = uaeIdBackBase64;
      } else {
        // For PH_TO_UAE: EID images are optional (send null if not provided)
        identityDocuments.eidFrontImage = uaeIdFrontBase64 || null;
        identityDocuments.eidBackImage = uaeIdBackBase64 || null;
      }

      // Add additional documents (for both UAE to Pinas and Pinas to UAE)
      if (confirmationFormBase64) {
        identityDocuments.confirmationForm = confirmationFormBase64;
      }
      if (tradeLicenseBase64) {
        identityDocuments.tradeLicense = tradeLicenseBase64;
      }

      // Prepare booking data
      const bookingData = {
        service: service,
        service_code: serviceCode,
        source: 'sales',
        status: 'pending',
        review_status: 'pending',
        awb: awbNumber,
        awb_number: awbNumber,
        tracking_code: awbNumber,
        sender: senderObject,
        receiver: {
          firstName: receiverFirstName.trim(),
          lastName: receiverLastName.trim(),
          fullName: `${receiverFirstName.trim()} ${receiverLastName.trim()}`,
          name: `${receiverFirstName.trim()} ${receiverLastName.trim()}`,
          country: receiverCountry,
          address: receiverAddress.trim(),
          addressLine1: receiverAddress.trim(),
          completeAddress: `${receiverAddress.trim()}, ${receiverCountryName}`,
          deliveryOption: receiverDeliveryOption,
          phone: receiverPhone.trim(),
          phoneNumber: receiverPhone.trim(),
          contactNo: receiverPhone.trim(),
          email: receiverEmail.trim() || undefined,
          emailAddress: receiverEmail.trim() || undefined,
        },
        items: validItems.map(item => ({
          name: item.name.trim(),
          commodity: item.name.trim(),
          description: item.name.trim(),
          qty: item.quantity,
          quantity: item.quantity,
        })),
        number_of_boxes: validItems.reduce((sum, item) => sum + item.quantity, 0),
        identityDocuments: identityDocuments,
        insured: isInsured,
        declaredAmount: isInsured ? parseFloat(declaredValue) : null,
        created_by_employee_id: currentUser.employee_id || currentUser.uid,
      };

      // Calculate total payload size (approximate)
      const payloadString = JSON.stringify(bookingData);
      const payloadSizeKB = (payloadString.length / 1024).toFixed(2);
      const payloadSizeMB = (payloadString.length / (1024 * 1024)).toFixed(2);
      
      console.log('[Booking Creation] Booking data prepared:', {
        service: bookingData.service,
        service_code: bookingData.service_code,
        awb: bookingData.awb,
        hasImages: {
          eidFront: !!identityDocuments.eidFrontImage,
          eidBack: !!identityDocuments.eidBackImage,
          phIdFront: !!identityDocuments.philippinesIdFront,
          phIdBack: !!identityDocuments.philippinesIdBack,
          confirmationForm: !!identityDocuments.confirmationForm,
          tradeLicense: !!identityDocuments.tradeLicense,
        },
        payloadSize: `${payloadSizeKB} KB (${payloadSizeMB} MB)`,
      });

      // Warn if payload is very large
      const maxPayloadMB = 10;
      if (payloadString.length > maxPayloadMB * 1024 * 1024) {
        console.warn(`[Booking Creation] Warning: Payload is large (${payloadSizeMB} MB). This may cause issues with some servers.`);
      }

      // Log a preview of the booking data (without full base64 strings)
      const bookingDataPreview = {
        ...bookingData,
        identityDocuments: {
          eidFrontImage: identityDocuments.eidFrontImage ? `[Base64 string, length: ${identityDocuments.eidFrontImage.length}]` : null,
          eidBackImage: identityDocuments.eidBackImage ? `[Base64 string, length: ${identityDocuments.eidBackImage.length}]` : null,
          philippinesIdFront: identityDocuments.philippinesIdFront ? `[Base64 string, length: ${identityDocuments.philippinesIdFront.length}]` : null,
          philippinesIdBack: identityDocuments.philippinesIdBack ? `[Base64 string, length: ${identityDocuments.philippinesIdBack.length}]` : null,
        },
      };
      console.log('[Booking Creation] Booking data preview (without full base64):', bookingDataPreview);

      console.log('[Booking Creation] Sending booking data to API...');
      const result = await apiClient.createBooking(bookingData);
      console.log('[Booking Creation] API response received:', {
        success: result.success,
        error: result.error,
        hasData: !!result.data,
      });

      if (result.success) {
        console.log('[Booking Creation] Booking created successfully:', result.data);
        console.log('[Booking Creation] Full result:', JSON.stringify(result, null, 2));
        
        // Store created booking data FIRST
        const bookingData = result.data;
        console.log('[Booking Creation] Storing booking data:', bookingData);
        setCreatedBooking(bookingData);
        
        // Set dialog state immediately
        console.log('[Booking Creation] Setting showSuccessDialog to true');
        setShowSuccessDialog(true);
        
        // Reset form but keep it open until dialog is closed
        resetForm();
        // Don't close form or call callback yet - wait for user to close dialog
        
        // Show toast notification (but don't rely on it - dialog is more important)
        toast({
          title: 'Success',
          description: 'Booking created successfully. Check the dialog for AWB number.',
        });
      } else {
        console.error('[Booking Creation] API returned error:', {
          error: result.error,
          fullResponse: result,
        });
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.error || 'Failed to create booking',
        });
      }
    } catch (error: any) {
      console.error('[Booking Creation] Unexpected error creating booking:', {
        error,
        errorMessage: error?.message,
        errorStack: error?.stack,
        errorName: error?.name,
      });
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error?.message || 'Failed to create booking. Please check the console for details.',
      });
    } finally {
      setIsSubmitting(false);
      console.log('[Booking Creation] Form submission completed');
    }
  };

  const openForm = (type: BookingType) => {
    setBookingType(type);
    setIsFormOpen(true);
  };

  const resetForm = () => {
    setSenderFirstName('');
    setSenderLastName('');
    setSenderAddress('');
    setSenderDeliveryOption('pickup');
    setSenderPhone('');
    setSenderEmail('');
    setAgentName('');
    setIsInsured(false);
    setDeclaredValue('');
    setReceiverFirstName('');
    setReceiverLastName('');
    setReceiverAddress('');
    setReceiverDeliveryOption('pickup');
    setReceiverPhone('');
    setReceiverEmail('');
    setItems([{ id: '1', name: '', quantity: 1 }]);
    setUaeIdFront(null);
    setUaeIdBack(null);
    setPinasIdFront(null);
    setPinasIdBack(null);
    setConfirmationForm(null);
    setTradeLicense(null);
    // Preview URLs will be cleared by useEffect cleanup
  };

  const handleClose = () => {
    setIsFormOpen(false);
    resetForm();
  };

  const handleDownloadPDF = async () => {
    if (!createdBooking) return;

    try {
      setIsGeneratingPDF(true);

      // Fetch full booking data from backend to ensure we have all fields
      const bookingId = createdBooking._id || createdBooking.id;
      if (!bookingId) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Booking ID not found. Cannot generate PDF.',
        });
        return;
      }

      const result = await apiClient.getBookingForReview(bookingId);
      const fullBooking = result.success && result.data ? result.data : createdBooking;

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

      // Helper function to decode HTML entities
      const decodeHtmlEntities = (str: string): string => {
        const textarea = document.createElement('textarea');
        textarea.innerHTML = str;
        return textarea.value;
      };

      // Get images from identityDocuments
      const getImageSrc = (imageField: string | undefined): string | undefined => {
        if (!imageField) return undefined;
        
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
                                  fullBooking.sender_delivery_option ||
                                  (fullBooking.sender?.deliveryOption) ||
                                  'warehouse';
      
      const receiverDeliveryOption = receiverData.deliveryOption ||
                                    fullBooking.receiver_delivery_option ||
                                    (fullBooking.receiver?.deliveryOption) ||
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
          deliveryOption: (receiverDeliveryOption === 'address' || receiverDeliveryOption === 'warehouse')
                         ? receiverDeliveryOption
                         : 'warehouse',
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
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to generate PDF. Please try again.',
      });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  return (
    <>
      <div className="flex gap-2">
        <Button onClick={() => openForm('uae_to_pinas')}>
          <PlusCircle className="mr-2 h-4 w-4" />
          New Booking (UAE TO PINAS)
        </Button>
        <Button onClick={() => openForm('pinas_to_uae')} variant="outline">
          <PlusCircle className="mr-2 h-4 w-4" />
          New Booking (PINAS TO UAE)
        </Button>
      </div>

      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-white dark:bg-slate-950 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-6 py-10 space-y-8">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-semibold">
                  Create New Booking ({bookingType === 'uae_to_pinas' ? 'UAE TO PINAS' : 'PINAS TO UAE'})
                </h2>
                <p className="text-sm text-muted-foreground">
                  Enter booking details for {bookingType === 'uae_to_pinas' ? 'UAE to Philippines' : 'Philippines to UAE'} shipment. All fields marked with * are required.
                </p>
              </div>
              <Button variant="ghost" onClick={handleClose}>
                Close
              </Button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Sender Information */}
              <div className="space-y-4 bg-card rounded-xl border p-6 shadow-sm">
                <h3 className="text-lg font-semibold">
                  Sender Information ({bookingType === 'uae_to_pinas' ? 'UAE' : 'Philippines'})
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="sender_first_name">First Name *</Label>
                    <Input
                      id="sender_first_name"
                      value={senderFirstName}
                      onChange={(e) => setSenderFirstName(e.target.value)}
                      required
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="sender_last_name">Last Name *</Label>
                    <Input
                      id="sender_last_name"
                      value={senderLastName}
                      onChange={(e) => setSenderLastName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="md:col-span-2">
                    <Label htmlFor="sender_country">Country *</Label>
                    <Input
                      id="sender_country"
                      value={bookingType === 'uae_to_pinas' ? 'United Arab Emirates' : 'Philippines'}
                      disabled
                      className="bg-muted cursor-not-allowed"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <Label htmlFor="sender_address">Address Line 1 *</Label>
                    <Input
                      id="sender_address"
                      value={senderAddress}
                      onChange={(e) => setSenderAddress(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="sender_delivery_option">Delivery Option *</Label>
                    <Select
                      value={senderDeliveryOption}
                      onValueChange={(value: 'pickup' | 'warehouse') => setSenderDeliveryOption(value)}
                      required
                    >
                      <SelectTrigger id="sender_delivery_option">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pickup">Pickup from home</SelectItem>
                        <SelectItem value="warehouse">Deliver to warehouse</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="sender_phone">Phone Number (with country code) *</Label>
                    <Input
                      id="sender_phone"
                      type="tel"
                      placeholder={bookingType === 'uae_to_pinas' ? '+971501234567' : '+639123456789'}
                      value={senderPhone}
                      onChange={(e) => setSenderPhone(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="sender_email">Email Address (Optional)</Label>
                    <Input
                      id="sender_email"
                      type="email"
                      placeholder="sender@example.com"
                      value={senderEmail}
                      onChange={(e) => setSenderEmail(e.target.value)}
                    />
                  </div>

                  <div>
                    <Label htmlFor="agent_name">Agent Name</Label>
                    <Input
                      id="agent_name"
                      value={agentName}
                      onChange={(e) => setAgentName(e.target.value)}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="insured"
                        checked={isInsured}
                        onCheckedChange={(checked) => {
                          setIsInsured(checked as boolean);
                          if (!checked) setDeclaredValue('');
                        }}
                      />
                      <Label htmlFor="insured" className="text-sm font-normal cursor-pointer">
                        Insurance
                      </Label>
                    </div>
                    {isInsured && (
                      <div className="mt-2">
                        <Label htmlFor="declared_value">Declared Value (AED) *</Label>
                        <Input
                          id="declared_value"
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={declaredValue}
                          onChange={(e) => setDeclaredValue(e.target.value)}
                          required={isInsured}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Receiver Information */}
              <div className="space-y-4 bg-card rounded-xl border p-6 shadow-sm">
                <h3 className="text-lg font-semibold">
                  Receiver Information ({bookingType === 'uae_to_pinas' ? 'Philippines' : 'UAE'})
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="receiver_first_name">First Name *</Label>
                    <Input
                      id="receiver_first_name"
                      value={receiverFirstName}
                      onChange={(e) => setReceiverFirstName(e.target.value)}
                      required
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="receiver_last_name">Last Name *</Label>
                    <Input
                      id="receiver_last_name"
                      value={receiverLastName}
                      onChange={(e) => setReceiverLastName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="md:col-span-2">
                    <Label htmlFor="receiver_country">Country *</Label>
                    <Input
                      id="receiver_country"
                      value={bookingType === 'uae_to_pinas' ? 'Philippines' : 'United Arab Emirates'}
                      disabled
                      className="bg-muted cursor-not-allowed"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <Label htmlFor="receiver_address">Address Line 1 *</Label>
                    <Input
                      id="receiver_address"
                      value={receiverAddress}
                      onChange={(e) => setReceiverAddress(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="receiver_delivery_option">Delivery Option *</Label>
                    <Select
                      value={receiverDeliveryOption}
                      onValueChange={(value: 'pickup' | 'delivery') => setReceiverDeliveryOption(value)}
                      required
                    >
                      <SelectTrigger id="receiver_delivery_option">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pickup">Pickup from warehouse</SelectItem>
                        <SelectItem value="delivery">Deliver to address</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="receiver_phone">Phone Number (with country code) *</Label>
                    <Input
                      id="receiver_phone"
                      type="tel"
                      placeholder={bookingType === 'uae_to_pinas' ? '+639123456789' : '+971501234567'}
                      value={receiverPhone}
                      onChange={(e) => setReceiverPhone(e.target.value)}
                      required
                    />
                  </div>

                  <div className="md:col-span-2">
                    <Label htmlFor="receiver_email">Email Address (Optional)</Label>
                    <Input
                      id="receiver_email"
                      type="email"
                      placeholder="receiver@example.com"
                      value={receiverEmail}
                      onChange={(e) => setReceiverEmail(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-4 bg-card rounded-xl border p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Box Items List</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const newId = Date.now().toString();
                      setItems([...items, { id: newId, name: '', quantity: 1 }]);
                    }}
                    className="flex items-center gap-2"
                  >
                    <PlusCircle className="h-4 w-4" />
                    Add Item
                  </Button>
                </div>
                
                <div className="space-y-4">
                  {items.map((item, index) => (
                    <div key={item.id} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                      <div className="md:col-span-5">
                        <Label htmlFor={`item_name_${item.id}`}>
                          Item {index + 1} *
                        </Label>
                        <Input
                          id={`item_name_${item.id}`}
                          value={item.name}
                          onChange={(e) => {
                            const updatedItems = items.map(i =>
                              i.id === item.id ? { ...i, name: e.target.value } : i
                            );
                            setItems(updatedItems);
                          }}
                          placeholder="Enter item name"
                          required
                        />
                      </div>
                      <div className="md:col-span-3">
                        <Label htmlFor={`item_quantity_${item.id}`}>
                          Quantity *
                        </Label>
                        <Input
                          id={`item_quantity_${item.id}`}
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => {
                            const updatedItems = items.map(i =>
                              i.id === item.id ? { ...i, quantity: parseInt(e.target.value) || 1 } : i
                            );
                            setItems(updatedItems);
                          }}
                          required
                        />
                      </div>
                      <div className="md:col-span-3 flex gap-2">
                        {items.length > 1 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setItems(items.filter(i => i.id !== item.id));
                            }}
                            className="flex items-center gap-2 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                            Remove
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Identity Documents */}
              <div className="space-y-4 bg-card rounded-xl border p-6 shadow-sm">
                <h3 className="text-lg font-semibold">Identity Documents</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* UAE ID */}
                  <div className="space-y-4">
                    <h4 className="font-medium">UAE ID</h4>
                    
                    <div>
                      <Label htmlFor="uae_id_front">
                        Front Image {bookingType === 'uae_to_pinas' ? '*' : ''}
                      </Label>
                      <div className="mt-2">
                        <Input
                          id="uae_id_front"
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) setUaeIdFront(file);
                          }}
                          required={bookingType === 'uae_to_pinas'}
                        />
                        {uaeIdFront && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Selected: {uaeIdFront.name}
                          </p>
                        )}
                        {bookingType === 'pinas_to_uae' && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Optional (for PH TO UAE bookings)
                          </p>
                        )}
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="uae_id_back">
                        Back Image {bookingType === 'uae_to_pinas' ? '*' : ''}
                      </Label>
                      <div className="mt-2">
                        <Input
                          id="uae_id_back"
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) setUaeIdBack(file);
                          }}
                          required={bookingType === 'uae_to_pinas'}
                        />
                        {uaeIdBackPreview && (
                          <div className="mt-2">
                            <img
                              src={uaeIdBackPreview}
                              alt="UAE ID Back Preview"
                              className="w-full max-w-xs h-48 object-contain border rounded-md bg-gray-50"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              Selected: {uaeIdBack?.name || 'UAE ID Back'}
                            </p>
                          </div>
                        )}
                        {bookingType === 'pinas_to_uae' && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Optional (for PH TO UAE bookings)
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Philippines ID */}
                  <div className="space-y-4">
                    <h4 className="font-medium">Philippines ID</h4>
                    
                    <div>
                      <Label htmlFor="pinas_id_front">Front Image *</Label>
                      <div className="mt-2">
                        <Input
                          id="pinas_id_front"
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) setPinasIdFront(file);
                          }}
                          required
                        />
                        {pinasIdFrontPreview && (
                          <div className="mt-2">
                            <img
                              src={pinasIdFrontPreview}
                              alt="Philippines ID Front Preview"
                              className="w-full max-w-xs h-48 object-contain border rounded-md bg-gray-50"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              Selected: {pinasIdFront?.name || 'Philippines ID Front'}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="pinas_id_back">Back Image *</Label>
                      <div className="mt-2">
                        <Input
                          id="pinas_id_back"
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) setPinasIdBack(file);
                          }}
                          required
                        />
                        {pinasIdBackPreview && (
                          <div className="mt-2">
                            <img
                              src={pinasIdBackPreview}
                              alt="Philippines ID Back Preview"
                              className="w-full max-w-xs h-48 object-contain border rounded-md bg-gray-50"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              Selected: {pinasIdBack?.name || 'Philippines ID Back'}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Additional Documents Section (for UAE to Pinas and Pinas to UAE) */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Additional Documents</h3>
                <div className="grid gap-6 md:grid-cols-2">
                  <div>
                    <Label htmlFor="confirmation_form">Confirmation Form</Label>
                    <div className="mt-2">
                      <Input
                        id="confirmation_form"
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setConfirmationForm(file);
                        }}
                      />
                      {confirmationForm && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Selected: {confirmationForm.name}
                        </p>
                      )}
                      {confirmationFormPreview && (
                        <div className="mt-2">
                          <img
                            src={confirmationFormPreview}
                            alt="Confirmation Form Preview"
                            className="w-full max-w-xs h-48 object-contain border rounded-md bg-gray-50"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="trade_license">Trade License</Label>
                    <div className="mt-2">
                      <Input
                        id="trade_license"
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setTradeLicense(file);
                        }}
                      />
                      {tradeLicense && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Selected: {tradeLicense.name}
                        </p>
                      )}
                      {tradeLicensePreview && (
                        <div className="mt-2">
                          <img
                            src={tradeLicensePreview}
                            alt="Trade License Preview"
                            className="w-full max-w-xs h-48 object-contain border rounded-md bg-gray-50"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex justify-end gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Creating...' : 'Create Booking'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Success Dialog */}
      <Dialog 
        open={showSuccessDialog} 
        onOpenChange={(open) => {
          if (!open) {
            // User is closing the dialog
            setShowSuccessDialog(false);
            setIsFormOpen(false);
            setCreatedBooking(null);
            // Call the callback after dialog is closed
            onBookingCreated();
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Booking Created Successfully
            </DialogTitle>
            <DialogDescription>
              Your booking has been created successfully.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm font-medium text-muted-foreground mb-1">AWB Number</p>
              <p className="text-2xl font-bold text-primary">
                {createdBooking?.awb || 
                 createdBooking?.awb_number || 
                 createdBooking?.awbNumber || 
                 createdBooking?.tracking_code ||
                 'N/A'}
              </p>
            </div>
            <Button
              onClick={handleDownloadPDF}
              disabled={isGeneratingPDF}
              className="w-full"
            >
              {isGeneratingPDF ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating PDF...
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
              onClick={() => {
                setShowSuccessDialog(false);
                setIsFormOpen(false);
                setCreatedBooking(null);
                // Call the callback after dialog is closed
                onBookingCreated();
              }}
              className="w-full"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

