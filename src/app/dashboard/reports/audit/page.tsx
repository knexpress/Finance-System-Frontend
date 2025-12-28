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

                                const isLeviableValue = reportData.additional_info2 === 'LEVIABLE' ? 'Leviable' 
                                    : reportData.additional_info2 === 'NON-LEVIABLE' ? 'Non-Leviable'
                                    : reportData.additional_info2 || 'N/A';

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
                                    serviceType: reportData.service_type || 'N/A',
                                    deliveryStatus: reportData.shipment_status || reportData.delivery_status || 'N/A',
                                    weight: weightValue || 'N/A',
                                    leviableItem: isLeviableValue,
                                    invoice: undefined, // historical / automated uploads don't carry invoice objects
                                    generatedBy: report.generated_by_employee_name || 'System',
                                    uploadType: uploadType || 'historical'
                                };
                            }
                            
                            // Regular report entry (existing logic)
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
                                serviceType: 'N/A',
                                deliveryStatus: reportData.current_status || cargoDetails.delivery_status || reportData.invoice_status || reportData.shipment_status || 'N/A',
                                weight: cargoDetails.shipment?.weight || reportData.weight || 'N/A',
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
