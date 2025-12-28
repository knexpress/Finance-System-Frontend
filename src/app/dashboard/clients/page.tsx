'use client';

import dynamic from 'next/dynamic';
import { apiClient } from "@/lib/api-client";
import { useState, useEffect } from "react";
import { Client } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { secureLog } from "@/lib/secure-logger";
import { Loader2, Users, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// Dynamically import ClientTable to reduce initial bundle size
const ClientTable = dynamic(() => import("@/components/client-table"), {
    loading: () => <div className="flex items-center justify-center h-64">Loading clients...</div>,
    ssr: false
});

export default function ClientsPage() {
    const [clients, setClients] = useState<Client[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();

    const loadClients = async () => {
            try {
                setLoading(true);
                setError(null);
                
                // Fetch clients from Finance database
                const result = await apiClient.getClients();
                
                if (result.success && result.data) {
                    // Map database fields to Client interface
                    const mappedClients: Client[] = Array.isArray(result.data) 
                        ? result.data.map((client: any) => ({
                            id: client._id || client.id || '',
                            name: client.company_name || client.name || client.companyName || 'N/A',
                            contactPerson: client.contact_name || client.contactPerson || client.contactName || 'N/A',
                            email: client.email || client.emailAddress || client.email_address || 'N/A',
                            phone: client.phone || client.phoneNumber || client.phone_number || client.contact_phone || 'N/A',
                            address: client.address || client.completeAddress || client.complete_address || client.address_line1 || 'N/A',
                        }))
                        : [];
                    
                    setClients(mappedClients);
                    
                    if (mappedClients.length === 0) {
                        toast({
                            title: "No Clients Found",
                            description: "No clients found in the database.",
                        });
                    }
                } else {
                    setError(result.error || 'Failed to fetch clients');
                    toast({
                        variant: 'destructive',
                        title: "Error",
                        description: result.error || 'Failed to load clients from database',
                    });
                }
            } catch (error: any) {
                secureLog.error('Error loading clients', error);
                const errorMessage = error.message || error.toString() || 'An error occurred while loading clients';
                setError(errorMessage);
                
                toast({
                    variant: 'destructive',
                    title: "Error Loading Clients",
                    description: errorMessage,
                });
            } finally {
                setLoading(false);
            }
        };

    useEffect(() => {
        loadClients();
    }, []); // Load clients on component mount

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Card className="p-8">
                    <CardContent className="flex flex-col items-center gap-4">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-sm text-muted-foreground">Loading clients from database...</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (error) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 text-destructive" />
                        Error Loading Clients
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-start gap-3 p-4 rounded-md bg-destructive/10 border border-destructive/20">
                        <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
                        <div className="flex-1">
                            <p className="text-sm font-medium text-destructive mb-1">Failed to fetch clients</p>
                            <p className="text-xs text-muted-foreground">{error}</p>
                        </div>
                    </div>
                    <Button 
                        onClick={loadClients} 
                        variant="outline" 
                        className="w-full"
                    >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Retry
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            <ClientTable clients={clients} onRefresh={loadClients} />
        </div>
    );
}
  