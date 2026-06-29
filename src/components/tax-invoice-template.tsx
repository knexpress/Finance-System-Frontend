'use client';

import React from 'react';
import { isUaeToPhService } from '@/lib/invoice-request-utils';
import UaeToPhTaxInvoiceTemplate, {
  type UaeToPhTaxInvoiceData,
} from '@/components/uae-to-ph-tax-invoice-template';
import TaxInvoiceTemplateLegacy from '@/components/tax-invoice-template-legacy';

export type TaxInvoiceData = UaeToPhTaxInvoiceData & {
  isUaeToPh?: boolean;
  isPhToUae?: boolean;
  serviceCode?: string;
};

interface TaxInvoiceTemplateProps {
  data: TaxInvoiceData;
}

export function usesUaeToPhTaxInvoiceLayout(data: TaxInvoiceData): boolean {
  if (data.isUaeToPh === true) return true;
  return isUaeToPhService(data.serviceCode);
}

export default function TaxInvoiceTemplate({ data }: TaxInvoiceTemplateProps) {
  if (usesUaeToPhTaxInvoiceLayout(data)) {
    return <UaeToPhTaxInvoiceTemplate data={data} />;
  }
  return <TaxInvoiceTemplateLegacy data={data} />;
}
