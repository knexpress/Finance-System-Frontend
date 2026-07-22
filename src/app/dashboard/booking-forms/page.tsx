'use client';

import { useRef, useState } from 'react';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Download, Loader2, Search, User } from 'lucide-react';
import { downloadBookingFormPdf } from '@/lib/booking-pdf-mapper';
import { secureLog } from '@/lib/secure-logger';

type NameHit = {
  _id: string;
  display_name: string;
  sender_name?: string | null;
  receiver_name?: string | null;
  match_side?: string;
};

type BookingSummary = {
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
  const [nameHits, setNameHits] = useState<NameHit[]>([]);
  const [awbResults, setAwbResults] = useState<BookingSummary[]>([]);
  const [selectedSummary, setSelectedSummary] = useState<BookingSummary | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingSummaryId, setLoadingSummaryId] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchMode, setSearchMode] = useState<'names' | 'summaries' | null>(null);
  const [searchMeta, setSearchMeta] = useState<{
    count?: number;
    hasMore?: boolean;
    timedOut?: boolean;
  } | null>(null);
  const [nextCursor, setNextCursor] = useState<{
    beforeCreatedAt?: string | Date;
    beforeId?: string;
  } | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState<{ awb?: string; name?: string } | null>(null);
  const searchSeq = useRef(0);
  const { toast } = useToast();

  type SearchMeta = {
    count?: number;
    hasMore?: boolean;
    nextCursor?: { beforeCreatedAt?: string | Date; beforeId?: string } | null;
    timedOut?: boolean;
  };

  const applySearchMeta = (meta?: SearchMeta, countFallback = 0) => {
    setSearchMeta({
      count: meta?.count ?? countFallback,
      hasMore: !!meta?.hasMore,
      timedOut: !!meta?.timedOut,
    });
    setNextCursor(meta?.nextCursor || null);
  };

  const mergeNameHits = (prev: NameHit[], incoming: NameHit[]) => {
    const seen = new Set(prev.map((h) => h._id));
    const added = incoming.filter((h) => !seen.has(h._id));
    return added.length ? [...prev, ...added] : prev;
  };

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
    if (!awb && name.length < 2) {
      toast({
        variant: 'destructive',
        title: 'Name too short',
        description: 'Enter at least 2 characters for name search.',
      });
      return;
    }

    const seq = ++searchSeq.current;
    setSearching(true);
    setLoadingMore(false);
    setHasSearched(true);
    setNameHits([]);
    setAwbResults([]);
    setSelectedSummary(null);
    setSearchMeta(null);
    setNextCursor(null);
    setSearchMode(null);
    setLastQuery(awb ? { awb } : { name });

    try {
      // Prefer AWB when provided (ignore leftover name text for this request)
      if (awb) {
        const result = await apiClient.searchApprovedBookingForms({ awb });
        if (seq !== searchSeq.current) return;
        if (result.success) {
          const rows = Array.isArray(result.data) ? (result.data as BookingSummary[]) : [];
          const meta = (result as { meta?: SearchMeta }).meta;
          setSearchMode('summaries');
          setAwbResults(rows);
          applySearchMeta(meta, rows.length);
          if (rows.length === 0) {
            toast({
              title: meta?.timedOut ? 'Search timed out' : 'No results',
              description: meta?.timedOut
                ? 'AWB search took too long. Try the full AWB again.'
                : 'No bookings matched that AWB. Check for typos and try the full number.',
            });
          }
        } else {
          toast({
            variant: 'destructive',
            title: 'Search failed',
            description: (result as { error?: string }).error || 'Could not search bookings.',
          });
        }
        return;
      }

      setSearchMode('names');
      const result = await apiClient.searchApprovedBookingForms({ name });
      if (seq !== searchSeq.current) return;

      if (!result.success) {
        toast({
          variant: 'destructive',
          title: 'Search failed',
          description: (result as { error?: string }).error || 'Could not search bookings.',
        });
        return;
      }

      const hits = Array.isArray(result.data) ? (result.data as NameHit[]) : [];
      const meta = (result as { meta?: SearchMeta }).meta;
      setNameHits(hits);
      applySearchMeta(meta, hits.length);

      if (hits.length === 0) {
        toast({
          title: meta?.timedOut ? 'Search timed out' : 'No results',
          description: meta?.timedOut
            ? 'Try again with first and last name.'
            : 'No similar names found.',
        });
      }
    } catch (error) {
      if (seq !== searchSeq.current) return;
      secureLog.error('searchApprovedBookingForms failed', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to search bookings.',
      });
    } finally {
      if (seq === searchSeq.current) {
        setSearching(false);
        setLoadingMore(false);
      }
    }
  };

  const handleLoadMore = async () => {
    if (!lastQuery || !nextCursor || loadingMore || searching) return;
    const seq = searchSeq.current;
    setLoadingMore(true);
    try {
      const result = await apiClient.searchApprovedBookingForms({
        ...lastQuery,
        beforeCreatedAt: nextCursor.beforeCreatedAt,
        beforeId: nextCursor.beforeId,
      });
      if (seq !== searchSeq.current) return;
      if (!result.success) return;

      const meta = (result as { meta?: SearchMeta }).meta;
      if (searchMode === 'names') {
        const rows = Array.isArray(result.data) ? (result.data as NameHit[]) : [];
        const merged = mergeNameHits(nameHits, rows);
        setNameHits(merged);
        applySearchMeta({ ...meta, count: merged.length }, merged.length);
      } else {
        const rows = Array.isArray(result.data) ? (result.data as BookingSummary[]) : [];
        const seen = new Set(awbResults.map((r) => r._id));
        const merged = [...awbResults, ...rows.filter((r) => !seen.has(r._id))];
        setAwbResults(merged);
        applySearchMeta({ ...meta, count: merged.length }, merged.length);
      }
    } catch (error) {
      secureLog.error('booking forms load more failed', error);
    } finally {
      if (seq === searchSeq.current) setLoadingMore(false);
    }
  };

  const handleSelectName = async (hit: NameHit) => {
    try {
      setLoadingSummaryId(hit._id);
      setSelectedSummary(null);
      const result = await apiClient.getBookingFormSummary(hit._id);
      if (result.success && result.data) {
        setSelectedSummary(result.data as BookingSummary);
      } else {
        toast({
          variant: 'destructive',
          title: 'Load failed',
          description: (result as { error?: string }).error || 'Could not load booking info.',
        });
      }
    } catch (error) {
      secureLog.error('getBookingFormSummary failed', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load booking info.',
      });
    } finally {
      setLoadingSummaryId(null);
    }
  };

  const handleDownloadPdf = async (row: BookingSummary) => {
    try {
      setDownloadingId(row._id);
      // Full file is fetched only when downloading
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

  const formatReviewStatus = (status?: string) => {
    const s = (status || 'not reviewed').toLowerCase().trim();
    if (s === 'reviewed' || s === 'approved') return { label: 'Reviewed', variant: 'default' as const };
    if (s === 'rejected') return { label: 'Rejected', variant: 'destructive' as const };
    return { label: 'Not reviewed', variant: 'secondary' as const };
  };

  const formatDate = (value?: string | null) => {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const closeSelectedBooking = (open: boolean) => {
    if (!open) setSelectedSummary(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Booking Forms</h1>
        <p className="text-muted-foreground">
          Search by name to see matching names first. Click a name to load that booking, then
          download the PDF.
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
                placeholder="e.g. SARAH TAPIT"
                value={nameSearch}
                onChange={(e) => setNameSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Searches sender/receiver first and last name in bookings (e.g. &quot;SARAH
            TAPIT&quot; also matches &quot;Sarah Camille Tapit&quot;). Click a name to open booking
            details in a popup, then download the PDF.
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
          <CardTitle className="flex items-center justify-between gap-3">
            <span>{searchMode === 'names' ? 'Matching names' : 'Results'}</span>
            {hasSearched && !searching && (
              <span className="text-sm font-normal text-muted-foreground flex items-center gap-2">
                {searchMode === 'names' ? nameHits.length : awbResults.length} found
                {loadingMore ? (
                  <span className="inline-flex items-center gap-1 text-primary">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading more…
                  </span>
                ) : null}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {searching ? (
            <p className="text-muted-foreground py-8 text-center">Searching…</p>
          ) : !hasSearched ? (
            <p className="text-muted-foreground py-8 text-center">
              Enter AWB or name and click Search.
            </p>
          ) : searchMode === 'names' ? (
            nameHits.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center">No similar names found.</p>
            ) : (
              <div className="space-y-2">
                {nameHits.map((hit) => {
                  const active = selectedSummary?._id === hit._id;
                  const loading = loadingSummaryId === hit._id;
                  return (
                    <button
                      key={hit._id}
                      type="button"
                      onClick={() => handleSelectName(hit)}
                      disabled={!!loadingSummaryId}
                      className={`w-full text-left rounded-md border px-4 py-3 transition hover:bg-muted/50 flex items-center justify-between gap-3 ${
                        active ? 'border-primary bg-primary/5' : 'border-border'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0">
                          <span className="font-medium truncate block">{hit.display_name}</span>
                          {hit.sender_name && hit.receiver_name ? (
                            <span className="text-xs text-muted-foreground truncate block">
                              Sender: {hit.sender_name} · Receiver: {hit.receiver_name}
                            </span>
                          ) : hit.match_side ? (
                            <span className="text-xs text-muted-foreground capitalize">
                              ({hit.match_side})
                            </span>
                          ) : null}
                        </span>
                      </span>
                      {loading ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : null}
                    </button>
                  );
                })}
                {searchMeta?.hasMore && nextCursor ? (
                  <div className="pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={loadingMore}
                      onClick={handleLoadMore}
                    >
                      {loadingMore ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Loading…
                        </>
                      ) : (
                        'Load next 25'
                      )}
                    </Button>
                  </div>
                ) : null}
              </div>
            )
          ) : awbResults.length === 0 ? (
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
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {awbResults.map((row) => (
                    <TableRow key={row._id}>
                      <TableCell className="font-mono text-sm">{row.awb || '—'}</TableCell>
                      <TableCell>{row.sender_name || '—'}</TableCell>
                      <TableCell>{row.receiver_name || '—'}</TableCell>
                      <TableCell>{row.service || '—'}</TableCell>
                      <TableCell>
                        <Badge variant={formatReviewStatus(row.review_status).variant}>
                          {formatReviewStatus(row.review_status).label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(row.createdAt) || '—'}
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
              {searchMeta?.hasMore && nextCursor ? (
                <div className="p-3 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={loadingMore}
                    onClick={handleLoadMore}
                  >
                    {loadingMore ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Loading…
                      </>
                    ) : (
                      'Load next 25'
                    )}
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedSummary} onOpenChange={closeSelectedBooking}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Selected booking</DialogTitle>
            <DialogDescription>
              Review the booking details, then download the PDF if needed.
            </DialogDescription>
          </DialogHeader>

          {selectedSummary ? (
            <div className="space-y-4 py-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">AWB</p>
                  <p className="font-mono text-base font-semibold break-all">
                    {selectedSummary.awb || 'Not available'}
                  </p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                    Service
                  </p>
                  <p className="text-base font-semibold">{selectedSummary.service || 'Not available'}</p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                    Sender
                  </p>
                  <p className="text-base font-semibold">{selectedSummary.sender_name || 'Not available'}</p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                    Receiver
                  </p>
                  <p className="text-base font-semibold">
                    {selectedSummary.receiver_name || 'Not available'}
                  </p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                    Status
                  </p>
                  <Badge variant={formatReviewStatus(selectedSummary.review_status).variant}>
                    {formatReviewStatus(selectedSummary.review_status).label}
                  </Badge>
                </div>
                <div className="rounded-md border bg-muted/30 p-3 sm:col-span-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                    Created on
                  </p>
                  <p className="text-base font-semibold">
                    {formatDate(selectedSummary.createdAt) || 'Date not available'}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setSelectedSummary(null)}>
              Close
            </Button>
            {selectedSummary ? (
              <Button
                type="button"
                disabled={downloadingId === selectedSummary._id}
                onClick={() => handleDownloadPdf(selectedSummary)}
              >
                {downloadingId === selectedSummary._id ? (
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
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
