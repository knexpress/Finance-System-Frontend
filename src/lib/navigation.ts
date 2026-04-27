import {
  LayoutDashboard,
  Users,
  Package,
  FileText,
  UserCircle,
  BarChart,
  MessageSquare,
  Ticket,
  Landmark,
  FilePlus2,
  FileCheck2,
  type LucideIcon,
  Briefcase,
  FileSearch,
  CreditCard,
  Truck,
  ClipboardCheck,
  XCircle,
  DollarSign,
  History,
} from 'lucide-react';
import type { Department, DepartmentData } from './types';

interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
  departments: Department[];
}

const allLinks: NavLink[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    departments: ['Sales', 'Operations', 'Finance', 'HR', 'Management', 'IT', 'Auditor'],
  },
  {
    href: '/dashboard/clients',
    label: 'Clients',
    icon: Users,
    departments: ['Sales', 'Management', 'IT'],
  },
  {
    href: '/dashboard/invoice-requests',
    label: 'Invoice Requests',
    icon: Package,
    departments: ['Sales', 'Operations', 'Finance', 'IT'],
  },
  {
    href: '/dashboard/review-requests',
    label: 'Cargo Status',
    icon: FileCheck2,
    departments: ['Operations', 'Auditor', 'IT'],
  },
  {
    href: '/dashboard/requests',
    label: 'All Requests',
    icon: Package,
    departments: ['Management', 'Auditor', 'IT'],
  },
  {
    href: '/dashboard/invoices',
    label: 'Invoices',
    icon: FileText,
    departments: ['Finance', 'Management', 'Auditor', 'IT'],
  },
  {
    href: '/dashboard/cash-flow',
    label: 'Cash Flow',
    icon: Landmark,
    departments: ['Finance', 'Auditor', 'IT'],
  },
  {
    href: '/dashboard/price-brackets',
    label: 'Price Brackets',
    icon: DollarSign,
    departments: ['Finance', 'IT'],
  },
  {
    href: '/dashboard/delivery-assignments',
    label: 'Delivery Assignments',
    icon: Truck,
    departments: ['Finance', 'Management', 'IT'],
  },
  {
    href: '/dashboard/reports/audit',
    label: 'Audit Report',
    icon: FileSearch,
    departments: ['Finance', 'Auditor', 'IT'], // Removed 'Management' - managers should not see audit reports
  },
  {
    href: '/dashboard/users',
    label: 'User Management',
    icon: UserCircle,
    departments: ['IT'], // Only IT department (superadmin) can access
  },
  {
    href: '/dashboard/employees',
    label: 'Employee Management',
    icon: Users,
    departments: ['IT', 'Management'], // SuperAdmin and Manager (ADMIN) can access
  },
  {
    href: '/dashboard/booking-requests',
    label: 'Booking Requests',
    icon: ClipboardCheck,
    departments: ['Management', 'IT'],
  },
  {
    href: '/dashboard/logs',
    label: 'Logs',
    icon: History,
    departments: ['Management', 'IT'],
  },
  {
    href: '/dashboard/rejected-requests',
    label: 'Rejected Requests',
    icon: XCircle,
    departments: ['Sales', 'Operations', 'IT'],
  },
  {
    href: '/dashboard/chat',
    label: 'Chat',
    icon: MessageSquare,
    departments: ['Sales', 'Operations', 'Finance', 'HR', 'Management', 'IT', 'Auditor'],
  },
  {
    href: '/dashboard/tickets',
    label: 'Internal Requests',
    icon: Briefcase,
    departments: ['Sales', 'Operations', 'Finance', 'HR', 'Management', 'IT', 'Auditor'],
  },
];

export const getNavigationLinks = (department: DepartmentData | null) => {
  if (!department) return [];
  const departmentName = department.name as Department;
  
  // A bit of a hack to hide the old requests page for ops and show the new one
  if (departmentName === 'Operations') {
    return allLinks.filter((link) => link.href !== '/dashboard/requests' && link.departments.includes(departmentName));
  }
   if (departmentName === 'Sales') {
    return allLinks.filter((link) => link.href !== '/dashboard/requests' && link.departments.includes(departmentName));
  }
  return allLinks.filter((link) => link.departments.includes(departmentName));
};
