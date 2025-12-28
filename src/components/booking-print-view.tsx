'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Image as ImageIcon } from 'lucide-react';

interface BookingPrintViewProps {
  booking: any;
  onClose?: () => void;
}

export default function BookingPrintView({ booking, onClose }: BookingPrintViewProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [viewingImageTitle, setViewingImageTitle] = useState<string>('');

  // Helper function to open image viewer
  const openImageViewer = (imageSrc: string, title: string) => {
    setViewingImage(imageSrc);
    setViewingImageTitle(title);
  };

  // Helper function to get image source
  const getImageSrc = (imageField: string | undefined) => {
    if (!imageField) return null;
    if (imageField.startsWith('data:image') || imageField.startsWith('http')) {
      return imageField;
    }
    return imageField;
  };

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

  // Check images in order: identityDocuments (primary source) -> top-level -> collections (fallback)
  const idFrontImage = getImageSrc(
    booking.identityDocuments?.eidFrontImage
    || booking.collections?.identityDocuments?.eidFrontImage
    || booking.id_front_image
    || booking.idFrontImage
  );
  const idBackImage = getImageSrc(
    booking.identityDocuments?.eidBackImage
    || booking.collections?.identityDocuments?.eidBackImage
    || booking.id_back_image
    || booking.idBackImage
  );
  const philippinesIdFront = getImageSrc(
    booking.identityDocuments?.philippinesIdFront
    || booking.collections?.identityDocuments?.philippinesIdFront
    || booking.philippinesIdFront
    || booking.philippines_id_front
  );
  const philippinesIdBack = getImageSrc(
    booking.identityDocuments?.philippinesIdBack
    || booking.collections?.identityDocuments?.philippinesIdBack
    || booking.philippinesIdBack
    || booking.philippines_id_back
  );
  const faceScanImage = getImageSrc(
    booking.face_scan_image ||
    booking.faceScanImage
  );

  // Collect customer images from all possible locations, prioritizing identityDocuments (primary source)
  const allCustomerImages: string[] = [];
  
  // First, add from identityDocuments (primary source based on actual data structure)
  if (Array.isArray(booking.identityDocuments?.customerImages)) {
    allCustomerImages.push(...booking.identityDocuments.customerImages);
  }
  
  // Then add from collections
  if (Array.isArray(booking.collections?.identityDocuments?.customerImages)) {
    allCustomerImages.push(...booking.collections.identityDocuments.customerImages);
  }
  
  // Then add from top-level customerImages
  if (Array.isArray(booking.customerImages)) {
    allCustomerImages.push(...booking.customerImages);
  }
  
  // Add singular customerImage if it exists and is not already in the array
  // Prioritize identityDocuments.customerImage (where the actual data is)
  const singularCustomerImage = booking.identityDocuments?.customerImage 
    || booking.collections?.identityDocuments?.customerImage
    || booking.customerImage;
  const customerImages: string[] = singularCustomerImage && !allCustomerImages.includes(singularCustomerImage)
    ? [...allCustomerImages, singularCustomerImage]
    : allCustomerImages.filter(Boolean);

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

    // Small delay to ensure images are loaded
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
          .img-wrap {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          img {
            max-width: 100%;
            height: auto;
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

      {/* Verification Images - start on a new page */}
      <Card className="mb-6 page-break avoid-break">
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Verification Images
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* ID Front Image */}
            {idFrontImage && (
              <div className="space-y-2 img-wrap">
                <Label className="text-sm font-semibold">ID Front Image</Label>
                <div 
                  className="border rounded-md p-2 cursor-zoom-in"
                  onClick={() => openImageViewer(idFrontImage, 'ID Front Image')}
                >
                  <img
                    src={idFrontImage}
                    alt="ID Front"
                    className="w-full max-w-md mx-auto object-contain"
                  />
                </div>
              </div>
            )}

            {/* ID Back Image */}
            {idBackImage && (
              <div className="space-y-2 img-wrap">
                <Label className="text-sm font-semibold">ID Back Image</Label>
                <div 
                  className="border rounded-md p-2 cursor-zoom-in"
                  onClick={() => openImageViewer(idBackImage, 'ID Back Image')}
                >
                  <img
                    src={idBackImage}
                    alt="ID Back"
                    className="w-full max-w-md mx-auto object-contain"
                  />
                </div>
              </div>
            )}

            {/* Philippines ID Front Image */}
            {philippinesIdFront && (
              <div className="space-y-2 img-wrap">
                <Label className="text-sm font-semibold">Philippines ID Front Image</Label>
                <div 
                  className="border rounded-md p-2 cursor-zoom-in"
                  onClick={() => openImageViewer(philippinesIdFront, 'Philippines ID Front Image')}
                >
                  <img
                    src={philippinesIdFront}
                    alt="Philippines ID Front"
                    className="w-full max-w-md mx-auto object-contain"
                  />
                </div>
              </div>
            )}

            {/* Philippines ID Back Image */}
            {philippinesIdBack && (
              <div className="space-y-2 img-wrap">
                <Label className="text-sm font-semibold">Philippines ID Back Image</Label>
                <div 
                  className="border rounded-md p-2 cursor-zoom-in"
                  onClick={() => openImageViewer(philippinesIdBack, 'Philippines ID Back Image')}
                >
                  <img
                    src={philippinesIdBack}
                    alt="Philippines ID Back"
                    className="w-full max-w-md mx-auto object-contain"
                  />
                </div>
              </div>
            )}

            {/* Face Scan Image */}
            {faceScanImage && (
              <div className="space-y-2 img-wrap">
                <Label className="text-sm font-semibold">Face Scan Image</Label>
                <div 
                  className="border rounded-md p-2 cursor-zoom-in"
                  onClick={() => openImageViewer(faceScanImage, 'Face Scan Image')}
                >
                  <img
                    src={faceScanImage}
                    alt="Face Scan"
                    className="w-full max-w-md mx-auto object-contain"
                  />
                </div>
              </div>
            )}

            {/* Client Face Images (chunked with page breaks) */}
            {customerImages.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Client Face Images ({customerImages.length})</Label>
                {(() => {
                  const chunks: string[][] = [];
                  const size = 4; // 4 images per page chunk
                  for (let i = 0; i < customerImages.length; i += size) {
                    chunks.push(customerImages.slice(i, i + size));
                  }
                  return chunks.map((chunk, cidx) => (
                    <div key={cidx} className={`space-y-2 ${cidx < chunks.length - 1 ? 'page-break' : ''}`}>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {chunk.map((img, idx) => (
                          <div 
                            key={`${cidx}-${idx}`} 
                            className="border rounded-md p-2 img-wrap cursor-zoom-in"
                            onClick={() => openImageViewer(img, `Client Face ${cidx * size + idx + 1}`)}
                          >
                            <img
                              src={img}
                              alt={`Client Face ${cidx * size + idx + 1}`}
                              className="w-full max-w-xs mx-auto object-contain"
                            />
                            <p className="text-xs text-center mt-2 text-muted-foreground">Image {cidx * size + idx + 1}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="text-center text-xs text-muted-foreground mt-6 no-print">
        <p>This document was generated on {new Date().toLocaleString()}</p>
        <p className="mt-2">Click the browser's print button or press Ctrl+P to print/download</p>
      </div>

      {/* Image Viewer Modal */}
      <Dialog open={!!viewingImage} onOpenChange={() => setViewingImage(null)}>
        <DialogContent className="max-w-5xl max-h-[95vh] p-0">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle>{viewingImageTitle}</DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6">
            {viewingImage && (
              <div className="relative w-full h-[calc(95vh-120px)] flex items-center justify-center bg-black/5 rounded-md overflow-hidden">
                <img
                  src={viewingImage}
                  alt={viewingImageTitle}
                  className="max-w-full max-h-full object-contain"
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

