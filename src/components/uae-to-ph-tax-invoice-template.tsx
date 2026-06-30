'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import QRCode from './qr-code';

export interface UaeToPhTaxInvoiceData {
  invoiceNumber: string;
  batchNumber?: string;
  awbNumber: string;
  trackingNumber: string;
  date: string;
  dueDate?: string;
  receiverInfo: {
    name: string;
    address: string;
    emirate: string;
    mobile: string;
    trn?: string;
    deliveryOption?: string;
  };
  senderInfo: {
    name?: string;
    address: string;
    email?: string;
    phone?: string;
    mobile?: string;
    deliveryOption?: string;
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
  shipmentClassification?: string;
}

interface UaeToPhTaxInvoiceTemplateProps {
  data: UaeToPhTaxInvoiceData;
}

function fmt(n: number) {
  return n.toFixed(2);
}

function cellBorder() {
  return 'border border-gray-400 px-2 py-1.5 text-sm';
}

const SERVICE_DESCRIPTION = 'International Courier Service - UAE to Philippines';

export default function UaeToPhTaxInvoiceTemplate({ data }: UaeToPhTaxInvoiceTemplateProps) {
  const [page, setPage] = useState<1 | 2>(1);

  const pickup = data.charges.pickupCharge ?? 0;
  const insurance = data.charges.insuranceCharge ?? 0;
  const delivery = data.charges.deliveryCharge ?? 0;
  const shipping = data.charges.shippingCharge ?? 0;

  const courierBundleAmount = Math.max(0, data.charges.subtotal - pickup);
  const mainTaxLineAmount = courierBundleAmount;
  const subtotal = data.charges.subtotal;
  // UAE->PH rule: shipment detail lines are always zero-tax.
  // Tax is applied only on pickup/collection charges at 5%.
  const taxAmount = pickup > 0 ? pickup * 0.05 : 0;
  const zeroRatedSalesTax = 0;
  const taxRate = data.charges.taxRate;
  // Keep TOTAL AED aligned with visible rows in this template.
  const total = subtotal + taxAmount;

  const weightLabel = `${data.shipmentDetails.weight.toFixed(2)} KG Weight Base : ${
    data.shipmentDetails.weightType === 'ACTUAL' ? 'Actual Weight' : 'Volumetric Weight'
  }`;

  const paymentTerms = data.termsAndConditions || 'Cash Upon Receipts of Goods';
  const dueDateText = data.dueDate ? `Due Date : ${data.dueDate}` : '';

  const pageScreenClass = (p: 1 | 2) =>
    page === p ? '' : 'tax-invoice-page--screen-hidden';

  return (
    <div className="tax-invoice-document max-w-[210mm] mx-auto bg-white text-black">
      <div
        className={`tax-invoice-page tax-invoice-page-1 p-8 min-h-[277mm] flex flex-col ${pageScreenClass(1)}`}
      >
        <div className="flex items-start justify-between mb-6 text-sm leading-snug gap-6">
          <img
            src="/Screenshot 2026-06-29 132542.png"
            alt="KNEX logo"
            className="h-24 w-auto object-contain shrink-0"
          />
          <div className="text-right">
            <p className="font-semibold">Knex Delivery Services L.L.C.</p>
            <p>Rocky Warehouse # 19</p>
            <p>11th Street, Al Qusais, Industrial Area 1</p>
            <p>Dubai, UAE</p>
            <p className="mt-1">
              <span className="font-medium">TRN :</span> 104131637100003
            </p>
          </div>
        </div>

        <h2 className="text-xl font-bold tracking-wide mb-6">TAX INVOICE</h2>

        <div className="grid grid-cols-2 gap-8 mb-6 text-sm">
          <div>
            <p className="font-semibold mb-2">Bill To :</p>
            <p className="font-medium">{data.senderInfo.name || data.receiverInfo.name}</p>
            <p className="whitespace-pre-line leading-relaxed">{data.senderInfo.address}</p>
            {data.receiverInfo.emirate && data.receiverInfo.emirate !== 'N/A' && (
              <p>{data.receiverInfo.emirate}</p>
            )}
            <p>UAE</p>
            {data.receiverInfo.trn ? (
              <p className="mt-2">
                <span className="font-medium">TRN :</span> {data.receiverInfo.trn}
              </p>
            ) : null}
          </div>
          <div className="space-y-1">
            <p>
              <span className="font-semibold">Invoice Date :</span> {data.date}
            </p>
            <p>
              <span className="font-semibold">Invoice Number :</span> {data.invoiceNumber}
            </p>
            <p>
              <span className="font-semibold">AIR WAYBILL NO :</span> {data.awbNumber}
            </p>
            {data.batchNumber ? (
              <p>
                <span className="font-semibold">Batch No :</span> {data.batchNumber}
              </p>
            ) : null}
            {data.shipmentClassification ? (
              <p>
                <span className="font-semibold">Classification :</span>{' '}
                {data.shipmentClassification.toUpperCase()}
              </p>
            ) : null}
          </div>
        </div>

        <table className="w-full border-collapse mb-4 text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className={`${cellBorder()} text-left font-semibold w-[40%]`}>DESCRIPTION</th>
              <th className={`${cellBorder()} text-center font-semibold`}>QUANTITY</th>
              <th className={`${cellBorder()} text-right font-semibold`}>UNIT PRICE</th>
              <th className={`${cellBorder()} text-center font-semibold`}>Tax</th>
              <th className={`${cellBorder()} text-right font-semibold`}>Amount AED</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={cellBorder()}>{SERVICE_DESCRIPTION}</td>
              <td className={`${cellBorder()} text-center`}>1</td>
              <td className={`${cellBorder()} text-right`}>{fmt(mainTaxLineAmount)}</td>
              <td className={`${cellBorder()} text-center`}>Tax on Sales</td>
              <td className={`${cellBorder()} text-right`}>{fmt(mainTaxLineAmount)}</td>
            </tr>
            {pickup > 0 && (
              <tr>
                <td className={cellBorder()}>Pick up Charges</td>
                <td className={`${cellBorder()} text-center`}>1</td>
                <td className={`${cellBorder()} text-right`}>{fmt(pickup)}</td>
                <td className={`${cellBorder()} text-center`}>
                  {taxRate > 0 ? `${taxRate}%` : '5%'}
                </td>
                <td className={`${cellBorder()} text-right`}>{fmt(pickup)}</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="flex justify-end mb-8">
          <table className="w-72 border-collapse text-sm">
            <tbody>
              <tr>
                <td className={`${cellBorder()} text-right font-semibold`} colSpan={4}>
                  Subtotal
                </td>
                <td className={`${cellBorder()} text-right`}>{fmt(subtotal)}</td>
              </tr>
              {taxAmount > 0 && (
                <tr>
                  <td className={`${cellBorder()} text-right font-semibold`} colSpan={4}>
                    TOTAL TAX ON SALES 5%
                  </td>
                  <td className={`${cellBorder()} text-right`}>{fmt(taxAmount)}</td>
                </tr>
              )}
              {zeroRatedSalesTax > 0 && (
                <tr>
                  <td className={`${cellBorder()} text-right font-semibold`} colSpan={4}>
                    TOTAL SALES TAX 0%
                  </td>
                  <td className={`${cellBorder()} text-right`}>{fmt(zeroRatedSalesTax)}</td>
                </tr>
              )}
              <tr>
                <td className={`${cellBorder()} text-right font-bold`} colSpan={4}>
                  TOTAL AED
                </td>
                <td className={`${cellBorder()} text-right font-bold`}>{fmt(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-auto space-y-2 text-sm">
          {dueDateText ? <p>{dueDateText}</p> : null}
          <p>{paymentTerms}</p>
        </div>
      </div>

      <div
        className={`tax-invoice-page tax-invoice-page-2 p-8 min-h-[277mm] flex flex-col ${pageScreenClass(2)}`}
      >
        <h3 className="text-lg font-bold mb-6 tracking-wide">SHIPMENT DETAILS</h3>

        <div className="grid grid-cols-2 gap-8 mb-6 text-sm">
          <div>
            <p className="font-bold mb-2 uppercase">Sender Information</p>
            <p>{data.senderInfo.name}</p>
            <p className="whitespace-pre-line">{data.senderInfo.address}</p>
            <p>{data.senderInfo.phone || data.senderInfo.mobile}</p>
            {data.senderInfo.deliveryOption && (
              <p className="mt-1 capitalize">
                Delivery Option: {data.senderInfo.deliveryOption}
              </p>
            )}
          </div>
          <div>
            <p className="font-bold mb-2 uppercase">Receiver Information</p>
            <p>{data.receiverInfo.name}</p>
            <p className="whitespace-pre-line">{data.receiverInfo.address}</p>
            {data.receiverInfo.emirate && data.receiverInfo.emirate !== 'N/A' && (
              <p>{data.receiverInfo.emirate}</p>
            )}
            <p>{data.receiverInfo.mobile}</p>
            {data.receiverInfo.deliveryOption && (
              <p className="mt-1 capitalize">
                Delivery Option: {data.receiverInfo.deliveryOption}
              </p>
            )}
          </div>
        </div>

        <table className="w-full border-collapse mb-4 text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className={`${cellBorder()} text-left font-semibold`}>DESCRIPTION</th>
              <th className={`${cellBorder()} text-center font-semibold`}>NO OF BOXES</th>
              <th className={`${cellBorder()} text-left font-semibold`}>WEIGHT</th>
              <th className={`${cellBorder()} text-center font-semibold`}>RATE</th>
              <th className={`${cellBorder()} text-center font-semibold`}>TAX</th>
              <th className={`${cellBorder()} text-right font-semibold`}>AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={cellBorder()}>{SERVICE_DESCRIPTION}</td>
              <td className={`${cellBorder()} text-center`}>
                {data.shipmentDetails.numberOfBoxes}
              </td>
              <td className={cellBorder()}>{weightLabel}</td>
              <td className={`${cellBorder()} text-center`}>
                {fmt(data.shipmentDetails.rate)}
              </td>
              <td className={`${cellBorder()} text-center`}>0</td>
              <td className={`${cellBorder()} text-right`}>{fmt(shipping)}</td>
            </tr>
          </tbody>
        </table>

        {(delivery > 0 || insurance > 0) && (
          <>
            <p className="text-sm font-semibold mb-2">EXTRA CHARGES :</p>
            <table className="w-full border-collapse mb-4 text-sm">
              <tbody>
                {delivery > 0 && (
                  <tr>
                    <td className={`${cellBorder()} w-[70%]`}>
                      PHILIPPINE LAST-MILE DELIVERY CHARGES
                    </td>
                    <td className={`${cellBorder()} text-right`}>{fmt(delivery)}</td>
                  </tr>
                )}
                {insurance > 0 && (
                  <tr>
                    <td className={cellBorder()}>SHIPMENT PROTECTION FEE</td>
                    <td className={`${cellBorder()} text-right`}>{fmt(insurance)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        )}

        <div className="flex justify-end mb-8">
          <table className="w-72 border-collapse text-sm">
            <tbody>
              <tr>
                <td className={`${cellBorder()} font-bold`}>Total Amount</td>
                <td className={`${cellBorder()} text-right font-bold`}>
                  {fmt(courierBundleAmount)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {(data.remarks.agent || data.remarks.items || data.remarks.boxNumbers) && (
          <div className="text-sm mb-6">
            <p className="font-semibold mb-1">REMARKS:</p>
            {data.remarks.boxNumbers ? <p>BOX# {data.remarks.boxNumbers}</p> : null}
            <p>AGENT: {data.remarks.agent}</p>
            {data.remarks.items ? <p>ITEMS: {data.remarks.items}</p> : null}
          </div>
        )}

        {data.qrCode && (
          <div className="mt-auto p-4 border border-gray-200 rounded-lg">
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm">
                <p className="font-semibold mb-1">DRIVER QR CODE</p>
                <p className="text-gray-600 text-xs">Scan to pay — drivers only</p>
                <p className="text-xs font-mono mt-1">Code: {data.qrCode.code}</p>
              </div>
              <QRCode value={data.qrCode.url} size={120} className="shrink-0" />
            </div>
          </div>
        )}
      </div>

      <div className="tax-invoice-nav no-print flex items-center justify-center gap-3 py-4 border-t bg-muted/30">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page === 1}
          onClick={() => setPage(1)}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Page 1
        </Button>
        <span className="text-sm text-muted-foreground">Page {page} of 2</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page === 2}
          onClick={() => setPage(2)}
        >
          Page 2
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
