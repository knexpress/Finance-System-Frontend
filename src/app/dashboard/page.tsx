'use client';

import { useAuth } from '@/hooks/use-auth';
import { getNavigationLinks } from '@/lib/navigation';
import PerformanceMetrics from '@/components/performance-metrics';
import DashboardWeather from '@/components/dashboard-weather';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export default function Dashboard() {
  const { userProfile, department } = useAuth();

  const quickLinks = getNavigationLinks(department).filter(link => link.href !== '/dashboard');


  if (!userProfile || !department) {
    return null;
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Welcome Section with Gradient */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary/10 via-primary/5 to-background p-8 border border-primary/20">
        <div className="relative z-10">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">
                Welcome back, <span className="text-gradient">{userProfile?.full_name?.split(' ')[0] || 'User'}</span>!
              </h1>
              <p className="text-base text-muted-foreground">
                {department.name === 'Management' 
                  ? 'Company-wide performance overview and strategic insights.'
                  : `Performance overview for the ${department.name} department.`
                }
              </p>
              <div className="mt-4 max-w-2xl">
                <DashboardWeather variant="large" />
              </div>
            </div>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      </div>

      {/* Performance Metrics - Hidden for Operations, Sales, and Finance */}
      {department.name !== 'Operations' && department.name !== 'Sales' && department.name !== 'Finance' && (
        <PerformanceMetrics department={department.name as any} />
      )}

      {/* Quick Access */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">Quick Access</h2>
            <p className="text-sm text-muted-foreground mt-1">Navigate to key features and tools</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {quickLinks.map(link => (
            <Link key={link.href} href={link.href} className="block">
              <Card className="hover-lift border-border/50 transition-industrial group cursor-pointer overflow-hidden relative shine-effect">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <CardHeader className="flex flex-row items-center space-y-0 pb-4 pt-5 relative z-10">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 group-hover:from-primary/30 group-hover:to-primary/20 transition-all shadow-sm">
                    <link.icon className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="text-sm font-bold ml-3 group-hover:text-primary transition-colors">
                    {link.label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 pb-5 relative z-10">
                  <p className="text-xs text-muted-foreground group-hover:text-foreground/70 transition-colors">
                    Access {link.label.toLowerCase()} tools
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
