import { apiClient } from './api-client';

export interface CompanyMetrics {
  totalRevenue: number;
  totalShipments: number;
  customerSatisfaction: number;
  operationalEfficiency: number;
  employeeProductivity: number;
  profitMargin: number;
  marketShare: number;
  riskAssessment: number;
  // Trends
  revenueTrend: 'up' | 'down' | 'neutral';
  revenueTrendPercentage: number;
  shipmentsTrend: 'up' | 'down' | 'neutral';
  shipmentsTrendPercentage: number;
  satisfactionTrend: 'up' | 'down' | 'neutral';
  satisfactionTrendPercentage: number;
  efficiencyTrend: 'up' | 'down' | 'neutral';
  efficiencyTrendPercentage: number;
  productivityTrend: 'up' | 'down' | 'neutral';
  productivityTrendPercentage: number;
  marginTrend: 'up' | 'down' | 'neutral';
  marginTrendPercentage: number;
  marketTrend: 'up' | 'down' | 'neutral';
  marketTrendPercentage: number;
  riskTrend: 'up' | 'down' | 'neutral';
  riskTrendPercentage: number;
}

// Helper function to parse decimal values (handles Decimal128, numbers, strings)
const parseDecimal = (value: any): number => {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    return parseFloat(value) || 0;
  }
  if (value && typeof value === 'object') {
    if (value.toString && typeof value.toString === 'function') {
      return parseFloat(value.toString()) || 0;
    }
    if (value.$numberDecimal) {
      return parseFloat(value.$numberDecimal) || 0;
    }
  }
  return 0;
};

// Calculate trend based on current and previous values
const calculateTrend = (current: number, previous: number): { trend: 'up' | 'down' | 'neutral', percentage: number } => {
  if (previous === 0) {
    return current > 0 ? { trend: 'up', percentage: 100 } : { trend: 'neutral', percentage: 0 };
  }
  const percentage = ((current - previous) / previous) * 100;
  if (Math.abs(percentage) < 1) {
    return { trend: 'neutral', percentage: 0 };
  }
  return {
    trend: percentage > 0 ? 'up' : 'down',
    percentage: Math.abs(percentage)
  };
};

// Get date range for comparison (current month vs previous month)
const getDateRanges = () => {
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  
  return {
    current: { start: currentMonthStart, end: currentMonthEnd },
    previous: { start: previousMonthStart, end: previousMonthEnd }
  };
};

// Check if date is within range
const isDateInRange = (date: Date | string, range: { start: Date; end: Date }): boolean => {
  const checkDate = typeof date === 'string' ? new Date(date) : date;
  return checkDate >= range.start && checkDate <= range.end;
};

export async function calculateCompanyMetrics(): Promise<CompanyMetrics> {
  try {
    // Fetch all necessary data
    const [invoicesResult, requestsResult] = await Promise.all([
      apiClient.getAllInvoicesUnified(), // Fetch all invoices for metrics
      apiClient.getInvoiceRequests()
    ]);

    const invoices = invoicesResult?.success && invoicesResult?.data ? (Array.isArray(invoicesResult.data) ? invoicesResult.data : []) : [];
    const requests = requestsResult?.success && requestsResult?.data ? (Array.isArray(requestsResult.data) ? requestsResult.data : []) : [];

    const dateRanges = getDateRanges();

    // Calculate Total Revenue (all invoices, not just current month for total revenue)
    const currentRevenue = invoices.reduce((sum: number, invoice: any) => {
      const amount = parseDecimal(invoice.total_amount || invoice.amount || 0);
      return sum + amount;
    }, 0);
    
    // Current month revenue for trend calculation
    const currentMonthRevenue = invoices.reduce((sum: number, invoice: any) => {
      const amount = parseDecimal(invoice.total_amount || invoice.amount || 0);
      const invoiceDate = invoice.created_at || invoice.createdAt || invoice.date;
      if (invoiceDate && isDateInRange(invoiceDate, dateRanges.current)) {
        return sum + amount;
      }
      return sum;
    }, 0);

    const previousMonthRevenue = invoices.reduce((sum: number, invoice: any) => {
      const amount = parseDecimal(invoice.total_amount || invoice.amount || 0);
      const invoiceDate = invoice.created_at || invoice.createdAt || invoice.date;
      if (invoiceDate && isDateInRange(invoiceDate, dateRanges.previous)) {
        return sum + amount;
      }
      return sum;
    }, 0);

    // Calculate Total Shipments (all requests for total count)
    const currentShipments = requests.length;
    
    // Current month shipments for trend
    const currentMonthShipments = requests.filter((req: any) => {
      const reqDate = req.created_at || req.createdAt || req.date;
      return reqDate && isDateInRange(reqDate, dateRanges.current);
    }).length;

    const previousShipments = requests.filter((req: any) => {
      const reqDate = req.created_at || req.createdAt || req.date;
      return reqDate && isDateInRange(reqDate, dateRanges.previous);
    }).length;

    // Calculate Operational Efficiency (completed vs total requests)
    const completedRequests = requests.filter((req: any) => 
      req.status === 'COMPLETED' || req.status === 'VERIFIED' || req.status?.payment_status === 'PAID'
    ).length;
    const operationalEfficiency = requests.length > 0 ? (completedRequests / requests.length) * 100 : 0;

    // Calculate previous month efficiency
    const previousCompleted = requests.filter((req: any) => {
      const reqDate = req.created_at || req.createdAt || req.date;
      const inRange = reqDate && isDateInRange(reqDate, dateRanges.previous);
      return inRange && (req.status === 'COMPLETED' || req.status === 'VERIFIED' || req.status?.payment_status === 'PAID');
    }).length;
    const previousTotal = requests.filter((req: any) => {
      const reqDate = req.created_at || req.createdAt || req.date;
      return reqDate && isDateInRange(reqDate, dateRanges.previous);
    }).length;
    const previousEfficiency = previousTotal > 0 ? (previousCompleted / previousTotal) * 100 : 0;

    // Calculate Customer Satisfaction (based on completed/paid invoices ratio)
    const paidInvoices = invoices.filter((inv: any) => 
      inv.status === 'PAID' || inv.payment_status === 'PAID' || inv.status?.payment_status === 'PAID'
    ).length;
    let customerSatisfaction = invoices.length > 0 ? (paidInvoices / invoices.length) * 85 + 15 : 75; // Base 75% with boost from paid ratio
    customerSatisfaction = Math.min(100, Math.max(0, customerSatisfaction));

    // Previous month satisfaction
    const previousPaid = invoices.filter((inv: any) => {
      const invDate = inv.created_at || inv.createdAt || inv.date;
      return invDate && isDateInRange(invDate, dateRanges.previous) && 
             (inv.status === 'PAID' || inv.payment_status === 'PAID' || inv.status?.payment_status === 'PAID');
    }).length;
    const previousTotalInvoices = invoices.filter((inv: any) => {
      const invDate = inv.created_at || inv.createdAt || inv.date;
      return invDate && isDateInRange(invDate, dateRanges.previous);
    }).length;
    let previousSatisfaction = previousTotalInvoices > 0 ? (previousPaid / previousTotalInvoices) * 85 + 15 : 75;
    previousSatisfaction = Math.min(100, Math.max(0, previousSatisfaction));

    // Calculate Employee Productivity (based on requests per employee, simplified)
    const uniqueEmployees = new Set(requests.map((req: any) => 
      req.created_by_employee_id?._id || req.created_by || req.employee_id
    )).size;
    let employeeProductivity = uniqueEmployees > 0 ? Math.min(100, (requests.length / uniqueEmployees) * 10) : 80;
    employeeProductivity = Math.max(60, employeeProductivity); // Minimum 60%

    // Previous month productivity
    const previousUniqueEmployees = new Set(requests.filter((req: any) => {
      const reqDate = req.created_at || req.createdAt || req.date;
      return reqDate && isDateInRange(reqDate, dateRanges.previous);
    }).map((req: any) => req.created_by_employee_id?._id || req.created_by || req.employee_id)).size;
    let previousProductivity = previousUniqueEmployees > 0 ? 
      Math.min(100, (previousShipments / previousUniqueEmployees) * 10) : 80;
    previousProductivity = Math.max(60, previousProductivity);

    // Calculate Profit Margin (simplified: assume 25% margin on revenue)
    const totalCosts = currentRevenue * 0.75; // Assume 75% costs
    const profit = currentRevenue - totalCosts;
    let profitMargin = currentRevenue > 0 ? (profit / currentRevenue) * 100 : 25;
    profitMargin = Math.max(0, Math.min(100, profitMargin));

    const previousCosts = previousMonthRevenue * 0.75;
    const previousProfit = previousMonthRevenue - previousCosts;
    let previousMargin = previousMonthRevenue > 0 ? (previousProfit / previousMonthRevenue) * 100 : 25;
    previousMargin = Math.max(0, Math.min(100, previousMargin));

    // Calculate Market Share Growth (based on shipment growth)
    const marketShare = Math.min(100, (currentShipments / Math.max(1, previousShipments)) * 50);

    // Calculate Risk Assessment (based on overdue invoices and pending requests)
    const overdueInvoices = invoices.filter((inv: any) => 
      inv.status === 'OVERDUE' || inv.payment_status === 'OVERDUE' || 
      (inv.due_date && new Date(inv.due_date) < new Date() && inv.status !== 'PAID')
    ).length;
    const pendingRequests = requests.filter((req: any) => 
      req.status === 'PENDING' || req.status === 'SUBMITTED'
    ).length;
    const riskScore = Math.min(100, ((overdueInvoices + pendingRequests) / Math.max(1, invoices.length + requests.length)) * 100);
    let riskAssessment = Math.max(0, Math.min(100, riskScore));

    // Previous month risk
    const previousOverdue = invoices.filter((inv: any) => {
      const invDate = inv.created_at || inv.createdAt || inv.date;
      return invDate && isDateInRange(invDate, dateRanges.previous) &&
             (inv.status === 'OVERDUE' || inv.payment_status === 'OVERDUE');
    }).length;
    const previousPending = requests.filter((req: any) => {
      const reqDate = req.created_at || req.createdAt || req.date;
      return reqDate && isDateInRange(reqDate, dateRanges.previous) &&
             (req.status === 'PENDING' || req.status === 'SUBMITTED');
    }).length;
    let previousRisk = Math.min(100, ((previousOverdue + previousPending) / Math.max(1, previousTotalInvoices + previousTotal)) * 100);
    previousRisk = Math.max(0, Math.min(100, previousRisk));

    // Calculate trends (using monthly data for trends)
    const revenueTrend = calculateTrend(currentMonthRevenue, previousMonthRevenue);
    const shipmentsTrend = calculateTrend(currentMonthShipments, previousShipments);
    const satisfactionTrend = calculateTrend(customerSatisfaction, previousSatisfaction);
    const efficiencyTrend = calculateTrend(operationalEfficiency, previousEfficiency);
    const productivityTrend = calculateTrend(employeeProductivity, previousProductivity);
    const marginTrend = calculateTrend(profitMargin, previousMargin);
    const marketTrend = calculateTrend(currentShipments, previousShipments);
    const riskTrend = calculateTrend(previousRisk, riskAssessment); // Inverted: lower is better

    return {
      totalRevenue: Math.round(currentRevenue * 100) / 100,
      totalShipments: currentShipments, // Total count of all shipments
      customerSatisfaction: Math.round(customerSatisfaction * 10) / 10,
      operationalEfficiency: Math.round(operationalEfficiency * 10) / 10,
      employeeProductivity: Math.round(employeeProductivity * 10) / 10,
      profitMargin: Math.round(profitMargin * 10) / 10,
      marketShare: Math.round(marketShare * 10) / 10,
      riskAssessment: Math.round(riskAssessment * 10) / 10,
      revenueTrend: revenueTrend.trend,
      revenueTrendPercentage: Math.round(revenueTrend.percentage * 10) / 10,
      shipmentsTrend: shipmentsTrend.trend,
      shipmentsTrendPercentage: Math.round(shipmentsTrend.percentage * 10) / 10,
      satisfactionTrend: satisfactionTrend.trend,
      satisfactionTrendPercentage: Math.round(satisfactionTrend.percentage * 10) / 10,
      efficiencyTrend: efficiencyTrend.trend,
      efficiencyTrendPercentage: Math.round(efficiencyTrend.percentage * 10) / 10,
      productivityTrend: productivityTrend.trend,
      productivityTrendPercentage: Math.round(productivityTrend.percentage * 10) / 10,
      marginTrend: marginTrend.trend,
      marginTrendPercentage: Math.round(marginTrend.percentage * 10) / 10,
      marketTrend: marketTrend.trend,
      marketTrendPercentage: Math.round(marketTrend.percentage * 10) / 10,
      riskTrend: riskTrend.trend,
      riskTrendPercentage: Math.round(riskTrend.percentage * 10) / 10,
    };
  } catch (error) {
    console.error('Error calculating company metrics:', error);
    // Return default values on error
    return {
      totalRevenue: 0,
      totalShipments: 0,
      customerSatisfaction: 0,
      operationalEfficiency: 0,
      employeeProductivity: 0,
      profitMargin: 0,
      marketShare: 0,
      riskAssessment: 0,
      revenueTrend: 'neutral',
      revenueTrendPercentage: 0,
      shipmentsTrend: 'neutral',
      shipmentsTrendPercentage: 0,
      satisfactionTrend: 'neutral',
      satisfactionTrendPercentage: 0,
      efficiencyTrend: 'neutral',
      efficiencyTrendPercentage: 0,
      productivityTrend: 'neutral',
      productivityTrendPercentage: 0,
      marginTrend: 'neutral',
      marginTrendPercentage: 0,
      marketTrend: 'neutral',
      marketTrendPercentage: 0,
      riskTrend: 'neutral',
      riskTrendPercentage: 0,
    };
  }
}

