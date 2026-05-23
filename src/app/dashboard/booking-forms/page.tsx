'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { Download, Loader2, Search } from 'lucide-react';
import { downloadBookingFormPdf } from '@/lib/booking-pdf-mapper';
import { secureLog } from '@/lib/secure-logger';

type ApprovedBookingRow = {
  _id: string;
  awb?: string | null;
  review_status?: string;
  createdAt?: string;
  service?: string;
  sender_name?: string | null;
  receiver_name?: string | null;
};

export default function BookingFormsPage() {
  const [awbSearch, setAwbSearch] = useState('');
  const [nameSearch, setNameSearch] = useState('');
  const [results, setResults] = useState<ApprovedBookingRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSearch = async () => {
    const awb = awbSearch.trim();
    const name = nameSearch.trim();
    if (!awb && !name) {
      toast({
        variant: 'destructive',
        title: 'Search required',
        description: 'Enter an AWB or a sender/receiver name.',
      });
      return;
    }

    setSearching(true);
    setHasSearched(true);
    try {
      const result = await apiClient.searchApprovedBookingForms({
        ...(awb ? { awb } : {}),
        ...(name ? { name } : {}),
      });
      if (result.success) {
        const rows = Array.isArray(result.data) ? result.data : [];
        setResults(rows as ApprovedBookingRow[]);
        if (rows.length === 0) {
          toast({
            title: 'No results',
            description: 'No reviewed bookings matched your search.',
          });
        }
      } else {
        setResults([]);
        toast({
          variant: 'destructive',
          title: 'Search failed',
          description: (result as { error?: string }).error || 'Could not search bookings.',
        });
      }
    } catch (error) {
      secureLog.error('searchApprovedBookingForms failed', error);
      setResults([]);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to search bookings.',
      });
    } finally {
      setSearching(false);
    }
  };

  const handleDownloadPdf = async (row: ApprovedBookingRow) => {
    try {
      setDownloadingId(row._id);
      const result = await apiClient.getBookingForReview(row._id);
      const fullBooking =
        result.success && result.data
          ? (result.data as Record<string, unknown>)
          : (row as unknown as Record<string, unknown>);

      await downloadBookingFormPdf(fullBooking, { excludeIdentityDocuments: true });

      toast({
        title: 'Downloaded',
        description: 'Booking form PDF saved (without identity documents).',
      });
    } catch (error) {
      secureLog.error('booking form PDF download failed', error);
      toast({
        variant: 'destructive',
        title: 'Download failed',
        description: 'Could not generate PDF. Please try again.',
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const formatDate = (value?: string) => {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString();
    } catch {
      return value;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Booking Forms</h1>
        <p className="text-muted-foreground">
          Search reviewed and approved bookings, then download the booking form PDF without
          identity documents.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="awb-search">AWB number</Label>
              <Input
                id="awb-search"
                placeholder="Partial or full AWB…"
                value={awbSearch}
                onChange={(e) => setAwbSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <div>
              <Label htmlFor="name-search">Sender or receiver name</Label>
              <Input
                id="name-search"
                placeholder="First name, last name, or full name…"
                value={nameSearch}
                onChange={(e) => setNameSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Use AWB or name (not both required). Only reviewed/approved bookings are shown;
            rejected bookings are excluded.
          </p>
          <Button type="button" onClick={handleSearch} disabled={searching}>
            {searching ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Searching…
              </>
            ) : (
              <>
                <Search className="h-4 w-4 mr-2" />
                Search
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Results</CardTitle>
        </CardHeader>
        <CardContent>
          {searching ? (
            <p className="text-muted-foreground py-8 text-center">Searching…</p>
          ) : !hasSearched ? (
            <p className="text-muted-foreground py-8 text-center">
              Enter AWB or name and click Search.
            </p>
          ) : results.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center">No matching bookings.</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>AWB</TableHead>
                    <TableHead>Sender</TableHead>
                    <TableHead>Receiver</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Reviewed</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((row) => (
                    <TableRow key={row._id}>
                      <TableCell className="font-mono text-sm">{row.awb || '—'}</TableCell>
                      <TableCell>{row.sender_name || '—'}</TableCell>
                      <TableCell>{row.receiver_name || '—'}</TableCell>
                      <TableCell>{row.service || '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(row.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={downloadingId === row._id}
                          onClick={() => handleDownloadPdf(row)}
                        >
                          {downloadingId === row._id ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              PDF…
                            </>
                          ) : (
                            <>
                              <Download className="h-4 w-4 mr-2" />
                              Download PDF
                            </>
                          )}
                        </Button>
                      </TableCell>
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
