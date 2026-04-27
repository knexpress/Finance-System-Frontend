'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { History, Search } from 'lucide-react';

interface BookingLogItem {
  _id: string;
  awb?: string;
  awb_number?: string;
  tracking_code?: string;
  customer_name?: string;
  receiver_name?: string;
  sender?: {
    fullName?: string;
  };
  receiver?: {
    fullName?: string;
  };
  review_status?: string;
  reviewed_at?: string;
  reviewed_by_employee_id?: string | { _id?: string; full_name?: string; email?: string };
}

interface UserListItem {
  _id: string;
  full_name?: string;
  employee_id?: string | { _id?: string };
}

const formatDate = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(date);
};

const formatTime = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
};

const getAwb = (booking: BookingLogItem) =>
  booking.awb || booking.awb_number || booking.tracking_code || '-';

const getReviewer = (reviewedBy: BookingLogItem['reviewed_by_employee_id']) => {
  if (!reviewedBy) return '-';
  if (typeof reviewedBy === 'string') return reviewedBy;
  return reviewedBy.full_name || reviewedBy.email || reviewedBy._id || '-';
};

const getCustomerName = (booking: BookingLogItem) =>
  booking.sender?.fullName || booking.customer_name || '-';

const getReceiverName = (booking: BookingLogItem) =>
  booking.receiver?.fullName || booking.receiver_name || '-';

export default function LogsPage() {
  const [bookings, setBookings] = useState<BookingLogItem[]>([]);
  const [reviewerMap, setReviewerMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { toast } = useToast();
  const { department } = useAuth();

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        setLoading(true);
        const [bookingsResult, usersResult] = await Promise.all([
          apiClient.getAllBookings(undefined, false),
          apiClient.getUsers(false),
        ]);

        if (!bookingsResult.success || !bookingsResult.data) {
          throw new Error(bookingsResult.error || 'Failed to fetch booking logs');
        }

        const data = Array.isArray(bookingsResult.data) ? (bookingsResult.data as BookingLogItem[]) : [];
        const reviewedOnly = data
          .filter((booking) => booking.reviewed_at || booking.review_status === 'reviewed' || booking.review_status === 'rejected')
          .sort((a, b) => {
            const t1 = a.reviewed_at ? new Date(a.reviewed_at).getTime() : 0;
            const t2 = b.reviewed_at ? new Date(b.reviewed_at).getTime() : 0;
            return t2 - t1;
          });
        setBookings(reviewedOnly);

        if (usersResult.success && Array.isArray(usersResult.data)) {
          const map: Record<string, string> = {};
          for (const user of usersResult.data as UserListItem[]) {
            if (!user.full_name) continue;
            if (user._id) map[user._id] = user.full_name;
            const employeeId = typeof user.employee_id === 'string' ? user.employee_id : user.employee_id?._id;
            if (employeeId) map[employeeId] = user.full_name;
          }
          setReviewerMap(map);
        }
      } catch (error) {
        console.error('Failed to fetch booking logs:', error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Could not load booking logs',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, [toast]);

  const filteredLogs = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return bookings;

    return bookings.filter((booking) => {
      const searchable = [
        getAwb(booking),
        getCustomerName(booking),
        getReceiverName(booking),
        booking.review_status || '',
        (() => {
          const reviewerRaw = getReviewer(booking.reviewed_by_employee_id);
          return reviewerMap[reviewerRaw] || reviewerRaw;
        })(),
      ]
        .join(' ')
        .toLowerCase();
      return searchable.includes(query);
    });
  }, [bookings, search, reviewerMap]);

  if (department && department.name !== 'Management' && department.name !== 'IT') {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-muted-foreground">You do not have access to booking logs.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Booking Logs
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 max-w-md">
            <Label htmlFor="logs-search">Search logs</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="logs-search"
                className="pl-9"
                placeholder="AWB, customer, reviewer, status..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {loading ? (
            <div className="py-8 text-sm text-muted-foreground">Loading booking logs...</div>
          ) : filteredLogs.length === 0 ? (
            <div className="py-8 text-sm text-muted-foreground">No reviewed booking logs found.</div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>AWB</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Receiver</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reviewed By</TableHead>
                    <TableHead>Date (dd/mm/yy)</TableHead>
                    <TableHead>Time (hh:mm:ss)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((booking) => (
                    <TableRow key={booking._id}>
                      <TableCell className="font-mono text-xs">{getAwb(booking)}</TableCell>
                      <TableCell>{getCustomerName(booking)}</TableCell>
                      <TableCell>{getReceiverName(booking)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{booking.review_status || '-'}</Badge>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const reviewerRaw = getReviewer(booking.reviewed_by_employee_id);
                          return reviewerMap[reviewerRaw] || reviewerRaw;
                        })()}
                      </TableCell>
                      <TableCell>{formatDate(booking.reviewed_at)}</TableCell>
                      <TableCell>{formatTime(booking.reviewed_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
