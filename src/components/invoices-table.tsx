'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Department } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Eye, TrendingUp, FileSpreadsheet, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import * as XLSX from 'xlsx';
import { apiClient } from '@/lib/api-client';
import { secureLog } from '@/lib/secure-logger';

interface InvoicesTableProps {
    invoices: any[];
    department: Department | null;
    onRemit?: (invoiceId: string) => void;
    onCancel?: (invoiceId: string) => void;
}

export default function InvoicesTable({ invoices, department, onRemit, onCancel }: InvoicesTableProps) {
    const { toast } = useToast();
    const [isExporting, setIsExporting] = useState(false);

    // Ensure invoices is always an array
    const safeInvoices = Array.isArray(invoices) ? invoices : [];

    // Download invoices as Excel
    // IMPORTANT: Enrich export data with invoicerequests collection (invoiceRequests) for:
    // - sender/receiver deliveryOption
    // - agent name
    const getExportFilename = () => {
        const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
        return `Invoices-${timestamp}.xlsx`;
    };

    const handleDownloadExcel = async (invoiceList: any[], preferredFilename?: string, fileHandle?: any) => {
        if (!invoiceList || invoiceList.length === 0) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'No invoices available to export.',
            });
            return;
        }

        try {
            // 1) Collect invoiceRequestIds for batch enrichment
            const extractObjectIdFromNotes = (notes: any): string | null => {
                const txt = (notes || '').toString();
                const m = txt.match(/\b[a-fA-F0-9]{24}\b/);
                return m ? m[0] : null;
            };

            const extractRequestId = (inv: any): string | null => {
                const raw =
                    inv?.request_id?._id ||
                    (typeof inv?.request_id === 'string' ? inv.request_id : null) ||
                    inv?.invoice_request_id ||
                    inv?.invoiceRequestId ||
                    inv?.requestId ||
                    extractObjectIdFromNotes(inv?.notes);
                return raw != null && raw !== '' ? String(raw) : null;
            };

            const requestIds = Array.from(
                new Set(
                    invoiceList
                        .map((inv: any) => extractRequestId(inv))
                        .filter((v): v is string => Boolean(v))
                )
            );

            // Debug: show extraction results for troubleshooting local "still N/A"
            if (process.env.NODE_ENV === 'development') {
                const sample = invoiceList?.[0];
                secureLog.debug('Excel Export - RequestId Extraction', {
                    invoicesCount: invoiceList?.length || 0,
                    requestIdsCount: requestIds.length,
                    firstInvoice: sample ? {
                        invoice_id: sample.invoice_id,
                        request_id: sample.request_id,
                        invoice_request_id: sample.invoice_request_id,
                        notes: sample.notes,
                        idFromNotes: extractObjectIdFromNotes(sample.notes),
                    } : null,
                    requestIds: requestIds.slice(0, 10),
                    note: 'If requestIdsCount is 0, export cannot enrich delivery options/agent from invoiceRequests.'
                });
            }

            if (requestIds.length === 0) {
                toast({
                    variant: 'destructive',
                    title: 'Excel Export: Missing request IDs',
                    description: 'No invoiceRequest IDs were found (request_id / invoice_request_id / notes). Cannot enrich Delivery Options / Agent Name.',
                });
            }

            const invoiceRequestById = new Map<string, any>();

            // Seed from populated request_id on each invoice (production list API often embeds this; no extra fetch).
            invoiceList.forEach((inv: any) => {
                const emb = inv?.request_id;
                if (emb && typeof emb === 'object' && !Array.isArray(emb)) {
                    const hasDetail =
                        emb.verification ||
                        emb.booking_snapshot ||
                        emb.booking_data ||
                        emb.sender_delivery_option != null ||
                        emb.receiver_delivery_option != null;
                    const k =
                        emb._id != null
                            ? String(emb._id)
                            : extractRequestId(inv);
                    if (hasDetail && k) {
                        invoiceRequestById.set(k, emb);
                    }
                }
            });

            if (requestIds.length > 0) {
                const idsToFetch = requestIds.filter((id) => !invoiceRequestById.has(id));
                if (idsToFetch.length > 0) {
                    toast({
                        title: 'Preparing Excel…',
                        description: `Fetching ${idsToFetch.length} invoice request(s) for export.`,
                    });

                    const bulk = await apiClient.bulkInvoiceRequestDetails(idsToFetch);
                    idsToFetch.forEach((id) => {
                        const row = bulk[id];
                        if (row?._id) invoiceRequestById.set(String(row._id), row);
                        else if (row && typeof row === 'object') invoiceRequestById.set(id, row);
                    });

                    const missing = idsToFetch.filter((id) => !invoiceRequestById.has(id));
                    const DIRECT_CHUNK = 5;
                    const DIRECT_PAUSE_MS = 150;
                    for (let i = 0; i < missing.length; i += DIRECT_CHUNK) {
                        const slice = missing.slice(i, i + DIRECT_CHUNK);
                        const results = await Promise.all(
                            slice.map(async (id) => {
                                try {
                                    const res = await apiClient.getInvoiceRequestDetails(id, false, {
                                        preferDirect: true,
                                    });
                                    return (res as any)?.success ? (res as any).data : null;
                                } catch {
                                    return null;
                                }
                            })
                        );
                        results.forEach((req) => {
                            if (req?._id) invoiceRequestById.set(String(req._id), req);
                        });
                        if (i + DIRECT_CHUNK < missing.length) {
                            await new Promise((r) => setTimeout(r, DIRECT_PAUSE_MS));
                        }
                    }
                }

                if (process.env.NODE_ENV === 'development') {
                    secureLog.debug('Excel Export - invoiceRequests fetched', {
                        requested: requestIds.length,
                        seededFromInvoice: invoiceList.filter(
                            (inv: any) =>
                                inv?.request_id &&
                                typeof inv.request_id === 'object' &&
                                inv.request_id._id
                        ).length,
                        loaded: invoiceRequestById.size,
                        note: 'Seeded from embedded request_id; bulk proxy fills gaps.',
                    });
                }
            }

            const parseAmount = (value: any): number => {
                if (value === undefined || value === null || value === '') return 0;
                if (typeof value === 'object' && value && '$numberDecimal' in value) {
                    return parseFloat(String((value as { $numberDecimal: string }).$numberDecimal)) || 0;
                }
                const n = typeof value === 'number' ? value : parseFloat(String(value));
                return Number.isFinite(n) ? n : 0;
            };

            const safeFixed = (value: any, digits: number): string => {
                const n = parseAmount(value);
                return Number.isFinite(n) ? n.toFixed(digits) : (0).toFixed(digits);
            };

            // After SheetJS builds cells, force text format for "N/A" so Excel does not treat it like the #N/A error.
            const markNaCellsAsText = (sheet: XLSX.WorkSheet) => {
                const ref = sheet['!ref'];
                if (!ref) return;
                const range = XLSX.utils.decode_range(ref);
                for (let R = range.s.r; R <= range.e.r; R += 1) {
                    for (let C = range.s.c; C <= range.e.c; C += 1) {
                        const addr = XLSX.utils.encode_cell({ r: R, c: C });
                        const cell = sheet[addr];
                        if (!cell || cell.v === undefined || cell.v === null) continue;
                        const v = cell.v;
                        if (v === 'N/A' || v === 'NaN' || (typeof v === 'string' && v.trim() === 'NaN')) {
                            cell.t = 's';
                            cell.z = '@';
                        }
                    }
                }
            };

            // Prepare Excel data
            const excelData: any[] = [];

            // Header row
            excelData.push([
                'Invoice ID',
                'AWB Number',
                'Batch Number',
                'Client',
                'Receiver Name',
                'Receiver Address',
                'Receiver Phone',
                'Service Code',
                'Weight (KG)',
                'Number of Boxes',
                'Volume (CBM)',
                'Shipping Charge (AED)',
                'Pickup Charge (AED)',
                'Delivery Charge (AED)',
                'Insurance Charge (AED)',
                'Subtotal (AED)',
                'Tax Rate (%)',
                'Tax Amount (AED)',
                'Total Amount (AED)',
                'Total Amount COD (AED)',
                'Total Amount Tax Invoice (AED)',
                'Sender Delivery Option',
                'Receiver Delivery Option',
                'Agent Name',
                'Sender Address',
                'ITEMS',
                'Rate',
                'Issue Date',
                'Status',
                'Notes'
            ]);

            // Data rows
            invoiceList.forEach((invoice) => {
                // Determine service type
                const serviceCode = (invoice.service_code || '').toString().toUpperCase().replace(/[\s-]+/g, '_');
                const isPhToUae = serviceCode === 'PH_TO_UAE' || serviceCode.startsWith('PH_TO_UAE_');
                const isTaxInvoice = invoice.tax_rate === 5;

                // Calculate amounts
                let displayAmount = 0;
                const totalAmountCod = (invoice as any).total_amount_cod || (invoice as any).totalAmountCod;
                const totalAmountTaxInvoice = (invoice as any).total_amount_tax_invoice || (invoice as any).totalAmountTaxInvoice;

                if (isPhToUae) {
                    if (isTaxInvoice && totalAmountTaxInvoice) {
                        displayAmount = parseAmount(totalAmountTaxInvoice);
                    } else if (!isTaxInvoice && totalAmountCod) {
                        displayAmount = parseAmount(totalAmountCod);
                    } else {
                        displayAmount = parseAmount(invoice.total_amount);
                    }
                } else {
                    displayAmount = parseAmount(invoice.total_amount);
                }

                const shippingCharge = parseAmount(invoice.amount);
                const pickupCharge = parseAmount(invoice.pickup_charge);
                const deliveryCharge = parseAmount(invoice.delivery_charge);
                const insuranceCharge =
                    parseAmount(invoice.insurance_charge) ||
                    parseAmount(
                        invoice.line_items?.find((item: any) =>
                            item.description?.toLowerCase().includes('insurance')
                        )?.total
                    );
                const subtotal = parseAmount(invoice.subtotal);
                const taxRate = parseAmount(invoice.tax_rate);
                const taxAmount = parseAmount(invoice.tax_amount);

                // Format date
                const issueDate = invoice.issue_date 
                    ? new Date(invoice.issue_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                    : 'N/A';

                // Enrich: fetched map + embedded populated request_id (deployed APIs often omit separate details call).
                const invoiceRequestIdStr = extractRequestId(invoice);
                const embeddedReq =
                    invoice?.request_id && typeof invoice.request_id === 'object' && !Array.isArray(invoice.request_id)
                        ? invoice.request_id
                        : null;
                const fromMap = invoiceRequestIdStr ? invoiceRequestById.get(invoiceRequestIdStr) : undefined;
                const invoiceReq = fromMap || embeddedReq || null;
                const booking = invoiceReq?.booking_snapshot || invoiceReq?.booking_data || {};
                const verification =
                    invoiceReq?.verification ||
                    embeddedReq?.verification ||
                    invoice?.request_id?.verification ||
                    {};
                const senderDeliveryOption =
                    booking?.sender?.deliveryOption ||
                    booking?.sender?.delivery_option ||
                    invoiceReq?.sender_delivery_option ||
                    invoice?.sender_delivery_option ||
                    embeddedReq?.sender_delivery_option ||
                    'N/A';
                const receiverDeliveryOption =
                    booking?.receiver?.deliveryOption ||
                    booking?.receiver?.delivery_option ||
                    invoiceReq?.receiver_delivery_option ||
                    invoice?.receiver_delivery_option ||
                    embeddedReq?.receiver_delivery_option ||
                    'N/A';
                const agentName =
                    verification?.agents_name ||
                    booking?.sender?.agentName ||
                    booking?.sender?.agent_name ||
                    invoice?.verification?.agents_name ||
                    'N/A';

                // Extract Sender Address
                const senderAddress =
                    booking?.sender?.completeAddress ||
                    booking?.sender?.complete_address ||
                    embeddedReq?.booking_snapshot?.sender?.completeAddress ||
                    'N/A';
                
                // Extract and format ITEMS from booking_data.items array
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
                const itemsArray =
                    booking?.items ||
                    embeddedReq?.booking_snapshot?.items ||
                    embeddedReq?.booking_data?.items ||
                    [];
                const itemsFormatted = deriveListedCommoditiesFromItems(itemsArray) || 'N/A';
                
                // Extract Rate from verification.calculated_rate
                // Match previous `calculated_rate || 'N/A'` (0 counts as missing) but never emit NaN.
                const rawRate = verification?.calculated_rate;
                const rateNum = parseAmount(rawRate);
                const rate =
                    rawRate !== undefined &&
                    rawRate !== null &&
                    rawRate !== '' &&
                    Number.isFinite(rateNum) &&
                    rateNum !== 0
                        ? rateNum
                        : 'N/A';
                
                // Debug: Log the extracted values
                if (invoiceList.indexOf(invoice) === 0) {
                    secureLog.debug('Excel Export - First Invoice Sample', {
                        invoice_id: invoice.invoice_id,
                        hasRequestId: !!invoiceRequestIdStr,
                        senderDeliveryOption,
                        receiverDeliveryOption,
                        agentName,
                        senderAddress,
                        itemsFormatted,
                        rate,
                        invoiceRequestId: invoiceRequestIdStr,
                        invoiceRequestLoaded: !!invoiceReq,
                        usedEmbeddedRequestId: !!embeddedReq && !fromMap,
                    });
                }

                excelData.push([
                    invoice.invoice_id || 'N/A',
                    invoice.awb_number || 'N/A',
                    invoice.batch_number || 'N/A',
                    invoice.client_id?.company_name || 'Unknown',
                    invoice.receiver_name || 'N/A',
                    invoice.receiver_address || 'N/A',
                    invoice.receiver_phone || 'N/A',
                    invoice.service_code || 'N/A',
                    verification?.chargeable_weight ||
                    verification?.total_kg ||
                    verification?.weight ||
                    invoice.request_id?.verification?.chargeable_weight ||
                    invoice.request_id?.verification?.total_kg ||
                    invoice.request_id?.verification?.weight ||
                    'N/A',
                    verification?.number_of_boxes || invoice.request_id?.verification?.number_of_boxes || 'N/A',
                    invoice.volume_cbm || invoice.request_id?.shipment?.volume || 'N/A',
                    safeFixed(shippingCharge, 2),
                    safeFixed(pickupCharge, 2),
                    safeFixed(deliveryCharge, 2),
                    safeFixed(insuranceCharge, 2),
                    safeFixed(subtotal, 2),
                    safeFixed(taxRate, 2),
                    safeFixed(taxAmount, 2),
                    safeFixed(displayAmount, 2),
                    totalAmountCod ? safeFixed(totalAmountCod, 2) : '',
                    totalAmountTaxInvoice ? safeFixed(totalAmountTaxInvoice, 2) : '',
                    senderDeliveryOption,
                    receiverDeliveryOption,
                    agentName,
                    senderAddress,
                    itemsFormatted,
                    typeof rate === 'number' ? safeFixed(rate, 2) : rate,
                    issueDate,
                    invoice.status || 'N/A',
                    invoice.notes || ''
                ]);
            });

            // Create workbook and worksheet
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(excelData);
            markNaCellsAsText(ws);

            // Set column widths
            const colWidths = [
                { wch: 15 }, // Invoice ID
                { wch: 15 }, // AWB
                { wch: 12 }, // Batch
                { wch: 20 }, // Client
                { wch: 20 }, // Receiver Name
                { wch: 30 }, // Receiver Address
                { wch: 15 }, // Receiver Phone
                { wch: 15 }, // Service Code
                { wch: 12 }, // Weight
                { wch: 12 }, // Boxes
                { wch: 12 }, // Volume
                { wch: 18 }, // Shipping Charge
                { wch: 18 }, // Pickup Charge
                { wch: 18 }, // Delivery Charge
                { wch: 18 }, // Insurance Charge
                { wch: 15 }, // Subtotal
                { wch: 12 }, // Tax Rate
                { wch: 15 }, // Tax Amount
                { wch: 18 }, // Total Amount
                { wch: 20 }, // Total Amount COD
                { wch: 25 }, // Total Amount Tax Invoice
                { wch: 22 }, // Sender Delivery Option
                { wch: 22 }, // Receiver Delivery Option
                { wch: 15 }, // Agent Name
                { wch: 30 }, // Sender Address
                { wch: 40 }, // ITEMS
                { wch: 12 }, // Rate
                { wch: 15 }, // Issue Date
                { wch: 15 }, // Status
                { wch: 30 }  // Notes
            ];
            ws['!cols'] = colWidths;

            // Add worksheet to workbook
            XLSX.utils.book_append_sheet(wb, ws, 'Invoices');

            const filename = preferredFilename || getExportFilename();

            if (fileHandle) {
                try {
                    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                    const writable = await fileHandle.createWritable();
                    await writable.write(buffer);
                    await writable.close();
                } catch (error: any) {
                    if (error?.name !== 'AbortError') {
                        secureLog.warn('File handle write failed, falling back to download', error);
                    }
                    // Fallback for browsers/contexts that block File System Access API
                    XLSX.writeFile(wb, filename);
                }
            } else {
                XLSX.writeFile(wb, filename);
            }

            toast({
                title: 'Excel Export Successful',
                description: `${invoiceList.length} invoice(s) exported to ${filename}`,
            });
        } catch (error) {
            secureLog.error('Error generating Excel', error);
            toast({
                variant: 'destructive',
                title: 'Export Failed',
                description: 'Unable to generate Excel file. Please try again.',
            });
        }
    };

    const handleDownloadAllInvoices = async () => {
        if (isExporting) {
            return;
        }
        setIsExporting(true);

        const filename = getExportFilename();
        let fileHandle: any = null;
        if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
            try {
                fileHandle = await (window as any).showSaveFilePicker({
                    suggestedName: filename,
                    types: [
                        {
                            description: 'Excel Workbook',
                            accept: {
                                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
                            }
                        }
                    ]
                });
            } catch (error: any) {
                setIsExporting(false);
                if (error?.name !== 'AbortError') {
                    secureLog.error('Error selecting export file', error);
                    toast({
                        variant: 'destructive',
                        title: 'Export Failed',
                        description: 'Unable to select a file for export.',
                    });
                }
                return;
            }
        }

        try {
            toast({
                title: 'Preparing Excel…',
                description: 'Fetching all invoices from the database.',
            });

            const result = await apiClient.getAllInvoicesUnified(undefined, false);
            if (!result.success || !result.data || !Array.isArray(result.data)) {
                toast({
                    variant: 'destructive',
                    title: 'Export Failed',
                    description: 'Unable to load invoices for export.',
                });
                setIsExporting(false);
                return;
            }

            await handleDownloadExcel(result.data, filename, fileHandle);
            setIsExporting(false);
        } catch (error) {
            secureLog.error('Error fetching invoices for export', error);
            toast({
                variant: 'destructive',
                title: 'Export Failed',
                description: 'Unable to load invoices for export.',
            });
            setIsExporting(false);
        }
    };

    return (
        <div className="space-y-8">
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Invoices</CardTitle>
                            <CardDescription>A list of all generated invoices.</CardDescription>
                        </div>
                        <Button
                            variant="outline"
                            onClick={handleDownloadAllInvoices}
                            className="ml-auto"
                            disabled={isExporting}
                        >
                            <FileSpreadsheet className="h-4 w-4 mr-2" />
                            {isExporting ? 'Preparing…' : 'Download Excel'}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="relative">
                        {/* Table Container */}
                        <div
                            className="flex overflow-x-hidden overflow-y-auto scrollbar-thin"
                            style={{
                                maxHeight: 'calc(100vh - 400px)',
                            }}
                        >
                        <Table style={{ minWidth: 'max-content', width: '100%' }}>
                        <TableHeader>
                        <TableRow>
                            <TableHead>Invoice ID</TableHead>
                            <TableHead>AWB</TableHead>
                            <TableHead>Batch No</TableHead>
                            <TableHead>Client</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Service Code</TableHead>
                            <TableHead>Weight (KG)</TableHead>
                            <TableHead>No. of Boxes</TableHead>
                            <TableHead>Volume (CBM)</TableHead>
                            <TableHead>Receiver</TableHead>
                            <TableHead>Receiver Address</TableHead>
                            <TableHead>Receiver Phone</TableHead>
                            <TableHead>Issue Date</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                        </TableHeader>
                        <TableBody>
                        {safeInvoices.map((invoice) => {
                            // Debug: Log batch_number for first invoice to verify data structure
                            if (safeInvoices.indexOf(invoice) === 0) {
                                secureLog.debug('Invoice Batch Number', {
                                    invoice_id: invoice.invoice_id,
                                    batch_number: invoice.batch_number,
                                    batch_number_type: typeof invoice.batch_number,
                                    has_batch_number: 'batch_number' in invoice,
                                    invoice_keys: Object.keys(invoice).filter(k => k.toLowerCase().includes('batch')),
                                    full_invoice: invoice
                                });
                            }
                            
                            // Batch number fetched directly from invoices collection batch_number field
                            // Ensure we're reading from the invoice object directly, not from nested objects
                            // Handle empty strings, null, undefined - only use if it's a valid non-empty string
                            const batchNumber = invoice.batch_number && String(invoice.batch_number).trim() 
                                ? String(invoice.batch_number).trim() 
                                : null;
                            
                            return (
                            <TableRow key={invoice._id}>
                            <TableCell className="font-mono text-xs">{invoice.invoice_id || 'N/A'}</TableCell>
                            <TableCell className="font-mono text-xs">{invoice.awb_number || 'N/A'}</TableCell>
                            {/* Batch number fetched directly from invoices collection batch_number field */}
                            <TableCell className="font-mono text-xs">
                                {batchNumber || 'N/A'}
                            </TableCell>
                            <TableCell>{invoice.client_id?.company_name || 'Unknown'}</TableCell>
                            <TableCell>
                                {(() => {
                                    // PH TO UAE: Use appropriate total based on invoice type
                                    const serviceCode = (invoice.service_code || '').toString().toUpperCase().replace(/[\s-]+/g, '_');
                                    const isPhToUae = serviceCode === 'PH_TO_UAE' || serviceCode.startsWith('PH_TO_UAE_');
                                    const isTaxInvoice = invoice.tax_rate === 5;
                                    
                                    let displayAmount = 0;
                                    
                                    if (isPhToUae) {
                                        // PH TO UAE: Use stored totals if available
                                        const totalAmountCod = (invoice as any).total_amount_cod || (invoice as any).totalAmountCod;
                                        const totalAmountTaxInvoice = (invoice as any).total_amount_tax_invoice || (invoice as any).totalAmountTaxInvoice;
                                        
                                        if (isTaxInvoice && totalAmountTaxInvoice) {
                                            displayAmount = totalAmountTaxInvoice;
                                        } else if (!isTaxInvoice && totalAmountCod) {
                                            displayAmount = totalAmountCod;
                                        } else {
                                            // Fallback to total_amount if stored totals not available
                                            displayAmount = invoice.total_amount || 0;
                                        }
                                    } else {
                                        // Other services: Use total_amount
                                        displayAmount = invoice.total_amount || 0;
                                    }
                                    
                                    return `AED ${displayAmount ? parseFloat(displayAmount.toString()).toFixed(2) : '0.00'}`;
                                })()}
                            </TableCell>
                            <TableCell className="font-mono text-xs">{invoice.service_code ?? 'N/A'}</TableCell>
                            <TableCell>{invoice.weight_kg != null ? invoice.weight_kg : 'N/A'}</TableCell>
                            <TableCell>
                                {(() => {
                                    const boxArrays = [
                                        invoice.boxes,
                                        invoice.request_id?.shipment?.boxes,
                                        invoice.request_id?.boxes,
                                    ];
                                    const arrayCount = boxArrays.find((arr: any) => Array.isArray(arr));
                                    const computedCount = Array.isArray(arrayCount)
                                        ? Math.max(0, arrayCount.length - 1)
                                        : null;
                                    const fallbackCount =
                                        invoice.number_of_boxes ??
                                        invoice.request_id?.shipment?.number_of_boxes ??
                                        invoice.request_id?.verification?.number_of_boxes ??
                                        null;
                                    return (computedCount ?? fallbackCount) ?? 'N/A';
                                })()}
                            </TableCell>
                            <TableCell>{invoice.volume_cbm != null ? invoice.volume_cbm : 'N/A'}</TableCell>
                            <TableCell>{invoice.receiver_name ?? 'N/A'}</TableCell>
                            <TableCell className="max-w-[200px] truncate" title={invoice.receiver_address ?? ''}>{invoice.receiver_address ?? 'N/A'}</TableCell>
                            <TableCell>{invoice.receiver_phone ?? 'N/A'}</TableCell>
                            <TableCell>{invoice.issue_date ? new Date(invoice.issue_date).toLocaleDateString() : 'N/A'}</TableCell>
                            <TableCell>
                                <Badge 
                                    variant={
                                        invoice.status === 'PAID' || invoice.status === 'REMITTED' 
                                            ? 'default' 
                                            : invoice.status === 'COLLECTED_BY_DRIVER' 
                                                ? 'secondary' 
                                                : 'secondary'
                                    } 
                                    className={
                                        invoice.status === 'PAID' || invoice.status === 'REMITTED'
                                            ? 'bg-green-500 text-white'
                                            : invoice.status === 'COLLECTED_BY_DRIVER'
                                                ? 'bg-blue-500 text-white'
                                                : ''
                                    }
                                >
                                    {invoice.status}
                                </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                                <div className="flex gap-2 justify-end">
                                    <Button asChild variant="outline" size="sm">
                                        <Link href={`/dashboard/invoices/${invoice._id}`}>
                                            <Eye className="mr-2 h-4 w-4" />
                                            View
                                        </Link>
                                    </Button>
                                    {onRemit && invoice.status === 'COLLECTED_BY_DRIVER' && (
                                        <Button 
                                            variant="outline" 
                                            size="sm"
                                            className="bg-green-600 text-white hover:bg-green-700"
                                            onClick={() => onRemit(invoice._id)}
                                        >
                                            <TrendingUp className="mr-2 h-4 w-4" />
                                            Remit
                                        </Button>
                                    )}
                                    {onRemit && invoice.status === 'UNPAID' && (
                                        <Button 
                                            variant="outline" 
                                            size="sm"
                                            className="bg-blue-600 text-white hover:bg-blue-700"
                                            onClick={() => onRemit(invoice._id)}
                                        >
                                            <TrendingUp className="mr-2 h-4 w-4" />
                                            Mark Collected
                                        </Button>
                                    )}
                                    {onCancel && invoice.status !== 'CANCELLED' && invoice.status !== 'REMITTED' && (
                                        <Button 
                                            variant="outline" 
                                            size="sm"
                                            className="bg-red-600 text-white hover:bg-red-700"
                                            onClick={() => onCancel(invoice._id)}
                                        >
                                            <X className="mr-2 h-4 w-4" />
                                            Cancel
                                        </Button>
                                    )}
                                </div>
                            </TableCell>
                            </TableRow>
                            );
                        })}
                         {safeInvoices.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={14} className="text-center py-8 text-muted-foreground">
                                    No invoices found. Try adjusting your search or filters.
                                </TableCell>
                            </TableRow>
                        )}
                        </TableBody>
                        </Table>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
