'use client';

import React from 'react';
import QRCode from './qr-code';

interface InvoiceData {
  invoiceNumber: string;
  batchNumber?: string;
  awbNumber: string;
  trackingNumber: string;
  date: string;
  receiverInfo: {
    name: string;
    address: string;
    emirate: string;
    mobile: string;
    trn?: string;
  };
  senderInfo: {
    name?: string;
    address: string;
    email?: string;
    phone?: string;
    mobile?: string;
  };
  shipmentDetails: {
    numberOfBoxes: number;
    weight: number;
    weightType: 'ACTUAL' | 'VOLUMETRIC';
    rate: number;
  };
  charges: {
    shippingCharge: number;
    pickupCharge?: number;
    deliveryCharge: number;
    insuranceCharge?: number;
    subtotal?: number;
    taxRate?: number;
    taxAmount?: number;
    total: number;
  };
  remarks: {
    boxNumbers: string;
    agent: string;
    items?: string;
  };
  termsAndConditions: string;
  qrCode?: {
    url: string;
    code: string;
  };
  isUaeToPh?: boolean; // Flag to identify UAE TO PH invoices
  isPhToUae?: boolean; // Flag to identify PH TO UAE invoices
  serviceCode?: string; // Service code for route identification
  shipmentClassification?: string; // Shipment classification: COMMERCIAL, FLOMIC, PERSONAL, GENERAL
  totalAmountCod?: number; // PH TO UAE COD invoice total (shipping + delivery_base_amount)
  totalAmountTaxInvoice?: number; // PH TO UAE Tax invoice total (delivery + tax)
  invoiceType?: 'normal' | 'tax'; // Invoice type: 'normal' for COD, 'tax' for Tax invoice
}

interface InvoiceTemplateProps {
  data: InvoiceData;
}

export default function InvoiceTemplate({ data }: InvoiceTemplateProps) {
  return (
    <div className="max-w-4xl mx-auto bg-white p-8 shadow-lg">
      {/* Header Section */}
      <div className="flex justify-between items-start mb-8">
        {/* Left Side - Logo and Company Info */}
        <div className="flex items-start space-x-4">
          {/* Logo */}
          <div className="bg-green-600 text-white px-5 py-4 rounded-lg">
            <div className="text-3xl font-bold tracking-wide">KNEX</div>
          </div>
          
          {/* Company Details */}
          <div>
            <h1 className="text-2xl font-bold text-green-600 mb-1">Knex Delivery Services L.L.C.</h1>
            <p className="text-sm text-green-600 mb-2">www.knexpress.ae</p>
            <p className="text-sm text-gray-700">Dubai, United Arab Emirates</p>
            <p className="text-xs text-gray-600 mt-1">TRN: 104131637100003</p>
          </div>
        </div>

        {/* Right Side - Invoice Details */}
        <div className="text-right">
          <h2 className="text-3xl font-bold text-black mb-4">CASH ON DELIVERY (COD)</h2>
          <div className="space-y-1 text-sm">
            <p><span className="font-semibold">INVOICE #</span> {data.invoiceNumber}</p>
            {data.receiverInfo.trn && (
              <p><span className="font-semibold">TRN:</span> {data.receiverInfo.trn}</p>
            )}
            <p><span className="font-semibold">AWB #</span> {data.awbNumber}</p>
            {data.batchNumber ? (
              <p><span className="font-semibold">Batch #</span> {data.batchNumber}</p>
            ) : null}
            {/* Show shipment classification for UAE TO PH (FLOMIC or COMMERCIAL only) */}
            {data.isUaeToPh && data.shipmentClassification && 
             (data.shipmentClassification.toUpperCase() === 'FLOMIC' || 
              data.shipmentClassification.toUpperCase() === 'COMMERCIAL') ? (
              <p><span className="font-semibold">Classification:</span> {data.shipmentClassification.toUpperCase()}</p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Sender Information */}
        <div>
          <h3 className="text-lg font-bold text-black mb-4 uppercase">SENDER INFORMATION</h3>
          <div className="space-y-1 text-sm">
            {data.senderInfo.name && (
              <p className="font-semibold text-base text-gray-900">{data.senderInfo.name}</p>
            )}
            <p className="text-xs uppercase tracking-wide text-gray-500">{data.date}</p>
            <p className="leading-relaxed">{data.senderInfo.address}</p>
            {data.senderInfo.phone && <p>{data.senderInfo.phone}</p>}
            {data.senderInfo.email && <p>{data.senderInfo.email}</p>}
          </div>
        </div>

        {/* Receiver Information */}
        <div>
          <h3 className="text-lg font-bold text-black mb-4 uppercase text-right lg:text-left">RECEIVER INFORMATION</h3>
          <div className="space-y-2 text-right lg:text-left">
            <p className="font-semibold text-lg">{data.receiverInfo.name}</p>
            <p className="text-sm leading-relaxed">{data.receiverInfo.address}</p>
            <p className="text-sm">{data.receiverInfo.emirate}</p>
            <p className="text-sm">{data.receiverInfo.mobile}</p>
          </div>
        </div>
      </div>

      {/* Shipment Details Table */}
      <div className="mb-6">
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-50">
              <th className="border border-gray-300 px-4 py-2 text-left font-semibold">No of Boxes</th>
              <th className="border border-gray-300 px-4 py-2 text-left font-semibold">Weight</th>
              <th className="border border-gray-300 px-4 py-2 text-left font-semibold">Rate</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-gray-300 px-4 py-2">{data.shipmentDetails.numberOfBoxes}</td>
              <td className="border border-gray-300 px-4 py-2">
                <div>
                  <span className="font-semibold">{data.shipmentDetails.weight.toFixed(2)} kg</span>
                  <div className="text-xs text-gray-600">
                    Weight Base: {data.shipmentDetails.weightType === 'ACTUAL' ? 'Actual Weight' : 'Volumetric Weight'}
                  </div>
                </div>
              </td>
              <td className="border border-gray-300 px-4 py-2">{data.shipmentDetails.rate.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Charges Summary - Normal Invoice shows total with tax, but no tax breakdown */}
      <div className="flex justify-end mb-8">
        <div className="w-80">
          <table className="w-full border-collapse border border-gray-300">
            <tbody>
              <tr>
                <td className="border border-gray-300 px-4 py-2 text-left">Shipping Charge</td>
                <td className="border border-gray-300 px-4 py-2 text-right">{data.charges.shippingCharge.toFixed(2)}</td>
              </tr>
              {data.charges.pickupCharge && data.charges.pickupCharge > 0 && (
                <tr>
                  <td className="border border-gray-300 px-4 py-2 text-left">Pickup Charge</td>
                  <td className="border border-gray-300 px-4 py-2 text-right">{data.charges.pickupCharge.toFixed(2)}</td>
                </tr>
              )}
              <tr>
                <td className="border border-gray-300 px-4 py-2 text-left">Delivery Charge</td>
                <td className="border border-gray-300 px-4 py-2 text-right">{data.charges.deliveryCharge.toFixed(2)}</td>
              </tr>
              <tr>
                <td className="border border-gray-300 px-4 py-2 text-left">Insurance Charge</td>
                <td className="border border-gray-300 px-4 py-2 text-right">{(data.charges.insuranceCharge ?? 0).toFixed(2)}</td>
              </tr>
              <tr className="bg-gray-100">
                <td className="border border-gray-300 px-4 py-2 text-left font-bold">
                  <div>Total Amount</div>
                  {/* Show "Inclusive of Tax" for UAE TO PH invoices, but NOT for Commercial shipments and NOT for PH TO UAE */}
                  {(() => {
                    const isUaeToPh = data.isUaeToPh || (data.serviceCode && data.serviceCode.toUpperCase().includes('UAE_TO_PH'));
                    const isPhToUae = data.isPhToUae || (data.serviceCode && data.serviceCode.toUpperCase().includes('PH_TO_UAE'));
                    const isCommercial = data.shipmentClassification?.toUpperCase() === 'COMMERCIAL';
                    // Only show for UAE TO PH if it's NOT Commercial (i.e., Flomic/Personal) and NOT PH TO UAE
                    return isUaeToPh && !isCommercial && !isPhToUae ? (
                      <div className="text-xs font-normal text-gray-500 mt-1">Inclusive of Tax</div>
                    ) : null;
                  })()}
                </td>
                <td className="border border-gray-300 px-4 py-2 text-right font-bold">
                  {(() => {
                    // For PH TO UAE: Use invoiceType to determine which total to display
                    // - Normal (COD) invoice: Use totalAmountCod (573)
                    // - Tax invoice: Use totalAmountTaxInvoice (38.85)
                    // Otherwise: Use charges.total
                    let totalValue = data.charges?.total;
                    
                    if (data.isPhToUae) {
                      // For PH TO UAE: Prioritize based on invoiceType or detect from totals
                      // If invoiceType is 'tax', use totalAmountTaxInvoice
                      // Otherwise (normal or undefined), use totalAmountCod if available
                      if (data.invoiceType === 'tax' && data.totalAmountTaxInvoice && data.totalAmountTaxInvoice > 0) {
                        // Tax invoice: Use totalAmountTaxInvoice
                        totalValue = data.totalAmountTaxInvoice;
                        console.log('✅ Template: Using totalAmountTaxInvoice for Tax invoice', {
                          invoiceType: data.invoiceType,
                          totalAmountTaxInvoice: data.totalAmountTaxInvoice
                        });
                      } else if (data.totalAmountCod && data.totalAmountCod > 0) {
                        // Normal (COD) invoice or default: Use totalAmountCod
                        // This handles both explicit 'normal' type and undefined (defaults to COD)
                        totalValue = data.totalAmountCod;
                        console.log('✅ Template: Using totalAmountCod for Normal (COD) invoice', {
                          invoiceType: data.invoiceType,
                          totalAmountCod: data.totalAmountCod,
                          chargesTotal: data.charges?.total
                        });
                      }
                    }
                    
                    if (!totalValue) return null;
                    // Convert to number and check - handle both string "0" and number 0
                    const numValue = typeof totalValue === 'string' ? parseFloat(totalValue) : Number(totalValue);
                    // Only render if it's a valid positive number
                    if (isNaN(numValue) || !isFinite(numValue) || numValue <= 0) {
                      return null; // Don't render anything if total is 0, NaN, or invalid
                    }
                    return `${numValue.toFixed(2)} AED`;
                  })()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* QR Code Section */}
      {data.qrCode && (
        <div className="my-8 p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold mb-2">DRIVER QR CODE</h4>
              <p className="text-sm text-gray-600 mb-2">
                Scan this QR code to make payment for this invoice
              </p>
              <p className="text-xs text-orange-600 font-semibold mb-2 italic">
                Note: This QR code is for drivers only
              </p>
              <p className="text-xs text-gray-500 font-mono">
                Code: {data.qrCode.code}
              </p>
            </div>
            <div className="text-center">
              <QRCode value={data.qrCode.url} size={200} className="mx-auto" />
              <p className="text-xs text-gray-500 mt-1">Scan to Pay</p>
            </div>
          </div>
        </div>
      )}
      
      {/* Debug QR Code Data */}
      {!data.qrCode && (
        <div className="my-8 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
          <h4 className="font-semibold mb-2 text-yellow-800">QR Code Debug Info</h4>
          <p className="text-sm text-yellow-700">
            QR Code data not available. This might be because:
          </p>
          <ul className="text-xs text-yellow-600 mt-2 list-disc list-inside">
            <li>Delivery assignment creation failed</li>
            <li>QR code data not passed to template</li>
            <li>Check console logs for delivery assignment errors</li>
          </ul>
        </div>
      )}

      {/* Footer Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Side - Remarks */}
        <div>
          <h4 className="font-semibold mb-2">REMARKS:</h4>
          <div className="space-y-1 text-sm">
            <p>BOX# {data.remarks.boxNumbers}</p>
            <p>AGENT: {data.remarks.agent}</p>
            {data.remarks.items && <p>ITEMS: {data.remarks.items}</p>}
          </div>
        </div>

        {/* Right Side - Terms */}
        <div className="text-right">
          <h4 className="font-semibold mb-2">TERMS AND CONDITIONS:</h4>
          <p className="text-sm">{data.termsAndConditions}</p>
        </div>
      </div>
    </div>
  );
}

// Sample data for testing
export const sampleInvoiceData: InvoiceData = {
  invoiceNumber: '6290',
  awbNumber: '2321',
  trackingNumber: 'PHLJBP42GOBOBN1',
  date: '17-Oct-2025',
  receiverInfo: {
    name: 'CRISTINA BATAC',
    address: 'UNITED ARAB EMIRATES ABU DHABI CITY HAMDAN ST. OPPOSITE AHALIA BLDG FLAT 204',
    emirate: 'Abu Dhabi',
    mobile: '+971502781566'
  },
  senderInfo: {
    name: 'CRISTINA BATAC',
    address: '11th Street Warehouse No. 19, Rocky Warehouses Al Qusais Industrial 1, Dubai - UAE',
    email: 'customercare@knexpress.ae',
    phone: '+971 56 864 3473'
  },
  shipmentDetails: {
    numberOfBoxes: 6,
    weight: 138.12,
    weightType: 'VOLUMETRIC',
    rate: 31.00
  },
  charges: {
    shippingCharge: 4281.72,
    deliveryCharge: 0.00,
    subtotal: 4281.72,
    total: 4281.72
  },
  remarks: {
    boxNumbers: '47-48, 51-54',
    agent: 'JESS'
  },
  termsAndConditions: 'Cash Upon Receipt of Goods'
};