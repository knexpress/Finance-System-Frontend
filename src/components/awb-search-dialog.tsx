'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { Search, Loader2, Hash, Copy, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

export default function AwbSearchDialog() {
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<string[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const { toast } = useToast();

  const handleSearch = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Please enter both first name and last name',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    setResults([]);

    try {
      const response = await apiClient.searchAwbByName(
        firstName.trim(),
        lastName.trim()
      );

      if (response.success && response.data) {
        // Handle both single AWB string and array of AWBs
        const responseData = response.data as any;
        const awbNumbers = Array.isArray(responseData)
          ? responseData
          : responseData.awbNumbers
          ? responseData.awbNumbers
          : responseData.awb_number
          ? [responseData.awb_number]
          : responseData.tracking_code
          ? [responseData.tracking_code]
          : [];

        if (awbNumbers.length > 0) {
          setResults(awbNumbers);
          toast({
            title: 'Search Successful',
            description: `Found ${awbNumbers.length} AWB number(s)`,
          });
        } else {
          setResults([]);
          toast({
            title: 'No Results',
            description: 'No AWB numbers found for this name',
            variant: 'default',
          });
        }
      } else {
        setResults([]);
        toast({
          title: 'Search Failed',
          description: response.error || 'Unable to search for AWB numbers',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('Error searching AWB:', error);
      setResults([]);
      toast({
        title: 'Error',
        description: error?.message || 'An error occurred while searching',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (awb: string, index: number) => {
    try {
      await navigator.clipboard.writeText(awb);
      setCopiedIndex(index);
      toast({
        title: 'Copied!',
        description: 'AWB number copied to clipboard',
      });
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (error) {
      toast({
        title: 'Copy Failed',
        description: 'Unable to copy to clipboard',
        variant: 'destructive',
      });
    }
  };

  const handleReset = () => {
    setFirstName('');
    setLastName('');
    setResults([]);
    setCopiedIndex(null);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Search className="h-4 w-4" />
          Search AWB by Name
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Search AWB Number by Customer Name</DialogTitle>
          <DialogDescription>
            Enter the customer's first name and last name to find their AWB number(s)
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">First Name</Label>
            <Input
              id="firstName"
              placeholder="Enter first name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !loading) {
                  handleSearch();
                }
              }}
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Last Name</Label>
            <Input
              id="lastName"
              placeholder="Enter last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !loading) {
                  handleSearch();
                }
              }}
              disabled={loading}
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleSearch}
              disabled={loading || !firstName.trim() || !lastName.trim()}
              className="flex-1"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Search
                </>
              )}
            </Button>
            {(firstName || lastName || results.length > 0) && (
              <Button
                onClick={handleReset}
                variant="outline"
                disabled={loading}
              >
                Reset
              </Button>
            )}
          </div>

          {results.length > 0 && (
            <div className="space-y-2 mt-4">
              <Label className="text-sm font-semibold">
                Found {results.length} AWB Number{results.length > 1 ? 's' : ''}:
              </Label>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {results.map((awb, index) => (
                  <Card key={index} className="p-3">
                    <CardContent className="p-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <Hash className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <Badge
                            variant="outline"
                            className="font-mono text-sm flex-1 truncate"
                          >
                            {awb}
                          </Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopy(awb, index)}
                          className="h-8 w-8 p-0 flex-shrink-0"
                        >
                          {copiedIndex === index ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {!loading && results.length === 0 && firstName && lastName && (
            <div className="text-center py-4 text-sm text-muted-foreground">
              No AWB numbers found. Try a different name or check the spelling.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

