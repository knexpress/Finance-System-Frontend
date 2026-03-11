'use client';

import { SidebarTrigger } from '@/components/ui/sidebar';
import { usePathname } from 'next/navigation';
import { getNavigationLinks } from '@/lib/navigation';
import { useAuth } from '@/hooks/use-auth';

export default function AppHeader() {
  const pathname = usePathname();
  const { department } = useAuth();
  const navLinks = getNavigationLinks(department);
  const currentLink = navLinks.find(link => link.href === pathname);
  const pageTitle = currentLink ? currentLink.label : 'Dashboard';

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b border-border/50 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/80 px-4 sm:px-6 industrial-shadow-md">
      <SidebarTrigger className="transition-industrial hover:bg-accent/10 rounded-md p-2" />
      <div className="flex items-center justify-between w-full min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-2 w-2 rounded-full bg-primary shadow-lg shadow-primary/50 animate-pulse" />
          <div className="h-6 w-px bg-border/50" />
          <h1 className="text-lg font-bold tracking-tight text-foreground truncate">{pageTitle}</h1>
        </div>
      </div>
    </header>
  );
}
