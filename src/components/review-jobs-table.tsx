'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Request, ShipmentType, ServiceType, DeliveryStatus } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Eye } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Separator } from './ui/separator';
import { approveRequest } from '@/lib/actions';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

const shipmentTypes = ["Docs", "Non-Docs", "Grocery", "Other"] as const;
const serviceTypes = ["Inbound", "Outbound", "Domestic"] as const;
const deliveryStatuses = ["Completed", "RTS", "Pending"] as const;

const reviewSchema = z.object({
  awbNumber: z.string().min(5, "AWB number is required."),
  receiverName: z.string().min(2, "Receiver name is required."),
  weight: z.coerce.number().positive("Weight must be a positive number."),
  shipmentType: z.enum(shipmentTypes),
  serviceType: z.enum(serviceTypes),
  deliveryStatus: z.enum(deliveryStatuses),
});


export default function ReviewRequestsTable({ requests }: { requests: Request[] }) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const form = useForm<z.infer<typeof reviewSchema>>({
    resolver: zodResolver(reviewSchema),
    defaultValues: {
      awbNumber: '',
      receiverName: '',
      weight: 0,
      shipmentType: "Non-Docs",
      serviceType: "Outbound",
      deliveryStatus: "Pending",
    },
  });

  const handleApproveRequest = (values: z.infer<typeof reviewSchema>) => {
    if (!selectedRequest) return;
    startTransition(async () => {
      const result = await approveRequest(selectedRequest.id, values);
      if (result.success) {
        toast({ title: 'Request Approved', description: `Request #${selectedRequest.id} has been forwarded.` });
        setIsDialogOpen(false);
      } else {
        toast({ variant: 'destructive', title: 'Error', description: 'Could not approve request.' });
      }
    });
  };
  
  const handleOpenDialog = (request: Request) => {
    setSelectedRequest(request);
    form.reset({
      awbNumber: request.awbNumber || '',
      receiverName: request.receiverName || '',
      weight: request.weight || 0,
      shipmentType: request.shipmentType || "Non-Docs",
      serviceType: request.serviceType || "Outbound",
      deliveryStatus: request.deliveryStatus || "Pending",
    });
    setIsDialogOpen(true);
  }


  return (
    <Card>
      <CardHeader>
        <CardTitle>Review Pending Requests</CardTitle>
        <CardDescription>Review details of new invoice requests and approve them to be sent to Finance for invoicing.</CardDescription>
      </CardHeader>
      <CardContent>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Request ID</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Origin</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell className="font-mono text-xs">{request.id}</TableCell>
                  <TableCell>{request.clientName}</TableCell>
                  <TableCell>{request.description}</TableCell>
                  <TableCell>{request.origin}</TableCell>
                  <TableCell>{request.destination}</TableCell>
                  <TableCell>${request.value?.toLocaleString()}</TableCell>
                  <TableCell>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" onClick={() => handleOpenDialog(request)}>
                        <Eye className="mr-2 h-4 w-4" />
                        View & Approve
                      </Button>
                    </DialogTrigger>
                  </TableCell>
                </TableRow>
              ))}
              {requests.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center">No pending requests to review.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {selectedRequest && (
            <DialogContent className="sm:max-w-[625px]">
              <DialogHeader>
                <DialogTitle>Review Request: {selectedRequest.id}</DialogTitle>
                <DialogDescription>
                  Add cargo weight and other operational details before approving.
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleApproveRequest)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="awbNumber" render={({ field }) => (
                        <FormItem>
                          <FormLabel>AWB Number</FormLabel>
                          <FormControl><Input placeholder="AWB123456" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField control={form.control} name="receiverName" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Receiver Name</FormLabel>
                          <FormControl><Input placeholder="John Receiver" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField control={form.control} name="weight" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Weight (kg)</FormLabel>
                          <FormControl><Input type="number" placeholder="500" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                     <FormField control={form.control} name="shipmentType" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Shipment Type</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              {shipmentTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                     <FormField control={form.control} name="serviceType" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Service Type</FormLabel>
                           <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              {serviceTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField control={form.control} name="deliveryStatus" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Delivery Status</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              {deliveryStatuses.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <Separator />
                   <div className="space-y-2 text-sm">
                      <p><strong>Client:</strong> {selectedRequest.clientName}</p>
                      <p><strong>Description:</strong> {selectedRequest.description}</p>
                      <p><strong>Value:</strong> ${selectedRequest.value?.toLocaleString()}</p>
                  </div>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline" type="button">Cancel</Button>
                    </DialogClose>
                    <Button type="submit" disabled={isPending}>
                      {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Approve & Send to Finance
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          )}
        </Dialog>
      </CardContent>
    </Card>
  );
}
