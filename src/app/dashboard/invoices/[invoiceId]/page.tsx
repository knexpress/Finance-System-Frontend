'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import InvoiceTemplate from "@/components/invoice-template";
import TaxInvoiceTemplate from "@/components/tax-invoice-template";
import { apiClient } from "@/lib/api-client";
import { useParams, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText, Receipt, AlertCircle, Download, Printer, FileSpreadsheet, Database } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

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
  return normalized === 'UAE_TO_PH' || 
         normalized === 'UAE_TO_PINAS' ||
         normalized.startsWith('UAE_TO_PH_') ||
         normalized.startsWith('UAE_TO_PINAS_') ||
         normalized.includes('UAE_TO_PINAS');
};

export default function InvoicePage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();
    const invoiceId = params?.invoiceId as string;
    const typeParam = searchParams?.get('type');
    // Default to 'normal' (COD) unless explicitly set to 'tax' in URL
    const [invoiceType, setInvoiceType] = useState<'normal' | 'tax'>(typeParam === 'tax' ? 'tax' : 'normal');
    
    const [invoice, setInvoice] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [qrCodeData, setQrCodeData] = useState<any>(null);
    const [refreshKey, setRefreshKey] = useState(0); // Force re-render trigger
    const [forceUpdate, setForceUpdate] = useState(0); // Additional trigger to force recalculation
    const [showEditDialog, setShowEditDialog] = useState(false);
    const [showCodEditDialog, setShowCodEditDialog] = useState(false);
    const [showTaxEditDialog, setShowTaxEditDialog] = useState(false);
    const [showRequestDataDialog, setShowRequestDataDialog] = useState(false);
    const [requestDataSources, setRequestDataSources] = useState<{
        invoice: any | null;
        invoiceRequest: any | null;
    } | null>(null);
    const [loadingRequestDataSources, setLoadingRequestDataSources] = useState(false);
    const [savingEdit, setSavingEdit] = useState(false);
    // Local state for COD invoice edits (frontend-only, does not affect backend)
    const [localCodEdits, setLocalCodEdits] = useState<any>(null);
    const [editForm, setEditForm] = useState({
        // Invoice Header
        invoice_number: '',
        batch_number: '',
        awb_number: '',
        issue_date: '',
        due_date: '',
        // Sender Information
        customer_name: '',
        customer_phone: '',
        customer_email: '',
        origin_place: '',
        // Receiver Information
        receiver_name: '',
        receiver_address: '',
        receiver_phone: '',
        receiver_trn: '',
        // Shipment Details
        number_of_boxes: '',
        weight_kg: '',
        weight_type: 'ACTUAL',
        base_rate: '',
        service_code: '',
        // Charges
        amount: '',
        pickup_charge: '',
        delivery_charge: '',
        insurance_charge: '',
        tax_rate: '',
        tax_amount: '',
        total: '',
        // Agent
        agent_name: '',
        // Notes
        notes: ''
    });
    // Separate edit forms for PH TO UAE COD and Tax invoices (comprehensive like regular edit form)
    const [codEditForm, setCodEditForm] = useState({
        // Invoice Header
        invoice_number: '',
        batch_number: '',
        awb_number: '',
        issue_date: '',
        due_date: '',
        // Sender Information
        customer_name: '',
        customer_phone: '',
        customer_email: '',
        origin_place: '',
        // Receiver Information
        receiver_name: '',
        receiver_address: '',
        receiver_phone: '',
        receiver_trn: '',
        // Shipment Details
        number_of_boxes: '',
        weight_kg: '',
        weight_type: 'ACTUAL',
        base_rate: '',
        service_code: '',
        // COD Charges Only (NO Tax invoice fields)
        amount: '', // Shipping charge for COD
        pickup_charge: '', // Pickup charge for COD
        cod_delivery_charge: '', // COD delivery charge (separate from Tax delivery_charge)
        total_amount_cod: '', // Total amount for COD invoice
        // Agent
        agent_name: '',
        // Notes
        notes: ''
    });
    const [taxEditForm, setTaxEditForm] = useState({
        // Invoice Header
        invoice_number: '',
        batch_number: '',
        awb_number: '',
        issue_date: '',
        due_date: '',
        // Sender Information
        customer_name: '',
        customer_phone: '',
        customer_email: '',
        origin_place: '',
        // Receiver Information
        receiver_name: '',
        receiver_address: '',
        receiver_phone: '',
        receiver_trn: '',
        // Shipment Details
        number_of_boxes: '',
        weight_kg: '',
        weight_type: 'ACTUAL',
        base_rate: '',
        service_code: '',
        // Tax Charges Only (NO COD invoice fields)
        delivery_charge: '', // Delivery charge for Tax invoice
        tax_rate: '5', // Always 5% for PH TO UAE tax invoices
        tax_amount: '', // Tax amount
        total_amount_tax_invoice: '', // Total amount for Tax invoice
        // Agent
        agent_name: '',
        // Notes
        notes: ''
    });
    const { toast } = useToast();

    // Helper function to parse and round decimals (handles Decimal128, numbers, strings)
    // Must be defined before useEffect to avoid initialization errors
    const parseDecimal = (value: any, decimals: number = 2): number => {
        let num = 0;
        if (value === null || value === undefined || value === '') {
            return 0;
        }
        if (typeof value === 'number') {
            num = value;
        } else if (typeof value === 'string') {
            num = parseFloat(value) || 0;
        } else if (value && typeof value === 'object') {
            // Handle Decimal128 objects or objects with toString method
            if (value.toString && typeof value.toString === 'function') {
                num = parseFloat(value.toString()) || 0;
            } else if (value.$numberDecimal) {
                // MongoDB Decimal128 format
                num = parseFloat(value.$numberDecimal) || 0;
            } else {
                num = 0;
            }
        }
        // Round to specified decimal places
        return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
    };

    useEffect(() => {
        const fetchInvoice = async () => {
            if (!invoiceId) {
                setError('Invoice ID is required');
                setLoading(false);
                return;
            }

            console.log('🔍 Fetching invoice with ID:', invoiceId);
            
            try {
                const result = await apiClient.getInvoiceUnified(invoiceId);
                console.log('📄 Invoice API result:', result);
                console.log('📄 Invoice API result.data:', result.data);
                console.log('📄 Invoice API result.success:', result.success);
                console.log('🔍 Initial invoice fetch - cod_delivery_charge check:', {
                    cod_delivery_charge: (result.data as any)?.cod_delivery_charge,
                    cod_delivery_charge_type: typeof (result.data as any)?.cod_delivery_charge,
                    delivery_charge: (result.data as any)?.delivery_charge,
                    delivery_base_amount: (result.data as any)?.delivery_base_amount,
                    all_keys: result.data ? Object.keys(result.data) : []
                });
                if (result.success && result.data) {
                    console.log('✅ Setting invoice data:', {
                        invoice_id: (result.data as any).invoice_id || (result.data as any)._id,
                        cod_delivery_charge: (result.data as any).cod_delivery_charge,
                        delivery_charge: (result.data as any).delivery_charge,
                        delivery_base_amount: (result.data as any).delivery_base_amount
                    });
                    setInvoice(result.data);
                    const invoiceData = result.data as any;
                    // Get insurance charge from invoice (line_items or direct field)
                    let insuranceValue = '';
                    if (invoiceData.insurance_charge !== undefined && invoiceData.insurance_charge !== null) {
                        insuranceValue = parseFloat(invoiceData.insurance_charge).toString();
                    } else if (invoiceData.line_items && invoiceData.line_items.length > 0) {
                        const insuranceItem = invoiceData.line_items.find((item: any) => 
                            item.description?.toLowerCase().includes('insurance')
                        );
                        if (insuranceItem) {
                            insuranceValue = parseFloat(insuranceItem.total || insuranceItem.unit_price || 0).toString();
                        }
                    }
                    
                    // Initialize all edit form fields
                    const invoiceNumber = invoiceData.invoice_id || invoiceData._id || '';
                    const batchNumber = invoiceData.batch_number || invoiceData.request_id?.batch_number || '';
                    const awbNumber = invoiceData.awb_number || invoiceData.request_id?.awb_number || invoiceData.request_id?.tracking_code || '';
                    const issueDate = invoiceData.issue_date ? new Date(invoiceData.issue_date).toISOString().split('T')[0] : '';
                    const dueDate = invoiceData.due_date ? new Date(invoiceData.due_date).toISOString().split('T')[0] : '';
                    
                    const customerName = invoiceData.customer_name || invoiceData.request_id?.customer_name || invoiceData.request_id?.sender?.name || invoiceData.client_id?.company_name || invoiceData.client_id?.contact_name || '';
                    const customerPhone = invoiceData.customer_phone || invoiceData.request_id?.customer_phone || invoiceData.request_id?.sender?.phone || invoiceData.client_id?.contact_phone || '';
                    const customerEmail = invoiceData.customer_email || invoiceData.request_id?.customer_email || invoiceData.request_id?.sender?.email || invoiceData.client_id?.contact_email || '';
                    const originPlace = invoiceData.origin_place || invoiceData.request_id?.origin_place || invoiceData.request_id?.sender?.address || '';
                    
                    const receiverName = invoiceData.receiver_name || invoiceData.request_id?.receiver?.name || '';
                    const receiverAddress = invoiceData.receiver_address || invoiceData.request_id?.receiver?.address || '';
                    const receiverPhone = invoiceData.receiver_phone || invoiceData.request_id?.receiver?.phone || '';
                    const receiverTrn = invoiceData.customer_trn || invoiceData.request_id?.customer_trn || '';
                    
                    const numberOfBoxes = invoiceData.number_of_boxes || invoiceData.request_id?.verification?.number_of_boxes || invoiceData.request_id?.shipment?.number_of_boxes || '';
                    const weightKg = invoiceData.weight_kg || invoiceData.request_id?.verification?.total_kg || invoiceData.request_id?.verification?.chargeable_weight || '';
                    const weightType = invoiceData.request_id?.shipment?.weight_type || invoiceData.request_id?.verification?.weight_type || 'ACTUAL';
                    const baseRate = invoiceData.base_rate ? parseFloat(invoiceData.base_rate).toString() : (invoiceData.request_id?.verification?.calculated_rate ? parseFloat(invoiceData.request_id.verification.calculated_rate.toString()).toString() : '');
                    const serviceCode = invoiceData.service_code || invoiceData.request_id?.service_code || '';
                    
                    const agentName = invoiceData.created_by?.full_name || invoiceData.request_id?.verification?.agents_name || '';
                    
                    setEditForm({
                        // Invoice Header
                        invoice_number: invoiceNumber.toString(),
                        batch_number: batchNumber,
                        awb_number: awbNumber,
                        issue_date: issueDate,
                        due_date: dueDate,
                        // Sender Information
                        customer_name: customerName,
                        customer_phone: customerPhone,
                        customer_email: customerEmail,
                        origin_place: originPlace,
                        // Receiver Information
                        receiver_name: receiverName,
                        receiver_address: receiverAddress,
                        receiver_phone: receiverPhone,
                        receiver_trn: receiverTrn,
                        // Shipment Details
                        number_of_boxes: numberOfBoxes.toString(),
                        weight_kg: weightKg ? parseFloat(weightKg.toString()).toString() : '',
                        weight_type: weightType,
                        base_rate: baseRate,
                        service_code: serviceCode,
                        // Charges
                        amount: invoiceData.amount ? parseFloat(invoiceData.amount).toString() : '',
                        pickup_charge: invoiceData.pickup_charge ? parseFloat(invoiceData.pickup_charge).toString() : '',
                        delivery_charge: invoiceData.delivery_charge ? parseFloat(invoiceData.delivery_charge).toString() : '',
                        insurance_charge: insuranceValue,
                        tax_rate: invoiceData.tax_rate != null ? invoiceData.tax_rate.toString() : '',
                        tax_amount: invoiceData.tax_amount ? parseFloat(invoiceData.tax_amount).toString() : '',
                        total: invoiceData.total ? parseFloat(invoiceData.total).toString() : '',
                        // Agent
                        agent_name: agentName,
                        // Notes
                        notes: invoiceData.notes || ''
                    });
                    
                    // Initialize COD and Tax edit forms for PH TO UAE invoices
                    if (isPhToUaeService(invoiceData.service_code || invoiceData.request_id?.service_code)) {
                        const totalAmountCod = (invoiceData as any).total_amount_cod || (invoiceData as any).totalAmountCod || 0;
                        const totalAmountTaxInvoice = (invoiceData as any).total_amount_tax_invoice || (invoiceData as any).totalAmountTaxInvoice || 0;
                        const codDeliveryChargeForForm = parseDecimal((invoiceData as any).cod_delivery_charge || 0, 2);
                        // Keep delivery_base_amount as fallback for backward compatibility
                        const deliveryBaseAmount = codDeliveryChargeForForm > 0 ? codDeliveryChargeForForm : parseDecimal((invoiceData as any).delivery_base_amount || 0, 2);
                        const deliveryCharge = parseDecimal(invoiceData.delivery_charge || 0, 2);
                        const taxAmount = parseDecimal(invoiceData.tax_amount || 0, 2);
                        
                        // Get pickup charge from invoice or line_items
                        let pickupChargeValue = 0;
                        if (invoiceData.pickup_charge) {
                            pickupChargeValue = parseDecimal(invoiceData.pickup_charge, 2);
                        } else if (invoiceData.line_items && invoiceData.line_items.length > 0) {
                            invoiceData.line_items.forEach((item: any) => {
                                const description = item.description?.toLowerCase() || '';
                                if (description.includes('pickup')) {
                                    pickupChargeValue += parseDecimal(item.total || item.unit_price, 2);
                                }
                            });
                        }
                        
                        // Calculate shipping charge for form if amount is 0
                        let shippingChargeValue = parseDecimal(invoiceData.amount || 0, 2);
                        if (shippingChargeValue === 0 && totalAmountCod > 0) {
                            // Calculate from total_amount_cod: shipping = total - pickup - delivery
                            const totalKgForCalc = parseDecimal(
                                invoiceData.request_id?.verification?.total_kg ||
                                invoiceData.request_id?.verification?.chargeable_weight ||
                                invoiceData.weight_kg || 0, 2
                            );
                            const codDeliveryAmount = totalKgForCalc >= 15 ? 0 : (deliveryBaseAmount > 0 ? deliveryBaseAmount : deliveryCharge);
                            const calculatedShipping = parseDecimal(totalAmountCod, 2) - pickupChargeValue - codDeliveryAmount;
                            if (calculatedShipping > 0) {
                                shippingChargeValue = parseDecimal(calculatedShipping, 2);
                            }
                        }
                        
                        setCodEditForm({
                            // Invoice Header
                            invoice_number: invoiceNumber.toString(),
                            batch_number: batchNumber,
                            awb_number: awbNumber,
                            issue_date: issueDate,
                            due_date: dueDate,
                            // Sender Information
                            customer_name: customerName,
                            customer_phone: customerPhone,
                            customer_email: customerEmail,
                            origin_place: originPlace,
                            // Receiver Information
                            receiver_name: receiverName,
                            receiver_address: receiverAddress,
                            receiver_phone: receiverPhone,
                            receiver_trn: receiverTrn,
                            // Shipment Details
                            number_of_boxes: numberOfBoxes.toString(),
                            weight_kg: weightKg ? parseFloat(weightKg.toString()).toString() : '',
                            weight_type: weightType,
                            base_rate: baseRate,
                            service_code: serviceCode,
                            // COD Charges Only (NO Tax invoice fields)
                            amount: shippingChargeValue > 0 ? shippingChargeValue.toFixed(2) : '',
                            pickup_charge: pickupChargeValue > 0 ? pickupChargeValue.toFixed(2) : '',
                            cod_delivery_charge: deliveryBaseAmount > 0 ? deliveryBaseAmount.toFixed(2) : '',
                            total_amount_cod: totalAmountCod > 0 ? parseFloat(totalAmountCod.toString()).toFixed(2) : '',
                            // Agent
                            agent_name: agentName,
                            // Notes
                            notes: invoiceData.notes || ''
                        });
                        
                        setTaxEditForm({
                            // Invoice Header
                            invoice_number: invoiceNumber.toString(),
                            batch_number: batchNumber,
                            awb_number: awbNumber,
                            issue_date: issueDate,
                            due_date: dueDate,
                            // Sender Information
                            customer_name: customerName,
                            customer_phone: customerPhone,
                            customer_email: customerEmail,
                            origin_place: originPlace,
                            // Receiver Information
                            receiver_name: receiverName,
                            receiver_address: receiverAddress,
                            receiver_phone: receiverPhone,
                            receiver_trn: receiverTrn,
                            // Shipment Details
                            number_of_boxes: numberOfBoxes.toString(),
                            weight_kg: weightKg ? parseFloat(weightKg.toString()).toString() : '',
                            weight_type: weightType,
                            base_rate: baseRate,
                            service_code: serviceCode,
                            // Tax Charges Only (NO COD invoice fields)
                            delivery_charge: deliveryCharge > 0 ? deliveryCharge.toString() : '',
                            tax_rate: '5',
                            tax_amount: taxAmount > 0 ? taxAmount.toString() : '',
                            total_amount_tax_invoice: totalAmountTaxInvoice > 0 ? parseFloat(totalAmountTaxInvoice.toString()).toFixed(2) : '',
                            // Agent
                            agent_name: agentName,
                            // Notes
                            notes: invoiceData.notes || ''
                        });
                    }

                    // Fetch delivery assignment with QR code
                    try {
                        const assignmentResult = await apiClient.getDeliveryAssignmentByInvoice(invoiceId);
                        if (assignmentResult.success && assignmentResult.data) {
                            console.log('📱 QR Code data fetched:', assignmentResult.data);
                            setQrCodeData(assignmentResult.data);
                        } else {
                            console.log('ℹ️ No delivery assignment found for this invoice');
                        }
                    } catch (assignmentError) {
                        console.warn('Could not fetch delivery assignment:', assignmentError);
                        // Not a critical error - invoice might not have a delivery assignment yet
                    }
                } else {
                    setError(result.error || 'Invoice not found');
                }
            } catch (err: any) {
                console.error('Error fetching invoice:', err);
                setError(err.message || 'Failed to load invoice');
            } finally {
                setLoading(false);
            }
        };

        fetchInvoice();
    }, [invoiceId]);

    // Fetch invoice request data when invoice loads (for agent name in template)
    useEffect(() => {
        const fetchInvoiceRequestForTemplate = async () => {
            if (!invoice) return;

            try {
                // Extract invoiceRequestId robustly
                const notesText = ((invoice as any)?.notes || '').toString();
                const idFromNotesMatch = notesText.match(/\b[a-fA-F0-9]{24}\b/);
                const invoiceRequestId =
                    (invoice as any)?.request_id?._id ||
                    (invoice as any)?.request_id ||
                    (invoice as any)?.requestId ||
                    (invoice as any)?.invoice_request_id ||
                    (invoice as any)?.invoiceRequestId ||
                    (idFromNotesMatch ? idFromNotesMatch[0] : undefined);

                if (invoiceRequestId) {
                    const reqRes = await apiClient.getInvoiceRequestDetails(invoiceRequestId.toString(), false);
                    const invoiceRequest = (reqRes as any)?.success ? (reqRes as any).data : null;
                    
                    // Update requestDataSources with invoice request (keep existing invoice if any)
                    setRequestDataSources(prev => ({
                        invoice: prev?.invoice || invoice,
                        invoiceRequest: invoiceRequest
                    }));
                }
            } catch (err) {
                console.error('Failed to fetch invoice request for template:', err);
                // Don't set error state - this is non-critical
            }
        };

        fetchInvoiceRequestForTemplate();
    }, [invoice]);

    // Fetch request data from BOTH sources when the dialog is opened:
    // - invoices collection (via /invoices-unified/:id)
    // - invoiceRequests collection (via /invoice-requests/:id)
    useEffect(() => {
        const fetchRequestDataSources = async () => {
            if (!showRequestDataDialog || !invoiceId) return;

            setLoadingRequestDataSources(true);
            try {
                // Always refetch invoice so dialog uses fresh invoice data
                const invoiceRes = await apiClient.getInvoiceUnified(invoiceId);
                const freshInvoice = (invoiceRes as any)?.success ? (invoiceRes as any).data : null;

                const baseInvoice = freshInvoice || invoice;
                // Extract invoiceRequestId robustly:
                // - invoice.request_id (ObjectId/string) or populated invoice.request_id._id
                // - invoice.invoice_request_id
                // - sometimes backend stores it in notes; parse the first 24-hex ObjectId from notes as fallback
                const notesText = ((baseInvoice as any)?.notes || '').toString();
                const idFromNotesMatch = notesText.match(/\b[a-fA-F0-9]{24}\b/);
                const invoiceRequestId =
                    (baseInvoice as any)?.request_id?._id ||
                    (baseInvoice as any)?.request_id ||
                    (baseInvoice as any)?.requestId ||
                    (baseInvoice as any)?.invoice_request_id ||
                    (baseInvoice as any)?.invoiceRequestId ||
                    (idFromNotesMatch ? idFromNotesMatch[0] : undefined);

                let invoiceRequest: any | null = null;
                if (invoiceRequestId) {
                    // Avoid cached stale request when opening the dialog
                    // Backend does NOT expose GET /invoice-requests/:id. Use details endpoint.
                    const reqRes = await apiClient.getInvoiceRequestDetails(invoiceRequestId.toString(), false);
                    invoiceRequest = (reqRes as any)?.success ? (reqRes as any).data : null;
                }

                setRequestDataSources({
                    invoice: baseInvoice || null,
                    invoiceRequest
                });
            } catch (err) {
                console.error('Failed to fetch request data sources:', err);
                setRequestDataSources({
                    invoice: invoice || null,
                    invoiceRequest: null
                });
            } finally {
                setLoadingRequestDataSources(false);
            }
        };

        fetchRequestDataSources();
        // We intentionally exclude `invoice` from deps to avoid refetch loops; we refetch by invoiceId anyway.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showRequestDataDialog, invoiceId]);

    // Track invoice state changes to ensure re-renders
    useEffect(() => {
        if (invoice) {
            const codDeliveryCharge = (invoice as any).cod_delivery_charge;
            console.log('🔄 Invoice state changed (useEffect):', {
                refreshKey,
                forceUpdate,
                cod_delivery_charge: codDeliveryCharge,
                cod_delivery_charge_type: typeof codDeliveryCharge,
                invoice_id: invoice._id || invoice.invoice_id,
                note: 'Invoice state updated - component should re-render and calculations should use new value'
            });
        }
    }, [invoice, refreshKey, forceUpdate]);

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <div className="text-center">
                    <p className="text-lg">Loading invoice...</p>
                </div>
            </div>
        );
    }

    if (error || !invoice) {
        return (
            <div className="p-8 space-y-4">
                <Card className="p-6">
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Invoice Not Found</AlertTitle>
                        <AlertDescription>
                            {error || 'The invoice you are looking for does not exist or could not be loaded.'}
                        </AlertDescription>
                    </Alert>
                    <div className="mt-4">
                        <Button
                            variant="outline"
                            onClick={() => router.push('/dashboard/invoices')}
                        >
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back to Invoices
                        </Button>
                    </div>
                </Card>
            </div>
        );
    }

    // Debug: Log invoice data
    console.log('🔍 Invoice data for mapping:', invoice);
    if (!invoice) {
        console.error('❌ Invoice is null or undefined');
        return null;
    }

    // Parse amounts from API (round to 2 decimals)
    console.log('💰 Raw invoice amount:', invoice.amount, typeof invoice.amount);
    console.log('💰 Raw invoice delivery_charge:', invoice.delivery_charge, typeof invoice.delivery_charge);
    console.log('💰 Raw invoice base_amount:', invoice.base_amount, typeof invoice.base_amount);
    console.log('💰 Raw invoice total_amount:', invoice.total_amount, typeof invoice.total_amount);
    
    const baseAmount = parseDecimal(invoice.amount, 2); // Shipping amount only
    const deliveryChargeFromInvoice = parseDecimal(invoice.delivery_charge || 0, 2); // Delivery charge from invoice
    const baseAmountWithDelivery = parseDecimal(invoice.base_amount || (baseAmount + deliveryChargeFromInvoice), 2); // Shipping + Delivery
    
    console.log('💰 Parsed amounts:', {
        baseAmount,
        deliveryChargeFromInvoice,
        baseAmountWithDelivery
    });
    
    // Get shipping, pickup, delivery, and insurance charges
    // Initialize from invoice fields (fallback)
    let shippingCharge = baseAmount; // Base amount is shipping only (fallback)
    
    // For PH TO UAE: Try pickup_charge first, then pickup_base_amount as fallback
    // For other routes: Use pickup_charge only
    const serviceCodeRaw =
        invoice.service_code ||
        invoice.request_id?.service_code ||
        invoice.request_id?.verification?.service_code ||
        '';
    const isPhToUae = isPhToUaeService(serviceCodeRaw);
    
    // Read pickup charge: For PH TO UAE, also check pickup_base_amount
    let pickupCharge = parseDecimal(invoice.pickup_charge || 0, 2);
    if (isPhToUae && pickupCharge === 0) {
        // Fallback to pickup_base_amount for PH TO UAE if pickup_charge is not set
        const pickupBaseAmount = parseDecimal((invoice as any).pickup_base_amount || 0, 2);
        if (pickupBaseAmount > 0) {
            pickupCharge = pickupBaseAmount;
            console.log('📦 PH TO UAE: Using pickup_base_amount as pickup charge:', pickupCharge);
        }
    }
    
    let deliveryCharge = 0;
    let insuranceCharge = 0;
    
    // Get weight for calculations (use chargeable weight or actual weight)
    const weightForCalculation = parseDecimal(
        invoice.weight_kg || 
        invoice.request_id?.shipment?.weight || 
        invoice.request_id?.verification?.chargeable_weight ||
        invoice.request_id?.verification?.actual_weight ||
        0, 
        2
    );
    
    // Get total_kg for display (CRITICAL: This is what Operations entered manually)
    // Priority: verification.total_kg (highest priority for display in invoice)
    let totalKg = 0;
    const verificationTotalKg = 
        invoice.request_id?.verification?.total_kg ||
        invoice.request_id?.verification?.chargeable_weight ||
        invoice.request_id?.verification?.actual_weight;
    
    if (verificationTotalKg !== undefined && verificationTotalKg !== null) {
        if (typeof verificationTotalKg === 'object' && verificationTotalKg.$numberDecimal) {
            totalKg = parseDecimal(verificationTotalKg.$numberDecimal, 2);
        } else if (typeof verificationTotalKg === 'number') {
            totalKg = parseDecimal(verificationTotalKg, 2);
        } else {
            totalKg = parseDecimal(verificationTotalKg.toString(), 2);
        }
    }
    
    // Fallback: If total_kg is 0 or not found, use weightForCalculation for display
    // This ensures we always show a weight value
    if (totalKg <= 0) {
        totalKg = weightForCalculation;
        console.log('⚠️ total_kg not found or 0, using weightForCalculation for display', {
            totalKgFromVerification: invoice.request_id?.verification?.total_kg,
            weightForCalculation
        });
    }
    
    // Use total_kg for display, weightForCalculation for rate calculations
    const weight = weightForCalculation; // Keep for backward compatibility in calculations
    // Priority: direct invoice.weight_kg > totalKg (from verification) > weightForCalculation
    // This ensures edited values are displayed correctly
    const displayWeight = invoice.weight_kg 
        ? parseDecimal(invoice.weight_kg, 2) 
        : (totalKg > 0 ? totalKg : weightForCalculation); // Use total_kg for display (or weightForCalculation as fallback)
    
    // Debug logging for weight extraction
    console.log('📊 Weight values for invoice display', {
        totalKg,
        weightForCalculation,
        displayWeight,
        verificationTotalKg: invoice.request_id?.verification?.total_kg,
        hasVerification: !!invoice.request_id?.verification,
        requestIdKeys: invoice.request_id ? Object.keys(invoice.request_id) : [],
        verificationKeys: invoice.request_id?.verification ? Object.keys(invoice.request_id.verification) : []
    });
    // Derive number of boxes with additional fallback to verification boxes array (summing quantities)
    const verificationBoxes = invoice.request_id?.verification?.boxes;
    const boxesCountFromArray = Array.isArray(verificationBoxes) && verificationBoxes.length > 0
        ? verificationBoxes.reduce((sum: number, box: any) => {
            const qty = parseInt((box?.quantity ?? 1).toString(), 10);
            return sum + (Number.isFinite(qty) && qty > 0 ? qty : 1);
          }, 0)
        : null;
    const numberOfBoxesRaw = invoice.request_id?.shipment?.number_of_boxes ||
        invoice.request_id?.verification?.number_of_boxes ||
        invoice.request_id?.number_of_boxes ||
        invoice.number_of_boxes ||
        boxesCountFromArray ||
        1;
    const parsedNumberOfBoxes = parseInt(numberOfBoxesRaw.toString(), 10);
    const validNumberOfBoxes = (!isNaN(parsedNumberOfBoxes) && parsedNumberOfBoxes >= 1) ? parsedNumberOfBoxes : 1;
    const numberOfBoxes = validNumberOfBoxes; // Use for shipment details display
    
    // Calculate charges - ALWAYS use direct invoice fields (they reflect latest edits)
    // Direct fields (amount, pickup_charge, delivery_charge) are updated when editing,
    // so they should always take priority over line_items
    shippingCharge = baseAmount; // Always use invoice.amount (baseAmount is parsed from it)
    pickupCharge = parseDecimal(invoice.pickup_charge || 0, 2);
    deliveryCharge = deliveryChargeFromInvoice; // Always use invoice.delivery_charge
    
    // Only get insurance from database (line_items or invoice field) - no fallback calculation
    // CRITICAL: Check for direct insurance_charge field first
    // If insurance_charge is explicitly set (even if 0), use it and DO NOT check line_items
    const hasDirectInsuranceCharge = invoice.insurance_charge !== undefined && invoice.insurance_charge !== null;
    if (hasDirectInsuranceCharge) {
        insuranceCharge = parseDecimal(invoice.insurance_charge, 2);
        console.log('💰 Insurance charge from direct field:', {
            insurance_charge: invoice.insurance_charge,
            parsed: insuranceCharge,
            willCheckLineItems: false
        });
    }
    
    // Also use line_items for insurance charge ONLY if direct field is not set (undefined/null)
    // Also use line_items as fallback for pickup_charge if not in invoice object (for backward compatibility)
    if (invoice.line_items && invoice.line_items.length > 0) {
        invoice.line_items.forEach((item: any) => {
            const itemTotal = parseDecimal(item.total || item.unit_price, 2);
            const description = item.description?.toLowerCase() || '';
            // Use line_items for insurance ONLY if direct field was not set (undefined/null)
            // If insurance_charge is explicitly 0, we should NOT use line_items
            if (description.includes('insurance') && !hasDirectInsuranceCharge) {
                insuranceCharge += itemTotal;
                console.log('💰 Insurance charge from line_items (no direct field):', {
                    description: item.description,
                    total: item.total,
                    unit_price: item.unit_price,
                    itemTotal,
                    accumulated: insuranceCharge,
                    hasDirectInsuranceCharge: false
                });
            }
            // Fallback: If pickup_charge is not in invoice object or is 0, read from line_items
            // This is especially important for PH TO UAE COD invoices where pickup charge should be visible
            // Check for various pickup charge descriptions (case-insensitive)
            const isPickupCharge = description.includes('pickup') || 
                                  description.includes('pick-up') ||
                                  description.includes('pick_up');
            if ((pickupCharge === 0 || !invoice.pickup_charge) && isPickupCharge) {
                pickupCharge += itemTotal; // Use += in case there are multiple pickup line items
                console.log('✅ Found pickup charge in line_items:', {
                    description: item.description,
                    itemTotal,
                    accumulatedPickupCharge: pickupCharge
                });
            }
        });
        insuranceCharge = parseDecimal(insuranceCharge, 2);
        pickupCharge = parseDecimal(pickupCharge, 2);
    }
    
    // Debug: Log final insurance charge value
    console.log('💰 Final insurance charge for display:', {
        insuranceCharge,
        invoiceInsuranceCharge: invoice.insurance_charge,
        hasLineItems: !!invoice.line_items,
        lineItemsCount: invoice.line_items?.length || 0,
        refreshKey // Include refresh key to track re-renders
    });
    
    // Debug: Log pickup charge for PH TO UAE COD invoices
    if (isPhToUae && invoiceType === 'normal') {
        console.log('📦 PH TO UAE COD - Pickup Charge Debug:', {
            invoicePickupCharge: invoice.pickup_charge,
            parsedPickupCharge: pickupCharge,
            hasLineItems: !!invoice.line_items,
            lineItemsCount: invoice.line_items?.length || 0,
            pickupLineItems: invoice.line_items?.filter((item: any) => 
                item.description?.toLowerCase().includes('pickup')
            ) || []
        });
    }
    
    // Insurance charge is now only from database (line_items or invoice field)
    // If not found in database, it remains 0 (no fallback calculation)
    
    // For PH TO UAE tax invoices: use delivery_charge from DB as-is (backend-calculated)
    if (isPhToUae && invoiceType === 'tax') {
        deliveryCharge = deliveryChargeFromInvoice;
    }

    // Calculate subtotal first
    const subtotal = parseDecimal(shippingCharge + pickupCharge + deliveryCharge + insuranceCharge, 2); // Shipping + Pickup + Delivery + Insurance
    
    // Check if shipment is flomic/personal for UAE_TO_PH services
    const isUaeToPh = isUaeToPhService(serviceCodeRaw);
    
    // Get shipment classification for template
    const getShipmentClassification = (): string | undefined => {
      const norm = (v: any) => (v || '').toString().trim().toUpperCase();
      
      // Prioritize shipment classification from invoice request's verification (from invoicerequests collection)
      const invoiceRequestVerification = requestDataSources?.invoiceRequest?.verification;
      const topClassFromRequest = norm(
        invoiceRequestVerification?.shipment_classification ||
        invoiceRequestVerification?.classification
      );
      if (topClassFromRequest && (topClassFromRequest === 'COMMERCIAL' || topClassFromRequest === 'FLOMIC' || topClassFromRequest === 'PERSONAL' || topClassFromRequest === 'GENERAL')) {
        return topClassFromRequest;
      }
      
      // Fallback to invoice.request_id data
      const topClass = norm(
        invoice.request_id?.verification?.shipment_classification ||
        invoice.request_id?.shipment?.classification
      );
      if (topClass && (topClass === 'COMMERCIAL' || topClass === 'FLOMIC' || topClass === 'PERSONAL' || topClass === 'GENERAL')) {
        return topClass;
      }
      
      // Check box-level classification from invoice request first
      const boxesFromRequest = invoiceRequestVerification?.boxes || [];
      if (Array.isArray(boxesFromRequest) && boxesFromRequest.length > 0) {
        for (const box of boxesFromRequest) {
          const sc = norm(box.shipment_classification);
          const c = norm(box.classification);
          if (sc === 'COMMERCIAL' || c === 'COMMERCIAL') return 'COMMERCIAL';
          if (sc === 'FLOMIC' || c === 'FLOMIC' || sc === 'PERSONAL' || c === 'PERSONAL') return sc || c;
        }
      }
      
      // Fallback to box-level classification from invoice.request_id
      const boxes = invoice.request_id?.verification?.boxes || [];
      if (Array.isArray(boxes) && boxes.length > 0) {
        for (const box of boxes) {
          const sc = norm(box.shipment_classification);
          const c = norm(box.classification);
          if (sc === 'COMMERCIAL' || c === 'COMMERCIAL') return 'COMMERCIAL';
          if (sc === 'FLOMIC' || c === 'FLOMIC' || sc === 'PERSONAL' || c === 'PERSONAL') return sc || c;
        }
      }
      
      // For PH TO UAE, default to GENERAL
      if (isPhToUae) return 'GENERAL';
      
      return undefined;
    };
    
    const shipmentClassification = getShipmentClassification();
    
    const isFlomicOrPersonal = (() => {
      if (!isUaeToPh) return false;
      const norm = (v: any) => (v || '').toString().trim().toUpperCase();
      
      // Check box-level classification
      const boxes = invoice.request_id?.verification?.boxes || [];
      if (Array.isArray(boxes) && boxes.length > 0) {
        const boxHit = boxes.some((box: any) => {
          const sc = norm(box.shipment_classification);
          const c = norm(box.classification);
          return sc === 'PERSONAL' || sc === 'FLOMIC' || c === 'PERSONAL' || c === 'FLOMIC';
        });
        if (boxHit) return true;
      }
      
      // Check top-level shipment classification
      const topClass = norm(
        invoice.request_id?.verification?.shipment_classification ||
        invoice.request_id?.shipment?.classification
      );
      return topClass === 'PERSONAL' || topClass === 'FLOMIC';
    })();
    
    // PH TO UAE: Check if backend has stored both totals (COD and Tax Invoice)
    // Priority: Use stored totals from backend if available, otherwise recalculate
    const totalAmountCod = (invoice as any).total_amount_cod || (invoice as any).totalAmountCod;
    const totalAmountTaxInvoice = (invoice as any).total_amount_tax_invoice || (invoice as any).totalAmountTaxInvoice;
    // Check both snake_case and camelCase field names for cod_delivery_charge
    // IMPORTANT: Check if cod_delivery_charge exists (even if 0) - use it directly
    // Only fall back to delivery_base_amount if cod_delivery_charge is not present (undefined/null)
    const codDeliveryChargeRaw = (invoice as any).cod_delivery_charge !== undefined && (invoice as any).cod_delivery_charge !== null
        ? (invoice as any).cod_delivery_charge
        : ((invoice as any).codDeliveryCharge !== undefined && (invoice as any).codDeliveryCharge !== null
            ? (invoice as any).codDeliveryCharge
            : undefined);
    const codDeliveryCharge = codDeliveryChargeRaw !== undefined && codDeliveryChargeRaw !== null 
        ? parseDecimal(codDeliveryChargeRaw, 2) 
        : undefined; // COD delivery charge for PH TO UAE (separate from Tax delivery_charge)
    // Keep delivery_base_amount as fallback ONLY if cod_delivery_charge is not present
    const deliveryBaseAmount = codDeliveryCharge !== undefined 
        ? codDeliveryCharge 
        : parseDecimal((invoice as any).delivery_base_amount || 0, 2);
    
    // Debug: Log cod_delivery_charge to verify it's being read correctly
    // Also check if invoice is null/undefined
    const invoiceKeys = invoice ? Object.keys(invoice) : [];
    const deliveryRelatedKeys = invoiceKeys.filter(k => 
        k.toLowerCase().includes('delivery') || 
        k.toLowerCase().includes('cod') ||
        k.toLowerCase().includes('charge')
    );
    
    console.log('🔍 COD Delivery Charge Debug (COMPONENT BODY):', {
        refreshKey,
        forceUpdate,
        invoice_exists: !!invoice,
        invoice_id: invoice?._id || invoice?.invoice_id,
        cod_delivery_charge_snake: (invoice as any)?.cod_delivery_charge,
        cod_delivery_charge_camel: (invoice as any)?.codDeliveryCharge,
        cod_delivery_charge_raw: codDeliveryChargeRaw,
        codDeliveryCharge_parsed: codDeliveryCharge,
        delivery_charge: (invoice as any)?.delivery_charge,
        delivery_base_amount_raw: (invoice as any)?.delivery_base_amount,
        deliveryBaseAmount_final: deliveryBaseAmount,
        all_invoice_keys: invoiceKeys,
        delivery_related_keys: deliveryRelatedKeys,
        note: 'Reading cod_delivery_charge from invoice state - this runs on every render'
    });
    
    // Fix: If shippingCharge is 0 and this is a PH TO UAE COD invoice, calculate it from total_amount_cod
    // This handles cases where amount was incorrectly set to 0 (e.g., from old Tax invoice edits)
    if (isPhToUae && invoiceType === 'normal' && shippingCharge === 0 && totalAmountCod && totalAmountCod > 0) {
        // For COD: total_amount_cod = shipping + pickup + delivery
        // shipping = total_amount_cod - pickup - delivery
        const codDeliveryAmount = totalKg >= 15 
            ? 0 
            : (codDeliveryCharge !== undefined 
                ? codDeliveryCharge 
                : (deliveryBaseAmount > 0 ? deliveryBaseAmount : deliveryChargeFromInvoice));
        const calculatedShipping = parseDecimal(totalAmountCod, 2) - pickupCharge - codDeliveryAmount;
        if (calculatedShipping > 0) {
            shippingCharge = parseDecimal(calculatedShipping, 2);
            console.log('✅ PH TO UAE COD: Calculated shipping charge from total_amount_cod (amount was 0):', {
                totalAmountCod: parseDecimal(totalAmountCod, 2),
                pickupCharge,
                codDeliveryAmount,
                calculatedShipping: shippingCharge,
                totalKg,
                note: 'Shipping charge was 0, calculated from total_amount_cod to fix display'
            });
        }
    }
    
    // For PH TO UAE: Update charges based on invoice type (after deliveryBaseAmount is defined)
    // This ensures edited values are reflected correctly in the frontend
    if (isPhToUae) {
        // For PH TO UAE Tax invoices: No pickup charge (it should not appear in tax invoices)
        // For PH TO UAE COD invoices: Keep pickup charge if it exists (read from database or line_items)
        if (invoiceType === 'tax') {
            pickupCharge = 0; // Hide pickup charge in Tax invoices
        } else if (invoiceType === 'normal' && pickupCharge === 0) {
            // For PH TO UAE COD: If pickup charge is still 0, try to calculate it from totalAmountCod
            // Total COD = Shipping + Pickup + Delivery
            // Pickup = Total COD - Shipping - Delivery
            if (totalAmountCod && totalAmountCod > 0) {
                const parsedTotalAmountCod = parseDecimal(totalAmountCod, 2);
                const codDeliveryAmount = totalKg >= 15 
                    ? 0 
                    : (codDeliveryCharge !== undefined 
                        ? codDeliveryCharge 
                        : (deliveryBaseAmount > 0 ? deliveryBaseAmount : deliveryChargeFromInvoice));
                const calculatedPickupCharge = parsedTotalAmountCod - shippingCharge - codDeliveryAmount;
                if (calculatedPickupCharge > 0) {
                    pickupCharge = parseDecimal(calculatedPickupCharge, 2);
                    console.log('📦 PH TO UAE COD: Calculated pickup charge from total:', {
                        totalAmountCod: parsedTotalAmountCod,
                        shippingCharge,
                        codDeliveryAmount,
                        calculatedPickupCharge: pickupCharge
                    });
                }
            }
        }
        // Update delivery charge based on invoice type
        if (invoiceType === 'normal') {
            // COD invoice: 
            // - If weight >= 15kg: Show 0 (free delivery) but keep cod_delivery_charge in DB
            // - If weight < 15kg: Use cod_delivery_charge from invoice (saved to database) - use it even if 0
            // Note: cod_delivery_charge stays in database even when weight >= 15kg (for record keeping)
            if (totalKg >= 15) {
                deliveryCharge = 0; // Display 0 for free delivery, but cod_delivery_charge remains in DB
            } else {
                // Use codDeliveryCharge if it exists (even if 0), otherwise fall back to deliveryBaseAmount or deliveryChargeFromInvoice
                deliveryCharge = codDeliveryCharge !== undefined 
                    ? codDeliveryCharge 
                    : (deliveryBaseAmount > 0 ? deliveryBaseAmount : deliveryChargeFromInvoice);
            }
            console.log('📊 PH TO UAE COD delivery charge:', { 
                totalKg,
                isWeight15kgOrMore: totalKg >= 15,
                codDeliveryCharge,
                codDeliveryCharge_exists: codDeliveryCharge !== undefined,
                deliveryBaseAmount, 
                deliveryChargeFromInvoice, 
                finalDeliveryCharge: deliveryCharge,
                invoiceCodDeliveryCharge: (invoice as any).cod_delivery_charge,
                note: totalKg >= 15 
                    ? 'Free delivery (weight >= 15kg), but cod_delivery_charge preserved in DB' 
                    : (codDeliveryCharge !== undefined 
                        ? 'Using cod_delivery_charge from backend (even if 0) - fresh data' 
                        : 'cod_delivery_charge not found, using delivery_base_amount')
            });
        } else {
            // Tax invoice: Always use delivery_charge (updated after Tax edit)
            deliveryCharge = deliveryChargeFromInvoice;
            console.log('📊 PH TO UAE Tax delivery charge:', { 
                deliveryChargeFromInvoice, 
                finalDeliveryCharge: deliveryCharge,
                invoiceDeliveryCharge: invoice.delivery_charge
            });
        }
        
        // Debug: Log all PH TO UAE values for troubleshooting
        console.log('📊 PH TO UAE Invoice Values:', {
            invoiceType,
            amount: invoice.amount,
            baseAmount,
            delivery_charge: invoice.delivery_charge,
            deliveryChargeFromInvoice,
            delivery_base_amount: (invoice as any).delivery_base_amount,
            deliveryBaseAmount,
            pickup_charge: invoice.pickup_charge,
            pickupCharge,
            total_amount_cod: totalAmountCod,
            total_amount_tax_invoice: totalAmountTaxInvoice,
            tax_rate: invoice.tax_rate,
            tax_amount: invoice.tax_amount,
            total_amount: invoice.total_amount
        });
    }
    
    // Prioritize database values for tax_amount and total_amount
    // Only recalculate if database values are missing or invalid
    let taxRate = parseDecimal(invoice.tax_rate || 0, 2);
    let taxAmount = parseDecimal(invoice.tax_amount || 0, 2);
    let total = parseDecimal(invoice.total_amount || 0, 2);
    
    // Check if database has valid tax_amount and total_amount
    // For PH TO UAE COD invoices, always use totalAmountCod if available
    const hasValidTaxAmount = taxAmount > 0 || (taxAmount === 0 && taxRate === 0);
    const isPhToUaeCodInvoice = isPhToUae && taxRate === 0;
    
    // For PH TO UAE COD: Always use totalAmountCod if available, otherwise recalculate
    // Don't trust stored total_amount for COD invoices - use totalAmountCod instead
    let useTotalAmountCod = false;
    if (isPhToUaeCodInvoice && totalAmountCod && totalAmountCod > 0) {
      // Use stored totalAmountCod directly for COD invoices
      total = parseDecimal(totalAmountCod, 2);
      taxRate = 0;
      taxAmount = 0;
      useTotalAmountCod = true;
      console.log('✅ PH TO UAE COD: Using total_amount_cod from database:', totalAmountCod);
    }
    
    // Only recalculate if we haven't already set total from totalAmountCod
    if (!useTotalAmountCod && (!hasValidTaxAmount || total <= 0 || isPhToUaeCodInvoice)) {
      // Recalculate for other cases or if totalAmountCod is not available
      console.log('⚠️ Database tax/total values missing or invalid, recalculating...', {
        taxAmount,
        total,
        hasValidTaxAmount,
        isPhToUaeCodInvoice,
        totalAmountCod,
        totalAmountTaxInvoice
      });
      
      // Determine invoice type from tax_rate
      const isTaxInvoice = taxRate === 5;
      const isCodInvoice = taxRate === 0;
      
      if (isFlomicOrPersonal && isUaeToPh) {
        // Flomic/Personal UAE_TO_PH: 5% VAT included in subtotal (total = subtotal, VAT shown for display)
        taxRate = 5;
        taxAmount = parseDecimal((subtotal * taxRate) / 100, 2);
        total = parseDecimal(subtotal, 2); // Total = subtotal (VAT already included)
      } else if (isPhToUae && isTaxInvoice && deliveryCharge > 0) {
        // PH_TO_UAE Tax Invoice: Use stored total_amount_tax_invoice if available, otherwise calculate
        taxRate = 5;
        taxAmount = parseDecimal((deliveryCharge * taxRate) / 100, 2);
        total = totalAmountTaxInvoice ? parseDecimal(totalAmountTaxInvoice, 2) : parseDecimal(deliveryCharge + taxAmount, 2);
      } else if (isPhToUae && isCodInvoice) {
        // PH_TO_UAE COD Invoice: Always recalculate to ensure correct total
        taxRate = 0;
        taxAmount = 0;
        // Priority: Use stored total_amount_cod if available and valid, otherwise recalculate
        if (totalAmountCod && totalAmountCod > 0) {
          total = parseDecimal(totalAmountCod, 2);
          console.log('✅ Using stored total_amount_cod:', totalAmountCod);
        } else {
          // Recalculate: For COD invoice when weight < 15kg: Use cod_delivery_charge directly
          // For weight >= 15kg: delivery is free (0)
          const isWeight15kgOrMore = totalKg >= 15;
          const codDeliveryAmount = isWeight15kgOrMore ? 0 : (deliveryBaseAmount > 0 ? deliveryBaseAmount : deliveryCharge);
          // Calculate total: Shipping + Delivery Base Amount (for COD invoice when weight < 15kg)
          const calculatedCodTotal = shippingCharge + codDeliveryAmount;
          total = calculatedCodTotal > 0 ? parseDecimal(calculatedCodTotal, 2) : parseDecimal(subtotal, 2);
          
          console.log('📊 PH TO UAE COD Invoice total calculation (recalculated):', {
            totalAmountCod,
            shippingCharge,
            deliveryCharge,
            deliveryBaseAmount,
            codDeliveryAmount,
            isWeight15kgOrMore,
            totalKg,
            calculatedCodTotal,
            subtotal,
            finalTotal: total
          });
        }
      } else {
        // Other routes COD Invoice or no tax: No tax applied
        taxRate = 0;
        taxAmount = 0;
        total = subtotal;
      }
    } else {
      // Database has valid values - but for PH TO UAE COD, always prefer totalAmountCod
      // For PH TO UAE, prefer stored totals if available
      if (isPhToUae) {
        // Detect invoice type: If totalAmountCod exists and is significantly larger than totalAmountTaxInvoice,
        // it's likely a COD invoice (even if tax_rate is incorrectly set to 5)
        const hasBothTotals = totalAmountCod && totalAmountCod > 0 && totalAmountTaxInvoice && totalAmountTaxInvoice > 0;
        const isLikelyCodInvoice = hasBothTotals && totalAmountCod > totalAmountTaxInvoice * 10; // COD is usually much larger
        const isTaxInvoice = taxRate === 5 && !isLikelyCodInvoice; // Only treat as tax if not likely COD
        
        if (isTaxInvoice && totalAmountTaxInvoice && totalAmountTaxInvoice > 0) {
          total = parseDecimal(totalAmountTaxInvoice, 2);
        } else if ((!isTaxInvoice || isLikelyCodInvoice) && totalAmountCod && totalAmountCod > 0) {
          // For COD invoices, always use totalAmountCod if available (even if database has different total or wrong tax_rate)
          const databaseTotal = total; // Store original database total before override
          total = parseDecimal(totalAmountCod, 2);
          // Override taxRate to 0 for COD invoices
          if (isLikelyCodInvoice && taxRate === 5) {
            taxRate = 0;
            taxAmount = 0;
            console.log('⚠️ Correcting tax_rate from 5 to 0 (COD invoice detected)');
          }
          console.log('✅ PH TO UAE COD: Using total_amount_cod (overriding database total):', {
            totalAmountCod,
            databaseTotal,
            newTotal: total,
            isLikelyCodInvoice,
            originalTaxRate: invoice.tax_rate
          });
        } else if (!isTaxInvoice && total === 0) {
          // If total is 0 and we don't have stored COD total, recalculate
          // For COD invoice when weight < 15kg: Use delivery_base_amount directly
          const isWeight15kgOrMore = totalKg >= 15;
          const codDeliveryAmount = isWeight15kgOrMore ? 0 : (deliveryBaseAmount > 0 ? deliveryBaseAmount : deliveryCharge);
          const calculatedCodTotal = shippingCharge + codDeliveryAmount;
          if (calculatedCodTotal > 0) {
            total = parseDecimal(calculatedCodTotal, 2);
            console.log('⚠️ PH TO UAE COD: Database total is 0, using calculated total:', {
              calculatedCodTotal,
              shippingCharge,
              deliveryCharge,
              deliveryBaseAmount,
              codDeliveryAmount,
              isWeight15kgOrMore,
              totalKg
            });
          }
        }
      } else if (isUaeToPh && !isFlomicOrPersonal) {
        // For UAE to PH commercial shipments: Use database total_amount (trust database value)
        // Database total_amount is the source of truth
        total = parseDecimal(invoice.total_amount || subtotal, 2);
        console.log('✅ UAE TO PH Commercial: Using database total_amount:', {
          databaseTotal: invoice.total_amount,
          subtotal,
          insuranceCharge,
          shippingCharge,
          pickupCharge,
          deliveryCharge,
          finalTotal: total
        });
      }
      console.log('✅ Using database tax/total values:', {
        taxRate,
        taxAmount,
        total,
        totalAmountCod,
        totalAmountTaxInvoice,
        shippingCharge,
        deliveryCharge,
        subtotal,
        insuranceCharge
      });
    }

    // Get AWB number - check direct field first, then request_id
    const awbNumber = invoice.awb_number || invoice.request_id?.awb_number || invoice.request_id?.request_id || 'N/A';
    
    // Get receiver info - use local COD edits if available (frontend-only), otherwise use direct fields, then fallback to request_id
    // For COD invoices: Apply local edits if they exist (frontend-only changes)
    const receiverName = (isPhToUae && invoiceType === 'normal' && localCodEdits?.receiver_name) 
        ? localCodEdits.receiver_name 
        : (invoice.receiver_name || invoice.request_id?.receiver?.name || invoice.client_id?.contact_name || invoice.client_id?.company_name || 'N/A');
    const receiverAddress = (isPhToUae && invoiceType === 'normal' && localCodEdits?.receiver_address) 
        ? localCodEdits.receiver_address 
        : (invoice.receiver_address || invoice.request_id?.receiver?.address || 'Address not provided');
    const receiverPhone = (isPhToUae && invoiceType === 'normal' && localCodEdits?.receiver_phone) 
        ? localCodEdits.receiver_phone 
        : (invoice.receiver_phone || invoice.request_id?.receiver?.phone || '+971XXXXXXXXX');
    
    // Parse receiver address to extract city/emirate
    const addressParts = receiverAddress.split(',').map((p: string) => p.trim());
    const emirate = addressParts.length > 1 ? addressParts[addressParts.length - 2] : (invoice.request_id?.receiver?.city || 'Dubai');
    
    // Get shipment details - use direct fields first (priority: direct invoice fields > nested request_id fields)
    // Note: weight and numberOfBoxes are already defined above for tax invoice recalculation
    const volume = parseDecimal(invoice.volume_cbm || invoice.request_id?.shipment?.volume, 2);
    // displayWeight is already set above with priority: invoice.weight_kg > totalKg > weightForCalculation
    // Weight Type: Priority direct invoice.weight_type > request_id nested fields
    const weightType = invoice.weight_type || 
                      invoice.request_id?.shipment?.weight_type || 
                      invoice.request_id?.verification?.weight_type || 
                      'ACTUAL';
    
    // Calculate rate from shipping charge and weight if not provided
    // Priority: base_rate from invoice (direct field) > calculated_rate from verification > calculated from shippingCharge/weight > default
    let rate = 25.00;
    if (invoice.base_rate) {
        rate = parseDecimal(invoice.base_rate, 2);
    } else if (invoice.request_id?.verification?.calculated_rate) {
        // Use calculated rate from verification (Operations calculated this based on weight brackets)
        const calculatedRate = invoice.request_id.verification.calculated_rate;
        rate = parseDecimal(
            typeof calculatedRate === 'object' && calculatedRate.$numberDecimal
                ? calculatedRate.$numberDecimal
                : calculatedRate,
            2
        );
    } else if (weightForCalculation > 0 && shippingCharge > 0) {
        // Calculate rate from shipping charge and weight (shippingCharge = weight × rate)
        // Use weightForCalculation (chargeable/actual) for rate calculation, not total_kg
        rate = parseDecimal(shippingCharge / weightForCalculation, 2);
    }

    const senderName =
        invoice.customer_name ||
        invoice.request_id?.customer_name ||
        invoice.request_id?.sender?.name ||
        invoice.client_id?.company_name ||
        invoice.client_id?.contact_name ||
        'N/A';
    const senderAddress =
        invoice.origin_place ||
        invoice.request_id?.origin_place ||
        invoice.request_id?.sender?.address ||
        'Address not provided';
    const senderPhone =
        invoice.customer_phone ||
        invoice.request_id?.customer_phone ||
        invoice.request_id?.sender?.phone ||
        invoice.client_id?.contact_phone ||
        '+971XXXXXXXXX';
    const senderEmail =
        invoice.customer_email ||
        invoice.request_id?.customer_email ||
        invoice.request_id?.sender?.email ||
        invoice.client_id?.contact_email ||
        '';

    // Helper function to derive listed commodities from items array
    const deriveListedCommoditiesFromItems = (srcItems: any[]): string | null => {
        if (!Array.isArray(srcItems) || srcItems.length === 0) return null;
        const names = srcItems
            .map((it: any) => (it?.name || it?.item || it?.description || it?.item_name || it?.commodity || '').toString().trim())
            .filter(Boolean);
        if (names.length === 0) return null;
        // De-dupe and keep order
        const seen = new Set<string>();
        const unique = names.filter(n => (seen.has(n) ? false : (seen.add(n), true)));
        return unique.join(', ');
    };

    // Get items from invoice request booking_data or booking_snapshot
    const bookingDataItems = requestDataSources?.invoiceRequest?.booking_data?.items || 
                             requestDataSources?.invoiceRequest?.booking_snapshot?.items || 
                             [];
    const itemsFromBookingData = deriveListedCommoditiesFromItems(bookingDataItems);

    // Convert invoice to template format
    const invoiceData = {
        invoiceNumber: invoice.invoice_id || invoice._id,
        batchNumber: invoice.batch_number || invoice.request_id?.batch_number || '',
        awbNumber: awbNumber,
        trackingNumber: awbNumber,
        date: invoice.issue_date ? new Date(invoice.issue_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        receiverInfo: {
            name: receiverName.toUpperCase(),
            address: receiverAddress,
            emirate: emirate,
            mobile: receiverPhone,
            trn: invoice.customer_trn || invoice.request_id?.customer_trn || undefined
        },
        senderInfo: {
            name: senderName,
            address: senderAddress,
            email: senderEmail || undefined,
            phone: senderPhone
        },
        shipmentDetails: {
            numberOfBoxes: numberOfBoxes,
            weight: displayWeight,
            weightType: weightType,
            rate: rate
        },
        charges: {
            // For PH TO UAE COD: Use local edits if available (frontend-only), otherwise use direct invoice fields
            // For PH TO UAE Tax: Always use direct invoice fields (delivery_charge)
            shippingCharge: isPhToUae && invoiceType === 'tax' 
                ? 0 
                : (isPhToUae && invoiceType === 'normal' && localCodEdits?.amount 
                    ? parseDecimal(localCodEdits.amount, 2) 
                    : shippingCharge), // Use local COD edit if available, otherwise use invoice amount
            // For PH TO UAE COD: Always show pickup charge if it exists (even if 0, to ensure visibility)
            // For PH TO UAE Tax: Hide pickup charge (it should not appear in tax invoices)
            // For other routes: Show pickup charge if > 0
            pickupCharge: isPhToUae && invoiceType === 'tax' 
                ? undefined 
                : (isPhToUae && invoiceType === 'normal' 
                    ? (() => {
                        // PH TO UAE COD: Use local edit if available, otherwise use pickupCharge from invoice
                        if (localCodEdits?.pickup_charge !== undefined) {
                            const localPickup = parseDecimal(localCodEdits.pickup_charge, 2);
                            return localPickup > 0 ? localPickup : undefined;
                        }
                        return pickupCharge > 0 ? pickupCharge : undefined;
                    })()
                    : (pickupCharge > 0 ? pickupCharge : undefined)), // Other routes: Show if > 0
            // For PH TO UAE COD: Use cod_delivery_charge if available, otherwise deliveryCharge
            // For PH TO UAE Tax: Use delivery_charge directly
            // For other invoices: Use deliveryCharge as calculated
            deliveryCharge: (() => {
                // Re-read cod_delivery_charge from invoice state to ensure we have the latest value
                // IMPORTANT: Check if cod_delivery_charge exists (even if 0) - use it directly
                // Only fall back to delivery_base_amount if cod_delivery_charge is not present (undefined/null)
                const currentCodDeliveryChargeRaw = (invoice as any).cod_delivery_charge !== undefined && (invoice as any).cod_delivery_charge !== null
                    ? (invoice as any).cod_delivery_charge
                    : ((invoice as any).codDeliveryCharge !== undefined && (invoice as any).codDeliveryCharge !== null
                        ? (invoice as any).codDeliveryCharge
                        : undefined);
                const currentCodDeliveryCharge = currentCodDeliveryChargeRaw !== undefined && currentCodDeliveryChargeRaw !== null
                    ? parseDecimal(currentCodDeliveryChargeRaw, 2)
                    : undefined;
                const currentDeliveryBaseAmount = currentCodDeliveryCharge !== undefined
                    ? currentCodDeliveryCharge
                    : parseDecimal((invoice as any).delivery_base_amount || 0, 2);
                
                if (isPhToUae) {
                    if (invoiceType === 'normal') {
                        // COD invoice: Use local edits if available (frontend-only)
                        // - If weight >= 15kg: Show 0 (free delivery) but keep cod_delivery_charge in DB
                        // - If weight < 15kg: Use local edit or cod_delivery_charge if available (even if 0), otherwise deliveryCharge
                        if (totalKg >= 15) {
                            console.log('📦 PH TO UAE COD: Weight >= 15kg, showing 0 for delivery (free delivery)');
                            return 0; // Show 0 for free delivery, but cod_delivery_charge stays in DB
                        }
                        // Use local COD edit if available, otherwise use cod_delivery_charge from database
                        if (localCodEdits?.delivery_base_amount !== undefined) {
                            console.log('📦 PH TO UAE COD: Using local edit for delivery charge:', localCodEdits.delivery_base_amount);
                            return parseDecimal(localCodEdits.delivery_base_amount, 2);
                        }
                        // Prioritize cod_delivery_charge from database (this is the value saved after edit)
                        // Use the current value read directly from invoice state - use it even if 0
                        const finalDeliveryCharge = currentCodDeliveryCharge !== undefined
                            ? currentCodDeliveryCharge
                            : (currentDeliveryBaseAmount > 0 ? currentDeliveryBaseAmount : deliveryCharge);
                        console.log('📦 PH TO UAE COD: Delivery charge calculation (RE-READ FROM STATE):', {
                            refreshKey,
                            forceUpdate,
                            cod_delivery_charge_from_state: (invoice as any).cod_delivery_charge,
                            cod_delivery_charge_exists: currentCodDeliveryCharge !== undefined,
                            currentCodDeliveryCharge,
                            currentDeliveryBaseAmount,
                            deliveryBaseAmount_old: deliveryBaseAmount,
                            deliveryCharge_old: deliveryCharge,
                            finalDeliveryCharge,
                            totalKg,
                            note: currentCodDeliveryCharge !== undefined 
                                ? 'Using cod_delivery_charge from state (even if 0) - fresh data from backend'
                                : 'cod_delivery_charge not found, falling back to delivery_base_amount'
                        });
                        return finalDeliveryCharge;
                    } else {
                        // Tax invoice: Always use delivery_charge from invoice
                        return deliveryChargeFromInvoice;
                    }
                }
                // Other invoices: Use deliveryCharge as calculated
                return (isPhToUae && taxRate === 0 && totalKg < 15 && currentDeliveryBaseAmount > 0) 
                    ? currentDeliveryBaseAmount 
                    : deliveryCharge;
            })(),
            insuranceCharge: isPhToUae ? undefined : (insuranceCharge > 0 ? insuranceCharge : undefined), // No insurance in PH TO UAE
            // For PH TO UAE normal invoice: Subtotal should be shipping + delivery
            // For PH TO UAE tax invoice: Subtotal is delivery only
            subtotal: (() => {
                if (isPhToUae && invoiceType === 'tax') {
                    // Tax invoice: delivery only
                    return parseDecimal(deliveryChargeFromInvoice, 2);
                } else if (isPhToUae && invoiceType === 'normal') {
                    // COD invoice: Use local edits if available (frontend-only)
                    // shipping + pickup + delivery (0 if weight >= 15kg, otherwise delivery_base_amount)
                    // Note: delivery_base_amount stays in DB even when weight >= 15kg, but we show 0 in invoice
                    const localShipping = localCodEdits?.amount ? parseDecimal(localCodEdits.amount, 2) : shippingCharge;
                    const localPickup = localCodEdits?.pickup_charge !== undefined 
                        ? parseDecimal(localCodEdits.pickup_charge, 2) 
                        : pickupCharge;
                    const codDeliveryAmount = totalKg >= 15 
                        ? 0 
                        : (deliveryBaseAmount > 0 ? deliveryBaseAmount : deliveryCharge);
                    const codSubtotal = localShipping + localPickup + codDeliveryAmount;
                    return parseDecimal(codSubtotal, 2);
                }
                // Other invoices: Use calculated subtotal
                return parseDecimal(subtotal, 2);
            })(),
            taxRate: taxRate,
            taxAmount: taxAmount,
            // For PH TO UAE: Use invoiceType to determine which total to use
            // - Normal (COD) invoice: Use totalAmountCod (from invoice object, updated after edit)
            // - Tax invoice: Use totalAmountTaxInvoice (from invoice object, updated after edit)
            // For other invoices: Use calculated total
            total: (() => {
                // For PH TO UAE invoices, ALWAYS prioritize stored totals from invoice object
                // These values are updated by the backend after editing and should be used directly
                if (isPhToUae) {
                    if (invoiceType === 'normal') {
                        // COD invoice: Always calculate from displayed charges (shipping + pickup + delivery)
                        // This ensures the total matches what's shown in the charges table
                        // If weight >= 15kg: delivery is 0 (free delivery), but cod_delivery_charge stays in DB
                        const localShipping = localCodEdits?.amount ? parseDecimal(localCodEdits.amount, 2) : shippingCharge;
                        const localPickup = localCodEdits?.pickup_charge !== undefined 
                            ? parseDecimal(localCodEdits.pickup_charge, 2) 
                            : pickupCharge;
                        const codDeliveryAmount = totalKg >= 15 
                            ? 0 
                            : (deliveryBaseAmount > 0 ? deliveryBaseAmount : deliveryCharge);
                        const calculatedCod = localShipping + localPickup + codDeliveryAmount;
                        console.log('✅ PH TO UAE COD: Calculating total from displayed charges:', {
                            totalKg,
                            isWeight15kgOrMore: totalKg >= 15,
                            localShipping,
                            shippingCharge,
                            localPickup,
                            pickupCharge,
                            deliveryBaseAmount,
                            deliveryCharge,
                            codDeliveryAmount,
                            calculatedCod
                        });
                        return parseDecimal(calculatedCod, 2);
                    } else if (invoiceType === 'tax') {
                        // Tax invoice: Use totalAmountTaxInvoice from invoice (updated after Tax edit)
                        // First check if totalAmountTaxInvoice exists in invoice object (highest priority)
                        const invoiceTotalAmountTaxInvoice = (invoice as any).total_amount_tax_invoice || (invoice as any).totalAmountTaxInvoice;
                        if (invoiceTotalAmountTaxInvoice && parseDecimal(invoiceTotalAmountTaxInvoice, 2) > 0) {
                            const taxTotal = parseDecimal(invoiceTotalAmountTaxInvoice, 2);
                            console.log('✅ PH TO UAE Tax: Using totalAmountTaxInvoice from invoice object:', {
                                invoiceType,
                                invoiceTotalAmountTaxInvoice,
                                taxTotal,
                                rawInvoice: {
                                    total_amount_tax_invoice: (invoice as any).total_amount_tax_invoice,
                                    totalAmountTaxInvoice: (invoice as any).totalAmountTaxInvoice
                                }
                            });
                            return taxTotal;
                        } else {
                            // Fallback: Calculate from delivery + tax
                            const calculatedTax = deliveryChargeFromInvoice + (deliveryChargeFromInvoice * 5 / 100);
                            console.log('⚠️ PH TO UAE Tax: totalAmountTaxInvoice not in invoice, calculating:', {
                                deliveryChargeFromInvoice,
                                calculatedTax
                            });
                            return parseDecimal(calculatedTax, 2);
                        }
                    }
                }
                // Use calculated total for other cases
                console.log('⚠️ Using calculated total (non-PH TO UAE):', {
                    isPhToUae,
                    invoiceType,
                    taxRate,
                    totalAmountCod,
                    totalAmountTaxInvoice,
                    calculatedTotal: total
                });
                return total;
            })()
        },
        // PH TO UAE totals from backend
        totalAmountCod: totalAmountCod ? parseDecimal(totalAmountCod, 2) : undefined,
        totalAmountTaxInvoice: totalAmountTaxInvoice ? parseDecimal(totalAmountTaxInvoice, 2) : undefined,
        // Invoice type for determining which total to display
        invoiceType: invoiceType, // 'normal' or 'tax'
        remarks: {
        boxNumbers: '', // Removed - no longer displayed in invoice template
        agent: requestDataSources?.invoiceRequest?.verification?.agents_name || invoice.request_id?.verification?.agents_name || invoice.created_by?.full_name || 'SYSTEM',
        items: itemsFromBookingData || requestDataSources?.invoiceRequest?.verification?.listed_commodities || invoice.request_id?.verification?.listed_commodities || invoice.notes || 'No remarks'
        },
        termsAndConditions: 'Cash Upon Receipt of Goods',
        qrCode: qrCodeData ? {
            url: qrCodeData.qr_url || '',
            code: qrCodeData.qr_code || ''
        } : undefined,
        isUaeToPh: isUaeToPh,
        isPhToUae: isPhToUae,
        serviceCode: serviceCodeRaw,
        shipmentClassification: shipmentClassification // Pass classification to template
    };

    // PH TO UAE Invoice Display Logic:
    // - COD Invoice (normal): Show shipping + base delivery (no tax)
    // - Tax Invoice: Show only delivery (calculated with boxes) + tax on delivery (NO shipping, NO insurance)
    const shouldShowDeliveryOnlyInTaxInvoice = isPhToUae && invoiceType === 'tax';
    
    // For PH TO UAE tax invoice: Ensure taxRate is 5% and calculate tax correctly
    let taxRateForTaxInvoice = taxRate;
    let taxAmountForTaxInvoice = taxAmount;
    if (shouldShowDeliveryOnlyInTaxInvoice) {
        taxRateForTaxInvoice = 5; // Always 5% VAT for PH TO UAE tax invoices
        // Calculate tax on delivery charge (5% VAT)
        taxAmountForTaxInvoice = parseDecimal((deliveryCharge * taxRateForTaxInvoice) / 100, 2);
        console.log('📊 PH TO UAE Tax Invoice tax calculation:', {
            deliveryCharge,
            taxRate: taxRateForTaxInvoice,
            calculatedTax: taxAmountForTaxInvoice,
            totalAmountTaxInvoice
        });
    }
    
    const deliveryOnlyTaxAmount = shouldShowDeliveryOnlyInTaxInvoice 
        ? taxAmountForTaxInvoice
        : taxAmount;
    // For PH TO UAE tax invoice: subtotal = delivery charge only (no shipping, no insurance)
    const deliveryOnlySubtotal = shouldShowDeliveryOnlyInTaxInvoice
        ? parseDecimal(deliveryCharge, 2)
        : subtotal;
    // For tax invoice: Use totalAmountTaxInvoice if available, otherwise calculate delivery + tax
    const deliveryOnlyTotal = shouldShowDeliveryOnlyInTaxInvoice
        ? (totalAmountTaxInvoice && totalAmountTaxInvoice > 0 
            ? parseDecimal(totalAmountTaxInvoice, 2)
            : parseDecimal(deliveryCharge + deliveryOnlyTaxAmount, 2))
        : total;
    const taxInvoiceData = shouldShowDeliveryOnlyInTaxInvoice
        ? {
            ...invoiceData,
            isPhToUae: true, // Flag for PH TO UAE invoices
            serviceCode: serviceCodeRaw, // Pass service code for identification
            charges: {
                ...invoiceData.charges,
                shippingCharge: 0, // Hide shipping in tax invoice
                pickupCharge: undefined, // No pickup in PH TO UAE
                insuranceCharge: undefined, // No insurance in PH TO UAE
                subtotal: deliveryOnlySubtotal, // Delivery charge only
                taxRate: taxRateForTaxInvoice, // 5% VAT for tax invoice
                taxAmount: deliveryOnlyTaxAmount, // Tax on delivery only (5% of delivery charge)
                total: deliveryOnlyTotal // Delivery + tax (or totalAmountTaxInvoice if available)
            }
        }
        : {
            ...invoiceData,
            isPhToUae: isPhToUae, // Pass isPhToUae flag for all invoices
            serviceCode: serviceCodeRaw // Pass service code for identification
        };

    // Debug: Log mapped invoice data
    console.log('📊 Mapped invoiceData:', {
        ...invoiceData,
        charges: {
            ...invoiceData.charges,
            subtotal: invoiceData.charges.subtotal,
            total: invoiceData.charges.total
        },
        invoiceType,
        totalAmountCod,
        totalAmountTaxInvoice
    });

    // Print/Download PDF function
    const handlePrint = () => {
        window.print();
    };

    // Download as PDF function
    const handleDownloadPDF = async () => {
        try {
            const invoiceElement = document.getElementById('invoice-content');
            if (!invoiceElement) {
                handlePrint();
                return;
            }

            // Dynamically import html2pdf.js
            const html2pdfModule = await import('html2pdf.js');
            const html2pdf = html2pdfModule.default || html2pdfModule;

            const opt = {
                margin: 0.5,
                filename: `Invoice-${invoiceData.invoiceNumber}.pdf`,
                image: { type: 'jpeg' as const, quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true },
                jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' as const }
            };
            
            await html2pdf().set(opt).from(invoiceElement).save();
        } catch (error) {
            console.error('Error generating PDF:', error);
            // Fallback to print dialog
            handlePrint();
        }
    };

    // Download as Excel function
    // IMPORTANT: Must fetch invoiceRequest data from invoicerequests collection as well (fresh) for export.
    const handleDownloadExcel = async () => {
        if (!invoiceData || !invoice) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Invoice data is not available for export.',
            });
            return;
        }

        try {
            // Fetch latest invoice + invoiceRequest (fresh from backend)
            const invoiceRes = await apiClient.getInvoiceUnified(invoiceId);
            const freshInvoice = (invoiceRes as any)?.success ? (invoiceRes as any).data : invoice;

            const notesText = ((freshInvoice as any)?.notes || '').toString();
            const idFromNotesMatch = notesText.match(/\b[a-fA-F0-9]{24}\b/);
            const invoiceRequestId =
                (freshInvoice as any)?.request_id?._id ||
                (freshInvoice as any)?.request_id ||
                (freshInvoice as any)?.invoice_request_id ||
                (freshInvoice as any)?.requestId ||
                (freshInvoice as any)?.invoiceRequestId ||
                (idFromNotesMatch ? idFromNotesMatch[0] : undefined);

            let invoiceRequest: any | null = null;
            if (invoiceRequestId) {
                // Backend does NOT expose GET /invoice-requests/:id. Use details endpoint.
                const reqRes = await apiClient.getInvoiceRequestDetails(invoiceRequestId.toString(), false);
                invoiceRequest = (reqRes as any)?.success ? (reqRes as any).data : null;
            }

            const bookingSnapshot = invoiceRequest?.booking_snapshot || invoiceRequest?.booking_data || {};
            const verification = invoiceRequest?.verification || {};
            const senderFromReq = bookingSnapshot?.sender || {};
            const receiverFromReq = bookingSnapshot?.receiver || {};

            const deriveListedCommoditiesFromItems = (srcItems: any[]): string | null => {
                if (!Array.isArray(srcItems) || srcItems.length === 0) return null;
                const names = srcItems
                    .map((it: any) => (it?.name || it?.item || it?.description || it?.item_name || '').toString().trim())
                    .filter(Boolean);
                if (names.length === 0) return null;
                const seen = new Set<string>();
                const unique = names.filter(n => (seen.has(n) ? false : (seen.add(n), true)));
                return unique.join(', ');
            };

            const listedCommodities =
                verification?.listed_commodities ||
                deriveListedCommoditiesFromItems(bookingSnapshot?.items || []) ||
                '';

            // Prepare Excel data
            const excelData: any[] = [];

            // Header Section
            excelData.push(['INVOICE DETAILS']);
            excelData.push([]);
            excelData.push(['Invoice Number', invoiceData.invoiceNumber || 'N/A']);
            excelData.push(['Batch Number', invoiceData.batchNumber || 'N/A']);
            excelData.push(['AWB Number', invoiceData.awbNumber || 'N/A']);
            excelData.push(['Date', invoiceData.date || 'N/A']);
            excelData.push(['Invoice Type', invoiceType === 'tax' ? 'Tax Invoice' : 'Normal Invoice']);
            excelData.push([]);

            // InvoiceRequest / Booking Snapshot (from invoicerequests collection)
            excelData.push(['INVOICE REQUEST (invoicerequests)']);
            excelData.push([]);
            excelData.push(['Request ID', invoiceRequest?._id || 'N/A']);
            excelData.push(['Tracking Code', verification?.tracking_code || invoiceRequest?.tracking_code || invoiceData.awbNumber || 'N/A']);
            excelData.push(['Service Code', verification?.service_code || invoiceRequest?.service_code || (freshInvoice as any)?.service_code || 'N/A']);
            excelData.push(['Cargo Service', verification?.cargo_service || 'N/A']);
            excelData.push(['Agent Name', verification?.agents_name || senderFromReq?.agentName || 'N/A']);
            excelData.push(['Listed Commodities', listedCommodities || 'N/A']);
            excelData.push(['Verified At', verification?.verified_at ? new Date(verification.verified_at).toLocaleString() : 'N/A']);
            excelData.push([]);

            // Receiver Information
            excelData.push(['RECEIVER INFORMATION']);
            excelData.push([]);
            // Prefer invoicerequests.booking_data.receiver.* then fall back to invoice mapping
            excelData.push(['Name', receiverFromReq?.fullName || receiverFromReq?.name || invoiceData.receiverInfo?.name || 'N/A']);
            excelData.push(['Address', receiverFromReq?.completeAddress || receiverFromReq?.addressLine1 || invoiceData.receiverInfo?.address || 'N/A']);
            excelData.push(['Emirate', receiverFromReq?.emirates || invoiceData.receiverInfo?.emirate || 'N/A']);
            excelData.push(['Mobile', receiverFromReq?.contactNo || receiverFromReq?.phoneNumber || invoiceData.receiverInfo?.mobile || 'N/A']);
            excelData.push(['Delivery Option', receiverFromReq?.deliveryOption || 'N/A']);
            if (invoiceData.receiverInfo?.trn) {
                excelData.push(['TRN', invoiceData.receiverInfo.trn]);
            }
            excelData.push([]);

            // Sender Information
            excelData.push(['SENDER INFORMATION']);
            excelData.push([]);
            // Prefer invoicerequests.booking_data.sender.* then fall back to invoice mapping
            excelData.push(['Name', senderFromReq?.fullName || senderFromReq?.name || invoiceData.senderInfo?.name || 'N/A']);
            excelData.push(['Address', senderFromReq?.completeAddress || senderFromReq?.addressLine1 || invoiceData.senderInfo?.address || 'N/A']);
            excelData.push(['Phone', senderFromReq?.contactNo || senderFromReq?.phoneNumber || invoiceData.senderInfo?.phone || 'N/A']);
            excelData.push(['Email', senderFromReq?.emailAddress || invoiceData.senderInfo?.email || 'N/A']);
            excelData.push(['Delivery Option', senderFromReq?.deliveryOption || 'N/A']);
            excelData.push([]);

            // Shipment Details
            excelData.push(['SHIPMENT DETAILS']);
            excelData.push([]);
            // Prefer invoicerequests.verification.* then fall back to invoice mapping
            excelData.push(['Number of Boxes', verification?.number_of_boxes || invoiceData.shipmentDetails?.numberOfBoxes || 'N/A']);
            excelData.push(['Actual Weight (kg)', verification?.actual_weight ?? 'N/A']);
            excelData.push(['Volumetric Weight (kg)', verification?.volumetric_weight ?? verification?.total_vm ?? 'N/A']);
            excelData.push(['Chargeable Weight (kg)', verification?.chargeable_weight ?? 'N/A']);
            excelData.push(['Total KG', verification?.total_kg ?? 'N/A']);
            excelData.push(['Weight Type', verification?.weight_type || invoiceData.shipmentDetails?.weightType || 'N/A']);
            excelData.push(['Rate Bracket', verification?.rate_bracket || 'N/A']);
            excelData.push(['Amount per kg (AED)', (verification?.amount ?? verification?.calculated_rate ?? invoiceData.shipmentDetails?.rate) || 'N/A']);
            excelData.push([]);

            // Charges Breakdown
            excelData.push(['CHARGES BREAKDOWN']);
            excelData.push([]);
            if (invoiceData.charges?.shippingCharge !== undefined && invoiceData.charges.shippingCharge > 0) {
                excelData.push(['Shipping Charge (AED)', invoiceData.charges.shippingCharge.toFixed(2)]);
            }
            if (invoiceData.charges?.pickupCharge !== undefined && invoiceData.charges.pickupCharge > 0) {
                excelData.push(['Pickup Charge (AED)', invoiceData.charges.pickupCharge.toFixed(2)]);
            }
            if (invoiceData.charges?.deliveryCharge !== undefined && invoiceData.charges.deliveryCharge > 0) {
                excelData.push(['Delivery Charge (AED)', invoiceData.charges.deliveryCharge.toFixed(2)]);
            }
            if (invoiceData.charges?.insuranceCharge !== undefined && invoiceData.charges.insuranceCharge > 0) {
                excelData.push(['Insurance Charge (AED)', invoiceData.charges.insuranceCharge.toFixed(2)]);
            }
            excelData.push(['Subtotal (AED)', invoiceData.charges?.subtotal?.toFixed(2) || '0.00']);
            excelData.push([]);

            // Tax and Total
            if (invoiceData.charges?.taxRate !== undefined && invoiceData.charges.taxRate > 0) {
                excelData.push(['Tax Rate (%)', invoiceData.charges.taxRate.toFixed(2)]);
                excelData.push(['Tax Amount (AED)', invoiceData.charges.taxAmount?.toFixed(2) || '0.00']);
            }
            excelData.push(['Total Amount (AED)', invoiceData.charges?.total?.toFixed(2) || '0.00']);
            excelData.push([]);

            // Additional Information
            if (invoice.notes) {
                excelData.push(['NOTES']);
                excelData.push([]);
                excelData.push([invoice.notes]);
                excelData.push([]);
            }

            // PH TO UAE specific fields
            if (isPhToUae) {
                excelData.push(['PH TO UAE SPECIFIC INFORMATION']);
                excelData.push([]);
                if (invoiceType === 'normal') {
                    const totalAmountCod = (invoice as any).total_amount_cod || (invoice as any).totalAmountCod;
                    const deliveryBaseAmount = (invoice as any).delivery_base_amount;
                    if (totalAmountCod) {
                        excelData.push(['Total Amount COD (AED)', parseDecimal(totalAmountCod, 2).toFixed(2)]);
                    }
                    if (deliveryBaseAmount) {
                        excelData.push(['Delivery Base Amount (AED)', parseDecimal(deliveryBaseAmount, 2).toFixed(2)]);
                    }
                } else {
                    const totalAmountTaxInvoice = (invoice as any).total_amount_tax_invoice || (invoice as any).totalAmountTaxInvoice;
                    if (totalAmountTaxInvoice) {
                        excelData.push(['Total Amount Tax Invoice (AED)', parseDecimal(totalAmountTaxInvoice, 2).toFixed(2)]);
                    }
                }
                excelData.push([]);
            }

            // Create workbook and worksheet
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(excelData);

            // Set column widths
            const colWidths = [
                { wch: 30 }, // Column A
                { wch: 40 }  // Column B
            ];
            ws['!cols'] = colWidths;

            // Add worksheet to workbook
            XLSX.utils.book_append_sheet(wb, ws, 'Invoice Details');

            // Generate filename
            const invoiceTypeLabel = invoiceType === 'tax' ? 'Tax-Invoice' : 'Invoice';
            const filename = `${invoiceTypeLabel}-${invoiceData.invoiceNumber || invoiceId}.xlsx`;

            // Download file
            XLSX.writeFile(wb, filename);

            toast({
                title: 'Excel Export Successful',
                description: `Invoice exported to ${filename}`,
            });
        } catch (error) {
            console.error('Error generating Excel:', error);
            toast({
                variant: 'destructive',
                title: 'Export Failed',
                description: 'Unable to generate Excel file. Please try again.',
            });
        }
    };

    const handleEditChange = (field: string, value: string) => {
        setEditForm((prev) => ({ ...prev, [field]: value }));
    };
    
    const handleCodEditChange = (field: string, value: string) => {
        setCodEditForm((prev) => {
            const updated = { ...prev, [field]: value };
            // Auto-calculate total_amount_cod when amount, pickup_charge, or cod_delivery_charge changes
            if (field === 'amount' || field === 'pickup_charge' || field === 'cod_delivery_charge') {
                const shipping = parseFloat(updated.amount || '0');
                const pickup = parseFloat(updated.pickup_charge || '0');
                const delivery = parseFloat(updated.cod_delivery_charge || '0');
                updated.total_amount_cod = (shipping + pickup + delivery).toFixed(2);
            }
            return updated;
        });
    };
    
    const handleTaxEditChange = (field: string, value: string) => {
        setTaxEditForm((prev) => {
            const updated = { ...prev, [field]: value };
            // No auto-calculation - all values are manual
            return updated;
        });
    };

    const handleSaveEdit = async () => {
        const invoiceIdentifier = invoice?._id || invoiceId;
        if (!invoiceIdentifier) return;
        setSavingEdit(true);
        try {
            const payload: any = {
                // Invoice Header
                invoice_id: editForm.invoice_number.trim() || undefined,
                batch_number: editForm.batch_number.trim() || undefined,
                awb_number: editForm.awb_number.trim() || undefined,
                issue_date: editForm.issue_date ? new Date(editForm.issue_date).toISOString() : undefined,
                due_date: editForm.due_date ? new Date(editForm.due_date).toISOString() : undefined,
                // Sender Information
                customer_name: editForm.customer_name.trim() || undefined,
                customer_phone: editForm.customer_phone.trim() || undefined,
                customer_email: editForm.customer_email.trim() || undefined,
                origin_place: editForm.origin_place.trim() || undefined,
                // Receiver Information
                receiver_name: editForm.receiver_name.trim(),
                receiver_address: editForm.receiver_address.trim(),
                receiver_phone: editForm.receiver_phone.trim(),
                customer_trn: editForm.receiver_trn.trim() || undefined,
                // Shipment Details
                number_of_boxes: editForm.number_of_boxes ? parseInt(editForm.number_of_boxes) : undefined,
                weight_kg: editForm.weight_kg ? parseFloat(editForm.weight_kg) : undefined,
                weight_type: editForm.weight_type || undefined,
                base_rate: editForm.base_rate ? parseFloat(editForm.base_rate) : undefined,
                service_code: editForm.service_code.trim() || undefined,
                // Charges
                amount: editForm.amount ? parseFloat(editForm.amount) : undefined,
                pickup_charge: editForm.pickup_charge ? parseFloat(editForm.pickup_charge) : undefined,
                delivery_charge: editForm.delivery_charge ? parseFloat(editForm.delivery_charge) : undefined,
                insurance_charge: editForm.insurance_charge !== undefined && editForm.insurance_charge !== '' ? parseFloat(editForm.insurance_charge) || 0 : undefined,
                tax_rate: editForm.tax_rate ? parseFloat(editForm.tax_rate) : undefined,
                // Agent
                agent_name: editForm.agent_name.trim() || undefined,
                // Notes
                notes: editForm.notes?.trim() || ''
            };

            // Remove undefined and empty string values (except for notes which can be empty)
            // IMPORTANT: Keep numeric fields even if they are 0 (weight_kg, base_rate, etc. can be valid at 0)
            Object.keys(payload).forEach(key => {
                // Don't delete numeric fields that are 0 (they are valid values)
                const numericFields = ['weight_kg', 'base_rate', 'amount', 'pickup_charge', 'delivery_charge', 'insurance_charge', 'tax_rate', 'subtotal', 'tax_amount', 'total', 'number_of_boxes'];
                if (numericFields.includes(key) && payload[key] === 0) {
                    // Keep numeric fields even if 0
                    return;
                }
                if (payload[key] === undefined || (key !== 'notes' && payload[key] === '')) {
                    delete payload[key];
                }
            });
            
            // Ensure notes is always included (can be empty string)
            if (!payload.hasOwnProperty('notes')) {
                payload.notes = '';
            }
            
            // Debug: Verify critical fields are in payload
            console.log('🔍 [Edit Invoice] Payload verification:', {
                hasWeightKg: payload.hasOwnProperty('weight_kg'),
                weightKg: payload.weight_kg,
                hasWeightType: payload.hasOwnProperty('weight_type'),
                weightType: payload.weight_type,
                hasBaseRate: payload.hasOwnProperty('base_rate'),
                baseRate: payload.base_rate,
                hasNumberOfBoxes: payload.hasOwnProperty('number_of_boxes'),
                numberOfBoxes: payload.number_of_boxes
            });
            
            // Calculate subtotal from charges (no auto-calculation of tax/total - all manual)
            const shippingCharge = editForm.amount ? parseFloat(editForm.amount) : 0;
            const pickupCharge = editForm.pickup_charge ? parseFloat(editForm.pickup_charge) : 0;
            const deliveryCharge = editForm.delivery_charge ? parseFloat(editForm.delivery_charge) : 0;
            const insuranceCharge = editForm.insurance_charge ? parseFloat(editForm.insurance_charge) : 0;
            
            const subtotal = shippingCharge + pickupCharge + deliveryCharge + insuranceCharge;
            
            // Use manually entered values (no auto-calculation)
            const taxAmount = editForm.tax_amount && editForm.tax_amount !== '' ? parseFloat(editForm.tax_amount) : 0;
            const total = editForm.total && editForm.total !== '' ? parseFloat(editForm.total) : 0;
            
            // Update values (all manual - no auto-calculation)
            payload.subtotal = subtotal;
            if (editForm.tax_amount && editForm.tax_amount !== '') {
            payload.tax_amount = taxAmount;
            }
            if (editForm.total && editForm.total !== '') {
            payload.total = total;
            }
            
            // Flag to indicate invoice should be regenerated with all recalculations
            payload.regenerate = true;

            // Debug: Log the payload being sent
            console.log('📤 [Edit Invoice] Sending update request:', {
                invoiceId: invoiceIdentifier,
                payload: payload,
                payloadSize: JSON.stringify(payload).length,
                fieldsCount: Object.keys(payload).length
            });

            const result = await apiClient.updateInvoiceUnified(invoiceIdentifier, payload);
            
            // Debug: Log the response
            console.log('📥 [Edit Invoice] Update response:', {
                success: result.success,
                data: result.data,
                error: result.error
            });
            
            if (result.success) {
                // Re-fetch the invoice to ensure we have the latest data from backend
                await refreshInvoiceAfterEdit();
                toast({
                    title: 'Invoice updated',
                    description: 'Changes have been saved successfully.',
                });
                setShowEditDialog(false);
            } else {
                console.error('❌ [Edit Invoice] Update failed:', {
                    error: result.error,
                    response: result
                });
                toast({
                    variant: 'destructive',
                    title: 'Update failed',
                    description: result.error || 'Unable to update invoice. Please check console for details.',
                });
            }
        } catch (err: any) {
            console.error('❌ [Edit Invoice] Exception during update:', {
                error: err,
                message: err.message,
                stack: err.stack
            });
            toast({
                variant: 'destructive',
                title: 'Update failed',
                description: err.message || 'Unable to update invoice. Please check console for details.',
            });
        } finally {
            setSavingEdit(false);
        }
    };
    
    // Save handler for PH TO UAE COD Invoice
    const handleSaveCodEdit = async () => {
        const invoiceIdentifier = invoice?._id || invoiceId;
        if (!invoiceIdentifier) return;
        setSavingEdit(true);
        try {
            const payload: any = {
                // Invoice Header
                invoice_id: codEditForm.invoice_number.trim() || undefined,
                batch_number: codEditForm.batch_number.trim() || undefined,
                awb_number: codEditForm.awb_number.trim() || undefined,
                issue_date: codEditForm.issue_date ? new Date(codEditForm.issue_date).toISOString() : undefined,
                due_date: codEditForm.due_date ? new Date(codEditForm.due_date).toISOString() : undefined,
                // Sender Information
                customer_name: codEditForm.customer_name.trim() || undefined,
                customer_phone: codEditForm.customer_phone.trim() || undefined,
                customer_email: codEditForm.customer_email.trim() || undefined,
                origin_place: codEditForm.origin_place.trim() || undefined,
                // Receiver Information
                receiver_name: codEditForm.receiver_name.trim(),
                receiver_address: codEditForm.receiver_address.trim(),
                receiver_phone: codEditForm.receiver_phone.trim(),
                customer_trn: codEditForm.receiver_trn.trim() || undefined,
                // Shipment Details
                number_of_boxes: codEditForm.number_of_boxes ? parseInt(codEditForm.number_of_boxes) : undefined,
                weight_kg: codEditForm.weight_kg ? parseFloat(codEditForm.weight_kg) : undefined,
                weight_type: codEditForm.weight_type || undefined,
                base_rate: codEditForm.base_rate ? parseFloat(codEditForm.base_rate) : undefined,
                service_code: codEditForm.service_code.trim() || undefined,
                // COD Charges ONLY - do NOT update Tax invoice fields
                amount: codEditForm.amount ? parseFloat(codEditForm.amount) : undefined,
                pickup_charge: codEditForm.pickup_charge ? parseFloat(codEditForm.pickup_charge) : undefined,
                cod_delivery_charge: codEditForm.cod_delivery_charge ? parseFloat(codEditForm.cod_delivery_charge) : undefined,
                total_amount_cod: codEditForm.total_amount_cod ? parseFloat(codEditForm.total_amount_cod) : undefined,
                // Agent
                agent_name: codEditForm.agent_name.trim() || undefined,
                // Notes
                notes: codEditForm.notes?.trim() || '',
                invoice_type: 'COD' // Mark as COD invoice edit
            };

            // Remove undefined and empty string values (except for notes)
            Object.keys(payload).forEach(key => {
                const numericFields = ['weight_kg', 'base_rate', 'amount', 'pickup_charge', 'cod_delivery_charge', 'total_amount_cod', 'number_of_boxes'];
                if (numericFields.includes(key) && payload[key] === 0) {
                    return; // Keep numeric fields even if 0
                }
                if (payload[key] === undefined || (key !== 'notes' && payload[key] === '')) {
                    delete payload[key];
                }
            });
            
            // Ensure notes is always included (can be empty string)
            if (!payload.hasOwnProperty('notes')) {
                payload.notes = '';
            }
            
            // IMPORTANT: Do NOT update Tax invoice fields (delivery_charge, tax_amount, total_amount_tax_invoice, tax_rate)
            // These should remain unchanged when editing COD invoice

            const result = await apiClient.updateInvoiceUnified(invoiceIdentifier, payload);
            if (result.success) {
                // Refresh invoice data to get updated values from database
                // This will update the invoice state and trigger a re-render
                await refreshInvoiceAfterEdit();
                // Small delay to ensure React processes the state update
                await new Promise(resolve => setTimeout(resolve, 50));
                toast({
                    title: 'COD Invoice updated',
                    description: 'COD invoice changes have been saved successfully. The invoice will refresh automatically.',
                });
                setShowCodEditDialog(false);
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Update failed',
                    description: result.error || 'Unable to update COD invoice.',
                });
            }
        } catch (err: any) {
            toast({
                variant: 'destructive',
                title: 'Update failed',
                description: err.message || 'Unable to save COD invoice changes.',
            });
        } finally {
            setSavingEdit(false);
        }
    };
    
    // Save handler for PH TO UAE Tax Invoice
    const handleSaveTaxEdit = async () => {
        const invoiceIdentifier = invoice?._id || invoiceId;
        if (!invoiceIdentifier) return;
        setSavingEdit(true);
        try {
            const payload: any = {
                // Invoice Header
                invoice_id: taxEditForm.invoice_number.trim() || undefined,
                batch_number: taxEditForm.batch_number.trim() || undefined,
                awb_number: taxEditForm.awb_number.trim() || undefined,
                // Receiver Information
                receiver_name: taxEditForm.receiver_name.trim(),
                receiver_address: taxEditForm.receiver_address.trim(),
                receiver_phone: taxEditForm.receiver_phone.trim(),
                // Notes
                notes: taxEditForm.notes?.trim() || '',
                invoice_type: 'TAX' // Mark as Tax invoice edit
            };

            // Tax Invoice fields ONLY - do NOT update COD invoice fields
            if (taxEditForm.delivery_charge) payload.delivery_charge = parseFloat(taxEditForm.delivery_charge);
            if (taxEditForm.tax_amount) payload.tax_amount = parseFloat(taxEditForm.tax_amount);
            if (taxEditForm.total_amount_tax_invoice) payload.total_amount_tax_invoice = parseFloat(taxEditForm.total_amount_tax_invoice);
            
            // For Tax invoice: tax_rate = 5%
            payload.tax_rate = 5;
            // IMPORTANT: Do NOT update amount field - it must be preserved for COD invoice calculations
            // The shipping charge display is already handled in the frontend (hidden for Tax invoices)
            payload.total = parseFloat(taxEditForm.total_amount_tax_invoice || '0');
            payload.subtotal = parseFloat(taxEditForm.delivery_charge || '0');
            
            // IMPORTANT: Do NOT update COD invoice fields (amount, pickup_charge, cod_delivery_charge, total_amount_cod)
            // These should remain unchanged when editing Tax invoice
            // The amount (shipping charge) must be preserved in the backend for COD invoice calculations

            const result = await apiClient.updateInvoiceUnified(invoiceIdentifier, payload);
            if (result.success) {
                await refreshInvoiceAfterEdit();
                toast({
                    title: 'Tax Invoice updated',
                    description: 'Tax invoice changes have been saved successfully.',
                });
                setShowTaxEditDialog(false);
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Update failed',
                    description: result.error || 'Unable to update Tax invoice.',
                });
            }
        } catch (err: any) {
            toast({
                variant: 'destructive',
                title: 'Update failed',
                description: err.message || 'Unable to update Tax invoice.',
            });
        } finally {
            setSavingEdit(false);
        }
    };
    
    // Helper function to refresh invoice after edit
    const refreshInvoiceAfterEdit = async () => {
        try {
            const refreshResult = await apiClient.getInvoiceUnified(invoiceId);
            console.log('🔄 Raw API response:', {
                success: refreshResult.success,
                hasData: !!refreshResult.data,
                dataKeys: refreshResult.data ? Object.keys(refreshResult.data) : [],
                cod_delivery_charge_in_response: (refreshResult.data as any)?.cod_delivery_charge,
                cod_delivery_charge_type: typeof (refreshResult.data as any)?.cod_delivery_charge
            });
            
            if (refreshResult.success && refreshResult.data) {
                const invoiceData = refreshResult.data as any;
                // Debug: Log the refreshed invoice data to verify updated values
                const codDeliveryChargeFromApi = (invoiceData as any).cod_delivery_charge;
                console.log('🔄 Refreshed invoice after edit:', {
                    amount: invoiceData.amount,
                    delivery_charge: invoiceData.delivery_charge,
                    cod_delivery_charge: codDeliveryChargeFromApi, // COD delivery charge for PH TO UAE
                    cod_delivery_charge_type: typeof codDeliveryChargeFromApi,
                    cod_delivery_charge_value: codDeliveryChargeFromApi,
                    delivery_base_amount: invoiceData.delivery_base_amount,
                    total_amount_cod: invoiceData.total_amount_cod || invoiceData.totalAmountCod,
                    total_amount_tax_invoice: invoiceData.total_amount_tax_invoice || invoiceData.totalAmountTaxInvoice,
                    tax_rate: invoiceData.tax_rate,
                    tax_amount: invoiceData.tax_amount,
                    total_amount: invoiceData.total_amount,
                    subtotal: invoiceData.subtotal,
                    // Critical fields for rate/weight display
                    weight_kg: invoiceData.weight_kg,
                    weight_type: invoiceData.weight_type,
                    base_rate: invoiceData.base_rate,
                    requestIdBaseRate: invoiceData.request_id?.verification?.calculated_rate,
                    // Insurance charge fields
                    insurance_charge: invoiceData.insurance_charge,
                    line_items: invoiceData.line_items?.map((item: any) => ({
                        description: item.description,
                        total: item.total,
                        unit_price: item.unit_price
                    })),
                    // Verify cod_delivery_charge is present
                    has_cod_delivery_charge: codDeliveryChargeFromApi !== undefined && codDeliveryChargeFromApi !== null,
                    invoice_keys: Object.keys(invoiceData).filter(k => k.toLowerCase().includes('delivery') || k.toLowerCase().includes('cod'))
                });
                // Create a deep copy to ensure React detects the change and all nested properties are updated
                const updatedInvoice = JSON.parse(JSON.stringify(refreshResult.data));
                
                // Debug: Log insurance charge specifically BEFORE state update
                console.log('🔄 Insurance charge after refresh (BEFORE state update):', {
                    directField: updatedInvoice.insurance_charge,
                    fromLineItems: updatedInvoice.line_items?.find((item: any) => 
                        item.description?.toLowerCase().includes('insurance')
                    ),
                    finalInsuranceCharge: updatedInvoice.insurance_charge || 
                        updatedInvoice.line_items?.find((item: any) => 
                            item.description?.toLowerCase().includes('insurance')
                        )?.total || 0,
                    allLineItems: updatedInvoice.line_items?.map((item: any) => ({
                        description: item.description,
                        total: item.total,
                        unit_price: item.unit_price
                    }))
                });
                
                // Update invoice state and force re-render
                const codDeliveryChargeInUpdated = (updatedInvoice as any).cod_delivery_charge;
                // Use functional update to ensure React detects the change
                setInvoice((prevInvoice: any) => {
                    // Create a completely new object to ensure React detects the change
                    const newInvoice = JSON.parse(JSON.stringify(updatedInvoice));
                    console.log('🔄 setInvoice called with new invoice:', {
                        prev_cod_delivery_charge: (prevInvoice as any)?.cod_delivery_charge,
                        new_cod_delivery_charge: (newInvoice as any).cod_delivery_charge,
                        invoice_id: newInvoice._id || newInvoice.invoice_id
                    });
                    return newInvoice;
                });
                const newRefreshKey = refreshKey + 1;
                setRefreshKey(newRefreshKey); // Force component re-render
                setForceUpdate(prev => prev + 1); // Additional trigger to force recalculation
                
                // Debug: Log critical fields AFTER state update
                console.log('🔄 Invoice state updated after refresh:', {
                    refreshKey: newRefreshKey,
                    cod_delivery_charge: codDeliveryChargeInUpdated,
                    cod_delivery_charge_type: typeof codDeliveryChargeInUpdated,
                    cod_delivery_charge_parsed: codDeliveryChargeInUpdated ? parseFloat(codDeliveryChargeInUpdated.toString()) : 0,
                    delivery_charge: updatedInvoice.delivery_charge,
                    total_amount_cod: (updatedInvoice as any).total_amount_cod || (updatedInvoice as any).totalAmountCod,
                    insurance_charge: updatedInvoice.insurance_charge,
                    note: 'State updated - component should re-render and calculations should use new cod_delivery_charge value'
                });
                
                // Update all edit forms with fresh data
                // Get insurance charge from invoice (line_items or direct field)
                let insuranceValue = '';
                if (invoiceData.insurance_charge !== undefined && invoiceData.insurance_charge !== null) {
                    insuranceValue = parseFloat(invoiceData.insurance_charge).toString();
                } else if (invoiceData.line_items && invoiceData.line_items.length > 0) {
                    const insuranceItem = invoiceData.line_items.find((item: any) => 
                        item.description?.toLowerCase().includes('insurance')
                    );
                    if (insuranceItem) {
                        insuranceValue = parseFloat(insuranceItem.total || insuranceItem.unit_price || 0).toString();
                    }
                }
                
                // Initialize all edit form fields (refresh)
                const invoiceNumber = invoiceData.invoice_id || invoiceData._id || '';
                const batchNumber = invoiceData.batch_number || invoiceData.request_id?.batch_number || '';
                const awbNumber = invoiceData.awb_number || invoiceData.request_id?.awb_number || invoiceData.request_id?.tracking_code || '';
                const issueDate = invoiceData.issue_date ? new Date(invoiceData.issue_date).toISOString().split('T')[0] : '';
                const dueDate = invoiceData.due_date ? new Date(invoiceData.due_date).toISOString().split('T')[0] : '';
                
                const customerName = invoiceData.customer_name || invoiceData.request_id?.customer_name || invoiceData.request_id?.sender?.name || invoiceData.client_id?.company_name || invoiceData.client_id?.contact_name || '';
                const customerPhone = invoiceData.customer_phone || invoiceData.request_id?.customer_phone || invoiceData.request_id?.sender?.phone || invoiceData.client_id?.contact_phone || '';
                const customerEmail = invoiceData.customer_email || invoiceData.request_id?.customer_email || invoiceData.request_id?.sender?.email || invoiceData.client_id?.contact_email || '';
                const originPlace = invoiceData.origin_place || invoiceData.request_id?.origin_place || invoiceData.request_id?.sender?.address || '';
                
                const receiverName = invoiceData.receiver_name || invoiceData.request_id?.receiver?.name || '';
                const receiverAddress = invoiceData.receiver_address || invoiceData.request_id?.receiver?.address || '';
                const receiverPhone = invoiceData.receiver_phone || invoiceData.request_id?.receiver?.phone || '';
                const receiverTrn = invoiceData.customer_trn || invoiceData.request_id?.customer_trn || '';
                
                const numberOfBoxes = invoiceData.number_of_boxes || invoiceData.request_id?.verification?.number_of_boxes || invoiceData.request_id?.shipment?.number_of_boxes || '';
                const weightKg = invoiceData.weight_kg || invoiceData.request_id?.verification?.total_kg || invoiceData.request_id?.verification?.chargeable_weight || '';
                const weightType = invoiceData.request_id?.shipment?.weight_type || invoiceData.request_id?.verification?.weight_type || 'ACTUAL';
                const baseRate = invoiceData.base_rate ? parseFloat(invoiceData.base_rate).toString() : (invoiceData.request_id?.verification?.calculated_rate ? parseFloat(invoiceData.request_id.verification.calculated_rate.toString()).toString() : '');
                const serviceCode = invoiceData.service_code || invoiceData.request_id?.service_code || '';
                
                const agentName = invoiceData.created_by?.full_name || invoiceData.request_id?.verification?.agents_name || '';
                
                setEditForm({
                    // Invoice Header
                    invoice_number: invoiceNumber.toString(),
                    batch_number: batchNumber,
                    awb_number: awbNumber,
                    issue_date: issueDate,
                    due_date: dueDate,
                    // Sender Information
                    customer_name: customerName,
                    customer_phone: customerPhone,
                    customer_email: customerEmail,
                    origin_place: originPlace,
                    // Receiver Information
                    receiver_name: receiverName,
                    receiver_address: receiverAddress,
                    receiver_phone: receiverPhone,
                    receiver_trn: receiverTrn,
                    // Shipment Details
                    number_of_boxes: numberOfBoxes.toString(),
                    weight_kg: weightKg ? parseFloat(weightKg.toString()).toString() : '',
                    weight_type: weightType,
                    base_rate: baseRate,
                    service_code: serviceCode,
                    // Charges
                    amount: invoiceData.amount ? parseFloat(invoiceData.amount).toString() : '',
                    pickup_charge: invoiceData.pickup_charge ? parseFloat(invoiceData.pickup_charge).toString() : '',
                    delivery_charge: invoiceData.delivery_charge ? parseFloat(invoiceData.delivery_charge).toString() : '',
                    insurance_charge: insuranceValue,
                    tax_rate: invoiceData.tax_rate != null ? invoiceData.tax_rate.toString() : '',
                    tax_amount: invoiceData.tax_amount ? parseFloat(invoiceData.tax_amount.toString()).toString() : '',
                    total: invoiceData.total_amount || invoiceData.total ? parseFloat((invoiceData.total_amount || invoiceData.total).toString()).toString() : '',
                    // Agent
                    agent_name: agentName,
                    // Notes
                    notes: invoiceData.notes || ''
                });
                
                // Update COD and Tax forms if PH TO UAE
                if (isPhToUaeService(invoiceData.service_code || invoiceData.request_id?.service_code)) {
                    const totalAmountCod = (invoiceData as any).total_amount_cod || (invoiceData as any).totalAmountCod || 0;
                    const totalAmountTaxInvoice = (invoiceData as any).total_amount_tax_invoice || (invoiceData as any).totalAmountTaxInvoice || 0;
                    const codDeliveryChargeForForm = parseDecimal((invoiceData as any).cod_delivery_charge || 0, 2);
                    // Keep delivery_base_amount as fallback for backward compatibility
                    const deliveryBaseAmount = codDeliveryChargeForForm > 0 ? codDeliveryChargeForForm : parseDecimal((invoiceData as any).delivery_base_amount || 0, 2);
                    const deliveryCharge = parseDecimal(invoiceData.delivery_charge || 0, 2);
                    const taxAmount = parseDecimal(invoiceData.tax_amount || 0, 2);
                    
                    // Get pickup charge from invoice or line_items
                    let pickupChargeValueForForm = 0;
                    if (invoiceData.pickup_charge) {
                        pickupChargeValueForForm = parseDecimal(invoiceData.pickup_charge, 2);
                    } else if (invoiceData.line_items && invoiceData.line_items.length > 0) {
                        invoiceData.line_items.forEach((item: any) => {
                            const description = item.description?.toLowerCase() || '';
                            if (description.includes('pickup')) {
                                pickupChargeValueForForm += parseDecimal(item.total || item.unit_price, 2);
                            }
                        });
                    }
                    
                    // Calculate shipping charge for form if amount is 0
                    let shippingChargeForForm = parseDecimal(invoiceData.amount || 0, 2);
                    if (shippingChargeForForm === 0 && totalAmountCod > 0) {
                        // Calculate from total_amount_cod: shipping = total - pickup - delivery
                        const totalKgForCalc = parseDecimal(
                            invoiceData.request_id?.verification?.total_kg ||
                            invoiceData.request_id?.verification?.chargeable_weight ||
                            invoiceData.weight_kg || 0, 2
                        );
                        const codDeliveryAmount = totalKgForCalc >= 15 ? 0 : (deliveryBaseAmount > 0 ? deliveryBaseAmount : deliveryCharge);
                        const calculatedShipping = parseDecimal(totalAmountCod, 2) - pickupChargeValueForForm - codDeliveryAmount;
                        if (calculatedShipping > 0) {
                            shippingChargeForForm = parseDecimal(calculatedShipping, 2);
                        }
                    }
                    
                    setCodEditForm({
                        // Invoice Header
                        invoice_number: invoiceNumber.toString(),
                        batch_number: batchNumber,
                        awb_number: awbNumber,
                        issue_date: issueDate,
                        due_date: dueDate,
                        // Sender Information
                        customer_name: customerName,
                        customer_phone: customerPhone,
                        customer_email: customerEmail,
                        origin_place: originPlace,
                        // Receiver Information
                        receiver_name: receiverName,
                        receiver_address: receiverAddress,
                        receiver_phone: receiverPhone,
                        receiver_trn: receiverTrn,
                        // Shipment Details
                        number_of_boxes: numberOfBoxes.toString(),
                        weight_kg: weightKg ? parseFloat(weightKg.toString()).toString() : '',
                        weight_type: weightType,
                        base_rate: baseRate,
                        service_code: serviceCode,
                        // COD Charges Only (NO Tax invoice fields)
                        amount: shippingChargeForForm > 0 ? shippingChargeForForm.toFixed(2) : '',
                        pickup_charge: pickupChargeValueForForm > 0 ? pickupChargeValueForForm.toFixed(2) : '',
                        cod_delivery_charge: deliveryBaseAmount > 0 ? deliveryBaseAmount.toFixed(2) : '',
                        total_amount_cod: totalAmountCod > 0 ? parseFloat(totalAmountCod.toString()).toFixed(2) : '',
                        // Agent
                        agent_name: agentName,
                        // Notes
                        notes: invoiceData.notes || ''
                    });
                    
                    setTaxEditForm({
                        // Invoice Header
                        invoice_number: invoiceNumber.toString(),
                        batch_number: batchNumber,
                        awb_number: awbNumber,
                        issue_date: issueDate,
                        due_date: dueDate,
                        // Sender Information
                        customer_name: customerName,
                        customer_phone: customerPhone,
                        customer_email: customerEmail,
                        origin_place: originPlace,
                        // Receiver Information
                        receiver_name: receiverName,
                        receiver_address: receiverAddress,
                        receiver_phone: receiverPhone,
                        receiver_trn: receiverTrn,
                        // Shipment Details
                        number_of_boxes: numberOfBoxes.toString(),
                        weight_kg: weightKg ? parseFloat(weightKg.toString()).toString() : '',
                        weight_type: weightType,
                        base_rate: baseRate,
                        service_code: serviceCode,
                        // Tax Charges Only (NO COD invoice fields)
                        delivery_charge: deliveryCharge > 0 ? deliveryCharge.toString() : '',
                        tax_rate: '5',
                        tax_amount: taxAmount > 0 ? taxAmount.toString() : '',
                        total_amount_tax_invoice: totalAmountTaxInvoice > 0 ? parseFloat(totalAmountTaxInvoice.toString()).toFixed(2) : '',
                        // Agent
                        agent_name: agentName,
                        // Notes
                        notes: invoiceData.notes || ''
                    });
                }
            }
        } catch (refreshError) {
            console.error('Error refreshing invoice after update:', refreshError);
        }
    };

    return (
        <div className="space-y-4">
            {/* Navigation Bar */}
            <Card className="p-4 no-print">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="outline"
                            onClick={() => router.push('/dashboard/invoices')}
                        >
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back to Invoices
                        </Button>
                        <div className="h-6 w-px bg-border" />
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">Invoice View:</span>
                            <Button
                                variant={invoiceType === 'normal' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setInvoiceType('normal')}
                            >
                                <FileText className="h-4 w-4 mr-2" />
                                Normal Invoice
                            </Button>
                            <Button
                                variant={invoiceType === 'tax' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setInvoiceType('tax')}
                            >
                                <Receipt className="h-4 w-4 mr-2" />
                                Tax Invoice
                            </Button>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            onClick={handlePrint}
                        >
                            <Printer className="h-4 w-4 mr-2" />
                            Print
                        </Button>
                        {isPhToUae ? (
                            <>
                                <Button
                                    variant="outline"
                                    onClick={() => setShowCodEditDialog(true)}
                                    className="bg-blue-50 hover:bg-blue-100"
                                >
                                    Edit COD Invoice
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => setShowTaxEditDialog(true)}
                                    className="bg-green-50 hover:bg-green-100"
                                >
                                    Edit Tax Invoice
                                </Button>
                            </>
                        ) : (
                            <Button
                                variant="outline"
                                onClick={() => setShowEditDialog(true)}
                            >
                                Edit Invoice
                            </Button>
                        )}
                        <Button
                            variant="outline"
                            onClick={handleDownloadExcel}
                        >
                            <FileSpreadsheet className="h-4 w-4 mr-2" />
                            Download Excel
                        </Button>
                        <Button
                            onClick={handleDownloadPDF}
                        >
                            <Download className="h-4 w-4 mr-2" />
                            Download PDF
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => setShowRequestDataDialog(true)}
                            className="bg-purple-50 hover:bg-purple-100 border-purple-200"
                        >
                            <Database className="h-4 w-4 mr-2" />
                            View Request Data
                        </Button>
                    </div>
                </div>
            </Card>

            {/* Invoice Template */}
            <div id="invoice-content">
                {invoiceData && invoiceData.invoiceNumber ? (
                    invoiceType === 'tax' ? (
                        <TaxInvoiceTemplate key={`tax-${refreshKey}`} data={taxInvoiceData} />
                    ) : (
                        <InvoiceTemplate key={`invoice-${refreshKey}`} data={invoiceData} />
                    )
                ) : (
                    <Card className="p-6">
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Invoice Data Error</AlertTitle>
                            <AlertDescription>
                                Invoice data is missing or invalid. Please check the console for details.
                            </AlertDescription>
                        </Alert>
                        <div className="mt-4">
                            <p className="text-sm text-gray-600">Invoice Object:</p>
                            <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-auto">
                                {JSON.stringify(invoice, null, 2)}
                            </pre>
                            <p className="text-sm text-gray-600 mt-4">Mapped Invoice Data:</p>
                            <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-auto">
                                {JSON.stringify(invoiceData, null, 2)}
                            </pre>
                        </div>
                    </Card>
                )}
            </div>

            {/* PH TO UAE COD Invoice Edit Dialog */}
            {isPhToUae && (
                <Dialog open={showCodEditDialog} onOpenChange={setShowCodEditDialog}>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>Edit COD Invoice (PH TO UAE)</DialogTitle>
                            <DialogDescription>
                                Edit COD invoice details. Changes will update amount, delivery_base_amount, and total_amount_cod.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                            {/* Invoice Header Section */}
                            <div className="rounded-lg border p-4 bg-muted/30">
                                <h3 className="font-semibold mb-3">Invoice Header</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <Label>Invoice Number</Label>
                                        <Input
                                            value={codEditForm.invoice_number}
                                            onChange={(e) => handleCodEditChange('invoice_number', e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <Label>AWB Number</Label>
                                        <Input
                                            value={codEditForm.awb_number}
                                            onChange={(e) => handleCodEditChange('awb_number', e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <Label>Batch Number</Label>
                                        <Input
                                            value={codEditForm.batch_number}
                                            onChange={(e) => handleCodEditChange('batch_number', e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <Label>Receiver Name</Label>
                                    <Input
                                        value={codEditForm.receiver_name}
                                        onChange={(e) => handleCodEditChange('receiver_name', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <Label>Receiver Phone</Label>
                                    <Input
                                        value={codEditForm.receiver_phone}
                                        onChange={(e) => handleCodEditChange('receiver_phone', e.target.value)}
                                    />
                                </div>
                            </div>
                            <div>
                                <Label>Receiver Address</Label>
                                <Textarea
                                    value={codEditForm.receiver_address}
                                    onChange={(e) => handleCodEditChange('receiver_address', e.target.value)}
                                    rows={3}
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div>
                                    <Label>Number of Boxes</Label>
                                    <Input
                                        type="number"
                                        min="1"
                                        value={codEditForm.number_of_boxes}
                                        onChange={(e) => handleCodEditChange('number_of_boxes', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <Label>Weight (kg)</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={codEditForm.weight_kg}
                                        onChange={(e) => handleCodEditChange('weight_kg', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <Label>Weight Type</Label>
                                    <Select
                                        value={codEditForm.weight_type}
                                        onValueChange={(value) => handleCodEditChange('weight_type', value)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="ACTUAL">ACTUAL</SelectItem>
                                            <SelectItem value="VOLUMETRIC">VOLUMETRIC</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label>Rate (AED/kg)</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={codEditForm.base_rate}
                                        onChange={(e) => handleCodEditChange('base_rate', e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <Label>Shipping Charge (AED) *</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={codEditForm.amount}
                                        onChange={(e) => handleCodEditChange('amount', e.target.value)}
                                        required
                                    />
                                    <p className="text-xs text-muted-foreground mt-1">Main shipping charge</p>
                                </div>
                                <div>
                                    <Label>Pickup Charge (AED)</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={codEditForm.pickup_charge}
                                        onChange={(e) => handleCodEditChange('pickup_charge', e.target.value)}
                                    />
                                    <p className="text-xs text-muted-foreground mt-1">Pickup charge (optional)</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <Label>COD Delivery Charge (AED) *</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={codEditForm.cod_delivery_charge}
                                        onChange={(e) => handleCodEditChange('cod_delivery_charge', e.target.value)}
                                        required
                                    />
                                    <p className="text-xs text-muted-foreground mt-1">Delivery charge for COD invoice (separate from Tax invoice)</p>
                                </div>
                                <div>
                                    <Label>Total Amount COD (AED) *</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={codEditForm.total_amount_cod}
                                        onChange={(e) => handleCodEditChange('total_amount_cod', e.target.value)}
                                        required
                                        readOnly
                                        className="bg-gray-100"
                                    />
                                    <p className="text-xs text-muted-foreground mt-1">Auto-calculated: Shipping + Pickup + Delivery</p>
                                </div>
                            </div>
                            <div>
                                <Label>Notes</Label>
                                <Textarea
                                    value={codEditForm.notes}
                                    rows={3}
                                    onChange={(e) => handleCodEditChange('notes', e.target.value)}
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => setShowCodEditDialog(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleSaveCodEdit}
                                disabled={savingEdit}
                                className="bg-blue-600 hover:bg-blue-700"
                            >
                                {savingEdit ? 'Saving...' : 'Save COD Invoice'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
            
            {/* PH TO UAE Tax Invoice Edit Dialog */}
            {isPhToUae && (
                <Dialog open={showTaxEditDialog} onOpenChange={setShowTaxEditDialog}>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>Edit Tax Invoice (PH TO UAE)</DialogTitle>
                            <DialogDescription>
                                Edit Tax invoice details. Changes will update delivery_charge, tax_amount, and total_amount_tax_invoice.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                            {/* Invoice Header Section */}
                            <div className="rounded-lg border p-4 bg-muted/30">
                                <h3 className="font-semibold mb-3">Invoice Header</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <Label>Invoice Number</Label>
                                        <Input
                                            value={taxEditForm.invoice_number}
                                            onChange={(e) => handleTaxEditChange('invoice_number', e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <Label>AWB Number</Label>
                                        <Input
                                            value={taxEditForm.awb_number}
                                            onChange={(e) => handleTaxEditChange('awb_number', e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <Label>Batch Number</Label>
                                        <Input
                                            value={taxEditForm.batch_number}
                                            onChange={(e) => handleTaxEditChange('batch_number', e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <Label>Receiver Name</Label>
                                    <Input
                                        value={taxEditForm.receiver_name}
                                        onChange={(e) => handleTaxEditChange('receiver_name', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <Label>Receiver Phone</Label>
                                    <Input
                                        value={taxEditForm.receiver_phone}
                                        onChange={(e) => handleTaxEditChange('receiver_phone', e.target.value)}
                                    />
                                </div>
                            </div>
                            <div>
                                <Label>Receiver Address</Label>
                                <Textarea
                                    value={taxEditForm.receiver_address}
                                    onChange={(e) => handleTaxEditChange('receiver_address', e.target.value)}
                                    rows={3}
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div>
                                    <Label>Number of Boxes</Label>
                                    <Input
                                        type="number"
                                        min="1"
                                        value={taxEditForm.number_of_boxes}
                                        onChange={(e) => handleTaxEditChange('number_of_boxes', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <Label>Weight (kg)</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={taxEditForm.weight_kg}
                                        onChange={(e) => handleTaxEditChange('weight_kg', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <Label>Weight Type</Label>
                                    <Select
                                        value={taxEditForm.weight_type}
                                        onValueChange={(value) => handleTaxEditChange('weight_type', value)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="ACTUAL">ACTUAL</SelectItem>
                                            <SelectItem value="VOLUMETRIC">VOLUMETRIC</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label>Rate (AED/kg)</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={taxEditForm.base_rate}
                                        onChange={(e) => handleTaxEditChange('base_rate', e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <Label>Delivery Charge (AED) *</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={taxEditForm.delivery_charge}
                                        onChange={(e) => handleTaxEditChange('delivery_charge', e.target.value)}
                                        required
                                    />
                                    <p className="text-xs text-muted-foreground mt-1">Delivery charge (calculated with boxes)</p>
                                </div>
                                <div>
                                    <Label>Tax Rate (%)</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={taxEditForm.tax_rate}
                                        readOnly
                                        className="bg-gray-100"
                                    />
                                    <p className="text-xs text-muted-foreground mt-1">Fixed at 5% VAT</p>
                                </div>
                                <div>
                                    <Label>Tax Amount (AED) *</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={taxEditForm.tax_amount}
                                        onChange={(e) => handleTaxEditChange('tax_amount', e.target.value)}
                                        required
                                    />
                                    <p className="text-xs text-muted-foreground mt-1">Enter tax amount manually</p>
                                </div>
                            </div>
                            <div>
                                <Label>Total Amount Tax Invoice (AED) *</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={taxEditForm.total_amount_tax_invoice}
                                    onChange={(e) => handleTaxEditChange('total_amount_tax_invoice', e.target.value)}
                                    required
                                />
                                <p className="text-xs text-muted-foreground mt-1">Enter total amount manually</p>
                            </div>
                            <div>
                                <Label>Notes</Label>
                                <Textarea
                                    value={taxEditForm.notes}
                                    rows={3}
                                    onChange={(e) => handleTaxEditChange('notes', e.target.value)}
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => setShowTaxEditDialog(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleSaveTaxEdit}
                                disabled={savingEdit}
                                className="bg-green-600 hover:bg-green-700"
                            >
                                {savingEdit ? 'Saving...' : 'Save Tax Invoice'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}

            {/* Regular Invoice Edit Dialog (for non-PH TO UAE invoices) */}
            {!isPhToUae && invoice && (
                <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
                <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Edit Invoice</DialogTitle>
                        <DialogDescription>Edit all invoice details. All changes are tracked and saved to the database.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-6 py-4">
                        {/* Invoice Header Section */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Invoice Header</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {(() => {
                                    // Get current values from invoice for comparison
                                    const currentInvoiceNumber = invoice.invoice_id || invoice._id || '';
                                    const currentBatchNumber = invoice.batch_number || invoice.request_id?.batch_number || '';
                                    const currentAwbNumber = invoice.awb_number || invoice.request_id?.awb_number || invoice.request_id?.tracking_code || '';
                                    const currentIssueDate = invoice.issue_date ? new Date(invoice.issue_date).toISOString().split('T')[0] : '';
                                    const currentDueDate = invoice.due_date ? new Date(invoice.due_date).toISOString().split('T')[0] : '';
                                    
                                    return (
                                        <>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                <div>
                                                    <Label>Invoice Number</Label>
                                                    <Input
                                                        value={editForm.invoice_number}
                                                        onChange={(e) => handleEditChange('invoice_number', e.target.value)}
                                                    />
                                                    {currentInvoiceNumber && (
                                                        <p className="text-xs text-muted-foreground mt-1">Current: {currentInvoiceNumber.toString()}</p>
                                                    )}
                                                </div>
                                                <div>
                                                    <Label>Batch Number</Label>
                                                    <Input
                                                        value={editForm.batch_number}
                                                        onChange={(e) => handleEditChange('batch_number', e.target.value)}
                                                    />
                                                    {currentBatchNumber && (
                                                        <p className="text-xs text-muted-foreground mt-1">Current: {currentBatchNumber || 'Not set'}</p>
                                                    )}
                                                </div>
                                                <div>
                                                    <Label>AWB Number</Label>
                                                    <Input
                                                        value={editForm.awb_number}
                                                        onChange={(e) => handleEditChange('awb_number', e.target.value)}
                                                    />
                                                    {currentAwbNumber && (
                                                        <p className="text-xs text-muted-foreground mt-1">Current: {currentAwbNumber || 'Not set'}</p>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                                <div>
                                                    <Label>Issue Date</Label>
                                                    <Input
                                                        type="date"
                                                        value={editForm.issue_date}
                                                        onChange={(e) => handleEditChange('issue_date', e.target.value)}
                                                    />
                                                    {currentIssueDate && (
                                                        <p className="text-xs text-muted-foreground mt-1">Current: {currentIssueDate}</p>
                                                    )}
                                                </div>
                                                <div>
                                                    <Label>Due Date</Label>
                                                    <Input
                                                        type="date"
                                                        value={editForm.due_date}
                                                        onChange={(e) => handleEditChange('due_date', e.target.value)}
                                                    />
                                                    {currentDueDate && (
                                                        <p className="text-xs text-muted-foreground mt-1">Current: {currentDueDate || 'Not set'}</p>
                                                    )}
                                                </div>
                                            </div>
                                        </>
                                    );
                                })()}
                            </CardContent>
                        </Card>

                        {/* Sender Information Section */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Sender Information</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {(() => {
                                    // Get current values from invoice for comparison
                                    const currentSenderName = invoice.customer_name || invoice.request_id?.customer_name || invoice.request_id?.sender?.name || invoice.client_id?.company_name || invoice.client_id?.contact_name || '';
                                    const currentSenderPhone = invoice.customer_phone || invoice.request_id?.customer_phone || invoice.request_id?.sender?.phone || invoice.client_id?.contact_phone || '';
                                    const currentSenderEmail = invoice.customer_email || invoice.request_id?.customer_email || invoice.request_id?.sender?.email || invoice.client_id?.contact_email || '';
                                    const currentOriginPlace = invoice.origin_place || invoice.request_id?.origin_place || invoice.request_id?.sender?.address || '';
                                    
                                    return (
                                        <>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <Label>Sender Name</Label>
                                                    <Input
                                                        value={editForm.customer_name}
                                                        onChange={(e) => handleEditChange('customer_name', e.target.value)}
                                                    />
                                                    {currentSenderName && (
                                                        <p className="text-xs text-muted-foreground mt-1">Current: {currentSenderName || 'Not set'}</p>
                                                    )}
                                                </div>
                                                <div>
                                                    <Label>Sender Phone</Label>
                                                    <Input
                                                        value={editForm.customer_phone}
                                                        onChange={(e) => handleEditChange('customer_phone', e.target.value)}
                                                    />
                                                    {currentSenderPhone && (
                                                        <p className="text-xs text-muted-foreground mt-1">Current: {currentSenderPhone || 'Not set'}</p>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                                <div>
                                                    <Label>Sender Email</Label>
                                                    <Input
                                                        type="email"
                                                        value={editForm.customer_email}
                                                        onChange={(e) => handleEditChange('customer_email', e.target.value)}
                                                    />
                                                    {currentSenderEmail && (
                                                        <p className="text-xs text-muted-foreground mt-1">Current: {currentSenderEmail || 'Not set'}</p>
                                                    )}
                                                </div>
                                                <div>
                                                    <Label>Origin Place / Sender Address</Label>
                                                    <Input
                                                        value={editForm.origin_place}
                                                        onChange={(e) => handleEditChange('origin_place', e.target.value)}
                                                    />
                                                    {currentOriginPlace && (
                                                        <p className="text-xs text-muted-foreground mt-1">Current: {currentOriginPlace || 'Not set'}</p>
                                                    )}
                                                </div>
                                            </div>
                                        </>
                                    );
                                })()}
                            </CardContent>
                        </Card>

                        {/* Receiver Information Section */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Receiver Information</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {(() => {
                                    // Get current values from invoice for comparison
                                    const currentReceiverName = invoice.receiver_name || invoice.request_id?.receiver?.name || invoice.client_id?.contact_name || invoice.client_id?.company_name || '';
                                    const currentReceiverPhone = invoice.receiver_phone || invoice.request_id?.receiver?.phone || '';
                                    const currentReceiverAddress = invoice.receiver_address || invoice.request_id?.receiver?.address || '';
                                    const currentReceiverTrn = invoice.customer_trn || invoice.request_id?.customer_trn || '';
                                    
                                    return (
                                        <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <Label>Receiver Name</Label>
                                <Input
                                    value={editForm.receiver_name}
                                    onChange={(e) => handleEditChange('receiver_name', e.target.value)}
                                />
                                                    {currentReceiverName && (
                                                        <p className="text-xs text-muted-foreground mt-1">Current: {currentReceiverName || 'Not set'}</p>
                                                    )}
                            </div>
                            <div>
                                <Label>Receiver Phone</Label>
                                <Input
                                    value={editForm.receiver_phone}
                                    onChange={(e) => handleEditChange('receiver_phone', e.target.value)}
                                />
                                                    {currentReceiverPhone && (
                                                        <p className="text-xs text-muted-foreground mt-1">Current: {currentReceiverPhone || 'Not set'}</p>
                                                    )}
                            </div>
                        </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        <div>
                            <Label>Receiver Address</Label>
                            <Textarea
                                value={editForm.receiver_address}
                                onChange={(e) => handleEditChange('receiver_address', e.target.value)}
                                rows={3}
                            />
                                                    {currentReceiverAddress && (
                                                        <p className="text-xs text-muted-foreground mt-1">Current: {currentReceiverAddress.substring(0, 60)}{currentReceiverAddress.length > 60 ? '...' : ''}</p>
                                                    )}
                        </div>
                                                <div>
                                                    <Label>Receiver TRN</Label>
                                                    <Input
                                                        value={editForm.receiver_trn}
                                                        onChange={(e) => handleEditChange('receiver_trn', e.target.value)}
                                                        placeholder="Optional"
                                                    />
                                                    {currentReceiverTrn !== undefined && (
                                                        <p className="text-xs text-muted-foreground mt-1">Current: {currentReceiverTrn || 'Not set'}</p>
                                                    )}
                                                </div>
                                            </div>
                                        </>
                                    );
                                })()}
                            </CardContent>
                        </Card>

                        {/* Shipment Details Section */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Shipment Details</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {(() => {
                                    // Get current values from invoice for comparison
                                    const currentNumberOfBoxes = invoice.number_of_boxes || invoice.request_id?.verification?.number_of_boxes || invoice.request_id?.shipment?.number_of_boxes || '';
                                    const currentWeightKg = invoice.weight_kg || invoice.request_id?.verification?.total_kg || invoice.request_id?.verification?.chargeable_weight || '';
                                    const currentWeightType = invoice.request_id?.shipment?.weight_type || invoice.request_id?.verification?.weight_type || 'ACTUAL';
                                    const currentBaseRate = invoice.base_rate || (invoice.request_id?.verification?.calculated_rate ? parseDecimal(invoice.request_id.verification.calculated_rate, 2).toString() : '');
                                    const currentServiceCode = invoice.service_code || invoice.request_id?.service_code || '';
                                    
                                    return (
                                        <>
                                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                                <div>
                                                    <Label>Number of Boxes</Label>
                                                    <Input
                                                        type="number"
                                                        step="1"
                                                        min="1"
                                                        value={editForm.number_of_boxes}
                                                        onChange={(e) => handleEditChange('number_of_boxes', e.target.value)}
                                                    />
                                                    {currentNumberOfBoxes !== undefined && currentNumberOfBoxes !== '' && (
                                                        <p className="text-xs text-muted-foreground mt-1">Current: {currentNumberOfBoxes.toString()}</p>
                                                    )}
                                                </div>
                                                <div>
                                                    <Label>Weight (kg)</Label>
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        value={editForm.weight_kg}
                                                        onChange={(e) => handleEditChange('weight_kg', e.target.value)}
                                                    />
                                                    {currentWeightKg !== undefined && currentWeightKg !== '' && (
                                                        <p className="text-xs text-muted-foreground mt-1">Current: {parseDecimal(currentWeightKg, 2).toString()}</p>
                                                    )}
                                                </div>
                                                <div>
                                                    <Label>Weight Type</Label>
                                                    <Select
                                                        value={editForm.weight_type}
                                                        onValueChange={(value) => handleEditChange('weight_type', value)}
                                                    >
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select weight type" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="ACTUAL">ACTUAL</SelectItem>
                                                            <SelectItem value="VOLUMETRIC">VOLUMETRIC</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                    {currentWeightType && (
                                                        <p className="text-xs text-muted-foreground mt-1">Current: {currentWeightType}</p>
                                                    )}
                                                </div>
                                                <div>
                                                    <Label>Rate (AED/kg)</Label>
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        value={editForm.base_rate}
                                                        onChange={(e) => handleEditChange('base_rate', e.target.value)}
                                                    />
                                                    {currentBaseRate && (
                                                        <p className="text-xs text-muted-foreground mt-1">Current: {currentBaseRate}</p>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="mt-4">
                                                <Label>Service Code</Label>
                                                <Input
                                                    value={editForm.service_code}
                                                    onChange={(e) => handleEditChange('service_code', e.target.value)}
                                                    placeholder="e.g., UAE_TO_PH, PH_TO_UAE"
                                                />
                                                {currentServiceCode && (
                                                    <p className="text-xs text-muted-foreground mt-1">Current: {currentServiceCode}</p>
                                                )}
                                            </div>
                                        </>
                                    );
                                })()}
                            </CardContent>
                        </Card>

                        {/* Charges Section */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Charges</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {(() => {
                                    // Get current values from invoice for comparison
                                    const currentAmount = invoice.amount ? parseDecimal(invoice.amount, 2).toString() : '';
                                    const currentPickupCharge = invoice.pickup_charge ? parseDecimal(invoice.pickup_charge, 2).toString() : '';
                                    const currentDeliveryCharge = invoice.delivery_charge ? parseDecimal(invoice.delivery_charge, 2).toString() : '';
                                    let currentInsuranceCharge = '';
                                    if (invoice.insurance_charge !== undefined && invoice.insurance_charge !== null) {
                                        currentInsuranceCharge = parseDecimal(invoice.insurance_charge, 2).toString();
                                    } else if (invoice.line_items && invoice.line_items.length > 0) {
                                        const insuranceItem = invoice.line_items.find((item: any) => 
                                            item.description?.toLowerCase().includes('insurance')
                                        );
                                        if (insuranceItem) {
                                            currentInsuranceCharge = parseDecimal(insuranceItem.total || insuranceItem.unit_price, 2).toString();
                                        }
                                    }
                                    const currentTaxRate = invoice.tax_rate != null ? parseDecimal(invoice.tax_rate, 2).toString() : '';
                                    const currentTaxAmount = invoice.tax_amount ? parseDecimal(invoice.tax_amount, 2).toString() : '';
                                    const currentTotal = invoice.total_amount || invoice.total ? parseDecimal((invoice.total_amount || invoice.total).toString(), 2).toString() : '';
                                    
                                    return (
                                        <>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div>
                                <Label>Shipping Charge (AED)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                                        min="0"
                                    value={editForm.amount}
                                    onChange={(e) => handleEditChange('amount', e.target.value)}
                                />
                                                    {currentAmount !== undefined && (
                                                        <p className="text-xs text-muted-foreground mt-1">Current: {currentAmount || '0.00'}</p>
                                                    )}
                            </div>
                            <div>
                                <Label>Pickup Charge (AED)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                                        min="0"
                                    value={editForm.pickup_charge}
                                    onChange={(e) => handleEditChange('pickup_charge', e.target.value)}
                                />
                                                    {currentPickupCharge !== undefined && (
                                                        <p className="text-xs text-muted-foreground mt-1">Current: {currentPickupCharge || '0.00'}</p>
                                                    )}
                            </div>
                            <div>
                                <Label>Delivery Charge (AED)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                                        min="0"
                                    value={editForm.delivery_charge}
                                    onChange={(e) => handleEditChange('delivery_charge', e.target.value)}
                                />
                                                    {currentDeliveryCharge !== undefined && (
                                                        <p className="text-xs text-muted-foreground mt-1">Current: {currentDeliveryCharge || '0.00'}</p>
                                                    )}
                            </div>
                            <div>
                                <Label>Insurance Charge (AED)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                                        min="0"
                                    value={editForm.insurance_charge}
                                    onChange={(e) => handleEditChange('insurance_charge', e.target.value)}
                                    placeholder="0.00"
                                />
                                                    {currentInsuranceCharge !== undefined && (
                                                        <p className="text-xs text-muted-foreground mt-1">Current: {currentInsuranceCharge || '0.00'}</p>
                                                    )}
                            </div>
                        </div>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                            <div>
                                <Label>Tax Rate (%)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                                        min="0"
                                                        max="100"
                                    value={editForm.tax_rate}
                                    onChange={(e) => handleEditChange('tax_rate', e.target.value)}
                                />
                                                    {currentTaxRate !== undefined && (
                                                        <p className="text-xs text-muted-foreground mt-1">Current: {currentTaxRate || '0'}%</p>
                                                    )}
                            </div>
                                                <div>
                                                    <Label>Tax Amount (AED)</Label>
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        value={editForm.tax_amount}
                                                        onChange={(e) => handleEditChange('tax_amount', e.target.value)}
                                                    />
                                                    {currentTaxAmount !== undefined && (
                                                        <p className="text-xs text-muted-foreground mt-1">Current: {currentTaxAmount || '0.00'}</p>
                                                    )}
                        </div>
                            <div>
                                                    <Label>Total Amount (AED)</Label>
                                <Input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        value={editForm.total}
                                                        onChange={(e) => handleEditChange('total', e.target.value)}
                                />
                                                    {currentTotal !== undefined && (
                                                        <p className="text-xs text-muted-foreground mt-1">Current: {currentTotal || '0.00'}</p>
                                                    )}
                            </div>
                        </div>
                                        </>
                                    );
                                })()}
                            </CardContent>
                        </Card>

                        {/* Agent Information Section */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Agent Information</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {(() => {
                                    // Get current values from invoice for comparison
                                    const currentAgentName = invoice.created_by?.full_name || invoice.request_id?.verification?.agents_name || '';
                                    
                                    return (
                                        <div>
                                            <Label>Agent Name</Label>
                                            <Input
                                                value={editForm.agent_name}
                                                onChange={(e) => handleEditChange('agent_name', e.target.value)}
                                                placeholder="Agent name"
                                            />
                                            {currentAgentName && (
                                                <p className="text-xs text-muted-foreground mt-1">Current: {currentAgentName || 'Not set'}</p>
                                            )}
                                        </div>
                                    );
                                })()}
                            </CardContent>
                        </Card>

                        {/* Notes Section */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Additional Notes</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {(() => {
                                    // Get current values from invoice for comparison
                                    const currentNotes = invoice.notes || '';
                                    
                                    return (
                        <div>
                            <Label>Notes</Label>
                            <Textarea
                                value={editForm.notes}
                                                rows={4}
                                onChange={(e) => handleEditChange('notes', e.target.value)}
                                                placeholder="Additional notes or remarks"
                            />
                                            {currentNotes && (
                                                <p className="text-xs text-muted-foreground mt-1">Current: {currentNotes.substring(0, 100)}{currentNotes.length > 100 ? '...' : ''}</p>
                                            )}
                        </div>
                                    );
                                })()}
                            </CardContent>
                        </Card>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowEditDialog(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSaveEdit}
                            disabled={savingEdit}
                        >
                            {savingEdit ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            )}

            {/* View Request Data Dialog */}
            {showRequestDataDialog && invoice && (
                <Dialog open={showRequestDataDialog} onOpenChange={setShowRequestDataDialog}>
                    <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="text-2xl font-bold">Invoice Request Details</DialogTitle>
                            <DialogDescription>
                                Complete invoice request information from the database
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-6 mt-4">
                            {(() => {
                                // IMPORTANT: This dialog must be backed by BOTH sources:
                                // - invoiceRequests collection (invoiceRequest)
                                // - invoices collection (invoice)
                                const invoiceFromDb = requestDataSources?.invoice || invoice;
                                const invoiceRequestFromDb = requestDataSources?.invoiceRequest;

                                const requestData = invoiceRequestFromDb || invoiceFromDb?.request_id || invoiceFromDb || {};
                                const bookingSnapshot = requestData.booking_snapshot || requestData.booking_data || {};
                                // Verification should prioritize invoiceRequests.verification, then invoice.verification
                                const verification = requestData.verification || invoiceFromDb?.verification || {};
                                const sender = bookingSnapshot.sender || requestData.sender || {};
                                const receiver = bookingSnapshot.receiver || requestData.receiver || verification || {};
                                const items = bookingSnapshot.items || requestData.items || [];

                                const deriveListedCommoditiesFromItems = (srcItems: any[]): string | null => {
                                    if (!Array.isArray(srcItems) || srcItems.length === 0) return null;
                                    const names = srcItems
                                        .map((it: any) => (it?.name || it?.item || it?.description || it?.item_name || '').toString().trim())
                                        .filter(Boolean);
                                    if (names.length === 0) return null;
                                    // De-dupe and keep order
                                    const seen = new Set<string>();
                                    const unique = names.filter(n => (seen.has(n) ? false : (seen.add(n), true)));
                                    return unique.join(', ');
                                };
                                
                                // Helper to safely parse numeric values (handles Decimal128, numbers, strings)
                                const safeParseDecimal = (value: any): number | null => {
                                    if (value === undefined || value === null || value === '') return null;
                                    if (typeof value === 'number') {
                                        // Handle 0 as valid value
                                        return isNaN(value) ? null : value;
                                    }
                                    if (typeof value === 'string') {
                                        const parsed = parseFloat(value);
                                        return isNaN(parsed) ? null : parsed;
                                    }
                                    if (typeof value === 'object' && value.$numberDecimal) {
                                        return parseFloat(value.$numberDecimal);
                                    }
                                    if (typeof value === 'object' && value.toString) {
                                        const parsed = parseFloat(value.toString());
                                        return isNaN(parsed) ? null : parsed;
                                    }
                                    return null;
                                };
                                
                                return (
                                    <>
                                        {loadingRequestDataSources && (
                                            <Card className="border border-muted">
                                                <CardContent className="py-4 text-sm text-muted-foreground">
                                                    Fetching latest data from <span className="font-semibold">invoices</span> and <span className="font-semibold">invoiceRequests</span>...
                                                </CardContent>
                                            </Card>
                                        )}
                                        {!loadingRequestDataSources && !invoiceRequestFromDb && (
                                            <Card className="border border-amber-200 bg-amber-50/50">
                                                <CardContent className="py-4 text-sm text-amber-900">
                                                    InvoiceRequest data was not found/loaded, so this view is falling back to invoice data only. This usually means the invoice is missing a valid <span className="font-mono">request_id</span> (or the invoice-request record doesn’t exist).
                                                </CardContent>
                                            </Card>
                                        )}
                                        {/* Header Information */}
                                        <Card className="border-2 border-primary/20">
                                            <CardHeader className="bg-primary/5">
                                                <CardTitle className="text-xl flex items-center gap-2">
                                                    <FileText className="h-5 w-5" />
                                                    Request Information
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent className="pt-6">
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                    <div>
                                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Request ID</p>
                                                        <p className="text-sm font-mono font-semibold">{invoiceRequestFromDb?._id || requestData._id || 'N/A'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Invoice Number</p>
                                                        <p className="text-sm font-mono font-semibold">{verification.invoice_number || (invoiceFromDb as any)?.invoice_id || (invoiceFromDb as any)?.invoice_number || requestData.invoice_number || 'N/A'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">AWB / Tracking Code</p>
                                                        <p className="text-sm font-mono font-semibold">{verification.tracking_code || (invoiceFromDb as any)?.awb_number || bookingSnapshot.tracking_code || bookingSnapshot.awb || requestData.tracking_code || requestData.awb_number || 'N/A'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Reference Number</p>
                                                        <p className="text-sm font-mono font-semibold">{bookingSnapshot.referenceNumber || 'N/A'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Service Code</p>
                                                        <p className="text-sm font-semibold">{verification.service_code || (invoiceFromDb as any)?.service_code || bookingSnapshot.service_code || requestData.service_code || bookingSnapshot.service || 'N/A'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Status</p>
                                                        <p className="text-sm font-semibold">{requestData.status || bookingSnapshot.status || 'N/A'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Cargo Service</p>
                                                        <p className="text-sm font-semibold">{verification.cargo_service || 'N/A'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Agent Name</p>
                                                        <p className="text-sm font-semibold">{verification.agents_name || sender.agentName || 'N/A'}</p>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>

                                        {/* Sender Information */}
                                        <Card>
                                            <CardHeader className="bg-blue-50">
                                                <CardTitle className="text-lg flex items-center gap-2">
                                                    <span className="text-blue-700">📤</span>
                                                    Sender Information
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent className="pt-6">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div>
                                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Full Name</p>
                                                        <p className="text-sm font-semibold">{sender.fullName || sender.name || requestData.customer_name || (invoiceFromDb as any)?.customer_name || 'N/A'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Phone</p>
                                                        <p className="text-sm">{sender.phone || sender.phoneNumber || sender.contactNo || requestData.customer_phone || (invoiceFromDb as any)?.customer_phone || 'N/A'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Email</p>
                                                        <p className="text-sm">{sender.email || sender.emailAddress || requestData.customer_email || (invoiceFromDb as any)?.customer_email || 'N/A'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Country</p>
                                                        <p className="text-sm">{sender.country || 'N/A'}</p>
                                                    </div>
                                                    <div className="md:col-span-2">
                                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Complete Address</p>
                                                        <p className="text-sm">{sender.completeAddress || sender.address || sender.addressLine1 || bookingSnapshot.origin_place || requestData.origin_place || (invoiceFromDb as any)?.origin_place || 'N/A'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Delivery Option</p>
                                                        <p className="text-sm font-semibold capitalize">{sender.deliveryOption || 'N/A'}</p>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>

                                        {/* Receiver Information */}
                                        <Card>
                                            <CardHeader className="bg-green-50">
                                                <CardTitle className="text-lg flex items-center gap-2">
                                                    <span className="text-green-700">📥</span>
                                                    Receiver Information
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent className="pt-6">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div>
                                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Full Name</p>
                                                        <p className="text-sm font-semibold">{receiver.fullName || receiver.name || verification.receiver_name || requestData.receiver_name || (invoiceFromDb as any)?.receiver_name || 'N/A'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Phone</p>
                                                        <p className="text-sm">{receiver.phone || receiver.phoneNumber || receiver.contactNo || verification.receiver_phone || requestData.receiver_phone || (invoiceFromDb as any)?.receiver_phone || 'N/A'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Email</p>
                                                        <p className="text-sm">{receiver.email || receiver.emailAddress || 'N/A'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Country</p>
                                                        <p className="text-sm">{receiver.country || 'N/A'}</p>
                                                    </div>
                                                    <div className="md:col-span-2">
                                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Complete Address</p>
                                                        <p className="text-sm">{receiver.completeAddress || receiver.address || receiver.addressLine1 || verification.receiver_address || bookingSnapshot.destination_place || requestData.destination_place || requestData.receiver_address || (invoiceFromDb as any)?.receiver_address || 'N/A'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Delivery Option</p>
                                                        <p className="text-sm font-semibold capitalize">{receiver.deliveryOption || 'N/A'}</p>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>

                                        {/* Shipment & Verification Details */}
                                        <Card>
                                            <CardHeader className="bg-purple-50">
                                                <CardTitle className="text-lg flex items-center gap-2">
                                                    <span className="text-purple-700">📦</span>
                                                    Shipment & Verification Details
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent className="pt-6">
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                    <div>
                                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Actual Weight (kg)</p>
                                                        <p className="text-lg font-bold">
                                                            {(() => {
                                                                const val = safeParseDecimal(verification.actual_weight || verification.weight || bookingSnapshot.weight || bookingSnapshot.weight_kg);
                                                                return val !== null ? val.toFixed(2) : 'N/A';
                                                            })()}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Volumetric Weight (kg)</p>
                                                        <p className="text-lg font-bold">
                                                            {(() => {
                                                                const val = safeParseDecimal(verification.volumetric_weight || verification.total_vm);
                                                                return val !== null ? val.toFixed(2) : 'N/A';
                                                            })()}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Chargeable Weight (kg)</p>
                                                        <p className="text-lg font-bold">
                                                            {(() => {
                                                                const val = safeParseDecimal(verification.chargeable_weight);
                                                                return val !== null ? val.toFixed(2) : 'N/A';
                                                            })()}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Total KG</p>
                                                        <p className="text-lg font-bold">
                                                            {(() => {
                                                                const val = safeParseDecimal(verification.total_kg);
                                                                return val !== null ? val.toFixed(2) : 'N/A';
                                                            })()}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Number of Boxes</p>
                                                        <p className="text-lg font-bold">{verification.number_of_boxes || bookingSnapshot.number_of_boxes || 'N/A'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Weight Type</p>
                                                        <p className="text-sm font-semibold">{verification.weight_type || 'N/A'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Classification</p>
                                                        <p className="text-sm font-semibold">{verification.shipment_classification || 'N/A'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Rate Bracket</p>
                                                        <p className="text-sm font-semibold">{verification.rate_bracket || 'N/A'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Amount per kg (AED)</p>
                                                        <p className="text-lg font-bold text-primary">
                                                            {(() => {
                                                                const val = safeParseDecimal(verification.amount || verification.calculated_rate);
                                                                return val !== null ? `AED ${val.toFixed(2)}` : 'N/A';
                                                            })()}
                                                        </p>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>

                                        {/* Insurance Information */}
                                        {(verification.insured || bookingSnapshot.insured || requestData.insured) && (
                                            <Card className="border-2 border-amber-200 bg-amber-50/50">
                                                <CardHeader className="bg-amber-100">
                                                    <CardTitle className="text-lg flex items-center gap-2">
                                                        <span className="text-amber-700">🛡️</span>
                                                        Insurance Information
                                                    </CardTitle>
                                                </CardHeader>
                                                <CardContent className="pt-6">
                                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                                        <div>
                                                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Insured Status</p>
                                                            <p className="text-sm font-semibold text-green-700">✓ Insured</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Declared Value (AED)</p>
                                                            <p className="text-lg font-bold">{verification.declared_value || bookingSnapshot.declaredAmount || requestData.declared_value ? `AED ${parseDecimal(verification.declared_value || bookingSnapshot.declaredAmount || requestData.declared_value, 2).toFixed(2)}` : 'N/A'}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Insurance Charge (1%)</p>
                                                            <p className="text-lg font-bold text-primary">
                                                                {verification.declared_value || bookingSnapshot.declaredAmount ? 
                                                                    `AED ${parseDecimal((verification.declared_value || bookingSnapshot.declaredAmount) * 0.01, 2).toFixed(2)}` : 
                                                                    'N/A'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        )}


                                        {/* Additional Information */}
                                        <Card>
                                            <CardHeader className="bg-gray-50">
                                                <CardTitle className="text-lg">Additional Information</CardTitle>
                                            </CardHeader>
                                            <CardContent className="pt-6">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div>
                                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Verification Notes</p>
                                                        <p className="text-sm">{verification.verification_notes || 'N/A'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Listed Commodities</p>
                                                        <p className="text-sm">
                                                            {verification.listed_commodities ||
                                                                deriveListedCommoditiesFromItems(items) ||
                                                                'N/A'}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Booking Notes</p>
                                                        <p className="text-sm">{bookingSnapshot.notes || 'N/A'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Additional Details</p>
                                                        <p className="text-sm">{bookingSnapshot.additionalDetails || 'N/A'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Verified At</p>
                                                        <p className="text-sm">{verification.verified_at ? new Date(verification.verified_at).toLocaleString() : 'N/A'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Verified By</p>
                                                        <p className="text-sm font-mono">{verification.verified_by_employee_id || 'N/A'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Sender Details Complete</p>
                                                        <p className="text-sm font-semibold">{verification.sender_details_complete ? '✓ Yes' : '✗ No'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Receiver Details Complete</p>
                                                        <p className="text-sm font-semibold">{verification.receiver_details_complete ? '✓ Yes' : '✗ No'}</p>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>

                                    </>
                                );
                            })()}
                        </div>
                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => setShowRequestDataDialog(false)}
                            >
                                Close
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}
