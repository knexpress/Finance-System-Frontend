'use client';

import InvoicesTable from "@/components/invoices-table";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/hooks/use-auth";
import { useNotifications } from '@/contexts/NotificationContext';
import { useState, useEffect, useMemo, useCallback } from "react";
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
    const { toast } = useToast();
    
    // Search and filter states
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo] = useState('');
    
    // Backend pagination states
    const [currentPage, setCurrentPage] = useState(1);
    const [pagination, setPagination] = useState<{
        page: number;
        limit: number;
        total: number;
        pages: number;
    } | null>(null);
    const itemsPerPage = 50;

    // Debounce search query to avoid too many API calls
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery);
        }, 500); // 500ms delay

        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Reset to page 1 when search or filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [debouncedSearchQuery, filterStatus, filterDateFrom, filterDateTo]);

    // Load invoices from backend with pagination and search
    useEffect(() => {
        // Clear invoices notification count when page is visited
        clearCount('invoices');
        
        const loadInvoiceData = async () => {
            setLoading(true);
            try {
                console.log('🔄 Loading invoices from API...', {
                    page: currentPage,
                    limit: itemsPerPage,
                    search: debouncedSearchQuery || undefined
                });
                
                const result = await apiClient.getInvoicesUnified({
                    page: currentPage,
                    limit: itemsPerPage,
                    search: debouncedSearchQuery || undefined,
                    useCache: currentPage === 1 && !debouncedSearchQuery // Only cache first page without search
                });
                
                console.log('📊 Invoices API result:', result);
                
                if (result && result.success && result.data) {
                    console.log('✅ Invoices loaded successfully');
                    const invoiceData = result.data as any;
                    const paginationData = (result as any).pagination;
                    
                    console.log('📋 Number of invoices:', Array.isArray(invoiceData) ? invoiceData.length : 0);
                    console.log('📋 Pagination:', paginationData);
                    
                    setInvoices(Array.isArray(invoiceData) ? invoiceData : []);
                    setPagination(paginationData || null);
                } else {
                    console.error('❌ Error loading invoices:', result?.error || 'Unknown error');
                    toast({
                        variant: 'destructive',
                        title: 'Error',
                        description: result?.error || 'Failed to load invoices',
                    });
                    setInvoices([]);
                    setPagination(null);
                }
            } catch (error) {
                console.error('❌ Error loading invoice data:', error);
                toast({
                    variant: 'destructive',
                    title: 'Error',
                    description: 'Failed to load invoices: ' + (error instanceof Error ? error.message : 'Unknown error'),
                });
                setInvoices([]);
                setPagination(null);
            } finally {
                setLoading(false);
            }
        };

        loadInvoiceData();
    }, [currentPage, debouncedSearchQuery, clearCount]);

    // Apply frontend filters (status and date) to the invoices from backend
    const filteredInvoices = useMemo(() => {
        let filtered = [...invoices];

        // Status filter (frontend only, backend doesn't support this yet)
        if (filterStatus !== 'all') {
            filtered = filtered.filter((invoice) => {
                return invoice.status === filterStatus;
            });
        }

        // Date range filter (frontend only, backend doesn't support this yet)
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
    }, [invoices, filterStatus, filterDateFrom, filterDateTo]);

    const clearFilters = () => {
        setSearchQuery('');
        setDebouncedSearchQuery('');
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
                // Refresh current page
                const updatedResult = await apiClient.getInvoicesUnified({
                    page: currentPage,
                    limit: itemsPerPage,
                    search: debouncedSearchQuery || undefined,
                    useCache: false
                });
                if (updatedResult.success && updatedResult.data) {
                    setInvoices(Array.isArray(updatedResult.data) ? updatedResult.data : []);
                    const paginationData = (updatedResult as any).pagination;
                    setPagination(paginationData || null);
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
                // Refresh current page
                const updatedResult = await apiClient.getInvoicesUnified({
                    page: currentPage,
                    limit: itemsPerPage,
                    search: debouncedSearchQuery || undefined,
                    useCache: false
                });
                if (updatedResult.success && updatedResult.data) {
                    setInvoices(Array.isArray(updatedResult.data) ? updatedResult.data : []);
                    const paginationData = (updatedResult as any).pagination;
                    setPagination(paginationData || null);
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

    // Calculate display counts
    const totalInvoices = pagination?.total || 0;
    const totalPages = pagination?.pages || 1;
    const startIndex = (currentPage - 1) * itemsPerPage + 1;
    const endIndex = Math.min(currentPage * itemsPerPage, totalInvoices);

    if (loading && invoices.length === 0) {
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
                                    placeholder="Invoice ID, AWB, Batch, Receiver..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-9"
                                />
                            </div>
                            {debouncedSearchQuery && (
                                <p className="text-xs text-muted-foreground">
                                    Searching all invoices...
                                </p>
                            )}
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
                                Showing {filteredInvoices.length} of {totalInvoices} invoices
                                {debouncedSearchQuery && ` (searching: "${debouncedSearchQuery}")`}
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

            {/* Pagination Controls */}
            {!loading && pagination && pagination.pages > 1 && (
                <Card className="sticky bottom-6 z-10 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div className="text-sm text-muted-foreground">
                                Showing {startIndex} to {endIndex} of {totalInvoices} invoices
                                {debouncedSearchQuery && ` (matching "${debouncedSearchQuery}")`}
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                    disabled={currentPage === 1 || loading}
                                >
                                    Previous
                                </Button>
                                <div className="text-sm">
                                    Page {currentPage} of {totalPages}
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                    disabled={currentPage >= totalPages || loading}
                                >
                                    Next
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
