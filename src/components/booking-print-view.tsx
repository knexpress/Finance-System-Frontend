'use client';

import { useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

interface BookingPrintViewProps {
  booking: any;
  onClose?: () => void;
}

export default function BookingPrintView({ booking, onClose }: BookingPrintViewProps) {
  const printRef = useRef<HTMLDivElement>(null);

  // Helper to format values
  const formatValue = (value: any): string => {
    if (value === undefined || value === null) return 'N/A';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (typeof value === 'object') {
      const obj = value as Record<string, any>;
      if (obj.fullName) return String(obj.fullName);
      if (obj.name) return String(obj.name);
      if (obj.completeAddress || obj.address) return String(obj.completeAddress || obj.address);
      if (obj.emailAddress || obj.email) return String(obj.emailAddress || obj.email);
      if (obj.contactNo || obj.phone || obj.phoneNumber) return String(obj.contactNo || obj.phone || obj.phoneNumber);
      try {
        const s = JSON.stringify(obj);
        return s.length > 120 ? s.slice(0, 117) + '...' : s;
      } catch {
        return 'Object';
      }
    }
    return String(value);
  };

  const sender = booking.sender || {};
  const receiver = booking.receiver || {};
  const items: any[] = (
    Array.isArray(booking.items) ? booking.items :
    Array.isArray(booking.orderItems) ? booking.orderItems :
    Array.isArray(booking.listedItems) ? booking.listedItems :
    []
  ).filter(Boolean);

  useEffect(() => {
    // Generate and download PDF automatically
    const generatePDF = async () => {
      if (!printRef.current) return;

      try {
        // Dynamically import html2pdf.js
        const html2pdfModule = await import('html2pdf.js');
        const html2pdf = html2pdfModule.default || html2pdfModule;
        
        const element = printRef.current;
        const opt = {
          margin: [10, 10, 10, 10] as [number, number, number, number],
          filename: `booking-${booking._id || 'form'}-${new Date().toISOString().split('T')[0]}.pdf`,
          image: { type: 'jpeg' as const, quality: 0.98 },
          html2canvas: { 
            scale: 2,
            useCORS: true,
            logging: false,
            letterRendering: true,
          },
          jsPDF: { 
            unit: 'mm', 
            format: 'a4', 
            orientation: 'portrait' as const
          },
          pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        };

        await html2pdf().set(opt).from(element).save();
        
        // Close the view after PDF is generated
        setTimeout(() => {
          if (onClose) onClose();
        }, 500);
      } catch (error) {
        console.error('Error generating PDF:', error);
        // Fallback to print dialog if PDF generation fails
        window.print();
      }
    };

    // Small delay to ensure content is rendered
    setTimeout(() => {
      generatePDF();
    }, 1000);
  }, [onClose]);

  return (
    <div ref={printRef} className="print-container p-8 max-w-4xl mx-auto bg-white">
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-container,
          .print-container * {
            visibility: visible;
          }
          .print-container {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .no-print {
            display: none;
          }
          .page-break {
            page-break-after: always;
          }
          .avoid-break {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
        @media screen {
          .print-container {
            display: block;
          }
        }
      `}</style>

      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Booking Request Form</h1>
        <p className="text-sm text-muted-foreground">
          Booking ID: {booking._id} | Created: {booking.createdAt ? new Date(booking.createdAt).toLocaleDateString() : 'N/A'}
        </p>
      </div>

      {/* Booking Details */}
      <Card className="mb-6 avoid-break">
        <CardHeader>
          <CardTitle className="text-xl">Booking Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-semibold">Customer Name</Label>
              <p className="text-sm mt-1 border-b pb-1">
                {formatValue(booking.customer_name || booking.name || sender.fullName || sender.name)}
              </p>
            </div>
            <div>
              <Label className="text-sm font-semibold">Customer Last Name</Label>
              <p className="text-sm mt-1 border-b pb-1">
                {formatValue(
                  booking.customer_last_name || 
                  booking.lastName || 
                  sender.lastName || 
                  (() => {
                    const fullName = booking.customer_name || booking.name || sender.fullName || sender.name || '';
                    const parts = String(fullName).split(' ');
                    return parts.length > 1 ? parts.slice(1).join(' ') : 'N/A';
                  })()
                )}
              </p>
            </div>
            <div>
              <Label className="text-sm font-semibold">Customer Phone</Label>
              <p className="text-sm mt-1 border-b pb-1">
                {formatValue(booking.customer_phone || booking.phone || sender.contactNo || sender.phone)}
              </p>
            </div>
            <div>
              <Label className="text-sm font-semibold">Sender Address</Label>
              <p className="text-sm mt-1 border-b pb-1">
                {formatValue(
                  booking.sender_address || 
                  booking.senderAddress || 
                  sender.completeAddress || 
                  sender.address ||
                  booking.origin_place || 
                  booking.origin
                )}
              </p>
            </div>
            <div>
              <Label className="text-sm font-semibold">Receiver Name</Label>
              <p className="text-sm mt-1 border-b pb-1">
                {formatValue(booking.receiver_name || booking.receiverName || receiver.fullName || receiver.name)}
              </p>
            </div>
            <div>
              <Label className="text-sm font-semibold">Receiver Address</Label>
              <p className="text-sm mt-1 border-b pb-1">
                {formatValue(booking.receiver_address || booking.receiverAddress || receiver.completeAddress || receiver.address)}
              </p>
            </div>
            <div>
              <Label className="text-sm font-semibold">Receiver Phone</Label>
              <p className="text-sm mt-1 border-b pb-1">
                {formatValue(booking.receiver_phone || booking.receiverPhone || receiver.contactNo || receiver.phone)}
              </p>
            </div>
            <div>
              <Label className="text-sm font-semibold">Sender Email</Label>
              <p className="text-sm mt-1 border-b pb-1">
                {formatValue(booking.customer_email || booking.email || sender.emailAddress || sender.email || 'N/A')}
              </p>
            </div>
            <div>
              <Label className="text-sm font-semibold">Receiver Email</Label>
              <p className="text-sm mt-1 border-b pb-1">
                {formatValue(booking.receiver_email || booking.receiverEmail || receiver.emailAddress || receiver.email || 'N/A')}
              </p>
            </div>
            <div>
              <Label className="text-sm font-semibold">Sales Agent Email</Label>
              <p className="text-sm mt-1 border-b pb-1">
                {formatValue(booking.sales_agent_email || booking.agentEmail || booking.agent?.email || booking.salesAgent?.email || 'N/A')}
              </p>
            </div>
          </div>
          {booking.notes && (
            <div>
              <Label className="text-sm font-semibold">Notes</Label>
              <p className="text-sm mt-1 border-b pb-1">{booking.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Commodities - keep with booking details, avoid page breaks within */}
      {items.length > 0 && (
        <Card className="mb-6 avoid-break">
          <CardHeader>
            <CardTitle className="text-xl">Commodities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left p-2">Commodity</th>
                    <th className="text-left p-2">Quantity</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => {
                    const commodity = it?.commodity || it?.name || it?.description || it?.item || it?.title || 'N/A';
                    const qty = it?.qty || it?.quantity || it?.count || 'N/A';
                    return (
                      <tr key={it?.id || idx} className="border-t">
                        <td className="p-2">{formatValue(commodity)}</td>
                        <td className="p-2">{formatValue(qty)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="text-center text-xs text-muted-foreground mt-6 no-print">
        <p>This document was generated on {new Date().toLocaleString()}</p>
        <p className="mt-2">Click the browser's print button or press Ctrl+P to print/download</p>
      </div>
    </div>
  );
}

