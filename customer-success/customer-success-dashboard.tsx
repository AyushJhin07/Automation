/**
 * CUSTOMER SUCCESS: Enterprise Customer Success Dashboard
 * 
 * Real-time dashboard for customer success teams to monitor
 * customer health, support metrics, and success indicators.
 */

import React, { useState, useEffect } from 'react';
import { 
  CustomerHealthScore, 
  SupportTicket, 
  SuccessMetrics,
  CustomerSupportService,
  CustomerHealthService,
  SupportAnalyticsService 
} from './support-infrastructure';

interface DashboardMetrics {
  supportMetrics: {
    totalTickets: number;
    resolvedTickets: number;
    avgResolutionTime: number;
    customerSatisfaction: number;
    ticketsByPriority: Record<string, number>;
  };
  customerHealth: {
    totalCustomers: number;
    healthyCustomers: number;
    atRiskCustomers: number;
    averageHealthScore: number;
  };
  businessMetrics: {
    timeToValue: number;
    featureAdoption: number;
    renewalRate: number;
    expansionRevenue: number;
  };
}

export const CustomerSuccessDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [atRiskCustomers, setAtRiskCustomers] = useState<CustomerHealthScore[]>([]);
  const [recentTickets, setRecentTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<'24h' | '7d' | '30d' | '90d'>('30d');

  useEffect(() => {
    loadDashboardData();
    
    // Refresh data every 5 minutes
    const interval = setInterval(loadDashboardData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [timeframe]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Load support metrics
      const supportMetrics = SupportAnalyticsService.getSupportMetrics(timeframe);
      
      // Load customer success metrics
      const customerSuccessMetrics = SupportAnalyticsService.getCustomerSuccessMetrics();
      
      // Load at-risk customers
      const atRisk = CustomerHealthService.getAtRiskCustomers();
      
      setMetrics({
        supportMetrics: {
          totalTickets: supportMetrics.totalTickets,
          resolvedTickets: supportMetrics.resolvedTickets,
          avgResolutionTime: supportMetrics.avgResolutionTime,
          customerSatisfaction: supportMetrics.customerSatisfaction,
          ticketsByPriority: supportMetrics.ticketsByPriority
        },
        customerHealth: {
          totalCustomers: customerSuccessMetrics.totalCustomers,
          healthyCustomers: customerSuccessMetrics.healthyCustomers,
          atRiskCustomers: customerSuccessMetrics.atRiskCustomers,
          averageHealthScore: customerSuccessMetrics.averageHealthScore
        },
        businessMetrics: {
          timeToValue: customerSuccessMetrics.timeToValue,
          featureAdoption: customerSuccessMetrics.featureAdoption,
          renewalRate: customerSuccessMetrics.renewalRate,
          expansionRevenue: customerSuccessMetrics.expansionRevenue
        }
      });
      
      setAtRiskCustomers(atRisk);
      
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPriorityColor = (priority: string): string => {
    const colors = {
      critical: 'text-red-600 bg-red-100',
      high: 'text-orange-600 bg-orange-100',
      medium: 'text-yellow-600 bg-yellow-100',
      low: 'text-green-600 bg-green-100'
    };
    return colors[priority as keyof typeof colors] || 'text-gray-600 bg-gray-100';
  };

  const getHealthColor = (score: number): string => {
    if (score >= 80) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading customer success dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Customer Success Dashboard</h1>
              <p className="text-gray-600">Monitor customer health, support metrics, and business outcomes</p>
            </div>
            
            <div className="flex items-center space-x-4">
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value as any)}
                className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="24h">Last 24 Hours</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="90d">Last 90 Days</option>
              </select>
              
              <button
                onClick={loadDashboardData}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Key Metrics Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          
          {/* Customer Health */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Healthy Customers</dt>
                  <dd className="flex items-baseline">
                    <div className="text-2xl font-semibold text-gray-900">
                      {metrics?.customerHealth.healthyCustomers}
                    </div>
                    <div className="ml-2 text-sm text-gray-500">
                      of {metrics?.customerHealth.totalCustomers}
                    </div>
                  </dd>
                </dl>
              </div>
            </div>
          </div>

          {/* Average Health Score */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Avg Health Score</dt>
                  <dd className="flex items-baseline">
                    <div className={`text-2xl font-semibold ${getHealthColor(metrics?.customerHealth.averageHealthScore || 0)}`}>
                      {metrics?.customerHealth.averageHealthScore}
                    </div>
                    <div className="ml-2 text-sm text-gray-500">/100</div>
                  </dd>
                </dl>
              </div>
            </div>
          </div>

          {/* Support Resolution */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Avg Resolution Time</dt>
                  <dd className="flex items-baseline">
                    <div className="text-2xl font-semibold text-gray-900">
                      {metrics?.supportMetrics.avgResolutionTime}h
                    </div>
                    <div className="ml-2 text-sm text-green-600">
                      ↓ 12%
                    </div>
                  </dd>
                </dl>
              </div>
            </div>
          </div>

          {/* Customer Satisfaction */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Customer Satisfaction</dt>
                  <dd className="flex items-baseline">
                    <div className="text-2xl font-semibold text-gray-900">
                      {metrics?.supportMetrics.customerSatisfaction}
                    </div>
                    <div className="ml-2 text-sm text-gray-500">/5.0</div>
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          
          {/* At-Risk Customers */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">At-Risk Customers</h3>
              <p className="text-sm text-gray-500">Customers requiring immediate attention</p>
            </div>
            <div className="p-6">
              {atRiskCustomers.length === 0 ? (
                <div className="text-center py-8">
                  <svg className="w-12 h-12 text-green-400 mx-auto mb-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <p className="text-gray-500">No customers at risk! 🎉</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {atRiskCustomers.map((customer) => (
                    <div key={customer.customerId} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-medium text-gray-900">{customer.customerId}</h4>
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          customer.riskLevel === 'critical' ? 'bg-red-100 text-red-800' :
                          customer.riskLevel === 'high' ? 'bg-orange-100 text-orange-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {customer.riskLevel.toUpperCase()} RISK
                        </span>
                      </div>
                      
                      <div className="flex items-center mb-2">
                        <span className="text-sm text-gray-500 mr-2">Health Score:</span>
                        <span className={`font-medium ${getHealthColor(customer.overallScore)}`}>
                          {customer.overallScore}/100
                        </span>
                      </div>
                      
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-gray-700">Risk Factors:</p>
                        <ul className="text-sm text-gray-600 space-y-1">
                          {customer.riskFactors.map((factor, index) => (
                            <li key={index} className="flex items-center">
                              <span className="w-1 h-1 bg-gray-400 rounded-full mr-2"></span>
                              {factor}
                            </li>
                          ))}
                        </ul>
                      </div>
                      
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <p className="text-sm font-medium text-gray-700 mb-1">Recommendations:</p>
                        <ul className="text-sm text-gray-600 space-y-1">
                          {customer.recommendations.map((rec, index) => (
                            <li key={index} className="flex items-center">
                              <span className="w-1 h-1 bg-blue-400 rounded-full mr-2"></span>
                              {rec}
                            </li>
                          ))}
                        </ul>
                      </div>
                      
                      <div className="mt-4 flex space-x-3">
                        <button className="bg-blue-600 text-white px-3 py-1 text-sm rounded hover:bg-blue-700">
                          Contact Customer
                        </button>
                        <button className="bg-gray-200 text-gray-800 px-3 py-1 text-sm rounded hover:bg-gray-300">
                          View Details
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Support Tickets by Priority */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Support Tickets by Priority</h3>
              <p className="text-sm text-gray-500">Current ticket distribution</p>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {Object.entries(metrics?.supportMetrics.ticketsByPriority || {}).map(([priority, count]) => (
                  <div key={priority} className="flex items-center justify-between">
                    <div className="flex items-center">
                      <span className={`px-2 py-1 text-xs rounded-full ${getPriorityColor(priority)}`}>
                        {priority.toUpperCase()}
                      </span>
                      <span className="ml-3 text-sm text-gray-700 capitalize">{priority} Priority</span>
                    </div>
                    <div className="flex items-center">
                      <span className="text-lg font-semibold text-gray-900 mr-3">{count}</span>
                      <div className="w-24 bg-gray-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${
                            priority === 'critical' ? 'bg-red-500' :
                            priority === 'high' ? 'bg-orange-500' :
                            priority === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
                          }`}
                          style={{
                            width: `${(count / (metrics?.supportMetrics.totalTickets || 1)) * 100}%`
                          }}
                        ></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Business Metrics */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Business Success Metrics</h3>
            <p className="text-sm text-gray-500">Key performance indicators for customer success</p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600 mb-1">
                  {metrics?.businessMetrics.timeToValue}
                </div>
                <div className="text-sm text-gray-500">Days to Value</div>
                <div className="text-xs text-green-600 mt-1">↓ 23% vs last period</div>
              </div>
              
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600 mb-1">
                  {metrics?.businessMetrics.featureAdoption}%
                </div>
                <div className="text-sm text-gray-500">Feature Adoption</div>
                <div className="text-xs text-green-600 mt-1">↑ 15% vs last period</div>
              </div>
              
              <div className="text-center">
                <div className="text-3xl font-bold text-purple-600 mb-1">
                  {metrics?.businessMetrics.renewalRate}%
                </div>
                <div className="text-sm text-gray-500">Renewal Rate</div>
                <div className="text-xs text-green-600 mt-1">↑ 8% vs last period</div>
              </div>
              
              <div className="text-center">
                <div className="text-3xl font-bold text-orange-600 mb-1">
                  {formatCurrency(metrics?.businessMetrics.expansionRevenue || 0)}
                </div>
                <div className="text-sm text-gray-500">Expansion Revenue</div>
                <div className="text-xs text-green-600 mt-1">↑ 42% vs last period</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerSuccessDashboard;