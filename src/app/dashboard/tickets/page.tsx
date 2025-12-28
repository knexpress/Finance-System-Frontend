'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useAuth } from "@/hooks/use-auth";
import { useNotifications } from '@/contexts/NotificationContext';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { secureLog } from '@/lib/secure-logger';

// Dynamically import InternalRequestSystem to reduce initial bundle size
const InternalRequestSystem = dynamic(() => import("@/components/internal-request-system"), {
    loading: () => <div className="flex items-center justify-center h-64"><div className="text-lg">Loading tickets...</div></div>,
    ssr: false
});

export default function InternalRequestsPage() {
    const { userProfile } = useAuth();
    const { clearCount } = useNotifications();
    const [tickets, setTickets] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    useEffect(() => {
        fetchTickets();
        // Clear tickets notification count when page is visited
        clearCount('tickets');
    }, []);

    const fetchTickets = async () => {
        try {
            secureLog.debug('Fetching internal requests');
            const result = await apiClient.getInternalRequests();
            
            if (result.success) {
                const data = result.data || [];
                secureLog.debug('Internal requests loaded', { count: Array.isArray(data) ? data.length : 0 });
                setTickets(Array.isArray(data) ? data : []);
            } else {
                secureLog.error('Failed to fetch internal requests', result.error);
                setTickets([]); // Set empty array on error
                toast({
                    variant: 'destructive',
                    title: 'Error',
                    description: 'Failed to fetch internal requests',
                });
            }
        } catch (error) {
            secureLog.error('Error fetching internal requests', error);
            setTickets([]); // Set empty array on error
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Failed to fetch internal requests',
            });
        } finally {
            setLoading(false);
        }
    };

    const handleTicketUpdate = () => {
        // Refresh tickets when a new one is created or updated
        fetchTickets();
    };

    if (!userProfile) return null;

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-lg">Loading tickets...</div>
            </div>
        );
    }
    
    return (
        <div>
            <InternalRequestSystem 
                requests={tickets} 
                currentUser={userProfile} 
                onTicketUpdate={handleTicketUpdate}
            />
        </div>
    );
}
