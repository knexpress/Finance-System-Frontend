'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  DollarSign, 
  Users, 
  Target, 
  Star, 
  Package, 
  Clock, 
  Timer, 
  AlertTriangle,
  CreditCard,
  TrendingUp,
  FileText,
  PieChart,
  Heart,
  Calendar,
  UserPlus,
  GraduationCap,
  BarChart3,
  Gauge,
  Server,
  CheckCircle,
  Shield,
  Search,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { secureLog } from '@/lib/secure-logger';
import { getDepartmentPerformanceMetrics, calculateOverallScore, type PerformanceMetric } from '@/lib/performance-metrics';
import { calculateCompanyMetrics } from '@/lib/metrics-calculator';
import type { Department } from '@/lib/types';

interface PerformanceMetricsProps {
  department: Department;
}

const iconMap = {
  DollarSign,
  Users,
  Target,
  Star,
  Package,
  Clock,
  Timer,
  AlertTriangle,
  CreditCard,
  TrendingUp,
  FileText,
  PieChart,
  Heart,
  Calendar,
  UserPlus,
  GraduationCap,
  BarChart3,
  Gauge,
  Server,
  CheckCircle,
  Shield,
  Search,
  CheckCircle2,
  AlertCircle
};

export default function PerformanceMetrics({ department }: PerformanceMetricsProps) {
  const [metrics, setMetrics] = useState<PerformanceMetric[]>([]);
  const [overallScore, setOverallScore] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPerformanceData();
    
    // Auto-refresh every 30 seconds for Management department
    if (department === 'Management') {
      const interval = setInterval(() => {
        fetchPerformanceData();
      }, 30000); // 30 seconds
      
      return () => clearInterval(interval);
    }
  }, [department]);

  const fetchPerformanceData = async () => {
    try {
      setLoading(true);
      
      // For Management department, calculate metrics from actual data
      if (department === 'Management') {
        const companyMetrics = await calculateCompanyMetrics();
        const performanceMetrics = getDepartmentPerformanceMetrics(department, companyMetrics);
        setMetrics(performanceMetrics);
        setOverallScore(calculateOverallScore(performanceMetrics));
      } else {
        // For other departments (Sales, Operations, Finance, etc.), use API endpoint
        secureLog.debug('[Performance Metrics] Fetching metrics for department', { department });
        const response = await apiClient.getDepartmentPerformance(department);
        secureLog.debug('[Performance Metrics] API response', { department, success: response.success });

        if (response.success && response.data) {
          const performanceMetrics = getDepartmentPerformanceMetrics(department, response.data);
          setMetrics(performanceMetrics);
          setOverallScore(calculateOverallScore(performanceMetrics));
        } else {
          secureLog.warn('[Performance Metrics] API returned error', { department, error: response.error });
          // Set empty metrics if API fails
          setMetrics([]);
          setOverallScore(0);
        }
      }
    } catch (error) {
      secureLog.error('[Performance Metrics] Error fetching performance data', { department, error });
      // Set empty metrics on error
      setMetrics([]);
      setOverallScore(0);
    } finally {
      setLoading(false);
    }
  };

  const getTrendIcon = (trend: 'up' | 'down' | 'neutral') => {
    switch (trend) {
      case 'up':
        return '↗';
      case 'down':
        return '↘';
      default:
        return '→';
    }
  };

  const getTrendColor = (trend: 'up' | 'down' | 'neutral') => {
    switch (trend) {
      case 'up':
        return 'text-green-600';
      case 'down':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  const getColorClasses = (color: string) => {
    switch (color) {
      case 'success':
        return 'border-green-200 bg-green-50';
      case 'warning':
        return 'border-yellow-200 bg-yellow-50';
      case 'destructive':
        return 'border-red-200 bg-red-50';
      case 'primary':
        return 'border-blue-200 bg-blue-50';
      case 'secondary':
        return 'border-gray-200 bg-gray-50';
      default:
        return 'border-gray-200 bg-white';
    }
  };

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-2">
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-gray-200 rounded w-1/2 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-full"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overall Performance Score */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Overall Performance Score</span>
            <Badge variant="outline" className="text-lg px-3 py-1">
              {overallScore}%
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-gradient-to-r from-blue-500 to-indigo-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${overallScore}%` }}
            ></div>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Based on key performance indicators for {department} department
          </p>
        </CardContent>
      </Card>

      {/* Performance Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => {
          const IconComponent = iconMap[metric.icon as keyof typeof iconMap] || Target;
          
          return (
            <Card key={metric.id} className={`${getColorClasses(metric.color)} transition-all duration-200 hover:shadow-md`}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-700">
                  {metric.title}
                </CardTitle>
                <IconComponent className="h-4 w-4 text-gray-600" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center space-x-2">
                  <div className="text-2xl font-bold text-gray-900">
                    {metric.value.toLocaleString()}
                    {metric.unit && <span className="text-sm font-normal text-gray-600 ml-1">{metric.unit}</span>}
                  </div>
                  {metric.trend && metric.trendPercentage && (
                    <div className={`flex items-center text-xs ${getTrendColor(metric.trend)}`}>
                      <span className="mr-1">{getTrendIcon(metric.trend)}</span>
                      <span>{Math.abs(metric.trendPercentage).toFixed(1)}%</span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  {metric.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
