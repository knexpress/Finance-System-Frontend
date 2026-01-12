'use client';

import { useMemo, useState } from 'react';
import { CashFlowTransaction, TransactionType } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { PlusCircle, MinusCircle, ArrowDown, ArrowUp } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import { useToast } from '@/hooks/use-toast';
import { addCashFlowTransaction } from '@/lib/actions';

const transactionSchema = z.object({
  description: z.string().min(2, 'Description must be at least 2 characters.'),
  amount: z.coerce.number().positive('Amount must be a positive number.'),
  taxRate: z.coerce.number().min(0, 'Tax rate must be non-negative.').max(100, "Tax rate can't exceed 100."),
});

function TransactionDialog({
  type,
  children,
}: {
  type: TransactionType;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();
  const form = useForm<z.infer<typeof transactionSchema>>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      description: '',
      amount: 0,
      taxRate: 0,
    },
  });

  async function onSubmit(values: z.infer<typeof transactionSchema>) {
    const result = await addCashFlowTransaction({ ...values, type });
    if (result.success) {
      toast({
        title: `Transaction Added`,
        description: `Successfully added ${type}: ${values.description}.`,
      });
      setIsOpen(false);
      form.reset();
    } else {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Could not add transaction.',
      });
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New {type}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Input placeholder={`e.g., Office Supplies`} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="100.00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="taxRate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tax Rate (%)</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="15" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Adding...' : `Add ${type}`}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function CashFlowTracker({
  transactions,
}: {
  transactions: CashFlowTransaction[];
}) {
  // Ensure transactions is always an array
  const safeTransactions = Array.isArray(transactions) ? transactions : [];
  console.log('CashFlowTracker received transactions:', safeTransactions); // Debug log
  
  const { totalIncome, totalExpenses, netCashFlow } = useMemo(() => {
    const income = safeTransactions
      .filter((t) => t && t.type === 'Income' && typeof t.amount === 'number')
      .reduce((sum, t) => sum + t.amount, 0);
    const expenses = safeTransactions
      .filter((t) => t && t.type === 'Expense' && typeof t.amount === 'number')
      .reduce((sum, t) => sum + t.amount * (1 + (t.taxRate || 0) / 100), 0);
    return {
      totalIncome: income,
      totalExpenses: expenses,
      netCashFlow: income - expenses,
    };
  }, [safeTransactions]);

  const formatCurrency = (amount: number) => {
    if (typeof amount !== 'number' || isNaN(amount)) {
      return 'AED 0.00';
    }
    return new Intl.NumberFormat('en-AE', {
      style: 'currency',
      currency: 'AED',
    }).format(amount);
  };

  return (
    <div className="space-y-8">
        <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold">Cash Flow</h1>
            <div className="flex gap-2">
                <TransactionDialog type="Income">
                    <Button>
                        <PlusCircle className="mr-2" />
                        Add Income
                    </Button>
                </TransactionDialog>
                <TransactionDialog type="Expense">
                    <Button variant="destructive">
                        <MinusCircle className="mr-2" />
                        Add Expense
                    </Button>
                </TransactionDialog>
            </div>
        </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Income</CardTitle>
            <ArrowUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              {formatCurrency(totalIncome)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
            <ArrowDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">
              {formatCurrency(totalExpenses)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Net Cash Flow</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${netCashFlow >= 0 ? 'text-gray-800' : 'text-red-500'}`}>
              {formatCurrency(netCashFlow)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Tax Rate</TableHead>
                <TableHead className="text-right">Total (with tax)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {safeTransactions.filter(t => t && t.id && t.type && typeof t.amount === 'number').map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{t.date || 'N/A'}</TableCell>
                  <TableCell className="font-medium">{t.description || 'N/A'}</TableCell>
                  <TableCell>
                    <Badge variant={t.type === 'Income' ? 'default' : 'destructive'} className={t.type === 'Income' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                      {t.type}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatCurrency(t.amount)}</TableCell>
                  <TableCell>{t.taxRate || 0}%</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(t.amount * (1 + (t.taxRate || 0) / 100))}
                  </TableCell>
                </TableRow>
              ))}
              {safeTransactions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">No transactions found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
