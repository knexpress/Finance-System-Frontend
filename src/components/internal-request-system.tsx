'use client';

import { useState } from 'react';
import { InternalRequest, UserProfile, Department } from '@/lib/types';
import { departments } from '@/lib/data';
import { secureLog } from '@/lib/secure-logger';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle } from 'lucide-react';
import { Badge } from './ui/badge';
import { Card, CardContent } from './ui/card';
import { createInternalRequest } from '@/lib/actions';

const requestSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters.'),
  description: z.string().min(10, 'Description must be at least 10 characters.'),
  targetDepartment: z.enum(["Sales", "Operations", "Finance", "HR", "Management", "IT", "Auditor"]),
});

export default function InternalRequestSystem({ 
  requests, 
  currentUser, 
  onTicketUpdate 
}: { 
  requests: any[], 
  currentUser: UserProfile,
  onTicketUpdate?: () => void 
}) {
  secureLog.debug('InternalRequestSystem received requests', { count: Array.isArray(requests) ? requests.length : 0, isArray: Array.isArray(requests) });
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();
  const form = useForm<z.infer<typeof requestSchema>>({
    resolver: zodResolver(requestSchema),
    defaultValues: {
      title: '',
      description: '',
    },
  });

  async function onSubmit(values: z.infer<typeof requestSchema>) {
    const result = await createInternalRequest(values, currentUser);
    
    if (result.success) {
      toast({
        title: 'Request Submitted',
        description: `Successfully submitted request: "${values.title}".`,
      });
      setIsDialogOpen(false);
      form.reset();
      // Call the callback to refresh the tickets list
      if (onTicketUpdate) {
        onTicketUpdate();
      }
    } else {
       toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Could not submit request.',
      });
    }
  }

  return (
    <div className="space-y-4">
        <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Internal Request System</h2>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                <Button>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Create Request
                </Button>
                </DialogTrigger>
                <DialogContent>
                <DialogHeader>
                    <DialogTitle>Create a New Internal Request</DialogTitle>
                    <DialogDescription>
                    Describe the task and assign it to the appropriate department. Your name and department will be attached automatically.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                        control={form.control}
                        name="title"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Title</FormLabel>
                            <FormControl>
                            <Input placeholder="e.g., Onboard new client" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                     <FormField
                        control={form.control}
                        name="targetDepartment"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Target Department</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select a department" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {departments.filter(d => d !== currentUser.department.name).map(dep => <SelectItem key={dep} value={dep}>{dep}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="description"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Description</FormLabel>
                            <FormControl>
                            <Textarea placeholder="Please provide all necessary details for the task..." {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <Button type="submit" disabled={form.formState.isSubmitting}>
                        {form.formState.isSubmitting ? 'Submitting...' : 'Submit Request'}
                    </Button>
                    </form>
                </Form>
                </DialogContent>
            </Dialog>
        </div>
        <Card>
            <CardContent className="p-0">
                <Table>
                    <TableHeader>
                    <TableRow>
                        <TableHead>Request ID</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>Raised By</TableHead>
                        <TableHead>From Dept.</TableHead>
                        <TableHead>For Dept.</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                    </TableRow>
                    </TableHeader>
                    <TableBody>
                    {(Array.isArray(requests) ? requests : []).map((request) => (
                        <TableRow key={request._id}>
                        <TableCell className="font-mono text-xs">{request.ticket_id || request._id.slice(-8)}</TableCell>
                        <TableCell className="font-medium">{request.title}</TableCell>
                        <TableCell>{request.reported_by?.full_name || 'Unknown'}</TableCell>
                        <TableCell><Badge variant="outline">{request.reported_by?.department_id?.name || 'Unknown'}</Badge></TableCell>
                        <TableCell><Badge variant="secondary">{request.assigned_to?.department_id?.name || 'Unassigned'}</Badge></TableCell>
                        <TableCell>{new Date(request.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell>
                            <Badge className={
                              request.status === 'OPEN' ? 'bg-red-500 text-white' : 
                              request.status === 'IN_PROGRESS' ? 'bg-yellow-500 text-white' : 
                              request.status === 'RESOLVED' ? 'bg-blue-500 text-white' :
                              'bg-green-500 text-white'
                            }>
                                {request.status}
                            </Badge>
                        </TableCell>
                        </TableRow>
                    ))}
                    {(Array.isArray(requests) ? requests : []).length === 0 && (
                        <TableRow>
                            <TableCell colSpan={7} className="text-center">No internal requests found.</TableCell>
                        </TableRow>
                    )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    </div>
  );
}
