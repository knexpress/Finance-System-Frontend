'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Save, RefreshCw, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface WeightBracket {
  min: number;
  max: number | null; // null means infinity
  rate: number;
  label: string;
  _id?: string; // For backend tracking
}

type RouteType = 'PH_TO_UAE' | 'UAE_TO_PH';

export default function PriceBracketsPage() {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<RouteType>('PH_TO_UAE');
  
  const [phToUaeBrackets, setPhToUaeBrackets] = useState<WeightBracket[]>([]);
  const [uaeToPhBrackets, setUaeToPhBrackets] = useState<WeightBracket[]>([]);
  
  const [originalPhToUaeBrackets, setOriginalPhToUaeBrackets] = useState<WeightBracket[]>([]);
  const [originalUaeToPhBrackets, setOriginalUaeToPhBrackets] = useState<WeightBracket[]>([]);

  // Check if user has permission (Finance department only)
  if (userProfile?.department?.name !== 'Finance') {
    return (
      <div className="flex items-center justify-center h-64">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            Only Finance department members can access price bracket management.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Fetch brackets from backend
  const fetchBrackets = async () => {
    try {
      setLoading(true);
      const [phResult, uaeResult] = await Promise.all([
        apiClient.getPriceBrackets('PH_TO_UAE'),
        apiClient.getPriceBrackets('UAE_TO_PH')
      ]);

      if (phResult.success && phResult.data) {
        const data = phResult.data as any;
        const brackets = Array.isArray(data) ? data : (data?.brackets || []);
        setPhToUaeBrackets(brackets);
        setOriginalPhToUaeBrackets(JSON.parse(JSON.stringify(brackets)));
      } else {
        // Fallback to default brackets if API fails
        const defaultBrackets: WeightBracket[] = [
          { min: 1, max: 15, rate: 39, label: '1-15 KG' },
          { min: 16, max: 29, rate: 38, label: '16-29 KG' },
          { min: 30, max: 69, rate: 36, label: '30-69 KG' },
          { min: 70, max: 199, rate: 34, label: '70-199 KG' },
          { min: 200, max: 299, rate: 31, label: '200-299 KG' },
          { min: 300, max: null, rate: 30, label: '300+ KG' },
          { min: 0, max: null, rate: 29, label: 'SPECIAL RATE' },
        ];
        setPhToUaeBrackets(defaultBrackets);
        setOriginalPhToUaeBrackets(JSON.parse(JSON.stringify(defaultBrackets)));
      }

      if (uaeResult.success && uaeResult.data) {
        const data = uaeResult.data as any;
        const brackets = Array.isArray(data) ? data : (data?.brackets || []);
        setUaeToPhBrackets(brackets);
        setOriginalUaeToPhBrackets(JSON.parse(JSON.stringify(brackets)));
      } else {
        // Fallback to default brackets if API fails
        const defaultBrackets: WeightBracket[] = [
          { min: 1, max: 15, rate: 39, label: '1-15 KG' },
          { min: 16, max: 29, rate: 38, label: '16-29 KG' },
          { min: 30, max: 69, rate: 36, label: '30-69 KG' },
          { min: 70, max: 99, rate: 34, label: '70-99 KG' },
          { min: 100, max: 199, rate: 31, label: '100-199 KG' },
          { min: 200, max: null, rate: 30, label: '200+ KG' },
          { min: 0, max: null, rate: 29, label: 'SPECIAL RATE' },
          { min: 1000, max: null, rate: 28, label: '1 TON UP' },
        ];
        setUaeToPhBrackets(defaultBrackets);
        setOriginalUaeToPhBrackets(JSON.parse(JSON.stringify(defaultBrackets)));
      }
    } catch (error: any) {
      console.error('Error fetching brackets:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to fetch price brackets. Using default values.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBrackets();
  }, []);

  const currentBrackets = activeTab === 'PH_TO_UAE' ? phToUaeBrackets : uaeToPhBrackets;
  const setCurrentBrackets = activeTab === 'PH_TO_UAE' ? setPhToUaeBrackets : setUaeToPhBrackets;

  const updateBracket = (index: number, field: keyof WeightBracket, value: any) => {
    const updated = [...currentBrackets];
    if (field === 'max' && value === '') {
      updated[index] = { ...updated[index], max: null };
    } else if (field === 'max' && value !== null) {
      updated[index] = { ...updated[index], max: parseFloat(value) || null };
    } else if (field === 'min' || field === 'rate') {
      updated[index] = { ...updated[index], [field]: parseFloat(value) || 0 };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    
    // Auto-generate label if min/max changes
    if (field === 'min' || field === 'max') {
      const bracket = updated[index];
      if (bracket.max === null) {
        updated[index].label = bracket.min === 0 ? 'SPECIAL RATE' : `${bracket.min}+ KG`;
      } else {
        updated[index].label = `${bracket.min}-${bracket.max} KG`;
      }
    }
    
    setCurrentBrackets(updated);
  };

  const addBracket = () => {
    const newBracket: WeightBracket = {
      min: 0,
      max: null,
      rate: 0,
      label: 'NEW BRACKET',
    };
    setCurrentBrackets([...currentBrackets, newBracket]);
  };

  const removeBracket = (index: number) => {
    if (currentBrackets.length <= 1) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'At least one bracket is required.',
      });
      return;
    }
    const updated = currentBrackets.filter((_, i) => i !== index);
    setCurrentBrackets(updated);
  };

  const saveBrackets = async () => {
    try {
      setSaving(true);
      const bracketsToSave = activeTab === 'PH_TO_UAE' ? phToUaeBrackets : uaeToPhBrackets;
      
      // Validate brackets
      for (const bracket of bracketsToSave) {
        if (bracket.min < 0) {
          toast({
            variant: 'destructive',
            title: 'Validation Error',
            description: 'Minimum weight cannot be negative.',
          });
          return;
        }
        if (bracket.max !== null && bracket.max <= bracket.min) {
          toast({
            variant: 'destructive',
            title: 'Validation Error',
            description: 'Maximum weight must be greater than minimum weight.',
          });
          return;
        }
        if (bracket.rate < 0) {
          toast({
            variant: 'destructive',
            title: 'Validation Error',
            description: 'Rate cannot be negative.',
          });
          return;
        }
      }

      const result = await apiClient.updatePriceBrackets(activeTab, bracketsToSave);
      
      if (result.success) {
        // Update original brackets to match saved ones
        if (activeTab === 'PH_TO_UAE') {
          setOriginalPhToUaeBrackets(JSON.parse(JSON.stringify(phToUaeBrackets)));
        } else {
          setOriginalUaeToPhBrackets(JSON.parse(JSON.stringify(uaeToPhBrackets)));
        }
        
        // Invalidate cache to ensure real-time updates
        apiClient.invalidateCache('/price-brackets');
        
        toast({
          title: 'Success',
          description: `Price brackets for ${activeTab === 'PH_TO_UAE' ? 'PH TO UAE' : 'UAE TO PH'} have been updated successfully. Changes will take effect immediately.`,
        });
      } else {
        throw new Error(result.error || 'Failed to save brackets');
      }
    } catch (error: any) {
      console.error('Error saving brackets:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to save price brackets.',
      });
    } finally {
      setSaving(false);
    }
  };

  const resetBrackets = () => {
    if (activeTab === 'PH_TO_UAE') {
      setPhToUaeBrackets(JSON.parse(JSON.stringify(originalPhToUaeBrackets)));
    } else {
      setUaeToPhBrackets(JSON.parse(JSON.stringify(originalUaeToPhBrackets)));
    }
    toast({
      title: 'Reset',
      description: 'Brackets have been reset to last saved values.',
    });
  };

  const hasChanges = () => {
    const current = activeTab === 'PH_TO_UAE' ? phToUaeBrackets : uaeToPhBrackets;
    const original = activeTab === 'PH_TO_UAE' ? originalPhToUaeBrackets : originalUaeToPhBrackets;
    return JSON.stringify(current) !== JSON.stringify(original);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading price brackets...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Price Bracket Management</h1>
          <p className="text-muted-foreground mt-2">
            Manage weight-based pricing brackets for different routes. Changes take effect immediately.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchBrackets} disabled={saving}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          {hasChanges() && (
            <Button variant="outline" onClick={resetBrackets} disabled={saving}>
              Reset
            </Button>
          )}
          <Button onClick={saveBrackets} disabled={saving || !hasChanges()}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Real-Time Updates</AlertTitle>
        <AlertDescription>
          Changes to price brackets will immediately affect rate calculations in the Operations verification form and invoice generation.
        </AlertDescription>
      </Alert>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as RouteType)}>
        <TabsList>
          <TabsTrigger value="PH_TO_UAE">PH TO UAE</TabsTrigger>
          <TabsTrigger value="UAE_TO_PH">UAE TO PH</TabsTrigger>
        </TabsList>

        <TabsContent value="PH_TO_UAE" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>PH TO UAE Price Brackets</CardTitle>
              <CardDescription>
                Define weight ranges and corresponding rates per kilogram for PH TO UAE shipments.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-end">
                  <Button onClick={addBracket} variant="outline" size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Bracket
                  </Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Label</TableHead>
                      <TableHead>Min Weight (KG)</TableHead>
                      <TableHead>Max Weight (KG)</TableHead>
                      <TableHead>Rate (AED/KG)</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentBrackets.map((bracket, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Input
                            value={bracket.label}
                            onChange={(e) => updateBracket(index, 'label', e.target.value)}
                            placeholder="Bracket label"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={bracket.min}
                            onChange={(e) => updateBracket(index, 'min', e.target.value)}
                            placeholder="Min weight"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={bracket.max === null ? '' : bracket.max}
                            onChange={(e) => updateBracket(index, 'max', e.target.value === '' ? null : e.target.value)}
                            placeholder="Max weight (leave empty for unlimited)"
                          />
                          {bracket.max === null && (
                            <Badge variant="secondary" className="ml-2">Unlimited</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={bracket.rate}
                            onChange={(e) => updateBracket(index, 'rate', e.target.value)}
                            placeholder="Rate per KG"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeBracket(index)}
                            disabled={currentBrackets.length <= 1}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="UAE_TO_PH" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>UAE TO PH Price Brackets</CardTitle>
              <CardDescription>
                Define weight ranges and corresponding rates per kilogram for UAE TO PH shipments.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-end">
                  <Button onClick={addBracket} variant="outline" size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Bracket
                  </Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Label</TableHead>
                      <TableHead>Min Weight (KG)</TableHead>
                      <TableHead>Max Weight (KG)</TableHead>
                      <TableHead>Rate (AED/KG)</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentBrackets.map((bracket, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Input
                            value={bracket.label}
                            onChange={(e) => updateBracket(index, 'label', e.target.value)}
                            placeholder="Bracket label"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={bracket.min}
                            onChange={(e) => updateBracket(index, 'min', e.target.value)}
                            placeholder="Min weight"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={bracket.max === null ? '' : bracket.max}
                            onChange={(e) => updateBracket(index, 'max', e.target.value === '' ? null : e.target.value)}
                            placeholder="Max weight (leave empty for unlimited)"
                          />
                          {bracket.max === null && (
                            <Badge variant="secondary" className="ml-2">Unlimited</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={bracket.rate}
                            onChange={(e) => updateBracket(index, 'rate', e.target.value)}
                            placeholder="Rate per KG"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeBracket(index)}
                            disabled={currentBrackets.length <= 1}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

