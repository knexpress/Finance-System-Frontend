'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import InvoiceTemplate from "@/components/invoice-template";
import TaxInvoiceTemplate from "@/components/tax-invoice-template";
import { apiClient } from "@/lib/api-client";
import { useParams, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText, Receipt, AlertCircle, Download, Printer } from 'lucide-react';
import { Card } from "@/components/ui/card";
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
    const [showEditDialog, setShowEditDialog] = useState(false);
    const [savingEdit, setSavingEdit] = useState(false);
    const [editForm, setEditForm] = useState({
        receiver_name: '',
        receiver_address: '',
        receiver_phone: '',
        amount: '',
        pickup_charge: '',
        delivery_charge: '',
        tax_rate: '',
        due_date: '',
        notes: ''
    });
    const { toast } = useToast();

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
                if (result.success && result.data) {
                    console.log('✅ Setting invoice data:', result.data);
                    setInvoice(result.data);
                    const invoiceData = result.data as any;
                    setEditForm({
                        receiver_name: invoiceData.receiver_name || '',
                        receiver_address: invoiceData.receiver_address || '',
                        receiver_phone: invoiceData.receiver_phone || '',
                        amount: invoiceData.amount ? parseFloat(invoiceData.amount).toString() : '',
                        pickup_charge: invoiceData.pickup_charge ? parseFloat(invoiceData.pickup_charge).toString() : '',
                        delivery_charge: invoiceData.delivery_charge ? parseFloat(invoiceData.delivery_charge).toString() : '',
                        tax_rate: invoiceData.tax_rate != null ? invoiceData.tax_rate.toString() : '',
                        due_date: invoiceData.due_date ? new Date(invoiceData.due_date).toISOString().split('T')[0] : '',
                        notes: invoiceData.notes || ''
                    });

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

    // Helper function to parse and round decimals (handles Decimal128, numbers, strings)
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
    let pickupCharge = parseDecimal(invoice.pickup_charge || 0, 2);
    let deliveryCharge = 0;
    let insuranceCharge = 0;
    
    const serviceCodeRaw =
        invoice.service_code ||
        invoice.request_id?.service_code ||
        invoice.request_id?.verification?.service_code ||
        '';
    const isPhToUae = isPhToUaeService(serviceCodeRaw);
    
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
    const displayWeight = totalKg; // Use total_kg for display (or weightForCalculation as fallback)
    
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
    
    // Calculate charges from line items (preferred source)
    // CRITICAL: Extract shipping charge from line_items (it's the main charge)
    let shippingChargeFromLineItems = 0;
    if (invoice.line_items && invoice.line_items.length > 0) {
        invoice.line_items.forEach((item: any) => {
            const itemTotal = parseDecimal(item.total || item.unit_price, 2);
            const description = item.description?.toLowerCase() || '';
            if (description.includes('shipping')) {
                // Shipping charge from line_items (preferred source)
                shippingChargeFromLineItems += itemTotal; // Sum all shipping items
            } else if (description.includes('pickup')) {
                pickupCharge += itemTotal;
            } else if (description.includes('delivery')) {
                deliveryCharge += itemTotal; // Sum all delivery charge line items
            } else if (description.includes('insurance')) {
                insuranceCharge += itemTotal; // Sum all insurance charge line items
            }
        });
        
        // Use shipping charge from line_items if found, otherwise use baseAmount
        if (shippingChargeFromLineItems > 0) {
            shippingCharge = parseDecimal(shippingChargeFromLineItems, 2);
        } else {
            // No shipping in line_items, use baseAmount as fallback
            shippingCharge = baseAmount;
        }
        
        pickupCharge = parseDecimal(pickupCharge, 2);
        deliveryCharge = parseDecimal(deliveryCharge, 2);
        insuranceCharge = parseDecimal(insuranceCharge, 2);
    } else {
        // Fallback to invoice.delivery_charge if no line items
        deliveryCharge = deliveryChargeFromInvoice;
        // Try to get insurance charge from invoice or request
        const request = invoice.request_id;
        if (request) {
            const insured = request.insured || request.booking?.insured || request.sender?.insured || false;
            const declaredAmount = request.declaredAmount || request.declared_amount || 
                                 request.booking?.declaredAmount || request.booking?.declared_amount ||
                                 request.sender?.declaredAmount || request.sender?.declared_amount || 0;
            if (insured === true && declaredAmount) {
                let parsedDeclaredAmount = 0;
                if (typeof declaredAmount === 'object' && declaredAmount.$numberDecimal) {
                    parsedDeclaredAmount = parseFloat(declaredAmount.$numberDecimal);
                } else if (typeof declaredAmount === 'number') {
                    parsedDeclaredAmount = declaredAmount;
                } else {
                    parsedDeclaredAmount = parseFloat(declaredAmount.toString());
                }
                insuranceCharge = parseDecimal(parsedDeclaredAmount * 0.01, 2);
            }
        }
    }
    
    // For PH TO UAE tax invoices: use delivery_charge from DB as-is (backend-calculated)
    if (isPhToUae && invoiceType === 'tax') {
        deliveryCharge = deliveryChargeFromInvoice;
    }

    // Calculate subtotal first
    const subtotal = parseDecimal(shippingCharge + pickupCharge + deliveryCharge + insuranceCharge, 2); // Shipping + Pickup + Delivery + Insurance
    
    // Check if shipment is flowmic/personal for UAE_TO_PH services
    const isUaeToPh = isUaeToPhService(serviceCodeRaw);
    const isFlowmicOrPersonal = (() => {
      if (!isUaeToPh) return false;
      const norm = (v: any) => (v || '').toString().trim().toUpperCase();
      
      // Check box-level classification
      const boxes = invoice.request_id?.verification?.boxes || [];
      if (Array.isArray(boxes) && boxes.length > 0) {
        const boxHit = boxes.some((box: any) => {
          const sc = norm(box.shipment_classification);
          const c = norm(box.classification);
          return sc === 'PERSONAL' || sc === 'FLOWMIC' || c === 'PERSONAL' || c === 'FLOWMIC';
        });
        if (boxHit) return true;
      }
      
      // Check top-level shipment classification
      const topClass = norm(
        invoice.request_id?.verification?.shipment_classification ||
        invoice.request_id?.shipment?.classification
      );
      return topClass === 'PERSONAL' || topClass === 'FLOWMIC';
    })();
    
    // PH TO UAE: Check if backend has stored both totals (COD and Tax Invoice)
    // Priority: Use stored totals from backend if available, otherwise recalculate
    const totalAmountCod = (invoice as any).total_amount_cod || (invoice as any).totalAmountCod;
    const totalAmountTaxInvoice = (invoice as any).total_amount_tax_invoice || (invoice as any).totalAmountTaxInvoice;
    const deliveryBaseAmount = parseDecimal((invoice as any).delivery_base_amount || 0, 2); // Base delivery amount for PH TO UAE
    
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
      
      if (isFlowmicOrPersonal && isUaeToPh) {
        // Flowmic/Personal UAE_TO_PH: 5% VAT included in subtotal (total = subtotal, VAT shown for display)
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
          // Recalculate: For COD invoice when weight < 15kg: Use delivery_base_amount directly
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
      }
      console.log('✅ Using database tax/total values:', {
        taxRate,
        taxAmount,
        total,
        totalAmountCod,
        totalAmountTaxInvoice,
        shippingCharge,
        deliveryCharge,
        subtotal
      });
    }

    // Get AWB number - check direct field first, then request_id
    const awbNumber = invoice.awb_number || invoice.request_id?.awb_number || invoice.request_id?.request_id || 'N/A';
    
    // Get receiver info - use direct fields first, then fallback to request_id
    const receiverName = invoice.receiver_name || invoice.request_id?.receiver?.name || invoice.client_id?.contact_name || invoice.client_id?.company_name || 'N/A';
    const receiverAddress = invoice.receiver_address || invoice.request_id?.receiver?.address || 'Address not provided';
    const receiverPhone = invoice.receiver_phone || invoice.request_id?.receiver?.phone || '+971XXXXXXXXX';
    
    // Parse receiver address to extract city/emirate
    const addressParts = receiverAddress.split(',').map((p: string) => p.trim());
    const emirate = addressParts.length > 1 ? addressParts[addressParts.length - 2] : (invoice.request_id?.receiver?.city || 'Dubai');
    
    // Get shipment details - use direct fields first
    // Note: weight and numberOfBoxes are already defined above for tax invoice recalculation
    const volume = parseDecimal(invoice.volume_cbm || invoice.request_id?.shipment?.volume, 2);
    // displayWeight is already set to totalKg above (from verification.total_kg)
    // This is what Operations entered manually and should be displayed in invoice
    const weightType = invoice.request_id?.shipment?.weight_type || 
                      invoice.request_id?.verification?.weight_type || 
                      'ACTUAL';
    
    // Calculate rate from shipping charge and weight if not provided
    // Priority: base_rate from invoice > calculated_rate from verification > calculated from shippingCharge/weight > default
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
            shippingCharge: shippingCharge,
            pickupCharge: pickupCharge > 0 ? pickupCharge : undefined,
            // For PH TO UAE COD invoice when weight < 15kg: Use delivery_base_amount
            // For other cases: Use deliveryCharge as calculated
            deliveryCharge: (isPhToUae && taxRate === 0 && totalKg < 15 && deliveryBaseAmount > 0) 
                ? deliveryBaseAmount 
                : deliveryCharge,
            insuranceCharge: insuranceCharge > 0 ? insuranceCharge : undefined,
            // For PH TO UAE normal invoice: Subtotal should be shipping + delivery (573)
            // For PH TO UAE tax invoice: Subtotal is delivery only
            subtotal: (isPhToUae && invoiceType === 'tax') 
                ? parseDecimal(deliveryCharge, 2)  // Tax invoice: delivery only
                : parseDecimal(subtotal, 2),  // Normal invoice: shipping + delivery (573)
            taxRate: taxRate,
            taxAmount: taxAmount,
            // For PH TO UAE: Use invoiceType to determine which total to use
            // - Normal (COD) invoice: Use totalAmountCod (573)
            // - Tax invoice: Use totalAmountTaxInvoice (38.85)
            // For other invoices: Use calculated total
            total: (() => {
                // For PH TO UAE invoices, use invoiceType to determine which total to display
                if (isPhToUae) {
                    if (invoiceType === 'normal' && totalAmountCod && totalAmountCod > 0) {
                        // Normal (COD) invoice: Use totalAmountCod
                        const codTotal = parseDecimal(totalAmountCod, 2);
                        console.log('✅ Using totalAmountCod for Normal (COD) invoice:', {
                            invoiceType,
                            totalAmountCod,
                            codTotal
                        });
                        return codTotal;
                    } else if (invoiceType === 'tax' && totalAmountTaxInvoice && totalAmountTaxInvoice > 0) {
                        // Tax invoice: Use totalAmountTaxInvoice
                        const taxTotal = parseDecimal(totalAmountTaxInvoice, 2);
                        console.log('✅ Using totalAmountTaxInvoice for Tax invoice:', {
                            invoiceType,
                            totalAmountTaxInvoice,
                            taxTotal
                        });
                        return taxTotal;
                    }
                }
                // Use calculated total for other cases
                console.log('⚠️ Using calculated total:', {
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
        boxNumbers: invoice.notes || 'No remarks',
        agent: invoice.created_by?.full_name || 'SYSTEM',
        items: invoice.request_id?.verification?.listed_commodities || invoice.notes || 'No remarks'
        },
        termsAndConditions: 'Cash Upon Receipt of Goods',
        qrCode: qrCodeData ? {
            url: qrCodeData.qr_url || '',
            code: qrCodeData.qr_code || ''
        } : undefined,
        isUaeToPh: isUaeToPh,
        isPhToUae: isPhToUae,
        serviceCode: serviceCodeRaw
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

    const handleEditChange = (field: string, value: string) => {
        setEditForm((prev) => ({ ...prev, [field]: value }));
    };

    const handleSaveEdit = async () => {
        const invoiceIdentifier = invoice?._id || invoiceId;
        if (!invoiceIdentifier) return;
        setSavingEdit(true);
        try {
            const payload: any = {
                receiver_name: editForm.receiver_name.trim(),
                receiver_address: editForm.receiver_address.trim(),
                receiver_phone: editForm.receiver_phone.trim(),
                notes: editForm.notes?.trim() || ''
            };

            if (editForm.amount) payload.amount = parseFloat(editForm.amount);
            if (editForm.pickup_charge) payload.pickup_charge = parseFloat(editForm.pickup_charge);
            if (editForm.delivery_charge) payload.delivery_charge = parseFloat(editForm.delivery_charge);
            if (editForm.tax_rate) payload.tax_rate = parseFloat(editForm.tax_rate);
            if (editForm.due_date) payload.due_date = new Date(editForm.due_date).toISOString();
            
            // Recalculate subtotal and total when charges change
            const shippingCharge = editForm.amount ? parseFloat(editForm.amount) : 0;
            const pickupCharge = editForm.pickup_charge ? parseFloat(editForm.pickup_charge) : 0;
            const deliveryCharge = editForm.delivery_charge ? parseFloat(editForm.delivery_charge) : 0;
            const taxRate = editForm.tax_rate ? parseFloat(editForm.tax_rate) : 0;
            
            const subtotal = shippingCharge + pickupCharge + deliveryCharge;
            const taxAmount = deliveryCharge > 0 && taxRate > 0 ? (deliveryCharge * taxRate) / 100 : 0;
            const total = subtotal + taxAmount;
            
            // Update calculated values
            payload.subtotal = subtotal;
            payload.tax_amount = taxAmount;
            payload.total = total;

            const result = await apiClient.updateInvoiceUnified(invoiceIdentifier, payload);
            if (result.success && result.data) {
                setInvoice(result.data);
                toast({
                    title: 'Invoice updated',
                    description: 'Changes have been saved successfully.',
                });
                setShowEditDialog(false);
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Update failed',
                    description: result.error || 'Unable to update invoice.',
                });
            }
        } catch (err: any) {
            toast({
                variant: 'destructive',
                title: 'Update failed',
                description: err.message || 'Unable to update invoice.',
            });
        } finally {
            setSavingEdit(false);
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
                        <Button
                            variant="outline"
                            onClick={() => setShowEditDialog(true)}
                        >
                            Edit Invoice
                        </Button>
                        <Button
                            onClick={handleDownloadPDF}
                        >
                            <Download className="h-4 w-4 mr-2" />
                            Download PDF
                        </Button>
                    </div>
                </div>
            </Card>

            {/* Invoice Template */}
            <div id="invoice-content">
                {invoiceData && invoiceData.invoiceNumber ? (
                    invoiceType === 'tax' ? (
                        <TaxInvoiceTemplate data={taxInvoiceData} />
                    ) : (
                        <InvoiceTemplate data={invoiceData} />
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

            <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Invoice</DialogTitle>
                        <DialogDescription>Adjust receiver and charge details. All changes are tracked.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <Label>Receiver Name</Label>
                                <Input
                                    value={editForm.receiver_name}
                                    onChange={(e) => handleEditChange('receiver_name', e.target.value)}
                                />
                            </div>
                            <div>
                                <Label>Receiver Phone</Label>
                                <Input
                                    value={editForm.receiver_phone}
                                    onChange={(e) => handleEditChange('receiver_phone', e.target.value)}
                                />
                            </div>
                        </div>
                        <div>
                            <Label>Receiver Address</Label>
                            <Textarea
                                value={editForm.receiver_address}
                                onChange={(e) => handleEditChange('receiver_address', e.target.value)}
                                rows={3}
                            />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div>
                                <Label>Shipping Charge (AED)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={editForm.amount}
                                    onChange={(e) => handleEditChange('amount', e.target.value)}
                                />
                            </div>
                            <div>
                                <Label>Pickup Charge (AED)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={editForm.pickup_charge}
                                    onChange={(e) => handleEditChange('pickup_charge', e.target.value)}
                                />
                            </div>
                            <div>
                                <Label>Delivery Charge (AED)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={editForm.delivery_charge}
                                    onChange={(e) => handleEditChange('delivery_charge', e.target.value)}
                                />
                            </div>
                            <div>
                                <Label>Tax Rate (%)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={editForm.tax_rate}
                                    onChange={(e) => handleEditChange('tax_rate', e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <Label>Due Date</Label>
                                <Input
                                    type="date"
                                    value={editForm.due_date}
                                    onChange={(e) => handleEditChange('due_date', e.target.value)}
                                />
                            </div>
                        </div>
                        <div>
                            <Label>Notes</Label>
                            <Textarea
                                value={editForm.notes}
                                rows={3}
                                onChange={(e) => handleEditChange('notes', e.target.value)}
                            />
                        </div>
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
        </div>
    );
}
