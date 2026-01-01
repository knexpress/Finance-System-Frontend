'use client';

import { useState, useEffect } from "react";
import dynamic from 'next/dynamic';
import { apiClient } from "@/lib/api-client";

// Dynamically import AuditReportTable to reduce initial bundle size
const AuditReportTable = dynamic(() => import("@/components/audit-report-table"), {
  loading: () => <div className="flex items-center justify-center h-64">Loading audit table...</div>,
  ssr: false
});

export default function AuditReportPage() {
    const [allData, setAllData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadAuditData = async () => {
            try {
                // First, try to fetch audit reports from the Report model
                try {
                    const reportsResult = await apiClient.getReports();
                    console.log('📋 Reports API response:', reportsResult);
                    
                    // The API might return { success: true, data: [...] } or just the array directly
                    let reportsArray = reportsResult;
                    if (reportsResult && !Array.isArray(reportsResult) && (reportsResult as any).data) {
                        reportsArray = (reportsResult as any).data;
                        console.log('📦 Extracted data from response object');
                    } else if (reportsResult && !Array.isArray(reportsResult) && (reportsResult as any).success) {
                        // Already an object but no data field, could be array directly
                        console.log('📝 Response is already an object with success field');
                    }
                    
                    if (reportsArray && Array.isArray(reportsArray) && reportsArray.length > 0) {
                        console.log(`✅ Found ${reportsArray.length} audit reports`);
                        
                        // Log the first report structure for debugging
                        console.log('📄 Sample report structure:', reportsArray[0]);
                        
                        // Collect all invoice IDs from reports
                        const invoiceIds = new Set<string>();
                        reportsArray.forEach((report: any) => {
                            const reportData = report.report_data || {};
                            if (reportData.invoice_id) {
                                invoiceIds.add(reportData.invoice_id);
                            }
                            // Also check if invoice_id is an object with _id
                            if (reportData.invoice_id && typeof reportData.invoice_id === 'object' && reportData.invoice_id._id) {
                                invoiceIds.add(reportData.invoice_id._id);
                            }
                        });
                        
                        // Fetch all invoices in parallel
                        const invoiceMap = new Map<string, any>();
                        if (invoiceIds.size > 0) {
                            console.log(`📦 Fetching ${invoiceIds.size} invoices from invoices collection...`);
                            const invoicePromises = Array.from(invoiceIds).map(async (invoiceId) => {
                                try {
                                    const invoiceResult = await apiClient.getInvoiceUnified(invoiceId);
                                    if (invoiceResult.success && invoiceResult.data) {
                                        return { id: invoiceId, invoice: invoiceResult.data };
                                    }
                                    return null;
                                } catch (error) {
                                    console.error(`❌ Error fetching invoice ${invoiceId}:`, error);
                                    return null;
                                }
                            });
                            
                            const invoiceResults = await Promise.all(invoicePromises);
                            invoiceResults.forEach((result) => {
                                if (result) {
                                    invoiceMap.set(result.id, result.invoice);
                                }
                            });
                            console.log(`✅ Fetched ${invoiceMap.size} invoices`);
                        }
                        
                        // Convert reports to the format expected by AuditReportTable
                        const formattedData = reportsArray.map((report: any) => {
                            const reportData = report.report_data || {};
                            const cargoDetails = reportData.cargo_details || {};
                            const uploadType = reportData.upload_type || report.upload_type;

                            // Helper to build origin/destination strings from country + city
                            const formatLocation = (country?: string, city?: string) => {
                                if (!country && !city) return 'N/A';
                                if (country && city) return `${country} - ${city}`;
                                return country || city || 'N/A';
                            };

                            // Historical / automated CSV uploads (including automated_script)
                            if (
                                uploadType === 'historical' ||
                                uploadType === 'automated_script' ||
                                uploadType === 'automated' ||
                                reportData.origin_country || reportData.destination_country
                            ) {
                                // Prefer explicit origin/destination fields from backend; fall back to country/city formatting
                                const origin = reportData.origin || formatLocation(reportData.origin_country, reportData.origin_city);
                                const destination = reportData.destination || formatLocation(reportData.destination_country, reportData.destination_city);

                                // For historical uploads, try to get tax_rate from invoice if available
                                const invoiceData = reportData.invoice || {};
                                const taxRate = invoiceData.tax_rate !== undefined 
                                    ? (typeof invoiceData.tax_rate === 'object' && invoiceData.tax_rate.$numberDecimal 
                                        ? parseFloat(invoiceData.tax_rate.$numberDecimal) 
                                        : parseFloat(invoiceData.tax_rate))
                                    : (reportData.tax_rate !== undefined 
                                        ? (typeof reportData.tax_rate === 'object' && reportData.tax_rate.$numberDecimal
                                            ? parseFloat(reportData.tax_rate.$numberDecimal)
                                            : parseFloat(reportData.tax_rate))
                                        : null);
                                
                                // Determine leviable item: if tax_rate is 0 or null/undefined, it's Non-Leviable, otherwise Leviable
                                const isLeviableValue = (taxRate === 0 || taxRate === null || taxRate === undefined)
                                    ? 'Non-Leviable'
                                    : (taxRate !== null && taxRate !== undefined ? 'Leviable' : (reportData.additional_info2 === 'LEVIABLE' ? 'Leviable' 
                                        : reportData.additional_info2 === 'NON-LEVIABLE' ? 'Non-Leviable'
                                        : reportData.additional_info2 || 'N/A'));
                                
                                // Get service_code from invoice or reportData
                                const serviceCode = invoiceData.service_code 
                                    || reportData.service_code 
                                    || reportData.service_type
                                    || 'N/A';

                                // Clean weight string if padded spaces
                                const weightValue = typeof reportData.weight === 'string'
                                    ? reportData.weight.trim()
                                    : reportData.weight;

                                return {
                                    id: report._id,
                                    awbNumber: reportData.awb_number || 'N/A',
                                    deliveryDate: reportData.delivery_date || 'N/A',
                                    // Invoicing Date = transaction_date per requirement
                                    invoicingDate: reportData.transaction_date || reportData.invoice_date || 'N/A',
                                    // Customer = customer_name per requirement
                                    clientName: reportData.customer_name || reportData.sender_name || 'N/A',
                                    receiverName: reportData.receiver_name || 'N/A',
                                    origin,
                                    destination,
                                    shipmentType: reportData.shipment_type || 'N/A',
                                    serviceType: serviceCode,
                                    deliveryStatus: reportData.shipment_status || reportData.delivery_status || 'N/A',
                                    weight: weightValue || 'N/A',
                                    leviableItem: isLeviableValue,
                                    invoice: undefined, // historical / automated uploads don't carry invoice objects
                                    generatedBy: report.generated_by_employee_name || 'System',
                                    uploadType: uploadType || 'historical'
                                };
                            }
                            
                            // Regular report entry (existing logic)
                            // Get invoice ID and fetch invoice data from invoices collection
                            const invoiceId = reportData.invoice_id 
                                ? (typeof reportData.invoice_id === 'object' && reportData.invoice_id._id 
                                    ? reportData.invoice_id._id 
                                    : reportData.invoice_id)
                                : null;
                            
                            // Get invoice from the fetched invoice map
                            const fetchedInvoice = invoiceId ? invoiceMap.get(invoiceId) : null;
                            
                            // Get invoice data - prioritize fetched invoice from invoices collection
                            const invoiceData = fetchedInvoice || reportData.invoice || {};
                            
                            // Get tax_rate - prioritize from fetched invoice
                            const taxRate = fetchedInvoice?.tax_rate !== undefined 
                                ? (typeof fetchedInvoice.tax_rate === 'object' && fetchedInvoice.tax_rate.$numberDecimal 
                                    ? parseFloat(fetchedInvoice.tax_rate.$numberDecimal) 
                                    : parseFloat(fetchedInvoice.tax_rate))
                                : (invoiceData.tax_rate !== undefined 
                                    ? (typeof invoiceData.tax_rate === 'object' && invoiceData.tax_rate.$numberDecimal 
                                        ? parseFloat(invoiceData.tax_rate.$numberDecimal) 
                                        : parseFloat(invoiceData.tax_rate))
                                    : (reportData.tax_rate !== undefined 
                                        ? (typeof reportData.tax_rate === 'object' && reportData.tax_rate.$numberDecimal
                                            ? parseFloat(reportData.tax_rate.$numberDecimal)
                                            : parseFloat(reportData.tax_rate))
                                        : null));
                            
                            // Determine leviable item based on tax_rate
                            // If tax_rate is 0 or null/undefined, it's Non-Leviable, otherwise Leviable
                            const leviableItemValue = (taxRate === 0 || taxRate === null || taxRate === undefined) 
                                ? 'Non-Leviable' 
                                : 'Leviable';
                            
                            // Get service_code from fetched invoice (prioritize invoices collection)
                            const serviceCode = fetchedInvoice?.service_code 
                                || invoiceData.service_code 
                                || reportData.service_code 
                                || cargoDetails.service_code
                                || reportData.request_id?.service_code
                                || 'N/A';
                            
                            return {
                                id: report._id,
                                awbNumber: cargoDetails.awb_number || reportData.awb_number || 'N/A',
                                deliveryDate: reportData.invoice_date || 'N/A',
                                invoicingDate: reportData.invoice_date || 'N/A',
                                clientName: reportData.client_name || cargoDetails.customer?.name || 'N/A',
                                receiverName: cargoDetails.receiver?.name || 'N/A',
                                origin: cargoDetails.route?.split(' → ')[0] || 'N/A',
                                destination: cargoDetails.route?.split(' → ')[1] || cargoDetails.route || 'N/A',
                                shipmentType: cargoDetails.shipment?.weight_type || reportData.shipment_type || 'N/A',
                                serviceType: serviceCode,
                                deliveryStatus: reportData.current_status || cargoDetails.delivery_status || reportData.invoice_status || reportData.shipment_status || 'N/A',
                                weight: cargoDetails.shipment?.weight || reportData.weight || 'N/A',
                                leviableItem: leviableItemValue,
                                invoice: reportData.invoice_id ? {
                                    id: reportData.invoice_id,
                                    issueDate: reportData.invoice_date,
                                    amount: reportData.invoice_amount,
                                    status: reportData.invoice_status
                                } : undefined,
                                generatedBy: report.generated_by_employee_name || 'System',
                                uploadType: 'regular'
                            };
                        });
                        
                        setAllData(formattedData);
                        setLoading(false);
                        return;
                    }
                } catch (reportsError) {
                    console.error('❌ Error fetching audit reports:', reportsError);
                    // If reports API fails, show empty state instead of fallback
                    setAllData([]);
                }
            } catch (error) {
                console.error('Error loading audit data:', error);
            } finally {
                setLoading(false);
            }
        };

        loadAuditData();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-lg">Loading audit data...</div>
            </div>
        );
    }

    return (
        <div>
            <AuditReportTable data={allData} />
        </div>
    );
}
