'use client';

import { memo, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { Badge } from '@/components/ui/badge';
import { Hash, Phone, MapPin, ArrowRight, AlertTriangle, Truck } from 'lucide-react';

const VerificationForm = dynamic(() => import('@/components/verification-form'), {
  ssr: false,
});

export interface InvoiceRequestCardProps {
  request: any;
  userProfile: any;
  formatWeightValue: (value: any) => string | null;
  formatDateLabel: (date: string | Date) => string;
  formatServiceCode: (code?: string | null) => string;
  getStatusBadgeColor: (status: string) => string;
  renderActionControls: (request: any) => ReactNode;
  fetchInvoiceRequests: () => void;
}

const InvoiceRequestCard = memo(function InvoiceRequestCard({
  request,
  userProfile,
  formatWeightValue,
  formatDateLabel,
  formatServiceCode,
  getStatusBadgeColor,
  renderActionControls,
  fetchInvoiceRequests,
}: InvoiceRequestCardProps) {
  const shortId =
    request.invoice_number ||
    request.tracking_code ||
    (request._id ? request._id.slice(-8) : 'REQUEST');

  const awbNumber =
    request.tracking_code ||
    request.awb_number ||
    request.request_id?.tracking_code ||
    request.request_id?.awb_number ||
    'N/A';

  const weightDisplay =
    formatWeightValue(request.weight) ||
    formatWeightValue(request.weight_kg) ||
    formatWeightValue(request.verification?.actual_weight);
  const routeFrom = request.origin_place || 'Not set';
  const routeTo = request.destination_place || 'Not set';
  const createdLabel = formatDateLabel(request.createdAt);
  const totalBoxes =
    request.verification?.number_of_boxes ||
    request.number_of_boxes ||
    request.verification?.boxes?.length;
  const actions = renderActionControls(request);

  const hasInvoice = !!(request.invoice_id || request.invoice_number);
  const isSales = userProfile?.department?.name === 'Sales';

  // Service label from database (for Sales view)
  const serviceLabel =
    request.service ||
    request.service_code ||
    request.request_id?.service ||
    request.request_id?.service_code ||
    request.booking?.service ||
    request.booking?.service_code ||
    '';

  return (
    <div
      key={request._id}
      className={`rounded-2xl border p-4 shadow-sm transition ${
        hasInvoice
          ? 'border-green-500/50 bg-green-50/30 hover:border-green-500/70'
          : 'border-border/60 bg-card hover:border-primary/40'
      }`}
    >
      <div className="flex flex-col gap-3 border-b border-dashed pb-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <Badge
            variant="outline"
            className="font-mono text-xs uppercase"
          >
            {shortId}
          </Badge>
          <span className="text-xs text-muted-foreground">
            Created {createdLabel}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className={getStatusBadgeColor(request.status)}>
            {request.status}
          </Badge>
          {request.has_delivery && (
            <Badge variant="secondary">Delivery</Badge>
          )}
        </div>
      </div>

      <div className="grid gap-4 pt-4 md:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">AWB Number</p>
          <div className="flex items-center gap-1.5">
            <Hash className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="font-mono font-semibold text-foreground text-sm">{awbNumber}</p>
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Customer</p>
          <p className="font-semibold text-foreground">{request.customer_name}</p>
          {!isSales && request.customer_phone && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Phone className="h-3.5 w-3.5" />
              <span>{request.customer_phone}</span>
            </div>
          )}
        </div>

        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Receiver</p>
          <p className="font-semibold text-foreground">{request.receiver_name}</p>
          {request.receiver_company && (
            <p className="text-sm text-muted-foreground">{request.receiver_company}</p>
          )}
          {!isSales && request.receiver_phone && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Phone className="h-3.5 w-3.5" />
              <span>{request.receiver_phone}</span>
            </div>
          )}
        </div>

        {isSales ? (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Service</p>
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-primary" />
              <span className="font-semibold text-foreground">
                {serviceLabel ? formatServiceCode(serviceLabel) : 'Not set'}
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Route</p>
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <div className="flex-1 space-y-1">
                <div className="flex items-start gap-1 font-medium text-foreground">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 text-primary" />
                  <span className="break-words">{routeFrom}</span>
                </div>
                <p className="text-xs uppercase tracking-wide opacity-80">Origin</p>
              </div>
              <ArrowRight className="mt-1 h-4 w-4 text-primary" />
              <div className="flex-1 space-y-1">
                <div className="flex items-start gap-1 font-medium text-foreground">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 text-orange-500" />
                  <span className="break-words">{routeTo}</span>
                </div>
                <p className="text-xs uppercase tracking-wide opacity-80">Destination</p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Shipment</p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              {request.shipment_type === 'DOCUMENT' ? 'Document' : 'Non-Document'}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Weight:{' '}
            {weightDisplay ? (
              <span className="font-semibold text-foreground">{weightDisplay} kg</span>
            ) : (
              'Not set'
            )}
          </p>
          {totalBoxes && (
            <p className="text-sm text-muted-foreground">
              Boxes:{' '}
              <span className="font-semibold text-foreground">{totalBoxes}</span>
            </p>
          )}
        </div>
      </div>

      {userProfile?.department?.name === 'Operations' && request.status === 'IN_PROGRESS' && (
        <div className="mt-4 rounded-lg border border-dashed border-orange-200 bg-orange-50 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-orange-700">
            <AlertTriangle className="h-4 w-4" />
            <span>Complete the verification before sending to Finance</span>
          </div>
          <div className="mt-3">
            <VerificationForm
              request={request}
              onVerificationComplete={fetchInvoiceRequests}
              currentUser={userProfile}
            />
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3 border-t pt-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Service:</span>
          <Badge variant="outline">{formatServiceCode(request.service_code)}</Badge>
          {request.has_delivery && <Badge variant="secondary">Delivery Required</Badge>}
          {request.is_leviable && <Badge variant="outline">VAT applicable</Badge>}
        </div>
        {actions ? (
          <div className="flex flex-wrap gap-2">{actions}</div>
        ) : (
          <div className="text-xs text-muted-foreground">No actions available</div>
        )}
      </div>
    </div>
  );
});

export default InvoiceRequestCard;
