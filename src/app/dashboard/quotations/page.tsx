'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api-client';
import { PlusCircle, Printer, Trash2 } from 'lucide-react';

type RouteCode = 'PH_TO_UAE' | 'UAE_TO_PH';

type QuoteItem = {
  id: string;
  name: string;
  quantity: number;
};

type SavedQuotation = {
  _id: string;
  quotation_number: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  route: RouteCode;
  actual_weight_kg: number;
  volumetric_weight_kg: number;
  chargeable_weight_kg: number;
  weight_type: 'ACTUAL' | 'VOLUMETRIC';
  items: { name: string; quantity: number }[];
  rate_per_kg: number;
  rate_bracket?: string;
  shipping_amount: number;
  pickup_location?: 'INSIDE_DUBAI' | 'OUTSIDE_DUBAI';
  pickup_charge?: number;
  pickup_vat?: number;
  delivery_charge?: number;
  insurance_charge?: number;
  total_amount?: number;
  currency?: string;
  notes?: string;
  createdAt?: string;
};

type WeightBracket = {
  min: number;
  max: number | null;
  rate: number;
  label: string;
};

const ROUTE_LABELS: Record<RouteCode, string> = {
  PH_TO_UAE: 'Philippines to UAE',
  UAE_TO_PH: 'UAE to Philippines',
};

const QUOTE_BRACKETS: Record<RouteCode, WeightBracket[]> = {
  PH_TO_UAE: [
    { min: 1, max: 15, rate: 39, label: '1-15 KG' },
    { min: 16, max: 29, rate: 38, label: '16-29 KG' },
    { min: 30, max: 69, rate: 36, label: '30-69 KG' },
    { min: 70, max: 199, rate: 34, label: '70-199 KG' },
    { min: 200, max: 299, rate: 31, label: '200-299 KG' },
    { min: 300, max: null, rate: 30, label: '300+ KG' },
  ],
  UAE_TO_PH: [
    { min: 1, max: 15, rate: 39, label: '1-15 KG' },
    { min: 16, max: 29, rate: 38, label: '16-29 KG' },
    { min: 30, max: 69, rate: 36, label: '30-69 KG' },
    { min: 70, max: 99, rate: 34, label: '70-99 KG' },
    { min: 100, max: 199, rate: 31, label: '100-199 KG' },
    { min: 200, max: null, rate: 30, label: '200+ KG' },
    { min: 1000, max: null, rate: 28, label: '1 TON UP' },
  ],
};

function matchBracket(weight: number, brackets: WeightBracket[]) {
  const available = brackets.filter((bracket) => bracket.label !== 'SPECIAL RATE');
  const closed = available.filter((bracket) => bracket.max !== null).sort((a, b) => a.min - b.min);
  const openEnded = available.filter((bracket) => bracket.max === null).sort((a, b) => b.min - a.min);

  for (const bracket of closed) {
    if (bracket.max !== null && weight >= bracket.min && weight <= bracket.max) return bracket;
  }
  for (const bracket of openEnded) {
    if (weight >= bracket.min) return bracket;
  }
  if (!available.length) return null;
  const lowest = available.reduce((best, current) => (current.min < best.min ? current : best), available[0]);
  if (weight < lowest.min) return lowest;
  return openEnded[0] || closed[closed.length - 1] || available[0];
}

function money(value: number) {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function QuotationsPage() {
  const { toast } = useToast();
  const [quotations, setQuotations] = useState<SavedQuotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [printTarget, setPrintTarget] = useState<SavedQuotation | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [route, setRoute] = useState<RouteCode | ''>('');
  const [actualWeight, setActualWeight] = useState('');
  const [volumetricWeight, setVolumetricWeight] = useState('');
  const [notes, setNotes] = useState('');
  const [pickupLocation, setPickupLocation] = useState<'INSIDE_DUBAI' | 'OUTSIDE_DUBAI' | ''>('');
  const [deliveryCharge, setDeliveryCharge] = useState('');
  const [insuranceCharge, setInsuranceCharge] = useState('');
  const [items, setItems] = useState<QuoteItem[]>([{ id: '1', name: '', quantity: 1 }]);

  const loadQuotations = useCallback(async () => {
    setLoading(true);
    const result = await apiClient.getQuotations({ limit: 100 });
    if (result.success && Array.isArray(result.data)) {
      setQuotations(result.data as SavedQuotation[]);
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to load quotations' });
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    loadQuotations();
  }, [loadQuotations]);

  const actual = parseFloat(actualWeight) || 0;
  const volumetric = parseFloat(volumetricWeight) || 0;
  const chargeable = actual > 0 || volumetric > 0 ? Math.max(actual, volumetric) : 0;
  const weightType = actual >= volumetric ? 'ACTUAL' : 'VOLUMETRIC';
  const bracket = useMemo(
    () => (chargeable > 0 && route ? matchBracket(chargeable, QUOTE_BRACKETS[route]) : null),
    [chargeable, route]
  );
  const shippingAmount = bracket ? Math.round(chargeable * bracket.rate * 100) / 100 : 0;
  const pickupCharge = pickupLocation === 'INSIDE_DUBAI' ? 20 : pickupLocation === 'OUTSIDE_DUBAI' ? 25.71 : 0;
  const pickupVat = Math.round(pickupCharge * 0.05 * 100) / 100;
  const delivery = Math.max(parseFloat(deliveryCharge) || 0, 0);
  const insurance = Math.max(parseFloat(insuranceCharge) || 0, 0);
  const finalAmount = Math.round((shippingAmount + pickupCharge + pickupVat + delivery + insurance) * 100) / 100;

  const resetForm = () => {
    setCustomerName('');
    setCustomerPhone('');
    setCustomerAddress('');
    setRoute('');
    setActualWeight('');
    setVolumetricWeight('');
    setNotes('');
    setPickupLocation('');
    setDeliveryCharge('');
    setInsuranceCharge('');
    setItems([{ id: '1', name: '', quantity: 1 }]);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const validItems = items.filter((item) => item.name.trim() && item.quantity > 0);
    if (!route) {
      toast({ variant: 'destructive', title: 'Route required', description: 'Select PH to UAE or UAE to PH.' });
      return;
    }
    if (actual <= 0 || volumetric <= 0) {
      toast({ variant: 'destructive', title: 'Weights required', description: 'Enter both actual and volumetric weight in kg.' });
      return;
    }
    if (!validItems.length) {
      toast({ variant: 'destructive', title: 'Items required', description: 'Add at least one item.' });
      return;
    }
    if (!pickupLocation) {
      toast({ variant: 'destructive', title: 'Pickup required', description: 'Choose inside Dubai or outside Dubai.' });
      return;
    }

    setSubmitting(true);
    const result = await apiClient.createQuotation({
      customer_name: customerName.trim(),
      customer_phone: customerPhone.trim(),
      customer_address: customerAddress.trim(),
      route,
      actual_weight_kg: actual,
      volumetric_weight_kg: volumetric,
      items: validItems.map((item) => ({ name: item.name.trim(), quantity: item.quantity })),
      pickup_location: pickupLocation,
      delivery_charge: delivery,
      insurance_charge: insurance,
      notes: notes.trim(),
    });
    setSubmitting(false);

    if (result.success) {
      toast({ title: 'Quotation saved', description: 'Saved for the client on this page only.' });
      setShowForm(false);
      resetForm();
      loadQuotations();
    } else {
      toast({ variant: 'destructive', title: 'Could not save', description: result.error || 'Failed to create quotation' });
    }
  };

  const handleDelete = async (id: string) => {
    const result = await apiClient.deleteQuotation(id);
    if (result.success) {
      setQuotations((current) => current.filter((quote) => quote._id !== id));
      if (printTarget?._id === id) setPrintTarget(null);
    } else {
      toast({ variant: 'destructive', title: 'Could not delete', description: result.error || 'Failed to delete quotation' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Quotations</h1>
          <p className="text-sm text-muted-foreground">
            Client quotations only. They stay on this page and are not used anywhere else.
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <PlusCircle className="mr-2 h-4 w-4" />
          New Quotation
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>New manual quotation</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Customer</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="customer_name">Name *</Label>
                    <Input id="customer_name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
                  </div>
                  <div>
                    <Label htmlFor="customer_phone">Phone *</Label>
                    <Input id="customer_phone" type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} required />
                  </div>
                </div>
                <div>
                  <Label htmlFor="customer_address">Address *</Label>
                  <Textarea id="customer_address" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} required rows={2} />
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Route</h3>
                <div className="max-w-md">
                  <Label>Route *</Label>
                  <Select value={route} onValueChange={(value) => setRoute(value as RouteCode)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select route" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PH_TO_UAE">Philippines to UAE</SelectItem>
                      <SelectItem value="UAE_TO_PH">UAE to Philippines</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Weight (kg)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="actual_weight">Actual weight (kg) *</Label>
                    <Input id="actual_weight" type="number" min="0.01" step="0.01" value={actualWeight} onChange={(e) => setActualWeight(e.target.value)} required />
                  </div>
                  <div>
                    <Label htmlFor="volumetric_weight">Volumetric weight (kg) *</Label>
                    <Input id="volumetric_weight" type="number" min="0.01" step="0.01" value={volumetricWeight} onChange={(e) => setVolumetricWeight(e.target.value)} required />
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/40 p-4 text-sm grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <p className="text-muted-foreground">Chargeable weight</p>
                    <p className="font-semibold">{chargeable > 0 ? `${chargeable.toFixed(2)} kg` : '—'}</p>
                    <p className="text-xs text-muted-foreground">{chargeable > 0 ? weightType : 'Higher of actual and volumetric'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Rate</p>
                    <p className="font-semibold">{bracket ? `AED ${money(bracket.rate)} / kg` : '—'}</p>
                    <p className="text-xs text-muted-foreground">{bracket?.label || 'Select a route and enter both weights'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Quoted shipping</p>
                    <p className="font-semibold">{bracket ? `AED ${money(shippingAmount)}` : '—'}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Items</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setItems([...items, { id: Date.now().toString(), name: '', quantity: 1 }])}
                  >
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Add item
                  </Button>
                </div>
                {items.map((item, index) => (
                  <div key={item.id} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                    <div className="md:col-span-6">
                      <Label>Item {index + 1} *</Label>
                      <Input
                        value={item.name}
                        placeholder="Item name"
                        onChange={(e) => setItems(items.map((row) => row.id === item.id ? { ...row, name: e.target.value } : row))}
                        required
                      />
                    </div>
                    <div className="md:col-span-3">
                      <Label>Quantity *</Label>
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => setItems(items.map((row) => row.id === item.id ? { ...row, quantity: parseInt(e.target.value, 10) || 1 } : row))}
                        required
                      />
                    </div>
                    <div className="md:col-span-3">
                      {items.length > 1 && (
                        <Button type="button" variant="outline" onClick={() => setItems(items.filter((row) => row.id !== item.id))}>
                          <Trash2 className="mr-2 h-4 w-4" />
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Charges</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Pickup *</Label>
                    <Select value={pickupLocation} onValueChange={(value) => setPickupLocation(value as 'INSIDE_DUBAI' | 'OUTSIDE_DUBAI')}>
                      <SelectTrigger>
                        <SelectValue placeholder="Inside or outside Dubai" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="INSIDE_DUBAI">Inside Dubai — 20.00 AED</SelectItem>
                        <SelectItem value="OUTSIDE_DUBAI">Outside Dubai — 25.71 AED</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">VAT 5% is added on the pickup charge only.</p>
                  </div>
                  <div>
                    <Label htmlFor="delivery_charge">Delivery charge (AED)</Label>
                    <Input id="delivery_charge" type="number" min="0" step="0.01" placeholder="0.00" value={deliveryCharge} onChange={(e) => setDeliveryCharge(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="insurance_charge">Insurance charge (AED)</Label>
                    <Input id="insurance_charge" type="number" min="0" step="0.01" placeholder="0.00" value={insuranceCharge} onChange={(e) => setInsuranceCharge(e.target.value)} />
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/40 p-4 text-sm space-y-1">
                  <div className="flex justify-between"><span>Shipping</span><span>AED {money(shippingAmount)}</span></div>
                  <div className="flex justify-between"><span>Pickup</span><span>AED {money(pickupCharge)}</span></div>
                  <div className="flex justify-between"><span>VAT 5% on pickup</span><span>AED {money(pickupVat)}</span></div>
                  <div className="flex justify-between"><span>Delivery</span><span>AED {money(delivery)}</span></div>
                  <div className="flex justify-between"><span>Insurance</span><span>AED {money(insurance)}</span></div>
                  <div className="flex justify-between font-semibold pt-1"><span>Final price</span><span>AED {money(finalAmount)}</span></div>
                </div>
              </div>

              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Optional note for the client" />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save quotation'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Saved quotations</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading quotations...</p>
          ) : quotations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No quotations yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Chargeable</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotations.map((quote) => (
                  <TableRow key={quote._id}>
                    <TableCell className="font-medium">{quote.quotation_number}</TableCell>
                    <TableCell>
                      <div>{quote.customer_name}</div>
                      <div className="text-xs text-muted-foreground">{quote.customer_phone}</div>
                    </TableCell>
                    <TableCell>{ROUTE_LABELS[quote.route] || quote.route}</TableCell>
                    <TableCell>{Number(quote.chargeable_weight_kg).toFixed(2)} kg</TableCell>
                    <TableCell>AED {money(Number(quote.total_amount ?? quote.shipping_amount))}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button size="sm" variant="outline" onClick={() => setPrintTarget(quote)}>
                        <Printer className="mr-2 h-4 w-4" />
                        Print
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDelete(quote._id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {printTarget && (
        <div id="quotation-print" className="fixed inset-0 z-50 overflow-y-auto bg-white text-black">
          <style>{`
            @media print {
              body * { visibility: hidden; }
              #quotation-print, #quotation-print * { visibility: visible; }
              #quotation-print { position: absolute; inset: 0; overflow: visible; }
            }
          `}</style>
          <div className="print:hidden flex items-center justify-end gap-2 border-b bg-white px-6 py-3">
            <Button variant="outline" onClick={() => setPrintTarget(null)}>Close</Button>
            <Button onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
          </div>
          <div className="max-w-4xl mx-auto bg-white p-8 shadow-lg">
            <div className="flex justify-between items-start mb-8">
              <div className="flex items-start space-x-4">
                <div className="bg-green-600 text-white px-5 py-4 rounded-lg">
                  <div className="text-3xl font-bold tracking-wide">KNEX</div>
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-green-600 mb-1">Knex Delivery Services L.L.C.</h1>
                  <p className="text-sm text-green-600 mb-2">www.knexpress.ae</p>
                  <p className="text-sm text-gray-700">Dubai, United Arab Emirates</p>
                  <p className="text-xs text-gray-600 mt-1">TRN: 104131637100003</p>
                </div>
              </div>
              <div className="text-right">
                <h2 className="text-3xl font-bold text-black mb-4">QUOTATION</h2>
                <div className="space-y-1 text-sm">
                  <p><span className="font-semibold">QUOTATION #</span> {printTarget.quotation_number}</p>
                  <p><span className="font-semibold">ROUTE</span> {ROUTE_LABELS[printTarget.route] || printTarget.route}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              <div>
                <h3 className="text-lg font-bold text-black mb-4 uppercase">SENDER INFORMATION</h3>
                <div className="space-y-1 text-sm">
                  <p className="font-semibold text-base text-gray-900">Knex Delivery Services L.L.C.</p>
                  <p className="text-xs uppercase tracking-wide text-gray-500">
                    {printTarget.createdAt
                      ? new Date(printTarget.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                      : ''}
                  </p>
                  <p className="leading-relaxed">Dubai, United Arab Emirates</p>
                  <p>www.knexpress.ae</p>
                </div>
              </div>
              <div>
                <h3 className="text-lg font-bold text-black mb-4 uppercase">RECEIVER INFORMATION</h3>
                <div className="space-y-2">
                  <p className="font-semibold text-lg">{printTarget.customer_name}</p>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{printTarget.customer_address}</p>
                  <p className="text-sm">{printTarget.customer_phone}</p>
                </div>
              </div>
            </div>

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
                    <td className="border border-gray-300 px-4 py-2">
                      {printTarget.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0) || 1}
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      <div>
                        <span className="font-semibold">{Number(printTarget.chargeable_weight_kg).toFixed(2)} kg</span>
                        <div className="text-xs text-gray-600">
                          Weight Base: {printTarget.weight_type === 'ACTUAL' ? 'Actual Weight' : 'Volumetric Weight'}
                        </div>
                        <div className="text-xs text-gray-600">
                          Actual {Number(printTarget.actual_weight_kg).toFixed(2)} kg · Volumetric {Number(printTarget.volumetric_weight_kg).toFixed(2)} kg
                        </div>
                      </div>
                    </td>
                    <td className="border border-gray-300 px-4 py-2">{Number(printTarget.rate_per_kg).toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex justify-end mb-8">
              <div className="w-80">
                <table className="w-full border-collapse border border-gray-300">
                  <tbody>
                    <tr>
                      <td className="border border-gray-300 px-4 py-2 text-left">Shipping Charge</td>
                      <td className="border border-gray-300 px-4 py-2 text-right">{Number(printTarget.shipping_amount).toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-300 px-4 py-2 text-left">
                        Pickup Charge {printTarget.pickup_location === 'OUTSIDE_DUBAI' ? '(Outside Dubai)' : printTarget.pickup_location === 'INSIDE_DUBAI' ? '(Inside Dubai)' : ''}
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-right">{Number(printTarget.pickup_charge || 0).toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-300 px-4 py-2 text-left">VAT 5% on Pickup</td>
                      <td className="border border-gray-300 px-4 py-2 text-right">{Number(printTarget.pickup_vat || 0).toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-300 px-4 py-2 text-left">Delivery Charge</td>
                      <td className="border border-gray-300 px-4 py-2 text-right">{Number(printTarget.delivery_charge || 0).toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-300 px-4 py-2 text-left">Insurance Charge</td>
                      <td className="border border-gray-300 px-4 py-2 text-right">{Number(printTarget.insurance_charge || 0).toFixed(2)}</td>
                    </tr>
                    <tr className="bg-gray-100">
                      <td className="border border-gray-300 px-4 py-2 text-left font-bold">Final Price</td>
                      <td className="border border-gray-300 px-4 py-2 text-right font-bold">
                        {Number(printTarget.total_amount ?? printTarget.shipping_amount).toFixed(2)} AED
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div>
                <h4 className="font-semibold mb-2">REMARKS:</h4>
                <div className="space-y-1 text-sm">
                  <p>ITEMS: {printTarget.items.map((item) => `${item.name} x${item.quantity}`).join(', ')}</p>
                  {printTarget.notes ? <p>{printTarget.notes}</p> : null}
                </div>
              </div>
              <div className="text-right">
                <h4 className="font-semibold mb-2">TERMS AND CONDITIONS:</h4>
                <p className="text-sm">Client quotation only. VAT 5% applies to the pickup charge only.</p>
              </div>
            </div>

            <div className="mt-8 border border-gray-300 break-inside-avoid">
              <div className="bg-gray-50 border-b border-gray-300 px-4 py-2 font-semibold">BANK DETAILS</div>
              <div className="grid grid-cols-2 text-sm">
                <div className="p-4 border-r border-gray-300">
                  <h4 className="font-semibold mb-2">PH BANK DETAILS</h4>
                  <p>BANCO DE ORO (BDO UNIBANK)</p>
                  <p>KNEXPRESS DELIVERY SERVICES</p>
                  <p>004718016361</p>
                </div>
                <div className="p-4">
                  <h4 className="font-semibold mb-2">UAE BANK DETAILS</h4>
                  <p>Bank: RAK BANK (National Bank of Ras Al Khaimah)</p>
                  <p>Account Name: KNEX DELIVERY SERVICES LLC</p>
                  <p>Card Number: 5467 5077 4522 5002</p>
                  <p>IBAN Number: AE26 0400 0003 7322 0098 001</p>
                  <p>Account Number: 0373220098001</p>
                  <p>Swift Code: NRAKAEAK</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
