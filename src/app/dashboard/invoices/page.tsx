'use client';

import InvoicesTable from "@/components/invoices-table";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/hooks/use-auth";
import { useNotifications } from '@/contexts/NotificationContext';
import { useState, useEffect, useMemo } from "react";
import { useToast } from '@/hooks/use-toast';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function InvoicesPage() {
    const { department } = useAuth();
    const { clearCount } = useNotifications();
    const [invoices, setInvoices] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);
    const { toast } = useToast();
    const { userProfile } = useAuth();
    
    // Search and filter states
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo] = useState('');

    useEffect(() => {
        // Clear invoices notification count when page is visited
        clearCount('invoices');
        
        const loadInvoiceData = async () => {
            try {
                console.log('🔄 Loading invoices from API...');
                const result = await apiClient.getInvoicesUnified();
                console.log('📊 Invoices API result:', result);
                console.log('📊 Type of result:', typeof result);
                console.log('📊 Full result structure:', JSON.stringify(result, null, 2));
                
                if (result && result.success && result.data) {
                    console.log('✅ Invoices loaded successfully');
                    const invoiceData = result.data as any;
                    console.log('📋 Number of invoices:', Array.isArray(invoiceData) ? invoiceData.length : 0);
                    console.log('📋 Invoice data:', invoiceData);
                    setInvoices(Array.isArray(invoiceData) ? invoiceData : []);
                } else {
                    console.error('❌ Error loading invoices:', result?.error || 'Unknown error');
                    console.error('❌ Full error result:', result);
                    toast({
                        variant: 'destructive',
                        title: 'Error',
                        description: result?.error || 'Failed to load invoices',
                    });
                    setInvoices([]); // Set empty array on error
                }
            } catch (error) {
                console.error('❌ Error loading invoice data:', error);
                console.error('❌ Error details:', error instanceof Error ? error.message : error);
                toast({
                    variant: 'destructive',
                    title: 'Error',
                    description: 'Failed to load invoices: ' + (error instanceof Error ? error.message : 'Unknown error'),
                });
                setInvoices([]); // Set empty array on error
            } finally {
                setLoading(false);
            }
        };

        loadInvoiceData();
    }, [refreshKey]);

    // Filter invoices based on search and filters
    const filteredInvoices = useMemo(() => {
        let filtered = [...invoices];

        // Search filter
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter((invoice) => {
                const invoiceId = (invoice.invoice_id || '').toLowerCase();
                const awb = (invoice.awb_number || '').toLowerCase();
                const clientName = (invoice.client_id?.company_name || '').toLowerCase();
                const receiverName = (invoice.receiver_name || '').toLowerCase();
                const receiverPhone = (invoice.receiver_phone || '').toLowerCase();
                const receiverAddress = (invoice.receiver_address || '').toLowerCase();
                const serviceCode = (invoice.service_code || '').toLowerCase();
                
                return (
                    invoiceId.includes(query) ||
                    awb.includes(query) ||
                    clientName.includes(query) ||
                    receiverName.includes(query) ||
                    receiverPhone.includes(query) ||
                    receiverAddress.includes(query) ||
                    serviceCode.includes(query)
                );
            });
        }

        // Status filter
        if (filterStatus !== 'all') {
            filtered = filtered.filter((invoice) => {
                return invoice.status === filterStatus;
            });
        }

        // Date range filter
        if (filterDateFrom) {
            const fromDate = new Date(filterDateFrom);
            fromDate.setHours(0, 0, 0, 0);
            filtered = filtered.filter((invoice) => {
                if (!invoice.issue_date) return false;
                const issueDate = new Date(invoice.issue_date);
                issueDate.setHours(0, 0, 0, 0);
                return issueDate >= fromDate;
            });
        }

        if (filterDateTo) {
            const toDate = new Date(filterDateTo);
            toDate.setHours(23, 59, 59, 999);
            filtered = filtered.filter((invoice) => {
                if (!invoice.issue_date) return false;
                const issueDate = new Date(invoice.issue_date);
                issueDate.setHours(0, 0, 0, 0);
                return issueDate <= toDate;
            });
        }

        return filtered;
    }, [invoices, searchQuery, filterStatus, filterDateFrom, filterDateTo]);

    const clearFilters = () => {
        setSearchQuery('');
        setFilterStatus('all');
        setFilterDateFrom('');
        setFilterDateTo('');
    };

    const handleRemitInvoice = async (invoiceId: string) => {
        try {
            const invoice = invoices.find(inv => inv._id === invoiceId);
            const currentStatus = invoice?.status;
            
            // If UNPAID, mark as COLLECTED_BY_DRIVER; if COLLECTED_BY_DRIVER, mark as REMITTED
            const result = currentStatus === 'UNPAID'
                ? await apiClient.updateInvoiceUnified(invoiceId, { status: 'COLLECTED_BY_DRIVER' })
                : await apiClient.remitInvoiceUnified(invoiceId);
            
            if (result.success) {
                toast({
                    title: 'Success',
                    description: currentStatus === 'UNPAID' 
                        ? 'Invoice marked as collected successfully'
                        : 'Invoice marked as remitted successfully',
                });
                // Refresh invoices list
                const updatedResult = await apiClient.getInvoicesUnified();
                if (updatedResult.success && updatedResult.data) {
                    setInvoices(Array.isArray(updatedResult.data) ? updatedResult.data : []);
                }
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Error',
                    description: result.error || 'Failed to update invoice'
                });
            }
        } catch (error) {
            console.error('Error updating invoice:', error);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Failed to update invoice'
            });
        }
    };

    const handleCancelInvoice = async (invoiceId: string) => {
        try {
            if (!invoiceId) {
                toast({
                    variant: 'destructive',
                    title: 'Error',
                    description: 'Invoice ID not found. Please ensure the invoice exists.',
                });
                return;
            }

            if (!confirm('Are you sure you want to cancel this invoice? This will cancel the invoice, invoice request, booking, delivery assignments, and empost (if applicable).')) {
                return;
            }

            const result = await apiClient.cancelInvoiceUnified(invoiceId);
            
            if (result.success) {
                toast({
                    title: 'Success',
                    description: 'Invoice and related entities cancelled successfully',
                });
                // Invalidate cache to ensure fresh data
                apiClient.invalidateCache('/invoice-requests');
                apiClient.invalidateCache('/invoices-unified');
                // Refresh invoices list
                const updatedResult = await apiClient.getInvoicesUnified(false); // Skip cache
                if (updatedResult.success && updatedResult.data) {
                    setInvoices(Array.isArray(updatedResult.data) ? updatedResult.data : []);
                }
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Error',
                    description: result.error || 'Failed to cancel invoice'
                });
            }
        } catch (error: any) {
            console.error('Error cancelling invoice:', error);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error.message || 'Failed to cancel invoice'
            });
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-lg">Loading invoices...</div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Search and Filter Bar */}
            <Card>
                <CardHeader>
                    <CardTitle>Search & Filter Invoices</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* Search Input */}
                        <div className="space-y-2">
                            <Label htmlFor="search">Search</Label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="search"
                                    placeholder="Invoice ID, AWB, Client, Receiver..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-9"
                                />
                            </div>
                        </div>

                        {/* Status Filter */}
                        <div className="space-y-2">
                            <Label htmlFor="status">Status</Label>
                            <Select value={filterStatus} onValueChange={setFilterStatus}>
                                <SelectTrigger id="status">
                                    <SelectValue placeholder="All Statuses" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Statuses</SelectItem>
                                    <SelectItem value="UNPAID">Unpaid</SelectItem>
                                    <SelectItem value="PAID">Paid</SelectItem>
                                    <SelectItem value="COLLECTED_BY_DRIVER">Collected by Driver</SelectItem>
                                    <SelectItem value="REMITTED">Remitted</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Date From */}
                        <div className="space-y-2">
                            <Label htmlFor="dateFrom">Date From</Label>
                            <Input
                                id="dateFrom"
                                type="date"
                                value={filterDateFrom}
                                onChange={(e) => setFilterDateFrom(e.target.value)}
                            />
                        </div>

                        {/* Date To */}
                        <div className="space-y-2">
                            <Label htmlFor="dateTo">Date To</Label>
                            <Input
                                id="dateTo"
                                type="date"
                                value={filterDateTo}
                                onChange={(e) => setFilterDateTo(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Clear Filters Button */}
                    {(searchQuery || filterStatus !== 'all' || filterDateFrom || filterDateTo) && (
                        <div className="mt-4">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={clearFilters}
                            >
                                <X className="h-4 w-4 mr-2" />
                                Clear Filters
                            </Button>
                            <span className="ml-4 text-sm text-muted-foreground">
                                Showing {filteredInvoices.length} of {invoices.length} invoices
                            </span>
                        </div>
                    )}
                </CardContent>
            </Card>

            <InvoicesTable 
                invoices={filteredInvoices}
                department={department?.name as any}
                onRemit={handleRemitInvoice}
                onCancel={handleCancelInvoice}
            />
        </div>
    );
}
