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
import { Eye, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';

interface InvoicesTableProps {
    invoices: any[];
    department: Department | null;
    onRemit?: (invoiceId: string) => void;
}

export default function InvoicesTable({ invoices, department, onRemit }: InvoicesTableProps) {
    const { toast } = useToast();

    // Ensure invoices is always an array
    const safeInvoices = Array.isArray(invoices) ? invoices : [];

    return (
        <div className="space-y-8">
            <Card>
                <CardHeader>
                    <CardTitle>Invoices</CardTitle>
                    <CardDescription>A list of all generated invoices.</CardDescription>
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
