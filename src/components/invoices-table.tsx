'use client';

import Link from 'next/link';
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
import { Eye, TrendingUp, FileSpreadsheet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import * as XLSX from 'xlsx';

interface InvoicesTableProps {
    invoices: any[];
    department: Department | null;
    onRemit?: (invoiceId: string) => void;
}

export default function InvoicesTable({ invoices, department, onRemit }: InvoicesTableProps) {
    const { toast } = useToast();

    // Ensure invoices is always an array
    const safeInvoices = Array.isArray(invoices) ? invoices : [];

    // Download invoices as Excel
    const handleDownloadExcel = (invoiceList: any[]) => {
        if (!invoiceList || invoiceList.length === 0) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'No invoices available to export.',
            });
            return;
        }

        try {
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
                        displayAmount = totalAmountTaxInvoice;
                    } else if (!isTaxInvoice && totalAmountCod) {
                        displayAmount = totalAmountCod;
                    } else {
                        displayAmount = invoice.total_amount || 0;
                    }
                } else {
                    displayAmount = invoice.total_amount || 0;
                }

                // Parse amounts
                const parseAmount = (value: any): number => {
                    if (!value) return 0;
                    if (typeof value === 'object' && value.$numberDecimal) {
                        return parseFloat(value.$numberDecimal);
                    }
                    return parseFloat(value) || 0;
                };

                const shippingCharge = parseAmount(invoice.amount);
                const pickupCharge = parseAmount(invoice.pickup_charge);
                const deliveryCharge = parseAmount(invoice.delivery_charge);
                const insuranceCharge = invoice.line_items?.find((item: any) => 
                    item.description?.toLowerCase().includes('insurance')
                )?.total || 0;
                const subtotal = parseAmount(invoice.subtotal);
                const taxRate = parseAmount(invoice.tax_rate);
                const taxAmount = parseAmount(invoice.tax_amount);

                // Format date
                const issueDate = invoice.issue_date 
                    ? new Date(invoice.issue_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                    : 'N/A';

                excelData.push([
                    invoice.invoice_id || 'N/A',
                    invoice.awb_number || 'N/A',
                    invoice.batch_number || 'N/A',
                    invoice.client_id?.company_name || 'Unknown',
                    invoice.receiver_name || 'N/A',
                    invoice.receiver_address || 'N/A',
                    invoice.receiver_phone || 'N/A',
                    invoice.service_code || 'N/A',
                    invoice.request_id?.verification?.total_kg || invoice.request_id?.verification?.weight || 'N/A',
                    invoice.request_id?.verification?.number_of_boxes || 'N/A',
                    invoice.volume_cbm || invoice.request_id?.shipment?.volume || 'N/A',
                    shippingCharge.toFixed(2),
                    pickupCharge.toFixed(2),
                    deliveryCharge.toFixed(2),
                    parseAmount(insuranceCharge).toFixed(2),
                    subtotal.toFixed(2),
                    taxRate.toFixed(2),
                    taxAmount.toFixed(2),
                    displayAmount.toFixed(2),
                    totalAmountCod ? parseAmount(totalAmountCod).toFixed(2) : '',
                    totalAmountTaxInvoice ? parseAmount(totalAmountTaxInvoice).toFixed(2) : '',
                    issueDate,
                    invoice.status || 'N/A',
                    invoice.notes || ''
                ]);
            });

            // Create workbook and worksheet
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(excelData);

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
                { wch: 15 }, // Issue Date
                { wch: 15 }, // Status
                { wch: 30 }  // Notes
            ];
            ws['!cols'] = colWidths;

            // Add worksheet to workbook
            XLSX.utils.book_append_sheet(wb, ws, 'Invoices');

            // Generate filename with timestamp
            const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
            const filename = `Invoices-${timestamp}.xlsx`;

            // Download file
            XLSX.writeFile(wb, filename);

            toast({
                title: 'Excel Export Successful',
                description: `${invoiceList.length} invoice(s) exported to ${filename}`,
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
                            onClick={() => handleDownloadExcel(invoices)}
                            className="ml-auto"
                        >
                            <FileSpreadsheet className="h-4 w-4 mr-2" />
                            Download Excel
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="relative">
                        {/* Table Container */}
                        <div
                            className="overflow-x-hidden overflow-y-auto scrollbar-thin"
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
                        {safeInvoices.map((invoice) => (
                            <TableRow key={invoice._id}>
                            <TableCell className="font-mono text-xs">{invoice.invoice_id || 'N/A'}</TableCell>
                            <TableCell className="font-mono text-xs">{invoice.awb_number || 'N/A'}</TableCell>
                            <TableCell className="font-mono text-xs">{invoice.batch_number || 'N/A'}</TableCell>
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
                                {invoice.number_of_boxes ??
                                  invoice.request_id?.shipment?.number_of_boxes ??
                                  invoice.request_id?.verification?.number_of_boxes ??
                                  'N/A'}
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
                                </div>
                            </TableCell>
                            </TableRow>
                        ))}
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
