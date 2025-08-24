// Common type definitions for the entire application

export interface AppError extends Error {
  message: string;
  code?: string;
  statusCode?: number;
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ValidationError {
  path: string;
  message: string;
  severity: 'error' | 'warn' | 'info';
  code?: string;
  details?: any;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings?: ValidationError[];
  securityWarnings?: ValidationError[];
}

export interface ClarifyResponse {
  action: 'ask_questions' | 'proceed_to_planning';
  questions?: string[];
  reasoning?: string;
  needsMoreInfo?: boolean; // Added for compatibility
}

export interface NodeCatalog {
  nodes: NodeDefinition[];
  categories: string[];
  totalCount: number;
}

export interface NodeDefinition {
  id: string;
  name: string;
  type: string;
  category: string;
  description: string;
  parameters: Record<string, any>;
  requiredScopes?: string[];
}

export interface LLMTools {
  getNodeCatalog: () => NodeCatalog;
  validateGraph: (graph: any) => ValidationResult;
  searchApps: (query: string) => any[];
  getAppFunctions: (appName: string) => any[];
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  plan: string;
  iat?: number;
  exp?: number;
}

export interface HealthCheck {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  timestamp: string;
  duration?: number;
  metadata?: Record<string, any>;
}

export interface BillingPeriod {
  startDate: Date;
  endDate: Date;
  year: number;
  month: number;
}

export interface Alert {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  resolved: boolean;
  metadata?: Record<string, any>;
}

// Utility type for making error handling consistent
export const createError = (message: string, code?: string, statusCode?: number): AppError => {
  const error = new Error(message) as AppError;
  error.code = code;
  error.statusCode = statusCode;
  return error;
};

// Helper function to safely extract error message
export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unknown error occurred';
};

// Helper function to safely extract error for API responses
export const formatError = (error: unknown): { message: string; code?: string } => {
  if (error instanceof Error) {
    return {
      message: getErrorMessage(error),
      code: (error as AppError).code
    };
  }
  if (typeof error === 'string') {
    return { message: error };
  }
  return { message: 'An unknown error occurred' };
};