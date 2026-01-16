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
    subtotal: number;
    taxRate: number;
    taxAmount: number;
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
  isUaeToPh?: boolean;
  isPhToUae?: boolean; // Flag to identify PH TO UAE invoices
  serviceCode?: string; // Service code for route identification
  shipmentClassification?: string; // Shipment classification: COMMERCIAL, FLOMIC, PERSONAL, GENERAL
}

interface TaxInvoiceTemplateProps {
  data: InvoiceData;
}

export default function TaxInvoiceTemplate({ data }: TaxInvoiceTemplateProps) {
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
          <h2 className="text-3xl font-bold text-black mb-4">TAX INVOICE</h2>
          <div className="space-y-1 text-sm">
            <p><span className="font-semibold">INVOICE #</span> {data.invoiceNumber}</p>
            {data.receiverInfo.trn && (
              <p><span className="font-semibold">TRN:</span> {data.receiverInfo.trn}</p>
            )}
            <p><span className="font-semibold">AWB #</span> {data.awbNumber}</p>
            {data.batchNumber && (
              <p><span className="font-semibold">Batch #</span> {data.batchNumber}</p>
            )}
            {data.shipmentClassification && (
              <p><span className="font-semibold">Classification:</span> {data.shipmentClassification.toUpperCase()}</p>
            )}
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
            {data.receiverInfo.emirate && data.receiverInfo.emirate !== 'N/A' && (
              <p className="text-sm">{data.receiverInfo.emirate}</p>
            )}
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
              <th className="border border-gray-300 px-4 py-2 text-left font-semibold">
                {(() => {
                  const isUaeToPh = data.isUaeToPh || (data.serviceCode && data.serviceCode.toUpperCase().includes('UAE_TO_PH'));
                  return isUaeToPh ? 'Rate' : 'Delivery Charge';
                })()}
              </th>
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
              <td className="border border-gray-300 px-4 py-2">
                {(() => {
                  const isUaeToPh = data.isUaeToPh || (data.serviceCode && data.serviceCode.toUpperCase().includes('UAE_TO_PH'));
                  // For UAE TO PH: Show rate, for PH TO UAE: Show delivery charge
                  return isUaeToPh 
                    ? data.shipmentDetails.rate.toFixed(2)
                    : data.charges.deliveryCharge.toFixed(2);
                })()}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Tax Invoice Summary */}
      <div className="flex justify-end mb-8">
        <div className="w-80">
          <table className="w-full border-collapse border border-gray-300">
            <tbody>
              {(() => {
                const isPhToUae = data.isPhToUae || (data.serviceCode && data.serviceCode.toUpperCase().includes('PH_TO_UAE'));
                // For PH TO UAE tax invoices: Hide shipping charge (it's not shown in tax invoices)
                // For other routes: Show shipping charge if > 0
                const shouldShowShipping = !isPhToUae && data.charges.shippingCharge > 0;
                return shouldShowShipping ? (
                  <tr>
                    <td className="border border-gray-300 px-4 py-2 text-left">Shipping Charge</td>
                    <td className="border border-gray-300 px-4 py-2 text-right">{data.charges.shippingCharge.toFixed(2)}</td>
                  </tr>
                ) : null;
              })()}
              {(() => {
                const isPhToUae = data.isPhToUae || (data.serviceCode && data.serviceCode.toUpperCase().includes('PH_TO_UAE'));
                // For PH TO UAE tax invoices: Hide pickup charge (it's not shown in tax invoices)
                // For other routes: Show pickup charge if > 0
                const pickupCharge = data.charges.pickupCharge ?? 0;
                const shouldShowPickup = !isPhToUae && pickupCharge > 0;
                return shouldShowPickup ? (
                  <tr>
                    <td className="border border-gray-300 px-4 py-2 text-left">Pickup Charge</td>
                    <td className="border border-gray-300 px-4 py-2 text-right">{pickupCharge.toFixed(2)}</td>
                  </tr>
                ) : null;
              })()}
              <tr>
                <td className="border border-gray-300 px-4 py-2 text-left">Delivery Charge</td>
                <td className="border border-gray-300 px-4 py-2 text-right">{data.charges.deliveryCharge.toFixed(2)}</td>
              </tr>
              {(() => {
                const isUaeToPh = data.isUaeToPh || (data.serviceCode && data.serviceCode.toUpperCase().includes('UAE_TO_PH'));
                const isPhToUae = data.isPhToUae || (data.serviceCode && data.serviceCode.toUpperCase().includes('PH_TO_UAE'));
                const insuranceCharge = data.charges.insuranceCharge ?? 0;
                // For UAE TO PH tax invoices: Always show insurance charge row (even if 0)
                // For PH TO UAE tax invoices: Never show insurance charge
                // For other routes: Show only if > 0
                const shouldShow = isUaeToPh || (!isPhToUae && insuranceCharge > 0);
                return shouldShow ? (
                  <tr>
                    <td className="border border-gray-300 px-4 py-2 text-left">Insurance Charge</td>
                    <td className="border border-gray-300 px-4 py-2 text-right">{insuranceCharge.toFixed(2)}</td>
                  </tr>
                ) : null;
              })()}
              {(() => {
                const isPhToUae = data.isPhToUae || (data.serviceCode && data.serviceCode.toUpperCase().includes('PH_TO_UAE'));
                // For PH TO UAE Tax Invoice: Show Subtotal (Delivery Charge only, no insurance)
                // For other routes: Show Subtotal (all charges)
                if (isPhToUae) {
                  // PH TO UAE: Subtotal is delivery charge only (no shipping, no insurance in tax invoice)
                  const subtotal = data.charges.subtotal || data.charges.deliveryCharge || 0;
                  return (
                    <tr>
                      <td className="border border-gray-300 px-4 py-2 text-left font-semibold">Subtotal</td>
                      <td className="border border-gray-300 px-4 py-2 text-right font-semibold">{subtotal.toFixed(2)}</td>
                    </tr>
                  );
                }
                return null;
              })()}
              {(() => {
                const isUaeToPh = data.isUaeToPh || (data.serviceCode && data.serviceCode.toUpperCase().includes('UAE_TO_PH'));
                const isFlomic = data.shipmentClassification?.toUpperCase() === 'FLOMIC';
                const isUaeToPhFlomic = isUaeToPh && isFlomic;
                
                // For UAE TO PH Flomic: Show Total Amount first, then VAT
                if (isUaeToPhFlomic) {
                  return (
                    <>
                      <tr className="bg-gray-100">
                        <td className="border border-gray-300 px-4 py-2 text-left font-bold">
                          <div>Total Amount</div>
                          <div className="text-xs font-normal text-gray-500 mt-1">Inclusive of Tax</div>
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-right font-bold">{data.charges.total.toFixed(2)} AED</td>
                      </tr>
                      <tr>
                        <td className="border border-gray-300 px-4 py-2 text-left">VAT ({data.charges.taxRate}%)</td>
                        <td className="border border-gray-300 px-4 py-2 text-right">{data.charges.taxAmount.toFixed(2)}</td>
                      </tr>
                    </>
                  );
                }
                
                // For other invoices: Show VAT first, then Total Amount
                return (
                  <>
                    <tr>
                      <td className="border border-gray-300 px-4 py-2 text-left">VAT ({data.charges.taxRate}%)</td>
                      <td className="border border-gray-300 px-4 py-2 text-right">{data.charges.taxAmount.toFixed(2)}</td>
                    </tr>
                    <tr className="bg-gray-100">
                      <td className="border border-gray-300 px-4 py-2 text-left font-bold">
                        <div>Total Amount</div>
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-right font-bold">{data.charges.total.toFixed(2)} AED</td>
                    </tr>
                  </>
                );
              })()}
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

      {/* Footer Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Side - Remarks */}
        <div>
          <h4 className="font-semibold mb-2">REMARKS:</h4>
          <div className="space-y-1 text-sm">
            {data.remarks.boxNumbers && <p>BOX# {data.remarks.boxNumbers}</p>}
            <p>AGENT: {data.remarks.agent}</p>
            {data.remarks.items && <p>ITEMS: {data.remarks.items}</p>}
          </div>
        </div>

        {/* Right Side - Terms */}
        <div className="text-right">
          <h4 className="font-semibold mb-2">TERMS AND CONDITIONS:</h4>
          <p className="text-sm">{data.termsAndConditions}</p>
          <p className="text-xs text-gray-600 mt-2">
            This is a tax invoice. VAT Registration No: 100123456789012
          </p>
        </div>
      </div>
    </div>
  );
}
